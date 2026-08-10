import "server-only";

import type { Prisma } from "@prisma/client";
import { db } from "./db";
import { generateUniqueFormToken } from "./short-token";
import { moveOutsideWhatsAppQuietTime, randomDelaySeconds } from "./whatsapp-schedule";
import { normalizeWhatsAppE164 } from "./whatsapp-phone.mjs";
import { COMPLETED_WHATSAPP_QUEUE_STATUSES } from "./whatsapp-delivery-status";

const ACTIVE_QUEUE_STATUSES = ["QUEUED", "SENDING"] as const;

type QueueWhatsAppInput = {
  accountId: string;
  phone: string;
  displayName: string;
  message?: string | null;
  consentAt?: Date;
  callLeadId?: string | null;
  source?: string;
  routingReason?: string;
  routingWarning?: string;
};

type Tx = Prisma.TransactionClient;

async function findOrCreateCallLead(
  tx: Tx,
  input: { phone: string; displayName: string; callLeadId?: string | null },
) {
  if (input.callLeadId) {
    const existing = await tx.callLead.findUnique({
      where: { id: input.callLeadId },
      select: { id: true },
    });

    if (existing) return existing;
  }

  const existing = await tx.callLead.findUnique({
    where: { phone: input.phone },
    select: { id: true },
  });

  if (existing) return existing;

  return tx.callLead.create({
    data: {
      phone: input.phone,
      displayName: input.displayName || `Caller ${input.phone.slice(-4)}`,
    },
    select: { id: true },
  });
}

/**
 * Central lifecycle function for queuing a WhatsApp message.
 *
 * **Multi-phone safe**: Calls arriving on different CompanyPhones all funnel
 * through this function. The per-account `pg_advisory_xact_lock` serializes
 * insertions so duplicate checks and ETA calculations never race, regardless
 * of how many phones trigger auto-queue concurrently.
 *
 * **Form-link routing**: Each queued message gets a unique `formToken`. The
 * WhatsApp message includes `https://crm.planle.com/atm-franchise/{formToken}`.
 * When the customer opens that link, `resolveFormContext(token)` maps it back
 * to the correct `WhatsAppQueueItem` → `WhatsAppLead` → `CallLead`, ensuring
 * form submissions always reach the right client.
 */
