import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from './session';
import { Role } from '@prisma/client';

export interface AdminAuthResult {
  authorized: boolean;
  user?: any;
  response?: NextResponse;
}

export async function verifyAdminAuth(
  allowedRoles?: Role[]
): Promise<AdminAuthResult> {
  const user = await getCurrentUser();

  if (!user) {
    return {
      authorized: false,
      response: NextResponse.json(
        { error: 'Unauthorized: Administrative authentication required' },
        { status: 401 }
      ),
    };
  }

  // Check if role is an administrative role
  const adminRoles: Role[] = [
    Role.SUPER_ADMIN,
    Role.EVENT_ADMIN,
    Role.FINANCE_ADMIN,
    Role.VALIDATOR,
    Role.CONTENT_ADMIN,
  ];

  if (!adminRoles.includes(user.role)) {
    return {
      authorized: false,
      response: NextResponse.json(
        { error: 'Forbidden: Administrative privilege required' },
        { status: 403 }
      ),
    };
  }

  if (allowedRoles && allowedRoles.length > 0 && !allowedRoles.includes(user.role) && user.role !== Role.SUPER_ADMIN) {
    return {
      authorized: false,
      response: NextResponse.json(
        { error: `Forbidden: Requires one of [${allowedRoles.join(', ')}] role` },
        { status: 403 }
      ),
    };
  }

  return { authorized: true, user };
}
