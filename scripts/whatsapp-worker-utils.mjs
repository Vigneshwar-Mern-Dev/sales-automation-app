import { normalizeWhatsAppDigits } from "../app/lib/whatsapp-phone.mjs";

export function normalizeWhatsAppPhone(phone) {
  return normalizeWhatsAppDigits(phone);
}

export function toWhatsAppId(phone) {
  return `${normalizeWhatsAppPhone(phone)}@c.us`;
}

export function phoneFromWhatsAppId(chatId) {
  const serialized = String(chatId || "");
  if (!serialized.endsWith("@c.us")) return null;

  const digits = serialized.slice(0, -"@c.us".length);
  return /^[1-9]\d{7,14}$/.test(digits) ? `+${digits}` : null;
}

export function getProviderMessageId(sentMessage) {
  const providerMessageId = sentMessage?.id?._serialized;
  return typeof providerMessageId === "string" && providerMessageId.length > 0
    ? providerMessageId
    : null;
}

export function pickMappedWhatsAppId(mappings, phone) {
  const expectedPhone = normalizeWhatsAppPhone(phone);
  for (const mapping of Array.isArray(mappings) ? mappings : []) {
    const mappedPhone = phoneFromWhatsAppId(mapping?.pn);
    if (!mappedPhone || normalizeWhatsAppPhone(mappedPhone) !== expectedPhone) continue;

    const lid = typeof mapping?.lid === "string" ? mapping.lid : null;
    if (lid?.endsWith("@lid")) return lid;

    const pn = typeof mapping?.pn === "string" ? mapping.pn : null;
    if (pn?.endsWith("@c.us")) return pn;
  }
  return null;
}

export function findRecentOutgoingMessage(messages, body, notBeforeMs) {
  const minimumTimestamp = Math.floor((notBeforeMs - 5000) / 1000);
  return [...(Array.isArray(messages) ? messages : [])]
    .reverse()
    .find((message) =>
      message?.fromMe === true &&
      message?.body === body &&
      Number(message?.timestamp || 0) >= minimumTimestamp,
    ) ?? null;
}
