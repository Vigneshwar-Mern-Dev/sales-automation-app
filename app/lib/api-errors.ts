import { NextResponse } from "next/server";
import { logger } from "./logger";

type ApiErrorCode =
  | "BAD_REQUEST"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "VALIDATION_ERROR"
  | "INTERNAL_ERROR";

type ApiErrorOptions = {
  code?: ApiErrorCode;
  details?: unknown;
  exposeDetails?: boolean;
};

type HandlerContext = {
  route: string;
  method?: string;
  userId?: string | null;
  ip?: string | null;
};

export class AppError extends Error {
  readonly statusCode: number;
  readonly code: ApiErrorCode;
  readonly details?: unknown;
  readonly exposeDetails: boolean;

  constructor(message: string, statusCode = 500, options: ApiErrorOptions = {}) {
    super(message);
    this.name = "AppError";
    this.statusCode = statusCode;
    this.code = options.code ?? (statusCode >= 500 ? "INTERNAL_ERROR" : "BAD_REQUEST");
    this.details = options.details;
    this.exposeDetails = options.exposeDetails ?? statusCode < 500;
  }
}

export function apiErrorResponse(error: unknown, context: HandlerContext) {
  const appError =
    error instanceof AppError
      ? error
      : new AppError("An unexpected error occurred.", 500, {
          code: "INTERNAL_ERROR",
          exposeDetails: false,
        });

  logger.error("API request failed", {
    route: context.route,
    method: context.method,
    userId: context.userId,
    ip: context.ip,
    statusCode: appError.statusCode,
    code: appError.code,
    error: error instanceof Error ? error.message : String(error),
    stack: process.env.NODE_ENV === "production" ? undefined : error instanceof Error ? error.stack : undefined,
  });

  return NextResponse.json(
    {
      ok: false,
      error: {
        code: appError.code,
        message: appError.exposeDetails ? appError.message : "Internal server error.",
        details: appError.exposeDetails ? appError.details : undefined,
      },
    },
    { status: appError.statusCode },
  );
}

export async function withApiErrorHandling<T>(
  context: HandlerContext,
  handler: () => Promise<NextResponse<T>>,
) {
  const startedAt = Date.now();

  logger.info("API request started", context);

  try {
    const response = await handler();
    logger.info("API request completed", {
      ...context,
      statusCode: response.status,
      durationMs: Date.now() - startedAt,
    });
    return response;
  } catch (error) {
    return apiErrorResponse(error, context);
  }
}
