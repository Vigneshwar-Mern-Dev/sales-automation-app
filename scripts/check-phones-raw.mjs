import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const phones = await prisma.companyPhone.findMany();
  console.log(JSON.stringify(phones, null, 2));
}

main().catch(console.error).finally(() => prisma.$disconnect());
