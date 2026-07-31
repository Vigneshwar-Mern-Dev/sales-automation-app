import "server-only";

import { isIP } from "node:net";

function normalizeIp(value: string | null) {
  if (!value) {
    return null;
  }

  let candidate = value.trim();

  if (candidate.startsWith("[") && candidate.includes("]")) {
    candidate = candidate.slice(1, candidate.indexOf("]"));
  } else if (/^\d{1,3}(?:\.\d{1,3}){3}:\d+$/.test(candidate)) {
    candidate = candidate.slice(0, candidate.lastIndexOf(":"));
  }

  return isIP(candidate) ? candidate : null;
}

export function getClientIpFromHeaders(headerList: Pick<Headers, "get">) {
  const cloudflareIp = normalizeIp(headerList.get("cf-connecting-ip"));
  if (cloudflareIp) {
    return cloudflareIp;
  }

  const realIp = normalizeIp(headerList.get("x-real-ip"));
  if (realIp) {
    return realIp;
  }

  const forwardedIp = normalizeIp(
    headerList.get("x-forwarded-for")?.split(",")[0] ?? null,
  );

  return forwardedIp ?? "unknown";
}