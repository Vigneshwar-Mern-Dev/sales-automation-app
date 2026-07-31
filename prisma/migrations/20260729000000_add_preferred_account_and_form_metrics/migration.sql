-- Add preferredAccountId and form metrics columns to WhatsAppLead
ALTER TABLE "WhatsAppLead"
  ADD COLUMN IF NOT EXISTS "preferred_account_id" TEXT,
  ADD COLUMN IF NOT EXISTS "form_opened_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "form_started_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "deleted_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "deleted_by" TEXT,
  ADD COLUMN IF NOT EXISTS "is_archived" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "archived_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "archived_by" TEXT;

-- Foreign key for preferredAccountId
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'WhatsAppLead_preferred_account_id_fkey'
  ) THEN
    ALTER TABLE "WhatsAppLead"
      ADD CONSTRAINT "WhatsAppLead_preferred_account_id_fkey"
      FOREIGN KEY ("preferred_account_id") REFERENCES "WhatsAppAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- Indexes for WhatsAppLead
CREATE INDEX IF NOT EXISTS "WhatsAppLead_preferred_account_id_idx" ON "WhatsAppLead"("preferred_account_id");
CREATE INDEX IF NOT EXISTS "WhatsAppLead_is_archived_idx" ON "WhatsAppLead"("is_archived");
CREATE INDEX IF NOT EXISTS "WhatsAppLead_deleted_at_idx" ON "WhatsAppLead"("deleted_at");

-- Add missing columns to WhatsAppQueueItem
ALTER TABLE "WhatsAppQueueItem"
  ADD COLUMN IF NOT EXISTS "opened_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "form_started_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "form_submitted_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "failed_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "expired_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "cancelled_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "deleted_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "deleted_by" TEXT,
  ADD COLUMN IF NOT EXISTS "is_archived" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "archived_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "archived_by" TEXT;

CREATE INDEX IF NOT EXISTS "WhatsAppQueueItem_is_archived_idx" ON "WhatsAppQueueItem"("is_archived");
CREATE INDEX IF NOT EXISTS "WhatsAppQueueItem_deleted_at_idx" ON "WhatsAppQueueItem"("deleted_at");

-- FormSubmission table
CREATE TABLE IF NOT EXISTS "FormSubmission" (
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

CREATE UNIQUE INDEX IF NOT EXISTS "FormSubmission_form_token_key" ON "FormSubmission"("form_token");
CREATE INDEX IF NOT EXISTS "FormSubmission_whatsapp_lead_id_idx" ON "FormSubmission"("whatsapp_lead_id");
CREATE INDEX IF NOT EXISTS "FormSubmission_queue_item_id_idx" ON "FormSubmission"("queue_item_id");
CREATE INDEX IF NOT EXISTS "FormSubmission_call_lead_id_idx" ON "FormSubmission"("call_lead_id");
CREATE INDEX IF NOT EXISTS "FormSubmission_phone_idx" ON "FormSubmission"("phone");
CREATE INDEX IF NOT EXISTS "FormSubmission_status_idx" ON "FormSubmission"("status");
CREATE INDEX IF NOT EXISTS "FormSubmission_opened_at_idx" ON "FormSubmission"("opened_at");
CREATE INDEX IF NOT EXISTS "FormSubmission_submitted_at_idx" ON "FormSubmission"("submitted_at");
CREATE INDEX IF NOT EXISTS "FormSubmission_is_archived_idx" ON "FormSubmission"("is_archived");
CREATE INDEX IF NOT EXISTS "FormSubmission_deleted_at_idx" ON "FormSubmission"("deleted_at");

-- LoginAttempt table
CREATE TABLE IF NOT EXISTS "login_attempts" (
  "id" TEXT NOT NULL,
  "identifier" TEXT NOT NULL,
  "ip_address" TEXT,
  "failed_count" INTEGER NOT NULL DEFAULT 0,
  "first_failed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "last_failed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "locked_until" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "login_attempts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "login_attempts_identifier_key" ON "login_attempts"("identifier");
CREATE INDEX IF NOT EXISTS "login_attempts_locked_until_idx" ON "login_attempts"("locked_until");

-- RateLimitBucket table
CREATE TABLE IF NOT EXISTS "rate_limit_buckets" (
  "key" TEXT NOT NULL,
  "count" INTEGER NOT NULL DEFAULT 0,
  "window_started_at" TIMESTAMP(3) NOT NULL,
  "blocked_until" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "rate_limit_buckets_pkey" PRIMARY KEY ("key")
);

CREATE INDEX IF NOT EXISTS "rate_limit_buckets_updated_at_idx" ON "rate_limit_buckets"("updated_at");
