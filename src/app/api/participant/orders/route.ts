import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth/session';
import { prisma } from '@/lib/prisma';

export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      if (process.env.NODE_ENV === 'production') {
        return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
      }
      // In dev, provide sample orders for test participant if unauthenticated
      const sampleUser = await prisma.user.findFirst({
        where: { phone: '+919876543210' },
      });
      if (!sampleUser) {
        return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
      }

      const orders = await prisma.order.findMany({
        where: { userId: sampleUser.id },
        include: {
          orderItems: { include: { ticketType: true } },
          payments: true,
          refunds: true,
          tickets: true,
          event: { include: { venue: true } },
        },
        orderBy: { createdAt: 'desc' },
      });

      return NextResponse.json({ orders, isDemoAccount: true });
    }

    const orders = await prisma.order.findMany({
      where: { userId: user.id },
      include: {
        orderItems: { include: { ticketType: true } },
        payments: true,
        refunds: true,
        tickets: true,
        event: { include: { venue: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({ orders });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
