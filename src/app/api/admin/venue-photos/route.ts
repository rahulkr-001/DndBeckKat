import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyAdminAuth } from '@/lib/auth/admin';
import { Role } from '@prisma/client';
import { z } from 'zod';

const CreateVenuePhotoSchema = z.object({
  venueId: z.string().min(1, 'Venue ID is required'),
  imageUrl: z.string().url('Image must be a valid URL'),
  storageProvider: z.string().default('cloudinary'),
  storageAssetId: z.string().optional(),
  title: z.string().optional(),
  caption: z.string().optional(),
  altText: z.string().optional(),
  orderIndex: z.number().int().default(0),
  isFeatured: z.boolean().default(false),
  isPublished: z.boolean().default(true),
});

const UpdateVenuePhotoSchema = z.object({
  id: z.string().min(1, 'Photo ID is required'),
  title: z.string().optional(),
  caption: z.string().optional(),
  altText: z.string().optional(),
  orderIndex: z.number().int().optional(),
  isFeatured: z.boolean().optional(),
  isPublished: z.boolean().optional(),
});

// GET: Retrieve all photos for a venue
export async function GET(req: NextRequest) {
  try {
    const auth = await verifyAdminAuth([Role.SUPER_ADMIN, Role.EVENT_ADMIN, Role.CONTENT_ADMIN]);
    if (!auth.authorized) return auth.response!;

    const { searchParams } = new URL(req.url);
    let venueId = searchParams.get('venueId');

    if (!venueId) {
      const defaultVenue = await prisma.venue.findFirst();
      if (!defaultVenue) {
        return NextResponse.json({ photos: [], venue: null });
      }
      venueId = defaultVenue.id;
    }

    const venue = await prisma.venue.findUnique({
      where: { id: venueId },
      include: {
        photos: {
          orderBy: [{ orderIndex: 'asc' }, { createdAt: 'desc' }],
        },
      },
    });

    if (!venue) {
      return NextResponse.json({ error: 'Venue not found' }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      venue: {
        id: venue.id,
        name: venue.name,
        address: venue.address,
        city: venue.city,
      },
      photos: venue.photos,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || 'Failed to fetch venue photos' },
      { status: 500 }
    );
  }
}

// POST: Add new venue photo
export async function POST(req: NextRequest) {
  try {
    const auth = await verifyAdminAuth([Role.SUPER_ADMIN, Role.EVENT_ADMIN, Role.CONTENT_ADMIN]);
    if (!auth.authorized) return auth.response!;

    const body = await req.json();
    const parsed = CreateVenuePhotoSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || 'Invalid venue photo payload' },
        { status: 400 }
      );
    }

    const {
      venueId,
      imageUrl,
      storageProvider,
      storageAssetId,
      title,
      caption,
      altText,
      orderIndex,
      isFeatured,
      isPublished,
    } = parsed.data;

    // Verify venue exists
    const venue = await prisma.venue.findUnique({ where: { id: venueId } });
    if (!venue) {
      return NextResponse.json({ error: `Venue ${venueId} does not exist` }, { status: 404 });
    }

    // If marked as featured, unset any existing featured photos for this venue
    if (isFeatured) {
      await prisma.venuePhoto.updateMany({
        where: { venueId, isFeatured: true },
        data: { isFeatured: false },
      });
    }

    const photo = await prisma.venuePhoto.create({
      data: {
        venueId,
        imageUrl,
        storageProvider,
        storageAssetId,
        title,
        caption,
        altText: altText || title || venue.name,
        orderIndex,
        isFeatured,
        isPublished,
      },
    });

    // Audit log
    await prisma.auditLog.create({
      data: {
        userId: auth.user.id,
        action: 'VENUE_PHOTO_ADDED',
        resourceType: 'VenuePhoto',
        resourceId: photo.id,
        details: { venueId, imageUrl, title },
      },
    });

    return NextResponse.json({
      success: true,
      message: 'Venue photo successfully added',
      photo,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || 'Failed to add venue photo' },
      { status: 500 }
    );
  }
}

// PUT: Update venue photo metadata / reorder / featured
export async function PUT(req: NextRequest) {
  try {
    const auth = await verifyAdminAuth([Role.SUPER_ADMIN, Role.EVENT_ADMIN, Role.CONTENT_ADMIN]);
    if (!auth.authorized) return auth.response!;

    const body = await req.json();
    const parsed = UpdateVenuePhotoSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || 'Invalid photo update payload' },
        { status: 400 }
      );
    }

    const { id, title, caption, altText, orderIndex, isFeatured, isPublished } = parsed.data;

    const existingPhoto = await prisma.venuePhoto.findUnique({ where: { id } });
    if (!existingPhoto) {
      return NextResponse.json({ error: 'Venue photo not found' }, { status: 404 });
    }

    // If setting to featured, unset others for this venue
    if (isFeatured) {
      await prisma.venuePhoto.updateMany({
        where: { venueId: existingPhoto.venueId, id: { not: id }, isFeatured: true },
        data: { isFeatured: false },
      });
    }

    const updatedPhoto = await prisma.venuePhoto.update({
      where: { id },
      data: {
        title: title !== undefined ? title : undefined,
        caption: caption !== undefined ? caption : undefined,
        altText: altText !== undefined ? altText : undefined,
        orderIndex: orderIndex !== undefined ? orderIndex : undefined,
        isFeatured: isFeatured !== undefined ? isFeatured : undefined,
        isPublished: isPublished !== undefined ? isPublished : undefined,
      },
    });

    return NextResponse.json({
      success: true,
      message: 'Venue photo updated',
      photo: updatedPhoto,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || 'Failed to update venue photo' },
      { status: 500 }
    );
  }
}

// DELETE: Remove venue photo
export async function DELETE(req: NextRequest) {
  try {
    const auth = await verifyAdminAuth([Role.SUPER_ADMIN, Role.EVENT_ADMIN]);
    if (!auth.authorized) return auth.response!;

    const { searchParams } = new URL(req.url);
    let id = searchParams.get('id');

    if (!id) {
      const body = await req.json().catch(() => ({}));
      id = body?.id;
    }

    if (!id) {
      return NextResponse.json({ error: 'Photo ID is required' }, { status: 400 });
    }

    const photo = await prisma.venuePhoto.findUnique({ where: { id } });
    if (!photo) {
      return NextResponse.json({ error: 'Photo not found' }, { status: 404 });
    }

    await prisma.venuePhoto.delete({ where: { id } });

    // Audit log
    await prisma.auditLog.create({
      data: {
        userId: auth.user.id,
        action: 'VENUE_PHOTO_DELETED',
        resourceType: 'VenuePhoto',
        resourceId: id,
        details: { venueId: photo.venueId, imageUrl: photo.imageUrl },
      },
    });

    return NextResponse.json({
      success: true,
      message: 'Venue photo deleted successfully',
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || 'Failed to delete venue photo' },
      { status: 500 }
    );
  }
}
