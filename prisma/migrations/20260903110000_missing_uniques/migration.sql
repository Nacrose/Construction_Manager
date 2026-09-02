-- Missing uniques (audit P2 item 25).
--
-- ⚠ DEPLOY NOTE: if legacy data contains duplicates, this migration will
-- fail loudly (by design). Deduplicate first, e.g.:
--   DELETE FROM "CompanyBankAccount" a USING "CompanyBankAccount" b
--     WHERE a."organizationId" = b."organizationId"
--       AND a."accountNumber" = b."accountNumber" AND a."id" > b."id";
--   UPDATE "JvCommissionPayout" SET "ipcId" = NULL WHERE "id" NOT IN (
--     SELECT MIN("id") FROM "JvCommissionPayout"
--     WHERE "ipcId" IS NOT NULL GROUP BY "ipcId");
CREATE UNIQUE INDEX "CompanyBankAccount_organizationId_accountNumber_key"
  ON "CompanyBankAccount"("organizationId", "accountNumber");

-- One commission payout per IPC (double-pay race guard). NULLs exempt.
CREATE UNIQUE INDEX "JvCommissionPayout_ipcId_key"
  ON "JvCommissionPayout"("ipcId");
