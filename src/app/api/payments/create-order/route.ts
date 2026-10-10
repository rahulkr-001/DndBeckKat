import { NextRequest, NextResponse } from 'next/server';
import { PaymentService } from '@/lib/payments/service';
import { PaymentGateway } from '@prisma/client';
import { z } from 'zod';

const CreateOrderSchema = z.object({
  orderId: z.string().min(1),
  gateway: z.string().optional(),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = CreateOrderSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Valid order ID is required' },
        { status: 400 }
      );
    }

    // Enforce production gateway: Only Razorpay is supported for checkout
    const requestedGateway = parsed.data.gateway?.toUpperCase();
    if (requestedGateway && requestedGateway !== PaymentGateway.RAZORPAY) {
      return NextResponse.json(
        { error: 'Invalid payment gateway. Only official Razorpay is supported.' },
        { status: 400 }
      );
    }

    const result = await PaymentService.createPaymentOrder(
      parsed.data.orderId,
      PaymentGateway.RAZORPAY
    );

    return NextResponse.json({
      success: true,
      order: result.order,
      payment: result.payment,
      gatewayOrder: result.gatewayOrder,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || 'Failed to initiate payment gateway order' },
      { status: 400 }
    );
  }
}
