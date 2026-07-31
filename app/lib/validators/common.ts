import { z } from "zod";

export const nonEmptyTrimmedString = z.string().trim().min(1, "Required.");

export const optionalTrimmedString = z.preprocess(
  (value) => (typeof value === "string" && value.trim() ? value : undefined),
  z.string().trim().optional(),
);

export const nullableOptionalTrimmedString = z.preprocess(
  (value) => {
    if (value === null) return null;
    if (typeof value === "string" && value.trim()) return value;
    return undefined;
  },
  z.string().trim().nullable().optional(),
);

export const optionalFiniteNumber = z.preprocess(
  (value) => {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim()) {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : undefined;
    }
    return undefined;
  },
  z.number().finite().optional(),
);

export const optionalBoolean = z.preprocess(
  (value) => {
    if (typeof value === "boolean") return value;
    if (typeof value === "string") {
      const normalized = value.trim().toLowerCase();
      if (normalized === "true") return true;
      if (normalized === "false") return false;
    }
    return undefined;
  },
  z.boolean().optional(),
);

export const requiredIsoDate = z
  .string()
  .trim()
  .min(1, "Required.")
  .refine((value) => !Number.isNaN(new Date(value).getTime()), "Invalid date.")
  .transform((value) => new Date(value));

export const optionalIsoDate = z.preprocess(
  (value) => {
    if (typeof value !== "string" || !value.trim()) return undefined;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : date;
  },
  z.date().optional(),
);

export function normalizePhoneNumber(value: string) {
  const digits = value.replace(/\D/g, "");

  if (digits.length === 10) {
    return `+91${digits}`;
  }

  if (digits.length === 12 && digits.startsWith("91")) {
    return `+${digits}`;
  }

  return `+${digits}`;
}

export const normalizedPhoneString = nonEmptyTrimmedString.transform(normalizePhoneNumber);
