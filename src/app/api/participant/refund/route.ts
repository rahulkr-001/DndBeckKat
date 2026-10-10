import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth/session';
import { PaymentService } from '@/lib/payments/service';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';

const RefundRequestSchema = z.object({
  orderId: z.string().min(1),
  reason: z.string().min(3, 'Please provide a valid cancellation reason'),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = RefundRequestSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || 'Invalid refund request' },
        { status: 400 }
      );
    }

    const user = await getCurrentUser();
    const { orderId, reason } = parsed.data;

    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: {
        event: true,
        tickets: true,
        payments: { where: { status: 'SUCCESS' }, take: 1 },
      },
    });

    if (!order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }

    if (user && order.userId !== user.id && user.role === 'PARTICIPANT') {
      return NextResponse.json({ error: 'Unauthorized to refund this order' }, { status: 403 });
    }

    // Check if tickets have already been scanned/used
    const hasUsedTicket = order.tickets.some((t) => t.status === 'USED');
    if (hasUsedTicket) {
      return NextResponse.json(
        { error: 'Cannot refund an order where one or more tickets have already been used at the venue.' },
        { status: 400 }
      );
    }

    // Check refund policy timeline:
    // Event start date vs now
    const now = new Date();
    const hoursToEvent = (order.event.startDate.getTime() - now.getTime()) / (1000 * 60 * 60);

    if (hoursToEvent < 48) {
      return NextResponse.json(
        { error: 'As per event policy, cancellations are not permitted within 48 hours of event doors opening.' },
        { status: 400 }
      );
    }

    // Determine refund percentage: > 7 days = 100%, 2-7 days = 50%
    const refundMultiplier = hoursToEvent > 7 * 24 ? 1.0 : 0.5;
    const eligibleAmount = Math.round(Number(order.totalAmount) * refundMultiplier * 100) / 100;

    const refund = await PaymentService.processRefund({
      orderId: order.id,
      amountInRupees: eligibleAmount,
      reason: `Participant Requested: ${reason} (${refundMultiplier * 100}% eligible)`,
      staffUserId: user?.id,
    });

    return NextResponse.json({
      success: true,
      message: `Refund of ₹${eligibleAmount} (${refundMultiplier * 100}%) processed successfully!`,
      refund,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || 'Failed to process refund request' },
      { status: 500 }
    );
  }
}
