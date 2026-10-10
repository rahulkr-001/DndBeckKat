import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { OrderStatus } from '@prisma/client';

import { verifyAdminAuth } from '@/lib/auth/admin';
import { Role } from '@prisma/client';

export async function GET(req: NextRequest) {
  try {
    const auth = await verifyAdminAuth([Role.SUPER_ADMIN, Role.EVENT_ADMIN, Role.FINANCE_ADMIN]);
    if (!auth.authorized) return auth.response!;

    const { searchParams } = new URL(req.url);
    const status = searchParams.get('status') as OrderStatus | null;
    const search = searchParams.get('search');

    const where: any = {};
    if (status) {
      where.status = status;
    }
    if (search) {
      where.OR = [
        { orderNumber: { contains: search, mode: 'insensitive' } },
        { customerName: { contains: search, mode: 'insensitive' } },
        { customerPhone: { contains: search } },
        { customerEmail: { contains: search, mode: 'insensitive' } },
      ];
    }

    const orders = await prisma.order.findMany({
      where,
      include: {
        orderItems: { include: { ticketType: true } },
        payments: true,
        refunds: true,
        tickets: true,
        event: { select: { title: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    return NextResponse.json({ orders });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
