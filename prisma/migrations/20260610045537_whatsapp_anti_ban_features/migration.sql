-- AlterEnum
ALTER TYPE "WhatsAppLeadStatus" ADD VALUE 'REPLIED';

-- AlterTable
ALTER TABLE "WhatsAppAccount" ADD COLUMN     "auto_pause_threshold" INTEGER NOT NULL DEFAULT 3,
ADD COLUMN     "consecutive_failures" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "contact_cooldown_days" INTEGER NOT NULL DEFAULT 7,
ADD COLUMN     "hourly_send_limit" INTEGER NOT NULL DEFAULT 10,
ADD COLUMN     "warmup_enabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "warmup_ramp_per_day" INTEGER NOT NULL DEFAULT 5,
ADD COLUMN     "warmup_start_date" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "WhatsAppLead" ADD COLUMN     "last_reply_at" TIMESTAMP(3),
ADD COLUMN     "last_reply_snippet" TEXT;
