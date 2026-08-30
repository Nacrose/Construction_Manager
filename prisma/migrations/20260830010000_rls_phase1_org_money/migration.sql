-- ═══════════════════════════════════════════════════════════════
-- RLS Rollout — Phase 1: org-scoped money/lock tables
-- (docs/plans/rls-rollout.md §4 Phase 1, template §3.1)
--
-- Tables: JournalEntry, HeadOfficeExpense, CompanyBankAccount,
--         FiscalYearLock, BankGuarantee
--
-- FORCE ROW LEVEL SECURITY is included per template §3.1 — it is what
-- makes the policies bind the connection role Prisma uses (without it
-- the table owner bypasses RLS entirely, gap G-1). Org context comes
-- from setOrgContext (session-level, per request) and withOrgContext
-- (transaction-level) — see src/lib/rls.ts. Missing context fails
-- CLOSED (0 rows): the intended defense-in-depth direction.
--
-- Policy predicates mirror the app-layer reads exactly:
--   * strictly-org tables (org column NOT NULL) get the plain §3.1
--     FOR ALL policy: superadmin OR organizationId = app org.
--   * JournalEntry (nullable org) is visible EITHER via its own
--     organizationId (org-level entries) OR via any line linked to a
--     project of the caller's org (financial-reporting.ts
--     accessCondition). journal-entry.ts creates entries with
--     organizationId NULL when the caller passes none, so INSERT
--     tolerates NULL org — the row is still never cross-org visible
--     because SELECT only reaches it through its lines' projects.
--   * BankGuarantee (nullable org) lists OR { organizationId },
--     { project.organizationId } (bank-guarantee.ts) → project-EXISTS
--     predicate alongside the org match.
--
-- Rollback (instant — policy metadata only, no table rewrite):
--   per table: DROP POLICY …; ALTER TABLE … NO FORCE ROW LEVEL SECURITY;
--   ALTER TABLE … DISABLE ROW LEVEL SECURITY;  (full SQL in each block)
-- ═══════════════════════════════════════════════════════════════

-- ── HeadOfficeExpense (organizationId NOT NULL) — plain §3.1 ──
ALTER TABLE "HeadOfficeExpense" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "HeadOfficeExpense" FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "head_office_expense_org_isolation" ON "HeadOfficeExpense";
CREATE POLICY "head_office_expense_org_isolation" ON "HeadOfficeExpense"
  FOR ALL
  USING (
    current_setting('app.is_superadmin', true) = 'true'
    OR "organizationId" = NULLIF(current_setting('app.organization_id', true), '')::text
  )
  WITH CHECK (
    current_setting('app.is_superadmin', true) = 'true'
    OR "organizationId" = NULLIF(current_setting('app.organization_id', true), '')::text
  );
-- rollback:
--   DROP POLICY IF EXISTS "head_office_expense_org_isolation" ON "HeadOfficeExpense";
--   ALTER TABLE "HeadOfficeExpense" NO FORCE ROW LEVEL SECURITY;
--   ALTER TABLE "HeadOfficeExpense" DISABLE ROW LEVEL SECURITY;

-- ── CompanyBankAccount (organizationId NOT NULL) — plain §3.1 ──
ALTER TABLE "CompanyBankAccount" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CompanyBankAccount" FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "company_bank_account_org_isolation" ON "CompanyBankAccount";
CREATE POLICY "company_bank_account_org_isolation" ON "CompanyBankAccount"
  FOR ALL
  USING (
    current_setting('app.is_superadmin', true) = 'true'
    OR "organizationId" = NULLIF(current_setting('app.organization_id', true), '')::text
  )
  WITH CHECK (
    current_setting('app.is_superadmin', true) = 'true'
    OR "organizationId" = NULLIF(current_setting('app.organization_id', true), '')::text
  );
-- rollback:
--   DROP POLICY IF EXISTS "company_bank_account_org_isolation" ON "CompanyBankAccount";
--   ALTER TABLE "CompanyBankAccount" NO FORCE ROW LEVEL SECURITY;
--   ALTER TABLE "CompanyBankAccount" DISABLE ROW LEVEL SECURITY;