export async function queueWhatsAppMessage(input: QueueWhatsAppInput) {
  const normalizedInput = {
    ...input,
    phone: normalizeWhatsAppE164(input.phone),
  };

  return db.$transaction(async (tx) => {
    // Every producer uses this lifecycle function. The account-scoped transaction
    // lock serializes queue insertion so ETAs stay ordered and active-phone checks
    // cannot race. The partial unique DB index remains the final duplicate guard.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`whatsapp-account:${normalizedInput.accountId}`}))`;
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`whatsapp-phone:${normalizedInput.phone}`}))`;

    const account = await tx.whatsAppAccount.findUnique({
      where: { id: normalizedInput.accountId },
      select: {
        id: true,
        minDelaySeconds: true,
        maxDelaySeconds: true,
        quietHoursStart: true,
        quietHoursEnd: true,
      },
    });

    if (!account) throw new Error("WhatsApp account was not found.");

    const callLead = await findOrCreateCallLead(tx, normalizedInput);
    const existingLead = await tx.whatsAppLead.findFirst({
      where: { phone: normalizedInput.phone, deletedAt: null },
      orderBy: { createdAt: "asc" },
      select: { id: true, status: true, formToken: true },
    });

    // FormSubmission is the source of truth. Denormalized lead timestamps are informational only.
    const submittedForm = await tx.formSubmission.findFirst({
      where: {
        phone: normalizedInput.phone,
        status: "FORM_SUBMITTED",
        deletedAt: null,
      },
      select: { id: true },
    });

    if (submittedForm) {
      return {
        whatsappLeadId: existingLead?.id ?? null,
        queueItemId: null,
        callLeadId: callLead.id,
        queued: false,
        reason: "form_already_submitted",
        sendAfterAt: null,
      };
    }

    const completedQueueItem = await tx.whatsAppQueueItem.findFirst({
      where: {
        phone: normalizedInput.phone,
        status: { in: [...COMPLETED_WHATSAPP_QUEUE_STATUSES] },
        isArchived: false,
        deletedAt: null,
      },
      orderBy: [{ sentAt: "desc" }, { queuedAt: "desc" }],
      select: {
        id: true,
        whatsappLeadId: true,
        formToken: true,
        sentAt: true,
      },
    });

    if (completedQueueItem) {
      return {
        whatsappLeadId: completedQueueItem.whatsappLeadId,
        queueItemId: completedQueueItem.id,
        callLeadId: callLead.id,
        queued: false,
        reason: "already_delivered",
        sendAfterAt: completedQueueItem.sentAt,
      };
    }

    const activeQueueItem = await tx.whatsAppQueueItem.findFirst({
      where: {
        phone: normalizedInput.phone,
        status: { in: [...ACTIVE_QUEUE_STATUSES] },
        isArchived: false,
        deletedAt: null,
      },
      orderBy: { queuedAt: "asc" },
      select: { id: true, whatsappLeadId: true, formToken: true, status: true, sendAfterAt: true },
    });

    if (activeQueueItem) {
      if (
        normalizedInput.source === "auto_answered" &&
        activeQueueItem.status === "QUEUED" &&
        normalizedInput.message
      ) {
        await tx.whatsAppQueueItem.update({
          where: { id: activeQueueItem.id },
          data: {
            displayName: normalizedInput.displayName,
            message: normalizedInput.message,
            callLeadId: callLead.id,
          },
        });
        await tx.whatsAppLead.update({
          where: { id: activeQueueItem.whatsappLeadId },
          data: {
            displayName: normalizedInput.displayName,
            message: normalizedInput.message,
            status: "QUEUED",
            lastError: null,
          },
        });
      }

      return {
        whatsappLeadId: activeQueueItem.whatsappLeadId,
        queueItemId: activeQueueItem.id,
        callLeadId: callLead.id,
        queued: false,
        reason: "already_active",
        sendAfterAt: activeQueueItem.sendAfterAt,
      };
    }

    const latestScheduledItem = await tx.whatsAppQueueItem.findFirst({
      where: {
        accountId: account.id,
        status: { in: [...ACTIVE_QUEUE_STATUSES] },
        isArchived: false,
        deletedAt: null,
      },
      orderBy: { sendAfterAt: "desc" },
      select: { sendAfterAt: true },
    });

    const now = new Date();
    const scheduleBase = new Date(
      Math.max(now.getTime(), latestScheduledItem?.sendAfterAt.getTime() ?? 0),
    );
    const delaySeconds = randomDelaySeconds(account.minDelaySeconds, account.maxDelaySeconds);
    const sendAfterAt = moveOutsideWhatsAppQuietTime(
      new Date(scheduleBase.getTime() + delaySeconds * 1000),
      account.quietHoursStart,
      account.quietHoursEnd,
    );

    // Token preservation: reuse an existing token when available.
    const reuseToken = existingLead?.formToken ?? null;
    const formToken = reuseToken || (await generateUniqueFormToken(tx));

    const whatsappLead = existingLead
      ? await tx.whatsAppLead.update({
          where: { id: existingLead.id },
          data: {
            accountId: normalizedInput.accountId,
            preferredAccountId: normalizedInput.accountId,
            displayName: normalizedInput.displayName,
            message: normalizedInput.message ?? null,
            status: "QUEUED",
            consentAt: normalizedInput.consentAt ?? new Date(),
            lastError: null,
            ...(reuseToken ? {} : { formToken }),
          },
          select: { id: true },
        })
      : await tx.whatsAppLead.create({
          data: {
            accountId: normalizedInput.accountId,
            preferredAccountId: normalizedInput.accountId,
            phone: normalizedInput.phone,
            displayName: normalizedInput.displayName,
            message: normalizedInput.message ?? null,
            status: "QUEUED",
            consentAt: normalizedInput.consentAt ?? new Date(),
            formToken,
          },
          select: { id: true },
        });

    const queueItem = await tx.whatsAppQueueItem.create({
      data: {
        accountId: normalizedInput.accountId,
        whatsappLeadId: whatsappLead.id,
        callLeadId: callLead.id,
        phone: normalizedInput.phone,
        displayName: normalizedInput.displayName,
        message: normalizedInput.message ?? null,
        status: "QUEUED",
        formToken,
        sendAfterAt,
      },
      select: { id: true },
    });

    await tx.callActivity.create({
      data: {
        leadId: callLead.id,
        actionType: "WHATSAPP_QUEUED",
        description: `WhatsApp message queued for ${sendAfterAt.toISOString()}`,
        metadata: {
          whatsappLeadId: whatsappLead.id,
          queueItemId: queueItem.id,
          source: normalizedInput.source ?? "system",
          routingReason: normalizedInput.routingReason,
          routingWarning: normalizedInput.routingWarning,
          sendAfterAt: sendAfterAt.toISOString(),
        },
      },
    });

    return {
      whatsappLeadId: whatsappLead.id,
      queueItemId: queueItem.id,
      callLeadId: callLead.id,
      queued: true,
      reason: "created",
      sendAfterAt,
    };
  });
}
