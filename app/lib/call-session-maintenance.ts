"use server";

import "server-only";

import { db } from "./db";
import { autoQueueWhatsAppForCaller } from "./whatsapp-auto-queue";

const RINGING_TIMEOUT_MS = 2 * 60 * 1000;

export async function expireStaleRingingCalls() {
  const now = new Date();
  const cutoff = new Date(now.getTime() - RINGING_TIMEOUT_MS);
  const staleCalls = await db.callSession.findMany({
    where: {
      status: "RINGING",
      endedAt: null,
      deletedAt: null,
      isArchived: false,
      lead: { is: { deletedAt: null, isArchived: false } },
      firstRingAt: { lte: cutoff },
    },
    select: {
      id: true,
      leadId: true,
      callerNumber: true,
      callDirection: true,
      companyPhone: { select: { id: true, phoneNumber: true } },
      lead: { select: { displayName: true } },
    },
    orderBy: { firstRingAt: "asc" },
    take: 100,
  });

  if (!staleCalls.length) {
    return 0;
  }

  let expiredCount = 0;

  for (const call of staleCalls) {
    const transitioned = await db.$transaction(async (tx) => {
      const updated = await tx.callSession.updateMany({
        where: {
          id: call.id,
          status: "RINGING",
          endedAt: null,
          deletedAt: null,
          isArchived: false,
        },
        data: {
          status: "MISSED",
          endedAt: now,
        },
      });

      if (updated.count !== 1) return false;

      await tx.callActivity.create({
        data: {
          leadId: call.leadId,
          sessionId: call.id,
          actionType: "CALL_MISSED",
          description: `Call auto-marked missed after 2 minutes from ${call.callerNumber} to ${call.companyPhone.phoneNumber}`,
        },
      });

      return true;
    });

    if (!transitioned) continue;
    expiredCount += 1;

    if (call.callDirection === "INCOMING") {
      await autoQueueWhatsAppForCaller(
        call.callerNumber,
        call.lead.displayName,
        "MISSED",
        call.leadId,
        call.companyPhone.id,
      );
    }
  }

  return expiredCount;
}
