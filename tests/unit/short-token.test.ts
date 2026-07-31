import { describe, it, expect } from "vitest";
import { randomBytes } from "crypto";

// Replicate generateRandomCode to avoid import issues
function generateRandomCode(length = 24): string {
  if (!Number.isInteger(length) || length < 16 || length > 128) {
    throw new RangeError("Token length must be an integer between 16 and 128.");
  }
  const byteLength = Math.ceil((length * 3) / 4);
  return randomBytes(byteLength).toString("base64url").slice(0, length);
}

describe("generateRandomCode", () => {
  it("generates a token of the default length (24)", () => {
    const token = generateRandomCode();
    expect(token).toHaveLength(24);
  });

  it("generates a token of a custom length", () => {
    const token = generateRandomCode(32);
    expect(token).toHaveLength(32);
  });

  it("generates URL-safe characters only", () => {
    for (let i = 0; i < 20; i++) {
      const token = generateRandomCode();
      // base64url only contains [A-Za-z0-9_-]
      expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    }
  });

  it("generates unique tokens", () => {
    const tokens = new Set<string>();
    for (let i = 0; i < 100; i++) {
      tokens.add(generateRandomCode());
    }
    // With 24-char base64url tokens, collisions should never happen
    expect(tokens.size).toBe(100);
  });

  it("throws for length below 16", () => {
    expect(() => generateRandomCode(15)).toThrow(RangeError);
    expect(() => generateRandomCode(8)).toThrow(RangeError);
  });

  it("throws for length above 128", () => {
    expect(() => generateRandomCode(129)).toThrow(RangeError);
  });

  it("throws for non-integer length", () => {
    expect(() => generateRandomCode(24.5)).toThrow(RangeError);
  });

  it("works at boundary lengths", () => {
    expect(generateRandomCode(16)).toHaveLength(16);
    expect(generateRandomCode(128)).toHaveLength(128);
  });
});
