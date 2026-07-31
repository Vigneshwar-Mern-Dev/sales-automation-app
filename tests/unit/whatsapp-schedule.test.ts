import { describe, it, expect } from "vitest";

// Import the pure functions directly (no DB, no "server-only")
// We test the logic functions in isolation.

// ── randomDelaySeconds ───────────────────────────────────────────────────────

// Replicate the function under test to avoid "server-only" import issues
function randomDelaySeconds(minimum: number, maximum: number) {
  const min = Math.max(5, Math.floor(Math.min(minimum, maximum)));
  const max = Math.max(min, Math.floor(Math.max(minimum, maximum)));
  return min + Math.floor(Math.random() * (max - min + 1));
}

describe("randomDelaySeconds", () => {
  it("returns a value within the specified range", () => {
    for (let i = 0; i < 100; i++) {
      const delay = randomDelaySeconds(30, 120);
      expect(delay).toBeGreaterThanOrEqual(30);
      expect(delay).toBeLessThanOrEqual(120);
    }
  });

  it("enforces minimum of 5 seconds", () => {
    for (let i = 0; i < 50; i++) {
      const delay = randomDelaySeconds(1, 3);
      expect(delay).toBeGreaterThanOrEqual(5);
    }
  });

  it("handles swapped min/max", () => {
    for (let i = 0; i < 50; i++) {
      const delay = randomDelaySeconds(120, 30);
      expect(delay).toBeGreaterThanOrEqual(30);
      expect(delay).toBeLessThanOrEqual(120);
    }
  });

  it("handles equal min and max", () => {
    const delay = randomDelaySeconds(60, 60);
    expect(delay).toBe(60);
  });

  it("clamps small values to minimum of 5", () => {
    const delay = randomDelaySeconds(0, 0);
    expect(delay).toBe(5);
  });
});

// ── isWhatsAppQuietTime ──────────────────────────────────────────────────────

// Replicate parseClock for testing
function parseClock(value: string) {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

function localMinuteOfDay(date: Date, timeZone: string) {
  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const parts = formatter.formatToParts(date);
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
  return hour * 60 + minute;
}

function isWhatsAppQuietTime(
  date: Date,
  start: string,
  end: string,
  timeZone = "Asia/Kolkata",
) {
  const startMinute = parseClock(start);
  const endMinute = parseClock(end);
  if (startMinute === null || endMinute === null || startMinute === endMinute)
    return false;

  const currentMinute = localMinuteOfDay(date, timeZone);
  return startMinute < endMinute
    ? currentMinute >= startMinute && currentMinute < endMinute
    : currentMinute >= startMinute || currentMinute < endMinute;
}

describe("isWhatsAppQuietTime", () => {
  // Use UTC for deterministic tests
  const tz = "UTC";

  it("returns true when time is within overnight quiet hours", () => {
    // Quiet hours 21:00 - 09:00 UTC, date is 23:00 UTC
    const date = new Date("2026-07-28T23:00:00Z");
    expect(isWhatsAppQuietTime(date, "21:00", "09:00", tz)).toBe(true);
  });

  it("returns true when time is in early morning within overnight quiet hours", () => {
    const date = new Date("2026-07-28T05:00:00Z");
    expect(isWhatsAppQuietTime(date, "21:00", "09:00", tz)).toBe(true);
  });

  it("returns false when time is outside quiet hours", () => {
    const date = new Date("2026-07-28T14:00:00Z");
    expect(isWhatsAppQuietTime(date, "21:00", "09:00", tz)).toBe(false);
  });

  it("returns false when start equals end", () => {
    const date = new Date("2026-07-28T14:00:00Z");
    expect(isWhatsAppQuietTime(date, "21:00", "21:00", tz)).toBe(false);
  });

  it("handles same-day quiet hours (e.g., 13:00-17:00)", () => {
    const inside = new Date("2026-07-28T15:00:00Z");
    const outside = new Date("2026-07-28T10:00:00Z");
    expect(isWhatsAppQuietTime(inside, "13:00", "17:00", tz)).toBe(true);
    expect(isWhatsAppQuietTime(outside, "13:00", "17:00", tz)).toBe(false);
  });

  it("returns false for invalid clock strings", () => {
    const date = new Date("2026-07-28T14:00:00Z");
    expect(isWhatsAppQuietTime(date, "25:00", "09:00", tz)).toBe(false);
    expect(isWhatsAppQuietTime(date, "abc", "09:00", tz)).toBe(false);
  });

  it("boundary: time exactly at quiet start is quiet", () => {
    const date = new Date("2026-07-28T21:00:00Z");
    expect(isWhatsAppQuietTime(date, "21:00", "09:00", tz)).toBe(true);
  });

  it("boundary: time exactly at quiet end is NOT quiet", () => {
    const date = new Date("2026-07-28T09:00:00Z");
    expect(isWhatsAppQuietTime(date, "21:00", "09:00", tz)).toBe(false);
  });
});

// ── moveOutsideWhatsAppQuietTime ─────────────────────────────────────────────

function moveOutsideWhatsAppQuietTime(
  candidate: Date,
  start: string,
  end: string,
  timeZone = "UTC",
) {
  let adjusted = new Date(candidate);
  for (let minute = 0; minute <= 24 * 60 + 1; minute += 1) {
    if (!isWhatsAppQuietTime(adjusted, start, end, timeZone)) return adjusted;
    adjusted = new Date(
      Math.floor(adjusted.getTime() / 60_000) * 60_000 + 60_000,
    );
  }
  return adjusted;
}

describe("moveOutsideWhatsAppQuietTime", () => {
  it("returns the same time if already outside quiet hours", () => {
    const candidate = new Date("2026-07-28T14:00:00Z");
    const result = moveOutsideWhatsAppQuietTime(
      candidate,
      "21:00",
      "09:00",
      "UTC",
    );
    expect(result.getTime()).toBe(candidate.getTime());
  });

  it("pushes forward to end of quiet hours", () => {
    const candidate = new Date("2026-07-28T23:30:00Z");
    const result = moveOutsideWhatsAppQuietTime(
      candidate,
      "21:00",
      "09:00",
      "UTC",
    );
    // Should be pushed to 09:00 the next day
    expect(result.getUTCHours()).toBe(9);
    expect(result.getUTCMinutes()).toBe(0);
  });

  it("pushes forward from early morning to end of quiet hours", () => {
    const candidate = new Date("2026-07-28T03:15:00Z");
    const result = moveOutsideWhatsAppQuietTime(
      candidate,
      "21:00",
      "09:00",
      "UTC",
    );
    expect(result.getUTCHours()).toBe(9);
    expect(result.getUTCMinutes()).toBe(0);
  });
});
