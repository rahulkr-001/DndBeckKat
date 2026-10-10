import { NextRequest, NextResponse } from 'next/server';
import { calculateOrderPricing } from '@/lib/pricing';
import { z } from 'zod';

const CalculateSchema = z.object({
  items: z.array(
    z.object({
      ticketTypeId: z.string().min(1),
      quantity: z.number().int().positive(),
    })
  ).min(1),
  couponCode: z.string().optional(),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = CalculateSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || 'Invalid calculation request' },
        { status: 400 }
      );
    }

    const pricing = await calculateOrderPricing(parsed.data.items, parsed.data.couponCode);

    return NextResponse.json({
      success: true,
      pricing,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || 'Pricing calculation failed' },
      { status: 400 }
    );
  }
}
