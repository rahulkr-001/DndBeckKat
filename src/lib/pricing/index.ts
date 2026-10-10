import { prisma } from '../prisma';
import { CouponDiscountType } from '@prisma/client';

export interface PricingCalculationItem {
  ticketTypeId: string;
  quantity: number;
}

export interface PaymentConfigSnapshot {
  gstEnabled: boolean;
  gstPercentage: number;
  gstTaxableBase: string; // "SUBTOTAL" | "PLATFORM_FEE" | "SUBTOTAL_AND_FEE"
  gstDisplayLabel: string;
  platformFeeEnabled: boolean;
  platformFeeType: string; // "PERCENTAGE" | "FIXED"
  platformFeeValue: number;
  platformFeePayer: string; // "CUSTOMER" | "PLATFORM"
  taxApplicableOnPlatformFee: boolean;
}

export interface OrderPricingResult {
  items: Array<{
    ticketTypeId: string;
    name: string;
    unitPrice: number;
    quantity: number;
    totalPrice: number;
  }>;
  subtotal: number;
  coupon?: {
    id: string;
    code: string;
    discountType: CouponDiscountType;
    discountValue: number;
    appliedDiscount: number;
  };
  discountAmount: number;
  taxableAmount: number;
  taxAmount: number;
  convenienceFee: number;
  totalAmount: number;
  currency: string;
  configSnapshot: PaymentConfigSnapshot;
}

/**
 * Fetch active Payment & Tax Configuration from the database.
 * If none exists, initializes default configuration.
 */
export async function getActivePaymentConfig(): Promise<PaymentConfigSnapshot> {
  try {
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

    return {
      gstEnabled: config.gstEnabled,
      gstPercentage: Number(config.gstPercentage),
      gstTaxableBase: config.gstTaxableBase || 'SUBTOTAL',
      gstDisplayLabel: config.gstDisplayLabel || 'GST & Applicable Taxes (18%)',
      platformFeeEnabled: config.platformFeeEnabled,
      platformFeeType: config.platformFeeType || 'PERCENTAGE',
      platformFeeValue: Number(config.platformFeeValue),
      platformFeePayer: config.platformFeePayer || 'CUSTOMER',
      taxApplicableOnPlatformFee: Boolean(config.taxApplicableOnPlatformFee),
    };
  } catch (err) {
    console.warn('Fallback to environment/hardcoded pricing config due to DB error:', err);
    return {
      gstEnabled: true,
      gstPercentage: parseFloat(process.env.TAX_PERCENTAGE || '18.0'),
      gstTaxableBase: 'SUBTOTAL',
      gstDisplayLabel: 'GST & Applicable Taxes (18%)',
      platformFeeEnabled: true,
      platformFeeType: 'PERCENTAGE',
      platformFeeValue: parseFloat(process.env.CONVENIENCE_FEE_PERCENTAGE || '2.5'),
      platformFeePayer: 'CUSTOMER',
      taxApplicableOnPlatformFee: false,
    };
  }
}

/**
 * Authoritative Server-Side Pricing Calculator
 * Uses integer minor units (paise) to guarantee zero floating point drift.
 */
