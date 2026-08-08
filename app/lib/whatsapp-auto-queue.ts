import "server-only";

import { db } from "./db";
import { queueWhatsAppMessage } from "./whatsapp-lifecycle";
import { pickWhatsAppAccountForCall } from "./whatsapp-account-picker";

const ANSWERED_TEMPLATE = `Hi {{name}}!

Thank you for your inquiry about the ATM Franchise. It was good speaking with you today.

Please fill out your details using this secure link so we can finalize the next steps:
{{formLink}}

Our team will review your details and contact you shortly.

Thank you,
ATM Franchise Team`;

const MISSED_TEMPLATE = `Hi {{name}}!

We are from ATM Franchise. Apologies for the delay in responding. We are currently receiving a high volume of inquiries.

Please fill out your details using this secure link:
{{formLink}}

Our team will contact you and provide complete information.

Thank you,
ATM Franchise Team`;

export async function autoQueueWhatsAppForCaller(
  callerPhone: string,
  displayName: string,
  callState: "ANSWERED" | "MISSED",
  callLeadId?: string,
  companyPhoneId?: string,
): Promise<void> {
  try {
    if (!companyPhoneId) {
      console.error(
        "[whatsapp-auto-queue] Cannot route " + callerPhone + ": company phone ID is missing.",
      );
      return;
    }

    const picked = await pickWhatsAppAccountForCall(companyPhoneId, callerPhone);

    if (!picked) {
      console.log(
        "[whatsapp-auto-queue] No enabled account for " + callerPhone +
          ". Map the company phone or enable auto-reply.",
      );
      return;
    }

    // Fetch account-level settings for cooldown check
    const account = await db.whatsAppAccount.findUnique({
      where: { id: picked.accountId },
      select: {
        id: true,
        autoReplyEnabled: true,
        contactCooldownDays: true,
      },
    });

    if (!account?.autoReplyEnabled) {
      return;
    }

    const existing = await db.whatsAppLead.findFirst({
      where: { phone: callerPhone, deletedAt: null },
      select: { id: true, status: true, lastSentAt: true, lastReplyAt: true },
    });

    if (existing?.status === "DO_NOT_CONTACT") {
      console.log(`[whatsapp-auto-queue] Skipping ${callerPhone}: DO_NOT_CONTACT.`);
      return;
    }

    if (existing?.status === "SENT" || existing?.status === "REPLIED") {
      const lastContactDate = existing.lastReplyAt ?? existing.lastSentAt;

      if (lastContactDate && account.contactCooldownDays > 0) {
        const cooldownMs = account.contactCooldownDays * 24 * 60 * 60 * 1000;
        const timeSinceContact = Date.now() - lastContactDate.getTime();

        if (timeSinceContact < cooldownMs) {
          const hoursLeft = Math.ceil((cooldownMs - timeSinceContact) / (60 * 60 * 1000));
          console.log(
            `[whatsapp-auto-queue] Skipping ${callerPhone}: cooldown active, ${hoursLeft}h remaining.`,
          );
          return;
        }
      }
    }

    const selectedMessage = callState === "ANSWERED" ? ANSWERED_TEMPLATE : MISSED_TEMPLATE;
    const result = await queueWhatsAppMessage({
      accountId: account.id,
      phone: callerPhone,
      displayName,
      message: selectedMessage,
      consentAt: new Date(),
      callLeadId,
      source: `auto_${callState.toLowerCase()}`,
      routingReason: picked.reason,
      routingWarning: picked.warning,
    });

    if (result.queued) {
      console.log(
        "[whatsapp-auto-queue] Queued WhatsApp for " + callerPhone +
          " (account=" + account.id + ", callLead=" + (callLeadId ?? "none") +
          ", queueItem=" + result.queueItemId + ", deferred=" + Boolean(picked.deferred) + ").",
      );
    } else {
      console.log(
        `[whatsapp-auto-queue] Skipped ${callerPhone}: ${result.reason} (callLead=${callLeadId ?? "none"}).`,
      );
    }
  } catch (error) {
    console.error("[whatsapp-auto-queue] Failed to queue WhatsApp message:", error);
  }
}
