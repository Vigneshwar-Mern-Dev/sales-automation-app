import { NextResponse } from "next/server";
import { db } from "@/app/lib/db";
import { WhatsAppLeadStatus } from "@/app/lib/prisma-enums";
import { validateBody } from "@/app/lib/validators/validate";
import { whatsappInboxPayloadSchema } from "@/app/lib/validators/whatsapp";

function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

function checkToken(request: Request) {
  const expectedToken = process.env.WHATSAPP_BRIDGE_TOKEN;
  const token = request.headers.get("x-whatsapp-bridge-token");
  return Boolean(expectedToken && token === expectedToken);
}

export async function POST(request: Request) {
  if (!checkToken(request)) {
    return unauthorized();
  }

  const validation = await validateBody(request, whatsappInboxPayloadSchema);
  if (!validation.success) {
    return validation.response;
  }

  const payload = validation.data;
  const phone = payload.phone;
  const message = payload.message;
  const receivedAt = payload.receivedAt ?? new Date();
  const snippet = message.slice(0, 200) || "(no text)";

  const account = await db.whatsAppAccount.findFirst({
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  const callLead = await db.callLead.upsert({
    where: { phone },
    update: { lastContactedAt: receivedAt },
    create: {
      phone,
      displayName: `Caller ${phone.slice(-4)}`,
      lastContactedAt: receivedAt,
    },
    select: { id: true },
  });
  const lead = await db.whatsAppLead.findFirst({
    where: { phone, deletedAt: null },
    orderBy: { updatedAt: "desc" },
    select: { id: true, status: true },
  });

  if (!lead) {
    const created = await db.whatsAppLead.create({
      data: {
        accountId: account?.id ?? null,
        phone,
        displayName: `Caller ${phone.slice(-4)}`,
        status: WhatsAppLeadStatus.REPLIED,
        lastReplyAt: receivedAt,
        lastReplySnippet: snippet,
      },
      select: { id: true },
    });

    await db.callActivity.create({
      data: {
        leadId: callLead.id,
        actionType: "NOTE_ADDED",
        description: `Inbound WhatsApp reply: ${snippet}`,
        metadata: { whatsappLeadId: created.id, receivedAt },
      },
    });

    return NextResponse.json({ ok: true, action: "created_from_unknown", leadId: created.id });
  }

  if (lead.status === WhatsAppLeadStatus.DO_NOT_CONTACT) {
    return NextResponse.json({ ok: true, action: "ignored_dnc" });
  }

  await db.$transaction([
    db.whatsAppLead.update({
      where: { id: lead.id },
      data: {
        status:
          lead.status === WhatsAppLeadStatus.FORM_SUBMITTED
            ? WhatsAppLeadStatus.FORM_SUBMITTED
            : WhatsAppLeadStatus.REPLIED,
        lastReplyAt: receivedAt,
        lastReplySnippet: snippet,
        lastError: null,
      },
    }),
    db.callActivity.create({
      data: {
        leadId: callLead.id,
        actionType: "NOTE_ADDED",
        description: `Inbound WhatsApp reply: ${snippet}`,
        metadata: { whatsappLeadId: lead.id, receivedAt },
      },
    }),
  ]);

  console.log(`[whatsapp-inbox] Tracked reply for lead ${lead.id} (${phone}).`);

  return NextResponse.json({ ok: true, action: "marked_replied", leadId: lead.id });
}
