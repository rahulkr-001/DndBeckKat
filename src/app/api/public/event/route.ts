import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { TicketSaleStatus } from '@prisma/client';

export async function GET(req: NextRequest) {
  try {
    const event = await prisma.event.findFirst({
      where: { status: 'PUBLISHED' },
      include: {
        venue: {
          include: {
            photos: {
              where: { isPublished: true },
              orderBy: [{ isFeatured: 'desc' }, { orderIndex: 'asc' }],
            },
          },
        },
        organizer: true,
        ticketTypes: {
          where: { status: { not: TicketSaleStatus.HIDDEN } },
          include: { inventory: true },
          orderBy: { orderIndex: 'asc' },
        },
        faqs: { orderBy: { orderIndex: 'asc' } },
        galleries: {
          where: { isPublished: true },
          include: {
            images: {
              where: { isPublished: true },
              orderBy: { orderIndex: 'asc' },
            },
          },
        },
        ticketTemplates: {
          where: { isDefault: true },
          take: 1,
        },
        story: true,
        highlights: {
          where: { isActive: true },
          orderBy: { orderIndex: 'asc' },
        },
        schedules: {
          where: { isActive: true },
          orderBy: { orderIndex: 'asc' },
        },
        testimonials: {
          where: { isPublished: true, moderationStatus: 'APPROVED' },
          orderBy: { orderIndex: 'asc' },
        },
        teamMembers: {
          where: { isPublished: true },
          orderBy: { orderIndex: 'asc' },
        },
        sponsors: {
          where: { isPublished: true },
          orderBy: { orderIndex: 'asc' },
        },
        videos: {
          where: { isPublished: true },
          orderBy: { orderIndex: 'asc' },
        },
      },
    });

    if (!event) {
      return NextResponse.json({ error: 'No active published event found' }, { status: 404 });
    }

    // Process ticket types to include remaining inventory counts
    const processedTicketTypes = event.ticketTypes.map((tt) => {
      const inv = tt.inventory;
      const totalCapacity = inv?.totalCapacity ?? 0;
      const reservedCount = inv?.reservedCount ?? 0;
      const soldCount = inv?.soldCount ?? 0;
      const remaining = Math.max(0, totalCapacity - reservedCount - soldCount);
      const isSoldOut = remaining <= 0 || tt.status === TicketSaleStatus.SOLD_OUT;

      return {
        id: tt.id,
        name: tt.name,
        category: tt.category,
        description: tt.description,
        price: Number(tt.price),
        currency: tt.currency,
        maxPerOrder: tt.maxPerOrder,
        remaining,
        totalCapacity,
        isSoldOut,
        status: isSoldOut ? TicketSaleStatus.SOLD_OUT : tt.status,
      };
    });

    // Curated Default Story / About if not yet configured in DB
    const story = event.story || {
      badge: 'THE CULTURAL PHENOMENON',
      heading: "Katoria's Biggest Festive Celebration Returns",
      story:
        'Dandiya Night 3.0 brings together the spirit of Navratri, the rhythmic pulse of traditional Raas, and high-energy Bollywood music at the scenic Indira Garden in Katoria. Presented by Starlight Club and organized by Ankit Keshri & Team, this festival unites friends, families, and youth for an unforgettable evening under the starlit sky. Featuring authentic dandiya sticks, high-voltage sound & lighting, delicious food stalls, and grand competitions with exciting prizes.',
      highlightOne: 'Authentic Live Dhol & Bollywood Dandiya Beats',
      highlightTwo: 'Grand Raas Circle under the Stars',
      imageOneUrl:
        'https://images.unsplash.com/photo-1578632767115-351597cf2477?auto=format&fit=crop&w=1200&q=80',
      imageTwoUrl:
        'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?auto=format&fit=crop&w=1200&q=80',
    };

    // Curated Default Highlights if DB collection is empty
    const defaultHighlights = [
      {
        id: 'hl-1',
        title: 'Dandiya Sticks at Garden',
        description:
          'Traditional decorative wooden sticks available right inside Indira Garden for all attendees.',
        iconName: 'Sparkles',
        badge: 'Available at Venue',
      },
      {
        id: 'hl-2',
        title: 'High-Energy Live DJ & Dhol',
        description:
          'Non-stop Garba, Bollywood remixes & Gujarati folk beats curated for the grand dancing circle.',
        iconName: 'Music',
        badge: 'Live Beats',
      },
      {
        id: 'hl-3',
        title: 'Festive Food & Beverage Stalls',
        description:
          'Delicious festive delicacies, refreshing mocktails, and live street food counters throughout the venue.',
        iconName: 'Utensils',
        badge: 'Food Fiesta',
      },
      {
        id: 'hl-4',
        title: 'Festive Selfie & 360° Photo Booths',
        description:
          'Capture traditional ethnic portraits with royal festive backdrop installations and lighting.',
        iconName: 'Camera',
        badge: 'Memories',
      },
      {
        id: 'hl-5',
        title: 'Grand Prizes & Contests',
        description:
          'Exciting awards for Best Dressed Couple, Best Dancer, and Best Traditional Attire.',
        iconName: 'Trophy',
        badge: 'Win Big',
      },
      {
        id: 'hl-6',
        title: 'Secure Parking & CCTV Surveillance',
        description:
          'Spacious dedicated vehicle parking with full CCTV surveillance and security volunteers.',
        iconName: 'ShieldCheck',
        badge: 'Safe & Secure',
      },
    ];

    const highlights = event.highlights.length > 0 ? event.highlights : defaultHighlights;

    // Curated Default Schedule if DB collection is empty
    const defaultSchedules = [
      {
        id: 'sch-1',
        time: '06:00 PM',
        title: 'Gates Open & Welcome Raas',
        description: 'Check-in at Indira Garden gates with atomic QR scan; Dandiya sticks distribution.',
      },
      {
        id: 'sch-2',
        time: '06:45 PM',
        title: 'Aarti & Diya Lighting Ceremony',
        description: 'Traditional auspicious lighting of lamps celebrating cultural heritage and positivity.',
      },
      {
        id: 'sch-3',
        time: '07:15 PM',
        title: 'Traditional Garba Circle',
        description: 'Slow and rhythmic 2-taali and 3-taali Garba steps for everyone to warm up together.',
      },
      {
        id: 'sch-4',
        time: '08:30 PM',
        title: 'High-Energy Bollywood Dandiya Raas',
        description: 'Live DJ transition to fast-paced Dandiya beats, vibrant sound, and synchronized steps.',
      },
      {
        id: 'sch-5',
        time: '09:30 PM',
        title: 'Food, Refreshments & Contests',
        description: 'Enjoy delicious street food stalls while judges assess traditional attire and dancing.',
      },
      {
        id: 'sch-6',
        time: '10:30 PM',
        title: 'Grand Finale & Prize Ceremony',
        description: 'Award ceremony for winners followed by the final celebratory dance circle till close.',
      },
    ];

    const schedules = event.schedules.length > 0 ? event.schedules : defaultSchedules;

    // Curated Default Testimonials if DB collection is empty
    const defaultTestimonials = [
      {
        id: 't-1',
        name: 'Vikash Keshri',
        role: 'Katoria Resident',
        quote:
          'Dandiya Night in Katoria has completely changed how our town celebrates festivals. The lighting, decor, and family atmosphere at Indira Garden is simply unmatched!',
        rating: 5,
        avatarUrl:
          'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=200&q=80',
      },
      {
        id: 't-2',
        name: 'Pooja & Amit',
        role: 'Couple Pass Attendees',
        quote:
          'The couple entry was super smooth. We got our sticks at the gate, danced for 4 hours non-stop, and the food stalls were fantastic. Can’t wait for 3.0!',
        rating: 5,
        avatarUrl:
          'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=200&q=80',
      },
      {
        id: 't-3',
        name: 'Sneha Baranwal',
        role: 'Student & Cultural Enthusiast',
        quote:
          'Best festive night of the year! The DJ playlist was incredible and the security arrangements made everyone feel completely safe.',
        rating: 5,
        avatarUrl:
          'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=200&q=80',
      },
    ];

    const testimonials = event.testimonials.length > 0 ? event.testimonials : defaultTestimonials;

    // Curated Default Team if DB collection is empty
    const defaultTeam = [
      {
        id: 'team-1',
        name: 'Ankit Keshri',
        role: 'Event Director & Lead Organiser',
        bio: 'Leading community cultural initiatives with Starlight Club to bring grand-scale festive productions to Katoria.',
        imageUrl:
          'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=300&q=80',
        socialLinks: { instagram: 'https://instagram.com/dandiya_night_katoria' },
      },
      {
        id: 'team-2',
        name: 'Starlight Club Committee',
        role: 'Operations & Volunteer Coordinators',
        bio: 'A committed team of youth ensuring crowd management, sound coordination, stage lighting, and attendee support.',
        imageUrl:
          'https://images.unsplash.com/photo-1522071820081-009f0129c71c?auto=format&fit=crop&w=300&q=80',
        socialLinks: { instagram: 'https://instagram.com/dandiya_night_katoria' },
      },
    ];

    const teamMembers = event.teamMembers.length > 0 ? event.teamMembers : defaultTeam;

    // Curated Default Sponsors if DB collection is empty
    const defaultSponsors = [
      {
        id: 'sp-1',
        name: 'Starlight Club',
        tier: 'PRESENTED_BY',
        logoUrl: '/logo.svg',
        websiteUrl: 'https://starlightclub.in',
      },
      {
        id: 'sp-2',
        name: 'Katoria Youth Association',
        tier: 'COMMUNITY_PARTNER',
        logoUrl: '/logo.svg',
        websiteUrl: '#',
      },
      {
        id: 'sp-3',
        name: 'Indira Garden Hospitality',
        tier: 'VENUE_PARTNER',
        logoUrl: '/logo.svg',
        websiteUrl: '#',
      },
    ];

    const sponsors = event.sponsors.length > 0 ? event.sponsors : defaultSponsors;

    // Curated Default Videos if DB collection is empty
    const defaultVideos = [
      {
        id: 'v-1',
        title: 'Dandiya Night 3.0 Official Promo',
        description: 'Experience the electric energy, joyful Garba circles, and festive vibes of Katoria.',
        videoUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
        thumbnailUrl:
          'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?auto=format&fit=crop&w=800&q=80',
        isFeatured: true,
      },
    ];

    const videos = event.videos.length > 0 ? event.videos : defaultVideos;

    return NextResponse.json({
      event: {
        id: event.id,
        title: event.title,
        slug: event.slug,
        tagline: event.tagline,
        description: event.description,
        startDate: event.startDate,
        endDate: event.endDate,
        doorsOpenTime: event.doorsOpenTime,
        heroImageUrl: event.heroImageUrl,
        heroVideoUrl: event.heroVideoUrl,
        termsAndConditions: event.termsAndConditions,
        refundPolicy: event.refundPolicy,
        whatsappGroupUrl: event.whatsappGroupUrl || 'https://chat.whatsapp.com/invite/dandiya-night-katoria',
        whatsappGroupTitle: event.whatsappGroupTitle || 'Dandiya Night 3.0 Official Pass Holders',
        whatsappGroupDesc: event.whatsappGroupDesc || 'Emergency updates, announcements & gate guidelines',
        whatsappEnabled: event.whatsappEnabled ?? true,
        instructions: event.instructions || null,
        venue: event.venue,
        organizer: event.organizer,
        ticketTypes: processedTicketTypes,
        faqs: event.faqs,
        gallery: {
          id: event.galleries[0]?.id || 'default-gallery',
          title: event.galleries[0]?.title || 'Festival Retrospective',
          images: event.galleries.flatMap((g) => g.images),
        },
        template: event.ticketTemplates[0] || null,
        story,
        highlights,
        schedules,
        testimonials,
        teamMembers,
        sponsors,
        videos,
      },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
