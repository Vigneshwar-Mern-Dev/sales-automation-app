-- Route each call-tracker phone through one dedicated WhatsApp account.
ALTER TABLE "CompanyPhone"
ADD COLUMN "whatsapp_account_id" TEXT;

CREATE UNIQUE INDEX "CompanyPhone_whatsapp_account_id_key"
ON "CompanyPhone"("whatsapp_account_id");

ALTER TABLE "CompanyPhone"
ADD CONSTRAINT "CompanyPhone_whatsapp_account_id_fkey"
FOREIGN KEY ("whatsapp_account_id") REFERENCES "WhatsAppAccount"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill only a unique last-10-digit match. Unmatched accounts remain
-- unmapped and must be selected explicitly in the admin panel.
WITH matches AS (
  SELECT cp."id" AS company_phone_id, wa."id" AS whatsapp_account_id
  FROM "CompanyPhone" cp
  JOIN "WhatsAppAccount" wa
    ON RIGHT(REGEXP_REPLACE(cp."phone_number", '[^0-9]', '', 'g'), 10)
     = RIGHT(REGEXP_REPLACE(COALESCE(wa."phone_number", ''), '[^0-9]', '', 'g'), 10)
  WHERE LENGTH(REGEXP_REPLACE(COALESCE(wa."phone_number", ''), '[^0-9]', '', 'g')) >= 10
), unique_matches AS (
  SELECT company_phone_id, MIN(whatsapp_account_id) AS whatsapp_account_id
  FROM matches
  GROUP BY company_phone_id
  HAVING COUNT(*) = 1
)
UPDATE "CompanyPhone" cp
SET "whatsapp_account_id" = um.whatsapp_account_id
FROM unique_matches um
WHERE cp."id" = um.company_phone_id;
