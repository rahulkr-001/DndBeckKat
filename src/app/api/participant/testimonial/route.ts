import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth/session';
import { prisma } from '@/lib/prisma';
import { ScanResult, TicketStatus } from '@prisma/client';

export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    // Find all tickets belonging to this user that have been admitted
    const eligibleTickets = await prisma.ticket.findMany({
      where: {
        userId: user.id,
        OR: [
          { status: TicketStatus.USED },
          { scans: { some: { result: ScanResult.VALID } } },
        ],
      },
      include: {
        ticketType: true,
        order: {
          include: {
            event: { select: { id: true, title: true } },
          },
        },
      },
      orderBy: { updatedAt: 'desc' },
    });

    // Find any existing reviews submitted by this user
    const submittedReviews = await prisma.eventTestimonial.findMany({
      where: { userId: user.id },
      include: {
        ticket: { select: { id: true, ticketNumber: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({
      eligibleTickets,
      submittedReviews,
      canSubmit: eligibleTickets.length > 0,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Please log in to submit a review' }, { status: 401 });
    }

    const body = await req.json();
    const { ticketId, quote, rating, role, avatarUrl } = body;

    if (!ticketId || !quote || typeof quote !== 'string' || quote.trim().length < 5) {
      return NextResponse.json(
        { error: 'A valid ticket and review quote (minimum 5 characters) are required' },
        { status: 400 }
      );
    }

    const numRating = Math.max(1, Math.min(5, Number(rating) || 5));

    // 1. Fetch ticket and verify ownership and admitted status
    const ticket = await prisma.ticket.findUnique({
      where: { id: ticketId },
      include: {
        order: { include: { event: true } },
        scans: true,
      },
    });

    if (!ticket || ticket.userId !== user.id) {
      return NextResponse.json(
        { error: 'Ticket not found or does not belong to your account' },
        { status: 404 }
      );
    }

    // Check admission eligibility: must be USED or have a VALID entry scan
    const hasValidScan = ticket.scans.some((s) => s.result === ScanResult.VALID);
    const isAdmitted = ticket.status === TicketStatus.USED || hasValidScan;

    if (!isAdmitted) {
      return NextResponse.json(
        {
          error:
            'Only verified attendees whose ticket was scanned and admitted at the festival gate can submit reviews.',
        },
        { status: 403 }
      );
    }

    // 2. Prevent duplicate reviews for the same ticket
    const existing = await prisma.eventTestimonial.findFirst({
      where: { ticketId: ticket.id },
    });

    if (existing) {
      return NextResponse.json(
        {
          error: 'You have already submitted a review for this ticket. Each ticket permits one review.',
        },
        { status: 409 }
      );
    }

    // 3. Create the verified testimonial in PENDING moderation state
    const testimonial = await prisma.eventTestimonial.create({
      data: {
        eventId: ticket.order.eventId,
        userId: user.id,
        ticketId: ticket.id,
        name: user.name || ticket.attendeeName,
        role: role?.trim() || 'Verified Attendee',
        quote: quote.trim(),
        rating: numRating,
        avatarUrl: avatarUrl?.trim() || null,
        isVerified: true,
        moderationStatus: 'PENDING',
        isPublished: false, // Requires admin moderation approval
        orderIndex: 0,
      },
    });

    // Forensic audit log
    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: 'VERIFIED_TESTIMONIAL_SUBMITTED',
        resourceType: 'EventTestimonial',
        resourceId: testimonial.id,
        details: {
          ticketNumber: ticket.ticketNumber,
          rating: numRating,
          quote: quote.trim().slice(0, 100),
        },
      },
    });

    return NextResponse.json({
      success: true,
      message:
        'Thank you! Your verified attendee review has been submitted for moderation and will appear on the festival page once approved.',
      testimonial,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
