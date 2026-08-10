import { describe, expect, it } from "vitest";

import { shouldRestartStaleWorker } from "../../scripts/whatsapp-worker-manager-utils.mjs";

describe("WhatsApp worker manager health", () => {
  const now = Date.parse("2026-08-10T08:00:00.000Z");

  it("restarts a connected worker whose heartbeat is stale", () => {
    expect(
      shouldRestartStaleWorker(
        { status: "CONNECTED", lastHeartbeatAt: "2026-08-10T07:50:00.000Z" },
        now - 10 * 60 * 1000,
        now,
      ),
    ).toBe(true);
  });

  it("does not restart during startup grace or while waiting for QR", () => {
    expect(
      shouldRestartStaleWorker(
        { status: "CONNECTED", lastHeartbeatAt: null },
        now - 30 * 1000,
        now,
      ),
    ).toBe(false);
    expect(
      shouldRestartStaleWorker(
        { status: "QR_REQUIRED", lastHeartbeatAt: "2026-08-10T07:00:00.000Z" },
        now - 60 * 60 * 1000,
        now,
      ),
    ).toBe(false);
  });
});
