import "server-only";

import { createHash, randomBytes, timingSafeEqual } from "crypto";
import type { CallDirection, CallEventType, Prisma } from "@prisma/client";
import { db } from "./db";
import { hasPrismaCode } from "./prisma-utils";
import { autoQueueWhatsAppForCaller } from "./whatsapp-auto-queue";

const openSessionStatuses = ["RINGING", "ANSWERED"] as const;


export type RegisterCompanyPhoneInput = {
  companyPhone: string;
  deviceId: string;
  label?: string;
};

export type CallTrackerEventInput = {
  eventId: string;
  callSessionLocalId?: string;
  deviceId: string;
  companyPhone: string;
  caller?: string;
  eventType: CallEventType;
  callDirection: CallDirection;
  occurredAt: Date;
  durationSeconds?: number;
  androidCallLogId?: string;
  simSlot?: number;
  simDisplayName?: string;
  simCarrierName?: string;
  simSubscriptionId?: string;
  localContactName?: string;
  retryCount?: number;
  appVersion?: string;
  androidVersion?: string;
  deviceModel?: string;
  batteryPercent?: number;
  isCharging?: boolean;
  chargingType?: string;
  networkType?: string;
  pendingSyncCount?: number;
  lastSyncAttemptAt?: Date;
  lastSuccessfulSyncAt?: Date;
  lastSyncError?: string | null;
  lastSyncErrorAt?: Date | null;
  syncRetryCount?: number;
  permissionStatus?: Prisma.InputJsonValue;
  rawPayload: Prisma.InputJsonValue;
};

export type CompanyPhoneHealthInput = Pick<
  CallTrackerEventInput,
  | "appVersion"
  | "androidVersion"
  | "deviceModel"
  | "batteryPercent"
  | "isCharging"
  | "chargingType"
  | "networkType"
  | "pendingSyncCount"
  | "lastSyncAttemptAt"
  | "lastSuccessfulSyncAt"
  | "lastSyncError"
  | "lastSyncErrorAt"
  | "syncRetryCount"
  | "permissionStatus"
>;

export function normalizeIndianPhoneNumber(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  let digits = value.replace(/\D/g, "");

  if (digits.length === 12 && digits.startsWith("91")) {
    return `+${digits}`;
  }

  if (digits.length === 11 && digits.startsWith("0")) {
    digits = digits.slice(1);
  }

  if (digits.length === 10) {
    return `+91${digits}`;
  }

  if (digits.length >= 8) {
    return `+${digits}`;
  }

  return null;
}

export function hashDeviceToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function isSameHash(value: string, expected: string) {
  const valueBuffer = Buffer.from(value);
  const expectedBuffer = Buffer.from(expected);

  return (
    valueBuffer.length === expectedBuffer.length &&
    timingSafeEqual(valueBuffer, expectedBuffer)
  );
}

export function validateRegistrationSecret(secret: unknown) {
  const expected = process.env.CALL_TRACKER_REGISTRATION_SECRET;

  if (!expected) {
    throw new Error("CALL_TRACKER_REGISTRATION_SECRET is not configured.");
  }

  if (typeof secret !== "string" || !secret.trim()) {
    return false;
  }

  return isSameHash(hashDeviceToken(secret.trim()), hashDeviceToken(expected));
}

export async function registerCompanyPhone(input: RegisterCompanyPhoneInput) {
  const phoneNumber = normalizeIndianPhoneNumber(input.companyPhone);
  const deviceId = input.deviceId.trim();

  if (!phoneNumber || !deviceId) {
    throw new Error("A valid companyPhone and deviceId are required.");
  }

  const deviceToken = randomBytes(32).toString("hex");
  const authTokenHash = hashDeviceToken(deviceToken);
  const label = input.label?.trim() || phoneNumber;

  const companyPhone = await db.$transaction(async (tx) => {
    const existingPhones = await tx.companyPhone.findMany({
      where: {
        OR: [{ deviceId }, { phoneNumber }],
      },
    });
    const uniqueMatches = new Map(existingPhones.map((phone) => [phone.id, phone]));

    if (uniqueMatches.size > 1) {
      throw new Error(
        "This phone number and device ID are already linked to different company phones.",
      );
    }

    const existingPhone = existingPhones[0];

    if (existingPhone) {
      return tx.companyPhone.update({
        where: { id: existingPhone.id },
        data: {
          phoneNumber,
          label,
          deviceId,
          authTokenHash,
          isActive: true,
          lastSeenAt: new Date(),
        },
      });
    }

    return tx.companyPhone.create({
      data: {
        phoneNumber,
        label,
        deviceId,
        authTokenHash,
        isActive: true,
        lastSeenAt: new Date(),
      },
    });
  });

  return {
    companyPhone,
    deviceToken,
  };
}

