import "server-only";

const DEVELOPMENT_PUBLIC_CRM_URL = "http://localhost:3000";

export function getPublicCrmUrl() {
  const configuredUrl = process.env.CRM_PUBLIC_URL?.trim() || process.env.NEXT_PUBLIC_CRM_URL?.trim();

  if (!configuredUrl) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("Missing public CRM URL. Set CRM_PUBLIC_URL or NEXT_PUBLIC_CRM_URL to the public HTTPS CRM domain.");
    }
    return DEVELOPMENT_PUBLIC_CRM_URL;
  }

  let url: URL;
  try {
    url = new URL(configuredUrl);
  } catch {
    throw new Error("Invalid public CRM URL. CRM_PUBLIC_URL or NEXT_PUBLIC_CRM_URL must be an absolute HTTP(S) URL.");
  }

  const isLoopback = ["localhost", "127.0.0.1", "::1"].includes(url.hostname.toLowerCase());
  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error("Public CRM URL must use HTTP or HTTPS.");
  }
  if (process.env.NODE_ENV === "production" && isLoopback) {
    throw new Error("Production public CRM URL cannot point to localhost or a loopback address.");
  }

  return url.toString().replace(/\/$/, "");
}

export function getPublicCrmFormUrl(formToken: string) {
  return `${getPublicCrmUrl()}/atm-franchise/${encodeURIComponent(formToken)}`;
}
