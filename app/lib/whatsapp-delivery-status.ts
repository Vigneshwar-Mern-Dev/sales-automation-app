export type WhatsAppMessageDeliveryState = "SENT" | "NOT_SENT" | "QUEUED" | "SENDING";

export function getWhatsAppMessageDeliveryState(
  queueStatus: string | null | undefined,
  leadStatus: string | null | undefined,
  formWasOpenedOrSubmitted = false,
): WhatsAppMessageDeliveryState {
  // An opened/submitted form proves the customer obtained this form link even
  // if a later resend attempt failed.
  if (formWasOpenedOrSubmitted) return "SENT";

  const status = queueStatus || leadStatus || "NEW";
  if (["SENT", "REPLIED", "OPENED", "FORM_STARTED", "FORM_SUBMITTED"].includes(status)) {
    return "SENT";
  }
  if (status === "QUEUED") return "QUEUED";
  if (status === "SENDING") return "SENDING";
  return "NOT_SENT";
}
