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

export class DevSandboxGatewayProvider implements PaymentGatewayProvider {
  readonly gatewayName = PaymentGateway.DEV_SANDBOX;

  async createGatewayOrder(params: PaymentOrderRequest): Promise<PaymentOrderResult> {
    const gatewayOrderId = `sandbox_order_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

    return {
      gateway: this.gatewayName,
      gatewayOrderId,
      amount: params.amountInRupees,
      currency: params.currency,
      clientParams: {
        orderId: gatewayOrderId,
        key: 'sandbox_test_key_dandiya',
        currency: params.currency,
        amount: Math.round(params.amountInRupees * 100),
        name: 'Dandiya Utsav 2026 Sandbox',
        description: `Booking ${params.orderNumber}`,
        prefill: {
          name: params.customerName,
          email: params.customerEmail,
          contact: params.customerPhone,
        },
      },
    };
  }

  async verifyPayment(params: PaymentVerificationRequest): Promise<PaymentVerificationResult> {
    // In sandbox, check if payment was intentionally marked failed
    if (params.rawPayload?.simulateFailure || params.gatewayPaymentId.includes('fail')) {
      return {
        success: false,
        gatewayPaymentId: params.gatewayPaymentId,
        amount: 0,
        status: 'FAILED',
        error: 'Simulated payment failure by user or bank decline',
      };
    }

    return {
      success: true,
      gatewayPaymentId: params.gatewayPaymentId || `sandbox_pay_${Date.now()}`,
      amount: params.rawPayload?.amount || 0,
      status: 'SUCCESS',
      rawData: { method: 'upi', vpa: 'participant@upi', provider: 'sandbox' },
    };
  }

  async verifyWebhook(
    rawBody: string,
    signature: string,
    headers: Record<string, string>
  ): Promise<PaymentWebhookResult> {
    try {
      const parsed = JSON.parse(rawBody);
      return {
        success: true,
        eventId: parsed.eventId || `evt_${Date.now()}`,
        eventType: parsed.event || 'payment.authorized',
        gatewayOrderId: parsed.orderId,
        gatewayPaymentId: parsed.paymentId,
        status: 'SUCCESS',
        rawData: parsed,
      };
    } catch (e) {
      return {
        success: false,
        eventId: `err_${Date.now()}`,
        eventType: 'unknown',
        status: 'FAILED',
      };
    }
  }

  async initiateRefund(params: PaymentRefundRequest): Promise<PaymentRefundResult> {
    const refundId = `sandbox_rfnd_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    return {
      success: true,
      gatewayRefundId: refundId,
      status: 'PROCESSED',
      rawResponse: {
        id: refundId,
        amount: params.amountInRupees,
        paymentId: params.gatewayPaymentId,
        status: 'processed',
        reason: params.reason,
      },
    };
  }
}