export async function authenticateCompanyPhone(deviceId: string, token: string) {
  const companyPhone = await db.companyPhone.findUnique({
    where: { deviceId },
  });

  if (!companyPhone?.isActive) {
    return null;
  }

  const incomingHash = hashDeviceToken(token);

  if (!isSameHash(incomingHash, companyPhone.authTokenHash)) {
    return null;
  }

  return companyPhone;
}

function eventActivityType(eventType: CallEventType) {
  if (eventType === "RINGING") {
    return "CALL_RINGING" as const;
  }

  if (eventType === "ANSWERED") {
    return "CALL_ANSWERED" as const;
  }

  if (eventType === "MISSED") {
    return "CALL_MISSED" as const;
  }

  return "CALL_COMPLETED" as const;
}

function sessionStatusForEvent(eventType: CallEventType, wasAnswered: boolean) {
  if (eventType === "RINGING") {
    return "RINGING" as const;
  }

  if (eventType === "ANSWERED") {
    return "ANSWERED" as const;
  }

  if (eventType === "MISSED") {
    return wasAnswered ? ("COMPLETED" as const) : ("MISSED" as const);
  }

  return wasAnswered ? ("COMPLETED" as const) : ("MISSED" as const);
}

function cleanText(value: string | undefined) {
  return value?.trim() || undefined;
}

function companyPhoneHealthData(input: CompanyPhoneHealthInput) {
  return {
    lastSeenAt: new Date(),
    appVersion: cleanText(input.appVersion),
    androidVersion: cleanText(input.androidVersion),
    deviceModel: cleanText(input.deviceModel),
    batteryPercent: input.batteryPercent,
    isCharging: input.isCharging,
    chargingType: cleanText(input.chargingType),
    networkType: cleanText(input.networkType),
    pendingSyncCount: input.pendingSyncCount,
    lastSyncAttemptAt: input.lastSyncAttemptAt,
    lastSuccessfulSyncAt: input.lastSuccessfulSyncAt,
    lastSyncError: input.lastSyncError === null ? null : cleanText(input.lastSyncError),
    lastSyncErrorAt: input.lastSyncErrorAt,
    syncRetryCount: input.syncRetryCount,
    permissionStatus: input.permissionStatus,
  };
}

export async function updateCompanyPhoneHealth(
  companyPhoneId: string,
  input: CompanyPhoneHealthInput,
) {
  return db.companyPhone.update({
    where: { id: companyPhoneId },
    data: companyPhoneHealthData(input),
  });
}

function findOpenSessionArgs(input: {
  companyPhoneId: string;
  callerNumber: string | null;
  localSessionId?: string;
}) {
  const openWhere = {
    companyPhoneId: input.companyPhoneId,
    status: { in: [...openSessionStatuses] },
    endedAt: null,
    deletedAt: null,
    isArchived: false,
  };

  if (input.localSessionId) {
    return {
      where: {
        ...openWhere,
        localSessionId: input.localSessionId,
      },
      include: { lead: true },
      orderBy: { firstRingAt: "desc" as const },
    };
  }

  if (input.callerNumber) {
    return {
      where: {
        ...openWhere,
        callerNumber: input.callerNumber,
      },
      include: { lead: true },
      orderBy: { firstRingAt: "desc" as const },
    };
  }

  return {
    where: openWhere,
    include: { lead: true },
    orderBy: { firstRingAt: "desc" as const },
  };
}

