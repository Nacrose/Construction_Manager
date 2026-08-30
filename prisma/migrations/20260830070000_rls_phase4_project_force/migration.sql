-- ═══════════════════════════════════════════════════════════════
-- RLS Rollout — Phase 4a: FORCE RLS on Project + retire the legacy
-- NULL-org policies (docs/plans/rls-rollout.md §4 Phase 4, gap G-1/G-3)
--
-- What changes and why:
--   1. FORCE ROW LEVEL SECURITY on "Project" — gap G-1: policies do
--      not bind the table owner, and Prisma connects as the owner, so
--      until now the Project policies were defense-in-depth for
--      non-owner roles only. FORCE makes them bind Prisma too.
--   2. The legacy "organizationId IS NULL" branches (gap G-3) are
--      RETIRED: every org-scoped table would otherwise be cross-org
--      readable through a NULL-org project. Retirement is safe only
--      once no NULL-org projects remain → backfill + loud guard.
--   3. Backfill: a NULL-org project inherits the organization of its
--      creator (createdById → User.organizationId). If any NULL-org
--      project remains after the backfill (creator missing, or the
--      creator has no org), the migration FAILS with a count — those
--      rows need a manual org assignment before migrating. Do not
--      silence the guard: a NULL-org project is a cross-tenant hole.
--   4. New per-command policies in the §3.1 shape (superadmin OR
--      org-match) — including the superadmin branch on
--      INSERT/UPDATE/DELETE, which the baseline policies lacked.
--
-- Sequencing (same lessons as phase 3m, lab-proven):
--   tx-local superadmin GUC FIRST (the old policies read it), then
--   backfill, then swap policies, then FORCE.
--
-- Verified in the phase3-abc lab (docs/rls-evidence/): after this
-- migration, org users see only their org's projects, NULL-org
-- projects are superadmin-only, §3.2 policy subqueries on Project
-- stay correct for owner and non-owner roles, and superadmin
-- bypasses everywhere.
--
-- Prisma runs this file inside a single transaction — the is_local
-- GUC reverts at COMMIT.
-- ═══════════════════════════════════════════════════════════════

-- Step 1: superadmin context for the maintenance backfill (old
-- policies are still in place and read this GUC).
SELECT set_config('app.is_superadmin', 'true', true);

-- Step 2: backfill NULL-org projects from their creator's org.
UPDATE "Project" p
SET "organizationId" = (
  SELECT u."organizationId"
  FROM "User" u
  WHERE u."id" = p."createdById"
    AND u."organizationId" IS NOT NULL
)
WHERE p."organizationId" IS NULL;

-- Step 3: loud guard — no NULL-org project may survive the backfill.
DO $$
DECLARE remaining int;
BEGIN
  SELECT count(*) INTO remaining FROM "Project" WHERE "organizationId" IS NULL;
  IF remaining > 0 THEN
    RAISE EXCEPTION 'RLS phase-4: % projects still have organizationId NULL after the creator backfill (creator missing or org-less). Assign organizations to these projects manually, then re-run. A NULL-org project is a cross-tenant hole — the legacy IS NULL visibility is being retired by this migration.', remaining;
  END IF;
END $$;

-- Step 4: retire the legacy policies, install §3.1-shape policies.
DROP POLICY IF EXISTS "project_org_isolation" ON "Project";
DROP POLICY IF EXISTS "project_insert_org_check" ON "Project";
DROP POLICY IF EXISTS "project_update_org_check" ON "Project";
DROP POLICY IF EXISTS "project_delete_org_check" ON "Project";

CREATE POLICY "project_org_isolation" ON "Project"
  FOR SELECT
  USING (
    current_setting('app.is_superadmin', true) = 'true'
    OR "organizationId" = NULLIF(current_setting('app.organization_id', true), '')::text
  );

CREATE POLICY "project_insert_org_check" ON "Project"
  FOR INSERT
  WITH CHECK (
    current_setting('app.is_superadmin', true) = 'true'
    OR "organizationId" = NULLIF(current_setting('app.organization_id', true), '')::text
  );

CREATE POLICY "project_update_org_check" ON "Project"
  FOR UPDATE
  USING (
    current_setting('app.is_superadmin', true) = 'true'
    OR "organizationId" = NULLIF(current_setting('app.organization_id', true), '')::text
  )
  WITH CHECK (
    current_setting('app.is_superadmin', true) = 'true'
    OR "organizationId" = NULLIF(current_setting('app.organization_id', true), '')::text
  );

CREATE POLICY "project_delete_org_check" ON "Project"
  FOR DELETE
  USING (
    current_setting('app.is_superadmin', true) = 'true'
    OR "organizationId" = NULLIF(current_setting('app.organization_id', true), '')::text
  );

-- Step 5: FORCE — the policies now bind the table owner (Prisma).
ALTER TABLE "Project" FORCE ROW LEVEL SECURITY;

-- ── ROLLBACK ──
-- Restore the baseline policy set from
-- 20260830000000_rls_baseline_project/migration.sql (the IS NULL
-- branches) and run:
--   ALTER TABLE "Project" NO FORCE ROW LEVEL SECURITY;
-- Backfilled organizationId values are harmless to keep: the legacy
-- SELECT policy ORs org-match with IS NULL, so both old and new rows
-- stay visible.
