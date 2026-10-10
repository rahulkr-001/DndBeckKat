import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { OrderStatus, PaymentStatus, TicketStatus, ScanResult } from '@prisma/client';

import { verifyAdminAuth } from '@/lib/auth/admin';
import { Role } from '@prisma/client';

export async function GET(req: NextRequest) {
  try {
    const auth = await verifyAdminAuth([Role.SUPER_ADMIN, Role.EVENT_ADMIN, Role.FINANCE_ADMIN]);
    if (!auth.authorized) return auth.response!;

    // 1. Overall ticket counts and capacity
    const inventories = await prisma.ticketInventory.findMany({
      include: { ticketType: true },
    });

    const totalCapacity = inventories.reduce((acc, inv) => acc + inv.totalCapacity, 0);
    const totalSold = inventories.reduce((acc, inv) => acc + inv.soldCount, 0);
    const totalReserved = inventories.reduce((acc, inv) => acc + inv.reservedCount, 0);
    const totalRemaining = Math.max(0, totalCapacity - totalSold - totalReserved);

    // 2. Financials
    const paidOrders = await prisma.order.findMany({
      where: { status: OrderStatus.PAYMENT_VERIFIED },
      select: { totalAmount: true, subtotal: true, taxAmount: true, convenienceFee: true },
    });

    const totalRevenue = paidOrders.reduce((acc, o) => acc + Number(o.totalAmount), 0);
    const totalTaxes = paidOrders.reduce((acc, o) => acc + Number(o.taxAmount), 0);
    const totalConvenienceFees = paidOrders.reduce((acc, o) => acc + Number(o.convenienceFee), 0);

    // 3. Payment Status breakdown
    const paymentSuccessCount = await prisma.payment.count({ where: { status: PaymentStatus.SUCCESS } });
    const paymentFailedCount = await prisma.payment.count({ where: { status: PaymentStatus.FAILED } });
    const paymentPendingCount = await prisma.payment.count({ where: { status: PaymentStatus.PENDING } });

    // 4. Refunds
    const refunds = await prisma.refund.findMany();
    const totalRefundCount = refunds.length;
    const totalRefundAmount = refunds.reduce((acc, r) => acc + Number(r.amount), 0);

    // 5. Entry Scans & Attendance
    const totalTicketsIssued = await prisma.ticket.count();
    const ticketsUsed = await prisma.ticket.count({ where: { status: TicketStatus.USED } });
    const attendancePercentage = totalTicketsIssued > 0 ? Math.round((ticketsUsed / totalTicketsIssued) * 100) : 0;

    // 6. Recent Scans
    const recentScans = await prisma.ticketScan.findMany({
      take: 10,
      orderBy: { scannedAt: 'desc' },
      include: {
        ticket: { include: { ticketType: true } },
        scannedByUser: { select: { name: true, phone: true } },
      },
    });

    // 7. Recent Orders
    const recentOrders = await prisma.order.findMany({
      take: 8,
      orderBy: { createdAt: 'desc' },
      include: {
        orderItems: { include: { ticketType: true } },
        payments: true,
      },
    });

    // 8. Tier Breakdown
    const tierStats = inventories.map((inv) => ({
      ticketTypeId: inv.ticketTypeId,
      name: inv.ticketType.name,
      category: inv.ticketType.category,
      price: Number(inv.ticketType.price),
      totalCapacity: inv.totalCapacity,
      soldCount: inv.soldCount,
      reservedCount: inv.reservedCount,
      percentSold: Math.round((inv.soldCount / inv.totalCapacity) * 100),
    }));

    return NextResponse.json({
      metrics: {
        totalRevenue: Math.round(totalRevenue * 100) / 100,
        totalTaxes: Math.round(totalTaxes * 100) / 100,
        totalConvenienceFees: Math.round(totalConvenienceFees * 100) / 100,
        totalCapacity,
        totalSold,
        totalReserved,
        totalRemaining,
        ticketsUsed,
        totalTicketsIssued,
        attendancePercentage,
        paymentSuccessCount,
        paymentFailedCount,
        paymentPendingCount,
        totalRefundCount,
        totalRefundAmount,
      },
      tierStats,
      recentScans,
      recentOrders,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
