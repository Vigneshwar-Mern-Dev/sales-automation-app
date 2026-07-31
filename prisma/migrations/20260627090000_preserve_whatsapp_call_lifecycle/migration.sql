-- Preserve WhatsApp, form, and call lifecycle history.
-- This migration deliberately adds archive/status fields and non-cascading relations
-- instead of deleting existing business records.

ALTER TYPE "CallActivityType" ADD VALUE IF NOT EXISTS 'WHATSAPP_QUEUED';
ALTER TYPE "CallActivityType" ADD VALUE IF NOT EXISTS 'WHATSAPP_SENDING';
ALTER TYPE "CallActivityType" ADD VALUE IF NOT EXISTS 'WHATSAPP_SENT';
ALTER TYPE "CallActivityType" ADD VALUE IF NOT EXISTS 'WHATSAPP_OPENED';
ALTER TYPE "CallActivityType" ADD VALUE IF NOT EXISTS 'WHATSAPP_FAILED';
ALTER TYPE "CallActivityType" ADD VALUE IF NOT EXISTS 'FORM_STARTED';
ALTER TYPE "CallActivityType" ADD VALUE IF NOT EXISTS 'FORM_SUBMITTED';
ALTER TYPE "CallActivityType" ADD VALUE IF NOT EXISTS 'ARCHIVED';

ALTER TYPE "WhatsAppLeadStatus" ADD VALUE IF NOT EXISTS 'SENDING';
ALTER TYPE "WhatsAppLeadStatus" ADD VALUE IF NOT EXISTS 'OPENED';
ALTER TYPE "WhatsAppLeadStatus" ADD VALUE IF NOT EXISTS 'FORM_STARTED';
ALTER TYPE "WhatsAppLeadStatus" ADD VALUE IF NOT EXISTS 'FORM_SUBMITTED';
ALTER TYPE "WhatsAppLeadStatus" ADD VALUE IF NOT EXISTS 'ASSIGNED';
ALTER TYPE "WhatsAppLeadStatus" ADD VALUE IF NOT EXISTS 'FOLLOW_UP';
ALTER TYPE "WhatsAppLeadStatus" ADD VALUE IF NOT EXISTS 'INTERESTED';
ALTER TYPE "WhatsAppLeadStatus" ADD VALUE IF NOT EXISTS 'CONVERTED';
ALTER TYPE "WhatsAppLeadStatus" ADD VALUE IF NOT EXISTS 'EXPIRED';
ALTER TYPE "WhatsAppLeadStatus" ADD VALUE IF NOT EXISTS 'CANCELLED';

CREATE TYPE "WhatsAppQueueStatus" AS ENUM (
  'NEW',
  'QUEUED',
  'SENDING',
  'SENT',
  'OPENED',
  'FORM_STARTED',
  'FORM_SUBMITTED',
  'FAILED',
  'EXPIRED',
  'CANCELLED'
);

CREATE TYPE "FormSubmissionStatus" AS ENUM (
  'OPENED',
  'FORM_STARTED',
  'FORM_SUBMITTED'
);

ALTER TABLE "CallLead"
  ADD COLUMN "deleted_at" TIMESTAMP(3),
  ADD COLUMN "deleted_by" TEXT,
  ADD COLUMN "is_archived" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "archived_at" TIMESTAMP(3),
  ADD COLUMN "archived_by" TEXT;

ALTER TABLE "CallEvent"
  ADD COLUMN "deleted_at" TIMESTAMP(3),
  ADD COLUMN "deleted_by" TEXT,
  ADD COLUMN "is_archived" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "archived_at" TIMESTAMP(3),
  ADD COLUMN "archived_by" TEXT;

ALTER TABLE "CallSession"
  ADD COLUMN "deleted_at" TIMESTAMP(3),
  ADD COLUMN "deleted_by" TEXT,
  ADD COLUMN "is_archived" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "archived_at" TIMESTAMP(3),
  ADD COLUMN "archived_by" TEXT;

ALTER TABLE "CallActivity"
  ADD COLUMN "deleted_at" TIMESTAMP(3),
  ADD COLUMN "deleted_by" TEXT,
  ADD COLUMN "is_archived" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "archived_at" TIMESTAMP(3),
  ADD COLUMN "archived_by" TEXT;

