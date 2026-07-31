import "server-only";

import { NextResponse } from "next/server";

type ApiErrorOptions = {
  code: string;
  error: string;
  status: number;
  retryable: boolean;
  retryAfterSeconds?: number;
};

export function apiErrorResponse(options: ApiErrorOptions) {
  const headers = new Headers({ "Cache-Control": "no-store" });

  if (options.retryAfterSeconds) {
    headers.set("Retry-After", String(options.retryAfterSeconds));
  }

  return NextResponse.json(
    {
      ok: false,
      success: false,
      code: options.code,
      error: options.error,
      retryable: options.retryable,
      retryAfterSeconds: options.retryAfterSeconds,
      serverTime: new Date().toISOString(),
    },
    { status: options.status, headers },
  );
}