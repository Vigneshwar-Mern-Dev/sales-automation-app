-- Allow retry queue history to preserve the same customer form token across attempts.
-- FormSubmission.form_token remains unique and is the submitted-form source of truth.
DROP INDEX IF EXISTS "WhatsAppQueueItem_form_token_key";
CREATE INDEX IF NOT EXISTS "WhatsAppQueueItem_form_token_idx" ON "WhatsAppQueueItem"("form_token");
