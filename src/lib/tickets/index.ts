import crypto from 'crypto';
import { prisma } from '../prisma';
import { TicketStatus } from '@prisma/client';

export interface AttendeeInput {
  name: string;
  ticketTypeId: string;
}

const TICKET_SALT = process.env.TICKET_SECURITY_SALT || 'dandiya_secure_token_salt_2026';

/**
 * Cryptographic validation token generator
 * Creates an opaque, unguessable, signed HMAC-SHA256 validation token
 */
export function generateTicketValidationToken(ticketNumber: string, orderId: string, index: number): string {
  return crypto
    .createHmac('sha256', TICKET_SALT)
    .update(`${ticketNumber}:${orderId}:${index}:${crypto.randomBytes(16).toString('hex')}`)
    .digest('hex');
}

/**
 * Generate tickets for a verified order
 */
export async function generateTicketsForOrder(orderId: string, attendeeList?: AttendeeInput[]) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      orderItems: {
        include: { ticketType: true },
      },
      user: true,
      event: true,
      tickets: true,
    },
  });

  if (!order) {
    throw new Error(`Order ${orderId} does not exist`);
  }

  // Idempotency: If tickets already generated for this order, return existing
  if (order.tickets.length > 0) {
    return order.tickets;
  }

  const createdTickets = [];
  let attendeeIndex = 0;
  const currentYear = new Date().getFullYear();

  for (const item of order.orderItems) {
    for (let i = 0; i < item.quantity; i++) {
      const ticketSeq = Math.floor(100000 + Math.random() * 900000);
      const ticketNumber = `TKT-${currentYear}-${ticketSeq}`;
      const validationToken = generateTicketValidationToken(ticketNumber, order.id, attendeeIndex);

      const attendeeName =
        attendeeList && attendeeList[attendeeIndex]?.name
          ? attendeeList[attendeeIndex].name
          : attendeeIndex === 0
          ? order.customerName
          : `${order.customerName} (Guest ${i + 1})`;

      const ticket = await prisma.ticket.create({
        data: {
          ticketNumber,
          validationToken,
          orderId: order.id,
          userId: order.userId,
          ticketTypeId: item.ticketTypeId,
          attendeeName,
          status: TicketStatus.ISSUED,
          qrPayload: `DND-TKT:${validationToken}`,
          pdfUrl: `/api/tickets/pdf/${validationToken}`,
        },
        include: {
          ticketType: true,
        },
      });

      createdTickets.push(ticket);
      attendeeIndex++;
    }
  }

  return createdTickets;
}
