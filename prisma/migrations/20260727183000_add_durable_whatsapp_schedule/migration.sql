-- Persist the delivery schedule so page refreshes and worker restarts do not
-- reset the displayed ETA or cause multiple items to become due together.
ALTER TABLE "WhatsAppQueueItem"
  ADD COLUMN "send_after_at" TIMESTAMP(3);

WITH active_schedule AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (
      PARTITION BY "account_id"
      ORDER BY "queued_at" ASC, "created_at" ASC, "id" ASC
    ) AS queue_position
  FROM "WhatsAppQueueItem"
  WHERE "status" IN ('QUEUED', 'SENDING')
    AND "deleted_at" IS NULL
    AND "is_archived" = false
)
UPDATE "WhatsAppQueueItem" AS queue_item
SET "send_after_at" =
  GREATEST(queue_item."queued_at", CURRENT_TIMESTAMP)
  + active_schedule.queue_position * INTERVAL '90 seconds'
FROM active_schedule
WHERE queue_item."id" = active_schedule."id";

UPDATE "WhatsAppQueueItem"
SET "send_after_at" = "queued_at"
WHERE "send_after_at" IS NULL;

ALTER TABLE "WhatsAppQueueItem"
  ALTER COLUMN "send_after_at" SET NOT NULL,
  ALTER COLUMN "send_after_at" SET DEFAULT CURRENT_TIMESTAMP;

CREATE INDEX "WhatsAppQueueItem_account_id_status_send_after_at_idx"
  ON "WhatsAppQueueItem"("account_id", "status", "send_after_at");