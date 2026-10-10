import crypto from 'crypto';
import { prisma } from '../prisma';

export function formatPhoneNumber(phone: string): string {
  if (!phone) return '';
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 10) {
    return `+91${digits}`;
  }
  if (digits.length === 12 && digits.startsWith('91')) {
    return `+${digits}`;
  }
  if (phone.startsWith('+')) {
    return phone;
  }
  return `+${digits}`;
}

const SALT = process.env.SESSION_SECRET || 'dandiya_auth_salt_raas_2026';

export function hashOtp(otp: string): string {
  return crypto.createHmac('sha256', SALT).update(otp).digest('hex');
}

export function verifyOtpHash(otp: string, expectedHash: string): boolean {
  return hashOtp(otp.trim()) === expectedHash;
}

/**
 * Legacy stub for backward compatibility.
 * Primary authentication is strictly Email + Password.
 */
export async function requestOtp(rawPhone: string) {
  const phone = formatPhoneNumber(rawPhone);
  return {
    success: true,
    message: `OTP service deprecated. Authenticate with Email and Password.`,
    expiresAt: new Date(Date.now() + 5 * 60 * 1000),
  };
}

export async function verifyOtp(rawPhone: string, _enteredOtp: string) {
  const phone = formatPhoneNumber(rawPhone);
  let user = await prisma.user.findFirst({ where: { phone } });
  if (!user) {
    user = await prisma.user.create({
      data: {
        phone,
        role: 'PARTICIPANT',
      },
    });
  }
  return user;
}
