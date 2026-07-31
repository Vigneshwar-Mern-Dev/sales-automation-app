import { describe, it, expect } from "vitest";
import { createHash, timingSafeEqual } from "crypto";

// ── normalizeIndianPhoneNumber ───────────────────────────────────────────────

function normalizeIndianPhoneNumber(value: string | null | undefined) {
  if (!value) return null;

  let digits = value.replace(/\D/g, "");

  if (digits.length === 12 && digits.startsWith("91")) {
    return `+${digits}`;
  }

  if (digits.length === 11 && digits.startsWith("0")) {
    digits = digits.slice(1);
  }

  if (digits.length === 10) {
    return `+91${digits}`;
  }

  if (digits.length >= 8) {
    return `+${digits}`;
  }

  return null;
}

describe("normalizeIndianPhoneNumber", () => {
  it("normalizes 10-digit Indian numbers", () => {
    expect(normalizeIndianPhoneNumber("9876543210")).toBe("+919876543210");
  });

  it("normalizes 12-digit numbers starting with 91", () => {
    expect(normalizeIndianPhoneNumber("919876543210")).toBe("+919876543210");
  });

  it("normalizes 11-digit numbers starting with 0", () => {
    expect(normalizeIndianPhoneNumber("09876543210")).toBe("+919876543210");
  });

  it("handles +91 prefix", () => {
    expect(normalizeIndianPhoneNumber("+919876543210")).toBe("+919876543210");
  });

  it("handles formatted numbers", () => {
    expect(normalizeIndianPhoneNumber("+91 98765 43210")).toBe("+919876543210");
    expect(normalizeIndianPhoneNumber("(91) 98765-43210")).toBe("+919876543210");
  });

  it("handles 8-digit international numbers", () => {
    expect(normalizeIndianPhoneNumber("12345678")).toBe("+12345678");
  });

  it("returns null for too-short numbers", () => {
    expect(normalizeIndianPhoneNumber("12345")).toBe(null);
    expect(normalizeIndianPhoneNumber("123")).toBe(null);
  });

  it("returns null for empty/null/undefined", () => {
    expect(normalizeIndianPhoneNumber(null)).toBe(null);
    expect(normalizeIndianPhoneNumber(undefined)).toBe(null);
    expect(normalizeIndianPhoneNumber("")).toBe(null);
  });

  it("handles non-Indian international numbers (11+ digits)", () => {
    // 10-digit numbers are always treated as Indian — this is by design.
    // International numbers must be 11+ digits (or 12-digit starting with 91).
    expect(normalizeIndianPhoneNumber("44123456789")).toBe("+44123456789");
    expect(normalizeIndianPhoneNumber("14155551234")).toBe("+14155551234");
  });
});

// ── hashDeviceToken ──────────────────────────────────────────────────────────

function hashDeviceToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

