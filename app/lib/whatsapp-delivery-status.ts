export type WhatsAppMessageDeliveryState = "SENT" | "NOT_SENT" | "QUEUED" | "SENDING";

export const COMPLETED_WHATSAPP_QUEUE_STATUSES = [
  "SENT",
  "OPENED",
  "FORM_STARTED",
  "FORM_SUBMITTED",
] as const;

const COMPLETED_STATUS_SET = new Set<string>(COMPLETED_WHATSAPP_QUEUE_STATUSES);

export function hasCompletedWhatsAppDelivery(statuses: readonly string[]) {
  return statuses.some((status) => COMPLETED_STATUS_SET.has(status));
}

export function getWhatsAppMessageDeliveryState(
  queueStatus: string | readonly string[] | null | undefined,
  leadStatus: string | null | undefined,
  formWasOpenedOrSubmitted = false,
): WhatsAppMessageDeliveryState {
  // An opened/submitted form proves the customer obtained this form link even
  // if a later resend attempt failed.
  if (formWasOpenedOrSubmitted) return "SENT";

  const queueStatuses = Array.isArray(queueStatus)
    ? queueStatus
    : queueStatus
      ? [queueStatus]
      : [];

  // Delivery is cumulative. A later failed retry cannot erase an earlier
  // successful send for the same customer.
  if (hasCompletedWhatsAppDelivery(queueStatuses)) return "SENT";

  const status = queueStatuses[0] || leadStatus || "NEW";
  if (["SENT", "REPLIED", "OPENED", "FORM_STARTED", "FORM_SUBMITTED"].includes(status)) {
    return "SENT";
  }
  if (status === "QUEUED") return "QUEUED";
  if (status === "SENDING") return "SENDING";
  return "NOT_SENT";
}
