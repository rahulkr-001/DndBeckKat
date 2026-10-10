import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyAdminAuth } from '@/lib/auth/admin';
import { Role, TicketCategory, TicketSaleStatus } from '@prisma/client';
import { z } from 'zod';

const CreateTierSchema = z.object({
  eventId: z.string().optional(),
  name: z.string().min(2, 'Tier name is required'),
  category: z.nativeEnum(TicketCategory),
  description: z.string().optional(),
  price: z.number().min(0, 'Price must be non-negative'),
  currency: z.string().default('INR'),
  maxPerOrder: z.number().int().positive().default(10),
  totalCapacity: z.number().int().positive('Total capacity must be at least 1'),
  saleStartDate: z.string().or(z.date()).optional(),
  saleEndDate: z.string().or(z.date()).optional(),
  status: z.nativeEnum(TicketSaleStatus).default(TicketSaleStatus.ACTIVE),
  orderIndex: z.number().int().optional().default(0),
});

export async function GET(req: NextRequest) {
  try {
    const auth = await verifyAdminAuth([Role.SUPER_ADMIN, Role.EVENT_ADMIN, Role.FINANCE_ADMIN]);
    if (!auth.authorized) return auth.response!;


    const ticketTypes = await prisma.ticketType.findMany({
      include: {
        inventory: true,
        event: { select: { id: true, title: true } },
      },
      orderBy: { orderIndex: 'asc' },
    });

    return NextResponse.json({ ticketTypes });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await verifyAdminAuth([Role.SUPER_ADMIN, Role.EVENT_ADMIN]);
    if (!auth.authorized) return auth.response!;

    const body = await req.json();
    const parsed = CreateTierSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || 'Invalid ticket tier payload' },
        { status: 400 }
      );
    }

    const data = parsed.data;

    // Fallback to active event if eventId not specified
    let targetEventId = data.eventId;
    if (!targetEventId) {
      const activeEvent = await prisma.event.findFirst({ where: { status: 'PUBLISHED' } }) ||
                          await prisma.event.findFirst();
      if (!activeEvent) {
        return NextResponse.json({ error: 'No event exists to link this ticket tier to' }, { status: 400 });
      }
      targetEventId = activeEvent.id;
    }

    const now = new Date();
    const saleStart = data.saleStartDate ? new Date(data.saleStartDate) : now;
    const saleEnd = data.saleEndDate ? new Date(data.saleEndDate) : new Date(now.getTime() + 60 * 86400000);

    const createdTier = await prisma.$transaction(async (tx) => {
      const tier = await tx.ticketType.create({
        data: {
          eventId: targetEventId,
          name: data.name,
          category: data.category,
          description: data.description,
          price: data.price,
          currency: data.currency,
          maxPerOrder: data.maxPerOrder,
          saleStartDate: saleStart,
          saleEndDate: saleEnd,
          status: data.status,
          orderIndex: data.orderIndex,
        },
      });

      const inventory = await tx.ticketInventory.create({
        data: {
          ticketTypeId: tier.id,
          totalCapacity: data.totalCapacity,
          reservedCount: 0,
          soldCount: 0,
        },
      });

      return { ...tier, inventory };
    });

    // Forensic audit log
    await prisma.auditLog.create({
      data: {
        userId: auth.user.id,
        action: 'TICKET_TIER_CREATED',
        resourceType: 'TicketType',
        resourceId: createdTier.id,
        details: { name: createdTier.name, price: data.price, capacity: data.totalCapacity },
      },
    });

    return NextResponse.json({ success: true, ticketType: createdTier });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const auth = await verifyAdminAuth([Role.SUPER_ADMIN, Role.EVENT_ADMIN]);
    if (!auth.authorized) return auth.response!;

    const body = await req.json();
    const { id, name, price, maxPerOrder, status, totalCapacity, orderIndex, description } = body;

    if (!id) {
      return NextResponse.json({ error: 'Ticket type ID is required' }, { status: 400 });
    }

    const updated = await prisma.$transaction(async (tx) => {
      const existingInventory = await tx.ticketInventory.findUnique({
        where: { ticketTypeId: id },
      });

      if (totalCapacity !== undefined && existingInventory) {
        const numCapacity = Number(totalCapacity);
        if (numCapacity < 0) {
          throw new Error('Total capacity cannot be negative');
        }
        const currentCommitted = existingInventory.soldCount + existingInventory.reservedCount;
        if (numCapacity < currentCommitted) {
          throw new Error(
            `Cannot reduce capacity to ${numCapacity}. Already committed: ${currentCommitted} passes (${existingInventory.soldCount} sold, ${existingInventory.reservedCount} reserved).`
          );
        }

        await tx.ticketInventory.update({
          where: { ticketTypeId: id },
          data: { totalCapacity: numCapacity },
        });
      }

      const type = await tx.ticketType.update({
        where: { id },
        data: {
          name: name || undefined,
          description: description !== undefined ? description : undefined,
          price: price !== undefined ? Number(price) : undefined,
          maxPerOrder: maxPerOrder !== undefined ? Number(maxPerOrder) : undefined,
          status: status ? (status as TicketSaleStatus) : undefined,
          orderIndex: orderIndex !== undefined ? Number(orderIndex) : undefined,
        },
        include: { inventory: true },
      });

      return type;
    });

    // Forensic audit log
    await prisma.auditLog.create({
      data: {
        userId: auth.user.id,
        action: 'TICKET_TIER_UPDATED',
        resourceType: 'TicketType',
        resourceId: updated.id,
        details: { name: updated.name, status: updated.status, price: Number(updated.price) },
      },
    });

    return NextResponse.json({ success: true, ticketType: updated });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}
