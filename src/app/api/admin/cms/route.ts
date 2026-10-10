import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyAdminAuth } from '@/lib/auth/admin';
import { Role } from '@prisma/client';

export async function GET(req: NextRequest) {
  try {
    const auth = await verifyAdminAuth([Role.SUPER_ADMIN, Role.EVENT_ADMIN, Role.CONTENT_ADMIN]);
    if (!auth.authorized) return auth.response!;


    const event = await prisma.event.findFirst({
      where: { status: 'PUBLISHED' },
      include: {
        story: true,
        highlights: { orderBy: { orderIndex: 'asc' } },
        schedules: { orderBy: { orderIndex: 'asc' } },
        testimonials: {
          include: {
            user: { select: { id: true, name: true, phone: true } },
            ticket: { select: { id: true, ticketNumber: true, status: true } },
          },
          orderBy: { createdAt: 'desc' },
        },
        teamMembers: { orderBy: { orderIndex: 'asc' } },
        sponsors: { orderBy: { orderIndex: 'asc' } },
        videos: { orderBy: { orderIndex: 'asc' } },
      },
    });

    if (!event) {
      return NextResponse.json({ error: 'No published event found' }, { status: 404 });
    }

    return NextResponse.json({
      cms: {
        eventId: event.id,
        story: event.story,
        highlights: event.highlights,
        schedules: event.schedules,
        testimonials: event.testimonials,
        teamMembers: event.teamMembers,
        sponsors: event.sponsors,
        videos: event.videos,
      },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await verifyAdminAuth([Role.SUPER_ADMIN, Role.EVENT_ADMIN, Role.CONTENT_ADMIN]);
    if (!auth.authorized) return auth.response!;

    const body = await req.json();
    const { section, data } = body;

    const event = await prisma.event.findFirst({ where: { status: 'PUBLISHED' } }) ||
                  await prisma.event.findFirst();

    if (!event) {
      return NextResponse.json({ error: 'No event found' }, { status: 400 });
    }

    const eventId = data?.eventId || event.id;

    let result: any = null;

    switch (section) {
      case 'story': {
        result = await prisma.eventStory.upsert({
          where: { eventId },
          update: {
            badge: data.badge,
            heading: data.heading,
            story: data.story,
            highlightOne: data.highlightOne,
            highlightTwo: data.highlightTwo,
            imageOneUrl: data.imageOneUrl,
            imageTwoUrl: data.imageTwoUrl,
          },
          create: {
            eventId,
            badge: data.badge,
            heading: data.heading,
            story: data.story,
            highlightOne: data.highlightOne,
            highlightTwo: data.highlightTwo,
            imageOneUrl: data.imageOneUrl,
            imageTwoUrl: data.imageTwoUrl,
          },
        });
        break;
      }
      case 'highlight': {
        result = await prisma.eventHighlight.create({
          data: {
            eventId,
            title: data.title,
            description: data.description,
            iconName: data.iconName || 'Sparkles',
            badge: data.badge,
            orderIndex: data.orderIndex || 0,
            isActive: data.isActive ?? true,
          },
        });
        break;
      }
      case 'schedule': {
        result = await prisma.eventSchedule.create({
          data: {
            eventId,
            time: data.time,
            title: data.title,
            description: data.description,
            orderIndex: data.orderIndex || 0,
            isActive: data.isActive ?? true,
          },
        });
        break;
      }
      case 'testimonial': {
        result = await prisma.eventTestimonial.create({
          data: {
            eventId,
            name: data.name,
            role: data.role,
            quote: data.quote,
            rating: data.rating || 5,
            avatarUrl: data.avatarUrl,
            isFeatured: data.isFeatured ?? false,
            isPublished: data.isPublished ?? true,
            orderIndex: data.orderIndex || 0,
          },
        });
        break;
      }
      case 'team': {
        result = await prisma.teamMember.create({
          data: {
            eventId,
            name: data.name,
            role: data.role,
            bio: data.bio,
            imageUrl: data.imageUrl,
            socialLinks: data.socialLinks || {},
            orderIndex: data.orderIndex || 0,
            isPublished: data.isPublished ?? true,
          },
        });
        break;
      }
      case 'sponsor': {
        result = await prisma.sponsor.create({
          data: {
            eventId,
            name: data.name,
            tier: data.tier || 'POWERED_BY',
            logoUrl: data.logoUrl,
            websiteUrl: data.websiteUrl,
            description: data.description || null,
            isFeatured: data.isFeatured ?? false,
            socialLinks: data.socialLinks || {},
            orderIndex: data.orderIndex || 0,
            isPublished: data.isPublished ?? true,
          },
        });
        break;
      }
      case 'video': {
        result = await prisma.eventVideo.create({
          data: {
            eventId,
            title: data.title,
            description: data.description,
            videoUrl: data.videoUrl,
            thumbnailUrl: data.thumbnailUrl,
            isFeatured: data.isFeatured ?? false,
            isPublished: data.isPublished ?? true,
            orderIndex: data.orderIndex || 0,
          },
        });
        break;
      }
      default:
        return NextResponse.json({ error: `Invalid CMS section "${section}"` }, { status: 400 });
    }

    // Forensic audit log
    await prisma.auditLog.create({
      data: {
        userId: auth.user.id,
        action: `CMS_${section.toUpperCase()}_CREATED`,
        resourceType: 'CMS',
        resourceId: result.id,
        details: { section, name: data.title || data.name || data.heading },
      },
    });

    return NextResponse.json({ success: true, result });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const auth = await verifyAdminAuth([Role.SUPER_ADMIN, Role.EVENT_ADMIN, Role.CONTENT_ADMIN]);
    if (!auth.authorized) return auth.response!;

    const body = await req.json();
    const { section, id, data } = body;

    if (!section || !id) {
      return NextResponse.json({ error: 'Section and ID are required' }, { status: 400 });
    }

    let result: any = null;

    switch (section) {
      case 'highlight':
        result = await prisma.eventHighlight.update({ where: { id }, data });
        break;
      case 'schedule':
        result = await prisma.eventSchedule.update({ where: { id }, data });
        break;
      case 'testimonial':
        result = await prisma.eventTestimonial.update({ where: { id }, data });
        break;
      case 'team':
        result = await prisma.teamMember.update({ where: { id }, data });
        break;
      case 'sponsor':
        result = await prisma.sponsor.update({ where: { id }, data });
        break;
      case 'video':
        result = await prisma.eventVideo.update({ where: { id }, data });
        break;
      default:
        return NextResponse.json({ error: `Invalid CMS section "${section}"` }, { status: 400 });
    }

    return NextResponse.json({ success: true, result });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const auth = await verifyAdminAuth([Role.SUPER_ADMIN, Role.EVENT_ADMIN, Role.CONTENT_ADMIN]);
    if (!auth.authorized) return auth.response!;

    const { searchParams } = new URL(req.url);
    const section = searchParams.get('section');
    const id = searchParams.get('id');

    if (!section || !id) {
      return NextResponse.json({ error: 'Section and ID parameters are required' }, { status: 400 });
    }

    switch (section) {
      case 'highlight':
        await prisma.eventHighlight.delete({ where: { id } });
        break;
      case 'schedule':
        await prisma.eventSchedule.delete({ where: { id } });
        break;
      case 'testimonial':
        await prisma.eventTestimonial.delete({ where: { id } });
        break;
      case 'team':
        await prisma.teamMember.delete({ where: { id } });
        break;
      case 'sponsor':
        await prisma.sponsor.delete({ where: { id } });
        break;
      case 'video':
        await prisma.eventVideo.delete({ where: { id } });
        break;
      default:
        return NextResponse.json({ error: `Invalid CMS section "${section}"` }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}
