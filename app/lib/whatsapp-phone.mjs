const DEFAULT_COUNTRY_CODE = "91";
const DEFAULT_NATIONAL_NUMBER_LENGTH = 10;

function digitsOnly(value) {
  return String(value ?? "").replace(/\D/g, "");
}

function configuredCountryCode(options = {}) {
  const value = digitsOnly(
    options.defaultCountryCode ?? process.env.WHATSAPP_DEFAULT_COUNTRY_CODE ?? DEFAULT_COUNTRY_CODE,
  );
  return value || DEFAULT_COUNTRY_CODE;
}

function configuredNationalLength(options = {}) {
  const raw = Number(
    options.nationalNumberLength ??
      process.env.WHATSAPP_NATIONAL_NUMBER_LENGTH ??
      DEFAULT_NATIONAL_NUMBER_LENGTH,
  );
  return Number.isInteger(raw) && raw >= 6 && raw <= 14
    ? raw
    : DEFAULT_NATIONAL_NUMBER_LENGTH;
}

/**
 * Convert local or international input into a canonical E.164-like value.
 * The default policy is India (+91, 10-digit national numbers) and can be
 * changed with WHATSAPP_DEFAULT_COUNTRY_CODE and WHATSAPP_NATIONAL_NUMBER_LENGTH.
 */
export function normalizeWhatsAppE164(phone, options = {}) {
  const raw = String(phone ?? "").trim();
  let digits = digitsOnly(raw);
  const countryCode = configuredCountryCode(options);
  const nationalLength = configuredNationalLength(options);

  if (raw.startsWith("00") && digits.startsWith("00")) {
    digits = digits.slice(2);
  } else if (digits.length === nationalLength) {
    digits = countryCode + digits;
  } else if (digits.length === nationalLength + 1 && digits.startsWith("0")) {
    digits = countryCode + digits.slice(1);
  }

  if (!/^[1-9]\d{7,14}$/.test(digits)) {
    throw new Error(
      `Invalid phone number: ${raw || "empty"}. Expected a ${nationalLength}-digit local number or 8-15 international digits.`,
    );
  }

  return `+${digits}`;
}

export function normalizeWhatsAppDigits(phone, options = {}) {
  return normalizeWhatsAppE164(phone, options).slice(1);
}
