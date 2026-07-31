import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const newVariant = `Hi! We are from ATM Franchise. Apologies for the delay in responding. We are currently receiving a high volume of inquiries.\n\nPlease fill out your details quickly using this secure link:\n👉 {{formLink}}\nour team will contact you and provide complete information\nThank you!`;

async function main() {
  const result = await prisma.whatsAppAccount.updateMany({
    data: { messageVariants: newVariant },
  });
  console.log(`Updated message variants on ${result.count} accounts.`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