export async function ingestCallEvent(input: CallTrackerEventInput) {
  const callerNumber = normalizeIndianPhoneNumber(input.caller);
  const companyPhoneNumber = normalizeIndianPhoneNumber(input.companyPhone);
  const localSessionId = cleanText(input.callSessionLocalId);

  if (!companyPhoneNumber) {
    throw new Error("A valid companyPhone value is required.");
  }

  const companyPhone = await db.companyPhone.findFirst({
    where: {
      deviceId: input.deviceId,
      phoneNumber: companyPhoneNumber,
      isActive: true,
    },
  });

  if (!companyPhone) {
    throw new Error("Registered company phone was not found or is inactive.");
  }

  const duplicateEvent = await db.callEvent.findUnique({
    where: { eventId: input.eventId },
    select: { id: true, sessionId: true },
  });

  if (duplicateEvent) {
    await updateCompanyPhoneHealth(companyPhone.id, {
      ...input,
      lastSyncAttemptAt: input.lastSyncAttemptAt || new Date(),
      lastSuccessfulSyncAt: input.lastSuccessfulSyncAt || new Date(),
      lastSyncError: input.lastSyncError === undefined ? null : input.lastSyncError,
      lastSyncErrorAt: input.lastSyncErrorAt === undefined ? null : input.lastSyncErrorAt,
    });

    return {
      duplicate: true,
      eventId: duplicateEvent.id,
      sessionId: duplicateEvent.sessionId,
    };
  }

  const runTransaction = () => db.$transaction(async (tx) => {
    const sessionLockKey = `call-session:${companyPhone.id}:${localSessionId ?? callerNumber ?? "unknown"}`;
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${sessionLockKey}))`;

    const sessionByLocalId = localSessionId
      ? await tx.callSession.findFirst({
          where: {
            companyPhoneId: companyPhone.id,
            localSessionId,
            deletedAt: null,
            isArchived: false,
          },
          include: { lead: true },
          orderBy: { firstRingAt: "desc" },
        })
      : null;
    const latestOpenSession =
      sessionByLocalId ??
      (await tx.callSession.findFirst(
        findOpenSessionArgs({
          companyPhoneId: companyPhone.id,
          callerNumber,
          localSessionId,
        }),
      ));
    const recentRecoverableSession =
      !latestOpenSession &&
      callerNumber &&
      (input.eventType === "ANSWERED" || input.eventType === "ENDED")
        ? await tx.callSession.findFirst({
            where: {
              companyPhoneId: companyPhone.id,
              callerNumber,
              status: "MISSED",
              deletedAt: null,
              isArchived: false,
              firstRingAt: {
                gte: new Date(input.occurredAt.getTime() - 5 * 60 * 1000),
              },
            },
            include: { lead: true },
            orderBy: { firstRingAt: "desc" },
          })
        : null;

    if (!callerNumber && !latestOpenSession && !recentRecoverableSession) {
      await tx.companyPhone.update({
        where: { id: companyPhone.id },
        data: companyPhoneHealthData(input),
      });

      return {
        duplicate: false,
        ignored: true as const,
        reason: "caller_missing_without_open_session",
      };
    }

    const effectiveCallerNumber =
      callerNumber || latestOpenSession?.callerNumber || recentRecoverableSession?.callerNumber;

    if (!effectiveCallerNumber) {
      throw new Error("Caller number could not be resolved.");
    }

    const existingLead = await tx.callLead.findUnique({
      where: { phone: effectiveCallerNumber },
      select: { id: true },
    });

    const lead = await tx.callLead.upsert({
      where: { phone: effectiveCallerNumber },
      update: {
        lastCompanyPhone: companyPhone.phoneNumber,
        localContactName: cleanText(input.localContactName) || undefined,
      },
      create: {
        phone: effectiveCallerNumber,
        displayName:
          cleanText(input.localContactName) || `Caller ${effectiveCallerNumber.slice(-4)}`,
        localContactName: cleanText(input.localContactName),
        firstCompanyPhone: companyPhone.phoneNumber,
        lastCompanyPhone: companyPhone.phoneNumber,
      },
    });

    if (!existingLead) {
      await tx.callActivity.create({
        data: {
          leadId: lead.id,
          actionType: "CALL_CREATED",
          description: `Call lead created for incoming caller ${effectiveCallerNumber}`,
          metadata: {
            companyPhone: companyPhone.phoneNumber,
            caller: effectiveCallerNumber,
            localContactName: cleanText(input.localContactName),
          },
        },
      });
    }

    const openSession =
      latestOpenSession?.callerNumber === effectiveCallerNumber
        ? latestOpenSession
        : recentRecoverableSession?.callerNumber === effectiveCallerNumber
          ? recentRecoverableSession
          : null;

    const existingAnsweredAt = openSession?.answeredAt ?? null;
    const durationSecondsFromLog =
      input.durationSeconds !== undefined && input.durationSeconds >= 0
        ? Math.round(input.durationSeconds)
        : null;
    const inferredAnsweredAt =
      input.eventType === "ENDED" &&
      !existingAnsweredAt &&
      durationSecondsFromLog &&
      durationSecondsFromLog > 0
        ? new Date(input.occurredAt.getTime() - durationSecondsFromLog * 1000)
        : null;
    const answeredAt =
      input.eventType === "ANSWERED" && !existingAnsweredAt
        ? input.occurredAt
        : existingAnsweredAt || inferredAnsweredAt;
    const endedAt =
      input.eventType === "ENDED" || input.eventType === "MISSED"
          ? input.occurredAt
          : openSession?.endedAt ?? null;
    const durationSeconds =
      durationSecondsFromLog ??
      (endedAt && answeredAt
        ? Math.max(0, Math.round((endedAt.getTime() - answeredAt.getTime()) / 1000))
        : endedAt && openSession && input.eventType === "ENDED"
          ? Math.max(0, Math.round((endedAt.getTime() - openSession.firstRingAt.getTime()) / 1000))
          : null);
    const eventStatus = sessionStatusForEvent(
      input.eventType,
      Boolean(answeredAt || (durationSeconds && durationSeconds > 0)),
    );
    const status =
      openSession?.endedAt && (input.eventType === "RINGING" || input.eventType === "ANSWERED")
        ? answeredAt
          ? ("COMPLETED" as const)
          : openSession.status
        : eventStatus;

    const session = openSession
      ? await tx.callSession.update({
          where: { id: openSession.id },
          data: {
            localSessionId: localSessionId || openSession.localSessionId,
            leadId: lead.id,
            callDirection: input.callDirection,
            answeredAt,
            endedAt,
            durationSeconds,
            status,
            androidCallLogId: cleanText(input.androidCallLogId) || openSession.androidCallLogId,
            simSlot: input.simSlot ?? openSession.simSlot,
            simDisplayName: cleanText(input.simDisplayName) || openSession.simDisplayName,
            simCarrierName: cleanText(input.simCarrierName) || openSession.simCarrierName,
            simSubscriptionId:
              cleanText(input.simSubscriptionId) || openSession.simSubscriptionId,
            localContactName: cleanText(input.localContactName) || openSession.localContactName,
          },
        })
      : await tx.callSession.create({
          data: {
            localSessionId,
            companyPhoneId: companyPhone.id,
            callerNumber: effectiveCallerNumber,
            leadId: lead.id,
            callDirection: input.callDirection,
            firstRingAt: input.occurredAt,
            answeredAt,
            endedAt,
            durationSeconds,
            status,
            androidCallLogId: cleanText(input.androidCallLogId),
            simSlot: input.simSlot,
            simDisplayName: cleanText(input.simDisplayName),
            simCarrierName: cleanText(input.simCarrierName),
            simSubscriptionId: cleanText(input.simSubscriptionId),
            localContactName: cleanText(input.localContactName),
          },
        });

    const event = await tx.callEvent.create({
      data: {
        eventId: input.eventId,
        localSessionId,
        companyPhoneId: companyPhone.id,
        sessionId: session.id,
        callerNumber: effectiveCallerNumber,
        eventType: input.eventType,
        callDirection: input.callDirection,
        occurredAt: input.occurredAt,
        durationSeconds: durationSecondsFromLog,
        retryCount: input.retryCount,
        simSlot: input.simSlot,
        simDisplayName: cleanText(input.simDisplayName),
        simCarrierName: cleanText(input.simCarrierName),
        simSubscriptionId: cleanText(input.simSubscriptionId),
        localContactName: cleanText(input.localContactName),
        rawPayload: input.rawPayload,
      },
    });

    await tx.callActivity.create({
      data: {
        leadId: lead.id,
        sessionId: session.id,
        actionType: eventActivityType(input.eventType),
        description: `Call event ${input.eventType} from ${effectiveCallerNumber} to ${companyPhone.phoneNumber}`,
        metadata: {
          eventId: input.eventId,
          companyPhone: companyPhone.phoneNumber,
          caller: effectiveCallerNumber,
          localSessionId,
          durationSeconds,
          retryCount: input.retryCount,
          simSlot: input.simSlot,
          simDisplayName: cleanText(input.simDisplayName),
          simCarrierName: cleanText(input.simCarrierName),
          simSubscriptionId: cleanText(input.simSubscriptionId),
          localContactName: cleanText(input.localContactName),
        },
      },
    });

    await tx.companyPhone.update({
      where: { id: companyPhone.id },
      data: companyPhoneHealthData({
        ...input,
        lastSyncAttemptAt: input.lastSyncAttemptAt || new Date(),
        lastSuccessfulSyncAt: input.lastSuccessfulSyncAt || new Date(),
        lastSyncError: input.lastSyncError === undefined ? null : input.lastSyncError,
        lastSyncErrorAt: input.lastSyncErrorAt === undefined ? null : input.lastSyncErrorAt,
      }),
    });

    return {
      duplicate: false as const,
      ignored: false as const,
      eventId: event.id,
      sessionId: session.id,
      leadId: lead.id,
      callerPhone: effectiveCallerNumber,
      callerDisplayName:
        cleanText(input.localContactName) || `Caller ${effectiveCallerNumber.slice(-4)}`,
      status: session.status,
    };
  });

  let txResult: Awaited<ReturnType<typeof runTransaction>>;

  try {
    txResult = await runTransaction();
  } catch (error) {
    if (hasPrismaCode(error, "P2002")) {
      const concurrentDuplicate = await db.callEvent.findUnique({
        where: { eventId: input.eventId },
        select: { id: true, sessionId: true },
      });

      if (concurrentDuplicate) {
        await updateCompanyPhoneHealth(companyPhone.id, {
          ...input,
          lastSyncAttemptAt: input.lastSyncAttemptAt || new Date(),
          lastSuccessfulSyncAt: input.lastSuccessfulSyncAt || new Date(),
          lastSyncError: input.lastSyncError === undefined ? null : input.lastSyncError,
          lastSyncErrorAt: input.lastSyncErrorAt === undefined ? null : input.lastSyncErrorAt,
        });

        return {
          duplicate: true as const,
          eventId: concurrentDuplicate.id,
          sessionId: concurrentDuplicate.sessionId,
        };
      }
    }

    throw error;
  }

  // Auto-queue a WhatsApp reply when the incoming call finishes (either ENDED or MISSED).
  // Runs AFTER the transaction so a WhatsApp failure never rolls back call data.
  // autoQueueWhatsAppForCaller contains safety checks to prevent duplicate queueing/spamming.
  if (
    !txResult.duplicate &&
    !txResult.ignored &&
    input.callDirection === "INCOMING" &&
    txResult.callerPhone &&
    (input.eventType === "ENDED" || input.eventType === "MISSED")
  ) {
    try {
      const callState = txResult.status === "COMPLETED" ? "ANSWERED" : "MISSED";
      console.log(
        `[call-tracker] Auto-queuing WhatsApp for ${txResult.callerPhone} (${callState}) — triggered by company phone ${companyPhoneNumber}`,
      );
      await autoQueueWhatsAppForCaller(
        txResult.callerPhone,
        txResult.callerDisplayName,
        callState,
        txResult.leadId,
      );
    } catch (err) {
      console.error("[call-tracker] WhatsApp auto-queue error:", err);
    }
  }

  return txResult;
}
