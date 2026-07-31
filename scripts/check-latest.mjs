import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("=== LATEST CALL EVENTS ===");
  const events = await prisma.callEvent.findMany({
    orderBy: { receivedAt: "desc" },
    take: 5
  });
  for (const event of events) {
    console.log(`Event ID: ${event.eventId}`);
    console.log(`  Caller: ${event.callerNumber}`);
    console.log(`  Type: ${event.eventType}`);
    console.log(`  Occurred: ${event.occurredAt}`);
    console.log(`  Received: ${event.receivedAt}`);
  }

  console.log("=== LATEST PHONE UPDATES ===");
  const phones = await prisma.companyPhone.findMany();
  for (const phone of phones) {
    console.log(`Phone: ${phone.phoneNumber}`);
    console.log(`  Last Seen At: ${phone.lastSeenAt}`);
    console.log(`  Pending Sync Count: ${phone.pendingSyncCount}`);
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