export async function calculateOrderPricing(
  items: PricingCalculationItem[],
  couponCode?: string,
  customConfig?: PaymentConfigSnapshot
): Promise<OrderPricingResult> {
  if (!items || items.length === 0) {
    throw new Error('At least one ticket item is required');
  }

  // 1. Fetch official ticket prices directly from the database
  const calculatedItems = [];
  let subtotalPaise = 0;

  for (const item of items) {
    if (item.quantity <= 0) {
      throw new Error('Quantity must be at least 1');
    }

    const ticketType = await prisma.ticketType.findUnique({
      where: { id: item.ticketTypeId },
    });

    if (!ticketType) {
      throw new Error(`Ticket type ${item.ticketTypeId} was not found`);
    }

    if (ticketType.status !== 'ACTIVE') {
      throw new Error(`Ticket "${ticketType.name}" is no longer available for booking`);
    }

    const unitPrice = Number(ticketType.price);
    const unitPricePaise = Math.round(unitPrice * 100);
    const totalPricePaise = unitPricePaise * item.quantity;
    const totalPrice = totalPricePaise / 100;

    calculatedItems.push({
      ticketTypeId: ticketType.id,
      name: ticketType.name,
      unitPrice,
      quantity: item.quantity,
      totalPrice,
    });

    subtotalPaise += totalPricePaise;
  }

  // 2. Validate Coupon Code (Server-Side)
  let appliedCoupon: OrderPricingResult['coupon'] = undefined;
  let discountPaise = 0;

  if (couponCode && couponCode.trim()) {
    const cleanCode = couponCode.trim().toUpperCase();
    const coupon = await prisma.coupon.findUnique({
      where: { code: cleanCode },
    });

    const now = new Date();

    if (!coupon || !coupon.isActive) {
      throw new Error(`Coupon code "${cleanCode}" is invalid or expired`);
    }

    if (now < coupon.validFrom || now > coupon.validUntil) {
      throw new Error(`Coupon "${cleanCode}" has expired`);
    }

    if (coupon.usageLimit && coupon.usedCount >= coupon.usageLimit) {
      throw new Error(`Coupon "${cleanCode}" has reached its maximum redemptions`);
    }

    const minSpendPaise = coupon.minOrderAmount ? Math.round(Number(coupon.minOrderAmount) * 100) : 0;
    if (subtotalPaise < minSpendPaise) {
      throw new Error(`Coupon "${cleanCode}" requires a minimum order value of ₹${minSpendPaise / 100}`);
    }

    // Compute discount in paise
    if (coupon.discountType === CouponDiscountType.PERCENTAGE) {
      const percentage = Number(coupon.discountValue);
      let calculatedDiscountPaise = Math.round((subtotalPaise * percentage) / 100);
      if (coupon.maxDiscount) {
        const maxDiscountPaise = Math.round(Number(coupon.maxDiscount) * 100);
        calculatedDiscountPaise = Math.min(calculatedDiscountPaise, maxDiscountPaise);
      }
      discountPaise = Math.min(calculatedDiscountPaise, subtotalPaise);
    } else {
      // Fixed amount
      const fixedPaise = Math.round(Number(coupon.discountValue) * 100);
      discountPaise = Math.min(fixedPaise, subtotalPaise);
    }

    appliedCoupon = {
      id: coupon.id,
      code: coupon.code,
      discountType: coupon.discountType,
      discountValue: Number(coupon.discountValue),
      appliedDiscount: discountPaise / 100,
    };
  }

  const netTicketPaise = Math.max(0, subtotalPaise - discountPaise);

  // 3. Load dynamic payment configuration
  const config = customConfig || (await getActivePaymentConfig());

  // 4. Calculate Platform Convenience Fee in paise
  let totalPlatformFeePaise = 0;
  let customerPlatformFeePaise = 0;

  if (config.platformFeeEnabled) {
    if (config.platformFeeType === 'PERCENTAGE') {
      const feePercent = Number(config.platformFeeValue);
      totalPlatformFeePaise = Math.round((netTicketPaise * feePercent) / 100);
    } else {
      // FIXED fee per order
      totalPlatformFeePaise = Math.round(Number(config.platformFeeValue) * 100);
    }

    if (config.platformFeePayer === 'CUSTOMER') {
      customerPlatformFeePaise = totalPlatformFeePaise;
    } else {
      // Organiser absorbs the fee: 0 to customer
      customerPlatformFeePaise = 0;
    }
  }

  // 5. Calculate GST / Tax in paise based on configured taxable base
  let taxableBasePaise = 0;
  let gstPaise = 0;

  if (config.gstEnabled) {
    const gstPercent = Number(config.gstPercentage);

    if (config.gstTaxableBase === 'PLATFORM_FEE') {
      taxableBasePaise = customerPlatformFeePaise;
    } else if (config.gstTaxableBase === 'SUBTOTAL_AND_FEE') {
      taxableBasePaise = netTicketPaise + customerPlatformFeePaise;
    } else {
      // Default: 'SUBTOTAL'
      taxableBasePaise = netTicketPaise;
      if (config.taxApplicableOnPlatformFee && customerPlatformFeePaise > 0) {
        taxableBasePaise += customerPlatformFeePaise;
      }
    }

    gstPaise = Math.round((taxableBasePaise * gstPercent) / 100);
  }

  // 6. Final Amount Payable in paise
  const totalPaise = netTicketPaise + customerPlatformFeePaise + gstPaise;

  return {
    items: calculatedItems,
    subtotal: subtotalPaise / 100,
    coupon: appliedCoupon,
    discountAmount: discountPaise / 100,
    taxableAmount: taxableBasePaise / 100,
    taxAmount: gstPaise / 100,
    convenienceFee: customerPlatformFeePaise / 100,
    totalAmount: totalPaise / 100,
    currency: 'INR',
    configSnapshot: config,
  };
}
