import { db } from "./db";
import type { Prisma } from "@prisma/client";
import { randomBytes } from "crypto";

export function generateRandomCode(length = 24): string {
  if (!Number.isInteger(length) || length < 16 || length > 128) {
    throw new RangeError("Token length must be an integer between 16 and 128.");
  }

  const byteLength = Math.ceil((length * 3) / 4);
  return randomBytes(byteLength).toString("base64url").slice(0, length);
}

type TokenDb = typeof db | Prisma.TransactionClient;

export async function generateUniqueFormToken(client: TokenDb = db): Promise<string> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const token = generateRandomCode();
    const [existingLead, existingQueueItem, existingSubmission] = await Promise.all([
      client.whatsAppLead.findUnique({
        where: { formToken: token },
        select: { id: true },
      }),
      client.whatsAppQueueItem.findFirst({
        where: { formToken: token },
        select: { id: true },
      }),
      client.formSubmission.findUnique({
        where: { formToken: token },
        select: { id: true },
      }),
    ]);

    if (!existingLead && !existingQueueItem && !existingSubmission) {
      return token;
    }
  }
  throw new Error("Unable to generate a unique form token.");
}

