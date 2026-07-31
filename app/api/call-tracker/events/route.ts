import type { CallDirection, CallEventType, Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { apiErrorResponse } from "@/app/lib/call-tracker-api-response";
import {
  authenticateCompanyPhone,
  ingestCallEvent,
} from "@/app/lib/call-tracker";
import { consumeRateLimit, rateLimitKey } from "@/app/lib/rate-limit";
import { callTrackerEventSchema } from "@/app/lib/validators/call-tracker";
import { validateBody } from "@/app/lib/validators/validate";

function getBearerToken(request: NextRequest) {
  const authorization = request.headers.get("authorization");

  if (!authorization?.startsWith("Bearer ")) {
    return null;
  }

  return authorization.slice("Bearer ".length).trim();
}

export async function POST(request: NextRequest) {
  try {
    const token = getBearerToken(request);

    if (!token) {
      return apiErrorResponse({
        code: "AUTH_REQUIRED",
        error: "A bearer token is required.",
        status: 401,
        retryable: false,
      });
    }

    const validation = await validateBody(request, callTrackerEventSchema, {
      retryable: false,
      includeServerTime: true,
    });
    if (!validation.success) {
      return validation.response;
    }

    const body = validation.data;
    const authenticatedPhone = await authenticateCompanyPhone(body.deviceId, token);

    if (!authenticatedPhone) {
      return apiErrorResponse({
        code: "UNAUTHORIZED_DEVICE",
        error: "Unauthorized device.",
        status: 401,
        retryable: false,
      });
    }

    const limit = await consumeRateLimit({
      key: rateLimitKey("call-tracker-events", authenticatedPhone.id),
      limit: 300,
      windowMs: 5 * 60 * 1000,
    });

    if (!limit.allowed) {
      return apiErrorResponse({
        code: "RATE_LIMITED",
        error: "Call-event rate limit exceeded.",
        status: 429,
        retryable: true,
        retryAfterSeconds: limit.retryAfterSeconds,
      });
    }

    const result = await ingestCallEvent({
      eventId: body.eventId,
      callSessionLocalId: body.callSessionLocalId,
      deviceId: body.deviceId,
      companyPhone: body.companyPhone,
      caller: body.caller,
      eventType: body.eventType as CallEventType,
      callDirection: body.callDirection as CallDirection,
      occurredAt: body.occurredAt,
      durationSeconds: body.durationSeconds,
      androidCallLogId: body.androidCallLogId,
      simSlot: body.simSlot,
      simDisplayName: body.simDisplayName,
      simCarrierName: body.simCarrierName,
      simSubscriptionId: body.simSubscriptionId,
      localContactName: body.localContactName,
      retryCount: body.retryCount,
      appVersion: body.appVersion,
      androidVersion: body.androidVersion,
      deviceModel: body.deviceModel,
      batteryPercent: body.batteryPercent,
      isCharging: body.isCharging,
      chargingType: body.chargingType,
      networkType: body.networkType,
      pendingSyncCount: body.pendingSyncCount,
      lastSyncAttemptAt: body.lastSyncAttemptAt,
      lastSuccessfulSyncAt: body.lastSuccessfulSyncAt,
      lastSyncError: body.lastSyncError,
      lastSyncErrorAt: body.lastSyncErrorAt,
      syncRetryCount: body.syncRetryCount,
      permissionStatus: body.permissionStatus,
      rawPayload: validation.raw as Prisma.InputJsonValue,
    });

    return NextResponse.json({
      ok: true,
      success: true,
      retryable: false,
      serverTime: new Date().toISOString(),
      ...result,
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Call tracker event ingestion failed:", error);
    const message = error instanceof Error ? error.message : "";
    const invalidCompanyPhone =
      message.includes("valid companyPhone") || message.includes("Registered company phone");

    return apiErrorResponse({
      code: invalidCompanyPhone ? "COMPANY_PHONE_MISMATCH" : "EVENT_INGESTION_FAILED",
      error: invalidCompanyPhone
        ? "The company phone does not match this registered device."
        : "Call tracker event ingestion failed.",
      status: invalidCompanyPhone ? 400 : 500,
      retryable: !invalidCompanyPhone,
    });
  }
}