-- Workforce Identity & Operating-Model Clean Break
-- (ADR-0004 operating method, ADR-0005 Person/Assignment separation,
--  ADR-0007 org-level payroll at person grain, ADR-0008 clean break)
--
-- DATA NOTE (ADR-0008): every deployment's database/storage data is test
-- data, explicitly declared disposable. Reshaped child tables are
-- truncated, replaced tables are dropped, and NO backfill/mapping
-- machinery is created. If a deployment ever holds real contractor data,
-- ADR-0008 must be revisited BEFORE running this migration.
--
-- Tables created : Person, ProjectStaffAssignment, OrganizationPolicyVersion,
--                  PayrollAllocation
-- Tables reshaped: PayrollRun (org-level, period), StaffAttendance
--                  ([assignmentId, date]), StaffAdvance (personId +
--                  recoveredAmount CAS), LeaveRequest (personId),
--                  LeaveBalance (org grain), StaffRoleAssignment (personId),
--                  ResourceAssignment (personId link)
-- Tables dropped : Staff, PayrollStaffRecord
-- Columns dropped: "User"."role" (project roles live only on ProjectMember);
--                  client/inspector role values die with it (ADR-0005)
--
-- RLS: every new org/project-scoped table is ENABLE + FORCE scoped in this
-- same migration; reshaped tables get their policies re-pointed.

-- ─────────────────────────────────────────────────────────────
-- 1. Organization — operating method + active policy version pointer.
--    Legacy "operatingModel" column is kept (deprecated) until policy
--    phase C removes it.
-- ─────────────────────────────────────────────────────────────
ALTER TABLE "Organization" ADD COLUMN "operatingMethod" TEXT NOT NULL DEFAULT 'owner_led';
ALTER TABLE "Organization" ADD COLUMN "activePolicyVersionId" TEXT;

-- ─────────────────────────────────────────────────────────────
-- 2. Person — org-wide workforce identity (ADR-0005).
-- ─────────────────────────────────────────────────────────────
CREATE TABLE "Person" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "phone" TEXT,
    "pan" TEXT,
    "idNumber" TEXT,
    "photoUrl" TEXT,
    "bankAccountNo" TEXT,
    "bankName" TEXT,
    "category" TEXT,
    "employmentType" TEXT NOT NULL DEFAULT 'daily',
    "linkedUserId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "mergedIntoId" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Person_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Person_linkedUserId_key" ON "Person"("linkedUserId");
CREATE INDEX "Person_organizationId_idx" ON "Person"("organizationId");
CREATE INDEX "Person_displayName_idx" ON "Person"("displayName");
CREATE INDEX "Person_phone_idx" ON "Person"("phone");
CREATE INDEX "Person_status_idx" ON "Person"("status");

