import process from "node:process";
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();
const apply = process.argv.includes("--apply");
const completedStatuses = ["SENT", "OPENED", "FORM_STARTED", "FORM_SUBMITTED"];
const activeStatuses = ["QUEUED", "SENDING"];
const statusPriority = new Map([
  ["SENT", 1],
  ["OPENED", 2],
  ["FORM_STARTED", 3],
  ["FORM_SUBMITTED", 4],
]);
const preserveLeadStatuses = new Set([
  "REPLIED",
  "DO_NOT_CONTACT",
  "INTERESTED",
  "CONVERTED",
  "CANCELLED",
]);

try {
  const leads = await db.whatsAppLead.findMany({
    where: { deletedAt: null, isArchived: false },
    select: {
      id: true,
      phone: true,
      status: true,
      lastError: true,
      lastSentAt: true,
      queueItems: {
        where: { deletedAt: null, isArchived: false },
        select: {
          id: true,
          status: true,
          sentAt: true,
          openedAt: true,
          formStartedAt: true,
          formSubmittedAt: true,
        },
      },
    },
  });

  const repairs = [];
  for (const lead of leads) {
    const completed = lead.queueItems
      .filter((item) => completedStatuses.includes(item.status))
      .sort(
        (a, b) =>
          (statusPriority.get(b.status) ?? 0) - (statusPriority.get(a.status) ?? 0) ||
          (b.formSubmittedAt ?? b.formStartedAt ?? b.openedAt ?? b.sentAt ?? new Date(0)).getTime() -
            (a.formSubmittedAt ?? a.formStartedAt ?? a.openedAt ?? a.sentAt ?? new Date(0)).getTime(),
      )[0];
    if (!completed) continue;

    const activeIds = lead.queueItems
      .filter((item) => activeStatuses.includes(item.status))
      .map((item) => item.id);
    const desiredStatus = preserveLeadStatuses.has(lead.status)
      ? lead.status
      : completed.status;
    const latestSentAt = lead.queueItems
      .map((item) => item.sentAt)
      .filter(Boolean)
      .sort((a, b) => b.getTime() - a.getTime())[0] ?? null;
    const leadNeedsRepair =
      lead.status !== desiredStatus ||
      lead.lastError !== null ||
      (!lead.lastSentAt && latestSentAt);

    if (leadNeedsRepair || activeIds.length) {
      repairs.push({
        leadId: lead.id,
        phone: lead.phone,
        desiredStatus,
        latestSentAt,
        activeIds,
        leadNeedsRepair,
      });
    }
  }

  console.log(JSON.stringify({
    mode: apply ? "apply" : "dry-run",
    leadsChecked: leads.length,
    repairCandidates: repairs.length,
    activeDuplicatesToCancel: repairs.reduce((sum, repair) => sum + repair.activeIds.length, 0),
    phoneSuffixes: repairs.map((repair) => repair.phone.slice(-4)),
  }, null, 2));

  if (apply) {
    for (const repair of repairs) {
      await db.$transaction([
        ...(repair.leadNeedsRepair
          ? [
              db.whatsAppLead.update({
                where: { id: repair.leadId },
                data: {
                  status: repair.desiredStatus,
                  lastError: null,
                  lastSentAt: repair.latestSentAt ?? undefined,
                },
              }),
            ]
          : []),
        ...(repair.activeIds.length
          ? [
              db.whatsAppQueueItem.updateMany({
                where: { id: { in: repair.activeIds }, status: { in: activeStatuses } },
                data: {
                  status: "CANCELLED",
                  cancelledAt: new Date(),
                  claimExpiresAt: null,
                  lastError: "Cancelled because an earlier message was already delivered.",
                },
              }),
            ]
          : []),
      ]);
    }
    console.log("Reconciled " + repairs.length + " WhatsApp delivery record(s).");
  }
} finally {
  await db.$disconnect();
}
