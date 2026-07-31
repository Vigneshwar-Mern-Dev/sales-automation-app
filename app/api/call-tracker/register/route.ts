import { NextRequest, NextResponse } from "next/server";
import { apiErrorResponse } from "@/app/lib/call-tracker-api-response";
import {
  registerCompanyPhone,
  validateRegistrationSecret,
} from "@/app/lib/call-tracker";
import { consumeRateLimit, rateLimitKey } from "@/app/lib/rate-limit";
import { getClientIpFromHeaders } from "@/app/lib/request-ip";
import { callTrackerRegistrationSchema } from "@/app/lib/validators/call-tracker";
import { validateValue } from "@/app/lib/validators/validate";

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

export async function POST(request: NextRequest) {
  try {
    const clientIp = getClientIpFromHeaders(request.headers);
    const ipLimit = await consumeRateLimit({
      key: rateLimitKey("call-tracker-register-ip", clientIp),
      limit: 10,
      windowMs: 60 * 60 * 1000,
      blockMs: 60 * 60 * 1000,
    });

    if (!ipLimit.allowed) {
      return apiErrorResponse({
        code: "RATE_LIMITED",
        error: "Too many registration attempts. Try again later.",
        status: 429,
        retryable: true,
        retryAfterSeconds: ipLimit.retryAfterSeconds,
      });
    }

    const rawBody = await request.json().catch(() => ({}));
    const registrationSecret =
      rawBody && typeof rawBody === "object" && "registrationSecret" in rawBody
        ? rawBody.registrationSecret
        : undefined;
    let isAuthorized = false;

    try {
      isAuthorized = validateRegistrationSecret(registrationSecret);
    } catch (error) {
      console.error("Call tracker registration is not configured:", error);
      return apiErrorResponse({
        code: "REGISTRATION_SECRET_NOT_CONFIGURED",
        error: "Call tracker registration is not configured on the server.",
        status: 500,
        retryable: false,
      });
    }

    if (!isAuthorized) {
      return apiErrorResponse({
        code: "INVALID_REGISTRATION_SECRET",
        error: "Unauthorized registration secret.",
        status: 401,
        retryable: false,
      });
    }

    const validation = validateValue(rawBody, callTrackerRegistrationSchema, {
      retryable: false,
      includeServerTime: true,
    });
    if (!validation.success) {
      return validation.response;
    }

    const body = validation.data;
    const deviceLimit = await consumeRateLimit({
      key: rateLimitKey("call-tracker-register-device", body.deviceId),
      limit: 5,
      windowMs: 60 * 60 * 1000,
      blockMs: 60 * 60 * 1000,
    });

    if (!deviceLimit.allowed) {
      return apiErrorResponse({
        code: "RATE_LIMITED",
        error: "This device has been registered too many times. Try again later.",
        status: 429,
        retryable: true,
        retryAfterSeconds: deviceLimit.retryAfterSeconds,
      });
    }

    const result = await registerCompanyPhone({
      companyPhone: body.companyPhone,
      deviceId: body.deviceId,
      label: body.label,
    });

    return NextResponse.json({
      ok: true,
      success: true,
      retryable: false,
      serverTime: new Date().toISOString(),
      companyPhone: {
        id: result.companyPhone.id,
        phoneNumber: result.companyPhone.phoneNumber,
        label: result.companyPhone.label,
        deviceId: result.companyPhone.deviceId,
      },
      deviceToken: result.deviceToken,
      warning: "Store deviceToken on the Android device. It cannot be recovered later.",
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Call tracker registration failed:", error);
    const message = getErrorMessage(error, "Call tracker registration failed.");
    const isConflict = message.includes("already linked to different company phones");

    return apiErrorResponse({
      code: isConflict ? "DEVICE_PHONE_CONFLICT" : "REGISTRATION_FAILED",
      error: message,
      status: isConflict ? 409 : 500,
      retryable: !isConflict,
    });
  }
}