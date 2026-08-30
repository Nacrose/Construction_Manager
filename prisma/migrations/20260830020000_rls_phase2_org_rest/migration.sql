-- ═══════════════════════════════════════════════════════════════
-- RLS Rollout — Phase 2: remaining org-scoped tables
-- (docs/plans/rls-rollout.md §4 Phase 2, template §3.1 adapted)
--
-- Tables: CatalogMaterial, DelegationRule, GanttTaskTemplate,
--         GlobalPresetAnalysis, RateBook, RateProfile, ReportSnapshot,
--         ReportTemplate, StoredFile, UncatalogedMaterial
--
-- Three policy shapes are used, each mirroring the app-layer reads:
--
--   A. STRICT ORG (org column NOT NULL, no global rows):
--      DelegationRule, StoredFile
--      → plain §3.1: superadmin OR organizationId = app org.
--
--   B. GLOBAL-REFERENCE (organizationId NULL = intentionally shared
--      platform data): CatalogMaterial, GlobalPresetAnalysis,
--      UncatalogedMaterial, ReportTemplate (scope='global' rows).
--      App reads merge global + org rows (e.g. catalog-v2.ts
--      where.OR.push({ organizationId: null })); app writes to global
--      rows are superadmin-gated (uncataloged-material.ts:223/292,
--      global-preset.ts:522). RLS therefore:
--        SELECT   : superadmin OR org match OR global row
--        INSERT   : superadmin OR org match (global writes = superadmin)
--        UPDATE/DELETE : superadmin OR org match (global rows are
--                        superadmin-only, matching the app guards)
--
--   C. PROJECT-REACHABLE (rows may carry NULL org but belong to a
--      project of the org — read AND written via projectId):
--      GanttTaskTemplate (created with organizationId =
--      project.organizationId || null), RateProfile (created with
--      projectId only, organizationId always NULL), ReportSnapshot
--      (organizationId = user org ?? null, projectId optional),
--      RateBook (scope global/org/project).
--      → superadmin OR org match OR EXISTS(project of caller's org).
--      The project-EXISTS branch must be in WITH CHECK too, or
--      legitimate inserts of NULL-org project rows would fail.
--
-- Note on EXISTS subqueries: "Project" has RLS ENABLED but not
-- FORCE, so the subquery is evaluated with the invoking role's
-- privileges — the table owner bypasses Project's policies and sees
-- every project (verified behavior for the Prisma connection role).
-- When Phase 4 FORCEs Project, these subqueries keep returning
-- correct results (only org-visible projects match anyway).
--
-- Rollback: per-table DROP POLICY + NO FORCE + DISABLE (in comments).
-- ═══════════════════════════════════════════════════════════════

-- ── DelegationRule (organizationId NOT NULL) — shape A ──
ALTER TABLE "DelegationRule" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DelegationRule" FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "delegation_rule_org_isolation" ON "DelegationRule";
CREATE POLICY "delegation_rule_org_isolation" ON "DelegationRule"
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
--   DROP POLICY IF EXISTS "delegation_rule_org_isolation" ON "DelegationRule";
--   ALTER TABLE "DelegationRule" NO FORCE ROW LEVEL SECURITY;
--   ALTER TABLE "DelegationRule" DISABLE ROW LEVEL SECURITY;

-- ── StoredFile (organizationId NOT NULL) — shape A ──
ALTER TABLE "StoredFile" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "StoredFile" FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "stored_file_org_isolation" ON "StoredFile";
CREATE POLICY "stored_file_org_isolation" ON "StoredFile"
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
--   DROP POLICY IF EXISTS "stored_file_org_isolation" ON "StoredFile";
--   ALTER TABLE "StoredFile" NO FORCE ROW LEVEL SECURITY;
--   ALTER TABLE "StoredFile" DISABLE ROW LEVEL SECURITY;

-- ── CatalogMaterial (NULL org = global catalog) — shape B ──
ALTER TABLE "CatalogMaterial" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CatalogMaterial" FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "catalog_material_org_isolation" ON "CatalogMaterial";
CREATE POLICY "catalog_material_org_isolation" ON "CatalogMaterial"
  FOR SELECT
  USING (
    current_setting('app.is_superadmin', true) = 'true'
    OR "organizationId" IS NULL
    OR "organizationId" = NULLIF(current_setting('app.organization_id', true), '')::text
  );

DROP POLICY IF EXISTS "catalog_material_insert_org_check" ON "CatalogMaterial";
CREATE POLICY "catalog_material_insert_org_check" ON "CatalogMaterial"
  FOR INSERT
  WITH CHECK (
    current_setting('app.is_superadmin', true) = 'true'
    OR "organizationId" = NULLIF(current_setting('app.organization_id', true), '')::text
  );

DROP POLICY IF EXISTS "catalog_material_update_org_check" ON "CatalogMaterial";
CREATE POLICY "catalog_material_update_org_check" ON "CatalogMaterial"
  FOR UPDATE
  USING (
    current_setting('app.is_superadmin', true) = 'true'
    OR "organizationId" = NULLIF(current_setting('app.organization_id', true), '')::text
  )
  WITH CHECK (
    current_setting('app.is_superadmin', true) = 'true'
    OR "organizationId" = NULLIF(current_setting('app.organization_id', true), '')::text
  );

DROP POLICY IF EXISTS "catalog_material_delete_org_check" ON "CatalogMaterial";
CREATE POLICY "catalog_material_delete_org_check" ON "CatalogMaterial"
  FOR DELETE
  USING (
    current_setting('app.is_superadmin', true) = 'true'
    OR "organizationId" = NULLIF(current_setting('app.organization_id', true), '')::text
  );
-- rollback:
--   DROP POLICY IF EXISTS "catalog_material_org_isolation" ON "CatalogMaterial";
--   DROP POLICY IF EXISTS "catalog_material_insert_org_check" ON "CatalogMaterial";
--   DROP POLICY IF EXISTS "catalog_material_update_org_check" ON "CatalogMaterial";
--   DROP POLICY IF EXISTS "catalog_material_delete_org_check" ON "CatalogMaterial";
--   ALTER TABLE "CatalogMaterial" NO FORCE ROW LEVEL SECURITY;
--   ALTER TABLE "CatalogMaterial" DISABLE ROW LEVEL SECURITY;

-- ── GlobalPresetAnalysis (NULL org = global preset) — shape B ──
ALTER TABLE "GlobalPresetAnalysis" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "GlobalPresetAnalysis" FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "global_preset_analysis_org_isolation" ON "GlobalPresetAnalysis";
CREATE POLICY "global_preset_analysis_org_isolation" ON "GlobalPresetAnalysis"
  FOR SELECT
  USING (
    current_setting('app.is_superadmin', true) = 'true'
    OR "organizationId" IS NULL
    OR "organizationId" = NULLIF(current_setting('app.organization_id', true), '')::text
  );

DROP POLICY IF EXISTS "global_preset_analysis_insert_org_check" ON "GlobalPresetAnalysis";
CREATE POLICY "global_preset_analysis_insert_org_check" ON "GlobalPresetAnalysis"
  FOR INSERT
  WITH CHECK (
    current_setting('app.is_superadmin', true) = 'true'
    OR "organizationId" = NULLIF(current_setting('app.organization_id', true), '')::text
  );

DROP POLICY IF EXISTS "global_preset_analysis_update_org_check" ON "GlobalPresetAnalysis";
CREATE POLICY "global_preset_analysis_update_org_check" ON "GlobalPresetAnalysis"
  FOR UPDATE
  USING (
    current_setting('app.is_superadmin', true) = 'true'
    OR "organizationId" = NULLIF(current_setting('app.organization_id', true), '')::text
  )
  WITH CHECK (
    current_setting('app.is_superadmin', true) = 'true'
    OR "organizationId" = NULLIF(current_setting('app.organization_id', true), '')::text
  );

DROP POLICY IF EXISTS "global_preset_analysis_delete_org_check" ON "GlobalPresetAnalysis";
CREATE POLICY "global_preset_analysis_delete_org_check" ON "GlobalPresetAnalysis"
  FOR DELETE
  USING (
    current_setting('app.is_superadmin', true) = 'true'
    OR "organizationId" = NULLIF(current_setting('app.organization_id', true), '')::text
  );
-- rollback:
--   DROP POLICY IF EXISTS "global_preset_analysis_org_isolation" ON "GlobalPresetAnalysis";
--   DROP POLICY IF EXISTS "global_preset_analysis_insert_org_check" ON "GlobalPresetAnalysis";
--   DROP POLICY IF EXISTS "global_preset_analysis_update_org_check" ON "GlobalPresetAnalysis";
--   DROP POLICY IF EXISTS "global_preset_analysis_delete_org_check" ON "GlobalPresetAnalysis";
--   ALTER TABLE "GlobalPresetAnalysis" NO FORCE ROW LEVEL SECURITY;
--   ALTER TABLE "GlobalPresetAnalysis" DISABLE ROW LEVEL SECURITY;

-- ── UncatalogedMaterial (NULL org = global level) — shape B ──
ALTER TABLE "UncatalogedMaterial" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "UncatalogedMaterial" FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "uncataloged_material_org_isolation" ON "UncatalogedMaterial";
CREATE POLICY "uncataloged_material_org_isolation" ON "UncatalogedMaterial"
  FOR SELECT
  USING (
    current_setting('app.is_superadmin', true) = 'true'
    OR "organizationId" IS NULL
    OR "organizationId" = NULLIF(current_setting('app.organization_id', true), '')::text
  );

DROP POLICY IF EXISTS "uncataloged_material_insert_org_check" ON "UncatalogedMaterial";
CREATE POLICY "uncataloged_material_insert_org_check" ON "UncatalogedMaterial"
  FOR INSERT
  WITH CHECK (
    current_setting('app.is_superadmin', true) = 'true'
    OR "organizationId" = NULLIF(current_setting('app.organization_id', true), '')::text
  );

DROP POLICY IF EXISTS "uncataloged_material_update_org_check" ON "UncatalogedMaterial";
CREATE POLICY "uncataloged_material_update_org_check" ON "UncatalogedMaterial"
  FOR UPDATE
  USING (
    current_setting('app.is_superadmin', true) = 'true'
    OR "organizationId" = NULLIF(current_setting('app.organization_id', true), '')::text
  )
  WITH CHECK (
    current_setting('app.is_superadmin', true) = 'true'
    OR "organizationId" = NULLIF(current_setting('app.organization_id', true), '')::text
  );

DROP POLICY IF EXISTS "uncataloged_material_delete_org_check" ON "UncatalogedMaterial";
CREATE POLICY "uncataloged_material_delete_org_check" ON "UncatalogedMaterial"
  FOR DELETE
  USING (
    current_setting('app.is_superadmin', true) = 'true'
    OR "organizationId" = NULLIF(current_setting('app.organization_id', true), '')::text
  );
-- rollback:
--   DROP POLICY IF EXISTS "uncataloged_material_org_isolation" ON "UncatalogedMaterial";
--   DROP POLICY IF EXISTS "uncataloged_material_insert_org_check" ON "UncatalogedMaterial";
--   DROP POLICY IF EXISTS "uncataloged_material_update_org_check" ON "UncatalogedMaterial";
--   DROP POLICY IF EXISTS "uncataloged_material_delete_org_check" ON "UncatalogedMaterial";
--   ALTER TABLE "UncatalogedMaterial" NO FORCE ROW LEVEL SECURITY;
--   ALTER TABLE "UncatalogedMaterial" DISABLE ROW LEVEL SECURITY;

-- ── ReportTemplate (scope='global' rows shared platform-wide) — shape B ──
-- Every template row carries the creator's organizationId (report-
-- template.ts:125), so org templates match directly; only scope
-- 'global' rows are shared across orgs.
ALTER TABLE "ReportTemplate" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ReportTemplate" FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "report_template_org_isolation" ON "ReportTemplate";
CREATE POLICY "report_template_org_isolation" ON "ReportTemplate"
  FOR SELECT
  USING (
    current_setting('app.is_superadmin', true) = 'true'
    OR "scope" = 'global'
    OR "organizationId" = NULLIF(current_setting('app.organization_id', true), '')::text
  );

