import { NextResponse } from 'next/server';

export async function POST() {
  return NextResponse.json(
    {
      error: 'Phone OTP authentication has been deprecated. Please authenticate using Email and Password at /api/auth/login or /api/auth/register.',
    },
    { status: 410 }
  );
}
