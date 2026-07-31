import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("=== CALL SESSIONS ON JUN 19 ===");
  const startOfDay = new Date("2026-06-19T00:00:00Z");
  const endOfDay = new Date("2026-06-19T23:59:59Z");
  const sessions = await prisma.callSession.findMany({
    where: {
      createdAt: {
        gte: startOfDay,
        lte: endOfDay
      }
    },
    include: {
      events: true
    }
  });
  console.log(`Found ${sessions.length} sessions`);
  for (const session of sessions) {
    console.log(`Session ID: ${session.id}`);
    console.log(`  Caller: ${session.callerNumber}`);
    console.log(`  Status: ${session.status}`);
    console.log(`  Created At: ${session.createdAt}`);
    console.log(`  First Ring At: ${session.firstRingAt}`);
    console.log(`  Events count: ${session.events.length}`);
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