DROP POLICY IF EXISTS "report_template_insert_org_check" ON "ReportTemplate";
CREATE POLICY "report_template_insert_org_check" ON "ReportTemplate"
  FOR INSERT
  WITH CHECK (
    current_setting('app.is_superadmin', true) = 'true'
    OR "organizationId" = NULLIF(current_setting('app.organization_id', true), '')::text
  );

DROP POLICY IF EXISTS "report_template_update_org_check" ON "ReportTemplate";
CREATE POLICY "report_template_update_org_check" ON "ReportTemplate"
  FOR UPDATE
  USING (
    current_setting('app.is_superadmin', true) = 'true'
    OR "organizationId" = NULLIF(current_setting('app.organization_id', true), '')::text
  )
  WITH CHECK (
    current_setting('app.is_superadmin', true) = 'true'
    OR "organizationId" = NULLIF(current_setting('app.organization_id', true), '')::text
  );

DROP POLICY IF EXISTS "report_template_delete_org_check" ON "ReportTemplate";
CREATE POLICY "report_template_delete_org_check" ON "ReportTemplate"
  FOR DELETE
  USING (
    current_setting('app.is_superadmin', true) = 'true'
    OR "organizationId" = NULLIF(current_setting('app.organization_id', true), '')::text
  );
-- rollback:
--   DROP POLICY IF EXISTS "report_template_org_isolation" ON "ReportTemplate";
--   DROP POLICY IF EXISTS "report_template_insert_org_check" ON "ReportTemplate";
--   DROP POLICY IF EXISTS "report_template_update_org_check" ON "ReportTemplate";
--   DROP POLICY IF EXISTS "report_template_delete_org_check" ON "ReportTemplate";
--   ALTER TABLE "ReportTemplate" NO FORCE ROW LEVEL SECURITY;
--   ALTER TABLE "ReportTemplate" DISABLE ROW LEVEL SECURITY;

