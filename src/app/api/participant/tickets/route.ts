import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth/session';
import { prisma } from '@/lib/prisma';

export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    let targetUserId = user?.id;

    if (!targetUserId) {
      if (process.env.NODE_ENV === 'production') {
        return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
      }
      // Provide sample tickets for test participant if unauthenticated in dev
      const sampleUser = await prisma.user.findFirst({
        where: { phone: '+919876543210' },
      });
      targetUserId = sampleUser?.id;
    }

    if (!targetUserId) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const tickets = await prisma.ticket.findMany({
      where: { userId: targetUserId },
      include: {
        ticketType: true,
        order: {
          include: {
            event: {
              include: { venue: true, organizer: true },
            },
          },
        },
        scans: {
          orderBy: { scannedAt: 'desc' },
          take: 1,
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({ tickets });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
