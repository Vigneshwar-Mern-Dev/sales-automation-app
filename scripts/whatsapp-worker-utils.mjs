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
