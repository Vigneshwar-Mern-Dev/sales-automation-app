import { describe, expect, it } from "vitest";
import {
  chooseDeferredWhatsAppAccount,
  isDeferredWhatsAppStatus,
} from "../../app/lib/whatsapp-routing-policy";

describe("two-phone WhatsApp routing policy", () => {
  const older = new Date("2026-01-01T00:00:00.000Z");
  const newer = new Date("2026-01-02T00:00:00.000Z");

  it("sends immediately only when the mapped account is connected", () => {
    expect(isDeferredWhatsAppStatus("CONNECTED")).toBe(false);
    expect(isDeferredWhatsAppStatus("QR_REQUIRED")).toBe(true);
    expect(isDeferredWhatsAppStatus("DISCONNECTED")).toBe(true);
    expect(isDeferredWhatsAppStatus("CONNECTING")).toBe(true);
  });

  it("preserves the customer's sticky account while workers are offline", () => {
    const accounts = [
      { id: "account-a", lastAssignedAt: older, createdAt: older },
      { id: "account-b", lastAssignedAt: newer, createdAt: newer },
    ];
    expect(chooseDeferredWhatsAppAccount(accounts, "account-b")?.id).toBe("account-b");
  });

  it("uses the least-recently assigned account when there is no mapping or sticky sender", () => {
    const accounts = [
      { id: "account-b", lastAssignedAt: newer, createdAt: newer },
      { id: "account-a", lastAssignedAt: older, createdAt: older },
    ];
    expect(chooseDeferredWhatsAppAccount(accounts)?.id).toBe("account-a");
  });

  it("returns null when no enabled account exists", () => {
    expect(chooseDeferredWhatsAppAccount([])).toBeNull();
  });
});