-- ── FiscalYearLock (organizationId NOT NULL) — plain §3.1 ──
ALTER TABLE "FiscalYearLock" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "FiscalYearLock" FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "fiscal_year_lock_org_isolation" ON "FiscalYearLock";
CREATE POLICY "fiscal_year_lock_org_isolation" ON "FiscalYearLock"
  FOR ALL
  USING (
    current_setting('app.is_superadmin', true) = 'true'
    OR "organizationId" = NULLIF(current_setting('app.organization_id', true), '')::text
  )
  WITH CHECK (
    current_setting('app.is_superadmin', true) = 'true'
    OR "organizationId" = NULLIF(current_setting('app.organization_id', true), '')::text
  );
-- rollback:
--   DROP POLICY IF EXISTS "fiscal_year_lock_org_isolation" ON "FiscalYearLock";
--   ALTER TABLE "FiscalYearLock" NO FORCE ROW LEVEL SECURITY;
--   ALTER TABLE "FiscalYearLock" DISABLE ROW LEVEL SECURITY;

-- ── JournalEntry (organizationId NULLABLE) — org match OR lines→project→org ──
-- Read path (financial-reporting.ts): org-level entries via
-- organizationId = org; project-linked entries via any line whose
-- project belongs to the org. Legacy/NULL-org entries WITHOUT org
-- lines fail closed (invisible) — matches the app accessCondition.
ALTER TABLE "JournalEntry" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "JournalEntry" FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "journal_entry_org_isolation" ON "JournalEntry";
CREATE POLICY "journal_entry_org_isolation" ON "JournalEntry"
  FOR SELECT
  USING (
    current_setting('app.is_superadmin', true) = 'true'
    OR "organizationId" = NULLIF(current_setting('app.organization_id', true), '')::text
    OR EXISTS (
      SELECT 1
      FROM "JournalEntryLine" jel
      JOIN "Project" p ON p."id" = jel."projectId"
      WHERE jel."journalEntryId" = "JournalEntry"."id"
        AND p."organizationId" = NULLIF(current_setting('app.organization_id', true), '')::text
    )
  );

DROP POLICY IF EXISTS "journal_entry_insert_org_check" ON "JournalEntry";
CREATE POLICY "journal_entry_insert_org_check" ON "JournalEntry"
  FOR INSERT
  WITH CHECK (
    current_setting('app.is_superadmin', true) = 'true'
    OR "organizationId" = NULLIF(current_setting('app.organization_id', true), '')::text
    OR "organizationId" IS NULL  -- journal-entry.ts tolerates org-less project-linked entries
  );

DROP POLICY IF EXISTS "journal_entry_update_org_check" ON "JournalEntry";
CREATE POLICY "journal_entry_update_org_check" ON "JournalEntry"
  FOR UPDATE
  USING (
    current_setting('app.is_superadmin', true) = 'true'
    OR "organizationId" = NULLIF(current_setting('app.organization_id', true), '')::text
    OR EXISTS (
      SELECT 1
      FROM "JournalEntryLine" jel
      JOIN "Project" p ON p."id" = jel."projectId"
      WHERE jel."journalEntryId" = "JournalEntry"."id"
        AND p."organizationId" = NULLIF(current_setting('app.organization_id', true), '')::text
    )
  )
  WITH CHECK (
    current_setting('app.is_superadmin', true) = 'true'
    OR "organizationId" = NULLIF(current_setting('app.organization_id', true), '')::text
    OR "organizationId" IS NULL
    OR EXISTS (
      SELECT 1
      FROM "JournalEntryLine" jel
      JOIN "Project" p ON p."id" = jel."projectId"
      WHERE jel."journalEntryId" = "JournalEntry"."id"
        AND p."organizationId" = NULLIF(current_setting('app.organization_id', true), '')::text
    )
  );

DROP POLICY IF EXISTS "journal_entry_delete_org_check" ON "JournalEntry";
CREATE POLICY "journal_entry_delete_org_check" ON "JournalEntry"
  FOR DELETE
  USING (
    current_setting('app.is_superadmin', true) = 'true'
    OR "organizationId" = NULLIF(current_setting('app.organization_id', true), '')::text
    OR EXISTS (
      SELECT 1
      FROM "JournalEntryLine" jel
      JOIN "Project" p ON p."id" = jel."projectId"
      WHERE jel."journalEntryId" = "JournalEntry"."id"
        AND p."organizationId" = NULLIF(current_setting('app.organization_id', true), '')::text
    )
  );
