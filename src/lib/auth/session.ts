import crypto from 'crypto';
import { cookies } from 'next/headers';
import { prisma } from '../prisma';

export const SESSION_COOKIE_NAME = 'dandiya_session';

export async function createSession(userId: string, userAgent?: string, ipAddress?: string) {
  // Generate random 64-character token
  const token = crypto.randomBytes(32).toString('hex');
  const expiryDays = parseInt(process.env.SESSION_EXPIRY_DAYS || '30', 10);
  const expiresAt = new Date(Date.now() + expiryDays * 24 * 60 * 60 * 1000);

  const session = await prisma.session.create({
    data: {
      token,
      userId,
      expiresAt,
      userAgent,
      ipAddress,
      isRevoked: false,
    },
    include: {
      user: {
        include: {
          adminRoles: {
            include: {
              role: {
                include: {
                  permissions: {
                    include: { permission: true },
                  },
                },
              },
            },
          },
        },
      },
    },
  });

  return session;
}

export async function getSessionByToken(token: string) {
  if (!token) return null;

  const session = await prisma.session.findUnique({
    where: { token },
    include: {
      user: {
        include: {
          adminRoles: {
            include: {
              role: {
                include: {
                  permissions: {
                    include: { permission: true },
                  },
                },
              },
            },
          },
        },
      },
    },
  });

  if (!session) return null;

  // Check revocation and expiration
  if (session.isRevoked || new Date() > session.expiresAt || !session.user.isActive) {
    return null;
  }

  return session;
}

export async function revokeSession(token: string) {
  if (!token) return;
  await prisma.session.updateMany({
    where: { token },
    data: { isRevoked: true },
  });
}

export async function getCurrentUser() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!token) return null;

  const session = await getSessionByToken(token);
  return session?.user ?? null;
}
