import { describe, expect, it } from "vitest";

import {
  getProviderMessageId,
  normalizeWhatsAppPhone,
  phoneFromWhatsAppId,
  toWhatsAppId,
} from "../../scripts/whatsapp-worker-utils.mjs";

describe("WhatsApp worker utilities", () => {
  it("normalizes an international phone number into a WhatsApp phone ID", () => {
    expect(normalizeWhatsAppPhone("+91 63926 41695")).toBe("916392641695");
    expect(toWhatsAppId("+91 63926 41695")).toBe("916392641695@c.us");
  });

  it("adds the configured default country code to a local number", () => {
    expect(normalizeWhatsAppPhone("6392641695")).toBe("916392641695");
    expect(normalizeWhatsAppPhone("06392641695")).toBe("916392641695");
    expect(normalizeWhatsAppPhone("0091 63926 41695")).toBe("916392641695");
  });

  it("rejects malformed numbers before calling WhatsApp", () => {
    expect(() => toWhatsAppId("123")).toThrow("10-digit local number or 8-15 international digits");
  });

  it("does not turn a WhatsApp LID into a fake phone number", () => {
    expect(phoneFromWhatsAppId("35206048284880@lid")).toBeNull();
    expect(phoneFromWhatsAppId("916392641695@c.us")).toBe("+916392641695");
  });

  it("keeps a provider message ID when WhatsApp returns one", () => {
    expect(getProviderMessageId({ id: { _serialized: "message-id" } })).toBe("message-id");
  });

  it("allows a completed send when the local message cache has no ID", () => {
    expect(getProviderMessageId(undefined)).toBeNull();
    expect(getProviderMessageId({ id: {} })).toBeNull();
  });
});
