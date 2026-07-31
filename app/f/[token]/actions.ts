"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { db } from "@/app/lib/db";
import { WhatsAppLeadStatus } from "@/app/lib/prisma-enums";
import { syncCallLeadToSheetBackground } from "@/app/lib/call-lead-actions";
import { consumeRateLimit, rateLimitKey } from "@/app/lib/rate-limit";
import { getClientIpFromHeaders } from "@/app/lib/request-ip";

const GOOGLE_MAPS_URL_PATTERN = /^https:\/\/(www\.)?(google\.(com|co\.[a-z]{2}|[a-z]{2,3})\/maps|maps\.google\.(com|co\.[a-z]{2}|[a-z]{2,3})|goo\.gl\/maps|maps\.app\.goo\.gl)[\/\?#]./i;
const PROPERTY_TYPES = new Set(["OWN", "RENTAL"]);
const FORM_TOKEN_MIN_LENGTH = 16;
const FORM_TOKEN_MAX_LENGTH = 128;
const NAME_MAX_LENGTH = 120;
const CITY_MAX_LENGTH = 120;

function formLinkTtlMs() {
  const configuredDays = Number.parseInt(process.env.FORM_LINK_TTL_DAYS ?? "30", 10);
  const days = Number.isFinite(configuredDays) && configuredDays > 0
    ? Math.min(configuredDays, 365)
    : 30;

  return days * 24 * 60 * 60 * 1000;
}

function isValidGoogleMapsUrl(value: string): boolean {
  if (!value || value.length > 2048) return false;

  // Reject obvious injection attempts
  const lower = value.toLowerCase().trim();
  if (lower.startsWith("javascript:") || lower.includes("<script")) return false;

  try {
    const url = new URL(value);
    if (url.protocol !== "https:") return false;
    return GOOGLE_MAPS_URL_PATTERN.test(value);
  } catch {
    return false;
  }
}

function normalizePhone(value: string) {
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

  return digits.length >= 8 ? `+${digits}` : value;
}

function browserFromUserAgent(userAgent: string | null) {
  if (!userAgent) {
    return { browser: null, version: null };
  }

  const match =
    userAgent.match(/Edg\/([\d.]+)/) ||
    userAgent.match(/Chrome\/([\d.]+)/) ||
    userAgent.match(/Firefox\/([\d.]+)/) ||
    userAgent.match(/Version\/([\d.]+).*Safari/);

  if (!match) {
    return { browser: null, version: null };
  }

  const browser = match[0].includes("Edg/")
    ? "Edge"
    : match[0].includes("Chrome/")
      ? "Chrome"
      : match[0].includes("Firefox/")
        ? "Firefox"
        : "Safari";

  return { browser, version: match[1] ?? null };
}

async function requestMetadata() {
  const headerList = await headers();
  const ipAddress = getClientIpFromHeaders(headerList);
  const userAgent = headerList.get("user-agent")?.slice(0, 1024) ?? null;
  const browser = browserFromUserAgent(userAgent);

  return {
    ipAddress,
    userAgent,
    ...browser,
  };
}
async function publicFormRateLimit(
  token: string,
  scope: string,
  limit: number,
  windowMs: number,
) {
  const metadata = await requestMetadata();
  const rateLimit = await consumeRateLimit({
    key: rateLimitKey(scope, token, metadata.ipAddress),
    limit,
    windowMs,
  });

  return { metadata, rateLimit };
}
function isValidFormToken(token: string) {
  return token.length >= FORM_TOKEN_MIN_LENGTH && token.length <= FORM_TOKEN_MAX_LENGTH;
}

async function resolveFormContext(token: string) {
  const existingSubmission = await db.formSubmission.findUnique({
    where: { formToken: token },
    select: { deletedAt: true, isArchived: true, status: true },
  });

  if (existingSubmission?.deletedAt || existingSubmission?.isArchived) {
    return null;
  }
  const allowExpired = existingSubmission?.status === "FORM_SUBMITTED";
  const expiresAfter = new Date(Date.now() - formLinkTtlMs());

  const queueItem = await db.whatsAppQueueItem.findFirst({
    where: { formToken: token, deletedAt: null, isArchived: false },
    orderBy: [{ queuedAt: "desc" }, { createdAt: "desc" }],
    select: {
      id: true,
      whatsappLeadId: true,
      callLeadId: true,
      phone: true,
      status: true,
      queuedAt: true,
      openedAt: true,
      formStartedAt: true,
      formSubmittedAt: true,
      callLead: {
        select: { deletedAt: true, isArchived: true },
      },
      whatsappLead: {
        select: {
          id: true,
          phone: true,
          displayName: true,
          formSubmittedAt: true,
          deletedAt: true,
          isArchived: true,
        },
      },
    },
  });

  if (
    queueItem &&
    !queueItem.callLead?.deletedAt &&
    !queueItem.callLead?.isArchived &&
    !queueItem.whatsappLead.deletedAt &&
    !queueItem.whatsappLead.isArchived
  ) {
    if (!allowExpired && queueItem.queuedAt < expiresAfter) {
      return null;
    }

    return {
      queueItem,
      whatsappLead: queueItem.whatsappLead,
      phone: queueItem.phone,
      callLeadId: queueItem.callLeadId,
    };
  }

  const whatsappLead = await db.whatsAppLead.findFirst({
    where: { formToken: token, deletedAt: null, isArchived: false },
    select: {
      id: true,
      phone: true,
      displayName: true,
      formSubmittedAt: true,
      createdAt: true,
    },
  });

  if (!whatsappLead) {
    return null;
  }
  if (!allowExpired && whatsappLead.createdAt < expiresAfter) {
    return null;
  }

  const callLead = await db.callLead.findUnique({
    where: { phone: normalizePhone(whatsappLead.phone) },
    select: { id: true, deletedAt: true, isArchived: true },
  });

  if (callLead?.deletedAt || callLead?.isArchived) {
    return null;
  }

  return {
    queueItem: null,
    whatsappLead,
    phone: whatsappLead.phone,
    callLeadId: callLead?.id ?? null,
  };
}

async function findOrCreateCallLead(phone: string, displayName: string) {
  const normalizedPhone = normalizePhone(phone);
  const existing = await db.callLead.findUnique({
    where: { phone: normalizedPhone },
    select: { id: true, deletedAt: true, isArchived: true },
  });

  if (existing) {
    if (existing.deletedAt || existing.isArchived) {
      throw new Error("This form belongs to an archived call lead.");
    }

    return existing;
  }

  return db.callLead.create({
    data: {
      phone: normalizedPhone,
      displayName: displayName || `Caller ${normalizedPhone.slice(-4)}`,
    },
    select: { id: true },
  });
}

export async function markFormOpenedAction(token: string) {
  if (!isValidFormToken(token)) {
    return { ok: false };
  }

  const { metadata, rateLimit } = await publicFormRateLimit(
    token,
    "public-form-open",
    30,
    5 * 60 * 1000,
  );
  if (!rateLimit.allowed) {
    return { ok: false };
  }

  const context = await resolveFormContext(token);
  if (!context) {
    return { ok: false };
  }

  const existing = await db.formSubmission.findUnique({
    where: { formToken: token },
    select: { openedAt: true, submittedAt: true, status: true },
  });
  const now = new Date();
  await db.$transaction([
    db.formSubmission.upsert({
      where: { formToken: token },
      update: {
        openedAt: existing?.openedAt ?? now,
        status: existing?.status === "FORM_SUBMITTED" ? undefined : existing?.openedAt ? undefined : "OPENED",
        ipAddress: metadata.ipAddress,
        userAgent: metadata.userAgent,
        browser: metadata.browser,
        version: metadata.version,
      },
      create: {
        formToken: token,
        whatsappLeadId: context.whatsappLead.id,
        queueItemId: context.queueItem?.id ?? null,
        callLeadId: context.callLeadId,
        phone: context.phone,
        status: "OPENED",
        openedAt: now,
        ipAddress: metadata.ipAddress,
        userAgent: metadata.userAgent,
        browser: metadata.browser,
        version: metadata.version,
      },
    }),
    ...(context.queueItem
      ? [
          db.whatsAppQueueItem.update({
            where: { id: context.queueItem.id },
            data: {
              openedAt: context.queueItem.openedAt ?? now,
              status: existing?.status === "FORM_SUBMITTED" ? undefined : "OPENED",
            },
          }),
        ]
      : []),
    db.whatsAppLead.update({
      where: { id: context.whatsappLead.id },
      data: {
        formOpenedAt: now,
        status: existing?.status === "FORM_SUBMITTED" ? undefined : WhatsAppLeadStatus.OPENED,
      },
    }),
    ...(!existing?.openedAt && context.callLeadId
      ? [
          db.callActivity.create({
            data: {
              leadId: context.callLeadId,
              actionType: "WHATSAPP_OPENED",
              description: "Customer opened WhatsApp form",
              metadata: {
                whatsappLeadId: context.whatsappLead.id,
                queueItemId: context.queueItem?.id ?? null,
                formToken: token,
              },
            },
          }),
        ]
      : []),
  ]);

  return { ok: true };
}

export async function markFormStartedAction(token: string) {
  if (!isValidFormToken(token)) {
    return { ok: false };
  }

  const { metadata, rateLimit } = await publicFormRateLimit(
    token,
    "public-form-start",
    30,
    5 * 60 * 1000,
  );
  if (!rateLimit.allowed) {
    return { ok: false };
  }

  const context = await resolveFormContext(token);
  if (!context) {
    return { ok: false };
  }

  const existing = await db.formSubmission.findUnique({
    where: { formToken: token },
    select: { openedAt: true, startedAt: true, submittedAt: true, status: true },
  });
  const now = new Date();
  await db.$transaction([
    db.formSubmission.upsert({
      where: { formToken: token },
      update: {
        openedAt: existing?.openedAt ?? now,
        startedAt: existing?.startedAt ?? now,
        status: existing?.status === "FORM_SUBMITTED" ? undefined : existing?.startedAt ? undefined : "FORM_STARTED",
        ipAddress: metadata.ipAddress,
        userAgent: metadata.userAgent,
        browser: metadata.browser,
        version: metadata.version,
      },
      create: {
        formToken: token,
        whatsappLeadId: context.whatsappLead.id,
        queueItemId: context.queueItem?.id ?? null,
        callLeadId: context.callLeadId,
        phone: context.phone,
        status: "FORM_STARTED",
        openedAt: now,
        startedAt: now,
        ipAddress: metadata.ipAddress,
        userAgent: metadata.userAgent,
        browser: metadata.browser,
        version: metadata.version,
      },
    }),
    ...(context.queueItem
      ? [
          db.whatsAppQueueItem.update({
            where: { id: context.queueItem.id },
            data: {
              openedAt: context.queueItem.openedAt ?? now,
              formStartedAt: context.queueItem.formStartedAt ?? now,
              status: existing?.status === "FORM_SUBMITTED" ? undefined : "FORM_STARTED",
            },
          }),
        ]
      : []),
    db.whatsAppLead.update({
      where: { id: context.whatsappLead.id },
      data: {
        formOpenedAt: existing?.openedAt ?? now,
        formStartedAt: now,
        status: existing?.status === "FORM_SUBMITTED" ? undefined : WhatsAppLeadStatus.FORM_STARTED,
      },
    }),
    ...(!existing?.startedAt && context.callLeadId
      ? [
          db.callActivity.create({
            data: {
              leadId: context.callLeadId,
              actionType: "FORM_STARTED",
              description: "Customer started WhatsApp form",
              metadata: {
                whatsappLeadId: context.whatsappLead.id,
                queueItemId: context.queueItem?.id ?? null,
                formToken: token,
              },
            },
          }),
        ]
      : []),
  ]);

  return { ok: true };
}

export async function submitFormAction(token: string, formData: FormData) {
  if (!isValidFormToken(token)) {
    return { ok: false, error: "This form link is invalid or expired." };
  }

  const { metadata, rateLimit } = await publicFormRateLimit(
    token,
    "public-form-submit",
    5,
    15 * 60 * 1000,
  );
  if (!rateLimit.allowed) {
    return {
      ok: false,
      error: `Too many submission attempts. Try again in ${rateLimit.retryAfterSeconds} seconds.`,
    };
  }

  const name = formData.get("name")?.toString().trim();
  const city = formData.get("city")?.toString().trim();
  const propertyType = formData.get("propertyType")?.toString().trim();
  const mapsLocation = formData.get("mapsLocation")?.toString().trim();

  if (!name || !city || !propertyType || !mapsLocation) {
    return { ok: false, error: "Please fill in all required fields" };
  }
  if (name.length > NAME_MAX_LENGTH || city.length > CITY_MAX_LENGTH) {
    return { ok: false, error: "Name and city must each be 120 characters or fewer." };
  }

  if (!PROPERTY_TYPES.has(propertyType)) {
    return { ok: false, error: "Please select a valid property type." };
  }

  if (!isValidGoogleMapsUrl(mapsLocation)) {
    return {
      ok: false,
      error: "Please paste a valid Google Maps link (e.g., from the Google Maps app or website).",
    };
  }

  const context = await resolveFormContext(token);

  if (!context) {
    return { ok: false, error: "This form link is invalid or expired." };
  }

  const existingSubmission = await db.formSubmission.findUnique({
    where: { formToken: token },
    select: { status: true, submittedAt: true, callLeadId: true },
  });

  if (existingSubmission?.status === "FORM_SUBMITTED") {
    return { ok: true };
  }

  const now = new Date();
  const callLead =
    context.callLeadId || existingSubmission?.callLeadId
      ? { id: context.callLeadId || existingSubmission?.callLeadId || "" }
      : await findOrCreateCallLead(context.phone, name);
  const callLeadId = callLead.id;

  await db.$transaction([
    db.formSubmission.upsert({
      where: { formToken: token },
      update: {
        whatsappLeadId: context.whatsappLead.id,
        queueItemId: context.queueItem?.id ?? null,
        callLeadId,
        phone: context.phone,
        status: "FORM_SUBMITTED",
        openedAt: existingSubmission ? undefined : now,
        startedAt: now,
        submittedAt: now,
        submittedBy: "customer",
        ipAddress: metadata.ipAddress,
        userAgent: metadata.userAgent,
        browser: metadata.browser,
        version: metadata.version,
        name,
        city,
        propertyType,
        mapsLocation,
        rawPayload: { name, city, propertyType, mapsLocation },
      },
      create: {
        formToken: token,
        whatsappLeadId: context.whatsappLead.id,
        queueItemId: context.queueItem?.id ?? null,
        callLeadId,
        phone: context.phone,
        status: "FORM_SUBMITTED",
        openedAt: now,
        startedAt: now,
        submittedAt: now,
        submittedBy: "customer",
        ipAddress: metadata.ipAddress,
        userAgent: metadata.userAgent,
        browser: metadata.browser,
        version: metadata.version,
        name,
        city,
        propertyType,
        mapsLocation,
        rawPayload: { name, city, propertyType, mapsLocation },
      },
    }),
    ...(context.queueItem
      ? [
          db.whatsAppQueueItem.update({
            where: { id: context.queueItem.id },
            data: {
              status: "FORM_SUBMITTED",
              openedAt: context.queueItem.openedAt ?? now,
              formStartedAt: context.queueItem.formStartedAt ?? now,
              formSubmittedAt: now,
            },
          }),
        ]
      : []),
    db.whatsAppLead.update({
      where: { id: context.whatsappLead.id },
      data: {
        formName: name,
        formCity: city,
        formPropertyType: propertyType,
        formMapsLocation: mapsLocation,
        formOpenedAt: now,
        formStartedAt: now,
        formSubmittedAt: now,
        status: WhatsAppLeadStatus.FORM_SUBMITTED,
      },
    }),
    db.callLead.update({
      where: { id: callLeadId },
      data: {
        displayName: name,
        city,
        ownershipType: propertyType,
        address: mapsLocation,
        locationSent: true,
      },
    }),
    db.callActivity.create({
      data: {
        leadId: callLeadId,
        actionType: "FORM_SUBMITTED",
        description: `Customer submitted franchise form: Name: ${name}, City: ${city}, Property: ${propertyType}, Location: ${mapsLocation}`,
        metadata: {
          whatsappLeadId: context.whatsappLead.id,
          queueItemId: context.queueItem?.id ?? null,
          formToken: token,
          ipAddress: metadata.ipAddress,
          browser: metadata.browser,
          version: metadata.version,
        },
      },
    }),
  ]);

  try {
    await syncCallLeadToSheetBackground(callLeadId);
  } catch (err) {
    console.error("[submitFormAction] Failed to sync data to CallLead sheet:", err);
  }

  revalidatePath("/admin/calls");
  revalidatePath("/admin/calls/leads");
  revalidatePath("/admin/whatsapp/leads");

  return { ok: true };
}