-- ── RateBook → table "RateCatalog" (@@map; scope global/org/project) — shape C (+ global SELECT) ──
ALTER TABLE "RateCatalog" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "RateCatalog" FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "rate_catalog_org_isolation" ON "RateCatalog";
CREATE POLICY "rate_catalog_org_isolation" ON "RateCatalog"
  FOR SELECT
  USING (
    current_setting('app.is_superadmin', true) = 'true'
    OR "organizationId" IS NULL
    OR "organizationId" = NULLIF(current_setting('app.organization_id', true), '')::text
    OR EXISTS (
      SELECT 1 FROM "Project" p
      WHERE p."id" = "RateCatalog"."projectId"
        AND p."organizationId" = NULLIF(current_setting('app.organization_id', true), '')::text
    )
  );

DROP POLICY IF EXISTS "rate_catalog_insert_org_check" ON "RateCatalog";
CREATE POLICY "rate_catalog_insert_org_check" ON "RateCatalog"
  FOR INSERT
  WITH CHECK (
    current_setting('app.is_superadmin', true) = 'true'
    OR "organizationId" = NULLIF(current_setting('app.organization_id', true), '')::text
    OR EXISTS (
      SELECT 1 FROM "Project" p
      WHERE p."id" = "RateCatalog"."projectId"
        AND p."organizationId" = NULLIF(current_setting('app.organization_id', true), '')::text
    )
  );

