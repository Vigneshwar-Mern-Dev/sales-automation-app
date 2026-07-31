/**
 * migrate-calls-integration.mjs
 *
 * One-time idempotent script that copies the existing INSTAGRAM LeadIntegration
 * config into a new CALLS row (if one doesn't already exist).
 *
 * Safe to run multiple times. Does not modify the INSTAGRAM row.
 *
 * Usage: node scripts/migrate-calls-integration.mjs
 */

import { PrismaClient } from "@prisma/client";
import "dotenv/config";

const prisma = new PrismaClient();

async function main() {
  const existing = await prisma.leadIntegration.findUnique({
    where: { source: "CALLS" },
  });

  if (existing) {
    console.log("[migrate] CALLS LeadIntegration already exists. Skipping.");
    console.log(`  id: ${existing.id}`);
    console.log(`  sheetName: ${existing.sheetName}`);
    console.log(`  status: ${existing.status}`);
    return;
  }

  const instagram = await prisma.leadIntegration.findUnique({
    where: { source: "INSTAGRAM" },
  });

  if (!instagram) {
    console.log("[migrate] No INSTAGRAM LeadIntegration found. Creating empty CALLS integration.");
    const created = await prisma.leadIntegration.create({
      data: {
        source: "CALLS",
        sheetName: "Call Leads",
        status: "NOT_CONNECTED",
      },
    });
    console.log(`[migrate] Created empty CALLS integration: ${created.id}`);
    return;
  }

  const created = await prisma.leadIntegration.create({
    data: {
      source: "CALLS",
      appScriptUrl: instagram.appScriptUrl,
      spreadsheetId: instagram.spreadsheetId,
      sheetName: instagram.sheetName,
      secretToken: instagram.secretToken,
      status: instagram.status,
    },
  });

  console.log("[migrate] Copied INSTAGRAM config to CALLS integration.");
  console.log(`  id: ${created.id}`);
  console.log(`  sheetName: ${created.sheetName}`);
  console.log(`  appScriptUrl: ${created.appScriptUrl ? "(set)" : "(not set)"}`);
  console.log(`  spreadsheetId: ${created.spreadsheetId ? "(set)" : "(not set)"}`);
  console.log(`  status: ${created.status}`);
  console.log("\nIMPORTANT: The original INSTAGRAM integration is unchanged.");
  console.log("You can now configure the CALLS integration independently in the admin panel.");
}

main()
  .catch((err) => {
    console.error("[migrate] Error:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
