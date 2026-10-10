
import { NextRequest, NextResponse } from 'next/server';

const FRONTEND_ORIGIN =
  'https://dandiyanightkatoria.vercel.app';

function getAllowedOrigins(): Set<string> {
  const origins = [
    FRONTEND_ORIGIN,
    process.env.CORS_ORIGIN,
  ].filter((value): value is string => Boolean(value));

  return new Set(origins.map((origin) => origin.replace(/\/$/, '')));
}

function addCorsHeaders(
  response: NextResponse,
  origin: string | null,
): NextResponse {
  const allowedOrigins = getAllowedOrigins();

  if (origin && allowedOrigins.has(origin.replace(/\/$/, ''))) {
    response.headers.set('Access-Control-Allow-Origin', origin);
    response.headers.set('Access-Control-Allow-Credentials', 'true');
    response.headers.set(
      'Access-Control-Allow-Methods',
      'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    );
    response.headers.set(
      'Access-Control-Allow-Headers',
      'Content-Type, Authorization, X-Requested-With, Accept, X-CSRF-Token',
    );
    response.headers.set('Access-Control-Max-Age', '86400');
    response.headers.set('Vary', 'Origin');
  }

  return response;
}

export function middleware(request: NextRequest) {
  const origin = request.headers.get('origin');
  const allowedOrigins = getAllowedOrigins();

  if (request.method === 'OPTIONS') {
    if (
      !origin ||
      !allowedOrigins.has(origin.replace(/\/$/, ''))
    ) {
      return new NextResponse(null, { status: 403 });
    }

    return addCorsHeaders(
      new NextResponse(null, { status: 204 }),
      origin,
    );
  }

  return addCorsHeaders(
    NextResponse.next(),
    origin,
  );
}

export const config = {
  matcher: ['/api/:path*'],
};
