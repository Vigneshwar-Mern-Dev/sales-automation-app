import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("=== COMPANY PHONES ===");
  const phones = await prisma.companyPhone.findMany();
  console.log(JSON.stringify(phones, null, 2));

  console.log("\n=== LATEST CALL SESSIONS ===");
  const sessions = await prisma.callSession.findMany({
    orderBy: { createdAt: "desc" },
    take: 10
  });
  console.log(JSON.stringify(sessions, null, 2));

  console.log("\n=== LATEST CALL EVENTS ===");
  const events = await prisma.callEvent.findMany({
    orderBy: { receivedAt: "desc" },
    take: 10
  });
  console.log(JSON.stringify(events, null, 2));
}

main().catch(console.error).finally(() => prisma.$disconnect());
