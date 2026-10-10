import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { PaymentService } from '@/lib/payments/service';
import { verifyAdminAuth } from '@/lib/auth/admin';
import { Role } from '@prisma/client';

export async function GET(req: NextRequest) {
  try {
    const auth = await verifyAdminAuth([Role.SUPER_ADMIN, Role.EVENT_ADMIN, Role.FINANCE_ADMIN]);
    if (!auth.authorized) return auth.response!;


    const refunds = await prisma.refund.findMany({
      include: {
        order: {
          select: {
            orderNumber: true,
            customerName: true,
            customerPhone: true,
            totalAmount: true,
          },
        },
        payment: {
          select: {
            gateway: true,
            gatewayPaymentId: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({ refunds });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await verifyAdminAuth([Role.SUPER_ADMIN, Role.FINANCE_ADMIN]);
    if (!auth.authorized) return auth.response!;

    const body = await req.json();
    const { orderId, amount, reason } = body;

    if (!orderId) {
      return NextResponse.json({ error: 'Order ID is required' }, { status: 400 });
    }

    const refund = await PaymentService.processRefund({
      orderId,
      amountInRupees: amount ? Number(amount) : undefined,
      reason: reason || 'Administrative Refund Issued',
      staffUserId: auth.user.id,
    });

    return NextResponse.json({ success: true, refund });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}
