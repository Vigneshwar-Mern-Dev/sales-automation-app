import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { CallDirection } from "@/app/lib/prisma-enums";
import {
  nonEmptyTrimmedString,
  optionalBoolean,
  optionalFiniteNumber,
  optionalIsoDate,
  optionalTrimmedString,
  requiredIsoDate,
} from "./common";

const callEventValues = ["RINGING", "ANSWERED", "ENDED", "MISSED", "OUTGOING"] as const;
const callDirectionValues = Object.values(CallDirection) as [CallDirection, ...CallDirection[]];

const permissionStatusSchema = z
  .record(z.string(), z.unknown())
  .optional()
  .transform((value) => value as Prisma.InputJsonValue | undefined);

export const callTrackerRegistrationSchema = z.object({
  registrationSecret: z.unknown().optional(),
  companyPhone: nonEmptyTrimmedString,
  deviceId: nonEmptyTrimmedString,
  label: optionalTrimmedString,
});

export type CallTrackerRegistrationInput = z.infer<typeof callTrackerRegistrationSchema>;

export const callTrackerHealthSchema = z.object({
  appVersion: optionalTrimmedString,
  androidVersion: optionalTrimmedString,
  deviceModel: optionalTrimmedString,
  batteryPercent: optionalFiniteNumber,
  isCharging: optionalBoolean,
  chargingType: optionalTrimmedString,
  networkType: optionalTrimmedString,
  pendingSyncCount: optionalFiniteNumber,
  lastSyncAttemptAt: optionalIsoDate,
  lastSuccessfulSyncAt: optionalIsoDate,
  lastSyncError: z
    .preprocess(
      (value) => (value === null ? null : typeof value === "string" && value.trim() ? value : undefined),
      z.string().trim().nullable().optional(),
    ),
  lastSyncErrorAt: optionalIsoDate,
  syncRetryCount: optionalFiniteNumber,
  permissionStatus: permissionStatusSchema,
});

export type CallTrackerHealthInput = z.infer<typeof callTrackerHealthSchema>;

export const callTrackerHeartbeatSchema = callTrackerHealthSchema.extend({
  deviceId: nonEmptyTrimmedString,
});

export type CallTrackerHeartbeatInput = z.infer<typeof callTrackerHeartbeatSchema>;

export const callTrackerEventSchema = callTrackerHealthSchema
  .extend({
    eventId: nonEmptyTrimmedString,
    deviceId: nonEmptyTrimmedString,
    companyPhone: nonEmptyTrimmedString,
    caller: optionalTrimmedString,
    eventType: z.preprocess(
      (value) => (typeof value === "string" ? value.trim().toUpperCase() : value),
      z.enum(callEventValues),
    ),
    callDirection: z
      .preprocess(
        (value) => (typeof value === "string" ? value.trim().toUpperCase() : value),
        z.enum(callDirectionValues),
      )
      .optional(),
    occurredAt: requiredIsoDate,
    durationSeconds: optionalFiniteNumber,
    callSessionLocalId: optionalTrimmedString,
    androidCallLogId: optionalTrimmedString,
    simSlot: optionalFiniteNumber,
    simDisplayName: optionalTrimmedString,
    simCarrierName: optionalTrimmedString,
    simSubscriptionId: optionalTrimmedString,
    localContactName: optionalTrimmedString,
    retryCount: optionalFiniteNumber,
  })
  .transform((value) => {
    const normalizedEventType = value.eventType === "OUTGOING" ? "ANSWERED" : value.eventType;
    const callDirection =
      value.eventType === "OUTGOING" ? "OUTGOING" : value.callDirection ?? "INCOMING";

    return {
      ...value,
      eventType: normalizedEventType,
      callDirection,
    };
  });

export type CallTrackerEventInput = z.infer<typeof callTrackerEventSchema>;
