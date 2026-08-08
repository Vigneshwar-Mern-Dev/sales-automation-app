import { NextResponse } from "next/server";
import { db } from "@/app/lib/db";
import { WhatsAppConnectionStatus, WhatsAppLeadStatus } from "@/app/lib/prisma-enums";
import { getPublicCrmFormUrl, getPublicCrmUrl } from "@/app/lib/public-crm-url";
import { validateBody } from "@/app/lib/validators/validate";
import { whatsappOutboxResultSchema } from "@/app/lib/validators/whatsapp";
import { renderWhatsAppMessage } from "@/app/lib/whatsapp-message";

const CLAIM_LEASE_MS = 5 * 60 * 1000;

function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

function checkToken(request: Request) {
  const expectedToken = process.env.WHATSAPP_BRIDGE_TOKEN;
  const token = request.headers.get("x-whatsapp-bridge-token");
  return Boolean(expectedToken && token === expectedToken);
}

async function pickVariant(
  messageVariants: string | null,
  fallback: string | null,
  name: string,
  formToken: string | null,
) {
  const variants = (messageVariants || "")
    .split(/\n\s*---\s*\n/g)
    .map((variant) => variant.trim())
    .filter(Boolean);
  const template = fallback?.trim() || variants[Math.floor(Math.random() * variants.length)] || "";

  // Use the PUBLIC URL for customer-facing form links, NOT the internal CRM_BASE_URL.
  const formLink = formToken ? getPublicCrmFormUrl(formToken) : "";

  return renderWhatsAppMessage(template, name, formLink);
}

/**
 * Production guard: block sending if the public URL is localhost/127.0.0.1.
 * Returns null if OK, or an error string if blocked.
 */
function checkPublicUrlGuard(): string | null {
  try {
    getPublicCrmUrl();
    return null;
  } catch (error) {
    return `CONFIGURATION ERROR: ${error instanceof Error ? error.message : "Invalid public CRM URL."}`;
  }
}

function effectiveDailyCap(account: {
  dailySendLimit: number;
  warmupEnabled: boolean;
  warmupStartDate: Date | null;
  warmupRampPerDay: number;
}): number {
  if (!account.warmupEnabled || !account.warmupStartDate) {
    return account.dailySendLimit;
  }

  const daysSinceStart = Math.max(
    1,
    Math.floor((Date.now() - account.warmupStartDate.getTime()) / 86_400_000),
  );
  const warmupCap = daysSinceStart * account.warmupRampPerDay;

  return Math.min(account.dailySendLimit, warmupCap);
}

async function reclaimExpiredClaims(accountId: string) {
  const now = new Date();
  const leaseFallbackCutoff = new Date(now.getTime() - CLAIM_LEASE_MS);
  const expiredItems = await db.whatsAppQueueItem.findMany({
    where: {
      accountId,
      status: "SENDING",
      OR: [
        { claimExpiresAt: { lte: now } },
        { claimExpiresAt: null, sendingAt: { lte: leaseFallbackCutoff } },
      ],
      deletedAt: null,
      isArchived: false,
    },
    take: 100,
    select: { id: true, whatsappLeadId: true },
  });

  if (!expiredItems.length) {
    return;
  }

  const queueItemIds = expiredItems.map((item) => item.id);
  const leadIds = [...new Set(expiredItems.map((item) => item.whatsappLeadId))];

  await db.$transaction([
    db.whatsAppQueueItem.updateMany({
      where: {
        id: { in: queueItemIds },
        status: "SENDING",
        OR: [
          { claimExpiresAt: { lte: now } },
          { claimExpiresAt: null, sendingAt: { lte: leaseFallbackCutoff } },
        ],
      },
      data: {
        status: "QUEUED",
        sendingAt: null,
        claimExpiresAt: null,
        lastError: "Previous worker claim expired before delivery was confirmed.",
      },
    }),
    db.whatsAppLead.updateMany({
      where: {
        id: { in: leadIds },
        status: WhatsAppLeadStatus.SENDING,
      },
      data: {
        status: WhatsAppLeadStatus.QUEUED,
        lastError: "Previous worker claim expired before delivery was confirmed.",
      },
    }),
  ]);
}