DROP POLICY IF EXISTS "rate_catalog_update_org_check" ON "RateCatalog";
CREATE POLICY "rate_catalog_update_org_check" ON "RateCatalog"
  FOR UPDATE
  USING (
    current_setting('app.is_superadmin', true) = 'true'
    OR "organizationId" = NULLIF(current_setting('app.organization_id', true), '')::text
    OR EXISTS (
      SELECT 1 FROM "Project" p
      WHERE p."id" = "RateCatalog"."projectId"
        AND p."organizationId" = NULLIF(current_setting('app.organization_id', true), '')::text
    )
  )
  WITH CHECK (
    current_setting('app.is_superadmin', true) = 'true'
    OR "organizationId" = NULLIF(current_setting('app.organization_id', true), '')::text
    OR EXISTS (
      SELECT 1 FROM "Project" p
      WHERE p."id" = "RateCatalog"."projectId"
        AND p."organizationId" = NULLIF(current_setting('app.organization_id', true), '')::text
    )
  );

DROP POLICY IF EXISTS "rate_catalog_delete_org_check" ON "RateCatalog";
CREATE POLICY "rate_catalog_delete_org_check" ON "RateCatalog"
  FOR DELETE
  USING (
    current_setting('app.is_superadmin', true) = 'true'
    OR "organizationId" = NULLIF(current_setting('app.organization_id', true), '')::text
    OR EXISTS (
      SELECT 1 FROM "Project" p
      WHERE p."id" = "RateCatalog"."projectId"
        AND p."organizationId" = NULLIF(current_setting('app.organization_id', true), '')::text
    )
  );
