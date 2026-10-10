import crypto from 'crypto';
import { prisma } from '../prisma';
import { sendOtpEmail } from '../email/resend';

export function generateNumericOtp(length = 6): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

export function hashOtp(otp: string): string {
  const salt = process.env.SESSION_SECRET || 'dandiya_auth_salt_raas_2026';
  return crypto.createHmac('sha256', salt).update(otp.trim()).digest('hex');
}

/**
 * Creates an OtpRequest entry for a given email/phone, generates a 6-digit OTP,
 * and sends it via Resend API.
 */
export async function createAndSendEmailOtp(
  email: string,
  name?: string,
  role = 'STAFF'
): Promise<{ success: boolean; error?: string; otpPreview?: string }> {
  try {
    const otp = generateNumericOtp(6);
    const otpHash = hashOtp(otp);
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    // Store in OtpRequest (using email in phone field or normalized identifier)
    await prisma.otpRequest.create({
      data: {
        phone: email.toLowerCase().trim(),
        otpHash,
        expiresAt,
        maxAttempts: 5,
        attempts: 0,
        isUsed: false,
      },
    });

    // Send email via Resend
    const emailResult = await sendOtpEmail({
      to: email,
      name,
      otp,
      role,
      purpose: 'INVITATION',
    });

    return {
      success: true,
      error: emailResult.error,
      otpPreview: process.env.NODE_ENV !== 'production' ? otp : undefined,
    };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

/**
 * Verifies the OTP submitted for an email.
 */
export async function verifyEmailOtp(
  email: string,
  enteredOtp: string
): Promise<{ valid: boolean; error?: string }> {
  const identifier = email.toLowerCase().trim();
  const latestOtpReq = await prisma.otpRequest.findFirst({
    where: {
      phone: identifier,
      isUsed: false,
      expiresAt: { gt: new Date() },
    },
    orderBy: { createdAt: 'desc' },
  });

  if (!latestOtpReq) {
    return { valid: false, error: 'No active OTP request found or code has expired' };
  }

  if (latestOtpReq.attempts >= latestOtpReq.maxAttempts) {
    return { valid: false, error: 'Maximum verification attempts exceeded. Request a new OTP.' };
  }

  const matches = hashOtp(enteredOtp) === latestOtpReq.otpHash;

  await prisma.otpRequest.update({
    where: { id: latestOtpReq.id },
    data: {
      attempts: latestOtpReq.attempts + 1,
      isUsed: matches ? true : latestOtpReq.isUsed,
    },
  });

  if (!matches) {
    return { valid: false, error: 'Invalid verification code' };
  }

  return { valid: true };
}
