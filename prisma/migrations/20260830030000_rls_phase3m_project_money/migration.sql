-- ═══════════════════════════════════════════════════════════════
-- RLS Rollout — Phase 3m: project-scoped MONEY tables (13 tables)
-- (docs/plans/rls-rollout.md §4 Phase 3m, template §3.2)
--
-- Tables: Payment, VendorBill, VendorPayment, PayrollRun,
--         JournalEntryLine, Ipc, SubcontractorBill, SiteExpense,
--         ProjectCost, VatBill, MaterialTransaction, PurchaseOrder,
--         PurchaseRequisition
--
-- Verified in a dedicated PG16 lab (34/34 checks — see
-- docs/rls-evidence/phase3m-verification.md (reproduce: python scripts/rls-phase3m-lab.py)):
--   Q1  The naive design (phase-1 JournalEntry policy that reaches
--       through JournalEntryLine + a JournalEntryLine policy that
--       reaches back through JournalEntry) raises PostgreSQL's
--       "infinite recursion detected in policy" on EVERY read, both
--       as the table owner and as a non-owner. This migration
--       therefore RESTRUCTURES the JournalEntry policies instead of
--       adding the naive mutual references.
--   Q2  The restructure is correct across a full matrix: backfill,
--       visibility (incl. org-level NULL-project lines via their
--       parent entry), cross-org deny on read/write, fail-closed
--       without context, superadmin bypass, owner and non-owner
--       connection modes agree.
--   Q3  Plain §3.2 EXISTS-via-Project verified on all 12 remaining
--       tables in both connection modes. Rows anchored to legacy
--       NULL-org projects fail closed.
--   Q4  EXPLAIN ANALYZE at 10k MaterialTransaction rows: the policy
--       subplan reaches Project one-time (hash subplan) — 2.7 ms for
--       count(*); no per-row Seq Scan on Project.
--
-- Migration ordering (each step exists because the lab proved the
-- naive ordering fails — see the lab report for the details):
--   1. tx-local superadmin GUC FIRST — a FORCEd table with policies
--      is only passable when a policy that READS the GUC exists;
--   2. swap JournalEntry to simplified per-command policies BEFORE
--      the backfill — they cover SELECT *and* UPDATE with the
--      superadmin branch (a SELECT-only policy silently denies
--      UPDATE: 0 rows, no error), and after the swap NO policy
--      references JournalEntryLine (recursion impossible);
--   3. backfill — JournalEntryLine has NO RLS yet (prod state before
--      this migration), so the backfill subquery reads it freely;
--   4. give JournalEntryLine RLS + its 3-branch policy;
--   5. the 12 §3.2 policies.
--
-- Prisma runs this file inside a single transaction: the is_local
-- GUC reverts automatically at COMMIT (same mechanism as
-- prisma/seed-rls.ts).
--
-- Rollback (instant — policy metadata + one backfilled column; no
-- table rewrites): see the ROLLBACK section at the bottom.
-- ═══════════════════════════════════════════════════════════════

-- ── Step 1: transaction-local superadmin context for the backfill ──
-- Phase-1/2 policies are still in place and read app.is_superadmin;
-- this makes every row visible for the maintenance UPDATE below.
SELECT set_config('app.is_superadmin', 'true', true);

-- ── Step 2: JournalEntry — replace the phase-1 policy set ─────────
-- The phase-1 SELECT/UPDATE policies reach entries through
-- JournalEntryLine→Project (needed because project-linked entries
-- carried organizationId NULL). Phase 3m gives JournalEntryLine its
-- own policy, which must reach back through JournalEntry for
-- org-level lines (financial-reporting.ts accessCondition mirrors
-- exactly this) — and those two mutual references are what
-- PostgreSQL rejects with "infinite recursion detected in policy"
-- (lab check Q1).
--
-- Fix: backfill organizationId onto legacy NULL-org entries (Step 3)
-- so the lines→project reach is no longer needed, then reduce
-- JournalEntry to the plain §3.1 org-match policy. Every
-- createJournalEntry caller already passes organizationId (verified
-- across all 15 call sites); the INSERT check is correspondingly
-- tightened — a caller that forgets org now fails loudly instead of
-- writing an entry nobody can see.

DROP POLICY IF EXISTS "journal_entry_org_isolation" ON "JournalEntry";
CREATE POLICY "journal_entry_org_isolation" ON "JournalEntry"
  FOR SELECT
  USING (
    current_setting('app.is_superadmin', true) = 'true'
    OR "organizationId" = NULLIF(current_setting('app.organization_id', true), '')::text
  );

