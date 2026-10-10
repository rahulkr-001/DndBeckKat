import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyPassword } from '@/lib/auth/password';
import {
createSession,
SESSION_COOKIE_NAME,
} from '@/lib/auth/session';
const ALLOWED_ORIGIN =
process.env.CORS_ORIGIN ||
'https://dandiyanightkatoria.vercel.app';
const ALLOWED_HEADERS =
'Content-Type, Authorization, X-CSRF-Token, X-Requested-With';
function addCorsHeaders(response: NextResponse): NextResponse {
response.headers.set(
'Access-Control-Allow-Origin',
ALLOWED_ORIGIN,
);
response.headers.set(
'Access-Control-Allow-Credentials',
'true',
);
response.headers.set(
'Access-Control-Allow-Methods',
'GET, POST, PUT, PATCH, DELETE, OPTIONS',
);
response.headers.set(
'Access-Control-Allow-Headers',
ALLOWED_HEADERS,
);
response.headers.set('Vary', 'Origin');
return response;
}
// Handle browser CORS preflight requests.
export async function OPTIONS() {
return addCorsHeaders(
new NextResponse(null, { status: 204 }),
);
}
export async function POST(req: NextRequest) {
try {
const body = await req.json();
const inputEmail = body.email || body.identifier;
const { password } = body;
if (
  typeof inputEmail !== 'string' ||
  typeof password !== 'string' ||
  !inputEmail.trim() ||
  !password
) {
  return addCorsHeaders(
    NextResponse.json(
      { error: 'Email and password are required' },
      { status: 400 },
    ),
  );
}

const cleanEmail = inputEmail.trim().toLowerCase();

const user = await prisma.user.findFirst({
  where: {
    OR: [
      { email: cleanEmail },
      { phone: cleanEmail },
    ],
  },
});

if (!user || !user.passwordHash) {
  return addCorsHeaders(
    NextResponse.json(
      { error: 'Invalid email or password' },
      { status: 401 },
    ),
  );
}

if (!user.isActive) {
  return addCorsHeaders(
    NextResponse.json(
      {
        error:
          'Account has been deactivated. Please contact support.',
      },
      { status: 403 },
    ),
  );
}

const isValid = await verifyPassword(
  password,
  user.passwordHash,
);

if (!isValid) {
  await prisma.auditLog.create({
    data: {
      userId: user.id,
      action: 'LOGIN_FAILED_BAD_PASSWORD',
      resourceType: 'User',
      resourceId: user.id,
      details: {
        ip:
          req.headers.get('x-forwarded-for') ||
          '127.0.0.1',
      },
    },
  });

  return addCorsHeaders(
    NextResponse.json(
      { error: 'Invalid email or password' },
      { status: 401 },
    ),
  );
}

const ipAddress =
  req.headers.get('x-forwarded-for') || undefined;
const userAgent =
  req.headers.get('user-agent') || undefined;

const session = await createSession(
  user.id,
  userAgent,
  ipAddress,
);

await prisma.auditLog.create({
  data: {
    userId: user.id,
    action: 'LOGIN_SUCCESS_PASSWORD',
    resourceType: 'User',
    resourceId: user.id,
    details: { ip: ipAddress },
  },
});

const response = addCorsHeaders(
  NextResponse.json({
    success: true,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      role: user.role,
    },
  }),
);


response.cookies.set(
  SESSION_COOKIE_NAME,
  session.token,
  {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    expires: session.expiresAt,
  },
);


return response;

} catch (err: unknown) {
console.error('Admin login failed:', err);
return addCorsHeaders(
  NextResponse.json(
    { error: 'Login failed. Please try again.' },
    { status: 500 },
  ),
);

}
}
