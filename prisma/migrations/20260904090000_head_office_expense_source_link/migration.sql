-- Add the cross-entity source/sourceRef link to HeadOfficeExpense so auto-posted
-- Day Book rows (bank-guarantee commission) are found by FK instead of
-- fragile text matching on notes/voucherNo.

ALTER TABLE "HeadOfficeExpense" ADD COLUMN "source" TEXT,
    ADD COLUMN "sourceRefId" TEXT,
    ADD COLUMN "sourceRefType" TEXT;

CREATE INDEX "HeadOfficeExpense_source_sourceRefId_idx" ON "HeadOfficeExpense"("source", "sourceRefId");
