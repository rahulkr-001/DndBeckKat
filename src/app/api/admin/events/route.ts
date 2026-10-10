import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyAdminAuth } from '@/lib/auth/admin';
import { Role, EventStatus } from '@prisma/client';
import { z } from 'zod';

const CreateEventSchema = z.object({
  title: z.string().min(3, 'Event title must be at least 3 characters'),
  slug: z.string().min(3, 'Slug must be at least 3 characters'),
  tagline: z.string().optional(),
  description: z.string().min(10, 'Description must be at least 10 characters'),
  startDate: z.string().or(z.date()),
  endDate: z.string().or(z.date()),
  doorsOpenTime: z.string().optional(),
  heroImageUrl: z.string().url('Hero image must be a valid URL'),
  heroVideoUrl: z.string().optional(),
  status: z.nativeEnum(EventStatus).optional().default(EventStatus.DRAFT),
  venueId: z.string().optional(),
  organizerId: z.string().optional(),
  termsAndConditions: z.string().optional(),
  refundPolicy: z.string().optional(),
});

export async function GET(req: NextRequest) {
  try {
    const auth = await verifyAdminAuth([Role.SUPER_ADMIN, Role.EVENT_ADMIN, Role.CONTENT_ADMIN]);
    if (!auth.authorized) return auth.response!;


    const { searchParams } = new URL(req.url);
    const search = searchParams.get('search')?.trim();
    const status = searchParams.get('status') as EventStatus | null;

    const where: any = {};
    if (status) {
      where.status = status;
    }
    if (search) {
      where.OR = [
        { title: { contains: search, mode: 'insensitive' } },
        { slug: { contains: search, mode: 'insensitive' } },
        { tagline: { contains: search, mode: 'insensitive' } },
      ];
    }

    const events = await prisma.event.findMany({
      where,
      include: {
        venue: true,
        organizer: true,
        ticketTypes: {
          include: { inventory: true },
        },
        faqs: true,
        galleries: { include: { images: true } },
      },
      orderBy: { startDate: 'asc' },
    });

    return NextResponse.json({ events });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await verifyAdminAuth([Role.SUPER_ADMIN, Role.EVENT_ADMIN]);
    if (!auth.authorized) return auth.response!;

    const body = await req.json();
    const parsed = CreateEventSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || 'Invalid event payload' },
        { status: 400 }
      );
    }

    const data = parsed.data;
    const cleanSlug = data.slug.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-');

    // Duplicate slug check
    const existingSlug = await prisma.event.findUnique({
      where: { slug: cleanSlug },
    });

    if (existingSlug) {
      return NextResponse.json(
        { error: `An event with slug "${cleanSlug}" already exists. Please choose a unique slug.` },
        { status: 409 }
      );
    }

    // Default venue and organizer fallback if not provided
    let venueId = data.venueId;
    if (!venueId) {
      const defaultVenue = await prisma.venue.findFirst();
      if (!defaultVenue) {
        return NextResponse.json({ error: 'No venue available. Please create a venue first.' }, { status: 400 });
      }
      venueId = defaultVenue.id;
    }

    let organizerId = data.organizerId;
    if (!organizerId) {
      const defaultOrg = await prisma.organizer.findFirst();
      if (!defaultOrg) {
        return NextResponse.json({ error: 'No organizer available. Please create an organizer first.' }, { status: 400 });
      }
      organizerId = defaultOrg.id;
    }

    const newEvent = await prisma.event.create({
      data: {
        title: data.title,
        slug: cleanSlug,
        tagline: data.tagline,
        description: data.description,
        startDate: new Date(data.startDate),
        endDate: new Date(data.endDate),
        doorsOpenTime: data.doorsOpenTime || '06:00 PM IST',
        heroImageUrl: data.heroImageUrl,
        heroVideoUrl: data.heroVideoUrl,
        status: data.status,
        venueId,
        organizerId,
        termsAndConditions: data.termsAndConditions,
        refundPolicy: data.refundPolicy,
      },
      include: {
        venue: true,
        organizer: true,
      },
    });

    // Forensic audit log
    await prisma.auditLog.create({
      data: {
        userId: auth.user.id,
        action: 'EVENT_CREATED',
        resourceType: 'Event',
        resourceId: newEvent.id,
        details: { title: newEvent.title, slug: newEvent.slug },
      },
    });

    return NextResponse.json({ success: true, event: newEvent });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const auth = await verifyAdminAuth([Role.SUPER_ADMIN, Role.EVENT_ADMIN]);
    if (!auth.authorized) return auth.response!;

    const body = await req.json();
    const {
      id,
      title,
      slug,
      tagline,
      description,
      heroImageUrl,
      heroVideoUrl,
      status,
      startDate,
      endDate,
      doorsOpenTime,
      termsAndConditions,
      refundPolicy,
      whatsappGroupUrl,
      whatsappGroupTitle,
      whatsappGroupDesc,
      whatsappEnabled,
      instructions,
    } = body;

    if (!id) {
      return NextResponse.json({ error: 'Event ID is required for updating' }, { status: 400 });
    }

    // Check slug uniqueness if slug is being updated
    if (slug) {
      const cleanSlug = slug.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-');
      const conflict = await prisma.event.findFirst({
        where: { slug: cleanSlug, id: { not: id } },
      });
      if (conflict) {
        return NextResponse.json({ error: `Slug "${cleanSlug}" is already in use by another event` }, { status: 409 });
      }
    }

    const updated = await prisma.event.update({
      where: { id },
      data: {
        title,
        slug: slug ? slug.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-') : undefined,
        tagline,
        description,
        heroImageUrl,
        heroVideoUrl,
        status: status as EventStatus,
        startDate: startDate ? new Date(startDate) : undefined,
        endDate: endDate ? new Date(endDate) : undefined,
        doorsOpenTime,
        termsAndConditions,
        refundPolicy,
        whatsappGroupUrl: whatsappGroupUrl !== undefined ? whatsappGroupUrl : undefined,
        whatsappGroupTitle: whatsappGroupTitle !== undefined ? whatsappGroupTitle : undefined,
        whatsappGroupDesc: whatsappGroupDesc !== undefined ? whatsappGroupDesc : undefined,
        whatsappEnabled: whatsappEnabled !== undefined ? Boolean(whatsappEnabled) : undefined,
        instructions: instructions !== undefined ? instructions : undefined,
      },
      include: {
        venue: true,
        organizer: true,
        ticketTypes: { include: { inventory: true } },
      },
    });

    // Forensic audit log
    await prisma.auditLog.create({
      data: {
        userId: auth.user.id,
        action: 'EVENT_UPDATED',
        resourceType: 'Event',
        resourceId: updated.id,
        details: { title: updated.title, status: updated.status },
      },
    });

    return NextResponse.json({ success: true, event: updated });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}
