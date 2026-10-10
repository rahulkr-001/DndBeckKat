import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyEmailOtp } from '@/lib/auth/emailOtp';
import { createSession, SESSION_COOKIE_NAME } from '@/lib/auth/session';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { email, otp } = body;

    if (!email || !otp) {
      return NextResponse.json({ error: 'Email and OTP are required' }, { status: 400 });
    }

    const cleanEmail = email.toLowerCase().trim();

    // Verify OTP code
    const verification = await verifyEmailOtp(cleanEmail, otp);
    if (!verification.valid) {
      return NextResponse.json({ error: verification.error || 'Invalid OTP' }, { status: 401 });
    }

    // Find user by email
    const user = await prisma.user.findFirst({
      where: { email: cleanEmail },
      include: {
        adminRoles: { include: { role: true } },
      },
    });

    if (!user) {
      return NextResponse.json({ error: 'No user account found matching this email' }, { status: 404 });
    }

    if (!user.isActive) {
      return NextResponse.json({ error: 'Account has been deactivated' }, { status: 403 });
    }

    // Create session
    const ipAddress = req.headers.get('x-forwarded-for') || undefined;
    const userAgent = req.headers.get('user-agent') || undefined;
    const session = await createSession(user.id, userAgent, ipAddress);

    // Audit log
    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: 'LOGIN_SUCCESS_RESEND_OTP',
        resourceType: 'User',
        resourceId: user.id,
        details: { ip: ipAddress, role: user.role },
      },
    });

    const response = NextResponse.json({
      success: true,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
      },
    });

    response.cookies.set(SESSION_COOKIE_NAME, session.token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      expires: session.expiresAt,
    });

    return response;
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'OTP verification failed' }, { status: 500 });
  }
}