-- rollback:
--   DROP POLICY IF EXISTS "rate_catalog_org_isolation" ON "RateCatalog";
--   DROP POLICY IF EXISTS "rate_catalog_insert_org_check" ON "RateCatalog";
--   DROP POLICY IF EXISTS "rate_catalog_update_org_check" ON "RateCatalog";
--   DROP POLICY IF EXISTS "rate_catalog_delete_org_check" ON "RateCatalog";
--   ALTER TABLE "RateCatalog" NO FORCE ROW LEVEL SECURITY;
--   ALTER TABLE "RateCatalog" DISABLE ROW LEVEL SECURITY;

-- ── RateProfile (organizationId always NULL on create; scoped by project) — shape C ──
ALTER TABLE "RateProfile" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "RateProfile" FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "rate_profile_org_isolation" ON "RateProfile";
CREATE POLICY "rate_profile_org_isolation" ON "RateProfile"
  FOR SELECT
  USING (
    current_setting('app.is_superadmin', true) = 'true'
    OR "organizationId" = NULLIF(current_setting('app.organization_id', true), '')::text
    OR EXISTS (
      SELECT 1 FROM "Project" p
      WHERE p."id" = "RateProfile"."projectId"
        AND p."organizationId" = NULLIF(current_setting('app.organization_id', true), '')::text
    )
  );

DROP POLICY IF EXISTS "rate_profile_insert_org_check" ON "RateProfile";
CREATE POLICY "rate_profile_insert_org_check" ON "RateProfile"
  FOR INSERT
  WITH CHECK (
    current_setting('app.is_superadmin', true) = 'true'
    OR "organizationId" = NULLIF(current_setting('app.organization_id', true), '')::text
    OR EXISTS (
      SELECT 1 FROM "Project" p
      WHERE p."id" = "RateProfile"."projectId"
        AND p."organizationId" = NULLIF(current_setting('app.organization_id', true), '')::text
    )
  );

DROP POLICY IF EXISTS "rate_profile_update_org_check" ON "RateProfile";
CREATE POLICY "rate_profile_update_org_check" ON "RateProfile"
  FOR UPDATE
  USING (
    current_setting('app.is_superadmin', true) = 'true'
    OR "organizationId" = NULLIF(current_setting('app.organization_id', true), '')::text
    OR EXISTS (
      SELECT 1 FROM "Project" p
      WHERE p."id" = "RateProfile"."projectId"
        AND p."organizationId" = NULLIF(current_setting('app.organization_id', true), '')::text
    )
  )
  WITH CHECK (
    current_setting('app.is_superadmin', true) = 'true'
    OR "organizationId" = NULLIF(current_setting('app.organization_id', true), '')::text
    OR EXISTS (
      SELECT 1 FROM "Project" p
      WHERE p."id" = "RateProfile"."projectId"
        AND p."organizationId" = NULLIF(current_setting('app.organization_id', true), '')::text
    )
  );

DROP POLICY IF EXISTS "rate_profile_delete_org_check" ON "RateProfile";
CREATE POLICY "rate_profile_delete_org_check" ON "RateProfile"
  FOR DELETE
  USING (
    current_setting('app.is_superadmin', true) = 'true'
    OR "organizationId" = NULLIF(current_setting('app.organization_id', true), '')::text
    OR EXISTS (
      SELECT 1 FROM "Project" p
      WHERE p."id" = "RateProfile"."projectId"
        AND p."organizationId" = NULLIF(current_setting('app.organization_id', true), '')::text
    )
  );
