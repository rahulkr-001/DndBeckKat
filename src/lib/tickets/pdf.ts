import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';
import { prisma } from '../prisma';

export interface TicketPdfOptions {
  validationToken?: string;
  templateOverride?: any;
}

export async function generateTicketPdfBuffer(validationToken: string): Promise<Buffer> {
  const ticket = await prisma.ticket.findUnique({
    where: { validationToken },
    include: {
      order: {
        include: {
          event: {
            include: {
              venue: true,
              organizer: true,
              ticketTemplates: {
                where: { isDefault: true },
                take: 1,
              },
            },
          },
        },
      },
      ticketType: true,
      user: true,
    },
  });

  if (!ticket) {
    throw new Error('Ticket not found');
  }

  const { order, ticketType } = ticket;
  const { event } = order;
  const { venue } = event;

  // Retrieve active template and layoutConfig
  const template = event.ticketTemplates?.[0] || null;
  const layoutConfig = (template?.layoutConfig as any) || {};

  return buildPdfDoc({
    ticket,
    order,
    ticketType,
    event,
    venue,
    template,
    layoutConfig,
  });
}

/**
 * Generate a sample A4 preview PDF for the Admin Ticket Template Editor
 */
export async function generateSampleTicketPdfBuffer(templateConfig: any): Promise<Buffer> {
  const defaultEvent = await prisma.event.findFirst({
    where: { status: 'PUBLISHED' },
    include: { venue: true, organizer: true },
  }) || await prisma.event.findFirst({
    include: { venue: true, organizer: true },
  });

  const dummyTicket = {
    ticketNumber: 'DND-2026-SAMPLE',
    attendeeName: 'Rahul Sharma (Sample Pass)',
    validationToken: 'DND-TKT:SAMPLE-VALIDATION-TOKEN-PREVIEW-99999',
    qrPayload: 'https://dandiya.katoria.in/verify/SAMPLE-VALIDATION-TOKEN',
    status: 'ISSUED',
  };

  const dummyOrder = {
    orderNumber: 'ORD-SAMPLE-2026',
    customerName: 'Rahul Sharma',
    customerPhone: '+91 98765 43210',
    totalAmount: '149.00',
  };

  const dummyTicketType = {
    name: 'Couple Entry Pass',
    category: 'COUPLE',
    price: 149,
  };

  const dummyVenue = defaultEvent?.venue || {
    name: 'Indira Garden, Katoria',
    address: 'Main Bypass Road, Katoria, Banka, Bihar 813106',
    entryGateInfo: 'Gate A - Turnstile Laser Scan Check',
  };

  const dummyEvent = defaultEvent || {
    title: 'Dandiya Night 3.0 — Katoria',
    tagline: 'नाचेगा KATORIA एक साथ • Presented by Starlight Club',
    startDate: new Date('2026-10-19T18:00:00Z'),
    doorsOpenTime: '06:00 PM IST',
    whatsappGroupUrl: 'https://chat.whatsapp.com/invite/dandiya-night-katoria',
    whatsappGroupTitle: 'Official Emergency WhatsApp Group',
    whatsappEnabled: true,
    organizer: {
      name: 'Starlight Club (Ankit Keshri & Team)',
      phone: '+91 98765 43210',
      email: 'helpline@starlightclub.in',
    },
  };

  return buildPdfDoc({
    ticket: dummyTicket,
    order: dummyOrder,
    ticketType: dummyTicketType,
    event: dummyEvent,
    venue: dummyVenue,
    template: templateConfig,
    layoutConfig: templateConfig?.layoutConfig || templateConfig,
  });
}

interface BuildPdfParams {
  ticket: any;
  order: any;
  ticketType: any;
  event: any;
  venue: any;
  template: any;
  layoutConfig: any;
}

