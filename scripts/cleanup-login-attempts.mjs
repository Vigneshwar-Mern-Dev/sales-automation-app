/**
 * Deletes stale security throttling records.
 * Run daily via cron or manually: npm run cleanup:security
 */

import { PrismaClient } from "@prisma/client";
import "dotenv/config";

const prisma = new PrismaClient();
const RETENTION_HOURS = 24;

async function main() {
  const cutoff = new Date(Date.now() - RETENTION_HOURS * 60 * 60 * 1000);

  const [legacyAttempts, rateLimitBuckets] = await prisma.$transaction([
    prisma.loginAttempt.deleteMany({ where: { updatedAt: { lt: cutoff } } }),
    prisma.rateLimitBucket.deleteMany({ where: { updatedAt: { lt: cutoff } } }),
  ]);

  console.log(
    `[cleanup] Deleted ${legacyAttempts.count} legacy login attempt(s) and ${rateLimitBuckets.count} rate-limit bucket(s) older than ${RETENTION_HOURS}h.`,
  );
}

main()
  .catch((error) => {
    console.error("[cleanup] Error:", error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());