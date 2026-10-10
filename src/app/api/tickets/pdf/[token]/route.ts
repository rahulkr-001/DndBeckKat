import { NextRequest, NextResponse } from 'next/server';
import { generateTicketPdfBuffer } from '@/lib/tickets/pdf';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;
    const cleanToken = token.replace(/^DND-TKT:/, '').trim();

    const pdfBuffer = await generateTicketPdfBuffer(cleanToken);

    return new Response(new Uint8Array(pdfBuffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="Dandiya-Utsav-Ticket-${cleanToken.slice(0, 8)}.pdf"`,
        'Cache-Control': 'private, max-age=3600',
      },
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || 'Ticket PDF generation failed' },
      { status: 404 }
    );
  }
}
