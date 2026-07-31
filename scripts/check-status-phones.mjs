import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("=== COMPANY PHONES ===");
  const phones = await prisma.companyPhone.findMany();
  for (const phone of phones) {
    console.log(`Phone: ${phone.phoneNumber}, Label: ${phone.label}, DeviceId: ${phone.deviceId}`);
    console.log(`  Last Seen At: ${phone.lastSeenAt}`);
    console.log(`  Pending Sync Count: ${phone.pendingSyncCount}`);
    console.log(`  Last Sync Attempt: ${phone.lastSyncAttemptAt}`);
    console.log(`  Last Successful Sync: ${phone.lastSuccessfulSyncAt}`);
    console.log(`  Last Sync Error: ${phone.lastSyncError}`);
    console.log(`  Last Sync Error At: ${phone.lastSyncErrorAt}`);
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
