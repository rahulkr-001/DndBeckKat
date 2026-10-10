import { prisma } from '../prisma';
import { OrderStatus } from '@prisma/client';

export interface InventoryItemRequest {
  ticketTypeId: string;
  quantity: number;
}

/**
 * Concurrency-Safe Inventory Reservation
 * Prevents race conditions and overselling using strict database transactions
 */
export async function reserveTicketInventory(
  items: InventoryItemRequest[],
  reservationMinutes: number = 10
) {
  if (!items || items.length === 0) {
    throw new Error('No items specified for inventory reservation');
  }

  return await prisma.$transaction(async (tx) => {
    // 1. First, verify and reserve each item atomically
    for (const item of items) {
      if (item.quantity <= 0) {
        throw new Error('Quantity must be greater than zero');
      }

      // Query ticket type and inventory
      const ticketType = await tx.ticketType.findUnique({
        where: { id: item.ticketTypeId },
        include: { inventory: true },
      });

      if (!ticketType) {
        throw new Error(`Ticket type ${item.ticketTypeId} does not exist`);
      }

      if (ticketType.status !== 'ACTIVE') {
        throw new Error(`Ticket type "${ticketType.name}" is currently ${ticketType.status}`);
      }

      if (item.quantity > ticketType.maxPerOrder) {
        throw new Error(`Maximum allowed per order for "${ticketType.name}" is ${ticketType.maxPerOrder}`);
      }

      const inv = ticketType.inventory;
      if (!inv) {
        throw new Error(`Inventory record missing for "${ticketType.name}"`);
      }

      const available = inv.totalCapacity - inv.reservedCount - inv.soldCount;
      if (available < item.quantity) {
        throw new Error(
          `Insufficient inventory for "${ticketType.name}". Only ${Math.max(0, available)} tickets remaining.`
        );
      }

      // Atomic update inside transaction
      await tx.ticketInventory.update({
        where: { id: inv.id },
        data: {
          reservedCount: { increment: item.quantity },
          version: { increment: 1 },
        },
      });
    }

    const expiresAt = new Date(Date.now() + reservationMinutes * 60 * 1000);
    return {
      reserved: true,
      expiresAt,
    };
  });
}

/**
 * Release reserved ticket inventory when an order expires, cancels or fails
 */
export async function releaseTicketReservation(items: InventoryItemRequest[]) {
  if (!items || items.length === 0) return;

  return await prisma.$transaction(async (tx) => {
    for (const item of items) {
      const inv = await tx.ticketInventory.findUnique({
        where: { ticketTypeId: item.ticketTypeId },
      });

      if (inv) {
        const newReserved = Math.max(0, inv.reservedCount - item.quantity);
        await tx.ticketInventory.update({
          where: { id: inv.id },
          data: {
            reservedCount: newReserved,
            version: { increment: 1 },
          },
        });
      }
    }
  });
}

/**
 * Finalize inventory when payment is verified:
 * Decrements reserved count and increments sold count
 */
export async function finalizeTicketInventory(items: InventoryItemRequest[]) {
  if (!items || items.length === 0) return;

  return await prisma.$transaction(async (tx) => {
    for (const item of items) {
      const inv = await tx.ticketInventory.findUnique({
        where: { ticketTypeId: item.ticketTypeId },
      });

      if (inv) {
        const newReserved = Math.max(0, inv.reservedCount - item.quantity);
        await tx.ticketInventory.update({
          where: { id: inv.id },
          data: {
            reservedCount: newReserved,
            soldCount: { increment: item.quantity },
            version: { increment: 1 },
          },
        });
      }
    }
  });
}

/**
 * Periodic or on-demand cleanup of expired reservations to keep inventory accurate
 */
export async function cleanupExpiredReservations() {
  const now = new Date();

  // Find orders whose temporary reservation period has elapsed
  const expiredOrders = await prisma.order.findMany({
    where: {
      status: { in: [OrderStatus.CREATED, OrderStatus.PAYMENT_PENDING] },
      expiresAt: { lt: now },
    },
    include: {
      orderItems: true,
    },
  });

  let releasedCount = 0;

  for (const order of expiredOrders) {
    try {
      await prisma.$transaction(async (tx) => {
        // Mark order as expired / failed
        await tx.order.update({
          where: { id: order.id },
          data: { status: OrderStatus.PAYMENT_FAILED },
        });

        // Release reserved inventory
        for (const item of order.orderItems) {
          const inv = await tx.ticketInventory.findUnique({
            where: { ticketTypeId: item.ticketTypeId },
          });
          if (inv) {
            await tx.ticketInventory.update({
              where: { id: inv.id },
              data: {
                reservedCount: Math.max(0, inv.reservedCount - item.quantity),
                version: { increment: 1 },
              },
            });
          }
        }
      });
      releasedCount++;
    } catch (err) {
      console.error(`Failed to release expired order ${order.id}:`, err);
    }
  }

  return { expiredOrdersCount: releasedCount };
}
