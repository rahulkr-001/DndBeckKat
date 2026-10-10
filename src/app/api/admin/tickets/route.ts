import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { TicketStatus } from '@prisma/client';

import { verifyAdminAuth } from '@/lib/auth/admin';
import { Role } from '@prisma/client';

export async function GET(req: NextRequest) {
  try {
    const auth = await verifyAdminAuth([Role.SUPER_ADMIN, Role.EVENT_ADMIN, Role.VALIDATOR]);
    if (!auth.authorized) return auth.response!;

    const { searchParams } = new URL(req.url);
    const status = searchParams.get('status') as TicketStatus | null;
    const search = searchParams.get('search');

    const where: any = {};
    if (status) {
      where.status = status;
    }
    if (search) {
      where.OR = [
        { ticketNumber: { contains: search, mode: 'insensitive' } },
        { attendeeName: { contains: search, mode: 'insensitive' } },
        { validationToken: { contains: search, mode: 'insensitive' } },
      ];
    }

    const tickets = await prisma.ticket.findMany({
      where,
      include: {
        ticketType: true,
        order: { select: { orderNumber: true, customerPhone: true, customerEmail: true } },
        scans: { orderBy: { scannedAt: 'desc' }, take: 1, include: { scannedByUser: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    return NextResponse.json({ tickets });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
