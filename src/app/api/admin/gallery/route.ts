import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyAdminAuth } from '@/lib/auth/admin';
import { Role } from '@prisma/client';

export async function GET(req: NextRequest) {
  try {
    const auth = await verifyAdminAuth([Role.SUPER_ADMIN, Role.EVENT_ADMIN, Role.CONTENT_ADMIN]);
    if (!auth.authorized) return auth.response!;


    const galleries = await prisma.gallery.findMany({
      include: {
        images: { orderBy: { orderIndex: 'asc' } },
        event: { select: { id: true, title: true } },
      },
    });

    return NextResponse.json({ galleries });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await verifyAdminAuth([Role.SUPER_ADMIN, Role.EVENT_ADMIN, Role.CONTENT_ADMIN]);
    if (!auth.authorized) return auth.response!;

    const body = await req.json();
    let { galleryId, imageUrl, caption, altText, orderIndex } = body;

    if (!imageUrl) {
      return NextResponse.json({ error: 'Image URL is required' }, { status: 400 });
    }

    // If galleryId is not provided, find or create the default gallery for the published event
    if (!galleryId) {
      const activeEvent =
        (await prisma.event.findFirst({ where: { status: 'PUBLISHED' } })) ||
        (await prisma.event.findFirst());

      if (!activeEvent) {
        return NextResponse.json({ error: 'No event exists to link gallery to' }, { status: 400 });
      }

      let defaultGallery = await prisma.gallery.findFirst({
        where: { eventId: activeEvent.id },
      });

      if (!defaultGallery) {
        defaultGallery = await prisma.gallery.create({
          data: {
            eventId: activeEvent.id,
            title: 'Retrospective & Event Glimpses',
            slug: 'event-glimpses',
            description: 'Highlights and festive moments',
            isPublished: true,
          },
        });
      }

      galleryId = defaultGallery.id;
    }

    const image = await prisma.galleryImage.create({
      data: {
        galleryId,
        imageUrl,
        caption: caption || 'Dandiya Night 3.0 Festive Celebration',
        altText: altText || 'Dandiya Night Katoria Event Glimpse',
        orderIndex: orderIndex !== undefined ? Number(orderIndex) : 0,
        isPublished: true,
      },
    });

    // Forensic audit log
    await prisma.auditLog.create({
      data: {
        userId: auth.user.id,
        action: 'GALLERY_IMAGE_ADDED',
        resourceType: 'GalleryImage',
        resourceId: image.id,
        details: { galleryId, caption: image.caption },
      },
    });

    return NextResponse.json({ success: true, image });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const auth = await verifyAdminAuth([Role.SUPER_ADMIN, Role.EVENT_ADMIN, Role.CONTENT_ADMIN]);
    if (!auth.authorized) return auth.response!;

    const body = await req.json();
    const { id, caption, altText, orderIndex, isPublished } = body;

    if (!id) {
      return NextResponse.json({ error: 'Image ID is required' }, { status: 400 });
    }

    const updated = await prisma.galleryImage.update({
      where: { id },
      data: {
        caption: caption !== undefined ? caption : undefined,
        altText: altText !== undefined ? altText : undefined,
        orderIndex: orderIndex !== undefined ? Number(orderIndex) : undefined,
        isPublished: isPublished !== undefined ? Boolean(isPublished) : undefined,
      },
    });

    return NextResponse.json({ success: true, image: updated });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const auth = await verifyAdminAuth([Role.SUPER_ADMIN, Role.EVENT_ADMIN, Role.CONTENT_ADMIN]);
    if (!auth.authorized) return auth.response!;

    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'Image ID required' }, { status: 400 });

    await prisma.galleryImage.delete({ where: { id } });

    // Forensic audit log
    await prisma.auditLog.create({
      data: {
        userId: auth.user.id,
        action: 'GALLERY_IMAGE_DELETED',
        resourceType: 'GalleryImage',
        resourceId: id,
      },
    });

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}
