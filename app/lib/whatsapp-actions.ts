"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/app/lib/db";
import { requireRole } from "@/app/lib/session";
import { WhatsAppConnectionStatus, WhatsAppLeadStatus } from "@/app/lib/prisma-enums";
import { queueWhatsAppMessage } from "@/app/lib/whatsapp-lifecycle";
import { evaluateWhatsAppRetry } from "@/app/lib/whatsapp-retry";
import { pickWhatsAppAccount } from "@/app/lib/whatsapp-account-picker";

function formString(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function formInt(formData: FormData, key: string, fallback: number) {
  const value = Number.parseInt(formString(formData, key), 10);
  return Number.isFinite(value) ? value : fallback;
}

function normalizePhone(value: string) {
  return value.replace(/[^\d+]/g, "");
}

type RetrySkippedRow = {
  leadId: string;
  phone: string;
  reasons: string[];
};

export type RetryFailedLeadsResult = {
  totalFailed: number;
  retryable: number;
  retried: number;
  skipped: number;
  skippedRows: RetrySkippedRow[];
};


export async function ensureWhatsAppAccount() {
  const existing = await db.whatsAppAccount.findFirst({
    orderBy: { createdAt: "asc" },
  });

  if (existing) {
    return existing;
  }

  return db.whatsAppAccount.create({
    data: {
      label: "Primary WhatsApp",
      minDelaySeconds: 120,
      maxDelaySeconds: 180,
      hourlySendLimit: 10,
      contactCooldownDays: 7,
      autoPauseThreshold: 3,
      messageVariants: [
        `Hi! We are from ATM Franchise. Apologies for the delay in responding. We are currently receiving a high volume of inquiries.\n\nPlease fill out your details quickly using this secure link:\n{{formLink}}\nour team will contact you and provide complete information\nThank you!`,
      ].join("\n\n---\n\n"),
    },
  });
}

/** Return all WhatsApp accounts ordered by creation time. */
export async function getWhatsAppAccounts() {
  return db.whatsAppAccount.findMany({
    orderBy: { createdAt: "asc" },
  });
}

/** Get a specific account by ID. */
export async function getWhatsAppAccountById(accountId: string) {
  return db.whatsAppAccount.findUnique({ where: { id: accountId } });
}

/** Admin-only: create a new WhatsApp account. */
export async function createWhatsAppAccountAction(formData: FormData) {
  await requireRole("ADMIN");
  const label = formString(formData, "label") || "WhatsApp Account";

  await db.whatsAppAccount.create({
    data: {
      label,
      minDelaySeconds: 120,
      maxDelaySeconds: 180,
      hourlySendLimit: 10,
      contactCooldownDays: 7,
      autoPauseThreshold: 3,
    },
  });

  revalidatePath("/admin/whatsapp");
  revalidatePath("/admin/whatsapp/settings");
}

/** Admin-only: soft-delete a WhatsApp account and cancel its pending queue. */
export async function deleteWhatsAppAccountAction(formData: FormData) {
  await requireRole("ADMIN");
  const accountId = formString(formData, "accountId");
  if (!accountId) return;

  const now = new Date();
  await db.$transaction([
    // Cancel all active queue items for this account
    db.whatsAppQueueItem.updateMany({
      where: {
        accountId,
        status: { in: ["QUEUED", "SENDING"] },
        deletedAt: null,
      },
      data: {
        status: "CANCELLED",
        cancelledAt: now,
        lastError: "Account deleted by admin.",
      },
    }),
    // Clear preferredAccountId on leads that pointed to this account
    db.whatsAppLead.updateMany({
      where: { preferredAccountId: accountId },
      data: { preferredAccountId: null },
    }),
    // Delete the account
    db.whatsAppAccount.delete({ where: { id: accountId } }),
  ]);

  revalidatePath("/admin/whatsapp");
  revalidatePath("/admin/whatsapp/settings");
  revalidatePath("/admin/whatsapp/leads");
}

export async function saveWhatsAppSettingsAction(formData: FormData) {
  await requireRole("ADMIN");
  const accountId = formString(formData, "accountId");
  if (!accountId) return;

  const account = await db.whatsAppAccount.findUnique({ where: { id: accountId } });
  if (!account) return;

  const minDelaySeconds = Math.max(30, formInt(formData, "minDelaySeconds", 120));
  const maxDelaySeconds = Math.max(minDelaySeconds, formInt(formData, "maxDelaySeconds", 180));
  const dailySendLimit = Math.min(300, Math.max(1, formInt(formData, "dailySendLimit", 100)));
  const hourlySendLimit = Math.min(60, Math.max(1, formInt(formData, "hourlySendLimit", 10)));
  const autoPauseThreshold = Math.max(1, formInt(formData, "autoPauseThreshold", 3));
  const contactCooldownDays = Math.max(0, formInt(formData, "contactCooldownDays", 7));
  const warmupRampPerDay = Math.max(1, formInt(formData, "warmupRampPerDay", 5));
  const warmupEnabled = formData.get("warmupEnabled") === "on";

  await db.whatsAppAccount.update({
    where: { id: account.id },
    data: {
      label: formString(formData, "label") || "WhatsApp Account",
      minDelaySeconds,
      maxDelaySeconds,
      dailySendLimit,
      hourlySendLimit,
      autoPauseThreshold,
      contactCooldownDays,
      requireOptIn: formData.get("requireOptIn") === "on",
      autoReplyEnabled: formData.get("autoReplyEnabled") === "on",
      warmupEnabled,
      warmupRampPerDay,
      warmupStartDate:
        warmupEnabled && !account.warmupStartDate
          ? new Date()
          : !warmupEnabled
            ? null
            : account.warmupStartDate,
      quietHoursStart: formString(formData, "quietHoursStart") || "21:00",
      quietHoursEnd: formString(formData, "quietHoursEnd") || "09:00",
      messageVariants: formString(formData, "messageVariants"),
    },
  });

  revalidatePath("/admin/whatsapp");
  revalidatePath("/admin/whatsapp/settings");
}

export async function requestWhatsAppQrAction(formData: FormData) {
  await requireRole("ADMIN");
  const accountId = formString(formData, "accountId");
  if (!accountId) return;

  await db.whatsAppAccount.update({
    where: { id: accountId },
    data: {
      status: WhatsAppConnectionStatus.QR_REQUIRED,
      qrCodeData: null,
      lastError: null,
    },
  });

  revalidatePath("/admin/whatsapp");
}

export async function pauseWhatsAppAction(formData: FormData) {
  await requireRole("ADMIN");
  const accountId = formString(formData, "accountId");
  if (!accountId) return;

  await db.whatsAppAccount.update({
    where: { id: accountId },
    data: { status: WhatsAppConnectionStatus.PAUSED },
  });

  revalidatePath("/admin/whatsapp");
}

export async function logoutWhatsAppAction(formData: FormData) {
  await requireRole("ADMIN");
  const accountId = formString(formData, "accountId");
  if (!accountId) return;

  await db.whatsAppAccount.update({
    where: { id: accountId },
    data: {
      status: WhatsAppConnectionStatus.DISCONNECTED,
      qrCodeData: null,
      phoneNumber: null,
      lastError: null,
    },
  });

  revalidatePath("/admin/whatsapp");
}

export async function createWhatsAppLeadAction(formData: FormData) {
  await requireRole("ADMIN");
  const phone = normalizePhone(formString(formData, "phone"));
  const displayName = formString(formData, "displayName");

  if (!phone || !displayName) {
    return;
  }

  const picked = await pickWhatsAppAccount(phone);
  if (!picked) {
    console.warn("[createWhatsAppLeadAction] No eligible account.");
    return;
  }

  const message = formString(formData, "message") || null;

  await queueWhatsAppMessage({
    accountId: picked.accountId,
    phone,
    displayName,
    message,
    consentAt: new Date(),
    source: "manual_admin",
  });

  revalidatePath("/admin/whatsapp");
  revalidatePath("/admin/whatsapp/leads");
}

export async function deleteWhatsAppLeadAction(formData: FormData) {
  const admin = await requireRole("ADMIN");
  const leadId = formString(formData, "leadId");

  if (!leadId) {
    return;
  }

  const lead = await db.whatsAppLead.findUnique({
    where: { id: leadId },
    select: { id: true, phone: true },
  });

  if (lead) {
    const now = new Date();
    const callLead = await db.callLead.findUnique({
      where: { phone: lead.phone },
      select: { id: true },
    });

    await db.$transaction([
      db.whatsAppLead.update({
        where: { id: lead.id },
        data: {
          status: WhatsAppLeadStatus.CANCELLED,
          isArchived: true,
          archivedAt: now,
          archivedBy: admin.id,
          deletedAt: now,
          deletedBy: admin.id,
        },
      }),
      db.whatsAppQueueItem.updateMany({
        where: { whatsappLeadId: lead.id },
        data: {
          status: "CANCELLED",
          cancelledAt: now,
          isArchived: true,
          archivedAt: now,
          archivedBy: admin.id,
          deletedAt: now,
          deletedBy: admin.id,
        },
      }),
      db.formSubmission.updateMany({
        where: { whatsappLeadId: lead.id },
        data: {
          isArchived: true,
          archivedAt: now,
          archivedBy: admin.id,
          deletedAt: now,
          deletedBy: admin.id,
        },
      }),
      ...(callLead
        ? [
            db.callActivity.create({
              data: {
                leadId: callLead.id,
                userId: admin.id,
                actionType: "ARCHIVED",
                description: "WhatsApp lead archived by admin",
                metadata: { whatsappLeadId: lead.id },
              },
            }),
          ]
        : []),
    ]);
  }

  revalidatePath("/admin/whatsapp");
  revalidatePath("/admin/whatsapp/leads");
}

export async function deleteCallLeadDirectAction(formData: FormData) {
  const admin = await requireRole("ADMIN");
  const callLeadId = formString(formData, "callLeadId");

  if (!callLeadId) {
    return;
  }

  const now = new Date();

  await db.$transaction([
    db.callLead.update({
      where: { id: callLeadId },
      data: {
        isArchived: true,
        archivedAt: now,
        archivedBy: admin.id,
        deletedAt: now,
        deletedBy: admin.id,
      },
    }),
    db.callSession.updateMany({
      where: { leadId: callLeadId },
      data: {
        isArchived: true,
        archivedAt: now,
        archivedBy: admin.id,
        deletedAt: now,
        deletedBy: admin.id,
      },
    }),
    db.callFollowUp.updateMany({
      where: { leadId: callLeadId },
      data: {
        isArchived: true,
        archivedAt: now,
        archivedBy: admin.id,
        deletedAt: now,
        deletedBy: admin.id,
      },
    }),
    db.callActivity.create({
      data: {
        leadId: callLeadId,
        userId: admin.id,
        actionType: "ARCHIVED",
        description: "Call lead archived by admin",
      },
    }),
  ]);

  revalidatePath("/admin/whatsapp");
  revalidatePath("/admin/whatsapp/leads");
}

export async function retryWhatsAppLeadAction(formData: FormData): Promise<void> {
  await requireRole("ADMIN");
  const leadId = formString(formData, "leadId");

  if (!leadId) {
    return;
  }

  const lead = await db.whatsAppLead.findUnique({
    where: { id: leadId },
    select: {
      id: true,
      phone: true,
      displayName: true,
      message: true,
      status: true,
      lastError: true,
      queueItems: {
        where: { deletedAt: null, isArchived: false },
        orderBy: { queuedAt: "desc" },
        select: { status: true, lastError: true },
      },
      formSubmissions: {
        where: { deletedAt: null },
        select: { status: true },
      },
    },
  });

  if (!lead) {
    return;
  }

  const eligibility = evaluateWhatsAppRetry(lead);
  const result: RetryFailedLeadsResult = {
    totalFailed: lead.status === WhatsAppLeadStatus.FAILED ? 1 : 0,
    retryable: eligibility.retryable ? 1 : 0,
    retried: 0,
    skipped: eligibility.retryable ? 0 : 1,
    skippedRows: eligibility.retryable ? [] : [{ leadId: lead.id, phone: lead.phone, reasons: eligibility.reasons }],
  };

  if (!eligibility.retryable) {
    console.log(`[retry] Skipping ${lead.phone}: ${eligibility.reasons.join("; ")}`);
    return;
  }

  const picked = await pickWhatsAppAccount(lead.phone);
  if (!picked) {
    console.warn(`[retry] No eligible account for ${lead.phone}.`);
    return;
  }
  const queued = await queueWhatsAppMessage({
    accountId: picked.accountId,
    phone: lead.phone,
    displayName: lead.displayName,
    message: lead.message,
    consentAt: new Date(),
    source: "retry_admin",
  });

  if (queued.queued) {
    result.retried = 1;
  } else {
    result.retryable = 0;
    result.skipped = 1;
    result.skippedRows = [{ leadId: lead.id, phone: lead.phone, reasons: [queued.reason] }];
  }

  revalidatePath("/admin/whatsapp");
  revalidatePath("/admin/whatsapp/leads");
  return;
}

export async function retryFailedLeadsAction(): Promise<RetryFailedLeadsResult> {
  await requireRole("ADMIN");

  const failedLeads = await db.whatsAppLead.findMany({
    where: {
      status: WhatsAppLeadStatus.FAILED,
      deletedAt: null,
      isArchived: false,
    },
    select: {
      id: true,
      phone: true,
      displayName: true,
      message: true,
      status: true,
      lastError: true,
      queueItems: {
        where: { deletedAt: null, isArchived: false },
        orderBy: { queuedAt: "desc" },
        select: { status: true, lastError: true },
      },
      formSubmissions: {
        where: { deletedAt: null },
        select: { status: true },
      },
    },
  });

  const summary: RetryFailedLeadsResult = {
    totalFailed: failedLeads.length,
    retryable: 0,
    retried: 0,
    skipped: 0,
    skippedRows: [],
  };

  for (const lead of failedLeads) {
    const eligibility = evaluateWhatsAppRetry(lead);

    if (!eligibility.retryable) {
      summary.skipped++;
      summary.skippedRows.push({ leadId: lead.id, phone: lead.phone, reasons: eligibility.reasons });
      continue;
    }

    summary.retryable++;
    const picked = await pickWhatsAppAccount(lead.phone);
    if (!picked) {
      summary.retryable--;
      summary.skipped++;
      summary.skippedRows.push({ leadId: lead.id, phone: lead.phone, reasons: ["no eligible account"] });
      continue;
    }
    const queued = await queueWhatsAppMessage({
      accountId: picked.accountId,
      phone: lead.phone,
      displayName: lead.displayName,
      message: lead.message,
      consentAt: new Date(),
      source: "bulk_retry_admin",
    });

    if (queued.queued) {
      summary.retried++;
    } else {
      summary.retryable--;
      summary.skipped++;
      summary.skippedRows.push({ leadId: lead.id, phone: lead.phone, reasons: [queued.reason] });
    }
  }

  console.log(
    `[bulk-retry] Failed: ${summary.totalFailed}, Retryable: ${summary.retryable}, Retried: ${summary.retried}, Skipped: ${summary.skipped}`,
  );

  revalidatePath("/admin/whatsapp");
  revalidatePath("/admin/whatsapp/leads");
  return summary;
}

export async function resumeWhatsAppAction(formData: FormData) {
  await requireRole("ADMIN");
  const accountId = formString(formData, "accountId");
  if (!accountId) return;

  await db.whatsAppAccount.update({
    where: { id: accountId },
    data: {
      status: WhatsAppConnectionStatus.CONNECTING,
      consecutiveFailures: 0,
      lastError: null,
    },
  });

  revalidatePath("/admin/whatsapp");
}

export async function manualQueueWhatsAppForCallLeadAction(callLeadId: string) {
  await requireRole("ADMIN");

  const callLead = await db.callLead.findUnique({
    where: { id: callLeadId },
  });

  if (!callLead || !callLead.phone) {
    return;
  }

  const picked = await pickWhatsAppAccount(callLead.phone);
  if (!picked) {
    console.warn(`[manualQueue] No eligible account for ${callLead.phone}.`);
    return;
  }

  await queueWhatsAppMessage({
    accountId: picked.accountId,
    phone: callLead.phone,
    displayName: callLead.displayName || "Caller",
    message: null,
    consentAt: new Date(),
    callLeadId: callLead.id,
    source: "manual_call_lead",
  });

  revalidatePath("/admin/calls/leads");
  revalidatePath("/admin/whatsapp/leads");
}

export type BulkCleanupResult = {
  totalCleaned: number;
  failedCleaned: number;
  awaitingCleaned: number;
  keptSubmitted: number;
  keptReplied: number;
};

export async function bulkCleanupNonSubmittedLeadsAction(): Promise<BulkCleanupResult> {
  const admin = await requireRole("ADMIN");
  const now = new Date();

  // Find all non-archived, non-deleted leads
  const allLeads = await db.whatsAppLead.findMany({
    where: { deletedAt: null, isArchived: false },
    select: {
      id: true,
      phone: true,
      status: true,
      lastError: true,
      lastReplyAt: true,
      queueItems: {
        where: { deletedAt: null, isArchived: false },
        orderBy: [{ queuedAt: "desc" }, { createdAt: "desc" }],
        select: { status: true, lastError: true, queuedAt: true, sendAfterAt: true, updatedAt: true },
      },
      formSubmissions: {
        where: { deletedAt: null },
        select: { status: true },
      },
    },
  });

  // Classify each lead
  const FORM_SUBMITTED = "FORM_SUBMITTED";
  const ACTIVE_QUEUE = ["QUEUED", "SENDING"] as const;

  function hasSubmittedForm(lead: (typeof allLeads)[number]) {
    return lead.formSubmissions.some((s) => s.status === FORM_SUBMITTED);
  }
  function hasReply(lead: (typeof allLeads)[number]) {
    return lead.status === WhatsAppLeadStatus.REPLIED || Boolean(lead.lastReplyAt);
  }
  function hasFailedState(lead: (typeof allLeads)[number]) {
    return lead.status === WhatsAppLeadStatus.FAILED || lead.queueItems[0]?.status === "FAILED";
  }
  function hasActiveQueue(lead: (typeof allLeads)[number]) {
    return lead.queueItems.some((item) => ACTIVE_QUEUE.includes(item.status as (typeof ACTIVE_QUEUE)[number]));
  }
  function isAwaiting(lead: (typeof allLeads)[number]) {
    return !hasSubmittedForm(lead) && !hasReply(lead) && !hasFailedState(lead) && !hasActiveQueue(lead) && lead.queueItems[0]?.status === "SENT";
  }

  const result: BulkCleanupResult = {
    totalCleaned: 0,
    failedCleaned: 0,
    awaitingCleaned: 0,
    keptSubmitted: 0,
    keptReplied: 0,
  };

  const toDelete: string[] = [];

  for (const lead of allLeads) {
    if (hasSubmittedForm(lead)) {
      result.keptSubmitted++;
      continue;
    }
    if (hasReply(lead)) {
      result.keptReplied++;
      continue;
    }
    if (hasFailedState(lead)) {
      result.failedCleaned++;
      toDelete.push(lead.id);
      continue;
    }
    if (isAwaiting(lead)) {
      result.awaitingCleaned++;
      toDelete.push(lead.id);
      continue;
    }
  }

  result.totalCleaned = toDelete.length;

  if (toDelete.length > 0) {
    // Batch soft-delete in a transaction
    await db.$transaction([
      db.whatsAppLead.updateMany({
        where: { id: { in: toDelete } },
        data: {
          status: WhatsAppLeadStatus.CANCELLED,
          isArchived: true,
          archivedAt: now,
          archivedBy: admin.id,
          deletedAt: now,
          deletedBy: admin.id,
        },
      }),
      db.whatsAppQueueItem.updateMany({
        where: { whatsappLeadId: { in: toDelete } },
        data: {
          status: "CANCELLED",
          cancelledAt: now,
          isArchived: true,
          archivedAt: now,
          archivedBy: admin.id,
          deletedAt: now,
          deletedBy: admin.id,
        },
      }),
      db.formSubmission.updateMany({
        where: { whatsappLeadId: { in: toDelete } },
        data: {
          isArchived: true,
          archivedAt: now,
          archivedBy: admin.id,
          deletedAt: now,
          deletedBy: admin.id,
        },
      }),
    ]);
  }

  console.log(
    `[bulk-cleanup] Cleaned ${result.totalCleaned} leads (${result.failedCleaned} failed, ${result.awaitingCleaned} awaiting). Kept ${result.keptSubmitted} submitted, ${result.keptReplied} replied.`,
  );

  revalidatePath("/admin/whatsapp");
  revalidatePath("/admin/whatsapp/leads");
  return result;
}

