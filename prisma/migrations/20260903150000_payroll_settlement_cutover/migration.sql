-- Phase E: payroll & settlement cutover (ADR-0007, ADR-0006 §2).
-- Clean break (ADR-0008): reshape in place, no data-preservation machinery.

-- 1. paymentStatus was a flipped flag; paid/partial/unpaid is now DERIVED
--    from paidAmount vs netPayable (derived-status, ADR-0006 §2 — computed,
--    never flipped).
ALTER TABLE "PayrollPersonRecord" DROP COLUMN IF EXISTS "paymentStatus";

-- 2. Advance recovery ledger (ADR-0007 §4): every CAS-guarded increment on
--    StaffAdvance.recoveredAmount also writes an exact ledger row here, so
--    a run reopen reverses recoveries precisely and concurrent runs cannot
--    double-recover the same advance.
CREATE TABLE "PayrollAdvanceRecovery" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "payrollRunId" TEXT NOT NULL,
    "advanceId" TEXT NOT NULL,
    "personRecordId" TEXT NOT NULL,
    "amount" DECIMAL(15,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PayrollAdvanceRecovery_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PayrollAdvanceRecovery_payrollRunId_advanceId_key" ON "PayrollAdvanceRecovery"("payrollRunId", "advanceId");
CREATE INDEX "PayrollAdvanceRecovery_advanceId_idx" ON "PayrollAdvanceRecovery"("advanceId");
CREATE INDEX "PayrollAdvanceRecovery_payrollRunId_idx" ON "PayrollAdvanceRecovery"("payrollRunId");
CREATE INDEX "PayrollAdvanceRecovery_organizationId_idx" ON "PayrollAdvanceRecovery"("organizationId");

ALTER TABLE "PayrollAdvanceRecovery" ADD CONSTRAINT "PayrollAdvanceRecovery_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PayrollAdvanceRecovery" ADD CONSTRAINT "PayrollAdvanceRecovery_payrollRunId_fkey" FOREIGN KEY ("payrollRunId") REFERENCES "PayrollRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PayrollAdvanceRecovery" ADD CONSTRAINT "PayrollAdvanceRecovery_advanceId_fkey" FOREIGN KEY ("advanceId") REFERENCES "StaffAdvance"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PayrollAdvanceRecovery" ADD CONSTRAINT "PayrollAdvanceRecovery_personRecordId_fkey" FOREIGN KEY ("personRecordId") REFERENCES "PayrollPersonRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 3. RLS — the recovery ledger is org-scoped (same pattern as PayrollRun).
ALTER TABLE "PayrollAdvanceRecovery" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PayrollAdvanceRecovery" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "payroll_advance_recovery_org_isolation" ON "PayrollAdvanceRecovery";
CREATE POLICY "payroll_advance_recovery_org_isolation" ON "PayrollAdvanceRecovery"
  FOR ALL
  USING (
    current_setting('app.is_superadmin', true) = 'true'
    OR "organizationId" = NULLIF(current_setting('app.organization_id', true), '')::text
  )
  WITH CHECK (
    current_setting('app.is_superadmin', true) = 'true'
    OR "organizationId" = NULLIF(current_setting('app.organization_id', true), '')::text
  );
