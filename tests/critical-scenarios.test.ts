import { prisma } from '../src/lib/prisma';
import { hashPassword, verifyPassword, validatePasswordStrength } from '../src/lib/auth/password';
import { reserveTicketInventory, releaseTicketReservation } from '../src/lib/inventory';
import { calculateOrderPricing } from '../src/lib/pricing';
import { PaymentService } from '../src/lib/payments/service';
import { validateTicketAtGate } from '../src/lib/validator';
import { generateTicketValidationToken } from '../src/lib/tickets';
import { OrderStatus, PaymentGateway, ScanResult, TicketStatus } from '@prisma/client';
import crypto from 'crypto';

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string) {
  if (condition) {
    console.log(`  ✅ PASS: ${message}`);
    passed++;
  } else {
    console.error(`  ❌ FAIL: ${message}`);
    failed++;
    throw new Error(`Assertion failed: ${message}`);
  }
}

async function runTests() {
  console.log('\n======================================================');
  console.log('🧪 RUNNING CRITICAL PRODUCTION SCENARIOS TEST SUITE');
  console.log('======================================================\n');

  // Load an active event and ticket type for testing
  const event = await prisma.event.findFirst({
    include: { ticketTypes: { include: { inventory: true } } },
  });

  if (!event) throw new Error('No event found. Please run seed script first.');

  const regularTier = event.ticketTypes.find((t) => t.category === 'REGULAR')!;
  const testPhone = '+919876599999';

  // ----------------------------------------------------
  // TEST 1: Email + Password Authentication & Security
  // ----------------------------------------------------
  console.log('🔹 [Test 1] Email + Password Registration & Scrypt Cryptographic Verification');
  const testEmail = `test_participant_${Date.now()}@example.com`;
  const testPassword = 'SecurePassword@2026';

  // Weak password rejection
  const weakCheck = validatePasswordStrength('123');
  assert(!weakCheck.valid, 'Weak password correctly rejected by policy');

  // Strong password hash and register
  const testPasswordHash = await hashPassword(testPassword);
  assert(testPasswordHash.includes(':'), 'Scrypt cryptographic password hashing produces salted hash');

  const verifiedUser = await prisma.user.create({
    data: {
      email: testEmail,
      phone: testPhone,
      name: 'Test Verified Participant',
      passwordHash: testPasswordHash,
      role: 'PARTICIPANT',
    },
  });
  assert(verifiedUser.email === testEmail, 'Participant registered and authenticated with Email + Password');

  // Valid password check
  const isMatch = await verifyPassword(testPassword, verifiedUser.passwordHash!);
  assert(isMatch === true, 'Valid password verified successfully');

  // Wrong password check
  const isWrong = await verifyPassword('IncorrectPassword999', verifiedUser.passwordHash!);
  assert(isWrong === false, 'Incorrect password securely rejected');

  // ----------------------------------------------------
  // TEST 2: Concurrency & Inventory Race Conditions
  // ----------------------------------------------------
  console.log('\n🔹 [Test 2] Inventory Race Conditions & Overselling Prevention');
  // Create a limited dummy ticket type with total capacity = 5
  const limitedType = await prisma.ticketType.create({
    data: {
      eventId: event.id,
      name: 'Flash Midnight Pass (Limited)',
      category: 'EARLY_BIRD',
      price: 299,
      maxPerOrder: 5,
      saleStartDate: new Date(),
      saleEndDate: new Date(Date.now() + 86400000),
      status: 'ACTIVE',
      inventory: {
        create: {
          totalCapacity: 5,
          reservedCount: 0,
          soldCount: 0,
        },
      },
    },
    include: { inventory: true },
  });

  // Attempt to concurrently reserve 3 tickets + 3 tickets (Total 6 > 5)
  // Strictly one reservation must succeed, and the second MUST fail with INSUFFICIENT_INVENTORY!
  const results = await Promise.allSettled([
    reserveTicketInventory([{ ticketTypeId: limitedType.id, quantity: 3 }]),
    reserveTicketInventory([{ ticketTypeId: limitedType.id, quantity: 3 }]),
  ]);

  const fulfilled = results.filter((r) => r.status === 'fulfilled');
  const rejected = results.filter((r) => r.status === 'rejected');

  assert(fulfilled.length === 1, 'Only one concurrent reservation succeeded within capacity');
  assert(rejected.length === 1, 'Excess concurrent reservation safely rejected');
  console.log('     Reservation collision handled gracefully via DB transaction locking.');

  // Clean up limited test tier
  await prisma.ticketInventory.delete({ where: { ticketTypeId: limitedType.id } });
  await prisma.ticketType.delete({ where: { id: limitedType.id } });

  // ----------------------------------------------------
  // TEST 3: Pricing Manipulation & Zero Client Trust
  // ----------------------------------------------------
  console.log('\n🔹 [Test 3] Pricing Manipulation Protection');
  // The client passes only ticketTypeId and quantity. The server independently fetches DB price.
  const pricingResult = await calculateOrderPricing([
    { ticketTypeId: regularTier.id, quantity: 2 },
  ]);

  const expectedSubtotal = Number(regularTier.price) * 2;
  assert(pricingResult.subtotal === expectedSubtotal, `Subtotal calculated independently from DB: ₹${expectedSubtotal}`);
  assert(pricingResult.taxAmount === Math.round(expectedSubtotal * 0.18 * 100) / 100, 'GST 18% correctly applied on server');
  assert(pricingResult.convenienceFee === Math.round(expectedSubtotal * 0.025 * 100) / 100, 'Convenience fee 2.5% applied on server');
  assert(pricingResult.totalAmount > expectedSubtotal, 'Final total correctly combines subtotal + taxes + fees');

  // ----------------------------------------------------
  // TEST 4: Coupon Validation & Abuse Prevention
  // ----------------------------------------------------
  const sampleCoupon = await prisma.coupon.findFirst({ where: { isActive: true } });
  const couponPricing = await calculateOrderPricing(
    [{ ticketTypeId: regularTier.id, quantity: 2 }],
    sampleCoupon ? sampleCoupon.code : 'KATORIA10'
  );
  assert(couponPricing.discountAmount > 0, `${sampleCoupon?.code || 'KATORIA10'} discount applied: ₹${couponPricing.discountAmount}`);

  // Test invalid coupon
  try {
    await calculateOrderPricing(
      [{ ticketTypeId: regularTier.id, quantity: 2 }],
      'FAKE_HACK_99_OFF'
    );
    assert(false, 'Fake coupon should be rejected');
  } catch (err: any) {
    assert(err.message.includes('invalid or expired'), 'Unauthorized coupon code rejected by server');
  }

  // ----------------------------------------------------
  // TEST 5: Successful Payment & Ticket Generation
  // ----------------------------------------------------
  console.log('\n🔹 [Test 5] Successful Payment Flow & Ticket Issuance');
  const testOrderNumber = `DND-TEST-${Date.now()}`;
  const testOrder = await prisma.order.create({
    data: {
      orderNumber: testOrderNumber,
      userId: verifiedUser.id,
      eventId: event.id,
      idempotencyKey: `idem_test_${Date.now()}`,
      status: OrderStatus.PAYMENT_PENDING,
      subtotal: regularTier.price,
      totalAmount: regularTier.price,
      currency: 'INR',
      expiresAt: new Date(Date.now() + 600000),
      customerName: 'Test Participant',
      customerPhone: testPhone,
      customerEmail: 'test@example.com',
      orderItems: {
        create: [
          {
            ticketTypeId: regularTier.id,
            unitPrice: regularTier.price,
            quantity: 1,
            totalPrice: regularTier.price,
          },
        ],
      },
      payments: {
        create: {
          gateway: PaymentGateway.DEV_SANDBOX,
          gatewayOrderId: `order_sbx_${Date.now()}`,
          amount: regularTier.price,
          status: 'PENDING',
        },
      },
    },
  });

  const paymentVerification = await PaymentService.verifyAndCompletePayment({
    orderId: testOrder.id,
    gatewayOrderId: `order_sbx_${Date.now()}`,
    gatewayPaymentId: `pay_sbx_success_${Date.now()}`,
    rawPayload: { amount: Number(regularTier.price) },
  });

  assert(paymentVerification.success === true, 'Payment successfully verified');
  assert(paymentVerification.status === OrderStatus.PAYMENT_VERIFIED, 'Order state transitioned to PAYMENT_VERIFIED');
  assert(Boolean(paymentVerification.tickets && paymentVerification.tickets.length === 1), 'Digital ticket generated for verified order');

  const issuedTicket = paymentVerification.tickets![0];
  assert(issuedTicket.status === TicketStatus.ISSUED, 'Ticket marked ISSUED with valid token');

  // ----------------------------------------------------
  // TEST 6: Payment Decline / Failure Handling
  // ----------------------------------------------------
  console.log('\n🔹 [Test 6] Payment Failure & Inventory Release');
  const failOrderNumber = `DND-FAIL-${Date.now()}`;
  const failOrder = await prisma.order.create({
    data: {
      orderNumber: failOrderNumber,
      userId: verifiedUser.id,
      eventId: event.id,
      idempotencyKey: `idem_fail_${Date.now()}`,
      status: OrderStatus.PAYMENT_PENDING,
      subtotal: regularTier.price,
      totalAmount: regularTier.price,
      currency: 'INR',
      expiresAt: new Date(Date.now() + 600000),
      customerName: 'Fail Test User',
      customerPhone: testPhone,
      customerEmail: 'fail@example.com',
      orderItems: {
        create: [
          {
            ticketTypeId: regularTier.id,
            unitPrice: regularTier.price,
            quantity: 1,
            totalPrice: regularTier.price,
          },
        ],
      },
      payments: {
        create: {
          gateway: PaymentGateway.DEV_SANDBOX,
          gatewayOrderId: `order_fail_${Date.now()}`,
          amount: regularTier.price,
          status: 'PENDING',
        },
      },
    },
  });

  const failResult = await PaymentService.verifyAndCompletePayment({
    orderId: failOrder.id,
    gatewayOrderId: `order_fail_${Date.now()}`,
    gatewayPaymentId: 'fail_card_declined',
    rawPayload: { simulateFailure: true },
  });

  assert(failResult.success === false, 'Declined payment marked unsuccessful');
  assert(failResult.status === OrderStatus.PAYMENT_FAILED, 'Order state transitioned to PAYMENT_FAILED');

  // ----------------------------------------------------
  // TEST 7: Critical Edge-Case: Payment Succeeded but Booking Failed -> Auto Refund!
  // ----------------------------------------------------
  console.log('\n🔹 [Test 7] Payment Succeeded → Booking Failed → Automatic Refund Trigger');
  const criticalOrderNumber = `DND-CRIT-${Date.now()}`;
  const criticalOrder = await prisma.order.create({
    data: {
      orderNumber: criticalOrderNumber,
      userId: verifiedUser.id,
      eventId: event.id,
      idempotencyKey: `idem_crit_${Date.now()}`,
      status: OrderStatus.PAYMENT_PENDING,
      subtotal: regularTier.price,
      totalAmount: regularTier.price,
      currency: 'INR',
      expiresAt: new Date(Date.now() + 600000),
      customerName: 'Critical Test User',
      customerPhone: testPhone,
      customerEmail: 'crit@example.com',
      orderItems: {
        create: [
          {
            ticketTypeId: regularTier.id,
            unitPrice: regularTier.price,
            quantity: 1,
            totalPrice: regularTier.price,
          },
        ],
      },
      payments: {
        create: {
          gateway: PaymentGateway.DEV_SANDBOX,
          gatewayOrderId: `order_crit_${Date.now()}`,
          amount: regularTier.price,
          status: 'PENDING',
        },
      },
    },
  });

  // Verify payment with simulateBookingFailure: true
  const criticalResult = await PaymentService.verifyAndCompletePayment({
    orderId: criticalOrder.id,
    gatewayOrderId: `order_crit_${Date.now()}`,
    gatewayPaymentId: `pay_crit_${Date.now()}`,
    simulateBookingFailure: true,
  });

  assert(criticalResult.success === false, 'Booking failure intercepted cleanly');
  assert(criticalResult.criticalFailureHandled === true, 'Automatic failure recovery handler activated');
  assert(criticalResult.refundInitiated === true, 'Gateway refund automatically initiated');
  assert(!!criticalResult.refund, 'Refund audit record created in database');

  const reloadedOrder = await prisma.order.findUnique({ where: { id: criticalOrder.id } });
  assert(
    reloadedOrder?.status === OrderStatus.REFUNDED || reloadedOrder?.status === OrderStatus.REFUND_PENDING,
    'Order marked REFUNDED / REFUND_PENDING'
  );

  // ----------------------------------------------------
  // TEST 8: Webhook Idempotency
  // ----------------------------------------------------
  console.log('\n🔹 [Test 8] Webhook Processing & Idempotency');
  const mockWebhookEventId = `webhook_evt_test_${Date.now()}`;
  const mockWebhookBody = JSON.stringify({
    eventId: mockWebhookEventId,
    event: 'payment.authorized',
    orderId: 'mock_order_wh',
    paymentId: 'mock_pay_wh',
  });

  // First webhook execution
  const whResult1 = await PaymentService.processWebhook({
    gateway: PaymentGateway.DEV_SANDBOX,
    rawBody: mockWebhookBody,
    signature: 'mock_sig_valid',
    headers: {},
  });
  assert(whResult1.success === true, 'First webhook call processed successfully');

  // Duplicate webhook execution with identical eventId
  const whResult2 = await PaymentService.processWebhook({
    gateway: PaymentGateway.DEV_SANDBOX,
    rawBody: mockWebhookBody,
    signature: 'mock_sig_valid',
    headers: {},
  });
  assert(whResult2.alreadyProcessed === true, 'Duplicate webhook intercepted idempotently without duplicate side-effects');

  // ----------------------------------------------------
  // TEST 9: QR Code Forgery Protection
  // ----------------------------------------------------
  console.log('\n🔹 [Test 9] QR Code Security & Forgery Protection');
  // Attempt to validate a completely fake / forged token
  const forgedResult = await validateTicketAtGate({
    rawToken: 'DND-TKT:forged_token_counterfeit_signature_123',
    staffUserId: verifiedUser.id,
    gateName: 'Gate A',
  });
  assert(forgedResult.result === ScanResult.INVALID, 'Counterfeit QR token strictly rejected as INVALID');
  assert(forgedResult.admitted === false, 'Admission denied for forged ticket');

  // ----------------------------------------------------
  // TEST 10: Atomic Admission & Concurrency Duplicate Scan Protection
  // ----------------------------------------------------
  console.log('\n🔹 [Test 10] Gatekeeper Atomic Admission & Simultaneous Duplicate Scan Prevention');
  // Scan the legitimate ticket issued in Test 5
  const firstScan = await validateTicketAtGate({
    rawToken: issuedTicket.validationToken,
    staffUserId: verifiedUser.id,
    gateName: 'Gate A - Turnstile 1',
  });
  assert(firstScan.result === ScanResult.VALID, 'First scan of valid ticket granted admission (VALID)');
  assert(firstScan.admitted === true, 'Gate turnstile unlocked');

  // Second scan of the SAME ticket
  const secondScan = await validateTicketAtGate({
    rawToken: issuedTicket.validationToken,
    staffUserId: verifiedUser.id,
    gateName: 'Gate B - Turnstile 2',
  });
  assert(secondScan.result === ScanResult.ALREADY_USED, 'Second scan immediately flagged as ALREADY_USED');
  assert(secondScan.admitted === false, 'Duplicate entry blocked at turnstile');
  assert(!!secondScan.previousScanInfo, 'Previous scan gate & timestamp forensic details returned');

  // Simultaneous Concurrency Admission Race Condition:
  // Issue another ticket and attempt to admit it in parallel
  const tokenPair = generateTicketValidationToken('TKT-RACE-001', testOrder.id, 99);
  const raceTicket = await prisma.ticket.create({
    data: {
      ticketNumber: `TKT-RACE-${Date.now()}`,
      validationToken: tokenPair,
      orderId: testOrder.id,
      userId: verifiedUser.id,
      ticketTypeId: regularTier.id,
      attendeeName: 'Race Condition Participant',
      status: TicketStatus.ISSUED,
      qrPayload: tokenPair,
    },
  });

  const concurrentScans = await Promise.all([
    validateTicketAtGate({
      rawToken: raceTicket.validationToken,
      staffUserId: verifiedUser.id,
      gateName: 'Gate A',
    }),
    validateTicketAtGate({
      rawToken: raceTicket.validationToken,
      staffUserId: verifiedUser.id,
      gateName: 'Gate B',
    }),
  ]);

  const validAdmissions = concurrentScans.filter((s) => s.result === ScanResult.VALID);
  const deniedAdmissions = concurrentScans.filter((s) => s.result === ScanResult.ALREADY_USED);

  assert(validAdmissions.length === 1, 'Strictly ONE gate admitting the ticket in concurrent race condition');
  assert(deniedAdmissions.length === 1, 'Concurrent twin scan blocked atomically');

  // ----------------------------------------------------
  // CLEANUP: Reset Database to Clean Zero-State
  // ----------------------------------------------------
  console.log('\n🧹 Cleaning up test artifacts to preserve pristine database zero-state...');
  await prisma.ticketScan.deleteMany({
    where: { ticket: { orderId: { in: [testOrder.id, failOrder.id, criticalOrder.id] } } },
  });
  await prisma.ticket.deleteMany({
    where: { orderId: { in: [testOrder.id, failOrder.id, criticalOrder.id] } },
  });
  await prisma.paymentAttempt.deleteMany({
    where: { payment: { orderId: { in: [testOrder.id, failOrder.id, criticalOrder.id] } } },
  });
  await prisma.refund.deleteMany({
    where: { orderId: { in: [testOrder.id, failOrder.id, criticalOrder.id] } },
  });
  await prisma.payment.deleteMany({
    where: { orderId: { in: [testOrder.id, failOrder.id, criticalOrder.id] } },
  });
  await prisma.orderItem.deleteMany({
    where: { orderId: { in: [testOrder.id, failOrder.id, criticalOrder.id] } },
  });
  await prisma.order.deleteMany({
    where: { id: { in: [testOrder.id, failOrder.id, criticalOrder.id] } },
  });
  await prisma.user.delete({
    where: { id: verifiedUser.id },
  });
  await prisma.ticketInventory.updateMany({
    data: { soldCount: 0, reservedCount: 0 },
  });

  console.log('\n======================================================');
  console.log(`🎉 TEST SUITE COMPLETED: ${passed} PASSED, ${failed} FAILED`);
  console.log('======================================================\n');
}

runTests()
  .catch((e) => {
    console.error('Fatal test execution error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
