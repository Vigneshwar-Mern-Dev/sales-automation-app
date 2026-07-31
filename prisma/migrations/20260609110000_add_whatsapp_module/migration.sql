-- Add a controlled WhatsApp integration module for QR/status, settings, and opt-in leads.
CREATE TYPE "WhatsAppConnectionStatus" AS ENUM ('DISCONNECTED', 'QR_REQUIRED', 'CONNECTING', 'CONNECTED', 'ERROR', 'PAUSED');

CREATE TYPE "WhatsAppLeadStatus" AS ENUM ('NEW', 'OPTED_IN', 'QUEUED', 'SENT', 'FAILED', 'DO_NOT_CONTACT');

CREATE TABLE "WhatsAppAccount" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL DEFAULT 'Primary WhatsApp',
    "phone_number" TEXT,
    "status" "WhatsAppConnectionStatus" NOT NULL DEFAULT 'DISCONNECTED',
    "qr_code_data" TEXT,
    "min_delay_seconds" INTEGER NOT NULL DEFAULT 45,
    "max_delay_seconds" INTEGER NOT NULL DEFAULT 120,
    "daily_send_limit" INTEGER NOT NULL DEFAULT 100,
    "require_opt_in" BOOLEAN NOT NULL DEFAULT true,
    "quiet_hours_start" TEXT NOT NULL DEFAULT '21:00',
    "quiet_hours_end" TEXT NOT NULL DEFAULT '09:00',
    "message_variants" TEXT,
    "last_connected_at" TIMESTAMP(3),
    "last_error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WhatsAppAccount_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WhatsAppLead" (
    "id" TEXT NOT NULL,
    "account_id" TEXT,
    "phone" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "message" TEXT,
    "status" "WhatsAppLeadStatus" NOT NULL DEFAULT 'NEW',
    "consent_at" TIMESTAMP(3),
    "last_sent_at" TIMESTAMP(3),
    "last_error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WhatsAppLead_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "WhatsAppAccount_status_idx" ON "WhatsAppAccount"("status");
CREATE INDEX "WhatsAppLead_account_id_idx" ON "WhatsAppLead"("account_id");
CREATE INDEX "WhatsAppLead_status_idx" ON "WhatsAppLead"("status");
CREATE INDEX "WhatsAppLead_phone_idx" ON "WhatsAppLead"("phone");
CREATE INDEX "WhatsAppLead_created_at_idx" ON "WhatsAppLead"("created_at");

ALTER TABLE "WhatsAppLead" ADD CONSTRAINT "WhatsAppLead_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "WhatsAppAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;
