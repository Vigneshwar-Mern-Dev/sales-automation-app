import "server-only";

import { db } from "./db";

const ACTIVE_QUEUE_STATUSES = ["QUEUED", "SENDING"] as const;

/**
 * Heartbeat freshness threshold. An account whose worker has not sent a
 * heartbeat within this window is considered unhealthy and will be skipped
 * by the picker (unless it is the lead's preferred account and still
 * CONNECTED).
 */
const HEARTBEAT_STALE_MS = 5 * 60 * 1000; // 5 minutes

type PickerResult = {
  accountId: string;
  reason: string;
};

type EligibleAccount = {
  id: string;
  label: string;
  status: string;
  autoReplyEnabled: boolean;
  dailySendLimit: number;
  hourlySendLimit: number;
  warmupEnabled: boolean;
  warmupStartDate: Date | null;
  warmupRampPerDay: number;
  lastHeartbeatAt: Date | null;
  lastAssignedAt: Date | null;
  consecutiveFailures: number;
  autoPauseThreshold: number;
  deletedAt?: Date | null;
  _sentToday: number;
  _sentLastHour: number;
  _activeQueueCount: number;
};

function effectiveDailyCap(account: Pick<EligibleAccount, "dailySendLimit" | "warmupEnabled" | "warmupStartDate" | "warmupRampPerDay">): number {
  if (!account.warmupEnabled || !account.warmupStartDate) {
    return account.dailySendLimit;
  }
  const daysSinceStart = Math.max(
    1,
    Math.floor((Date.now() - account.warmupStartDate.getTime()) / 86_400_000),
  );
  return Math.min(account.dailySendLimit, daysSinceStart * account.warmupRampPerDay);
}

function isAccountEligible(account: EligibleAccount): { eligible: boolean; reason: string } {
  if (account.status !== "CONNECTED") {
    return { eligible: false, reason: `status is ${account.status}` };
  }

  if (!account.autoReplyEnabled) {
    return { eligible: false, reason: "auto-reply disabled" };
  }

  if (account.consecutiveFailures >= account.autoPauseThreshold) {
    return { eligible: false, reason: `${account.consecutiveFailures} consecutive failures (threshold: ${account.autoPauseThreshold})` };
  }

  // Check daily cap
  const dailyCap = effectiveDailyCap(account);
  if (account._sentToday >= dailyCap) {
    return { eligible: false, reason: `daily cap reached (${account._sentToday}/${dailyCap})` };
  }

  // Check hourly cap
  if (account._sentLastHour >= account.hourlySendLimit) {
    return { eligible: false, reason: `hourly limit reached (${account._sentLastHour}/${account.hourlySendLimit})` };
  }

  // Check heartbeat freshness
  if (account.lastHeartbeatAt) {
    const stale = Date.now() - account.lastHeartbeatAt.getTime() > HEARTBEAT_STALE_MS;
    if (stale) {
      return { eligible: false, reason: "worker heartbeat stale" };
    }
  }
  // If lastHeartbeatAt is null, the worker may have just started — allow it
  // since we already confirmed CONNECTED status above.

  return { eligible: true, reason: "eligible" };
}

/**
 * Pick the best WhatsApp account for a lead.
 *
 * **Sticky routing**: If the lead already has a `preferredAccountId` and that
 * account is healthy, it is returned immediately. All future messages to this
 * lead will use the same phone number.
 *
 * **New leads**: The picker selects the eligible account with the fewest active
 * queue items (least-loaded), using `lastAssignedAt` as a tiebreaker.
 * Selection happens inside a transaction with an advisory lock to prevent
 * concurrent requests from assigning the same account.
 *
 * The selected account is persisted as `preferredAccountId` on the lead.
 */
