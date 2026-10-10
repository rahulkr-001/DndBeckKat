import crypto from 'crypto';
import { PaymentGateway } from '@prisma/client';
import {
  PaymentGatewayProvider,
  PaymentOrderRequest,
  PaymentOrderResult,
  PaymentVerificationRequest,
  PaymentVerificationResult,
  PaymentRefundRequest,
  PaymentRefundResult,
  PaymentWebhookResult,
} from '../types';

export class RazorpayGatewayProvider implements PaymentGatewayProvider {
  readonly gatewayName = PaymentGateway.RAZORPAY;

  private keyId: string;
  private keySecret: string;
  private webhookSecret: string;

  constructor() {
    this.keyId = process.env.RAZORPAY_KEY_ID || '';
    this.keySecret = process.env.RAZORPAY_KEY_SECRET || '';
    this.webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET || '';
  }

  private getAuthHeader(): string {
    return `Basic ${Buffer.from(`${this.keyId}:${this.keySecret}`).toString('base64')}`;
  }

  async createGatewayOrder(params: PaymentOrderRequest): Promise<PaymentOrderResult> {
    if (!this.keyId || !this.keySecret || this.keyId.includes('YourKeyHere')) {
      console.warn('⚠️ Razorpay credentials not configured. Returning mock order structure.');
      const mockOrderId = `order_rzp_mock_${Date.now()}`;
      return {
        gateway: this.gatewayName,
        gatewayOrderId: mockOrderId,
        amount: params.amountInRupees,
        currency: params.currency,
        clientParams: {
          key: this.keyId || 'rzp_test_placeholder',
          order_id: mockOrderId,
          amount: Math.round(params.amountInRupees * 100),
          currency: params.currency,
          name: 'Dandiya Utsav 2026',
          description: `Booking #${params.orderNumber}`,
          prefill: {
            name: params.customerName,
            email: params.customerEmail,
            contact: params.customerPhone,
          },
        },
      };
    }

    try {
      const response = await fetch('https://api.razorpay.com/v1/orders', {
        method: 'POST',
        headers: {
          Authorization: this.getAuthHeader(),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          amount: Math.round(params.amountInRupees * 100), // Amount in paise
          currency: params.currency,
          receipt: params.orderNumber,
          notes: {
            orderId: params.orderId,
            customerPhone: params.customerPhone,
          },
        }),
      });

      const orderData = await response.json();
      if (!response.ok) {
        throw new Error(orderData.error?.description || 'Razorpay order creation failed');
      }

      return {
        gateway: this.gatewayName,
        gatewayOrderId: orderData.id,
        amount: params.amountInRupees,
        currency: params.currency,
        clientParams: {
          key: this.keyId,
          order_id: orderData.id,
          amount: orderData.amount,
          currency: orderData.currency,
          name: 'Dandiya Utsav 2026',
          description: `Booking #${params.orderNumber}`,
          prefill: {
            name: params.customerName,
            email: params.customerEmail,
            contact: params.customerPhone,
          },
        },
      };
    } catch (err: any) {
      console.error('Razorpay order creation error:', err);
      throw err;
    }
  }

  async verifyPayment(params: PaymentVerificationRequest): Promise<PaymentVerificationResult> {
    const { gatewayOrderId, gatewayPaymentId, gatewaySignature } = params;

    if (!gatewaySignature) {
      return {
        success: false,
        gatewayPaymentId,
        amount: 0,
        status: 'FAILED',
        error: 'Missing Razorpay signature',
      };
    }

    // In dev without keys, allow mock signatures
    if (!this.keySecret || this.keySecret.includes('YourRazorpaySecretHere')) {
      return {
        success: true,
        gatewayPaymentId,
        amount: 0,
        status: 'SUCCESS',
        rawData: { mockVerified: true },
      };
    }

    // Server-side HMAC SHA-256 signature verification
    const expectedSignature = crypto
      .createHmac('sha256', this.keySecret)
      .update(`${gatewayOrderId}|${gatewayPaymentId}`)
      .digest('hex');

    if (expectedSignature !== gatewaySignature) {
      return {
        success: false,
        gatewayPaymentId,
        amount: 0,
        status: 'FAILED',
        error: 'Cryptographic signature verification mismatch. Potential tampering detected.',
      };
    }

    return {
      success: true,
      gatewayPaymentId,
      amount: 0,
      status: 'SUCCESS',
    };
  }

  async verifyWebhook(
    rawBody: string,
    signature: string,
    headers: Record<string, string>
  ): Promise<PaymentWebhookResult> {
    if (!this.webhookSecret) {
      throw new Error('RAZORPAY_WEBHOOK_SECRET is not configured');
    }

    const expectedSignature = crypto
      .createHmac('sha256', this.webhookSecret)
      .update(rawBody)
      .digest('hex');

    if (expectedSignature !== signature) {
      return {
        success: false,
        eventId: 'invalid_sig',
        eventType: 'unknown',
        status: 'FAILED',
      };
    }

    const payload = JSON.parse(rawBody);
    const event = payload.event;
    const paymentEntity = payload.payload?.payment?.entity;

    return {
      success: true,
      eventId: payload.event_id || `rzp_evt_${Date.now()}`,
      eventType: event,
      gatewayOrderId: paymentEntity?.order_id,
      gatewayPaymentId: paymentEntity?.id,
      status: event === 'payment.captured' ? 'SUCCESS' : 'FAILED',
      rawData: payload,
    };
  }

  async initiateRefund(params: PaymentRefundRequest): Promise<PaymentRefundResult> {
    if (!this.keyId || !this.keySecret || this.keyId.includes('YourKeyHere')) {
      const mockRefundId = `rfnd_rzp_mock_${Date.now()}`;
      return {
        success: true,
        gatewayRefundId: mockRefundId,
        status: 'PROCESSED',
        rawResponse: { id: mockRefundId, status: 'processed', mock: true },
      };
    }

    try {
      const response = await fetch(`https://api.razorpay.com/v1/payments/${params.gatewayPaymentId}/refund`, {
        method: 'POST',
        headers: {
          Authorization: this.getAuthHeader(),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          amount: Math.round(params.amountInRupees * 100),
          notes: {
            reason: params.reason,
            paymentId: params.paymentId,
          },
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        return {
          success: false,
          status: 'FAILED',
          error: data.error?.description || 'Razorpay refund API failed',
        };
      }

      return {
        success: true,
        gatewayRefundId: data.id,
        status: data.status === 'processed' ? 'PROCESSED' : 'PENDING',
        rawResponse: data,
      };
    } catch (err: any) {
      return {
        success: false,
        status: 'FAILED',
        error: err.message,
      };
    }
  }
}