-- rollback:
--   DROP POLICY IF EXISTS "rate_profile_org_isolation" ON "RateProfile";
--   DROP POLICY IF EXISTS "rate_profile_insert_org_check" ON "RateProfile";
--   DROP POLICY IF EXISTS "rate_profile_update_org_check" ON "RateProfile";
--   DROP POLICY IF EXISTS "rate_profile_delete_org_check" ON "RateProfile";
--   ALTER TABLE "RateProfile" NO FORCE ROW LEVEL SECURITY;
--   ALTER TABLE "RateProfile" DISABLE ROW LEVEL SECURITY;

-- ── ReportSnapshot (org-level rows carry org; project rows may not) — shape C ──
ALTER TABLE "ReportSnapshot" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ReportSnapshot" FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "report_snapshot_org_isolation" ON "ReportSnapshot";
CREATE POLICY "report_snapshot_org_isolation" ON "ReportSnapshot"
  FOR SELECT
  USING (
    current_setting('app.is_superadmin', true) = 'true'
    OR "organizationId" = NULLIF(current_setting('app.organization_id', true), '')::text
    OR EXISTS (
      SELECT 1 FROM "Project" p
      WHERE p."id" = "ReportSnapshot"."projectId"
        AND p."organizationId" = NULLIF(current_setting('app.organization_id', true), '')::text
    )
  );

DROP POLICY IF EXISTS "report_snapshot_insert_org_check" ON "ReportSnapshot";
CREATE POLICY "report_snapshot_insert_org_check" ON "ReportSnapshot"
  FOR INSERT
  WITH CHECK (
    current_setting('app.is_superadmin', true) = 'true'
    OR "organizationId" = NULLIF(current_setting('app.organization_id', true), '')::text
    OR EXISTS (
      SELECT 1 FROM "Project" p
      WHERE p."id" = "ReportSnapshot"."projectId"
        AND p."organizationId" = NULLIF(current_setting('app.organization_id', true), '')::text
    )
  );

DROP POLICY IF EXISTS "report_snapshot_update_org_check" ON "ReportSnapshot";
CREATE POLICY "report_snapshot_update_org_check" ON "ReportSnapshot"
  FOR UPDATE
  USING (
    current_setting('app.is_superadmin', true) = 'true'
    OR "organizationId" = NULLIF(current_setting('app.organization_id', true), '')::text
    OR EXISTS (
      SELECT 1 FROM "Project" p
      WHERE p."id" = "ReportSnapshot"."projectId"
        AND p."organizationId" = NULLIF(current_setting('app.organization_id', true), '')::text
    )
  )
  WITH CHECK (
    current_setting('app.is_superadmin', true) = 'true'
    OR "organizationId" = NULLIF(current_setting('app.organization_id', true), '')::text
    OR EXISTS (
      SELECT 1 FROM "Project" p
      WHERE p."id" = "ReportSnapshot"."projectId"
        AND p."organizationId" = NULLIF(current_setting('app.organization_id', true), '')::text
    )
  );

DROP POLICY IF EXISTS "report_snapshot_delete_org_check" ON "ReportSnapshot";
CREATE POLICY "report_snapshot_delete_org_check" ON "ReportSnapshot"
  FOR DELETE
  USING (
    current_setting('app.is_superadmin', true) = 'true'
    OR "organizationId" = NULLIF(current_setting('app.organization_id', true), '')::text
    OR EXISTS (
      SELECT 1 FROM "Project" p
      WHERE p."id" = "ReportSnapshot"."projectId"
        AND p."organizationId" = NULLIF(current_setting('app.organization_id', true), '')::text
    )
  );
-- rollback:
--   DROP POLICY IF EXISTS "report_snapshot_org_isolation" ON "ReportSnapshot";
--   DROP POLICY IF EXISTS "report_snapshot_insert_org_check" ON "ReportSnapshot";
--   DROP POLICY IF EXISTS "report_snapshot_update_org_check" ON "ReportSnapshot";
--   DROP POLICY IF EXISTS "report_snapshot_delete_org_check" ON "ReportSnapshot";
--   ALTER TABLE "ReportSnapshot" NO FORCE ROW LEVEL SECURITY;
--   ALTER TABLE "ReportSnapshot" DISABLE ROW LEVEL SECURITY;

