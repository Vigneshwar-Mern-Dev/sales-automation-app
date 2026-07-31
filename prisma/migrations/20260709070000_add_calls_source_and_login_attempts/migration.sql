-- Add CALLS value to LeadSource enum
ALTER TYPE "LeadSource" ADD VALUE IF NOT EXISTS 'CALLS';

-- Create LoginAttempt table for database-backed login rate limiting
CREATE TABLE "login_attempts" (
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

-- Unique index on identifier (login username/email)
CREATE UNIQUE INDEX "login_attempts_identifier_key" ON "login_attempts"("identifier");

-- Index for cleanup queries on locked_until
CREATE INDEX "login_attempts_locked_until_idx" ON "login_attempts"("locked_until");
