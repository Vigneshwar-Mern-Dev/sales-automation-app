import { NextRequest, NextResponse } from "next/server";
import { db } from "@/app/lib/db";
import { requireUser } from "@/app/lib/session";

type RouteContext = {
  params: Promise<{
    leadId: string;
  }>;
};

function parseDueAt(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const date = new Date(value);

  return Number.isNaN(date.getTime()) ? null : date;
}

export async function POST(request: NextRequest, context: RouteContext) {
  const user = await requireUser();
  const { leadId } = await context.params;
  const body = (await request.json().catch(() => ({}))) as {
    dueAt?: unknown;
    note?: unknown;
    assignedToId?: unknown;
  };
  const dueAt = parseDueAt(body.dueAt);
  const note = typeof body.note === "string" ? body.note.trim() : null;
  const requestedAssigneeId =
    typeof body.assignedToId === "string" && body.assignedToId.trim()
      ? body.assignedToId.trim()
      : user.id;
  const assignedToId = user.role === "ADMIN" ? requestedAssigneeId : user.id;

  if (!dueAt) {
    return NextResponse.json({ error: "A valid dueAt ISO date is required." }, { status: 400 });
  }

  const lead = await db.callLead.findFirst({
    where: { id: leadId, deletedAt: null, isArchived: false },
    select: { id: true, assignedToId: true },
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

  const assignee = await db.user.findFirst({
    where: { id: assignedToId, isActive: true },
    select: { id: true, username: true },
  });

  if (!assignee) {
    return NextResponse.json({ error: "Assigned user not found." }, { status: 404 });
  }

  const followUp = await db.$transaction(async (tx) => {
    const created = await tx.callFollowUp.create({
      data: {
        leadId: lead.id,
        assignedToId: assignee.id,
        dueAt,
        note,
      },
    });

    await tx.callLead.update({
      where: { id: lead.id },
      data: {
        assignedToId: assignee.id,
        nextFollowUpAt: dueAt,
        status: "FOLLOW_UP",
      },
    });

    await tx.callActivity.create({
      data: {
        leadId: lead.id,
        userId: user.id,
        actionType: "FOLLOW_UP_UPDATE",
        description: `Follow-up scheduled for ${dueAt.toISOString()} and assigned to ${assignee.username}`,
      },
    });

    return created;
  });

  return NextResponse.json({ ok: true, followUp });
}
