import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyAdminAuth } from '@/lib/auth/admin';
import { Role } from '@prisma/client';

export async function GET(req: NextRequest) {
  try {
    const auth = await verifyAdminAuth([Role.SUPER_ADMIN, Role.FINANCE_ADMIN]);
    if (!auth.authorized) return auth.response!;

    const { searchParams } = new URL(req.url);
    const action = searchParams.get('action');
    const resourceType = searchParams.get('resourceType');

    const where: any = {};
    if (action) where.action = { contains: action, mode: 'insensitive' };
    if (resourceType) where.resourceType = resourceType;

    const auditLogs = await prisma.auditLog.findMany({
      where,
      include: {
        user: { select: { name: true, phone: true, role: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    return NextResponse.json({ auditLogs });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