-- ── GanttTaskTemplate (org = project.org || null at creation) — shape C ──
ALTER TABLE "GanttTaskTemplate" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "GanttTaskTemplate" FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "gantt_task_template_org_isolation" ON "GanttTaskTemplate";
CREATE POLICY "gantt_task_template_org_isolation" ON "GanttTaskTemplate"
  FOR SELECT
  USING (
    current_setting('app.is_superadmin', true) = 'true'
    OR "organizationId" = NULLIF(current_setting('app.organization_id', true), '')::text
    OR EXISTS (
      SELECT 1 FROM "Project" p
      WHERE p."id" = "GanttTaskTemplate"."projectId"
        AND p."organizationId" = NULLIF(current_setting('app.organization_id', true), '')::text
    )
  );

DROP POLICY IF EXISTS "gantt_task_template_insert_org_check" ON "GanttTaskTemplate";
CREATE POLICY "gantt_task_template_insert_org_check" ON "GanttTaskTemplate"
  FOR INSERT
  WITH CHECK (
    current_setting('app.is_superadmin', true) = 'true'
    OR "organizationId" = NULLIF(current_setting('app.organization_id', true), '')::text
    OR EXISTS (
      SELECT 1 FROM "Project" p
      WHERE p."id" = "GanttTaskTemplate"."projectId"
        AND p."organizationId" = NULLIF(current_setting('app.organization_id', true), '')::text
    )
  );

DROP POLICY IF EXISTS "gantt_task_template_update_org_check" ON "GanttTaskTemplate";
CREATE POLICY "gantt_task_template_update_org_check" ON "GanttTaskTemplate"
  FOR UPDATE
  USING (
    current_setting('app.is_superadmin', true) = 'true'
    OR "organizationId" = NULLIF(current_setting('app.organization_id', true), '')::text
    OR EXISTS (
      SELECT 1 FROM "Project" p
      WHERE p."id" = "GanttTaskTemplate"."projectId"
        AND p."organizationId" = NULLIF(current_setting('app.organization_id', true), '')::text
    )
  )
  WITH CHECK (
    current_setting('app.is_superadmin', true) = 'true'
    OR "organizationId" = NULLIF(current_setting('app.organization_id', true), '')::text
    OR EXISTS (
      SELECT 1 FROM "Project" p
      WHERE p."id" = "GanttTaskTemplate"."projectId"
        AND p."organizationId" = NULLIF(current_setting('app.organization_id', true), '')::text
    )
  );

DROP POLICY IF EXISTS "gantt_task_template_delete_org_check" ON "GanttTaskTemplate";
CREATE POLICY "gantt_task_template_delete_org_check" ON "GanttTaskTemplate"
  FOR DELETE
  USING (
    current_setting('app.is_superadmin', true) = 'true'
    OR "organizationId" = NULLIF(current_setting('app.organization_id', true), '')::text
    OR EXISTS (
      SELECT 1 FROM "Project" p
      WHERE p."id" = "GanttTaskTemplate"."projectId"
        AND p."organizationId" = NULLIF(current_setting('app.organization_id', true), '')::text
    )
  );
-- rollback:
--   DROP POLICY IF EXISTS "gantt_task_template_org_isolation" ON "GanttTaskTemplate";
--   DROP POLICY IF EXISTS "gantt_task_template_insert_org_check" ON "GanttTaskTemplate";
--   DROP POLICY IF EXISTS "gantt_task_template_update_org_check" ON "GanttTaskTemplate";
--   DROP POLICY IF EXISTS "gantt_task_template_delete_org_check" ON "GanttTaskTemplate";
--   ALTER TABLE "GanttTaskTemplate" NO FORCE ROW LEVEL SECURITY;
--   ALTER TABLE "GanttTaskTemplate" DISABLE ROW LEVEL SECURITY;
