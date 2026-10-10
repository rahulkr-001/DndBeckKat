import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser, revokeSession, SESSION_COOKIE_NAME } from '@/lib/auth/session';
import { cookies } from 'next/headers';

export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ authenticated: false, user: null });
    }

    // Extract flat list of permissions
    const permissions: string[] = [];
    user.adminRoles?.forEach((ur) => {
      ur.role.permissions?.forEach((rp) => {
        if (!permissions.includes(rp.permission.code)) {
          permissions.push(rp.permission.code);
        }
      });
    });

    return NextResponse.json({
      authenticated: true,
      user: {
        id: user.id,
        phone: user.phone,
        email: user.email,
        name: user.name,
        role: user.role,
        permissions,
      },
    });
  } catch (err: any) {
    return NextResponse.json({ authenticated: false, error: err.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
    if (token) {
      await revokeSession(token);
    }

    const response = NextResponse.json({ success: true, message: 'Logged out successfully' });
    response.cookies.delete(SESSION_COOKIE_NAME);
    return response;
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
