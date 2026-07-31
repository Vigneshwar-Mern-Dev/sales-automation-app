import { NextResponse } from "next/server";
import { db } from "@/app/lib/db";
import { requireUser } from "@/app/lib/session";

type RouteContext = {
  params: Promise<{
    callSessionId: string;
  }>;
};

export async function POST(_request: Request, context: RouteContext) {
  const user = await requireUser();
  const { callSessionId } = await context.params;

  const session = await db.callSession.findFirst({
    where: {
      id: callSessionId,
      deletedAt: null,
      isArchived: false,
      lead: { is: { deletedAt: null, isArchived: false } },
    },
    select: { id: true, leadId: true, assignedToId: true },
  });

  if (!session) {
    return NextResponse.json({ error: "Call session not found." }, { status: 404 });
  }

  if (session.assignedToId && session.assignedToId !== user.id) {
    return NextResponse.json(
      { error: "This call has already been claimed." },
      { status: 409 },
    );
  }

  const result = await db.$transaction(async (tx) => {
    const claimed = await tx.callSession.updateMany({
      where: {
        id: callSessionId,
        deletedAt: null,
        isArchived: false,
        OR: [{ assignedToId: null }, { assignedToId: user.id }],
      },
      data: { assignedToId: user.id },
    });

    if (claimed.count !== 1) {
      return { claimed: false };
    }

    const leadUpdated = await tx.callLead.updateMany({
      where: { id: session.leadId, deletedAt: null, isArchived: false },
      data: { assignedToId: user.id },
    });

    if (leadUpdated.count !== 1) {
      throw new Error("The call lead is no longer available.");
    }

    await tx.callActivity.create({
      data: {
        leadId: session.leadId,
        sessionId: session.id,
        userId: user.id,
        actionType: "ASSIGNMENT_CHANGE",
        description: `Call claimed by ${user.username}`,
      },
    });

    return { claimed: true };
  });

  if (!result.claimed) {
    return NextResponse.json(
      { error: "This call has already been claimed." },
      { status: 409 },
    );
  }

  return NextResponse.json({ ok: true });
}
