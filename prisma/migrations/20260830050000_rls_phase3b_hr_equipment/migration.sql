-- ═══════════════════════════════════════════════════════════════
-- RLS Rollout — Phase 3b: project-scoped HR/equipment (11 tables)
-- (docs/plans/rls-rollout.md §4 Phase 3b, template §3.2)
--
-- Tables: Equipment, EquipmentLog, EquipmentMaintenance, EquipmentRental, EquipmentSpotHire, LeaveBalance, LeaveRequest, Staff, StaffAdvance, StaffAttendance, StaffRole
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
--   DROP POLICY IF EXISTS "staff_project_org_isolation" ON "Staff";
--   ALTER TABLE "Staff" NO FORCE ROW LEVEL SECURITY;
--   ALTER TABLE "Staff" DISABLE ROW LEVEL SECURITY;
-- ═══════════════════════════════════════════════════════════════

-- ── Equipment — equipment registry per project ──
ALTER TABLE "Equipment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Equipment" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "equipment_project_org_isolation" ON "Equipment";
CREATE POLICY "equipment_project_org_isolation" ON "Equipment"
  FOR ALL
  USING (
    current_setting('app.is_superadmin', true) = 'true'
    OR EXISTS (
      SELECT 1 FROM "Project" p
      WHERE p."id" = "Equipment"."projectId"
        AND p."organizationId" = NULLIF(current_setting('app.organization_id', true), '')::text
    )
  )
  WITH CHECK (
    current_setting('app.is_superadmin', true) = 'true'
    OR EXISTS (
      SELECT 1 FROM "Project" p
      WHERE p."id" = "Equipment"."projectId"
        AND p."organizationId" = NULLIF(current_setting('app.organization_id', true), '')::text
    )
  );
-- ── EquipmentLog — equipment usage logs ──
ALTER TABLE "EquipmentLog" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "EquipmentLog" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "equipment_log_project_org_isolation" ON "EquipmentLog";
CREATE POLICY "equipment_log_project_org_isolation" ON "EquipmentLog"
  FOR ALL
  USING (
    current_setting('app.is_superadmin', true) = 'true'
    OR EXISTS (
      SELECT 1 FROM "Project" p
      WHERE p."id" = "EquipmentLog"."projectId"
        AND p."organizationId" = NULLIF(current_setting('app.organization_id', true), '')::text
    )
  )
  WITH CHECK (
    current_setting('app.is_superadmin', true) = 'true'
    OR EXISTS (
      SELECT 1 FROM "Project" p
      WHERE p."id" = "EquipmentLog"."projectId"
        AND p."organizationId" = NULLIF(current_setting('app.organization_id', true), '')::text
    )
  );
-- ── EquipmentMaintenance — equipment maintenance records ──
ALTER TABLE "EquipmentMaintenance" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "EquipmentMaintenance" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "equipment_maintenance_project_org_isolation" ON "EquipmentMaintenance";
CREATE POLICY "equipment_maintenance_project_org_isolation" ON "EquipmentMaintenance"
  FOR ALL
  USING (
    current_setting('app.is_superadmin', true) = 'true'
    OR EXISTS (
      SELECT 1 FROM "Project" p
      WHERE p."id" = "EquipmentMaintenance"."projectId"
        AND p."organizationId" = NULLIF(current_setting('app.organization_id', true), '')::text
    )
  )
  WITH CHECK (
    current_setting('app.is_superadmin', true) = 'true'
    OR EXISTS (
      SELECT 1 FROM "Project" p
      WHERE p."id" = "EquipmentMaintenance"."projectId"
        AND p."organizationId" = NULLIF(current_setting('app.organization_id', true), '')::text
    )
  );
-- ── EquipmentRental — equipment rental contracts ──
ALTER TABLE "EquipmentRental" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "EquipmentRental" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "equipment_rental_project_org_isolation" ON "EquipmentRental";
CREATE POLICY "equipment_rental_project_org_isolation" ON "EquipmentRental"
  FOR ALL
  USING (
    current_setting('app.is_superadmin', true) = 'true'
    OR EXISTS (
      SELECT 1 FROM "Project" p
      WHERE p."id" = "EquipmentRental"."projectId"
        AND p."organizationId" = NULLIF(current_setting('app.organization_id', true), '')::text
    )
  )
  WITH CHECK (
    current_setting('app.is_superadmin', true) = 'true'
    OR EXISTS (
      SELECT 1 FROM "Project" p
      WHERE p."id" = "EquipmentRental"."projectId"
        AND p."organizationId" = NULLIF(current_setting('app.organization_id', true), '')::text
    )
  );
-- ── EquipmentSpotHire — equipment spot hires (VatBill references) ──
ALTER TABLE "EquipmentSpotHire" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "EquipmentSpotHire" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "equipment_spot_hire_project_org_isolation" ON "EquipmentSpotHire";
CREATE POLICY "equipment_spot_hire_project_org_isolation" ON "EquipmentSpotHire"
  FOR ALL
  USING (
    current_setting('app.is_superadmin', true) = 'true'
    OR EXISTS (
      SELECT 1 FROM "Project" p
      WHERE p."id" = "EquipmentSpotHire"."projectId"
        AND p."organizationId" = NULLIF(current_setting('app.organization_id', true), '')::text
    )
  )
  WITH CHECK (
    current_setting('app.is_superadmin', true) = 'true'
    OR EXISTS (
      SELECT 1 FROM "Project" p
      WHERE p."id" = "EquipmentSpotHire"."projectId"
        AND p."organizationId" = NULLIF(current_setting('app.organization_id', true), '')::text
    )
  );
