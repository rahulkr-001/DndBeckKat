import { NextRequest, NextResponse } from 'next/server';
import { PaymentService } from '@/lib/payments/service';
import { z } from 'zod';

const VerifyPaymentSchema = z.object({
  orderId: z.string().min(1),
  gatewayOrderId: z.string().min(1),
  gatewayPaymentId: z.string().min(1),
  gatewaySignature: z.string().optional(),
  rawPayload: z.any().optional(),
  attendees: z.array(z.object({ name: z.string(), ticketTypeId: z.string() })).optional(),
  simulateBookingFailure: z.boolean().optional(),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = VerifyPaymentSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Payment verification parameters missing or invalid' },
        { status: 400 }
      );
    }

    const result = await PaymentService.verifyAndCompletePayment(parsed.data);

    if (!result.success) {
      return NextResponse.json(result, { status: 400 });
    }

    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || 'Payment verification processing failed' },
      { status: 500 }
    );
  }
}
