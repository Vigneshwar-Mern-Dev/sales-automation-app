import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const result = await prisma.whatsAppLead.updateMany({
    where: { status: "QUEUED" },
    data: { message: null },
  });
  console.log(`Cleared default message on ${result.count} queued leads so they will pick the new variants.`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
