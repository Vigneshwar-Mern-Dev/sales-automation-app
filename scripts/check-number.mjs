import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("=== CALLS FOR +916381221669 ===");
  const events = await prisma.callEvent.findMany({
    where: {
      callerNumber: {
        contains: "6381221669"
      }
    }
  });
  console.log("Events:", JSON.stringify(events, null, 2));

  const sessions = await prisma.callSession.findMany({
    where: {
      callerNumber: {
        contains: "6381221669"
      }
    }
  });
  console.log("Sessions:", JSON.stringify(sessions, null, 2));
}

main().catch(console.error).finally(() => prisma.$disconnect());