DROP POLICY IF EXISTS "journal_entry_insert_org_check" ON "JournalEntry";
CREATE POLICY "journal_entry_insert_org_check" ON "JournalEntry"
  FOR INSERT
  WITH CHECK (
    current_setting('app.is_superadmin', true) = 'true'
    OR "organizationId" = NULLIF(current_setting('app.organization_id', true), '')::text
  );

DROP POLICY IF EXISTS "journal_entry_update_org_check" ON "JournalEntry";
CREATE POLICY "journal_entry_update_org_check" ON "JournalEntry"
  FOR UPDATE
  USING (
    current_setting('app.is_superadmin', true) = 'true'
    OR "organizationId" = NULLIF(current_setting('app.organization_id', true), '')::text
  )
  WITH CHECK (
    current_setting('app.is_superadmin', true) = 'true'
    OR "organizationId" = NULLIF(current_setting('app.organization_id', true), '')::text
  );

DROP POLICY IF EXISTS "journal_entry_delete_org_check" ON "JournalEntry";
CREATE POLICY "journal_entry_delete_org_check" ON "JournalEntry"
  FOR DELETE
  USING (
    current_setting('app.is_superadmin', true) = 'true'
    OR "organizationId" = NULLIF(current_setting('app.organization_id', true), '')::text
  );

-- ── Step 3: backfill organizationId onto legacy NULL-org entries ──
-- Guard first: an entry whose lines span projects of DIFFERENT orgs
-- is a tenant-integrity violation that no automatic rule can resolve
-- — fail the migration loudly so ops can fix the data by hand.
DO $$
DECLARE
  ambiguous int;
  null_org int;
BEGIN
  SELECT count(*) INTO ambiguous FROM (
    SELECT jel."journalEntryId"
    FROM "JournalEntryLine" jel
    JOIN "Project" p ON p."id" = jel."projectId"
    WHERE jel."projectId" IS NOT NULL
    GROUP BY jel."journalEntryId"
    HAVING count(DISTINCT p."organizationId") > 1
  ) x;
  IF ambiguous > 0 THEN
    RAISE EXCEPTION 'RLS phase-3m backfill: % journal entries have lines spanning multiple organizations — resolve them manually before migrating', ambiguous;
  END IF;

  SELECT count(*) INTO null_org
  FROM "JournalEntry" je
  WHERE je."organizationId" IS NULL
    AND NOT EXISTS (
      SELECT 1 FROM "JournalEntryLine" jel
      JOIN "Project" p ON p."id" = jel."projectId"
      WHERE jel."journalEntryId" = je."id" AND jel."projectId" IS NOT NULL
    );
  IF null_org > 0 THEN
    RAISE NOTICE 'RLS phase-3m backfill: % org-less entries have no project-linked lines; they stay organizationId NULL and are visible to superadmin only (same rows the app layer already hides from every org)', null_org;
  END IF;
END $$;

UPDATE "JournalEntry" je
SET "organizationId" = (
  SELECT p."organizationId"
  FROM "JournalEntryLine" jel
  JOIN "Project" p ON p."id" = jel."projectId"
  WHERE jel."journalEntryId" = je."id"
    AND jel."projectId" IS NOT NULL
  ORDER BY jel."lineNumber"
  LIMIT 1
)
WHERE "organizationId" IS NULL;
-- Entries whose only lines point at legacy NULL-org projects resolve
-- to NULL and stay NULL: they fail closed until the Phase-4/G-3
-- Project.organizationId backfill retires the legacy NULL-org rows.

-- ── Step 4: JournalEntryLine — 3-branch policy ─────────────────────
-- Mirrors financial-reporting.ts exactly:
--   a line is visible when its project belongs to the caller's org
--   (project-level cost allocation) OR when its parent entry is an
--   org-level entry of the caller's org (NULL-project lines, e.g.
--   head-office expenses). A line under an own-org entry may carry a
--   foreign projectId (the app layer shows it to the entry's org the
--   same way) — visibility follows the ENTRY, not the project.
ALTER TABLE "JournalEntryLine" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "JournalEntryLine" FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "journal_entry_line_isolation" ON "JournalEntryLine";
CREATE POLICY "journal_entry_line_isolation" ON "JournalEntryLine"
  FOR ALL
  USING (
    current_setting('app.is_superadmin', true) = 'true'
    OR EXISTS (
      SELECT 1 FROM "Project" p
      WHERE p."id" = "JournalEntryLine"."projectId"
        AND p."organizationId" = NULLIF(current_setting('app.organization_id', true), '')::text
    )
    OR EXISTS (
      SELECT 1 FROM "JournalEntry" je
      WHERE je."id" = "JournalEntryLine"."journalEntryId"
        AND je."organizationId" = NULLIF(current_setting('app.organization_id', true), '')::text
    )
  )
  WITH CHECK (
    current_setting('app.is_superadmin', true) = 'true'
    OR EXISTS (
      SELECT 1 FROM "Project" p
      WHERE p."id" = "JournalEntryLine"."projectId"
        AND p."organizationId" = NULLIF(current_setting('app.organization_id', true), '')::text
    )
    OR EXISTS (
      SELECT 1 FROM "JournalEntry" je
      WHERE je."id" = "JournalEntryLine"."journalEntryId"
        AND je."organizationId" = NULLIF(current_setting('app.organization_id', true), '')::text
    )
  );