-- rollback:
--   DROP POLICY IF EXISTS "journal_entry_org_isolation" ON "JournalEntry";
--   DROP POLICY IF EXISTS "journal_entry_insert_org_check" ON "JournalEntry";
--   DROP POLICY IF EXISTS "journal_entry_update_org_check" ON "JournalEntry";
--   DROP POLICY IF EXISTS "journal_entry_delete_org_check" ON "JournalEntry";
--   ALTER TABLE "JournalEntry" NO FORCE ROW LEVEL SECURITY;
--   ALTER TABLE "JournalEntry" DISABLE ROW LEVEL SECURITY;

-- ── BankGuarantee (organizationId NULLABLE) — org match OR project→org ──
-- Read path (bank-guarantee.ts): OR { organizationId = org },
-- { project.organizationId = org }. Creation always resolves an org
-- (router line 262), but legacy/pre-award rows may carry NULL org with
-- a project link — those stay reachable through the project branch.
ALTER TABLE "BankGuarantee" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "BankGuarantee" FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "bank_guarantee_org_isolation" ON "BankGuarantee";
CREATE POLICY "bank_guarantee_org_isolation" ON "BankGuarantee"
  FOR SELECT
  USING (
    current_setting('app.is_superadmin', true) = 'true'
    OR "organizationId" = NULLIF(current_setting('app.organization_id', true), '')::text
    OR EXISTS (
      SELECT 1 FROM "Project" p
      WHERE p."id" = "BankGuarantee"."projectId"
        AND p."organizationId" = NULLIF(current_setting('app.organization_id', true), '')::text
    )
  );

DROP POLICY IF EXISTS "bank_guarantee_insert_org_check" ON "BankGuarantee";
CREATE POLICY "bank_guarantee_insert_org_check" ON "BankGuarantee"
  FOR INSERT
  WITH CHECK (
    current_setting('app.is_superadmin', true) = 'true'
    OR "organizationId" = NULLIF(current_setting('app.organization_id', true), '')::text
    OR EXISTS (
      SELECT 1 FROM "Project" p
      WHERE p."id" = "BankGuarantee"."projectId"
        AND p."organizationId" = NULLIF(current_setting('app.organization_id', true), '')::text
    )
  );

DROP POLICY IF EXISTS "bank_guarantee_update_org_check" ON "BankGuarantee";
CREATE POLICY "bank_guarantee_update_org_check" ON "BankGuarantee"
  FOR UPDATE
  USING (
    current_setting('app.is_superadmin', true) = 'true'
    OR "organizationId" = NULLIF(current_setting('app.organization_id', true), '')::text
    OR EXISTS (
      SELECT 1 FROM "Project" p
      WHERE p."id" = "BankGuarantee"."projectId"
        AND p."organizationId" = NULLIF(current_setting('app.organization_id', true), '')::text
    )
  )
  WITH CHECK (
    current_setting('app.is_superadmin', true) = 'true'
    OR "organizationId" = NULLIF(current_setting('app.organization_id', true), '')::text
    OR EXISTS (
      SELECT 1 FROM "Project" p
      WHERE p."id" = "BankGuarantee"."projectId"
        AND p."organizationId" = NULLIF(current_setting('app.organization_id', true), '')::text
    )
  );

DROP POLICY IF EXISTS "bank_guarantee_delete_org_check" ON "BankGuarantee";
CREATE POLICY "bank_guarantee_delete_org_check" ON "BankGuarantee"
  FOR DELETE
  USING (
    current_setting('app.is_superadmin', true) = 'true'
    OR "organizationId" = NULLIF(current_setting('app.organization_id', true), '')::text
    OR EXISTS (
      SELECT 1 FROM "Project" p
      WHERE p."id" = "BankGuarantee"."projectId"
        AND p."organizationId" = NULLIF(current_setting('app.organization_id', true), '')::text
    )
  );
-- rollback:
--   DROP POLICY IF EXISTS "bank_guarantee_org_isolation" ON "BankGuarantee";
--   DROP POLICY IF EXISTS "bank_guarantee_insert_org_check" ON "BankGuarantee";
--   DROP POLICY IF EXISTS "bank_guarantee_update_org_check" ON "BankGuarantee";
--   DROP POLICY IF EXISTS "bank_guarantee_delete_org_check" ON "BankGuarantee";
--   ALTER TABLE "BankGuarantee" NO FORCE ROW LEVEL SECURITY;
--   ALTER TABLE "BankGuarantee" DISABLE ROW LEVEL SECURITY;
