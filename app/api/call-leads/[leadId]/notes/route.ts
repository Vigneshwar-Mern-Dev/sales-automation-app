import { NextRequest, NextResponse } from "next/server";
import { db } from "@/app/lib/db";
import { requireUser } from "@/app/lib/session";

type RouteContext = {
  params: Promise<{
    leadId: string;
  }>;
};

export async function POST(request: NextRequest, context: RouteContext) {
  const user = await requireUser();
  const { leadId } = await context.params;
  const body = (await request.json().catch(() => ({}))) as { note?: unknown };
  const note = typeof body.note === "string" ? body.note.trim() : "";

  if (!note) {
    return NextResponse.json({ error: "note is required." }, { status: 400 });
  }

  const lead = await db.callLead.findFirst({
    where: { id: leadId, deletedAt: null, isArchived: false },
    select: { id: true, notes: true, assignedToId: true },
  });

  if (!lead) {
    return NextResponse.json({ error: "Call lead not found." }, { status: 404 });
  }

  if (user.role !== "ADMIN" && lead.assignedToId !== user.id) {
    return NextResponse.json(
      { error: "Unauthorized. Claim or assign this call lead first." },
      { status: 403 },
    );
  }

  const timestamp = new Date().toISOString();
  const nextNotes = lead.notes
    ? `${lead.notes}\n\n[${timestamp}] ${user.username}: ${note}`
    : `[${timestamp}] ${user.username}: ${note}`;

  await db.callLead.update({
    where: { id: lead.id },
    data: {
      notes: nextNotes,
      lastContactedAt: new Date(),
    },
  });

  await db.callActivity.create({
    data: {
      leadId: lead.id,
      userId: user.id,
      actionType: "NOTE_ADDED",
      description: note,
    },
  });

  return NextResponse.json({ ok: true });
}