ALTER TABLE "Person" ADD CONSTRAINT "Person_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Person" ADD CONSTRAINT "Person_linkedUserId_fkey" FOREIGN KEY ("linkedUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Person" ADD CONSTRAINT "Person_mergedIntoId_fkey" FOREIGN KEY ("mergedIntoId") REFERENCES "Person"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ─────────────────────────────────────────────────────────────
-- 3. OrganizationPolicyVersion — prospective-only policy snapshots.
--    Created BEFORE the Organization FK below (circular pointer).
-- ─────────────────────────────────────────────────────────────
CREATE TABLE "OrganizationPolicyVersion" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "operatingMethod" TEXT NOT NULL,
    "capabilities" JSONB NOT NULL,
    "notes" TEXT,
    "activatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "activatedById" TEXT,
    "supersededAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrganizationPolicyVersion_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "OrganizationPolicyVersion_organizationId_version_key" ON "OrganizationPolicyVersion"("organizationId", "version");
CREATE INDEX "OrganizationPolicyVersion_organizationId_activatedAt_idx" ON "OrganizationPolicyVersion"("organizationId", "activatedAt");

ALTER TABLE "OrganizationPolicyVersion" ADD CONSTRAINT "OrganizationPolicyVersion_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Close the circular pointer: org → its active policy version.
ALTER TABLE "Organization" ADD CONSTRAINT "Organization_activePolicyVersionId_fkey" FOREIGN KEY ("activePolicyVersionId") REFERENCES "OrganizationPolicyVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE UNIQUE INDEX "Organization_activePolicyVersionId_key" ON "Organization"("activePolicyVersionId");

-- ─────────────────────────────────────────────────────────────
-- 4. ProjectStaffAssignment — dated engagement. NO [projectId, personId]
--    unique constraint: concurrent/overlapping assignments are validated
--    by the workforce service, not blocked by the schema (ADR-0005).
-- ─────────────────────────────────────────────────────────────
CREATE TABLE "ProjectStaffAssignment" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "fromDate" TIMESTAMP(3) NOT NULL,
    "toDate" TIMESTAMP(3),
    "sourceAssignmentId" TEXT,
    "designation" TEXT,
    "category" TEXT,
    "employmentType" TEXT NOT NULL DEFAULT 'daily',
    "dailyWage" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "monthlySalary" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "gangName" TEXT,
    "allocationPercent" DECIMAL(5,2),
    "status" TEXT NOT NULL DEFAULT 'active',
    "endReason" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectStaffAssignment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ProjectStaffAssignment_projectId_status_idx" ON "ProjectStaffAssignment"("projectId", "status");
CREATE INDEX "ProjectStaffAssignment_personId_idx" ON "ProjectStaffAssignment"("personId");
CREATE INDEX "ProjectStaffAssignment_sourceAssignmentId_idx" ON "ProjectStaffAssignment"("sourceAssignmentId");
CREATE INDEX "ProjectStaffAssignment_fromDate_idx" ON "ProjectStaffAssignment"("fromDate");

ALTER TABLE "ProjectStaffAssignment" ADD CONSTRAINT "ProjectStaffAssignment_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProjectStaffAssignment" ADD CONSTRAINT "ProjectStaffAssignment_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProjectStaffAssignment" ADD CONSTRAINT "ProjectStaffAssignment_sourceAssignmentId_fkey" FOREIGN KEY ("sourceAssignmentId") REFERENCES "ProjectStaffAssignment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ─────────────────────────────────────────────────────────────
-- 5. PayrollRun — reshaped in place to ORG grain (ADR-0007).
--    Old project-grain runs and their staff records are disposable.
--    NOTE: the old project-scoped RLS policy depends on the projectId
--    column being dropped here, so it must go FIRST.
-- ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "payroll_run_project_org_isolation" ON "PayrollRun";
TRUNCATE TABLE "PayrollRun" CASCADE;
ALTER TABLE "PayrollRun"
    DROP CONSTRAINT IF EXISTS "PayrollRun_projectId_month_key",
    DROP CONSTRAINT IF EXISTS "PayrollRun_projectId_fkey",
    DROP COLUMN IF EXISTS "projectId",
    DROP COLUMN IF EXISTS "month",
    DROP COLUMN IF EXISTS "totalStaffCount",
    ADD COLUMN "organizationId" TEXT NOT NULL,
    ADD COLUMN "period" TEXT NOT NULL,
    ADD COLUMN "policyVersionId" TEXT,
    ADD COLUMN "totalPersonCount" INTEGER NOT NULL DEFAULT 0;
-- PK on "id" is untouched (FKs depend on its index).
CREATE UNIQUE INDEX "PayrollRun_organizationId_period_key" ON "PayrollRun"("organizationId", "period");
CREATE INDEX "PayrollRun_organizationId_status_idx" ON "PayrollRun"("organizationId", "status");
ALTER TABLE "PayrollRun" ADD CONSTRAINT "PayrollRun_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PayrollRun" ADD CONSTRAINT "PayrollRun_policyVersionId_fkey" FOREIGN KEY ("policyVersionId") REFERENCES "OrganizationPolicyVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ─────────────────────────────────────────────────────────────
-- 6. StaffAttendance — re-grained to [assignmentId, date] (ADR-0005).
--    projectId stays as a denormalized RLS/muster anchor.
-- ─────────────────────────────────────────────────────────────
TRUNCATE TABLE "StaffAttendance" CASCADE;
ALTER TABLE "StaffAttendance"
    DROP CONSTRAINT IF EXISTS "StaffAttendance_staffId_date_key",
    DROP CONSTRAINT IF EXISTS "StaffAttendance_staffId_fkey",
    DROP COLUMN IF EXISTS "staffId",
    ADD COLUMN "assignmentId" TEXT NOT NULL,
    ADD COLUMN "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
CREATE UNIQUE INDEX "StaffAttendance_assignmentId_date_key" ON "StaffAttendance"("assignmentId", "date");
ALTER TABLE "StaffAttendance" ADD CONSTRAINT "StaffAttendance_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "ProjectStaffAssignment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ─────────────────────────────────────────────────────────────
-- 7. StaffAdvance — person grain + CAS-guarded recovery amount
--    (ADR-0007: recoveredAmount + x ≤ amount, never a boolean flip,
--    never a principal mutation).
-- ─────────────────────────────────────────────────────────────
TRUNCATE TABLE "StaffAdvance" CASCADE;
ALTER TABLE "StaffAdvance"
    DROP CONSTRAINT IF EXISTS "StaffAdvance_staffId_fkey",
    DROP COLUMN IF EXISTS "staffId",
    DROP COLUMN IF EXISTS "isRecovered",
    ADD COLUMN "personId" TEXT NOT NULL,
    ADD COLUMN "recoveredAmount" DECIMAL(15,2) NOT NULL DEFAULT 0;
DROP INDEX IF EXISTS "StaffAdvance_isRecovered_idx";
DROP INDEX IF EXISTS "StaffAdvance_projectId_staffId_idx";
CREATE INDEX "StaffAdvance_projectId_personId_idx" ON "StaffAdvance"("projectId", "personId");
CREATE INDEX "StaffAdvance_recoveredAmount_idx" ON "StaffAdvance"("recoveredAmount");
ALTER TABLE "StaffAdvance" ADD CONSTRAINT "StaffAdvance_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ─────────────────────────────────────────────────────────────
-- 8. LeaveRequest — person grain (project stays as request context).
-- ─────────────────────────────────────────────────────────────
TRUNCATE TABLE "LeaveRequest" CASCADE;
ALTER TABLE "LeaveRequest"
    DROP CONSTRAINT IF EXISTS "LeaveRequest_staffId_fkey",
    DROP COLUMN IF EXISTS "staffId",
    ADD COLUMN "personId" TEXT NOT NULL;
DROP INDEX IF EXISTS "LeaveRequest_projectId_staffId_idx";
CREATE INDEX "LeaveRequest_projectId_personId_idx" ON "LeaveRequest"("projectId", "personId");
CREATE INDEX "LeaveRequest_personId_startDate_idx" ON "LeaveRequest"("personId", "startDate");
ALTER TABLE "LeaveRequest" ADD CONSTRAINT "LeaveRequest_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ─────────────────────────────────────────────────────────────
-- 9. LeaveBalance — leave is an employment fact: ORG grain per person
--    (ADR-0005), independent of any project roster.
-- ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "leave_balance_project_org_isolation" ON "LeaveBalance";
TRUNCATE TABLE "LeaveBalance" CASCADE;
ALTER TABLE "LeaveBalance"
    DROP CONSTRAINT IF EXISTS "LeaveBalance_projectId_staffId_leaveType_year_key",
    DROP CONSTRAINT IF EXISTS "LeaveBalance_projectId_fkey",
    DROP CONSTRAINT IF EXISTS "LeaveBalance_staffId_fkey",
    DROP COLUMN IF EXISTS "projectId",
    DROP COLUMN IF EXISTS "staffId",
    ADD COLUMN "organizationId" TEXT NOT NULL,
    ADD COLUMN "personId" TEXT NOT NULL;
DROP INDEX IF EXISTS "LeaveBalance_projectId_staffId_idx";
CREATE UNIQUE INDEX "LeaveBalance_organizationId_personId_leaveType_year_key" ON "LeaveBalance"("organizationId", "personId", "leaveType", "year");
CREATE INDEX "LeaveBalance_personId_idx" ON "LeaveBalance"("personId");
ALTER TABLE "LeaveBalance" ADD CONSTRAINT "LeaveBalance_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LeaveBalance" ADD CONSTRAINT "LeaveBalance_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ─────────────────────────────────────────────────────────────
-- 10. StaffRoleAssignment — role slots are filled by persons.
-- ─────────────────────────────────────────────────────────────
TRUNCATE TABLE "StaffRoleAssignment" CASCADE;
ALTER TABLE "StaffRoleAssignment"
    DROP CONSTRAINT IF EXISTS "StaffRoleAssignment_staffId_fkey",
    DROP COLUMN IF EXISTS "staffId",
    ADD COLUMN "personId" TEXT NOT NULL;
DROP INDEX IF EXISTS "StaffRoleAssignment_staffId_idx";
CREATE INDEX "StaffRoleAssignment_personId_idx" ON "StaffRoleAssignment"("personId");
ALTER TABLE "StaffRoleAssignment" ADD CONSTRAINT "StaffRoleAssignment_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ─────────────────────────────────────────────────────────────
-- 11. ResourceAssignment — execution assignments point at persons.
--     Existing rows keep their task/role/equipment links; the staff
--     link dies with the Staff table (disposable data).
-- ─────────────────────────────────────────────────────────────
ALTER TABLE "ResourceAssignment"
    DROP CONSTRAINT IF EXISTS "ResourceAssignment_staffId_fkey",
    DROP COLUMN IF EXISTS "staffId",
    ADD COLUMN "personId" TEXT;
DROP INDEX IF EXISTS "ResourceAssignment_staffId_idx";
CREATE INDEX "ResourceAssignment_personId_idx" ON "ResourceAssignment"("personId");
ALTER TABLE "ResourceAssignment" ADD CONSTRAINT "ResourceAssignment_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ─────────────────────────────────────────────────────────────
-- 12. PayrollPersonRecord + PayrollAllocation (ADR-0007).
-- ─────────────────────────────────────────────────────────────
CREATE TABLE "PayrollPersonRecord" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "payrollRunId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "employmentType" TEXT NOT NULL DEFAULT 'daily',
    "presentDays" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "halfDays" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "absentDays" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "leaveDays" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "overtimeHours" DECIMAL(15,4) NOT NULL DEFAULT 0,
    "baseRate" DECIMAL(15,4) NOT NULL DEFAULT 0,
    "regularPay" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "overtimePay" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "allowances" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "advanceDeduction" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "messDeduction" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "otherDeductions" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "tdsAmount" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "netPayable" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "paidAmount" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "paymentStatus" TEXT NOT NULL DEFAULT 'unpaid',
    "paymentMethod" TEXT NOT NULL DEFAULT 'cash',
    "paymentReference" TEXT,
    "remarks" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PayrollPersonRecord_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PayrollPersonRecord_payrollRunId_personId_key" ON "PayrollPersonRecord"("payrollRunId", "personId");
CREATE INDEX "PayrollPersonRecord_payrollRunId_idx" ON "PayrollPersonRecord"("payrollRunId");
CREATE INDEX "PayrollPersonRecord_personId_idx" ON "PayrollPersonRecord"("personId");
CREATE INDEX "PayrollPersonRecord_organizationId_idx" ON "PayrollPersonRecord"("organizationId");

ALTER TABLE "PayrollPersonRecord" ADD CONSTRAINT "PayrollPersonRecord_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PayrollPersonRecord" ADD CONSTRAINT "PayrollPersonRecord_payrollRunId_fkey" FOREIGN KEY ("payrollRunId") REFERENCES "PayrollRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PayrollPersonRecord" ADD CONSTRAINT "PayrollPersonRecord_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "PayrollAllocation" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "payrollRunId" TEXT NOT NULL,
    "personRecordId" TEXT NOT NULL,
    "assignmentId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "basis" TEXT NOT NULL DEFAULT 'actual_days',
    "presentDays" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "overtimeHours" DECIMAL(15,4) NOT NULL DEFAULT 0,
    "allocationPercent" DECIMAL(5,2),
    "gross" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "allowances" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "advanceDeduction" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "tdsAmount" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "net" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "overrideReason" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PayrollAllocation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PayrollAllocation_personRecordId_assignmentId_key" ON "PayrollAllocation"("personRecordId", "assignmentId");
CREATE INDEX "PayrollAllocation_payrollRunId_idx" ON "PayrollAllocation"("payrollRunId");
CREATE INDEX "PayrollAllocation_projectId_idx" ON "PayrollAllocation"("projectId");
CREATE INDEX "PayrollAllocation_organizationId_idx" ON "PayrollAllocation"("organizationId");

ALTER TABLE "PayrollAllocation" ADD CONSTRAINT "PayrollAllocation_payrollRunId_fkey" FOREIGN KEY ("payrollRunId") REFERENCES "PayrollRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PayrollAllocation" ADD CONSTRAINT "PayrollAllocation_personRecordId_fkey" FOREIGN KEY ("personRecordId") REFERENCES "PayrollPersonRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PayrollAllocation" ADD CONSTRAINT "PayrollAllocation_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "ProjectStaffAssignment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PayrollAllocation" ADD CONSTRAINT "PayrollAllocation_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ─────────────────────────────────────────────────────────────
-- 13. Drop the replaced models and the removed user-level role column.
-- ─────────────────────────────────────────────────────────────
DROP TABLE IF EXISTS "PayrollStaffRecord" CASCADE;
DROP TABLE IF EXISTS "Staff" CASCADE;
ALTER TABLE "User" DROP COLUMN IF EXISTS "role";

-- ─────────────────────────────────────────────────────────────
-- 14. RLS — new scoped tables + re-pointed policies.
--     Pattern: current_setting('app.is_superadmin', true) bypass, org
--     anchor either direct (org-scoped) or via Project join (project-
--     scoped). ENABLE + FORCE so the non-superuser table owner is bound.
-- ─────────────────────────────────────────────────────────────

-- ── Person — org-scoped ──
ALTER TABLE "Person" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Person" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "person_org_isolation" ON "Person";
CREATE POLICY "person_org_isolation" ON "Person"
  FOR ALL
  USING (
    current_setting('app.is_superadmin', true) = 'true'
    OR "organizationId" = NULLIF(current_setting('app.organization_id', true), '')::text
  )
  WITH CHECK (
    current_setting('app.is_superadmin', true) = 'true'
    OR "organizationId" = NULLIF(current_setting('app.organization_id', true), '')::text
  );

-- ── OrganizationPolicyVersion — org-scoped ──
ALTER TABLE "OrganizationPolicyVersion" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "OrganizationPolicyVersion" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_policy_version_org_isolation" ON "OrganizationPolicyVersion";
CREATE POLICY "org_policy_version_org_isolation" ON "OrganizationPolicyVersion"
  FOR ALL
  USING (
    current_setting('app.is_superadmin', true) = 'true'
    OR "organizationId" = NULLIF(current_setting('app.organization_id', true), '')::text
  )
  WITH CHECK (
    current_setting('app.is_superadmin', true) = 'true'
    OR "organizationId" = NULLIF(current_setting('app.organization_id', true), '')::text
  );

-- ── ProjectStaffAssignment — project-scoped (replaces Staff policy) ──
ALTER TABLE "ProjectStaffAssignment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ProjectStaffAssignment" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "staff_assignment_project_org_isolation" ON "ProjectStaffAssignment";
CREATE POLICY "staff_assignment_project_org_isolation" ON "ProjectStaffAssignment"
  FOR ALL
  USING (
    current_setting('app.is_superadmin', true) = 'true'
    OR EXISTS (
      SELECT 1 FROM "Project" p
      WHERE p."id" = "ProjectStaffAssignment"."projectId"
        AND p."organizationId" = NULLIF(current_setting('app.organization_id', true), '')::text
    )
  )
  WITH CHECK (
    current_setting('app.is_superadmin', true) = 'true'
    OR EXISTS (
      SELECT 1 FROM "Project" p
      WHERE p."id" = "ProjectStaffAssignment"."projectId"
        AND p."organizationId" = NULLIF(current_setting('app.organization_id', true), '')::text
    )
  );

-- ── StaffAttendance — project-scoped; existing policy already keys on
--    projectId → Project.organizationId, which survives the reshape.

-- ── StaffAdvance — project-scoped; existing policy already keys on
--    projectId → Project.organizationId, which survives the reshape.

-- ── LeaveRequest — project-scoped; existing policy survives.

-- ── LeaveBalance — RE-POINT: was project-scoped, now org-scoped. ──
DROP POLICY IF EXISTS "leave_balance_project_org_isolation" ON "LeaveBalance";
ALTER TABLE "LeaveBalance" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "LeaveBalance" FORCE ROW LEVEL SECURITY;
CREATE POLICY "leave_balance_org_isolation" ON "LeaveBalance"
  FOR ALL
  USING (
    current_setting('app.is_superadmin', true) = 'true'
    OR "organizationId" = NULLIF(current_setting('app.organization_id', true), '')::text
  )
  WITH CHECK (
    current_setting('app.is_superadmin', true) = 'true'
    OR "organizationId" = NULLIF(current_setting('app.organization_id', true), '')::text
  );

-- ── PayrollRun — RE-POINT: was project-scoped, now org-scoped. ──
DROP POLICY IF EXISTS "payroll_run_project_org_isolation" ON "PayrollRun";
ALTER TABLE "PayrollRun" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PayrollRun" FORCE ROW LEVEL SECURITY;
CREATE POLICY "payroll_run_org_isolation" ON "PayrollRun"
  FOR ALL
  USING (
    current_setting('app.is_superadmin', true) = 'true'
    OR "organizationId" = NULLIF(current_setting('app.organization_id', true), '')::text
  )
  WITH CHECK (
    current_setting('app.is_superadmin', true) = 'true'
    OR "organizationId" = NULLIF(current_setting('app.organization_id', true), '')::text
  );

-- ── PayrollPersonRecord — org-scoped (denormalized organizationId). ──
ALTER TABLE "PayrollPersonRecord" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PayrollPersonRecord" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "payroll_person_record_org_isolation" ON "PayrollPersonRecord";
CREATE POLICY "payroll_person_record_org_isolation" ON "PayrollPersonRecord"
  FOR ALL
  USING (
    current_setting('app.is_superadmin', true) = 'true'
    OR "organizationId" = NULLIF(current_setting('app.organization_id', true), '')::text
  )
  WITH CHECK (
    current_setting('app.is_superadmin', true) = 'true'
    OR "organizationId" = NULLIF(current_setting('app.organization_id', true), '')::text
  );

-- ── PayrollAllocation — org-scoped (denormalized organizationId). ──
ALTER TABLE "PayrollAllocation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PayrollAllocation" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "payroll_allocation_org_isolation" ON "PayrollAllocation";
CREATE POLICY "payroll_allocation_org_isolation" ON "PayrollAllocation"
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
--   This migration is part of the clean break (ADR-0008) and is not
--   reversibly data-preserving. Rollback = git revert + database rebuild.
