import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { hashPassword, validatePasswordStrength } from '@/lib/auth/password';
import { createSession, SESSION_COOKIE_NAME } from '@/lib/auth/session';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { email, password, name, phone } = body;

    if (!email || !password) {
      return NextResponse.json({ error: 'Email and password are required' }, { status: 400 });
    }

    const cleanEmail = email.toLowerCase().trim();
    const cleanPhone = phone ? phone.trim() : `email-${Date.now()}`;

    // Validate password strength
    const strength = validatePasswordStrength(password);
    if (!strength.valid) {
      return NextResponse.json({ error: strength.message }, { status: 400 });
    }

    // Check if email already registered with password
    const existingEmail = await prisma.user.findFirst({
      where: { email: cleanEmail },
    });

    if (existingEmail && existingEmail.passwordHash) {
      return NextResponse.json(
        { error: 'An account with this email already exists. Please log in.' },
        { status: 409 }
      );
    }

    const hashedPassword = await hashPassword(password);

    let user;
    if (existingEmail) {
      // User existed via OTP or ticket creation, attach password
      user = await prisma.user.update({
        where: { id: existingEmail.id },
        data: {
          passwordHash: hashedPassword,
          name: name || existingEmail.name,
          phone: phone ? cleanPhone : existingEmail.phone,
        },
      });
    } else {
      user = await prisma.user.create({
        data: {
          email: cleanEmail,
          passwordHash: hashedPassword,
          name: name || cleanEmail.split('@')[0],
          phone: cleanPhone,
        },
      });
    }

    // Create session
    const ipAddress = req.headers.get('x-forwarded-for') || undefined;
    const userAgent = req.headers.get('user-agent') || undefined;
    const session = await createSession(user.id, userAgent, ipAddress);

    // Audit log
    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: 'USER_REGISTERED_EMAIL',
        resourceType: 'User',
        resourceId: user.id,
        details: { email: cleanEmail },
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
    return NextResponse.json({ error: err.message || 'Registration failed' }, { status: 500 });
  }
}