describe("hashDeviceToken", () => {
  it("produces a 64-char hex string", () => {
    const hash = hashDeviceToken("test-token");
    expect(hash).toHaveLength(64);
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("produces consistent hashes", () => {
    const hash1 = hashDeviceToken("same-token");
    const hash2 = hashDeviceToken("same-token");
    expect(hash1).toBe(hash2);
  });

  it("produces different hashes for different tokens", () => {
    const hash1 = hashDeviceToken("token-a");
    const hash2 = hashDeviceToken("token-b");
    expect(hash1).not.toBe(hash2);
  });
});

// ── validateRegistrationSecret ───────────────────────────────────────────────

function isSameHash(value: string, expected: string) {
  const valueBuffer = Buffer.from(value);
  const expectedBuffer = Buffer.from(expected);
  return (
    valueBuffer.length === expectedBuffer.length &&
    timingSafeEqual(valueBuffer, expectedBuffer)
  );
}

function validateRegistrationSecret(secret: unknown, expected: string) {
  if (typeof secret !== "string" || !secret.trim()) {
    return false;
  }
  return isSameHash(hashDeviceToken(secret.trim()), hashDeviceToken(expected));
}

describe("validateRegistrationSecret", () => {
  it("returns true for matching secret", () => {
    expect(validateRegistrationSecret("my-secret", "my-secret")).toBe(true);
  });

  it("returns false for wrong secret", () => {
    expect(validateRegistrationSecret("wrong", "my-secret")).toBe(false);
  });

  it("returns false for non-string input", () => {
    expect(validateRegistrationSecret(null, "my-secret")).toBe(false);
    expect(validateRegistrationSecret(undefined, "my-secret")).toBe(false);
    expect(validateRegistrationSecret(123, "my-secret")).toBe(false);
  });

  it("returns false for empty string", () => {
    expect(validateRegistrationSecret("", "my-secret")).toBe(false);
    expect(validateRegistrationSecret("   ", "my-secret")).toBe(false);
  });

  it("trims whitespace from secret", () => {
    expect(validateRegistrationSecret("  my-secret  ", "my-secret")).toBe(true);
  });
});

// ── sessionStatusForEvent ────────────────────────────────────────────────────

type CallEventType = "RINGING" | "ANSWERED" | "MISSED" | "ENDED";

function sessionStatusForEvent(eventType: CallEventType, wasAnswered: boolean) {
  if (eventType === "RINGING") return "RINGING" as const;
  if (eventType === "ANSWERED") return "ANSWERED" as const;
  if (eventType === "MISSED") return wasAnswered ? ("COMPLETED" as const) : ("MISSED" as const);
  return wasAnswered ? ("COMPLETED" as const) : ("MISSED" as const);
}

describe("sessionStatusForEvent", () => {
  it("returns RINGING for RINGING event", () => {
    expect(sessionStatusForEvent("RINGING", false)).toBe("RINGING");
    expect(sessionStatusForEvent("RINGING", true)).toBe("RINGING");
  });

  it("returns ANSWERED for ANSWERED event", () => {
    expect(sessionStatusForEvent("ANSWERED", false)).toBe("ANSWERED");
    expect(sessionStatusForEvent("ANSWERED", true)).toBe("ANSWERED");
  });

  it("returns MISSED for MISSED event when not answered", () => {
    expect(sessionStatusForEvent("MISSED", false)).toBe("MISSED");
  });

  it("returns COMPLETED for MISSED event when previously answered", () => {
    expect(sessionStatusForEvent("MISSED", true)).toBe("COMPLETED");
  });

  it("returns COMPLETED for ENDED event when answered", () => {
    expect(sessionStatusForEvent("ENDED", true)).toBe("COMPLETED");
  });

  it("returns MISSED for ENDED event when not answered", () => {
    expect(sessionStatusForEvent("ENDED", false)).toBe("MISSED");
  });
});

// ── Error classification (from whatsapp-worker) ──────────────────────────────

const INVALID_NUMBER_PATTERNS = [
  "is not registered on whatsapp",
  "invalid phone",
  "invalid number",
  "not a valid whatsapp",
  "no lid for user",
  "wid is invalid",
];

function classifyError(errorMessage: string) {
  const lower = (errorMessage || "").toLowerCase();
  for (const pattern of INVALID_NUMBER_PATTERNS) {
    if (lower.includes(pattern)) return "INVALID_NUMBER";
  }
  return "DELIVERY_FAILURE";
}

describe("classifyError", () => {
  it("classifies unregistered number errors as INVALID_NUMBER", () => {
    expect(classifyError("Phone is not registered on WhatsApp")).toBe("INVALID_NUMBER");
    expect(classifyError("Invalid phone number format")).toBe("INVALID_NUMBER");
    expect(classifyError("This is not a valid WhatsApp number")).toBe("INVALID_NUMBER");
    expect(classifyError("No LID for user 919876543210")).toBe("INVALID_NUMBER");
    expect(classifyError("WID is invalid for this contact")).toBe("INVALID_NUMBER");
  });

  it("classifies other errors as DELIVERY_FAILURE", () => {
    expect(classifyError("Network timeout")).toBe("DELIVERY_FAILURE");
    expect(classifyError("Connection refused")).toBe("DELIVERY_FAILURE");
    expect(classifyError("Unknown error")).toBe("DELIVERY_FAILURE");
    expect(classifyError("")).toBe("DELIVERY_FAILURE");
  });
});
