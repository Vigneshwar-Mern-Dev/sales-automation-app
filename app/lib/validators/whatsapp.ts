import { z } from "zod";
import { WhatsAppConnectionStatus } from "@/app/lib/prisma-enums";
import {
  nonEmptyTrimmedString,
  nullableOptionalTrimmedString,
  normalizedPhoneString,
  optionalTrimmedString,
  optionalIsoDate,
} from "./common";

const whatsappConnectionStatusValues = Object.values(WhatsAppConnectionStatus) as [
  WhatsAppConnectionStatus,
  ...WhatsAppConnectionStatus[],
];

export const whatsappBridgePayloadSchema = z.object({
  accountId: optionalTrimmedString,
  status: z
    .preprocess(
      (value) => (typeof value === "string" ? value.trim().toUpperCase() : value),
      z.enum(whatsappConnectionStatusValues),
    )
    .optional(),
  qrCodeData: nullableOptionalTrimmedString,
  phoneNumber: nullableOptionalTrimmedString,
  lastError: nullableOptionalTrimmedString,
});

export type WhatsAppBridgePayload = z.infer<typeof whatsappBridgePayloadSchema>;

export const whatsappOutboxResultSchema = z.object({
  leadId: nonEmptyTrimmedString,
  ok: z.boolean().optional(),
  error: nullableOptionalTrimmedString,
  errorType: z.enum(["INVALID_NUMBER", "DELIVERY_FAILURE"]).nullable().optional(),
  providerMessageId: nullableOptionalTrimmedString,
});

export type WhatsAppOutboxResultPayload = z.infer<typeof whatsappOutboxResultSchema>;

export const whatsappInboxPayloadSchema = z.object({
  phone: normalizedPhoneString,
  message: optionalTrimmedString.default(""),
  receivedAt: optionalIsoDate,
});

export type WhatsAppInboxPayload = z.infer<typeof whatsappInboxPayloadSchema>;
