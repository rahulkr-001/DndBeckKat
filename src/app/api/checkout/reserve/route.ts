import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { calculateOrderPricing } from '@/lib/pricing';
import { reserveTicketInventory } from '@/lib/inventory';
import { getCurrentUser } from '@/lib/auth/session';
import { formatPhoneNumber } from '@/lib/auth/otp';
import { OrderStatus } from '@prisma/client';
import { z } from 'zod';

const ReserveOrderSchema = z.object({
  eventId: z.string().min(1),
  items: z.array(
    z.object({
      ticketTypeId: z.string().min(1),
      quantity: z.number().int().positive(),
    })
  ).min(1),
  couponCode: z.string().optional(),
  customerName: z.string().min(2, 'Full Name is required'),
  customerPhone: z.string().min(10, 'Valid 10-digit phone number is required'),
  customerEmail: z.string().email('Valid email is required'),
  idempotencyKey: z.string().min(6),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = ReserveOrderSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || 'Invalid reservation payload' },
        { status: 400 }
      );
    }

    const {
      eventId,
      items,
      couponCode,
      customerName,
      customerPhone,
      customerEmail,
      idempotencyKey,
    } = parsed.data;

    // Check Idempotency Key to protect against duplicate tab submissions & double-clicks
    const existingOrder = await prisma.order.findUnique({
      where: { idempotencyKey },
      include: { orderItems: { include: { ticketType: true } } },
    });

    if (existingOrder) {
      return NextResponse.json({
        success: true,
        isExisting: true,
        order: existingOrder,
        expiresAt: existingOrder.expiresAt,
      });
    }

    // Resolve or authenticate user
    const currentUser = await getCurrentUser();
    const formattedPhone = formatPhoneNumber(customerPhone);
    let targetUserId = currentUser?.id;

    if (!targetUserId) {
      const existingUser = await prisma.user.findUnique({ where: { phone: formattedPhone } });
      if (existingUser) {
        targetUserId = existingUser.id;
      } else {
        const newUser = await prisma.user.create({
          data: {
            phone: formattedPhone,
            name: customerName,
            email: customerEmail,
            role: 'PARTICIPANT',
          },
        });
        targetUserId = newUser.id;
      }
    }

    // 1. Calculate independent pricing server-side
    const pricing = await calculateOrderPricing(items, couponCode);

    // 2. Concurrency-Safe Inventory Reservation (Atomic check and lock)
    const reservationResult = await reserveTicketInventory(items, 10);

    // 3. Create Order in Database
    const orderNumber = `DND-2026-${Math.floor(100000 + Math.random() * 900000)}`;

    const order = await prisma.order.create({
      data: {
        orderNumber,
        userId: targetUserId,
        eventId,
        couponId: pricing.coupon?.id,
        idempotencyKey,
        status: OrderStatus.CREATED,
        subtotal: pricing.subtotal,
        discountAmount: pricing.discountAmount,
        taxAmount: pricing.taxAmount,
        convenienceFee: pricing.convenienceFee,
        totalAmount: pricing.totalAmount,
        currency: pricing.currency,
        expiresAt: reservationResult.expiresAt,
        customerName,
        customerPhone: formattedPhone,
        customerEmail,
        metadata: {
          pricingSnapshot: {
            subtotal: pricing.subtotal,
            discountAmount: pricing.discountAmount,
            taxableAmount: pricing.taxableAmount,
            taxAmount: pricing.taxAmount,
            convenienceFee: pricing.convenienceFee,
            totalAmount: pricing.totalAmount,
            ...pricing.configSnapshot,
          },
        },
        orderItems: {
          create: pricing.items.map((it) => ({
            ticketTypeId: it.ticketTypeId,
            unitPrice: it.unitPrice,
            quantity: it.quantity,
            totalPrice: it.totalPrice,
          })),
        },
      },
      include: {
        orderItems: {
          include: { ticketType: true },
        },
      },
    });

    return NextResponse.json({
      success: true,
      order,
      pricing,
      expiresAt: reservationResult.expiresAt,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || 'Failed to reserve tickets' },
      { status: 400 }
    );
  }
}
