
-- Deduplicate double-posted entries BEFORE creating the unique index:
-- keep the earliest entry per (source, sourceRefId); later duplicates
-- are artifacts of the pre-constraint double-posting bug. Entries with
-- NULL sourceRefId are unaffected (Postgres UNIQUE treats NULLs as distinct).
DELETE FROM "JournalEntry" je
USING "JournalEntry" keep
WHERE je."sourceRefId" IS NOT NULL
  AND keep."sourceRefId" IS NOT NULL
  AND je."source" = keep."source"
  AND je."sourceRefId" = keep."sourceRefId"
  AND je."id" > keep."id";

-- DropIndex
DROP INDEX IF EXISTS "JournalEntry_source_sourceRefId_idx";

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "JournalEntry_source_sourceRefId_key" ON "JournalEntry"("source", "sourceRefId");
