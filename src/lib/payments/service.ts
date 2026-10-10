import { prisma } from '../prisma';
import { PaymentGateway, OrderStatus, PaymentStatus, RefundStatus, WebhookStatus } from '@prisma/client';
import { PaymentGatewayProvider } from './types';
import { DevSandboxGatewayProvider } from './providers/dev-sandbox';
import { RazorpayGatewayProvider } from './providers/razorpay';
import { finalizeTicketInventory, releaseTicketReservation } from '../inventory';
import { generateTicketsForOrder, AttendeeInput } from '../tickets';

export class PaymentService {
  private static providers: Map<PaymentGateway, PaymentGatewayProvider> = new Map();

  static getProvider(gateway?: PaymentGateway): PaymentGatewayProvider {
    const targetGateway = gateway || PaymentGateway.RAZORPAY;

    if (!this.providers.has(targetGateway)) {
      switch (targetGateway) {
        case PaymentGateway.DEV_SANDBOX:
          this.providers.set(targetGateway, new DevSandboxGatewayProvider());
          break;
        case PaymentGateway.RAZORPAY:
        default:
          this.providers.set(PaymentGateway.RAZORPAY, new RazorpayGatewayProvider());
          break;
      }
    }

    return this.providers.get(targetGateway) || this.providers.get(PaymentGateway.RAZORPAY)!;
  }