-- ── Step 5: the 12 remaining tables — plain §3.2 ───────────────────
-- All have projectId NOT NULL (schema), so there is no NULL-project
-- case: every row is reachable through exactly one Project. The
-- EXISTS predicate carries the org filter itself, so legacy NULL-org
-- projects never grant cross-org reach (lab check Q3).

-- ── Payment — Payments daybook (finance/accounting read via project) ──
ALTER TABLE "Payment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Payment" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "payment_project_org_isolation" ON "Payment";
CREATE POLICY "payment_project_org_isolation" ON "Payment"
  FOR ALL
  USING (
    current_setting('app.is_superadmin', true) = 'true'
    OR EXISTS (
      SELECT 1 FROM "Project" p
      WHERE p."id" = "Payment"."projectId"
        AND p."organizationId" = NULLIF(current_setting('app.organization_id', true), '')::text
    )
  )
  WITH CHECK (
    current_setting('app.is_superadmin', true) = 'true'
    OR EXISTS (
      SELECT 1 FROM "Project" p
      WHERE p."id" = "Payment"."projectId"
        AND p."organizationId" = NULLIF(current_setting('app.organization_id', true), '')::text
    )
  );

-- ── VendorBill — Vendor bills (vendor-bill/accounting) ──
ALTER TABLE "VendorBill" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "VendorBill" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "vendor_bill_project_org_isolation" ON "VendorBill";
CREATE POLICY "vendor_bill_project_org_isolation" ON "VendorBill"
  FOR ALL
  USING (
    current_setting('app.is_superadmin', true) = 'true'
    OR EXISTS (
      SELECT 1 FROM "Project" p
      WHERE p."id" = "VendorBill"."projectId"
        AND p."organizationId" = NULLIF(current_setting('app.organization_id', true), '')::text
    )
  )
  WITH CHECK (
    current_setting('app.is_superadmin', true) = 'true'
    OR EXISTS (
      SELECT 1 FROM "Project" p
      WHERE p."id" = "VendorBill"."projectId"
        AND p."organizationId" = NULLIF(current_setting('app.organization_id', true), '')::text
    )
  );

-- ── VendorPayment — Vendor payments (vendor-bill/project-ops) ──
ALTER TABLE "VendorPayment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "VendorPayment" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "vendor_payment_project_org_isolation" ON "VendorPayment";
CREATE POLICY "vendor_payment_project_org_isolation" ON "VendorPayment"
  FOR ALL
  USING (
    current_setting('app.is_superadmin', true) = 'true'
    OR EXISTS (
      SELECT 1 FROM "Project" p
      WHERE p."id" = "VendorPayment"."projectId"
        AND p."organizationId" = NULLIF(current_setting('app.organization_id', true), '')::text
    )
  )
  WITH CHECK (
    current_setting('app.is_superadmin', true) = 'true'
    OR EXISTS (
      SELECT 1 FROM "Project" p
      WHERE p."id" = "VendorPayment"."projectId"
        AND p."organizationId" = NULLIF(current_setting('app.organization_id', true), '')::text
    )
  );

-- ── PayrollRun — Payroll runs (payroll) ──
ALTER TABLE "PayrollRun" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PayrollRun" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "payroll_run_project_org_isolation" ON "PayrollRun";
CREATE POLICY "payroll_run_project_org_isolation" ON "PayrollRun"
  FOR ALL
  USING (
    current_setting('app.is_superadmin', true) = 'true'
    OR EXISTS (
      SELECT 1 FROM "Project" p
      WHERE p."id" = "PayrollRun"."projectId"
        AND p."organizationId" = NULLIF(current_setting('app.organization_id', true), '')::text
    )
  )
  WITH CHECK (
    current_setting('app.is_superadmin', true) = 'true'
    OR EXISTS (
      SELECT 1 FROM "Project" p
      WHERE p."id" = "PayrollRun"."projectId"
        AND p."organizationId" = NULLIF(current_setting('app.organization_id', true), '')::text
    )
  );

