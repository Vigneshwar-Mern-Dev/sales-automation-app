import { describe, expect, it } from "vitest";

import { resolveBridgeStatus } from "@/app/lib/whatsapp-bridge-state";

describe("WhatsApp bridge state", () => {
  it("does not let a heartbeat change dispatch status", () => {
    expect(resolveBridgeStatus("PAUSED", "CONNECTED", true)).toBeUndefined();
    expect(resolveBridgeStatus("ERROR", "CONNECTED", true)).toBeUndefined();
  });

  it("keeps a paused account paused until an admin resumes it", () => {
    expect(resolveBridgeStatus("PAUSED", "CONNECTED", false)).toBeUndefined();
    expect(resolveBridgeStatus("PAUSED", "CONNECTING", false)).toBeUndefined();
  });

  it("accepts real connection transitions for an active account", () => {
    expect(resolveBridgeStatus("CONNECTING", "CONNECTED", false)).toBe("CONNECTED");
    expect(resolveBridgeStatus("CONNECTED", "ERROR", false)).toBe("ERROR");
  });
});