  /**
   * Create gateway order and record payment attempt in database
   */
  static async createPaymentOrder(orderId: string, chosenGateway?: PaymentGateway) {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: { orderItems: true },
    });

    if (!order) {
      throw new Error(`Order ${orderId} not found`);
    }

    if (order.status === OrderStatus.PAYMENT_VERIFIED) {
      throw new Error('Order is already paid and verified');
    }

    const provider = this.getProvider(chosenGateway);

    const gatewayOrder = await provider.createGatewayOrder({
      orderId: order.id,
      orderNumber: order.orderNumber,
      amountInRupees: Number(order.totalAmount),
      currency: order.currency,
      customerPhone: order.customerPhone,
      customerEmail: order.customerEmail,
      customerName: order.customerName,
    });

    // Create or update Payment record
    const payment = await prisma.payment.create({
      data: {
        orderId: order.id,
        gateway: gatewayOrder.gateway,
        gatewayOrderId: gatewayOrder.gatewayOrderId,
        amount: order.totalAmount,
        currency: order.currency,
        status: PaymentStatus.PENDING,
      },
    });

    // Update order state
    await prisma.order.update({
      where: { id: order.id },
      data: { status: OrderStatus.PAYMENT_PENDING },
    });

    return {
      order,
      payment,
      gatewayOrder,
    };
  }

  /**
   * Verify Payment and Transition State Machine
   * Handles the critical failure recovery: payment succeeds on gateway, but booking fails -> auto refund!
   */
  static async verifyAndCompletePayment(params: {
    orderId: string;
    gatewayOrderId: string;
    gatewayPaymentId: string;
    gatewaySignature?: string;
    rawPayload?: any;
    attendees?: AttendeeInput[];
    simulateBookingFailure?: boolean; // For automated edge-case testing
  }) {
    const { orderId, gatewayOrderId, gatewayPaymentId, gatewaySignature, rawPayload, attendees, simulateBookingFailure } =
      params;

    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: {
        orderItems: true,
        payments: { orderBy: { createdAt: 'desc' }, take: 1 },
        coupon: true,
      },
    });

    if (!order) {
      throw new Error(`Order ${orderId} not found`);
    }

    // Idempotency: If already verified, return existing state
    if (order.status === OrderStatus.PAYMENT_VERIFIED) {
      const tickets = await prisma.ticket.findMany({ where: { orderId: order.id } });
      return {
        success: true,
        alreadyProcessed: true,
        status: OrderStatus.PAYMENT_VERIFIED,
        order,
        tickets,
      };
    }

    // Explicit state transition
    await prisma.order.update({
      where: { id: order.id },
      data: { status: OrderStatus.PAYMENT_VERIFICATION_PENDING },
    });

    const activePayment = order.payments[0];
    const provider = this.getProvider(activePayment?.gateway || PaymentGateway.RAZORPAY);

    // 1. Verify cryptographic signature or gateway callback
    const verification = await provider.verifyPayment({
      gatewayOrderId,
      gatewayPaymentId,
      gatewaySignature,
      rawPayload,
    });

    if (!verification.success) {
      // Payment verification failed
      if (activePayment) {
        await prisma.payment.update({
          where: { id: activePayment.id },
          data: {
            status: PaymentStatus.FAILED,
            failureReason: verification.error || 'Payment gateway verification failed',
            gatewayPaymentId,
            gatewaySignature,
          },
        });
      }

      await prisma.order.update({
        where: { id: order.id },
        data: { status: OrderStatus.PAYMENT_FAILED },
      });

      // Release reserved inventory
      await releaseTicketReservation(
        order.orderItems.map((item) => ({
          ticketTypeId: item.ticketTypeId,
          quantity: item.quantity,
        }))
      );

      return {
        success: false,
        status: OrderStatus.PAYMENT_FAILED,
        error: verification.error || 'Payment verification failed',
      };
    }

    // 2. Gateway confirmed payment success!
    // Now perform Booking Confirmation (Atomic finalize inventory + generate digital tickets)
    try {
      if (simulateBookingFailure) {
        throw new Error('Simulated booking failure triggered for resilience test');
      }

      // Convert temporary reservation into permanent sale
      await finalizeTicketInventory(
        order.orderItems.map((item) => ({
          ticketTypeId: item.ticketTypeId,
          quantity: item.quantity,
        }))
      );

      // Generate digital tickets with cryptographically signed tokens
      const tickets = await generateTicketsForOrder(order.id, attendees);

      // Update payment
      if (activePayment) {
        await prisma.payment.update({
          where: { id: activePayment.id },
          data: {
            status: PaymentStatus.SUCCESS,
            gatewayPaymentId,
            gatewaySignature,
            rawResponse: verification.rawData || {},
          },
        });
      }

      // Increment coupon usage count if applied
      if (order.couponId) {
        await prisma.coupon.update({
          where: { id: order.couponId },
          data: { usedCount: { increment: 1 } },
        });
      }

      // Update order to final verified state
      const updatedOrder = await prisma.order.update({
        where: { id: order.id },
        data: { status: OrderStatus.PAYMENT_VERIFIED },
        include: { orderItems: true },
      });

      // Audit log
      await prisma.auditLog.create({
        data: {
          userId: order.userId,
          action: 'PAYMENT_VERIFIED_TICKETS_ISSUED',
          resourceType: 'Order',
          resourceId: order.id,
          details: {
            orderNumber: order.orderNumber,
            amount: Number(order.totalAmount),
            gatewayPaymentId,
            ticketCount: tickets.length,
          },
        },
      });

      return {
        success: true,
        status: OrderStatus.PAYMENT_VERIFIED,
        order: updatedOrder,
        tickets,
      };
    } catch (bookingError: any) {
      console.error('CRITICAL: Payment succeeded but booking failed! Triggering automatic refund...', bookingError);

      // 3. CRITICAL FAILURE RECOVERY: Automatic Refund Initiation
      let refundResult: any = null;
      let refundStatus: RefundStatus = RefundStatus.PENDING;

      try {
        refundResult = await provider.initiateRefund({
          paymentId: activePayment?.id || 'unknown',
          gatewayPaymentId,
          amountInRupees: Number(order.totalAmount),
          reason: 'AUTOMATIC_REFUND: System booking creation failed after successful payment',
        });

        if (refundResult.success) {
          refundStatus = RefundStatus.PROCESSED;
        }
      } catch (refundErr) {
        console.error('Refund initiation API error:', refundErr);
        refundStatus = RefundStatus.FAILED;
      }

      // Record refund in DB
      const refundRecord = await prisma.refund.create({
        data: {
          orderId: order.id,
          paymentId: activePayment?.id || orderId,
          gatewayRefundId: refundResult?.gatewayRefundId,
          amount: order.totalAmount,
          reason: `Automatic refund due to booking failure: ${bookingError.message}`,
          status: refundStatus,
          initiatedBy: 'SYSTEM_AUTO_REFUND',
        },
      });

      // Update order to BOOKING_FAILED & REFUND_PENDING / REFUNDED
      const finalOrderStatus =
        refundStatus === RefundStatus.PROCESSED ? OrderStatus.REFUNDED : OrderStatus.REFUND_PENDING;

      await prisma.order.update({
        where: { id: order.id },
        data: { status: finalOrderStatus },
      });

      // Release any residual inventory reservation
      await releaseTicketReservation(
        order.orderItems.map((item) => ({
          ticketTypeId: item.ticketTypeId,
          quantity: item.quantity,
        }))
      );

      // Critical forensic audit log
      await prisma.auditLog.create({
        data: {
          userId: order.userId,
          action: 'BOOKING_FAILED_AUTOMATIC_REFUND_TRIGGERED',
          resourceType: 'Order',
          resourceId: order.id,
          details: {
            orderNumber: order.orderNumber,
            gatewayPaymentId,
            refundId: refundRecord.id,
            gatewayRefundId: refundResult?.gatewayRefundId,
            error: bookingError.message,
          },
        },
      });

      return {
        success: false,
        status: OrderStatus.BOOKING_FAILED,
        criticalFailureHandled: true,
        refundInitiated: true,
        refund: refundRecord,
        error: `Your payment of ₹${order.totalAmount} was received, but ticket issuance experienced an unexpected issue. An automatic full refund has been initiated to your original payment method. Refund Ref: ${refundRecord.id}.`,
      };
    }
  }

  /**
   * Secure & Idempotent Webhook Processing
   */
  static async processWebhook(params: {
    gateway: PaymentGateway;
    rawBody: string;
    signature: string;
    headers: Record<string, string>;
  }) {
    const { gateway, rawBody, signature, headers } = params;
    const provider = this.getProvider(gateway);

    const webhookData = await provider.verifyWebhook(rawBody, signature, headers);

    // Webhook Idempotency Check
    const existingWebhook = await prisma.webhookEvent.findUnique({
      where: {
        gateway_eventId: {
          gateway,
          eventId: webhookData.eventId,
        },
      },
    });

    if (existingWebhook) {
      return {
        success: true,
        alreadyProcessed: true,
        message: 'Webhook event already processed previously',
      };
    }

    // Save webhook event to prevent re-processing
    const savedEvent = await prisma.webhookEvent.create({
      data: {
        gateway,
        eventId: webhookData.eventId,
        eventType: webhookData.eventType,
        payload: webhookData.rawData || {},
        signature,
        status: webhookData.status === 'SUCCESS' ? WebhookStatus.PROCESSED : WebhookStatus.FAILED,
        processedAt: new Date(),
      },
    });

    // If payment captured event, reconcile order
    if (webhookData.status === 'SUCCESS' && webhookData.gatewayOrderId && webhookData.gatewayPaymentId) {
      const payment = await prisma.payment.findFirst({
        where: { gatewayOrderId: webhookData.gatewayOrderId },
      });

      if (payment) {
        await this.verifyAndCompletePayment({
          orderId: payment.orderId,
          gatewayOrderId: webhookData.gatewayOrderId,
          gatewayPaymentId: webhookData.gatewayPaymentId,
          gatewaySignature: signature,
        });
      }
    }

    return {
      success: true,
      webhookEventId: savedEvent.id,
    };
  }

  /**
   * Administrative Manual or Policy-based Refund
   */
  static async processRefund(params: {
    orderId: string;
    amountInRupees?: number;
    reason: string;
    staffUserId?: string;
  }) {
    const { orderId, amountInRupees, reason, staffUserId } = params;

    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: {
        payments: {
          where: { status: PaymentStatus.SUCCESS },
          take: 1,
        },
        tickets: true,
      },
    });

    if (!order) {
      throw new Error(`Order ${orderId} not found`);
    }

    if (order.status === OrderStatus.REFUNDED) {
      throw new Error(`Order ${order.orderNumber} is already fully refunded`);
    }

    // Check existing refunds to prevent over-refunding
    const existingRefunds = await prisma.refund.findMany({
      where: { orderId, status: RefundStatus.PROCESSED },
    });
    const totalAlreadyRefunded = existingRefunds.reduce((acc, r) => acc + Number(r.amount), 0);
    const remainingRefundable = Number(order.totalAmount) - totalAlreadyRefunded;

    if (remainingRefundable <= 0) {
      throw new Error(`Order ${order.orderNumber} has already been refunded in full (₹${totalAlreadyRefunded})`);
    }

    const refundAmount = amountInRupees ?? remainingRefundable;
    if (refundAmount > remainingRefundable) {
      throw new Error(`Refund amount ₹${refundAmount} exceeds remaining refundable balance ₹${remainingRefundable}`);
    }

    const payment = order.payments[0];
    if (!payment || !payment.gatewayPaymentId) {
      throw new Error('No successful payment record found to refund');
    }
    const provider = this.getProvider(payment.gateway);

    const gatewayRefund = await provider.initiateRefund({
      paymentId: payment.id,
      gatewayPaymentId: payment.gatewayPaymentId,
      amountInRupees: refundAmount,
      reason,
    });

    const refund = await prisma.refund.create({
      data: {
        orderId: order.id,
        paymentId: payment.id,
        gatewayRefundId: gatewayRefund.gatewayRefundId,
        amount: refundAmount,
        reason,
        status: gatewayRefund.status === 'PROCESSED' ? RefundStatus.PROCESSED : RefundStatus.PENDING,
        initiatedBy: staffUserId || 'ADMIN_USER',
      },
    });

    // Mark order and tickets as REFUNDED
    await prisma.order.update({
      where: { id: order.id },
      data: { status: OrderStatus.REFUNDED },
    });

    await prisma.ticket.updateMany({
      where: { orderId: order.id },
      data: { status: 'REFUNDED' },
    });

    // Audit log
    await prisma.auditLog.create({
      data: {
        userId: staffUserId,
        action: 'MANUAL_REFUND_ISSUED',
        resourceType: 'Order',
        resourceId: order.id,
        details: {
          orderNumber: order.orderNumber,
          refundAmount,
          reason,
          gatewayRefundId: gatewayRefund.gatewayRefundId,
        },
      },
    });

    return refund;
  }
}
