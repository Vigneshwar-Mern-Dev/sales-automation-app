export type WhatsAppEtaState =
  | "SCHEDULED"
  | "SENDING"
  | "PAUSED"
  | "OFFLINE"
  | "HOURLY_LIMIT"
  | "DAILY_LIMIT";

export type WhatsAppQueueEstimate = {
  accountId: string;
  accountLabel: string;
  position: number | null;
  earliestAt: string;
  latestAt: string;
  state: WhatsAppEtaState;
};

type QueueItem = {
  id: string;
  accountId: string | null;
  status: string;
  sendAfterAt: Date;
  queuedAt: Date;
};

type Account = {
  id: string;
  label: string;
  status: string;
  autoReplyEnabled: boolean;
  lastHeartbeatAt: Date | null;
  consecutiveFailures: number;
  autoPauseThreshold: number;
  hourlySendLimit: number;
  dailySendLimit: number;
  warmupEnabled: boolean;
  warmupStartDate: Date | null;
  warmupRampPerDay: number;
};

type SentItem = {
  accountId: string | null;
  sentAt: Date | null;
};

const HEARTBEAT_STALE_MS = 5 * 60 * 1000;
const WORKER_POLL_AND_SEND_SLACK_MS = 30 * 1000;

function effectiveDailyCap(account: Account, now: Date) {
  if (!account.warmupEnabled || !account.warmupStartDate) return account.dailySendLimit;
  const days = Math.max(
    1,
    Math.floor((now.getTime() - account.warmupStartDate.getTime()) / 86_400_000),
  );
  return Math.min(account.dailySendLimit, days * account.warmupRampPerDay);
}

function nextLocalMidnight(now: Date) {
  const next = new Date(now);
  next.setHours(24, 0, 0, 0);
  return next;
}

export function buildWhatsAppQueueEstimates(
  queueItems: QueueItem[],
  accounts: Account[],
  recentSentItems: SentItem[],
  now = new Date(),
) {
  const estimates = new Map<string, WhatsAppQueueEstimate>();
  const accountById = new Map(accounts.map((account) => [account.id, account]));
  const sentByAccount = new Map<string, Date[]>();

  for (const item of recentSentItems) {
    if (!item.accountId || !item.sentAt) continue;
    const dates = sentByAccount.get(item.accountId) ?? [];
    dates.push(item.sentAt);
    sentByAccount.set(item.accountId, dates);
  }

  const lanes = new Map<string, QueueItem[]>();
  for (const item of queueItems) {
    if (!item.accountId) continue;
    const lane = lanes.get(item.accountId) ?? [];
    lane.push(item);
    lanes.set(item.accountId, lane);
  }

  for (const [accountId, lane] of lanes) {
    const account = accountById.get(accountId);
    if (!account) continue;

    lane.sort((a, b) =>
      a.sendAfterAt.getTime() - b.sendAfterAt.getTime() ||
      a.queuedAt.getTime() - b.queuedAt.getTime() ||
      a.id.localeCompare(b.id),
    );

    const sentDates = (sentByAccount.get(accountId) ?? []).sort(
      (a, b) => a.getTime() - b.getTime(),
    );
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);
    const sentToday = sentDates.filter((date) => date >= todayStart);
    const oneHourAgo = now.getTime() - 60 * 60 * 1000;
    const sentLastHour = sentDates.filter((date) => date.getTime() >= oneHourAgo);
    const dailyLimited = sentToday.length >= effectiveDailyCap(account, now);
    const hourlyLimited = sentLastHour.length >= account.hourlySendLimit;
    const rateBlockedUntil = dailyLimited
      ? nextLocalMidnight(now)
      : hourlyLimited
        ? new Date(sentLastHour[0].getTime() + 60 * 60 * 1000)
        : null;

    const paused =
      !account.autoReplyEnabled ||
      account.status === "PAUSED" ||
      account.status === "ERROR" ||
      account.consecutiveFailures >= account.autoPauseThreshold;
    const heartbeatStale =
      account.lastHeartbeatAt !== null &&
      now.getTime() - account.lastHeartbeatAt.getTime() > HEARTBEAT_STALE_MS;
    const offline = account.status !== "CONNECTED" || heartbeatStale;

    let queuedPosition = 0;
    lane.forEach((item, laneIndex) => {
      if (item.status === "QUEUED") queuedPosition += 1;

      let state: WhatsAppEtaState = item.status === "SENDING" ? "SENDING" : "SCHEDULED";
      if (paused) state = "PAUSED";
      else if (offline) state = "OFFLINE";
      else if (dailyLimited) state = "DAILY_LIMIT";
      else if (hourlyLimited) state = "HOURLY_LIMIT";

      const earliestMs = Math.max(
        item.sendAfterAt.getTime(),
        rateBlockedUntil?.getTime() ?? 0,
      );
      const latestMs = earliestMs + (laneIndex + 1) * WORKER_POLL_AND_SEND_SLACK_MS;

      estimates.set(item.id, {
        accountId,
        accountLabel: account.label,
        position: item.status === "QUEUED" ? queuedPosition : null,
        earliestAt: new Date(earliestMs).toISOString(),
        latestAt: new Date(latestMs).toISOString(),
        state,
      });
    });
  }

  return estimates;
}
