import { describe, expect, it } from "vitest";

import { getWhatsAppMessageDeliveryState } from "@/app/lib/whatsapp-delivery-status";

describe("WhatsApp message delivery status", () => {
  it("shows a failed send as not sent", () => {
    expect(getWhatsAppMessageDeliveryState("FAILED", "FAILED")).toBe("NOT_SENT");
  });

  it("shows queued and sending states before completion", () => {
    expect(getWhatsAppMessageDeliveryState("QUEUED", "QUEUED")).toBe("QUEUED");
    expect(getWhatsAppMessageDeliveryState("SENDING", "SENDING")).toBe("SENDING");
  });

  it("shows a completed send as sent", () => {
    expect(getWhatsAppMessageDeliveryState("SENT", "SENT")).toBe("SENT");
  });

  it("treats an opened form as proof the link was received", () => {
    expect(getWhatsAppMessageDeliveryState("FAILED", "FAILED", true)).toBe("SENT");
  });
});
