import { NextRequest, NextResponse } from 'next/server';
import { PaymentService } from '@/lib/payments/service';
import { PaymentGateway } from '@prisma/client';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ gateway: string }> }
) {
  try {
    const { gateway } = await params;
    const gatewayUpper = gateway.toUpperCase();

    let targetGateway: PaymentGateway;
    if (gatewayUpper === 'RAZORPAY') {
      targetGateway = PaymentGateway.RAZORPAY;
    } else {
      targetGateway = PaymentGateway.DEV_SANDBOX;
    }

    const rawBody = await req.text();
    const signature =
      req.headers.get('x-razorpay-signature') ||
      req.headers.get('signature') ||
      '';

    const headersObj: Record<string, string> = {};
    req.headers.forEach((value, key) => {
      headersObj[key] = value;
    });

    const result = await PaymentService.processWebhook({
      gateway: targetGateway,
      rawBody,
      signature,
      headers: headersObj,
    });

    return NextResponse.json({ status: 'ok', result });
  } catch (err: any) {
    console.error('Webhook error:', err);
    return NextResponse.json({ error: err.message || 'Webhook processing failed' }, { status: 400 });
  }
}