-- ── LeaveBalance — leave balances per staff member ──
ALTER TABLE "LeaveBalance" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "LeaveBalance" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "leave_balance_project_org_isolation" ON "LeaveBalance";
CREATE POLICY "leave_balance_project_org_isolation" ON "LeaveBalance"
  FOR ALL
  USING (
    current_setting('app.is_superadmin', true) = 'true'
    OR EXISTS (
      SELECT 1 FROM "Project" p
      WHERE p."id" = "LeaveBalance"."projectId"
        AND p."organizationId" = NULLIF(current_setting('app.organization_id', true), '')::text
    )
  )
  WITH CHECK (
    current_setting('app.is_superadmin', true) = 'true'
    OR EXISTS (
      SELECT 1 FROM "Project" p
      WHERE p."id" = "LeaveBalance"."projectId"
        AND p."organizationId" = NULLIF(current_setting('app.organization_id', true), '')::text
    )
  );
-- ── LeaveRequest — leave requests ──
ALTER TABLE "LeaveRequest" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "LeaveRequest" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "leave_request_project_org_isolation" ON "LeaveRequest";
CREATE POLICY "leave_request_project_org_isolation" ON "LeaveRequest"
  FOR ALL
  USING (
    current_setting('app.is_superadmin', true) = 'true'
    OR EXISTS (
      SELECT 1 FROM "Project" p
      WHERE p."id" = "LeaveRequest"."projectId"
        AND p."organizationId" = NULLIF(current_setting('app.organization_id', true), '')::text
    )
  )
  WITH CHECK (
    current_setting('app.is_superadmin', true) = 'true'
    OR EXISTS (
      SELECT 1 FROM "Project" p
      WHERE p."id" = "LeaveRequest"."projectId"
        AND p."organizationId" = NULLIF(current_setting('app.organization_id', true), '')::text
    )
  );
-- ── Staff — staff records per project ──
ALTER TABLE "Staff" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Staff" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "staff_project_org_isolation" ON "Staff";
CREATE POLICY "staff_project_org_isolation" ON "Staff"
  FOR ALL
  USING (
    current_setting('app.is_superadmin', true) = 'true'
    OR EXISTS (
      SELECT 1 FROM "Project" p
      WHERE p."id" = "Staff"."projectId"
        AND p."organizationId" = NULLIF(current_setting('app.organization_id', true), '')::text
    )
  )
  WITH CHECK (
    current_setting('app.is_superadmin', true) = 'true'
    OR EXISTS (
      SELECT 1 FROM "Project" p
      WHERE p."id" = "Staff"."projectId"
        AND p."organizationId" = NULLIF(current_setting('app.organization_id', true), '')::text
    )
  );
-- ── StaffAdvance — staff advances (payroll writes) ──
ALTER TABLE "StaffAdvance" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "StaffAdvance" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "staff_advance_project_org_isolation" ON "StaffAdvance";
CREATE POLICY "staff_advance_project_org_isolation" ON "StaffAdvance"
  FOR ALL
  USING (
    current_setting('app.is_superadmin', true) = 'true'
    OR EXISTS (
      SELECT 1 FROM "Project" p
      WHERE p."id" = "StaffAdvance"."projectId"
        AND p."organizationId" = NULLIF(current_setting('app.organization_id', true), '')::text
    )
  )
  WITH CHECK (
    current_setting('app.is_superadmin', true) = 'true'
    OR EXISTS (
      SELECT 1 FROM "Project" p
      WHERE p."id" = "StaffAdvance"."projectId"
        AND p."organizationId" = NULLIF(current_setting('app.organization_id', true), '')::text
    )
  );
-- ── StaffAttendance — attendance records (hr bulk import writes) ──
ALTER TABLE "StaffAttendance" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "StaffAttendance" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "staff_attendance_project_org_isolation" ON "StaffAttendance";
CREATE POLICY "staff_attendance_project_org_isolation" ON "StaffAttendance"
  FOR ALL
  USING (
    current_setting('app.is_superadmin', true) = 'true'
    OR EXISTS (
      SELECT 1 FROM "Project" p
      WHERE p."id" = "StaffAttendance"."projectId"
        AND p."organizationId" = NULLIF(current_setting('app.organization_id', true), '')::text
    )
  )
  WITH CHECK (
    current_setting('app.is_superadmin', true) = 'true'
    OR EXISTS (
      SELECT 1 FROM "Project" p
      WHERE p."id" = "StaffAttendance"."projectId"
        AND p."organizationId" = NULLIF(current_setting('app.organization_id', true), '')::text
    )
  );
-- ── StaffRole — staff role assignments ──
ALTER TABLE "StaffRole" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "StaffRole" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "staff_role_project_org_isolation" ON "StaffRole";
CREATE POLICY "staff_role_project_org_isolation" ON "StaffRole"
  FOR ALL
  USING (
    current_setting('app.is_superadmin', true) = 'true'
    OR EXISTS (
      SELECT 1 FROM "Project" p
      WHERE p."id" = "StaffRole"."projectId"
        AND p."organizationId" = NULLIF(current_setting('app.organization_id', true), '')::text
    )
  )
  WITH CHECK (
    current_setting('app.is_superadmin', true) = 'true'
    OR EXISTS (
      SELECT 1 FROM "Project" p
      WHERE p."id" = "StaffRole"."projectId"
        AND p."organizationId" = NULLIF(current_setting('app.organization_id', true), '')::text
    )
  );