-- ── Ipc — Interim payment certificates (ipc/finance) ──
ALTER TABLE "Ipc" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Ipc" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ipc_project_org_isolation" ON "Ipc";
CREATE POLICY "ipc_project_org_isolation" ON "Ipc"
  FOR ALL
  USING (
    current_setting('app.is_superadmin', true) = 'true'
    OR EXISTS (
      SELECT 1 FROM "Project" p
      WHERE p."id" = "Ipc"."projectId"
        AND p."organizationId" = NULLIF(current_setting('app.organization_id', true), '')::text
    )
  )
  WITH CHECK (
    current_setting('app.is_superadmin', true) = 'true'
    OR EXISTS (
      SELECT 1 FROM "Project" p
      WHERE p."id" = "Ipc"."projectId"
        AND p."organizationId" = NULLIF(current_setting('app.organization_id', true), '')::text
    )
  );

-- ── SubcontractorBill — Subcontractor bills (subcontractor-bill/finance) ──
ALTER TABLE "SubcontractorBill" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SubcontractorBill" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "subcontractor_bill_project_org_isolation" ON "SubcontractorBill";
CREATE POLICY "subcontractor_bill_project_org_isolation" ON "SubcontractorBill"
  FOR ALL
  USING (
    current_setting('app.is_superadmin', true) = 'true'
    OR EXISTS (
      SELECT 1 FROM "Project" p
      WHERE p."id" = "SubcontractorBill"."projectId"
        AND p."organizationId" = NULLIF(current_setting('app.organization_id', true), '')::text
    )
  )
  WITH CHECK (
    current_setting('app.is_superadmin', true) = 'true'
    OR EXISTS (
      SELECT 1 FROM "Project" p
      WHERE p."id" = "SubcontractorBill"."projectId"
        AND p."organizationId" = NULLIF(current_setting('app.organization_id', true), '')::text
    )
  );

-- ── SiteExpense — Site expenses (site-expense/accounting) ──
ALTER TABLE "SiteExpense" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SiteExpense" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "site_expense_project_org_isolation" ON "SiteExpense";
CREATE POLICY "site_expense_project_org_isolation" ON "SiteExpense"
  FOR ALL
  USING (
    current_setting('app.is_superadmin', true) = 'true'
    OR EXISTS (
      SELECT 1 FROM "Project" p
      WHERE p."id" = "SiteExpense"."projectId"
        AND p."organizationId" = NULLIF(current_setting('app.organization_id', true), '')::text
    )
  )
  WITH CHECK (
    current_setting('app.is_superadmin', true) = 'true'
    OR EXISTS (
      SELECT 1 FROM "Project" p
      WHERE p."id" = "SiteExpense"."projectId"
        AND p."organizationId" = NULLIF(current_setting('app.organization_id', true), '')::text
    )
  );

-- ── ProjectCost — Project cost ledger (project-cost/dashboard/finance) ──
ALTER TABLE "ProjectCost" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ProjectCost" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "project_cost_project_org_isolation" ON "ProjectCost";
CREATE POLICY "project_cost_project_org_isolation" ON "ProjectCost"
  FOR ALL
  USING (
    current_setting('app.is_superadmin', true) = 'true'
    OR EXISTS (
      SELECT 1 FROM "Project" p
      WHERE p."id" = "ProjectCost"."projectId"
        AND p."organizationId" = NULLIF(current_setting('app.organization_id', true), '')::text
    )
  )
  WITH CHECK (
    current_setting('app.is_superadmin', true) = 'true'
    OR EXISTS (
      SELECT 1 FROM "Project" p
      WHERE p."id" = "ProjectCost"."projectId"
        AND p."organizationId" = NULLIF(current_setting('app.organization_id', true), '')::text
    )
  );

-- ── VatBill — VAT bills (vat-register/material-transaction) ──
ALTER TABLE "VatBill" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "VatBill" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "vat_bill_project_org_isolation" ON "VatBill";
CREATE POLICY "vat_bill_project_org_isolation" ON "VatBill"
  FOR ALL
  USING (
    current_setting('app.is_superadmin', true) = 'true'
    OR EXISTS (
      SELECT 1 FROM "Project" p
      WHERE p."id" = "VatBill"."projectId"
        AND p."organizationId" = NULLIF(current_setting('app.organization_id', true), '')::text
    )
  )
  WITH CHECK (
    current_setting('app.is_superadmin', true) = 'true'
    OR EXISTS (
      SELECT 1 FROM "Project" p
      WHERE p."id" = "VatBill"."projectId"
        AND p."organizationId" = NULLIF(current_setting('app.organization_id', true), '')::text
    )
  );

