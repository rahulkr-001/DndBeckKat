import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { Role } from '@prisma/client';
import { formatPhoneNumber } from '@/lib/auth/otp';
import { verifyAdminAuth } from '@/lib/auth/admin';
import { createAndSendEmailOtp } from '@/lib/auth/emailOtp';

export async function GET(req: NextRequest) {
  try {
    const auth = await verifyAdminAuth([Role.SUPER_ADMIN]);
    if (!auth.authorized) return auth.response!;


    const staffUsers = await prisma.user.findMany({
      where: {
        role: { in: [Role.SUPER_ADMIN, Role.EVENT_ADMIN, Role.FINANCE_ADMIN, Role.VALIDATOR, Role.CONTENT_ADMIN] },
      },
      include: {
        adminRoles: { include: { role: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    const roles = await prisma.adminRole.findMany({
      include: { permissions: { include: { permission: true } } },
    });

    return NextResponse.json({ staffUsers, roles });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await verifyAdminAuth([Role.SUPER_ADMIN]);
    if (!auth.authorized) return auth.response!;

    const body = await req.json();
    const { phone, name, email, role } = body;

    if (!role) {
      return NextResponse.json({ error: 'Role is required' }, { status: 400 });
    }

    if (!email && !phone) {
      return NextResponse.json({ error: 'Either email or mobile number is required' }, { status: 400 });
    }

    const cleanEmail = email ? email.toLowerCase().trim() : null;
    const formattedPhone = phone ? formatPhoneNumber(phone) : `+91${Math.floor(1000000000 + Math.random() * 9000000000)}`;

    // Upsert user by phone or email
    let user;
    if (cleanEmail) {
      user = await prisma.user.findFirst({
        where: { email: cleanEmail },
      });
    }

    if (!user && phone) {
      user = await prisma.user.findFirst({
        where: { phone: formattedPhone },
      });
    }

    if (user) {
      user = await prisma.user.update({
        where: { id: user.id },
        data: {
          name: name || user.name,
          email: cleanEmail || user.email,
          role: role as Role,
        },
      });
    } else {
      user = await prisma.user.create({
        data: {
          phone: formattedPhone,
          name: name || 'Team Member',
          email: cleanEmail,
          role: role as Role,
        },
      });
    }

    // Link corresponding admin role
    const matchingRole = await prisma.adminRole.findUnique({
      where: { name: role },
    });

    if (matchingRole) {
      await prisma.userAdminRole.upsert({
        where: {
          userId_roleId: {
            userId: user.id,
            roleId: matchingRole.id,
          },
        },
        update: {},
        create: {
          userId: user.id,
          roleId: matchingRole.id,
        },
      });
    }

    // Trigger Resend email OTP invitation workflow
    let otpSent = false;
    let otpError = null;
    let otpPreview = undefined;

    if (cleanEmail) {
      const otpRes = await createAndSendEmailOtp(cleanEmail, name || 'Team Member', role);
      otpSent = otpRes.success;
      otpError = otpRes.error;
      otpPreview = otpRes.otpPreview;
    }

    // Forensic audit log
    await prisma.auditLog.create({
      data: {
        userId: auth.user.id,
        action: 'STAFF_ROLE_ASSIGNED_WITH_RESEND_OTP',
        resourceType: 'User',
        resourceId: user.id,
        details: { phone: formattedPhone, email: cleanEmail, role, otpSent },
      },
    });

    return NextResponse.json({
      success: true,
      user,
      otpWorkflow: {
        triggered: Boolean(cleanEmail),
        sent: otpSent,
        error: otpError,
        otpPreview,
      },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}
