import "server-only";

import { createHash } from "node:crypto";
import { db } from "./db";
import { hasPrismaCode } from "./prisma-utils";

type RateLimitOptions = {
  key: string;
  limit: number;
  windowMs: number;
  blockMs?: number;
};

export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
};



export function rateLimitKey(scope: string, ...identifiers: Array<string | null | undefined>) {
  const digest = createHash("sha256")
    .update(identifiers.map((value) => value?.trim().toLowerCase() || "unknown").join("\u0000"))
    .digest("hex");

  return `${scope}:${digest}`;
}

export async function consumeRateLimit(options: RateLimitOptions): Promise<RateLimitResult> {
  if (options.limit < 1 || options.windowMs < 1) {
    throw new Error("Invalid rate-limit configuration.");
  }

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await db.$transaction(
        async (tx) => {
          const now = new Date();
          const existing = await tx.rateLimitBucket.findUnique({
            where: { key: options.key },
          });

          if (existing?.blockedUntil && existing.blockedUntil > now) {
            return {
              allowed: false,
              remaining: 0,
              retryAfterSeconds: Math.max(
                1,
                Math.ceil((existing.blockedUntil.getTime() - now.getTime()) / 1000),
              ),
            };
          }

          const windowExpired =
            !existing || now.getTime() - existing.windowStartedAt.getTime() >= options.windowMs;

          if (windowExpired) {
            await tx.rateLimitBucket.upsert({
              where: { key: options.key },
              create: { key: options.key, count: 1, windowStartedAt: now },
              update: { count: 1, windowStartedAt: now, blockedUntil: null },
            });

            return {
              allowed: true,
              remaining: options.limit - 1,
              retryAfterSeconds: 0,
            };
          }

          const count = existing.count + 1;
          const windowEndsAt = new Date(existing.windowStartedAt.getTime() + options.windowMs);
          const allowed = count <= options.limit;
          const blockedUntil = allowed
            ? null
            : new Date(
                Math.max(
                  windowEndsAt.getTime(),
                  now.getTime() + (options.blockMs ?? options.windowMs),
                ),
              );

          await tx.rateLimitBucket.update({
            where: { key: options.key },
            data: { count, blockedUntil },
          });

          return {
            allowed,
            remaining: Math.max(0, options.limit - count),
            retryAfterSeconds: allowed
              ? 0
              : Math.max(1, Math.ceil((blockedUntil!.getTime() - now.getTime()) / 1000)),
          };
        },
        { isolationLevel: "Serializable" },
      );
    } catch (error) {
      if (attempt < 2 && (hasPrismaCode(error, "P2034") || hasPrismaCode(error, "P2002"))) {
        continue;
      }

      throw error;
    }
  }

  throw new Error("Rate-limit transaction could not be completed.");
}

export async function resetRateLimit(key: string) {
  await db.rateLimitBucket.deleteMany({ where: { key } });
}