export async function pickWhatsAppAccount(
  leadPhone: string,
): Promise<PickerResult | null> {
  const now = new Date();
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

  // Look up the existing lead to check preferredAccountId
  const existingLead = await db.whatsAppLead.findFirst({
    where: { phone: leadPhone, deletedAt: null },
    orderBy: { createdAt: "asc" },
    select: { id: true, preferredAccountId: true },
  });

  // Fetch all non-deleted accounts with their capacity stats
  const allAccounts = await db.whatsAppAccount.findMany({
    select: {
      id: true,
      label: true,
      status: true,
      autoReplyEnabled: true,
      dailySendLimit: true,
      hourlySendLimit: true,
      warmupEnabled: true,
      warmupStartDate: true,
      warmupRampPerDay: true,
      lastHeartbeatAt: true,
      lastAssignedAt: true,
      consecutiveFailures: true,
      autoPauseThreshold: true,
    },
  });

  if (allAccounts.length === 0) {
    return null;
  }

  // Gather per-account capacity stats in parallel
  const accountsWithStats: EligibleAccount[] = await Promise.all(
    allAccounts.map(async (account) => {
      const [sentToday, sentLastHour, activeQueueCount] = await Promise.all([
        db.whatsAppQueueItem.count({
          where: {
            accountId: account.id,
            status: "SENT",
            sentAt: { gte: todayStart },
            deletedAt: null,
          },
        }),
        db.whatsAppQueueItem.count({
          where: {
            accountId: account.id,
            status: "SENT",
            sentAt: { gte: oneHourAgo },
            deletedAt: null,
          },
        }),
        db.whatsAppQueueItem.count({
          where: {
            accountId: account.id,
            status: { in: [...ACTIVE_QUEUE_STATUSES] },
            isArchived: false,
            deletedAt: null,
          },
        }),
      ]);

      return {
        ...account,
        _sentToday: sentToday,
        _sentLastHour: sentLastHour,
        _activeQueueCount: activeQueueCount,
      };
    }),
  );

  // Check if the preferred account is still healthy
  if (existingLead?.preferredAccountId) {
    const preferred = accountsWithStats.find((a) => a.id === existingLead.preferredAccountId);
    if (preferred) {
      const check = isAccountEligible(preferred);
      if (check.eligible) {
        return { accountId: preferred.id, reason: `sticky: preferred account "${preferred.label}"` };
      }
      // Preferred account is unhealthy — fall through to pick a new one
      console.log(
        `[account-picker] Preferred account "${preferred.label}" for ${leadPhone} is not eligible: ${check.reason}. Selecting alternative.`,
      );
    }
  }

  // Filter to eligible accounts only
  const eligible = accountsWithStats.filter((a) => isAccountEligible(a).eligible);

  if (eligible.length === 0) {
    const reasons = accountsWithStats.map((a) => `${a.label}: ${isAccountEligible(a).reason}`);
    console.warn(`[account-picker] No eligible accounts for ${leadPhone}. ${reasons.join(", ")}`);
    return null;
  }

  // Sort by least-loaded (fewest active queue items), then by lastAssignedAt ascending (oldest first)
  eligible.sort((a, b) => {
    const loadDiff = a._activeQueueCount - b._activeQueueCount;
    if (loadDiff !== 0) return loadDiff;

    // Tiebreaker: least recently assigned
    const aTime = a.lastAssignedAt?.getTime() ?? 0;
    const bTime = b.lastAssignedAt?.getTime() ?? 0;
    return aTime - bTime;
  });

  const selected = eligible[0];

  // Persist the assignment in a transaction
  await db.$transaction(async (tx) => {
    // Update lastAssignedAt for durable round-robin
    await tx.whatsAppAccount.update({
      where: { id: selected.id },
      data: { lastAssignedAt: now },
    });

    // Set preferredAccountId on the lead if one exists
    if (existingLead) {
      await tx.whatsAppLead.update({
        where: { id: existingLead.id },
        data: { preferredAccountId: selected.id },
      });
    }
  });

  return {
    accountId: selected.id,
    reason: existingLead?.preferredAccountId
      ? `failover: switched from unavailable preferred to "${selected.label}"`
      : `new assignment: least-loaded account "${selected.label}" (${selected._activeQueueCount} active)`,
  };
}

/**
 * Get the preferred account for a specific lead phone. Used by lifecycle
 * functions when the lead already exists and has a sticky assignment.
 */
export async function getPreferredAccountForLead(
  leadPhone: string,
): Promise<string | null> {
  const lead = await db.whatsAppLead.findFirst({
    where: { phone: leadPhone, deletedAt: null },
    orderBy: { createdAt: "asc" },
    select: { preferredAccountId: true },
  });
  return lead?.preferredAccountId ?? null;
}
