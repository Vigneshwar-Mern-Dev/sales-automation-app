import { NextRequest, NextResponse } from "next/server";
import { apiErrorResponse } from "@/app/lib/call-tracker-api-response";
import {
  authenticateCompanyPhone,
  updateCompanyPhoneHealth,
} from "@/app/lib/call-tracker";
import { consumeRateLimit, rateLimitKey } from "@/app/lib/rate-limit";
import { callTrackerHeartbeatSchema } from "@/app/lib/validators/call-tracker";
import { validateBody } from "@/app/lib/validators/validate";

function getBearerToken(request: NextRequest) {
  const authorization = request.headers.get("authorization");

  if (!authorization?.startsWith("Bearer ")) {
    return null;
  }

  return authorization.slice("Bearer ".length).trim();
}

export async function POST(request: NextRequest) {
  const validation = await validateBody(request, callTrackerHeartbeatSchema, {
    retryable: false,
    includeServerTime: true,
  });
  if (!validation.success) {
    return validation.response;
  }

  const body = validation.data;
  const token = getBearerToken(request);

  if (!token) {
    return apiErrorResponse({
      code: "AUTH_REQUIRED",
      error: "A bearer token is required.",
      status: 401,
      retryable: false,
    });
  }

  const companyPhone = await authenticateCompanyPhone(body.deviceId, token);

  if (!companyPhone) {
    return apiErrorResponse({
      code: "UNAUTHORIZED_DEVICE",
      error: "Unauthorized device.",
      status: 401,
      retryable: false,
    });
  }

  const limit = await consumeRateLimit({
    key: rateLimitKey("call-tracker-heartbeat", companyPhone.id),
    limit: 180,
    windowMs: 5 * 60 * 1000,
  });

  if (!limit.allowed) {
    return apiErrorResponse({
      code: "RATE_LIMITED",
      error: "Heartbeat rate limit exceeded.",
      status: 429,
      retryable: true,
      retryAfterSeconds: limit.retryAfterSeconds,
    });
  }

  try {
    await updateCompanyPhoneHealth(companyPhone.id, {
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
    });
  } catch (error) {
    console.error("Call tracker heartbeat failed:", error);
    return apiErrorResponse({
      code: "HEARTBEAT_FAILED",
      error: "Call tracker heartbeat failed.",
      status: 500,
      retryable: true,
    });
  }

  return NextResponse.json({
    ok: true,
    success: true,
    retryable: false,
    serverTime: new Date().toISOString(),
  }, { headers: { "Cache-Control": "no-store" } });
}