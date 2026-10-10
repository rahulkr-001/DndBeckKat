import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyAdminAuth } from '@/lib/auth/admin';
import { generateSampleTicketPdfBuffer } from '@/lib/tickets/pdf';
import { Role } from '@prisma/client';

export async function GET(req: NextRequest) {
  try {
    const auth = await verifyAdminAuth([Role.SUPER_ADMIN, Role.EVENT_ADMIN, Role.CONTENT_ADMIN]);
    if (!auth.authorized) return auth.response!;


    const { searchParams } = new URL(req.url);
    const isPreview = searchParams.get('preview') === 'true';

    if (isPreview) {
      const templateId = searchParams.get('templateId');
      let config: any = {};
      if (templateId) {
        const tmpl = await prisma.ticketTemplate.findUnique({ where: { id: templateId } });
        if (tmpl) config = tmpl.layoutConfig || tmpl;
      }

      const samplePdfBuffer = await generateSampleTicketPdfBuffer(config);
      return new Response(new Uint8Array(samplePdfBuffer), {
        status: 200,
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': 'inline; filename="Sample-Pass-Template-Preview.pdf"',
          'Cache-Control': 'no-store',
        },
      });
    }

    const templates = await prisma.ticketTemplate.findMany({
      include: {
        versions: { orderBy: { version: 'desc' } },
        event: { select: { id: true, title: true, startDate: true } },
      },
    });

    return NextResponse.json({ templates });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await verifyAdminAuth([Role.SUPER_ADMIN, Role.EVENT_ADMIN, Role.CONTENT_ADMIN]);
    if (!auth.authorized) return auth.response!;

    const body = await req.json();
    const { templateId, config, note } = body;

    if (!templateId) {
      return NextResponse.json({ error: 'Template ID is required to create a new version' }, { status: 400 });
    }

    const template = await prisma.ticketTemplate.findUnique({
      where: { id: templateId },
      include: { versions: { orderBy: { version: 'desc' }, take: 1 } },
    });

    if (!template) {
      return NextResponse.json({ error: 'Template not found' }, { status: 404 });
    }

    const nextVersionNumber = (template.versions[0]?.version || 0) + 1;

    const newVersion = await prisma.ticketTemplateVersion.create({
      data: {
        templateId,
        version: nextVersionNumber,
        config: config || {
          primaryColor: template.primaryColor,
          accentColor: template.accentColor,
          qrPosition: template.qrPosition,
          footerNotes: template.footerNotes,
          termsText: template.termsText,
          layoutConfig: template.layoutConfig,
          note: note || `Version ${nextVersionNumber} published`,
        },
        status: 'PUBLISHED',
      },
    });

    // Forensic audit log
    await prisma.auditLog.create({
      data: {
        userId: auth.user.id,
        action: 'TICKET_TEMPLATE_VERSION_PUBLISHED',
        resourceType: 'TicketTemplate',
        resourceId: templateId,
        details: { version: nextVersionNumber },
      },
    });

    return NextResponse.json({ success: true, version: newVersion });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const auth = await verifyAdminAuth([Role.SUPER_ADMIN, Role.EVENT_ADMIN, Role.CONTENT_ADMIN]);
    if (!auth.authorized) return auth.response!;

    const body = await req.json();
    const {
      id,
      name,
      primaryColor,
      accentColor,
      textColor,
      qrPosition,
      footerNotes,
      termsText,
      layoutConfig,
      createVersion,
    } = body;

    if (!id) {
      return NextResponse.json({ error: 'Template ID is required' }, { status: 400 });
    }

    const updated = await prisma.ticketTemplate.update({
      where: { id },
      data: {
        name: name || undefined,
        primaryColor: primaryColor || undefined,
        accentColor: accentColor || undefined,
        textColor: textColor || undefined,
        qrPosition: qrPosition || undefined,
        footerNotes: footerNotes !== undefined ? footerNotes : undefined,
        termsText: termsText !== undefined ? termsText : undefined,
        layoutConfig: layoutConfig !== undefined ? layoutConfig : undefined,
      },
      include: {
        versions: { orderBy: { version: 'desc' } },
        event: true,
      },
    });

    // Optionally create version on save
    if (createVersion) {
      const nextVer = (updated.versions[0]?.version || 0) + 1;
      await prisma.ticketTemplateVersion.create({
        data: {
          templateId: id,
          version: nextVer,
          config: {
            primaryColor: updated.primaryColor,
            accentColor: updated.accentColor,
            textColor: updated.textColor,
            qrPosition: updated.qrPosition,
            footerNotes: updated.footerNotes,
            termsText: updated.termsText,
            layoutConfig: updated.layoutConfig,
          },
          status: 'PUBLISHED',
        },
      });
    }

    // Forensic audit log
    await prisma.auditLog.create({
      data: {
        userId: auth.user.id,
        action: 'TICKET_TEMPLATE_UPDATED',
        resourceType: 'TicketTemplate',
        resourceId: id,
        details: { primaryColor: updated.primaryColor, accentColor: updated.accentColor },
      },
    });

    return NextResponse.json({ success: true, template: updated });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}
