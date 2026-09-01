-- DropIndex
DROP INDEX IF EXISTS "JournalEntry_source_sourceRefId_idx";

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "JournalEntry_source_sourceRefId_key" ON "JournalEntry"("source", "sourceRefId");