-- ── MaterialTransaction — Material transactions — highest-volume table; lab EXPLAIN ANALYZE shows the policy predicate is evaluated via a one-time hashed subplan on Project (no per-row scans) ──
ALTER TABLE "MaterialTransaction" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "MaterialTransaction" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "material_transaction_project_org_isolation" ON "MaterialTransaction";
CREATE POLICY "material_transaction_project_org_isolation" ON "MaterialTransaction"
  FOR ALL
  USING (
    current_setting('app.is_superadmin', true) = 'true'
    OR EXISTS (
      SELECT 1 FROM "Project" p
      WHERE p."id" = "MaterialTransaction"."projectId"
        AND p."organizationId" = NULLIF(current_setting('app.organization_id', true), '')::text
    )
  )
  WITH CHECK (
    current_setting('app.is_superadmin', true) = 'true'
    OR EXISTS (
      SELECT 1 FROM "Project" p
      WHERE p."id" = "MaterialTransaction"."projectId"
        AND p."organizationId" = NULLIF(current_setting('app.organization_id', true), '')::text
    )
  );

-- ── PurchaseOrder — Purchase orders (purchase-order/requisition) ──
ALTER TABLE "PurchaseOrder" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PurchaseOrder" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "purchase_order_project_org_isolation" ON "PurchaseOrder";
CREATE POLICY "purchase_order_project_org_isolation" ON "PurchaseOrder"
  FOR ALL
  USING (
    current_setting('app.is_superadmin', true) = 'true'
    OR EXISTS (
      SELECT 1 FROM "Project" p
      WHERE p."id" = "PurchaseOrder"."projectId"
        AND p."organizationId" = NULLIF(current_setting('app.organization_id', true), '')::text
    )
  )
  WITH CHECK (
    current_setting('app.is_superadmin', true) = 'true'
    OR EXISTS (
      SELECT 1 FROM "Project" p
      WHERE p."id" = "PurchaseOrder"."projectId"
        AND p."organizationId" = NULLIF(current_setting('app.organization_id', true), '')::text
    )
  );

-- ── PurchaseRequisition — Purchase requisitions (requisition) ──
ALTER TABLE "PurchaseRequisition" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PurchaseRequisition" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "purchase_requisition_project_org_isolation" ON "PurchaseRequisition";
CREATE POLICY "purchase_requisition_project_org_isolation" ON "PurchaseRequisition"
  FOR ALL
  USING (
    current_setting('app.is_superadmin', true) = 'true'
    OR EXISTS (
      SELECT 1 FROM "Project" p
      WHERE p."id" = "PurchaseRequisition"."projectId"
        AND p."organizationId" = NULLIF(current_setting('app.organization_id', true), '')::text
    )
  )
  WITH CHECK (
    current_setting('app.is_superadmin', true) = 'true'
    OR EXISTS (
      SELECT 1 FROM "Project" p
      WHERE p."id" = "PurchaseRequisition"."projectId"
        AND p."organizationId" = NULLIF(current_setting('app.organization_id', true), '')::text
    )
  );

-- ═══════════════════════════════════════════════════════════════
-- ROLLBACK (run manually if the 48 h watch window goes wrong)
--
-- Per §3.2 table (Payment shown; repeat for VendorBill, VendorPayment,
-- PayrollRun, Ipc, SubcontractorBill, SiteExpense, ProjectCost,
-- VatBill, MaterialTransaction, PurchaseOrder, PurchaseRequisition):
--
--   DROP POLICY IF EXISTS "payment_project_org_isolation" ON "Payment";
--   ALTER TABLE "Payment" NO FORCE ROW LEVEL SECURITY;
--   ALTER TABLE "Payment" DISABLE ROW LEVEL SECURITY;
--
-- JournalEntryLine:
--   DROP POLICY IF EXISTS "journal_entry_line_isolation" ON "JournalEntryLine";
--   ALTER TABLE "JournalEntryLine" NO FORCE ROW LEVEL SECURITY;
--   ALTER TABLE "JournalEntryLine" DISABLE ROW LEVEL SECURITY;
--
-- JournalEntry — restore the phase-1 policy set from
-- 20260830010000_rls_phase1_org_money/migration.sql (the SELECT and
-- UPDATE policies with the lines→project EXISTS branches). The
-- backfilled organizationId values are harmless to keep either way:
-- the phase-1 SELECT policy ORs org-match with the lines→project
-- reach, so both old and new visibility are covered.
-- ═══════════════════════════════════════════════════════════════