ALTER TABLE "CallFollowUp"
  ADD COLUMN "deleted_at" TIMESTAMP(3),
  ADD COLUMN "deleted_by" TEXT,
  ADD COLUMN "is_archived" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "archived_at" TIMESTAMP(3),
  ADD COLUMN "archived_by" TEXT;

ALTER TABLE "WhatsAppLead"
  ADD COLUMN "form_opened_at" TIMESTAMP(3),
  ADD COLUMN "form_started_at" TIMESTAMP(3),
  ADD COLUMN "deleted_at" TIMESTAMP(3),
  ADD COLUMN "deleted_by" TEXT,
  ADD COLUMN "is_archived" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "archived_at" TIMESTAMP(3),
  ADD COLUMN "archived_by" TEXT;

CREATE TABLE "WhatsAppQueueItem" (
  "id" TEXT NOT NULL,
  "account_id" TEXT,
  "whatsapp_lead_id" TEXT NOT NULL,
  "call_lead_id" TEXT,
  "phone" TEXT NOT NULL,
  "display_name" TEXT NOT NULL,
  "message" TEXT,
  "status" "WhatsAppQueueStatus" NOT NULL DEFAULT 'QUEUED',
  "form_token" TEXT NOT NULL,
  "queued_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "sending_at" TIMESTAMP(3),
  "sent_at" TIMESTAMP(3),
  "opened_at" TIMESTAMP(3),
  "form_started_at" TIMESTAMP(3),
  "form_submitted_at" TIMESTAMP(3),
  "failed_at" TIMESTAMP(3),
  "expired_at" TIMESTAMP(3),
  "cancelled_at" TIMESTAMP(3),
  "last_error" TEXT,
  "deleted_at" TIMESTAMP(3),
  "deleted_by" TEXT,
  "is_archived" BOOLEAN NOT NULL DEFAULT false,
  "archived_at" TIMESTAMP(3),
  "archived_by" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "WhatsAppQueueItem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "FormSubmission" (
  "id" TEXT NOT NULL,
  "whatsapp_lead_id" TEXT,
  "queue_item_id" TEXT,
  "call_lead_id" TEXT,
  "form_token" TEXT NOT NULL,
  "phone" TEXT NOT NULL,
  "status" "FormSubmissionStatus" NOT NULL DEFAULT 'OPENED',
  "opened_at" TIMESTAMP(3),
  "started_at" TIMESTAMP(3),
  "submitted_at" TIMESTAMP(3),
  "submitted_by" TEXT,
  "ip_address" TEXT,
  "user_agent" TEXT,
  "browser" TEXT,
  "version" TEXT,
  "name" TEXT,
  "city" TEXT,
  "property_type" TEXT,
  "maps_location" TEXT,
  "raw_payload" JSONB,
  "deleted_at" TIMESTAMP(3),
  "deleted_by" TEXT,
  "is_archived" BOOLEAN NOT NULL DEFAULT false,
  "archived_at" TIMESTAMP(3),
  "archived_by" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "FormSubmission_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WhatsAppQueueItem_form_token_key" ON "WhatsAppQueueItem"("form_token");
CREATE INDEX "WhatsAppQueueItem_account_id_idx" ON "WhatsAppQueueItem"("account_id");
CREATE INDEX "WhatsAppQueueItem_whatsapp_lead_id_idx" ON "WhatsAppQueueItem"("whatsapp_lead_id");
CREATE INDEX "WhatsAppQueueItem_call_lead_id_idx" ON "WhatsAppQueueItem"("call_lead_id");
CREATE INDEX "WhatsAppQueueItem_phone_idx" ON "WhatsAppQueueItem"("phone");
CREATE INDEX "WhatsAppQueueItem_status_idx" ON "WhatsAppQueueItem"("status");
CREATE INDEX "WhatsAppQueueItem_queued_at_idx" ON "WhatsAppQueueItem"("queued_at");
CREATE INDEX "WhatsAppQueueItem_sent_at_idx" ON "WhatsAppQueueItem"("sent_at");
CREATE INDEX "WhatsAppQueueItem_is_archived_idx" ON "WhatsAppQueueItem"("is_archived");
CREATE INDEX "WhatsAppQueueItem_deleted_at_idx" ON "WhatsAppQueueItem"("deleted_at");
CREATE UNIQUE INDEX "WhatsAppQueueItem_active_phone_key"
  ON "WhatsAppQueueItem"("phone")
  WHERE "status" IN ('NEW', 'QUEUED', 'SENDING')
    AND "is_archived" = false
    AND "deleted_at" IS NULL;

CREATE UNIQUE INDEX "FormSubmission_form_token_key" ON "FormSubmission"("form_token");
CREATE INDEX "FormSubmission_whatsapp_lead_id_idx" ON "FormSubmission"("whatsapp_lead_id");
CREATE INDEX "FormSubmission_queue_item_id_idx" ON "FormSubmission"("queue_item_id");
CREATE INDEX "FormSubmission_call_lead_id_idx" ON "FormSubmission"("call_lead_id");
CREATE INDEX "FormSubmission_phone_idx" ON "FormSubmission"("phone");
CREATE INDEX "FormSubmission_status_idx" ON "FormSubmission"("status");
CREATE INDEX "FormSubmission_opened_at_idx" ON "FormSubmission"("opened_at");
CREATE INDEX "FormSubmission_submitted_at_idx" ON "FormSubmission"("submitted_at");
CREATE INDEX "FormSubmission_is_archived_idx" ON "FormSubmission"("is_archived");
CREATE INDEX "FormSubmission_deleted_at_idx" ON "FormSubmission"("deleted_at");

CREATE INDEX "CallLead_is_archived_idx" ON "CallLead"("is_archived");
CREATE INDEX "CallLead_deleted_at_idx" ON "CallLead"("deleted_at");
CREATE INDEX "CallEvent_is_archived_idx" ON "CallEvent"("is_archived");
CREATE INDEX "CallEvent_deleted_at_idx" ON "CallEvent"("deleted_at");
CREATE INDEX "CallSession_is_archived_idx" ON "CallSession"("is_archived");
CREATE INDEX "CallSession_deleted_at_idx" ON "CallSession"("deleted_at");
CREATE INDEX "CallActivity_is_archived_idx" ON "CallActivity"("is_archived");
CREATE INDEX "CallActivity_deleted_at_idx" ON "CallActivity"("deleted_at");
CREATE INDEX "CallFollowUp_is_archived_idx" ON "CallFollowUp"("is_archived");
CREATE INDEX "CallFollowUp_deleted_at_idx" ON "CallFollowUp"("deleted_at");
CREATE INDEX "WhatsAppLead_is_archived_idx" ON "WhatsAppLead"("is_archived");
CREATE INDEX "WhatsAppLead_deleted_at_idx" ON "WhatsAppLead"("deleted_at");

ALTER TABLE "WhatsAppQueueItem" ADD CONSTRAINT "WhatsAppQueueItem_account_id_fkey"
  FOREIGN KEY ("account_id") REFERENCES "WhatsAppAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "WhatsAppQueueItem" ADD CONSTRAINT "WhatsAppQueueItem_whatsapp_lead_id_fkey"
  FOREIGN KEY ("whatsapp_lead_id") REFERENCES "WhatsAppLead"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "WhatsAppQueueItem" ADD CONSTRAINT "WhatsAppQueueItem_call_lead_id_fkey"
  FOREIGN KEY ("call_lead_id") REFERENCES "CallLead"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "FormSubmission" ADD CONSTRAINT "FormSubmission_whatsapp_lead_id_fkey"
  FOREIGN KEY ("whatsapp_lead_id") REFERENCES "WhatsAppLead"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "FormSubmission" ADD CONSTRAINT "FormSubmission_queue_item_id_fkey"
  FOREIGN KEY ("queue_item_id") REFERENCES "WhatsAppQueueItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "FormSubmission" ADD CONSTRAINT "FormSubmission_call_lead_id_fkey"
  FOREIGN KEY ("call_lead_id") REFERENCES "CallLead"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill one permanent queue item per existing WhatsApp lead so old queued/sent/form
-- records remain recoverable after the app starts using WhatsAppQueueItem.
INSERT INTO "WhatsAppQueueItem" (
  "id",
  "account_id",
  "whatsapp_lead_id",
  "call_lead_id",
  "phone",
  "display_name",
  "message",
  "status",
  "form_token",
  "queued_at",
  "sent_at",
  "form_submitted_at",
  "failed_at",
  "last_error",
  "created_at",
  "updated_at"
)
SELECT
  'legacy-waq-' || wl."id",
  wl."account_id",
  wl."id",
  cl."id",
  wl."phone",
  wl."display_name",
  wl."message",
  CASE
    WHEN wl."status"::text = 'QUEUED' THEN 'QUEUED'::"WhatsAppQueueStatus"
    WHEN wl."status"::text IN ('SENT', 'REPLIED') THEN 'SENT'::"WhatsAppQueueStatus"
    WHEN wl."status"::text = 'FAILED' THEN 'FAILED'::"WhatsAppQueueStatus"
    ELSE 'NEW'::"WhatsAppQueueStatus"
  END,
  COALESCE(wl."form_token", 'legacy-token-' || wl."id"),
  wl."created_at",
  wl."last_sent_at",
  wl."form_submitted_at",
  CASE WHEN wl."status"::text = 'FAILED' THEN wl."updated_at" ELSE NULL END,
  wl."last_error",
  wl."created_at",
  wl."updated_at"
FROM "WhatsAppLead" wl
LEFT JOIN "CallLead" cl ON cl."phone" = wl."phone"
ON CONFLICT ("form_token") DO NOTHING;

-- Backfill submitted forms into permanent submission history.
INSERT INTO "FormSubmission" (
  "id",
  "whatsapp_lead_id",
  "queue_item_id",
  "call_lead_id",
  "form_token",
  "phone",
  "status",
  "submitted_at",
  "submitted_by",
  "name",
  "city",
  "property_type",
  "maps_location",
  "created_at",
  "updated_at"
)
SELECT
  'legacy-form-' || wl."id",
  wl."id",
  wq."id",
  cl."id",
  COALESCE(wl."form_token", 'legacy-token-' || wl."id"),
  wl."phone",
  'FORM_SUBMITTED'::"FormSubmissionStatus",
  wl."form_submitted_at",
  'customer',
  wl."form_name",
  wl."form_city",
  wl."form_property_type",
  wl."form_maps_location",
  wl."form_submitted_at",
  wl."form_submitted_at"
FROM "WhatsAppLead" wl
LEFT JOIN "WhatsAppQueueItem" wq ON wq."whatsapp_lead_id" = wl."id"
LEFT JOIN "CallLead" cl ON cl."phone" = wl."phone"
WHERE wl."form_submitted_at" IS NOT NULL
ON CONFLICT ("form_token") DO NOTHING;

-- Prevent future hard deletes from cascading through call history.
ALTER TABLE "CallEvent" DROP CONSTRAINT IF EXISTS "CallEvent_company_phone_id_fkey";
ALTER TABLE "CallSession" DROP CONSTRAINT IF EXISTS "CallSession_company_phone_id_fkey";
ALTER TABLE "CallSession" DROP CONSTRAINT IF EXISTS "CallSession_lead_id_fkey";
ALTER TABLE "CallActivity" DROP CONSTRAINT IF EXISTS "CallActivity_lead_id_fkey";
ALTER TABLE "CallFollowUp" DROP CONSTRAINT IF EXISTS "CallFollowUp_lead_id_fkey";

ALTER TABLE "CallEvent" ADD CONSTRAINT "CallEvent_company_phone_id_fkey"
  FOREIGN KEY ("company_phone_id") REFERENCES "CompanyPhone"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CallSession" ADD CONSTRAINT "CallSession_company_phone_id_fkey"
  FOREIGN KEY ("company_phone_id") REFERENCES "CompanyPhone"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CallSession" ADD CONSTRAINT "CallSession_lead_id_fkey"
  FOREIGN KEY ("lead_id") REFERENCES "CallLead"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CallActivity" ADD CONSTRAINT "CallActivity_lead_id_fkey"
  FOREIGN KEY ("lead_id") REFERENCES "CallLead"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CallFollowUp" ADD CONSTRAINT "CallFollowUp_lead_id_fkey"
  FOREIGN KEY ("lead_id") REFERENCES "CallLead"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
