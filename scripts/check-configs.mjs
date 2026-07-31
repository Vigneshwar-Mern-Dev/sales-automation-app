import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("=== Lead Integrations ===");
  const integrations = await prisma.leadIntegration.findMany();
  console.log(JSON.stringify(integrations, null, 2));

  console.log("=== WhatsApp Accounts ===");
  const wa = await prisma.whatsAppAccount.findMany();
  console.log(JSON.stringify(wa, null, 2));
}

main().catch(console.error).finally(() => prisma.$disconnect());
