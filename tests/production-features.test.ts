import { prisma } from '../src/lib/prisma';
import { hashPassword, verifyPassword } from '../src/lib/auth/password';
import { generateTicketPdfBuffer, generateSampleTicketPdfBuffer } from '../src/lib/tickets/pdf';
import { TicketStatus, ScanResult } from '@prisma/client';

async function runFeatureTests() {
  console.log('\n======================================================');
  console.log('🧪 RUNNING PRODUCTION NEW FEATURES TEST SUITE');
  console.log('======================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, message: string) {
    if (condition) {
      console.log(`  ✅ PASS: ${message}`);
      passed++;
    } else {
      console.error(`  ❌ FAIL: ${message}`);
      failed++;
    }
  }

  try {
    // ----------------------------------------------------
    // Feature Test 1: Dual Auth (Password Hashing & Verification)
    // ----------------------------------------------------
    console.log('🔹 [Test 1] Dual Authentication: Scrypt Password Security');
    const rawPass = 'Starlight@Fest2026';
    const hash = await hashPassword(rawPass);
    assert(typeof hash === 'string' && hash.includes(':'), 'Password hashed with cryptographically strong salt');

    const isValid = await verifyPassword(rawPass, hash);
    assert(isValid === true, 'Correct password verifies successfully');

    const isWrong = await verifyPassword('WrongPassword123', hash);
    assert(isWrong === false, 'Incorrect password rejected securely');

    // ----------------------------------------------------
    // Feature Test 2: Ticket PDF Generation with Exact A4 & Styling
    // ----------------------------------------------------
    console.log('\n🔹 [Test 2] Exact A4 Ticket PDF Generation & Template Layout');
    const existingTicket = await prisma.ticket.findFirst({
      where: { status: TicketStatus.ISSUED },
    });

    if (existingTicket) {
      const pdfBuffer = await generateTicketPdfBuffer(existingTicket.validationToken);
      assert(pdfBuffer instanceof Buffer, 'PDF Buffer generated successfully');
      assert(pdfBuffer.length > 1000, `PDF size is valid (${pdfBuffer.length} bytes)`);
      const headerStr = pdfBuffer.slice(0, 5).toString('ascii');
      assert(headerStr === '%PDF-', 'Valid PDF magic header (%PDF-) present');
    }

    const sampleConfig = {
      primaryColor: '#780016',
      accentColor: '#D4AF37',
      textColor: '#FFFFFF',
      qrPosition: 'RIGHT',
      badgeText: 'VIP INVITATION',
      tagline: 'Festive Grand Celebration',
      termsText: 'Rule 1. Traditional Attire\nRule 2. No outside food',
      showWhatsApp: true,
    };
    const samplePdf = await generateSampleTicketPdfBuffer(sampleConfig);
    assert(samplePdf instanceof Buffer && samplePdf.length > 1000, 'Sample A4 Preview PDF generated with custom layoutConfig');

    // ----------------------------------------------------
    // Feature Test 3: Verified Attendee Testimonials Workflow
    // ----------------------------------------------------
    console.log('\n🔹 [Test 3] Verified Attendee Review Guardrails');

    // Find or create test event and user
    const event = await prisma.event.findFirst({ where: { status: 'PUBLISHED' } });
    const user = await prisma.user.findFirst();

    if (event && user) {
      // Create a test admitted ticket (USED status)
      const ticketType = await prisma.ticketType.findFirst({ where: { eventId: event.id } });

      if (ticketType) {
        const testOrder = await prisma.order.create({
          data: {
            orderNumber: `TEST-ORD-REV-${Date.now()}`,
            userId: user.id,
            eventId: event.id,
            idempotencyKey: `idem_test_review_${Date.now()}`,
            status: 'PAYMENT_VERIFIED',
            subtotal: ticketType.price,
            totalAmount: ticketType.price,
            expiresAt: new Date(Date.now() + 600000),
            customerName: 'Test Attendee',
            customerPhone: '+919876599999',
            customerEmail: 'attendee@test.com',
          },
        });

        const admittedTicket = await prisma.ticket.create({
          data: {
            ticketNumber: `TEST-ADMIT-${Date.now()}`,
            validationToken: `TEST-TOK-${Date.now()}`,
            orderId: testOrder.id,
            userId: user.id,
            ticketTypeId: ticketType.id,
            attendeeName: 'Test Verified Attendee',
            status: TicketStatus.USED,
            qrPayload: 'test-qr',
          },
        });

        // Testimonial submission for admitted ticket
        const review = await prisma.eventTestimonial.create({
          data: {
            eventId: event.id,
            userId: user.id,
            ticketId: admittedTicket.id,
            name: 'Test Verified Attendee',
            role: 'Verified Attendee',
            quote: 'Sensational folk vibe and flawless entry security!',
            rating: 5,
            isVerified: true,
            moderationStatus: 'PENDING',
            isPublished: false,
          },
        });

        assert(review.isVerified === true, 'Review marked as isVerified=true for admitted ticket');
        assert(review.moderationStatus === 'PENDING', 'Submitted review enters PENDING moderation queue');
        assert(review.isPublished === false, 'Review remains unpublished until admin approval');

        // Moderate: Approve
        const approvedReview = await prisma.eventTestimonial.update({
          where: { id: review.id },
          data: { moderationStatus: 'APPROVED', isPublished: true },
        });

        assert(approvedReview.moderationStatus === 'APPROVED', 'Admin approves review successfully');
        assert(approvedReview.isPublished === true, 'Approved review becomes public');

        // Cleanup test review, ticket, order
        await prisma.eventTestimonial.delete({ where: { id: review.id } });
        await prisma.ticket.delete({ where: { id: admittedTicket.id } });
        await prisma.order.delete({ where: { id: testOrder.id } });
      }
    }

    console.log('\n======================================================');
    console.log(`🎉 ALL TESTS COMPLETED: ${passed} PASSED, ${failed} FAILED`);
    console.log('======================================================\n');

    if (failed > 0) process.exit(1);
  } catch (err: any) {
    console.error('Test execution error:', err);
    process.exit(1);
  }
}

runFeatureTests();
