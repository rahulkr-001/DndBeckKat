import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyAdminAuth } from '@/lib/auth/admin';
import { Role } from '@prisma/client';
import { z } from 'zod';
import { getActivePaymentConfig } from '@/lib/pricing';

const UpdatePaymentConfigSchema = z.object({
  gstEnabled: z.boolean(),
  gstPercentage: z.number().min(0).max(100),
  gstTaxableBase: z.enum(['SUBTOTAL', 'PLATFORM_FEE', 'SUBTOTAL_AND_FEE']),
  gstDisplayLabel: z.string().min(1).max(100),
  platformFeeEnabled: z.boolean(),
  platformFeeType: z.enum(['PERCENTAGE', 'FIXED']),
  platformFeeValue: z.number().min(0),
  platformFeePayer: z.enum(['CUSTOMER', 'PLATFORM']),
  taxApplicableOnPlatformFee: z.boolean(),
  notes: z.string().optional(),
});

// GET active payment & tax configuration
export async function GET(req: NextRequest) {
  try {
    const auth = await verifyAdminAuth([Role.SUPER_ADMIN, Role.FINANCE_ADMIN]);
    if (!auth.authorized) return auth.response!;

    let config = await prisma.paymentConfig.findFirst({
      orderBy: { updatedAt: 'desc' },
    });

    if (!config) {
      config = await prisma.paymentConfig.create({
        data: {
          gstEnabled: true,
          gstPercentage: 18.0,
          gstTaxableBase: 'SUBTOTAL',
          gstDisplayLabel: 'GST & Applicable Taxes (18%)',
          platformFeeEnabled: true,
          platformFeeType: 'PERCENTAGE',
          platformFeeValue: 2.5,
          platformFeePayer: 'CUSTOMER',
          taxApplicableOnPlatformFee: false,
          notes: 'System default initialized configuration',
        },
      });
    }

    return NextResponse.json({
      success: true,
      config: {
        id: config.id,
        gstEnabled: config.gstEnabled,
        gstPercentage: Number(config.gstPercentage),
        gstTaxableBase: config.gstTaxableBase,
        gstDisplayLabel: config.gstDisplayLabel,
        platformFeeEnabled: config.platformFeeEnabled,
        platformFeeType: config.platformFeeType,
        platformFeeValue: Number(config.platformFeeValue),
        platformFeePayer: config.platformFeePayer,
        taxApplicableOnPlatformFee: config.taxApplicableOnPlatformFee,
        notes: config.notes,
        updatedByUserId: config.updatedByUserId,
        createdAt: config.createdAt,
        updatedAt: config.updatedAt,
      },
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || 'Failed to retrieve payment configuration' },
      { status: 500 }
    );
  }
}

// PUT: Update payment & tax configuration (Super Admin Only)
export async function PUT(req: NextRequest) {
  try {
    const auth = await verifyAdminAuth([Role.SUPER_ADMIN]);
    if (!auth.authorized) return auth.response!;

    const body = await req.json();
    const parsed = UpdatePaymentConfigSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || 'Invalid configuration payload' },
        { status: 400 }
      );
    }

    const {
      gstEnabled,
      gstPercentage,
      gstTaxableBase,
      gstDisplayLabel,
      platformFeeEnabled,
      platformFeeType,
      platformFeeValue,
      platformFeePayer,
      taxApplicableOnPlatformFee,
      notes,
    } = parsed.data;

    // Create a new version record to preserve complete audit history
    const newConfig = await prisma.paymentConfig.create({
      data: {
        gstEnabled,
        gstPercentage,
        gstTaxableBase,
        gstDisplayLabel,
        platformFeeEnabled,
        platformFeeType,
        platformFeeValue,
        platformFeePayer,
        taxApplicableOnPlatformFee,
        notes: notes || `Updated by ${auth.user.name || auth.user.email}`,
        updatedByUserId: auth.user.id,
      },
    });

    // Record administrative audit trail
    await prisma.auditLog.create({
      data: {
        userId: auth.user.id,
        action: 'PAYMENT_TAX_CONFIG_UPDATED',
        resourceType: 'PaymentConfig',
        resourceId: newConfig.id,
        details: {
          gstEnabled,
          gstPercentage,
          gstTaxableBase,
          platformFeeEnabled,
          platformFeeType,
          platformFeeValue,
          platformFeePayer,
          taxApplicableOnPlatformFee,
        },
      },
    });

    return NextResponse.json({
      success: true,
      message: 'Payment and tax configuration successfully updated',
      config: {
        id: newConfig.id,
        gstEnabled: newConfig.gstEnabled,
        gstPercentage: Number(newConfig.gstPercentage),
        gstTaxableBase: newConfig.gstTaxableBase,
        gstDisplayLabel: newConfig.gstDisplayLabel,
        platformFeeEnabled: newConfig.platformFeeEnabled,
        platformFeeType: newConfig.platformFeeType,
        platformFeeValue: Number(newConfig.platformFeeValue),
        platformFeePayer: newConfig.platformFeePayer,
        taxApplicableOnPlatformFee: newConfig.taxApplicableOnPlatformFee,
        notes: newConfig.notes,
        updatedAt: newConfig.updatedAt,
      },
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || 'Failed to update payment configuration' },
      { status: 500 }
    );
  }
}