export async function GET(request: Request) {
  if (!checkToken(request)) {
    return unauthorized();
  }

  // Require explicit accountId — workers must identify which account they serve.
  // No silent fallback to "first account" to prevent misconfigured workers from
  // stealing another account's queue.
  const url = new URL(request.url);
  const accountId = url.searchParams.get("accountId");

  if (!accountId) {
    return NextResponse.json(
      { error: "accountId query parameter is required. Set WHATSAPP_ACCOUNT_ID in the worker environment." },
      { status: 400 },
    );
  }

  const account = await db.whatsAppAccount.findUnique({ where: { id: accountId } });

  if (!account) {
    return NextResponse.json(
      { error: `Account ${accountId} not found. Create it from the admin panel first.` },
      { status: 404 },
    );
  }

  await reclaimExpiredClaims(account.id);

  if (account.status === "DISCONNECTED") {
    return NextResponse.json({ ok: true, logoutRequested: true });
  }

  if (account.status === "QR_REQUIRED" && !account.qrCodeData) {
    return NextResponse.json({ ok: true, qrRequested: true });
  }

  if (!account.autoReplyEnabled || account.status === "PAUSED" || account.status === "ERROR") {
    return NextResponse.json({ ok: true, paused: true });
  }

  const since = new Date();
  since.setHours(0, 0, 0, 0);
  const sentToday = await db.whatsAppQueueItem.count({
    where: {
      accountId: account.id,
      status: "SENT",
      sentAt: { gte: since },
      deletedAt: null,
    },
  });

  const dailyCap = effectiveDailyCap(account);

  if (sentToday >= dailyCap) {
    return NextResponse.json({ ok: true, capped: true, sentToday, dailyCap });
  }

  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  const [sentLastHour, latestSentItem] = await Promise.all([
    db.whatsAppQueueItem.count({
      where: {
        accountId: account.id,
        status: "SENT",
        sentAt: { gte: oneHourAgo },
        deletedAt: null,
      },
    }),
    db.whatsAppQueueItem.findFirst({
      where: {
        accountId: account.id,
        status: "SENT",
        sentAt: { not: null },
        deletedAt: null,
      },
      orderBy: { sentAt: "desc" },
      select: { sentAt: true },
    }),
  ]);

  if (sentLastHour >= account.hourlySendLimit) {
    return NextResponse.json({
      ok: true,
      rateLimited: true,
      sentLastHour,
      hourlyLimit: account.hourlySendLimit,
    });
  }

  const now = new Date();
  const nextAllowedSendAt = latestSentItem?.sentAt
    ? new Date(latestSentItem.sentAt.getTime() + account.minDelaySeconds * 1000)
    : null;

  if (nextAllowedSendAt && nextAllowedSendAt > now) {
    return NextResponse.json({
      ok: true,
      lead: null,
      waitingForSendGap: true,
      nextSendAt: nextAllowedSendAt.toISOString(),
    });
  }

  const queueItem = await db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`whatsapp-outbox:${account.id}`}))`;
    const claimNow = new Date();

    const activeClaim = await tx.whatsAppQueueItem.findFirst({
      where: {
        accountId: account.id,
        status: "SENDING",
        deletedAt: null,
        isArchived: false,
      },
      select: { id: true },
    });

    if (activeClaim) return null;

    const latestCommittedSend = await tx.whatsAppQueueItem.findFirst({
      where: {
        accountId: account.id,
        status: "SENT",
        sentAt: { not: null },
        deletedAt: null,
      },
      orderBy: { sentAt: "desc" },
      select: { sentAt: true },
    });
    const transactionNextAllowedAt = latestCommittedSend?.sentAt
      ? new Date(latestCommittedSend.sentAt.getTime() + account.minDelaySeconds * 1000)
      : null;

    if (transactionNextAllowedAt && transactionNextAllowedAt > claimNow) return null;

    const candidate = await tx.whatsAppQueueItem.findFirst({
      where: {
        accountId: account.id,
        status: "QUEUED",
        sendAfterAt: { lte: claimNow },
        isArchived: false,
        deletedAt: null,
        ...(account.requireOptIn
          ? { whatsappLead: { consentAt: { not: null }, deletedAt: null } }
          : { whatsappLead: { deletedAt: null } }),
      },
      orderBy: [{ sendAfterAt: "asc" }, { queuedAt: "asc" }, { id: "asc" }],
      select: {
        id: true,
        phone: true,
        displayName: true,
        message: true,
        formToken: true,
        whatsappLeadId: true,
        callLeadId: true,
      },
    });

    if (!candidate) return null;

    const claimed = await tx.whatsAppQueueItem.updateMany({
      where: {
        id: candidate.id,
        status: "QUEUED",
        sendAfterAt: { lte: claimNow },
        deletedAt: null,
        isArchived: false,
      },
      data: {
        status: "SENDING",
        sendingAt: claimNow,
        claimExpiresAt: new Date(claimNow.getTime() + CLAIM_LEASE_MS),
        attemptCount: { increment: 1 },
        lastError: null,
      },
    });

    return claimed.count === 1 ? candidate : null;
  });

  if (!queueItem) {
    return NextResponse.json({ ok: true, lead: null });
  }

  // Production guard: block sending when the public form URL is unsafe.
  const urlGuardError = checkPublicUrlGuard();
  if (urlGuardError) {
    // Mark as FAILED with clear config error instead of sending broken links
    const now = new Date();
    await db.$transaction([
      db.whatsAppQueueItem.update({
        where: { id: queueItem.id },
        data: {
          status: "FAILED",
          failedAt: now,
          claimExpiresAt: null,
          lastError: urlGuardError,
        },
      }),
      db.whatsAppLead.update({
        where: { id: queueItem.whatsappLeadId },
        data: { status: WhatsAppLeadStatus.FAILED, lastError: urlGuardError },
      }),
    ]);
    console.error(`[outbox] ${urlGuardError}`);
    return NextResponse.json({ ok: true, lead: null, configError: urlGuardError });
  }

  await db.$transaction([
    db.whatsAppLead.update({
      where: { id: queueItem.whatsappLeadId },
      data: { status: WhatsAppLeadStatus.SENDING, lastError: null },
    }),
    ...(queueItem.callLeadId
      ? [
          db.callActivity.create({
            data: {
              leadId: queueItem.callLeadId,
              actionType: "WHATSAPP_SENDING",
              description: "WhatsApp message picked up for sending",
              metadata: {
                queueItemId: queueItem.id,
                whatsappLeadId: queueItem.whatsappLeadId,
              },
            },
          }),
        ]
      : []),
  ]);

  return NextResponse.json({
    ok: true,
    account: {
      id: account.id,
      minDelaySeconds: account.minDelaySeconds,
      maxDelaySeconds: account.maxDelaySeconds,
      quietHoursStart: account.quietHoursStart,
      quietHoursEnd: account.quietHoursEnd,
    },
    lead: {
      id: queueItem.id,
      phone: queueItem.phone,
      displayName: queueItem.displayName,
      formToken: queueItem.formToken,
      message: await pickVariant(
        account.messageVariants,
        queueItem.message,
        queueItem.displayName,
        queueItem.formToken,
      ),
    },
  });
}

export async function POST(request: Request) {
  if (!checkToken(request)) {
    return unauthorized();
  }

  const validation = await validateBody(request, whatsappOutboxResultSchema);
  if (!validation.success) {
    return validation.response;
  }

  const payload = validation.data;
  const now = new Date();
  const queueItem = await db.whatsAppQueueItem.findUnique({
    where: { id: payload.leadId },
    select: {
      id: true,
      whatsappLeadId: true,
      callLeadId: true,
      accountId: true,
      status: true,
    },
  });

  if (!queueItem) {
    return NextResponse.json({ error: "Queue item not found." }, { status: 404 });
  }

  if (payload.ok) {
    if (queueItem.status === "SENT") {
      return NextResponse.json({ ok: true, idempotent: true });
    }

    const updated = await db.$transaction(async (tx) => {
      const result = await tx.whatsAppQueueItem.updateMany({
        where: { id: queueItem.id, status: "SENDING" },
        data: {
          status: "SENT",
          sentAt: now,
          claimExpiresAt: null,
          providerMessageId: payload.providerMessageId ?? undefined,
          lastError: null,
        },
      });

      if (result.count !== 1) {
        return false;
      }

      await tx.whatsAppLead.update({
        where: { id: queueItem.whatsappLeadId },
        data: {
          status: WhatsAppLeadStatus.SENT,
          lastSentAt: now,
          lastError: null,
        },
      });

      if (queueItem.accountId) {
        await tx.whatsAppAccount.update({
          where: { id: queueItem.accountId },
          data: { consecutiveFailures: 0 },
        });
      }

      if (queueItem.callLeadId) {
        await tx.callActivity.create({
          data: {
            leadId: queueItem.callLeadId,
            actionType: "WHATSAPP_SENT",
            description: "WhatsApp message sent",
            metadata: {
              queueItemId: queueItem.id,
              whatsappLeadId: queueItem.whatsappLeadId,
              providerMessageId: payload.providerMessageId,
            },
          },
        });
      }

      return true;
    });

    if (!updated) {
      return NextResponse.json(
        { error: `Queue item cannot transition from ${queueItem.status} to SENT.` },
        { status: 409 },
      );
    }
  } else {
    const lastError = payload.error || "Sending failed.";

    if (queueItem.status === "FAILED") {
      return NextResponse.json({ ok: true, idempotent: true });
    }

    if (queueItem.status === "SENT") {
      return NextResponse.json({ ok: true, idempotent: true, ignoredLateFailure: true });
    }

    const updated = await db.$transaction(async (tx) => {
      const result = await tx.whatsAppQueueItem.updateMany({
        where: { id: queueItem.id, status: "SENDING" },
        data: {
          status: "FAILED",
          failedAt: now,
          claimExpiresAt: null,
          lastError,
        },
      });

      if (result.count !== 1) {
        return false;
      }

      await tx.whatsAppLead.update({
        where: { id: queueItem.whatsappLeadId },
        data: {
          status: WhatsAppLeadStatus.FAILED,
          lastError,
        },
      });

      if (queueItem.callLeadId) {
        await tx.callActivity.create({
          data: {
            leadId: queueItem.callLeadId,
            actionType: "WHATSAPP_FAILED",
            description: `WhatsApp message failed: ${lastError}`,
            metadata: {
              queueItemId: queueItem.id,
              whatsappLeadId: queueItem.whatsappLeadId,
              errorType: payload.errorType,
            },
          },
        });
      }

      return true;
    });

    if (!updated) {
      return NextResponse.json(
        { error: `Queue item cannot transition from ${queueItem.status} to FAILED.` },
        { status: 409 },
      );
    }

    const isDataError = payload.errorType === "INVALID_NUMBER";

    if (!isDataError) {
      const account = queueItem.accountId
        ? await db.whatsAppAccount.findUnique({
            where: { id: queueItem.accountId },
            select: { id: true, consecutiveFailures: true, autoPauseThreshold: true },
          })
        : await db.whatsAppAccount.findFirst({
            orderBy: { createdAt: "asc" },
            select: { id: true, consecutiveFailures: true, autoPauseThreshold: true },
          });

      if (account) {
        const newCount = account.consecutiveFailures + 1;
        const shouldPause = newCount >= account.autoPauseThreshold;

        await db.whatsAppAccount.update({
          where: { id: account.id },
          data: {
            consecutiveFailures: newCount,
            ...(shouldPause
              ? {
                  status: WhatsAppConnectionStatus.PAUSED,
                  autoReplyEnabled: false,
                  lastError: `Auto-paused after ${newCount} consecutive send failures. Check your connection and resume manually.`,
                }
              : {}),
          },
        });

        if (shouldPause) {
          console.warn(`[whatsapp-outbox] Auto-paused after ${newCount} consecutive failures.`);
        }
      }
    } else {
      console.log(
        `[whatsapp-outbox] Skipped consecutive failure increment for queue item ${queueItem.id} (errorType: ${payload.errorType})`,
      );
    }
  }

  return NextResponse.json({ ok: true });
}

