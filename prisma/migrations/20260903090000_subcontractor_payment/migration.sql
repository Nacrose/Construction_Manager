-- SubcontractorPayment: per-payment ledger rows for subcontractor bill
-- settlement (mirrors VendorPayment). Before this table, markPaid wrote
-- only the aggregate paidAmount on the bill: no per-payment trail, and the
-- payment JE had to key on the bill id, which made a second (installment)
-- payment violate JournalEntry @@unique([source, sourceRefId]) (audit C-3).
--
-- VendorPayment.sourcePaymentId: loose link back to the Payment voucher row
-- that created the bill payment (payment.create's settlement path) so a
-- deleted voucher can unwind exactly its own bill payments (audit H-15).
CREATE TABLE "SubcontractorPayment" (
    "id"                  TEXT NOT NULL,
    "projectId"           TEXT NOT NULL,
    "subcontractorBillId" TEXT NOT NULL,
    "amount"              DECIMAL(15,2) NOT NULL,
    "paymentDate"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "paymentMethod"       TEXT NOT NULL DEFAULT 'bank_transfer',
    "referenceNumber"     TEXT,
    "remarks"             TEXT,
    "sourcePaymentId"     TEXT,
    "createdById"         TEXT,
    "createdAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SubcontractorPayment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SubcontractorPayment_projectId_idx" ON "SubcontractorPayment"("projectId");
CREATE INDEX "SubcontractorPayment_subcontractorBillId_idx" ON "SubcontractorPayment"("subcontractorBillId");

ALTER TABLE "SubcontractorPayment" ADD CONSTRAINT "SubcontractorPayment_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SubcontractorPayment" ADD CONSTRAINT "SubcontractorPayment_subcontractorBillId_fkey" FOREIGN KEY ("subcontractorBillId") REFERENCES "SubcontractorBill"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SubcontractorPayment" ADD CONSTRAINT "SubcontractorPayment_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "VendorPayment" ADD COLUMN "sourcePaymentId" TEXT;
