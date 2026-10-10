import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminAuth } from '@/lib/auth/admin';
import { Role } from '@prisma/client';
import { uploadToCloudinary } from '@/lib/cloudinary';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

// Max file size: 10MB
const MAX_FILE_SIZE = 10 * 1024 * 1024;
const ALLOWED_MIME_TYPES: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
};

export async function POST(req: NextRequest) {
  try {
    const auth = await verifyAdminAuth([Role.SUPER_ADMIN, Role.EVENT_ADMIN, Role.CONTENT_ADMIN]);
    if (!auth.authorized) return auth.response!;

    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const folder = (formData.get('folder') as string) || 'dandiya_gallery';

    if (!file) {
      return NextResponse.json({ error: 'No image file provided' }, { status: 400 });
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: 'File exceeds maximum limit of 10MB. Please choose a smaller image.' },
        { status: 400 }
      );
    }

    const mimeType = file.type.toLowerCase();
    const extension = ALLOWED_MIME_TYPES[mimeType];

    if (!extension) {
      return NextResponse.json(
        { error: 'Unsupported file format. Please upload JPEG, PNG, WEBP, or GIF.' },
        { status: 400 }
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());

    // Magic number header validation
    const isJpeg = buffer[0] === 0xff && buffer[1] === 0xd8;
    const isPng = buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47;
    const isGif = buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46;
    const isWebp =
      buffer[0] === 0x52 &&
      buffer[1] === 0x49 &&
      buffer[2] === 0x46 &&
      buffer[3] === 0x46 &&
      buffer[8] === 0x57 &&
      buffer[9] === 0x45 &&
      buffer[10] === 0x42 &&
      buffer[11] === 0x50;

    if (!isJpeg && !isPng && !isGif && !isWebp) {
      return NextResponse.json(
        { error: 'Invalid image signature. The uploaded file is not a valid image.' },
        { status: 400 }
      );
    }

    // Try Cloudinary upload via official helper
    try {
      const uploadResult = await uploadToCloudinary(buffer, folder, mimeType);
      return NextResponse.json({
        success: true,
        url: uploadResult.url,
        publicId: uploadResult.publicId,
        provider: uploadResult.provider,
      });
    } catch (cloudErr: any) {
      console.warn('Cloudinary upload warning:', cloudErr.message);

      // Safe fallback: Local secure storage in /public/uploads/gallery/
      const uploadDir = path.join(process.cwd(), 'public', 'uploads', 'gallery');
      if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
      }

      const safeRandomName = `dandiya_${Date.now()}_${crypto.randomBytes(6).toString('hex')}${extension}`;
      const filePath = path.join(uploadDir, safeRandomName);
      fs.writeFileSync(filePath, buffer);

      return NextResponse.json({
        success: true,
        url: `/uploads/gallery/${safeRandomName}`,
        provider: 'local',
      });
    }
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Image upload failed' }, { status: 500 });
  }
}
