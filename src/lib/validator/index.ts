import { prisma } from '../prisma';
import { ScanResult, TicketStatus } from '@prisma/client';

export interface TicketValidationParams {
  rawToken: string;
  expectedEventId?: string;
  staffUserId: string;
  gateName?: string;
  deviceInfo?: string;
  ipAddress?: string;
}

export interface TicketValidationResponse {
  result: ScanResult;
  message: string;
  admitted: boolean;
  ticket?: {
    ticketNumber: string;
    attendeeName: string;
    ticketCategory: string;
    tierName: string;
    orderNumber: string;
    usedAt?: Date | null;
  };
  previousScanInfo?: {
    scannedAt: Date;
    gateName?: string | null;
    staffName?: string | null;
  };
}

/**
 * Concurrency-Safe Atomic Gate Ticket Admission
 * Protects against simultaneous duplicate scans across multiple gates
 */
export async function validateTicketAtGate(
  params: TicketValidationParams
): Promise<TicketValidationResponse> {
  const { rawToken, expectedEventId, staffUserId, gateName, deviceInfo, ipAddress } = params;

  // Parse raw token which may be:
  // 1. JSON string e.g. {"token":"..."}, {"validationToken":"..."}, {"ticketNumber":"..."}
  // 2. URL e.g. https://domain.com/verify/TOKEN or /verify/TOKEN
  // 3. QR prefix e.g. DND-TKT:TOKEN
  // 4. Direct validationToken or ticketNumber
  let token = rawToken.trim();

  if (token.startsWith('{') && token.endsWith('}')) {
    try {
      const parsedJson = JSON.parse(token);
      token = parsedJson.token || parsedJson.validationToken || parsedJson.ticketNumber || parsedJson.id || token;
      token = String(token).trim();
    } catch {
      // not valid JSON, proceed with raw string
    }
  }

  // If payload is a full URL, extract the trailing path segment
  if (token.includes('/verify/')) {
    const parts = token.split('/verify/');
    token = parts[parts.length - 1].split('?')[0].trim();
  } else if (token.includes('/pdf/')) {
    const parts = token.split('/pdf/');
    token = parts[parts.length - 1].split('?')[0].trim();
  }

  // Clean prefix if QR contains DND-TKT:...
  token = token.replace(/^DND-TKT:/i, '').trim();

  // 1. Fetch ticket — try validationToken first (QR scan path), then ticketNumber (manual entry path)
  let ticket = await prisma.ticket.findUnique({
    where: { validationToken: token },
    include: {
      order: {
        include: { event: true },
      },
      ticketType: true,
      user: true,
      scans: {
        orderBy: { scannedAt: 'desc' },
        take: 1,
        include: { scannedByUser: true },
      },
    },
  });


  // Fallback: Try looking up by ticketNumber (supports manual entry like TKT-2026-784167)
  if (!ticket) {
    ticket = await prisma.ticket.findUnique({
      where: { ticketNumber: token },
      include: {
        order: {
          include: { event: true },
        },
        ticketType: true,
        user: true,
        scans: {
          orderBy: { scannedAt: 'desc' },
          take: 1,
          include: { scannedByUser: true },
        },
      },
    });
  }

  // Check 1: Invalid / Unknown Ticket
  if (!ticket) {
    return {
      result: ScanResult.INVALID,
      message: 'Invalid or unrecognized QR code. Ticket not found.',
      admitted: false,
    };
  }


  const ticketSummary = {
    ticketNumber: ticket.ticketNumber,
    attendeeName: ticket.attendeeName,
    ticketCategory: ticket.ticketType.category,
    tierName: ticket.ticketType.name,
    orderNumber: ticket.order.orderNumber,
    usedAt: ticket.usedAt,
  };

  // Check 2: Event Mismatch
  if (expectedEventId && ticket.order.eventId !== expectedEventId) {
    await prisma.ticketScan.create({
      data: {
        ticketId: ticket.id,
        scannedByUserId: staffUserId,
        result: ScanResult.WRONG_EVENT,
        gateName,
        deviceInfo,
        ipAddress,
      },
    });

    return {
      result: ScanResult.WRONG_EVENT,
      message: `Wrong Event. This pass is issued for "${ticket.order.event.title}".`,
      admitted: false,
      ticket: ticketSummary,
    };
  }

  // Check 3: Cancelled Ticket
  if (ticket.status === TicketStatus.CANCELLED) {
    await prisma.ticketScan.create({
      data: {
        ticketId: ticket.id,
        scannedByUserId: staffUserId,
        result: ScanResult.CANCELLED,
        gateName,
        deviceInfo,
        ipAddress,
      },
    });

    return {
      result: ScanResult.CANCELLED,
      message: 'This ticket has been cancelled and is invalid for entry.',
      admitted: false,
      ticket: ticketSummary,
    };
  }

  // Check 4: Refunded Ticket
  if (ticket.status === TicketStatus.REFUNDED) {
    await prisma.ticketScan.create({
      data: {
        ticketId: ticket.id,
        scannedByUserId: staffUserId,
        result: ScanResult.REFUNDED,
        gateName,
        deviceInfo,
        ipAddress,
      },
    });

    return {
      result: ScanResult.REFUNDED,
      message: 'This ticket was refunded and has been voided.',
      admitted: false,
      ticket: ticketSummary,
    };
  }

  // Check 5: Already Used Ticket
  if (ticket.status === TicketStatus.USED) {
    const lastScan = ticket.scans[0];
    await prisma.ticketScan.create({
      data: {
        ticketId: ticket.id,
        scannedByUserId: staffUserId,
        result: ScanResult.ALREADY_USED,
        gateName,
        deviceInfo,
        ipAddress,
      },
    });

    return {
      result: ScanResult.ALREADY_USED,
      message: `ALREADY USED! Ticket was previously scanned on ${ticket.usedAt?.toLocaleDateString()} at ${ticket.usedAt?.toLocaleTimeString()}${lastScan?.gateName ? ` (${lastScan.gateName})` : ''}.`,
      admitted: false,
      ticket: ticketSummary,
      previousScanInfo: lastScan
        ? {
            scannedAt: lastScan.scannedAt,
            gateName: lastScan.gateName,
            staffName: lastScan.scannedByUser?.name,
          }
        : undefined,
    };
  }

  // Check 6: ATOMIC ADMISSION ATTEMPT
  // Execute atomic conditional update to guarantee that if two staff members
  // scan the exact same ticket at the exact same millisecond, ONLY ONE succeeds!
  const now = new Date();
  const updateResult = await prisma.ticket.updateMany({
    where: {
      id: ticket.id,
      status: TicketStatus.ISSUED, // Must still be ISSUED
    },
    data: {
      status: TicketStatus.USED,
      usedAt: now,
      scannedByUserId: staffUserId,
    },
  });

  if (updateResult.count === 0) {
    // Race condition collision detected! Another staff member admitted it concurrently!
    await prisma.ticketScan.create({
      data: {
        ticketId: ticket.id,
        scannedByUserId: staffUserId,
        result: ScanResult.ALREADY_USED,
        gateName,
        deviceInfo,
        ipAddress,
      },
    });

    return {
      result: ScanResult.ALREADY_USED,
      message: 'CONCURRENT COLLISION: Ticket was admitted at another gate simultaneously!',
      admitted: false,
      ticket: ticketSummary,
    };
  }

  // Successfully and uniquely admitted
  await prisma.ticketScan.create({
    data: {
      ticketId: ticket.id,
      scannedByUserId: staffUserId,
      result: ScanResult.VALID,
      gateName,
      deviceInfo,
      ipAddress,
      scannedAt: now,
    },
  });

  return {
    result: ScanResult.VALID,
    message: `Entry Approved! Welcome ${ticket.attendeeName} to Dandiya Utsav!`,
    admitted: true,
    ticket: {
      ...ticketSummary,
      usedAt: now,
    },
  };
}
