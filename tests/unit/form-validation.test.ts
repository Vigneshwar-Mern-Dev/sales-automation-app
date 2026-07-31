import { describe, it, expect } from "vitest";

// ── Google Maps URL validation ───────────────────────────────────────────────

const GOOGLE_MAPS_URL_PATTERN =
  /^https:\/\/(www\.)?(google\.(com|co\.[a-z]{2}|[a-z]{2,3})\/maps|maps\.google\.(com|co\.[a-z]{2}|[a-z]{2,3})|goo\.gl\/maps|maps\.app\.goo\.gl)[\/\?#]./i;

function isValidGoogleMapsUrl(value: string): boolean {
  if (!value || value.length > 2048) return false;

  const lower = value.toLowerCase().trim();
  if (lower.startsWith("javascript:") || lower.includes("<script")) return false;

  try {
    const url = new URL(value);
    if (url.protocol !== "https:") return false;
    return GOOGLE_MAPS_URL_PATTERN.test(value);
  } catch {
    return false;
  }
}

describe("isValidGoogleMapsUrl", () => {
  it("accepts valid Google Maps URLs", () => {
    const validUrls = [
      "https://www.google.com/maps/place/New+Delhi",
      "https://google.com/maps/place/Mumbai",
      "https://maps.google.com/maps?q=Chennai",
      "https://goo.gl/maps/abc123",
      "https://maps.app.goo.gl/abc123",
      "https://www.google.co.in/maps/place/Bangalore",
      "https://maps.google.co.in/maps?q=Pune",
    ];

    for (const url of validUrls) {
      expect(isValidGoogleMapsUrl(url), `Expected valid: ${url}`).toBe(true);
    }
  });

  it("rejects non-Google Maps URLs", () => {
    const invalidUrls = [
      "https://example.com",
      "https://maps.example.com/place",
      "https://google.com/search?q=test",
      "http://google.com/maps/place/test", // not https
      "ftp://maps.google.com/maps",
    ];

    for (const url of invalidUrls) {
      expect(isValidGoogleMapsUrl(url), `Expected invalid: ${url}`).toBe(false);
    }
  });

  it("rejects XSS attempts", () => {
    expect(isValidGoogleMapsUrl("javascript:alert(1)")).toBe(false);
    expect(isValidGoogleMapsUrl("https://google.com/maps/<script>alert(1)</script>")).toBe(false);
  });

  it("rejects empty and overly long URLs", () => {
    expect(isValidGoogleMapsUrl("")).toBe(false);
    expect(isValidGoogleMapsUrl("https://google.com/maps/" + "a".repeat(2100))).toBe(false);
  });

  it("rejects non-URL strings", () => {
    expect(isValidGoogleMapsUrl("not a url")).toBe(false);
    expect(isValidGoogleMapsUrl("12345")).toBe(false);
  });
});

// ── Phone normalization ──────────────────────────────────────────────────────

function normalizePhone(value: string) {
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

  return digits.length >= 8 ? `+${digits}` : value;
}

describe("normalizePhone", () => {
  it("normalizes 10-digit Indian numbers", () => {
    expect(normalizePhone("9876543210")).toBe("+919876543210");
  });

  it("normalizes 12-digit numbers with 91 prefix", () => {
    expect(normalizePhone("919876543210")).toBe("+919876543210");
  });

  it("normalizes 11-digit numbers with leading 0", () => {
    expect(normalizePhone("09876543210")).toBe("+919876543210");
  });

  it("handles numbers with +91 prefix", () => {
    expect(normalizePhone("+919876543210")).toBe("+919876543210");
  });

  it("handles numbers with spaces and dashes", () => {
    expect(normalizePhone("98765-43210")).toBe("+919876543210");
    expect(normalizePhone("98765 43210")).toBe("+919876543210");
    expect(normalizePhone("+91 98765 43210")).toBe("+919876543210");
  });

  it("returns original for very short numbers", () => {
    expect(normalizePhone("12345")).toBe("12345");
  });

  it("handles 8+ digit international numbers", () => {
    expect(normalizePhone("44123456789")).toBe("+44123456789");
  });
});

// ── Token validation ─────────────────────────────────────────────────────────

const FORM_TOKEN_MIN_LENGTH = 16;
const FORM_TOKEN_MAX_LENGTH = 128;

function isValidFormToken(token: string) {
  return (
    token.length >= FORM_TOKEN_MIN_LENGTH && token.length <= FORM_TOKEN_MAX_LENGTH
  );
}

describe("isValidFormToken", () => {
  it("accepts tokens of valid length", () => {
    expect(isValidFormToken("a".repeat(16))).toBe(true);
    expect(isValidFormToken("a".repeat(24))).toBe(true);
    expect(isValidFormToken("a".repeat(128))).toBe(true);
  });

  it("rejects tokens that are too short", () => {
    expect(isValidFormToken("a".repeat(15))).toBe(false);
    expect(isValidFormToken("short")).toBe(false);
    expect(isValidFormToken("")).toBe(false);
  });

  it("rejects tokens that are too long", () => {
    expect(isValidFormToken("a".repeat(129))).toBe(false);
  });
});

// ── Property type validation ─────────────────────────────────────────────────

const PROPERTY_TYPES = new Set(["OWN", "RENTAL"]);

describe("propertyType validation", () => {
  it("accepts valid property types", () => {
    expect(PROPERTY_TYPES.has("OWN")).toBe(true);
    expect(PROPERTY_TYPES.has("RENTAL")).toBe(true);
  });

  it("rejects invalid property types", () => {
    expect(PROPERTY_TYPES.has("LEASE")).toBe(false);
    expect(PROPERTY_TYPES.has("own")).toBe(false); // case-sensitive
    expect(PROPERTY_TYPES.has("")).toBe(false);
  });
});
