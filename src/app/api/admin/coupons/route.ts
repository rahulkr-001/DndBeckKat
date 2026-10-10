import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyAdminAuth } from '@/lib/auth/admin';
import { CouponDiscountType, Role } from '@prisma/client';

export async function GET(req: NextRequest) {
  try {
    const auth = await verifyAdminAuth([Role.SUPER_ADMIN, Role.EVENT_ADMIN, Role.FINANCE_ADMIN]);
    if (!auth.authorized) return auth.response!;


    const coupons = await prisma.coupon.findMany({
      orderBy: { createdAt: 'desc' },
    });
    return NextResponse.json({ coupons });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await verifyAdminAuth([Role.SUPER_ADMIN, Role.EVENT_ADMIN]);
    if (!auth.authorized) return auth.response!;

    const body = await req.json();
    const { code, description, discountType, discountValue, minOrderAmount, maxDiscount, usageLimit, validFrom, validUntil } = body;

    const coupon = await prisma.coupon.create({
      data: {
        code: code.trim().toUpperCase(),
        description,
        discountType: discountType as CouponDiscountType,
        discountValue: Number(discountValue),
        minOrderAmount: minOrderAmount ? Number(minOrderAmount) : null,
        maxDiscount: maxDiscount ? Number(maxDiscount) : null,
        usageLimit: usageLimit ? Number(usageLimit) : null,
        validFrom: validFrom ? new Date(validFrom) : new Date(),
        validUntil: validUntil ? new Date(validUntil) : new Date(Date.now() + 30 * 86400000),
        isActive: true,
      },
    });

    // Forensic audit log
    await prisma.auditLog.create({
      data: {
        userId: auth.user.id,
        action: 'COUPON_CREATED',
        resourceType: 'Coupon',
        resourceId: coupon.id,
        details: { code: coupon.code, discountValue: Number(coupon.discountValue) },
      },
    });

    return NextResponse.json({ success: true, coupon });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const auth = await verifyAdminAuth([Role.SUPER_ADMIN, Role.EVENT_ADMIN]);
    if (!auth.authorized) return auth.response!;

    const body = await req.json();
    const { id, isActive } = body;

    const updated = await prisma.coupon.update({
      where: { id },
      data: { isActive },
    });

    // Forensic audit log
    await prisma.auditLog.create({
      data: {
        userId: auth.user.id,
        action: 'COUPON_STATUS_UPDATED',
        resourceType: 'Coupon',
        resourceId: updated.id,
        details: { code: updated.code, isActive: updated.isActive },
      },
    });

    return NextResponse.json({ success: true, coupon: updated });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}
