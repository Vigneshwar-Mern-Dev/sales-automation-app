-- Preserve CRM history when an account is removed from active use.
ALTER TABLE "User"
  ADD COLUMN "is_active" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "deactivated_at" TIMESTAMP(3),
  ADD COLUMN "deactivated_by" TEXT;

-- Authentication by username must be deterministic.
-- This intentionally fails if duplicate usernames already exist so they can be
-- resolved explicitly instead of silently deleting or renaming an account.
CREATE UNIQUE INDEX "User_name_key" ON "User"("name");

-- Prevent a direct user delete from cascading into task and comment history.
ALTER TABLE "Task" DROP CONSTRAINT "Task_assignedToId_fkey";
ALTER TABLE "Task" DROP CONSTRAINT "Task_assignedById_fkey";
ALTER TABLE "TaskComment" DROP CONSTRAINT "TaskComment_authorId_fkey";

ALTER TABLE "Task" ADD CONSTRAINT "Task_assignedToId_fkey"
  FOREIGN KEY ("assignedToId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Task" ADD CONSTRAINT "Task_assignedById_fkey"
  FOREIGN KEY ("assignedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TaskComment" ADD CONSTRAINT "TaskComment_authorId_fkey"
  FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Queue claims are leases. Expired claims can be recovered after a worker crash.
ALTER TABLE "WhatsAppQueueItem"
  ADD COLUMN "claim_expires_at" TIMESTAMP(3),
  ADD COLUMN "attempt_count" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "provider_message_id" TEXT;

CREATE INDEX "WhatsAppQueueItem_claim_expires_at_idx"
  ON "WhatsAppQueueItem"("claim_expires_at");
CREATE UNIQUE INDEX "WhatsAppQueueItem_provider_message_id_key"
  ON "WhatsAppQueueItem"("provider_message_id");

-- Keep the oldest active attempt and cancel accidental concurrent duplicates
-- before enforcing one active outbound message per phone number.
WITH ranked_active_items AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (
      PARTITION BY "phone"
      ORDER BY "queued_at" ASC, "created_at" ASC, "id" ASC
    ) AS active_rank
  FROM "WhatsAppQueueItem"
  WHERE "status" IN ('QUEUED', 'SENDING')
    AND "deleted_at" IS NULL
    AND "is_archived" = false
)
UPDATE "WhatsAppQueueItem" AS queue_item
SET
  "status" = 'CANCELLED',
  "cancelled_at" = CURRENT_TIMESTAMP,
  "claim_expires_at" = NULL,
  "last_error" = 'Cancelled duplicate active queue item during delivery hardening migration.'
FROM ranked_active_items
WHERE queue_item."id" = ranked_active_items."id"
  AND ranked_active_items.active_rank > 1;

CREATE UNIQUE INDEX "WhatsAppQueueItem_one_active_phone_idx"
  ON "WhatsAppQueueItem"("phone")
  WHERE "status" IN ('QUEUED', 'SENDING')
    AND "deleted_at" IS NULL
    AND "is_archived" = false;