async function buildPdfDoc({
  ticket,
  order,
  ticketType,
  event,
  venue,
  template,
  layoutConfig,
}: BuildPdfParams): Promise<Buffer> {
  // Styling configuration from template & layoutConfig
  const PRIMARY_COLOR = layoutConfig?.primaryColor || template?.primaryColor || '#6B0F1A';
  const ACCENT_COLOR = layoutConfig?.accentColor || template?.accentColor || '#D4AF37';
  const TEXT_COLOR = layoutConfig?.textColor || template?.textColor || '#FFFFFF';
  const QR_POSITION = (layoutConfig?.qrPosition || template?.qrPosition || 'RIGHT').toUpperCase();
  const QR_SIZE = layoutConfig?.qrSize === 'LARGE' ? 175 : 155;
  const BADGE_TEXT = layoutConfig?.badgeText || 'OFFICIAL VERIFIED ENTRY PASS';
  const TERMS_TEXT = layoutConfig?.termsText || template?.termsText || null;
  const FOOTER_NOTES = layoutConfig?.footerNotes || template?.footerNotes || null;

  const DARK = '#1A0B2E';
  const TEXT_MUTED = '#555555';

  // Generate cryptographic QR code buffer
  const qrBuffer = await QRCode.toBuffer(ticket.qrPayload || ticket.validationToken, {
    width: 240,
    margin: 1,
    color: {
      dark: '#3A030A',
      light: '#FFFFFF',
    },
  });

  return new Promise((resolve, reject) => {
    // Exact A4 dimensions: 595.28 pt width x 841.89 pt height
    const doc = new PDFDocument({
      size: 'A4',
      margin: 36,
      info: {
        Title: `Dandiya Night 3.0 Official Pass - ${ticket.ticketNumber}`,
        Author: event.organizer?.name || 'Starlight Club',
        Subject: 'Official Festival Entry E-Ticket',
      },
    });

    const buffers: Buffer[] = [];
    doc.on('data', buffers.push.bind(buffers));
    doc.on('end', () => resolve(Buffer.concat(buffers)));
    doc.on('error', reject);

    // Decorative Gold Outer Border around page
    doc.lineWidth(2).strokeColor(ACCENT_COLOR).rect(36, 36, 523, 770).stroke();

    // 1. Header Festive Banner
    doc.rect(38, 38, 519, 115).fill(PRIMARY_COLOR);

    // Event Title
    doc.fillColor(TEXT_COLOR).fontSize(21).font('Helvetica-Bold');
    doc.text(event.title || 'Dandiya Night 3.0 — Katoria', 55, 52, { width: 485 });

    // Subtitle / Tagline
    doc.fillColor(ACCENT_COLOR).fontSize(10.5).font('Helvetica');
    doc.text(event.tagline || 'नाचेगा KATORIA एक साथ • Presented by Starlight Club', 55, 79, { width: 485 });

    // Sub-badge & Booking Reference
    doc.fillColor('#FFE4E8').fontSize(9).font('Helvetica-Bold');
    doc.text(BADGE_TEXT, 55, 108);

    doc.fillColor(TEXT_COLOR).fontSize(8.5).font('Helvetica');
    doc.text(`BOOKING REF: ${order.orderNumber}`, 350, 108, { align: 'right', width: 190 });

    // Thin accent divider
    doc.strokeColor(ACCENT_COLOR).lineWidth(1.5).moveTo(38, 153).lineTo(557, 153).stroke();

    // 2. Middle Section: Attendee & Ticket Info
    const startY = 170;

    const renderDetails = (detailsX: number, detailsWidth: number) => {
      doc.fillColor(TEXT_MUTED).fontSize(8.5).font('Helvetica');
      doc.text('PASS HOLDER / ATTENDEE', detailsX, startY);
      doc.fillColor(DARK).fontSize(13.5).font('Helvetica-Bold');
      doc.text(ticket.attendeeName, detailsX, startY + 13);

      doc.fillColor(TEXT_MUTED).fontSize(8.5).font('Helvetica');
      doc.text('TICKET TIER & CATEGORY', detailsX, startY + 42);
      doc.fillColor(PRIMARY_COLOR).fontSize(12).font('Helvetica-Bold');
      doc.text(`${ticketType.name} (${ticketType.category})`, detailsX, startY + 54);

      doc.fillColor(TEXT_MUTED).fontSize(8.5).font('Helvetica');
      doc.text('DATE & EVENT TIMING', detailsX, startY + 82);
      doc.fillColor(DARK).fontSize(11).font('Helvetica-Bold');
      const eventDateStr = event.startDate
        ? new Date(event.startDate).toLocaleDateString('en-IN', {
            weekday: 'long',
            day: 'numeric',
            month: 'long',
            year: 'numeric',
          })
        : 'Monday, 19 October 2026';
      doc.text(eventDateStr, detailsX, startY + 94);
      doc.fontSize(9.5).font('Helvetica').text(`Doors Open: ${event.doorsOpenTime || '06:00 PM IST'}`, detailsX, startY + 109);

      doc.fillColor(TEXT_MUTED).fontSize(8.5).font('Helvetica');
      doc.text('VENUE & GATE DETAILS', detailsX, startY + 133);
      doc.fillColor(DARK).fontSize(11).font('Helvetica-Bold');
      doc.text(venue.name || 'Indira Garden, Katoria', detailsX, startY + 145, { width: detailsWidth });
      doc.fontSize(9).font('Helvetica').text(venue.address || 'Katoria, Banka, Bihar', detailsX, startY + 160, { width: detailsWidth });
      doc.fillColor(PRIMARY_COLOR).fontSize(8.5).font('Helvetica-Bold').text(venue.entryGateInfo || 'Check Gate Signage on Arrival', detailsX, startY + 178, { width: detailsWidth });
    };

    const renderQrBlock = (qrX: number) => {
      doc.image(qrBuffer, qrX, startY + 5, { width: QR_SIZE });
      doc.fillColor(TEXT_MUTED).fontSize(7.5).font('Helvetica').text('SCAN AT ENTRY TURNSTILE', qrX, startY + QR_SIZE + 10, {
        width: QR_SIZE,
        align: 'center',
      });
      doc.fillColor(PRIMARY_COLOR).fontSize(8.5).font('Helvetica-Bold').text(ticket.ticketNumber, qrX, startY + QR_SIZE + 22, {
        width: QR_SIZE,
        align: 'center',
      });
    };

    if (QR_POSITION === 'LEFT') {
      renderQrBlock(55);
      renderDetails(240, 290);
    } else {
      renderDetails(55, 300);
      renderQrBlock(375);
    }

    // Divider Line
    doc.strokeColor('#E0D5C1').lineWidth(1).moveTo(55, startY + 215).lineTo(540, startY + 215).stroke();

    // 3. Security & Validation Token Strip
    doc.rect(55, startY + 226, 485, 32).fill('#FBF7EE');
    doc.fillColor(DARK).fontSize(8).font('Helvetica-Bold');
    doc.text('CRYPTOGRAPHIC VALIDATION TOKEN:', 65, startY + 233);
    doc.fillColor(TEXT_MUTED).fontSize(7).font('Courier');
    doc.text(ticket.validationToken, 65, startY + 244, { width: 465 });

    // 4. Official Emergency WhatsApp Community Strip (with clickable link)
    const whatsappUrl = event.whatsappGroupUrl || 'https://chat.whatsapp.com/invite/dandiya-night-katoria';
    const whatsappY = startY + 268;

    if (event.whatsappEnabled !== false) {
      doc.rect(55, whatsappY, 485, 42).fill('#F0FDF4');
      doc.strokeColor('#86EFAC').lineWidth(1).rect(55, whatsappY, 485, 42).stroke();

      doc.fillColor('#166534').fontSize(8.5).font('Helvetica-Bold');
      doc.text(event.whatsappGroupTitle || 'OFFICIAL EMERGENCY & PASS-HOLDER WHATSAPP GROUP', 65, whatsappY + 8);

      doc.fillColor('#15803D').fontSize(7.5).font('Helvetica');
      doc.text('Click link below for real-time announcements, weather alerts & gate entry assistance:', 65, whatsappY + 20);

      doc.fillColor('#047857').fontSize(8).font('Helvetica-Bold');
      doc.text(`> ${whatsappUrl}`, 65, whatsappY + 30, {
        link: whatsappUrl,
        underline: true,
      });
    }

    // 5. Entry Instructions & Festival Code
    const rulesY = whatsappY + 54;
    doc.fillColor(PRIMARY_COLOR).fontSize(10.5).font('Helvetica-Bold');
    doc.text('ENTRY INSTRUCTIONS & FESTIVAL CODE', 55, rulesY);

    let defaultRules = [
      '1. Strict Traditional Dress Code: Kediyu / Chaniya Choli / Kurta Pajama required. Casual attire not admitted.',
      '2. Present this digital or printed pass at the gate turnstiles for instant laser QR scanning.',
      '3. Each ticket permits a single unique entry. Once scanned, duplicate entries are flagged and denied automatically.',
      '4. Free polished wooden Dandiya sticks provided inside at the Welcome Pavilion.',
      '5. Alcohol, smoking, vaping, and metal weapons are strictly banned with zero tolerance.',
      '6. Carry a government photo ID (Aadhaar / Driving License / Passport) matching attendee name.',
    ];

    if (TERMS_TEXT && typeof TERMS_TEXT === 'string' && TERMS_TEXT.trim().length > 10) {
      defaultRules = TERMS_TEXT.split('\n').filter((l: string) => l.trim().length > 0);
    }

    doc.fillColor(DARK).fontSize(8).font('Helvetica');
    let currentRuleY = rulesY + 16;
    for (const r of defaultRules.slice(0, 7)) {
      doc.text(r, 60, currentRuleY, { width: 475 });
      currentRuleY += 14.5;
    }

    // 6. Footer Notes & Organizer Information
    doc.strokeColor('#E0D5C1').lineWidth(1).moveTo(55, currentRuleY + 8).lineTo(540, currentRuleY + 8).stroke();

    doc.fillColor(TEXT_MUTED).fontSize(8).font('Helvetica');
    const org = event.organizer || {};
    doc.text(
      `Organized by ${org.name || 'Starlight Club'} | Helpline: ${org.phone || '+91 98765 43210'} | ${org.email || 'helpline@starlightclub.in'}`,
      55,
      currentRuleY + 18,
      { width: 485, align: 'center' }
    );

    doc.fontSize(7).text(
      FOOTER_NOTES || 'This is a computer-generated cryptographically signed e-pass. No physical signature required.',
      55,
      currentRuleY + 31,
      { width: 485, align: 'center' }
    );

    doc.end();
  });
}
