import {
  PrismaClient,
  Role,
  TicketCategory,
  TicketSaleStatus,
  CouponDiscountType,
} from '@prisma/client';
import fs from 'fs';
import path from 'path';
import { hashPassword } from '../src/lib/auth/password';

// Ensure .env is loaded if running directly via tsx without dotenv wrapper
if (!process.env.SUPER_ADMIN_PASSWORD) {
  const envPath = path.resolve(process.cwd(), '.env');
  if (fs.existsSync(envPath)) {
    const envLines = fs.readFileSync(envPath, 'utf8').split('\n');
    for (const line of envLines) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) {
        const eqIdx = trimmed.indexOf('=');
        if (eqIdx > 0) {
          const key = trimmed.substring(0, eqIdx).trim();
          let val = trimmed.substring(eqIdx + 1).trim();
          if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
            val = val.substring(1, val.length - 1);
          }
          if (!process.env[key]) {
            process.env[key] = val;
          }
        }
      }
    }
  }
}

const prisma = new PrismaClient();

async function main() {
  console.log('🌟 Seeding Dandiya Night 3.0 — Production Database Configuration...');

  if (typeof prisma.eventStory?.deleteMany !== 'function') {
    throw new Error(
      'Generated Prisma Client is missing the CMS models. Stop running app processes, then run `npx prisma generate --schema prisma/schema.prisma` and retry.'
    );
  }

  // 1. Validate Required Super Admin Environment Variable
  const superAdminPassword = (process.env.SUPER_ADMIN_PASSWORD || '').trim();
  if (!superAdminPassword || superAdminPassword.length === 0) {
    console.error('❌ FATAL: SUPER_ADMIN_PASSWORD environment variable is missing.');
    console.error('   Please define SUPER_ADMIN_PASSWORD in your environment before running seed.');
    process.exit(1);
  }

  const superAdminEmail = (process.env.SUPER_ADMIN_EMAIL || 'rahulydv1130@gmail.com').toLowerCase().trim();
  const superAdminName = 'Rahul Kumar';

  // 2. Clean existing records for clean idempotent production seeding
  await prisma.ticketScan.deleteMany();
  await prisma.ticket.deleteMany();
  await prisma.refund.deleteMany();
  await prisma.paymentAttempt.deleteMany();
  await prisma.payment.deleteMany();
  await prisma.orderItem.deleteMany();
  await prisma.order.deleteMany();
  await prisma.pricingRule.deleteMany();
  await prisma.ticketInventory.deleteMany();
  await prisma.ticketType.deleteMany();
  await prisma.ticketTemplateVersion.deleteMany();
  await prisma.ticketTemplate.deleteMany();
  await prisma.galleryImage.deleteMany();
  await prisma.gallery.deleteMany();
  await prisma.faq.deleteMany();
  await prisma.eventStory.deleteMany();
  await prisma.eventHighlight.deleteMany();
  await prisma.eventSchedule.deleteMany();
  await prisma.eventTestimonial.deleteMany();
  await prisma.teamMember.deleteMany();
  await prisma.sponsor.deleteMany();
  await prisma.eventVideo.deleteMany();
  await prisma.event.deleteMany();
  await prisma.venue.deleteMany();
  await prisma.organizer.deleteMany();
  await prisma.coupon.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.session.deleteMany();
  await prisma.otpRequest.deleteMany();
  await prisma.rolePermission.deleteMany();
  await prisma.permission.deleteMany();
  await prisma.userAdminRole.deleteMany();
  await prisma.adminRole.deleteMany();
  await prisma.user.deleteMany();

  // 3. Create Permissions
  const permissionsData = [
    { code: 'events:read', name: 'View Events', description: 'Can view events and stats' },
    { code: 'events:write', name: 'Manage Events', description: 'Can create and modify events' },
    { code: 'tickets:read', name: 'View Tickets', description: 'Can view ticket orders and quotas' },
    { code: 'tickets:scan', name: 'Scan & Admit Tickets', description: 'Can scan QR and validate entry' },
    { code: 'finance:read', name: 'View Financials', description: 'Can view revenues, fees, taxes' },
    { code: 'finance:refund', name: 'Process Refunds', description: 'Can initiate and reconcile refunds' },
    { code: 'content:manage', name: 'Manage CMS Content', description: 'Can edit galleries, FAQs, templates' },
    { code: 'users:manage', name: 'Manage Staff & Roles', description: 'Can manage administrative users' },
  ];

  const createdPermissions = [];
  for (const p of permissionsData) {
    const perm = await prisma.permission.create({ data: p });
    createdPermissions.push(perm);
  }

  // 4. Create Super Admin Role with ALL permissions
  const superAdminRole = await prisma.adminRole.create({
    data: {
      name: 'SUPER_ADMIN',
      description: 'Master system administrator with unrestricted privileges',
      permissions: {
        create: createdPermissions.map((p) => ({
          permissionId: p.id,
        })),
      },
    },
  });

  // 5. Create Exactly ONE Initial Super Admin (Rahul Kumar)
  const hashedPassword = await hashPassword(superAdminPassword);
  const superAdminUser = await prisma.user.create({
    data: {
      phone: '+919999999999',
      name: superAdminName,
      email: superAdminEmail,
      passwordHash: hashedPassword,
      role: Role.SUPER_ADMIN,
      adminRoles: {
        create: {
          roleId: superAdminRole.id,
        },
      },
    },
  });
  console.log(`✅ Seeded Initial Super Admin: ${superAdminUser.name} (${superAdminUser.email})`);

  // 6. Create Organizer
  const organizer = await prisma.organizer.create({
    data: {
      name: 'Starlight Club',
      email: 'starlightclub@gmail.com',
      phone: '7004980474',
      website: 'https://starlightclub.in',
      description:
        'Starlight Club presents Dandiya Night 3.0 in Katoria, bringing together music, Dandiya, entertainment, food, beverages and festive celebration.',
      socialLinks: {
        instagram: 'https://instagram.com/dandiya_night_katoria',
      },
    },
  });

  // 7. Create Venue
  const venue = await prisma.venue.create({
    data: {
      name: 'Indira Garden',
      address: 'Indira Garden',
      city: 'Katoria',
      state: 'Bihar',
      postalCode: '813106',
      latitude: 24.7451,
      longitude: 86.7248,
      googleMapsUrl: 'https://maps.app.goo.gl/4xC5t7wKmSytcK9w9?g_st=ac',
      capacity: 1000,
      parkingInfo: 'Secure parking is available for attendees.',
      entryGateInfo: 'Entry is subject to successful ticket and QR validation.',
      transportInfo: 'Attendees are advised to plan their local transportation in advance.',
      rules:
        '1. Carry your valid digital ticket and QR code.\n2. Follow instructions provided by event staff and volunteers.\n3. Dandiya sticks are available at the garden.\n4. Maintain proper conduct and follow venue safety instructions.',
    },
  });

  // 8. Create Main Event (Dandiya Night 3.0)
  const now = new Date();
  const eventStartDate = new Date('2026-10-19T12:30:00.000Z'); // 19 Oct 2026, 6:00 PM IST
  const eventEndDate = new Date('2026-10-19T18:30:00.000Z');   // 19 Oct 2026, 12:00 AM IST

  const event = await prisma.event.create({
    data: {
      title: 'Dandiya Night 3.0',
      slug: 'dandiya-night-3-katoria',
      tagline: 'नाचेगा KATORIA एक साथ',
      description:
        'Dandiya Night 3.0 is a festive evening in Katoria presented by Starlight Club and organised by Ankit Keshri & Team. Join friends and family for Dandiya, music, entertainment, food and beverages, exciting prizes and memorable moments.',
      startDate: eventStartDate,
      endDate: eventEndDate,
      doorsOpenTime: '06:00 PM IST',
      heroImageUrl: 'https://images.unsplash.com/photo-1578632767115-351597cf2477?auto=format&fit=crop&w=1200&q=80',
      heroVideoUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      status: 'PUBLISHED',
      venueId: venue.id,
      organizerId: organizer.id,
      whatsappGroupUrl: 'https://chat.whatsapp.com/invite/dandiya-night-katoria',
      whatsappGroupTitle: 'Dandiya Night 3.0 Official Pass Holders',
      whatsappGroupDesc: 'Emergency updates, announcements & gate guidelines',
      whatsappEnabled: true,
      instructions:
        '1. Digital pass required at entry.\n2. Traditional attire encouraged.\n3. Dandiya sticks provided at venue.',
      termsAndConditions: `1. Entry is subject to successful ticket validation.
2. Attendees should carry their valid digital ticket/QR code.
3. Event starts at 6:00 PM onwards.
4. Attendees must follow instructions provided by event staff and volunteers.
5. Event arrangements may be subject to operational or weather-related changes communicated by the organisers.`,
      refundPolicy:
        'Refunds will be handled according to the cancellation and refund policy configured by the event organisers and applicable payment gateway.',
    },
  });

  // 9. Create Clean Ticket Types & Zero-Sold Inventories
  const ticketTypesData = [
    {
      name: 'Single Entry Pass',
      category: TicketCategory.REGULAR,
      description: 'Individual entry pass for Dandiya Night 3.0 at Indira Garden, Katoria.',
      price: 99,
      maxPerOrder: 10,
      totalCapacity: 500,
      orderIndex: 1,
    },
    {
      name: 'Couple Pass',
      category: TicketCategory.COUPLE,
      description: 'Entry pass for two persons for Dandiya Night 3.0 at Indira Garden, Katoria.',
      price: 149,
      maxPerOrder: 5,
      totalCapacity: 500,
      orderIndex: 2,
    },
  ];

  for (const t of ticketTypesData) {
    await prisma.ticketType.create({
      data: {
        eventId: event.id,
        name: t.name,
        category: t.category,
        description: t.description,
        price: t.price,
        maxPerOrder: t.maxPerOrder,
        orderIndex: t.orderIndex,
        saleStartDate: new Date(now.getTime() - 15 * 86400000),
        saleEndDate: new Date(eventEndDate.getTime() + 4 * 3600000),
        status: TicketSaleStatus.ACTIVE,
        inventory: {
          create: {
            totalCapacity: t.totalCapacity,
            reservedCount: 0,
            soldCount: 0,
          },
        },
      },
    });
  }
  console.log('✅ Created Clean Ticket Types: Single Entry Pass (₹99), Couple Pass (₹149) [Sold: 0, Reserved: 0]');

  // 10. Legitimate Promotional Coupons (Used: 0)
  const couponsData = [
    {
      code: 'KATORIA10',
      description: 'Festival promotional discount - 10% off up to ₹50',
      discountType: CouponDiscountType.PERCENTAGE,
      discountValue: 10,
      minOrderAmount: 99,
      maxDiscount: 50,
      usageLimit: 1000,
      usedCount: 0,
      validFrom: new Date(now.getTime() - 10 * 86400000),
      validUntil: new Date(eventEndDate.getTime()),
    },
    {
      code: 'KATORIA50',
      description: 'Festival promotional discount - flat ₹50 off on orders above ₹149',
      discountType: CouponDiscountType.FIXED_AMOUNT,
      discountValue: 50,
      minOrderAmount: 149,
      usageLimit: 500,
      usedCount: 0,
      validFrom: new Date(now.getTime() - 10 * 86400000),
      validUntil: new Date(eventEndDate.getTime()),
    },
  ];

  for (const c of couponsData) {
    await prisma.coupon.create({ data: c });
  }

  // 11. Create Legitimate FAQs
  const faqsData = [
    {
      question: 'When and where is Dandiya Night 3.0 happening?',
      answer: 'Dandiya Night 3.0 will be held on 19 October 2026 at Indira Garden, Katoria. The event starts from 6:00 PM onwards.',
      category: 'Event Information',
      orderIndex: 1,
    },
    {
      question: 'What is the ticket price?',
      answer: 'The Single Entry Pass is ₹99 per person and the Couple Pass is ₹149 for two persons.',
      category: 'Tickets',
      orderIndex: 2,
    },
    {
      question: 'Are Dandiya sticks available at the venue?',
      answer: 'Yes. Dandiya sticks will be available at Indira Garden for attendees.',
      category: 'Equipment',
      orderIndex: 3,
    },
    {
      question: 'Is parking available?',
      answer: 'Secure parking is available at the venue for attendees.',
      category: 'Venue & Parking',
      orderIndex: 4,
    },
    {
      question: 'How do digital tickets and QR entry work?',
      answer: 'After successful booking, a digital ticket with a unique QR code is generated. Present the QR code at the entry gate for validation.',
      category: 'Ticketing',
      orderIndex: 5,
    },
    {
      question: 'What if I need a refund?',
      answer: 'Refund requests are handled according to the refund policy configured by the event organisers and applicable payment gateway.',
      category: 'Refunds',
      orderIndex: 6,
    },
  ];

  for (const f of faqsData) {
    await prisma.faq.create({
      data: {
        eventId: event.id,
        question: f.question,
        answer: f.answer,
        category: f.category,
        orderIndex: f.orderIndex,
      },
    });
  }

  // 12. Create Event Gallery
  await prisma.gallery.create({
    data: {
      eventId: event.id,
      title: 'Previous Dandiya Night Moments',
      slug: 'previous-dandiya-night-moments',
      description: 'Previous event moments and festive highlights showcased through the gallery.',
      images: {
        create: [
          {
            imageUrl: 'https://images.unsplash.com/photo-1578632767115-351597cf2477?auto=format&fit=crop&w=1200&q=80',
            caption: 'Electrifying Garba circle under the night illumination in Katoria',
            altText: 'Traditional Dandiya Raas celebration',
            orderIndex: 1,
          },
          {
            imageUrl: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?auto=format&fit=crop&w=1200&q=80',
            caption: 'High-energy DJ beats and synchronized wooden Dandiya strikes',
            altText: 'Youth celebrating with colorful Dandiya sticks',
            orderIndex: 2,
          },
          {
            imageUrl: 'https://images.unsplash.com/photo-1533174072545-7a4b6ad7a6c3?auto=format&fit=crop&w=1200&q=80',
            caption: 'Grand stage lighting and festive decor at Indira Garden',
            altText: 'Festival lighting and crowd atmosphere',
            orderIndex: 3,
          },
          {
            imageUrl: 'https://images.unsplash.com/photo-1492684223066-81342ee5ff30?auto=format&fit=crop&w=1200&q=80',
            caption: 'Best Dressed Contestants in royal ethnic traditional attire',
            altText: 'Traditional ethnic Chaniya Choli and Kediyu attire',
            orderIndex: 4,
          },
          {
            imageUrl: 'https://images.unsplash.com/photo-1516450360452-9312f5e86fc7?auto=format&fit=crop&w=1200&q=80',
            caption: 'Auspicious evening Diya lighting and collective Aarti',
            altText: 'Diya ceremony at Dandiya Night',
            orderIndex: 5,
          },
          {
            imageUrl: 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?auto=format&fit=crop&w=1200&q=80',
            caption: 'Celebratory midnight Raas finale with hundreds of dancing attendees',
            altText: 'Midnight finale celebration',
            orderIndex: 6,
          },
        ],
      },
    },
  });

  // 13. Create Official Ticket Template with Canva Layout Configuration
  await prisma.ticketTemplate.create({
    data: {
      eventId: event.id,
      name: 'Dandiya Night 3.0 Official Pass Template',
      bannerUrl: 'https://images.unsplash.com/photo-1578632767115-351597cf2477?auto=format&fit=crop&w=800&q=80',
      primaryColor: '#6B0F1A',
      accentColor: '#D4AF37',
      textColor: '#FFFFFF',
      qrPosition: 'RIGHT',
      footerNotes: 'Carry your valid digital ticket and QR code. Entry is subject to QR turnstile validation.',
      termsText: 'Ticket is valid only for Dandiya Night 3.0 on 19 October 2026 at Indira Garden, Katoria.',
      isDefault: true,
      versions: {
        create: {
          version: 1,
          config: {
            badgeText: 'OFFICIAL ENTRY PASS',
            tagline: 'नाचेगा KATORIA एक साथ • Presented by Starlight Club',
            primaryColor: '#6B0F1A',
            accentColor: '#D4AF37',
            textColor: '#FFFFFF',
            qrPosition: 'RIGHT',
            termsText: 'Ticket is valid only for Dandiya Night 3.0 on 19 October 2026 at Indira Garden, Katoria.',
            footerNotes: 'Carry your valid digital ticket and QR code. Entry is subject to QR turnstile validation.',
            showWhatsApp: true,
          },
          status: 'PUBLISHED',
        },
      },
    },
  });

  // 14. Create Official Sponsors
  const sponsorsData = [
    {
      name: 'Starlight Club',
      tier: 'PRESENTED_BY',
      logoUrl: '/logo.svg',
      websiteUrl: 'https://starlightclub.in',
      socialLinks: {
        instagram: 'https://instagram.com/dandiya_night_katoria',
        website: 'https://starlightclub.in',
      },
      orderIndex: 1,
    },
    {
      name: 'Katoria Youth Association',
      tier: 'COMMUNITY_PARTNER',
      logoUrl: '/logo.svg',
      websiteUrl: '#',
      socialLinks: {
        instagram: 'https://instagram.com/katoriayouth',
      },
      orderIndex: 2,
    },
    {
      name: 'Indira Garden Hospitality',
      tier: 'VENUE_PARTNER',
      logoUrl: '/logo.svg',
      websiteUrl: '#',
      socialLinks: {
        website: 'https://indiragarden.com',
      },
      orderIndex: 3,
    },
  ];

  for (const s of sponsorsData) {
    await prisma.sponsor.create({
      data: {
        eventId: event.id,
        name: s.name,
        tier: s.tier,
        logoUrl: s.logoUrl,
        websiteUrl: s.websiteUrl,
        socialLinks: s.socialLinks,
        orderIndex: s.orderIndex,
        isPublished: true,
      },
    });
  }

  console.log('✨ Seed completed successfully with zero fake transactions, zero seeded participants, and 1 Super Admin.');
}

main()
  .catch((e) => {
    console.error('Seed execution error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });