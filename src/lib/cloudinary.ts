import { v2 as cloudinary } from 'cloudinary';

const apiKey = process.env.CLOUDINARY_API_KEY || '161257583932355';
const cloudName = process.env.CLOUDINARY_CLOUD_NAME || '';
const apiSecret = process.env.CLOUDINARY_API_SECRET || '';

cloudinary.config({
  cloud_name: cloudName,
  api_key: apiKey,
  api_secret: apiSecret,
  secure: true,
});

export { cloudinary };

/**
 * Uploads a buffer or base64 data string to Cloudinary securely.
 * Falls back to local/simulated URL if cloud credentials are mock/missing.
 */
export async function uploadToCloudinary(
  fileBuffer: Buffer,
  folder = 'dandiya_night_3',
  mimeType = 'image/jpeg'
): Promise<{ url: string; publicId: string; provider: 'cloudinary' | 'mock' }> {
  if (cloudName && apiSecret && apiSecret !== 'test_cloudinary_secret') {
    return new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          folder,
          resource_type: 'image',
          transformation: [{ quality: 'auto', fetch_format: 'auto' }],
        },
        (error, result) => {
          if (error || !result) {
            reject(error || new Error('Cloudinary upload returned empty response'));
          } else {
            resolve({
              url: result.secure_url,
              publicId: result.public_id,
              provider: 'cloudinary',
            });
          }
        }
      );
      uploadStream.end(fileBuffer);
    });
  }

  // Safe fallback mock URL for local/testing environment
  const mockId = `mock_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  return {
    url: `https://res.cloudinary.com/${cloudName || 'dandiya-utsav'}/image/upload/v1/${folder}/${mockId}.jpg`,
    publicId: `${folder}/${mockId}`,
    provider: 'mock',
  };
}
