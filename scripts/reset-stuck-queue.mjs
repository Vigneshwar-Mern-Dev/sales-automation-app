/**
 * reset-stuck-queue.mjs
 *
 * Resets WhatsAppQueueItem rows stuck in SENDING status for more than 15 minutes
 * back to QUEUED so the worker can retry them.
 *
 * Also resets the corresponding WhatsAppLead status from SENDING back to QUEUED.
 *
 * Does NOT touch items with status: SENT, FAILED, EXPIRED, CANCELLED,
 * FORM_SUBMITTED, FORM_STARTED, OPENED, or DO_NOT_CONTACT.
 *
 * Usage: npm run queue:reset-stuck
 */

import { PrismaClient } from "@prisma/client";
import "dotenv/config";

const prisma = new PrismaClient();
const STUCK_THRESHOLD_MINUTES = 15;

async function main() {
  const cutoff = new Date(Date.now() - STUCK_THRESHOLD_MINUTES * 60 * 1000);

  const stuckItems = await prisma.whatsAppQueueItem.findMany({
    where: {
      status: "SENDING",
      sendingAt: { lt: cutoff },
      deletedAt: null,
      isArchived: false,
    },
    select: {
      id: true,
      phone: true,
      displayName: true,
      whatsappLeadId: true,
      sendingAt: true,
    },
  });

  if (stuckItems.length === 0) {
    console.log("[queue-reset] No stuck SENDING items found. Queue is healthy.");
    return;
  }

  console.log(`[queue-reset] Found ${stuckItems.length} stuck item(s) in SENDING for >${STUCK_THRESHOLD_MINUTES} minutes:\n`);

  for (const item of stuckItems) {
    const stuckMinutes = Math.round((Date.now() - (item.sendingAt?.getTime() || 0)) / 60000);
    console.log(`  - ${item.id} | ${item.phone} (${item.displayName}) | stuck ${stuckMinutes}min`);
  }

  const queueItemIds = stuckItems.map((item) => item.id);
  const whatsappLeadIds = [...new Set(stuckItems.map((item) => item.whatsappLeadId))];

  await prisma.$transaction([
    prisma.whatsAppQueueItem.updateMany({
      where: { id: { in: queueItemIds } },
      data: {
        status: "QUEUED",
        sendingAt: null,
      },
    }),
    prisma.whatsAppLead.updateMany({
      where: {
        id: { in: whatsappLeadIds },
        status: "SENDING",
      },
      data: {
        status: "QUEUED",
        lastError: null,
      },
    }),
  ]);

  console.log(`\n[queue-reset] Reset ${stuckItems.length} queue item(s) from SENDING → QUEUED.`);
  console.log("[queue-reset] Worker will retry these items on next poll cycle.");
}

main()
  .catch((err) => {
    console.error("[queue-reset] Error:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
