import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { hashPassword, verifyPassword, validatePasswordStrength } from '@/lib/auth/password';
import { getCurrentUser } from '@/lib/auth/session';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { email, currentPassword, newPassword } = body;

    if (!email || !newPassword) {
      return NextResponse.json(
        { error: 'Email and new password are required' },
        { status: 400 }
      );
    }

    const strength = validatePasswordStrength(newPassword);
    if (!strength.valid) {
      return NextResponse.json({ error: strength.message }, { status: 400 });
    }

    const cleanEmail = email.trim().toLowerCase();
    const user = await prisma.user.findFirst({ where: { email: cleanEmail } });
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // If user already has a password, verify currentPassword unless authenticated as self
    const currentUser = await getCurrentUser();
    const isSelfAuthenticated = currentUser && currentUser.id === user.id;

    if (user.passwordHash && !isSelfAuthenticated) {
      if (!currentPassword) {
        return NextResponse.json(
          { error: 'Current password is required to change password' },
          { status: 400 }
        );
      }
      const isValid = await verifyPassword(currentPassword, user.passwordHash);
      if (!isValid) {
        return NextResponse.json(
          { error: 'Incorrect current password' },
          { status: 401 }
        );
      }
    }

    const hashedPassword = await hashPassword(newPassword);

    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: hashedPassword },
    });

    // Forensic audit log
    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: 'PASSWORD_RESET_SUCCESS',
        resourceType: 'User',
        resourceId: user.id,
      },
    });

    return NextResponse.json({ success: true, message: 'Password updated successfully. You may now log in.' });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Password update failed' }, { status: 500 });
  }
}
