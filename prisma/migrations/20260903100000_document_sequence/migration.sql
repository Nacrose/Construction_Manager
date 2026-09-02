-- DocumentSequence: atomic document-number sequences (audit P2 item 29).
-- Replaces the racy count()+1 generator; one row per (docType, scopeKey),
-- incremented with INSERT .. ON CONFLICT .. UPDATE .. RETURNING inside the
-- caller's transaction.
CREATE TABLE "DocumentSequence" (
    "id"       TEXT NOT NULL,
    "docType"  TEXT NOT NULL,
    "scopeKey" TEXT NOT NULL,
    "counter"  INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "DocumentSequence_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DocumentSequence_docType_scopeKey_key" ON "DocumentSequence"("docType", "scopeKey");
