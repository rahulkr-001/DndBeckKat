import { PaymentGateway } from '@prisma/client';

export interface PaymentOrderRequest {
  orderId: string;
  orderNumber: string;
  amountInRupees: number;
  currency: string;
  customerPhone: string;
  customerEmail: string;
  customerName: string;
}

export interface PaymentOrderResult {
  gateway: PaymentGateway;
  gatewayOrderId: string;
  amount: number;
  currency: string;
  clientParams: Record<string, any>;
}

export interface PaymentVerificationRequest {
  gatewayOrderId: string;
  gatewayPaymentId: string;
  gatewaySignature?: string;
  rawPayload?: any;
}

export interface PaymentVerificationResult {
  success: boolean;
  gatewayPaymentId: string;
  amount: number;
  status: 'SUCCESS' | 'FAILED';
  error?: string;
  rawData?: any;
}

export interface PaymentRefundRequest {
  paymentId: string;
  gatewayPaymentId: string;
  amountInRupees: number;
  reason: string;
}

export interface PaymentRefundResult {
  success: boolean;
  gatewayRefundId?: string;
  status: 'PROCESSED' | 'PENDING' | 'FAILED';
  error?: string;
  rawResponse?: any;
}

export interface PaymentWebhookResult {
  success: boolean;
  eventId: string;
  eventType: string;
  gatewayOrderId?: string;
  gatewayPaymentId?: string;
  status: 'SUCCESS' | 'FAILED' | 'IGNORED';
  rawData?: any;
}

export interface PaymentGatewayProvider {
  readonly gatewayName: PaymentGateway;

  createGatewayOrder(params: PaymentOrderRequest): Promise<PaymentOrderResult>;

  verifyPayment(params: PaymentVerificationRequest): Promise<PaymentVerificationResult>;

  verifyWebhook(rawBody: string, signature: string, headers: Record<string, string>): Promise<PaymentWebhookResult>;

  initiateRefund(params: PaymentRefundRequest): Promise<PaymentRefundResult>;
}
