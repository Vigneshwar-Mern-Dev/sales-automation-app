import { describe, expect, it } from "vitest";

import { buildWhatsAppQueueEstimates } from "@/app/lib/whatsapp-queue-eta";

const now = new Date("2026-08-08T10:00:00.000Z");
const account = (id: string) => ({
  id,
  label: `Account ${id}`,
  status: "CONNECTED",
  autoReplyEnabled: true,
  lastHeartbeatAt: now,
  consecutiveFailures: 0,
  autoPauseThreshold: 3,
  hourlySendLimit: 10,
  dailySendLimit: 100,
  warmupEnabled: false,
  warmupStartDate: null,
  warmupRampPerDay: 10,
});

describe("WhatsApp account queue ETA", () => {
  it("numbers each account lane independently", () => {
    const estimates = buildWhatsAppQueueEstimates(
      [
        { id: "a1", accountId: "a", status: "QUEUED", queuedAt: now, sendAfterAt: new Date(now.getTime() + 120_000) },
        { id: "b1", accountId: "b", status: "QUEUED", queuedAt: now, sendAfterAt: new Date(now.getTime() + 130_000) },
        { id: "a2", accountId: "a", status: "QUEUED", queuedAt: now, sendAfterAt: new Date(now.getTime() + 240_000) },
      ],
      [account("a"), account("b")],
      [],
      now,
    );

    expect(estimates.get("a1")?.position).toBe(1);
    expect(estimates.get("b1")?.position).toBe(1);
    expect(estimates.get("a2")?.position).toBe(2);
  });

  it("marks a disabled account paused even when its browser is connected", () => {
    const disabled = { ...account("a"), autoReplyEnabled: false };
    const estimates = buildWhatsAppQueueEstimates(
      [{ id: "a1", accountId: "a", status: "QUEUED", queuedAt: now, sendAfterAt: now }],
      [disabled],
      [],
      now,
    );
    expect(estimates.get("a1")?.state).toBe("PAUSED");
  });

  it("moves the window to the next hourly capacity slot", () => {
    const limited = { ...account("a"), hourlySendLimit: 1 };
    const sentAt = new Date(now.getTime() - 30 * 60 * 1000);
    const estimates = buildWhatsAppQueueEstimates(
      [{ id: "a1", accountId: "a", status: "QUEUED", queuedAt: now, sendAfterAt: now }],
      [limited],
      [{ accountId: "a", sentAt }],
      now,
    );
    expect(estimates.get("a1")?.state).toBe("HOURLY_LIMIT");
    expect(estimates.get("a1")?.earliestAt).toBe(new Date(sentAt.getTime() + 3_600_000).toISOString());
  });

  it("keeps the hourly limit across midnight without counting yesterday toward today's cap", () => {
    const afterMidnight = new Date("2026-08-09T00:15:00+05:30");
    const limited = { ...account("a"), hourlySendLimit: 1, dailySendLimit: 1 };
    const yesterday = new Date("2026-08-08T23:45:00+05:30");
    const estimates = buildWhatsAppQueueEstimates(
      [{ id: "a1", accountId: "a", status: "QUEUED", queuedAt: afterMidnight, sendAfterAt: afterMidnight }],
      [{ ...limited, lastHeartbeatAt: afterMidnight }],
      [{ accountId: "a", sentAt: yesterday }],
      afterMidnight,
    );
    expect(estimates.get("a1")?.state).toBe("HOURLY_LIMIT");
  });
});
