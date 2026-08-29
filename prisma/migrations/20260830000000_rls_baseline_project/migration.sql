-- ═══════════════════════════════════════════════════════════════
-- RLS Rollout — Phase 0: bring the EXISTING Project-table RLS under
-- migration control (gap G-5 in docs/plans/rls-rollout.md).
--
-- This is a pure codification of the policies in src/lib/rls.ts (RLS_SQL),
-- which until now were applied manually and would be silently lost on
-- `prisma migrate reset` or a fresh environment. Idempotent SQL, so it
-- is safe whether or not the manual application ever ran.
--
-- Deliberately UNCHANGED semantics (FORCE / dropping the legacy
-- organizationId IS NULL escape is deferred to rollout Phase 4):
--   * no FORCE ROW LEVEL SECURITY — policies do not bind the table owner
--     (the role Prisma typically connects as), so day-one behavior is
--     identical to before this migration.
--   * the IS NULL legacy escape stays until the Phase-0 backfill audit
--     (scripts/rls-inventory.ts) confirms zero NULL-org rows.
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE "Project" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "project_org_isolation" ON "Project";
DROP POLICY IF EXISTS "project_insert_org_check" ON "Project";
DROP POLICY IF EXISTS "project_update_org_check" ON "Project";
DROP POLICY IF EXISTS "project_delete_org_check" ON "Project";

CREATE POLICY "project_org_isolation" ON "Project"
  FOR SELECT
  USING (
    current_setting('app.is_superadmin', true) = 'true'
    OR "organizationId" IS NULL
    OR "organizationId" = NULLIF(current_setting('app.organization_id', true), '')::text
  );

CREATE POLICY "project_insert_org_check" ON "Project"
  FOR INSERT
  WITH CHECK (
    "organizationId" IS NULL
    OR "organizationId" = NULLIF(current_setting('app.organization_id', true), '')::text
  );

CREATE POLICY "project_update_org_check" ON "Project"
  FOR UPDATE
  USING (
    "organizationId" IS NULL
    OR "organizationId" = NULLIF(current_setting('app.organization_id', true), '')::text
  )
  WITH CHECK (
    "organizationId" IS NULL
    OR "organizationId" = NULLIF(current_setting('app.organization_id', true), '')::text
  );

CREATE POLICY "project_delete_org_check" ON "Project"
  FOR DELETE
  USING (
    "organizationId" IS NULL
    OR "organizationId" = NULLIF(current_setting('app.organization_id', true), '')::text
  );
