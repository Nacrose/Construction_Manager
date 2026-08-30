-- ═══════════════════════════════════════════════════════════════
-- RLS Rollout — Phase 3a: project-scoped procurement/materials (5 tables)
-- (docs/plans/rls-rollout.md §4 Phase 3a, template §3.2)
--
-- Tables: EquipmentVendor, MarketRateRevisionLog, Material, StoreLocation, Supplier
--
-- All tables in this batch have projectId NOT NULL (schema-verified):
-- the plain §3.2 policy applies — superadmin OR the row's project
-- belongs to the caller's org. Verified semantics (embedded-PG16 lab,
-- docs/rls-evidence/phase3-abc-verification.md): cross-org SELECT returns 0 rows, cross-org INSERT is
-- denied (42501), cross-org UPDATE/DELETE affect 0 rows silently,
-- missing context fails CLOSED, superadmin bypasses — in BOTH
-- connection modes (table owner with FORCE — the Prisma case — and a
-- non-owner role where Project's own RLS applies inside the EXISTS).
--
-- Rollback (instant — policy metadata only, no table rewrites), per
-- table:
--   DROP POLICY IF EXISTS "material_project_org_isolation" ON "Material";
--   ALTER TABLE "Material" NO FORCE ROW LEVEL SECURITY;
--   ALTER TABLE "Material" DISABLE ROW LEVEL SECURITY;
-- ═══════════════════════════════════════════════════════════════

-- ── EquipmentVendor — equipment vendor directory, per project ──
ALTER TABLE "EquipmentVendor" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "EquipmentVendor" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "equipment_vendor_project_org_isolation" ON "EquipmentVendor";
CREATE POLICY "equipment_vendor_project_org_isolation" ON "EquipmentVendor"
  FOR ALL
  USING (
    current_setting('app.is_superadmin', true) = 'true'
    OR EXISTS (
      SELECT 1 FROM "Project" p
      WHERE p."id" = "EquipmentVendor"."projectId"
        AND p."organizationId" = NULLIF(current_setting('app.organization_id', true), '')::text
    )
  )
  WITH CHECK (
    current_setting('app.is_superadmin', true) = 'true'
    OR EXISTS (
      SELECT 1 FROM "Project" p
      WHERE p."id" = "EquipmentVendor"."projectId"
        AND p."organizationId" = NULLIF(current_setting('app.organization_id', true), '')::text
    )
  );
-- ── MarketRateRevisionLog — market-rate revision history (fiscal-year lock writes) ──
ALTER TABLE "MarketRateRevisionLog" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "MarketRateRevisionLog" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "market_rate_revision_log_project_org_isolation" ON "MarketRateRevisionLog";
CREATE POLICY "market_rate_revision_log_project_org_isolation" ON "MarketRateRevisionLog"
  FOR ALL
  USING (
    current_setting('app.is_superadmin', true) = 'true'
    OR EXISTS (
      SELECT 1 FROM "Project" p
      WHERE p."id" = "MarketRateRevisionLog"."projectId"
        AND p."organizationId" = NULLIF(current_setting('app.organization_id', true), '')::text
    )
  )
  WITH CHECK (
    current_setting('app.is_superadmin', true) = 'true'
    OR EXISTS (
      SELECT 1 FROM "Project" p
      WHERE p."id" = "MarketRateRevisionLog"."projectId"
        AND p."organizationId" = NULLIF(current_setting('app.organization_id', true), '')::text
    )
  );
-- ── Material — material master per project ──
ALTER TABLE "Material" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Material" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "material_project_org_isolation" ON "Material";
CREATE POLICY "material_project_org_isolation" ON "Material"
  FOR ALL
  USING (
    current_setting('app.is_superadmin', true) = 'true'
    OR EXISTS (
      SELECT 1 FROM "Project" p
      WHERE p."id" = "Material"."projectId"
        AND p."organizationId" = NULLIF(current_setting('app.organization_id', true), '')::text
    )
  )
  WITH CHECK (
    current_setting('app.is_superadmin', true) = 'true'
    OR EXISTS (
      SELECT 1 FROM "Project" p
      WHERE p."id" = "Material"."projectId"
        AND p."organizationId" = NULLIF(current_setting('app.organization_id', true), '')::text
    )
  );
-- ── StoreLocation — store locations per project (stock transfers write via MaterialTransaction) ──
ALTER TABLE "StoreLocation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "StoreLocation" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "store_location_project_org_isolation" ON "StoreLocation";
CREATE POLICY "store_location_project_org_isolation" ON "StoreLocation"
  FOR ALL
  USING (
    current_setting('app.is_superadmin', true) = 'true'
    OR EXISTS (
      SELECT 1 FROM "Project" p
      WHERE p."id" = "StoreLocation"."projectId"
        AND p."organizationId" = NULLIF(current_setting('app.organization_id', true), '')::text
    )
  )
  WITH CHECK (
    current_setting('app.is_superadmin', true) = 'true'
    OR EXISTS (
      SELECT 1 FROM "Project" p
      WHERE p."id" = "StoreLocation"."projectId"
        AND p."organizationId" = NULLIF(current_setting('app.organization_id', true), '')::text
    )
  );
-- ── Supplier — supplier directory, per project ──
ALTER TABLE "Supplier" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Supplier" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "supplier_project_org_isolation" ON "Supplier";
CREATE POLICY "supplier_project_org_isolation" ON "Supplier"
  FOR ALL
  USING (
    current_setting('app.is_superadmin', true) = 'true'
    OR EXISTS (
      SELECT 1 FROM "Project" p
      WHERE p."id" = "Supplier"."projectId"
        AND p."organizationId" = NULLIF(current_setting('app.organization_id', true), '')::text
    )
  )
  WITH CHECK (
    current_setting('app.is_superadmin', true) = 'true'
    OR EXISTS (
      SELECT 1 FROM "Project" p
      WHERE p."id" = "Supplier"."projectId"
        AND p."organizationId" = NULLIF(current_setting('app.organization_id', true), '')::text
    )
  );
