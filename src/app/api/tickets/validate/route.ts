import { NextRequest, NextResponse } from 'next/server';
import { validateTicketAtGate } from '@/lib/validator';
import { getCurrentUser } from '@/lib/auth/session';
import { z } from 'zod';

const ValidateTicketSchema = z.object({
  token: z.string().min(1, 'Token or QR payload required'),
  eventId: z.string().optional(),
  gateName: z.string().optional(),
  deviceInfo: z.string().optional(),
});

const GATE_ROLES = ['VALIDATOR', 'SUPER_ADMIN', 'EVENT_ADMIN', 'FINANCE_ADMIN'] as const;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = ValidateTicketSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Ticket token payload is required' },
        { status: 400 }
      );
    }

    // Gate scanning REQUIRES authentication — no anonymous admission allowed
    const currentUser = await getCurrentUser();
    if (!currentUser) {
      return NextResponse.json(
        { error: 'Authentication required. Please log in to use the gate scanner.', code: 'UNAUTHENTICATED' },
        { status: 401 }
      );
    }

    // Only staff roles can admit tickets
    if (!GATE_ROLES.includes(currentUser.role as typeof GATE_ROLES[number])) {
      return NextResponse.json(
        { error: 'Insufficient permissions. Gate scanning requires VALIDATOR, EVENT_ADMIN, or SUPER_ADMIN role.', code: 'FORBIDDEN' },
        { status: 403 }
      );
    }

    const ipAddress = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || '127.0.0.1';

    const result = await validateTicketAtGate({
      rawToken: parsed.data.token,
      expectedEventId: parsed.data.eventId,
      staffUserId: currentUser.id,
      gateName: parsed.data.gateName || 'Gate A - Primary',
      deviceInfo: parsed.data.deviceInfo || req.headers.get('user-agent') || 'Scanner Terminal',
      ipAddress,
    });

    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || 'Ticket admission validation failed' },
      { status: 500 }
    );
  }
}
