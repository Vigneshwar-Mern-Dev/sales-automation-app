import { NextResponse } from "next/server";
import type { z } from "zod";

type ValidationResponseOptions = {
  retryable?: boolean;
  includeServerTime?: boolean;
};

type ValidationFailure = {
  success: false;
  response: NextResponse;
};

type ValidationSuccess<TSchema extends z.ZodType> = {
  success: true;
  data: z.infer<TSchema>;
  raw: unknown;
};

export function formatZodError(error: z.ZodError) {
  const fields: Record<string, string> = {};

  for (const issue of error.issues) {
    const key = issue.path.length ? issue.path.join(".") : "_root";
    fields[key] ??= issue.message;
  }

  return fields;
}

export function validationErrorResponse(
  fields: Record<string, string>,
  options: ValidationResponseOptions = {},
) {
  return NextResponse.json(
    {
      ok: false,
      success: false,
      error: "Validation Failed",
      code: "VALIDATION_ERROR",
      fields,
      retryable: options.retryable,
      serverTime: options.includeServerTime ? new Date().toISOString() : undefined,
    },
    { status: 400, headers: { "Cache-Control": "no-store" } },
  );
}

export function validateValue<TSchema extends z.ZodType>(
  value: unknown,
  schema: TSchema,
  options?: ValidationResponseOptions,
): ValidationSuccess<TSchema> | ValidationFailure {
  const result = schema.safeParse(value);

  if (!result.success) {
    return {
      success: false,
      response: validationErrorResponse(formatZodError(result.error), options),
    };
  }

  return {
    success: true,
    data: result.data,
    raw: value,
  };
}

export async function validateBody<TSchema extends z.ZodType>(
  request: Request,
  schema: TSchema,
  options?: ValidationResponseOptions,
): Promise<ValidationSuccess<TSchema> | ValidationFailure> {
  const raw = await request.json().catch(() => undefined);

  return validateValue(raw, schema, options);
}

export function validateQuery<TSchema extends z.ZodType>(
  request: Request,
  schema: TSchema,
  options?: ValidationResponseOptions,
) {
  const url = new URL(request.url);

  return validateValue(Object.fromEntries(url.searchParams), schema, options);
}

export function validateParams<TSchema extends z.ZodType>(
  params: unknown,
  schema: TSchema,
  options?: ValidationResponseOptions,
) {
  return validateValue(params, schema, options);
}
