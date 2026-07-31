import { describe, it, expect } from "vitest";

// ── getPublicCrmUrl ──────────────────────────────────────────────────────────

// Replicate the logic to avoid "server-only"
const DEVELOPMENT_PUBLIC_CRM_URL = "http://localhost:3000";

function getPublicCrmUrl(env: Record<string, string | undefined> = {}) {
  const configuredUrl = env.CRM_PUBLIC_URL?.trim() || env.NEXT_PUBLIC_CRM_URL?.trim();

  if (!configuredUrl) {
    if (env.NODE_ENV === "production") {
      throw new Error(
        "Missing public CRM URL. Set CRM_PUBLIC_URL or NEXT_PUBLIC_CRM_URL to the public HTTPS CRM domain.",
      );
    }
    return DEVELOPMENT_PUBLIC_CRM_URL;
  }

  let url: URL;
  try {
    url = new URL(configuredUrl);
  } catch {
    throw new Error(
      "Invalid public CRM URL. CRM_PUBLIC_URL or NEXT_PUBLIC_CRM_URL must be an absolute HTTP(S) URL.",
    );
  }

  const isLoopback = ["localhost", "127.0.0.1", "::1"].includes(
    url.hostname.toLowerCase(),
  );
  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error("Public CRM URL must use HTTP or HTTPS.");
  }
  if (env.NODE_ENV === "production" && isLoopback) {
    throw new Error(
      "Production public CRM URL cannot point to localhost or a loopback address.",
    );
  }

  return url.toString().replace(/\/$/, "");
}

function getPublicCrmFormUrl(formToken: string, env: Record<string, string | undefined> = {}) {
  return `${getPublicCrmUrl(env)}/atm-franchise/${encodeURIComponent(formToken)}`;
}

describe("getPublicCrmUrl", () => {
  it("returns configured URL when set", () => {
    const url = getPublicCrmUrl({
      NEXT_PUBLIC_CRM_URL: "https://crm.planle.com",
    });
    expect(url).toBe("https://crm.planle.com");
  });

  it("strips trailing slash", () => {
    const url = getPublicCrmUrl({
      NEXT_PUBLIC_CRM_URL: "https://crm.planle.com/",
    });
    expect(url).toBe("https://crm.planle.com");
  });

  it("prefers CRM_PUBLIC_URL over NEXT_PUBLIC_CRM_URL", () => {
    const url = getPublicCrmUrl({
      CRM_PUBLIC_URL: "https://custom.example.com",
      NEXT_PUBLIC_CRM_URL: "https://crm.planle.com",
    });
    expect(url).toBe("https://custom.example.com");
  });

  it("returns localhost fallback in development", () => {
    const url = getPublicCrmUrl({ NODE_ENV: "development" });
    expect(url).toBe("http://localhost:3000");
  });

  it("throws in production when no URL is configured", () => {
    expect(() => getPublicCrmUrl({ NODE_ENV: "production" })).toThrow(
      "Missing public CRM URL",
    );
  });

  it("throws in production when URL is localhost", () => {
    expect(() =>
      getPublicCrmUrl({
        NODE_ENV: "production",
        NEXT_PUBLIC_CRM_URL: "http://localhost:3000",
      }),
    ).toThrow("loopback");
  });

  it("throws in production when URL is 127.0.0.1", () => {
    expect(() =>
      getPublicCrmUrl({
        NODE_ENV: "production",
        NEXT_PUBLIC_CRM_URL: "http://127.0.0.1:3000",
      }),
    ).toThrow("loopback");
  });

  it("throws for invalid URL", () => {
    expect(() =>
      getPublicCrmUrl({
        NEXT_PUBLIC_CRM_URL: "not-a-url",
      }),
    ).toThrow("Invalid public CRM URL");
  });

  it("throws for non-HTTP protocol", () => {
    expect(() =>
      getPublicCrmUrl({
        NEXT_PUBLIC_CRM_URL: "ftp://crm.planle.com",
      }),
    ).toThrow("HTTP or HTTPS");
  });
});

describe("getPublicCrmFormUrl", () => {
  it("generates correct form URL", () => {
    const url = getPublicCrmFormUrl("abc123xyz", {
      NEXT_PUBLIC_CRM_URL: "https://crm.planle.com",
    });
    expect(url).toBe("https://crm.planle.com/atm-franchise/abc123xyz");
  });

  it("encodes special characters in token", () => {
    const url = getPublicCrmFormUrl("token/with+special=chars", {
      NEXT_PUBLIC_CRM_URL: "https://crm.planle.com",
    });
    expect(url).toContain("atm-franchise/");
    expect(url).not.toContain("token/with"); // Should be encoded
    expect(url).toContain(encodeURIComponent("token/with+special=chars"));
  });
});
