-- ═══════════════════════════════════════════════════════════════
-- RLS Rollout — Phase 3c: project-scoped documents/site/other (33 tables: 30 plain + 3 composite)
-- (docs/plans/rls-rollout.md §4 Phase 3c, template §3.2)
--
-- Tables: AnalysisLibrary, ApprovedDocument, AuditLog, BoqItem, BoqVersion, ChatChannel, Correspondence, DailyProgram, DailyReport, Document, Drawing, DrawingSet, GanttTask, GanttVersion, GateEntry, JvPartnerAgreement, Meeting, Notification, Partner, PaymentCategory, Plant, PlantBatchTicket, PlantDailyLog, PlantMixDesign, ProjectMember, PunchItem, QualityInspection, Rfi, SafetyIncident, Subcontractor, Submittal, Transmittal, VariationOrder
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
--   DROP POLICY IF EXISTS "rfi_project_org_isolation" ON "Rfi";
--   ALTER TABLE "Rfi" NO FORCE ROW LEVEL SECURITY;
--   ALTER TABLE "Rfi" DISABLE ROW LEVEL SECURITY;
-- ═══════════════════════════════════════════════════════════════

-- ── AnalysisLibrary — analysis library entries per project ──
ALTER TABLE "AnalysisLibrary" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AnalysisLibrary" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "analysis_library_project_org_isolation" ON "AnalysisLibrary";
CREATE POLICY "analysis_library_project_org_isolation" ON "AnalysisLibrary"
  FOR ALL
  USING (
    current_setting('app.is_superadmin', true) = 'true'
    OR EXISTS (
      SELECT 1 FROM "Project" p
      WHERE p."id" = "AnalysisLibrary"."projectId"
        AND p."organizationId" = NULLIF(current_setting('app.organization_id', true), '')::text
    )
  )
  WITH CHECK (
    current_setting('app.is_superadmin', true) = 'true'
    OR EXISTS (
      SELECT 1 FROM "Project" p
      WHERE p."id" = "AnalysisLibrary"."projectId"
        AND p."organizationId" = NULLIF(current_setting('app.organization_id', true), '')::text
    )
  );
-- ── ApprovedDocument — approved document register ──
ALTER TABLE "ApprovedDocument" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ApprovedDocument" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "approved_document_project_org_isolation" ON "ApprovedDocument";
CREATE POLICY "approved_document_project_org_isolation" ON "ApprovedDocument"
  FOR ALL
  USING (
    current_setting('app.is_superadmin', true) = 'true'
    OR EXISTS (
      SELECT 1 FROM "Project" p
      WHERE p."id" = "ApprovedDocument"."projectId"
        AND p."organizationId" = NULLIF(current_setting('app.organization_id', true), '')::text
    )
  )
  WITH CHECK (
    current_setting('app.is_superadmin', true) = 'true'
    OR EXISTS (
      SELECT 1 FROM "Project" p
      WHERE p."id" = "ApprovedDocument"."projectId"
        AND p."organizationId" = NULLIF(current_setting('app.organization_id', true), '')::text
    )
  );
-- ── BoqItem — BOQ line items ──
ALTER TABLE "BoqItem" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "BoqItem" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "boq_item_project_org_isolation" ON "BoqItem";
CREATE POLICY "boq_item_project_org_isolation" ON "BoqItem"
  FOR ALL
  USING (
    current_setting('app.is_superadmin', true) = 'true'
    OR EXISTS (
      SELECT 1 FROM "Project" p
      WHERE p."id" = "BoqItem"."projectId"
        AND p."organizationId" = NULLIF(current_setting('app.organization_id', true), '')::text
    )
  )
  WITH CHECK (
    current_setting('app.is_superadmin', true) = 'true'
    OR EXISTS (
      SELECT 1 FROM "Project" p
      WHERE p."id" = "BoqItem"."projectId"
        AND p."organizationId" = NULLIF(current_setting('app.organization_id', true), '')::text
    )
  );
-- ── BoqVersion — BOQ versions ──
ALTER TABLE "BoqVersion" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "BoqVersion" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "boq_version_project_org_isolation" ON "BoqVersion";
CREATE POLICY "boq_version_project_org_isolation" ON "BoqVersion"
  FOR ALL
  USING (
    current_setting('app.is_superadmin', true) = 'true'
    OR EXISTS (
      SELECT 1 FROM "Project" p
      WHERE p."id" = "BoqVersion"."projectId"
        AND p."organizationId" = NULLIF(current_setting('app.organization_id', true), '')::text
    )
  )
  WITH CHECK (
    current_setting('app.is_superadmin', true) = 'true'
    OR EXISTS (
      SELECT 1 FROM "Project" p
      WHERE p."id" = "BoqVersion"."projectId"
        AND p."organizationId" = NULLIF(current_setting('app.organization_id', true), '')::text
    )
  );
-- ── Correspondence — correspondence register ──
ALTER TABLE "Correspondence" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Correspondence" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "correspondence_project_org_isolation" ON "Correspondence";
CREATE POLICY "correspondence_project_org_isolation" ON "Correspondence"
  FOR ALL
  USING (
    current_setting('app.is_superadmin', true) = 'true'
    OR EXISTS (
      SELECT 1 FROM "Project" p
      WHERE p."id" = "Correspondence"."projectId"
        AND p."organizationId" = NULLIF(current_setting('app.organization_id', true), '')::text
    )
  )
  WITH CHECK (
    current_setting('app.is_superadmin', true) = 'true'
    OR EXISTS (
      SELECT 1 FROM "Project" p
      WHERE p."id" = "Correspondence"."projectId"
        AND p."organizationId" = NULLIF(current_setting('app.organization_id', true), '')::text
    )
  );
-- ── DailyProgram — daily programs ──
ALTER TABLE "DailyProgram" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DailyProgram" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "daily_program_project_org_isolation" ON "DailyProgram";
CREATE POLICY "daily_program_project_org_isolation" ON "DailyProgram"
  FOR ALL
  USING (
    current_setting('app.is_superadmin', true) = 'true'
    OR EXISTS (
      SELECT 1 FROM "Project" p
      WHERE p."id" = "DailyProgram"."projectId"
        AND p."organizationId" = NULLIF(current_setting('app.organization_id', true), '')::text
    )
  )
  WITH CHECK (
    current_setting('app.is_superadmin', true) = 'true'
    OR EXISTS (
      SELECT 1 FROM "Project" p
      WHERE p."id" = "DailyProgram"."projectId"
        AND p."organizationId" = NULLIF(current_setting('app.organization_id', true), '')::text
    )
  );
-- ── DailyReport — daily reports ──
ALTER TABLE "DailyReport" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DailyReport" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "daily_report_project_org_isolation" ON "DailyReport";
CREATE POLICY "daily_report_project_org_isolation" ON "DailyReport"
  FOR ALL
  USING (
    current_setting('app.is_superadmin', true) = 'true'
    OR EXISTS (
      SELECT 1 FROM "Project" p
      WHERE p."id" = "DailyReport"."projectId"
        AND p."organizationId" = NULLIF(current_setting('app.organization_id', true), '')::text
    )
  )
  WITH CHECK (
    current_setting('app.is_superadmin', true) = 'true'
    OR EXISTS (
      SELECT 1 FROM "Project" p
      WHERE p."id" = "DailyReport"."projectId"
        AND p."organizationId" = NULLIF(current_setting('app.organization_id', true), '')::text
    )
  );
-- ── Document — document register ──
ALTER TABLE "Document" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Document" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "document_project_org_isolation" ON "Document";
CREATE POLICY "document_project_org_isolation" ON "Document"
  FOR ALL
  USING (
    current_setting('app.is_superadmin', true) = 'true'
    OR EXISTS (
      SELECT 1 FROM "Project" p
      WHERE p."id" = "Document"."projectId"
        AND p."organizationId" = NULLIF(current_setting('app.organization_id', true), '')::text
    )
  )
  WITH CHECK (
    current_setting('app.is_superadmin', true) = 'true'
    OR EXISTS (
      SELECT 1 FROM "Project" p
      WHERE p."id" = "Document"."projectId"
        AND p."organizationId" = NULLIF(current_setting('app.organization_id', true), '')::text
    )
  );
-- ── Drawing — drawings ──
ALTER TABLE "Drawing" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Drawing" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "drawing_project_org_isolation" ON "Drawing";
CREATE POLICY "drawing_project_org_isolation" ON "Drawing"
  FOR ALL
  USING (
    current_setting('app.is_superadmin', true) = 'true'
    OR EXISTS (
      SELECT 1 FROM "Project" p
      WHERE p."id" = "Drawing"."projectId"
        AND p."organizationId" = NULLIF(current_setting('app.organization_id', true), '')::text
    )
  )
  WITH CHECK (
    current_setting('app.is_superadmin', true) = 'true'
    OR EXISTS (
      SELECT 1 FROM "Project" p
      WHERE p."id" = "Drawing"."projectId"
        AND p."organizationId" = NULLIF(current_setting('app.organization_id', true), '')::text
    )
  );
-- ── DrawingSet — drawing sets ──
ALTER TABLE "DrawingSet" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DrawingSet" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "drawing_set_project_org_isolation" ON "DrawingSet";
CREATE POLICY "drawing_set_project_org_isolation" ON "DrawingSet"
  FOR ALL
  USING (
    current_setting('app.is_superadmin', true) = 'true'
    OR EXISTS (
      SELECT 1 FROM "Project" p
      WHERE p."id" = "DrawingSet"."projectId"
        AND p."organizationId" = NULLIF(current_setting('app.organization_id', true), '')::text
    )
  )
  WITH CHECK (
    current_setting('app.is_superadmin', true) = 'true'
    OR EXISTS (
      SELECT 1 FROM "Project" p
      WHERE p."id" = "DrawingSet"."projectId"
        AND p."organizationId" = NULLIF(current_setting('app.organization_id', true), '')::text
    )
  );
-- ── GanttTask — gantt tasks (sort/indent operations update in bulk) ──
ALTER TABLE "GanttTask" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "GanttTask" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "gantt_task_project_org_isolation" ON "GanttTask";
CREATE POLICY "gantt_task_project_org_isolation" ON "GanttTask"
  FOR ALL
  USING (
    current_setting('app.is_superadmin', true) = 'true'
    OR EXISTS (
      SELECT 1 FROM "Project" p
      WHERE p."id" = "GanttTask"."projectId"
        AND p."organizationId" = NULLIF(current_setting('app.organization_id', true), '')::text
    )
  )
  WITH CHECK (
    current_setting('app.is_superadmin', true) = 'true'
    OR EXISTS (
      SELECT 1 FROM "Project" p
      WHERE p."id" = "GanttTask"."projectId"
        AND p."organizationId" = NULLIF(current_setting('app.organization_id', true), '')::text
    )
  );
-- ── GanttVersion — gantt versions ──
ALTER TABLE "GanttVersion" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "GanttVersion" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "gantt_version_project_org_isolation" ON "GanttVersion";
CREATE POLICY "gantt_version_project_org_isolation" ON "GanttVersion"
  FOR ALL
  USING (
    current_setting('app.is_superadmin', true) = 'true'
    OR EXISTS (
      SELECT 1 FROM "Project" p
      WHERE p."id" = "GanttVersion"."projectId"
        AND p."organizationId" = NULLIF(current_setting('app.organization_id', true), '')::text
    )
  )
  WITH CHECK (
    current_setting('app.is_superadmin', true) = 'true'
    OR EXISTS (
      SELECT 1 FROM "Project" p
      WHERE p."id" = "GanttVersion"."projectId"
        AND p."organizationId" = NULLIF(current_setting('app.organization_id', true), '')::text
    )
  );
-- ── GateEntry — material gate entries (MaterialTransaction links) ──
ALTER TABLE "GateEntry" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "GateEntry" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "gate_entry_project_org_isolation" ON "GateEntry";
CREATE POLICY "gate_entry_project_org_isolation" ON "GateEntry"
  FOR ALL
  USING (
    current_setting('app.is_superadmin', true) = 'true'
    OR EXISTS (
      SELECT 1 FROM "Project" p
      WHERE p."id" = "GateEntry"."projectId"
        AND p."organizationId" = NULLIF(current_setting('app.organization_id', true), '')::text
    )
  )
  WITH CHECK (
    current_setting('app.is_superadmin', true) = 'true'
    OR EXISTS (
      SELECT 1 FROM "Project" p
      WHERE p."id" = "GateEntry"."projectId"
        AND p."organizationId" = NULLIF(current_setting('app.organization_id', true), '')::text
    )
  );
-- ── JvPartnerAgreement — JV partner agreements ──
ALTER TABLE "JvPartnerAgreement" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "JvPartnerAgreement" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "jv_partner_agreement_project_org_isolation" ON "JvPartnerAgreement";
CREATE POLICY "jv_partner_agreement_project_org_isolation" ON "JvPartnerAgreement"
  FOR ALL
  USING (
    current_setting('app.is_superadmin', true) = 'true'
    OR EXISTS (
      SELECT 1 FROM "Project" p
      WHERE p."id" = "JvPartnerAgreement"."projectId"
        AND p."organizationId" = NULLIF(current_setting('app.organization_id', true), '')::text
    )
  )
  WITH CHECK (
    current_setting('app.is_superadmin', true) = 'true'
    OR EXISTS (
      SELECT 1 FROM "Project" p
      WHERE p."id" = "JvPartnerAgreement"."projectId"
        AND p."organizationId" = NULLIF(current_setting('app.organization_id', true), '')::text
    )
  );
-- ── Meeting — meetings ──
ALTER TABLE "Meeting" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Meeting" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "meeting_project_org_isolation" ON "Meeting";
CREATE POLICY "meeting_project_org_isolation" ON "Meeting"
  FOR ALL
  USING (
    current_setting('app.is_superadmin', true) = 'true'
    OR EXISTS (
      SELECT 1 FROM "Project" p
      WHERE p."id" = "Meeting"."projectId"
        AND p."organizationId" = NULLIF(current_setting('app.organization_id', true), '')::text
    )
  )
  WITH CHECK (
    current_setting('app.is_superadmin', true) = 'true'
    OR EXISTS (
      SELECT 1 FROM "Project" p
      WHERE p."id" = "Meeting"."projectId"
        AND p."organizationId" = NULLIF(current_setting('app.organization_id', true), '')::text
    )
  );
-- ── Partner — partners (vendors/subcontractors/clients) per project ──
ALTER TABLE "Partner" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Partner" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "partner_project_org_isolation" ON "Partner";
CREATE POLICY "partner_project_org_isolation" ON "Partner"
  FOR ALL
  USING (
    current_setting('app.is_superadmin', true) = 'true'
    OR EXISTS (
      SELECT 1 FROM "Project" p
      WHERE p."id" = "Partner"."projectId"
        AND p."organizationId" = NULLIF(current_setting('app.organization_id', true), '')::text
    )
  )
  WITH CHECK (
    current_setting('app.is_superadmin', true) = 'true'
    OR EXISTS (
      SELECT 1 FROM "Project" p
      WHERE p."id" = "Partner"."projectId"
        AND p."organizationId" = NULLIF(current_setting('app.organization_id', true), '')::text
    )
  );
-- ── PaymentCategory — payment categories per project ──
ALTER TABLE "PaymentCategory" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PaymentCategory" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "payment_category_project_org_isolation" ON "PaymentCategory";
CREATE POLICY "payment_category_project_org_isolation" ON "PaymentCategory"
  FOR ALL
  USING (
    current_setting('app.is_superadmin', true) = 'true'
    OR EXISTS (
      SELECT 1 FROM "Project" p
      WHERE p."id" = "PaymentCategory"."projectId"
        AND p."organizationId" = NULLIF(current_setting('app.organization_id', true), '')::text
    )
  )
  WITH CHECK (
    current_setting('app.is_superadmin', true) = 'true'
    OR EXISTS (
      SELECT 1 FROM "Project" p
      WHERE p."id" = "PaymentCategory"."projectId"
        AND p."organizationId" = NULLIF(current_setting('app.organization_id', true), '')::text
    )
  );
-- ── Plant — batch plants ──
ALTER TABLE "Plant" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Plant" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "plant_project_org_isolation" ON "Plant";
CREATE POLICY "plant_project_org_isolation" ON "Plant"
  FOR ALL
  USING (
    current_setting('app.is_superadmin', true) = 'true'
    OR EXISTS (
      SELECT 1 FROM "Project" p
      WHERE p."id" = "Plant"."projectId"
        AND p."organizationId" = NULLIF(current_setting('app.organization_id', true), '')::text
    )
  )
  WITH CHECK (
    current_setting('app.is_superadmin', true) = 'true'
    OR EXISTS (
      SELECT 1 FROM "Project" p
      WHERE p."id" = "Plant"."projectId"
        AND p."organizationId" = NULLIF(current_setting('app.organization_id', true), '')::text
    )
  );
-- ── PlantBatchTicket — plant batch tickets ──
ALTER TABLE "PlantBatchTicket" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PlantBatchTicket" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "plant_batch_ticket_project_org_isolation" ON "PlantBatchTicket";
CREATE POLICY "plant_batch_ticket_project_org_isolation" ON "PlantBatchTicket"
  FOR ALL
  USING (
    current_setting('app.is_superadmin', true) = 'true'
    OR EXISTS (
      SELECT 1 FROM "Project" p
      WHERE p."id" = "PlantBatchTicket"."projectId"
        AND p."organizationId" = NULLIF(current_setting('app.organization_id', true), '')::text
    )
  )
  WITH CHECK (
    current_setting('app.is_superadmin', true) = 'true'
    OR EXISTS (
      SELECT 1 FROM "Project" p
      WHERE p."id" = "PlantBatchTicket"."projectId"
        AND p."organizationId" = NULLIF(current_setting('app.organization_id', true), '')::text
    )
  );
-- ── PlantDailyLog — plant daily logs ──
ALTER TABLE "PlantDailyLog" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PlantDailyLog" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "plant_daily_log_project_org_isolation" ON "PlantDailyLog";
CREATE POLICY "plant_daily_log_project_org_isolation" ON "PlantDailyLog"
  FOR ALL
  USING (
    current_setting('app.is_superadmin', true) = 'true'
    OR EXISTS (
      SELECT 1 FROM "Project" p
      WHERE p."id" = "PlantDailyLog"."projectId"
        AND p."organizationId" = NULLIF(current_setting('app.organization_id', true), '')::text
    )
  )
  WITH CHECK (
    current_setting('app.is_superadmin', true) = 'true'
    OR EXISTS (
      SELECT 1 FROM "Project" p
      WHERE p."id" = "PlantDailyLog"."projectId"
        AND p."organizationId" = NULLIF(current_setting('app.organization_id', true), '')::text
    )
  );
-- ── PlantMixDesign — plant mix designs ──
ALTER TABLE "PlantMixDesign" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PlantMixDesign" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "plant_mix_design_project_org_isolation" ON "PlantMixDesign";
CREATE POLICY "plant_mix_design_project_org_isolation" ON "PlantMixDesign"
  FOR ALL
  USING (
    current_setting('app.is_superadmin', true) = 'true'
    OR EXISTS (
      SELECT 1 FROM "Project" p
      WHERE p."id" = "PlantMixDesign"."projectId"
        AND p."organizationId" = NULLIF(current_setting('app.organization_id', true), '')::text
    )
  )
  WITH CHECK (
    current_setting('app.is_superadmin', true) = 'true'
    OR EXISTS (
      SELECT 1 FROM "Project" p
      WHERE p."id" = "PlantMixDesign"."projectId"
        AND p."organizationId" = NULLIF(current_setting('app.organization_id', true), '')::text
    )
  );
-- ── ProjectMember — project memberships (authz reads) ──
ALTER TABLE "ProjectMember" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ProjectMember" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "project_member_project_org_isolation" ON "ProjectMember";
CREATE POLICY "project_member_project_org_isolation" ON "ProjectMember"
  FOR ALL
  USING (
    current_setting('app.is_superadmin', true) = 'true'
    OR EXISTS (
      SELECT 1 FROM "Project" p
      WHERE p."id" = "ProjectMember"."projectId"
        AND p."organizationId" = NULLIF(current_setting('app.organization_id', true), '')::text
    )
  )
  WITH CHECK (
    current_setting('app.is_superadmin', true) = 'true'
    OR EXISTS (
      SELECT 1 FROM "Project" p
      WHERE p."id" = "ProjectMember"."projectId"
        AND p."organizationId" = NULLIF(current_setting('app.organization_id', true), '')::text
    )
  );
-- ── PunchItem — punch list items ──
ALTER TABLE "PunchItem" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PunchItem" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "punch_item_project_org_isolation" ON "PunchItem";
CREATE POLICY "punch_item_project_org_isolation" ON "PunchItem"
  FOR ALL
  USING (
    current_setting('app.is_superadmin', true) = 'true'
    OR EXISTS (
      SELECT 1 FROM "Project" p
      WHERE p."id" = "PunchItem"."projectId"
        AND p."organizationId" = NULLIF(current_setting('app.organization_id', true), '')::text
    )
  )
  WITH CHECK (
    current_setting('app.is_superadmin', true) = 'true'
    OR EXISTS (
      SELECT 1 FROM "Project" p
      WHERE p."id" = "PunchItem"."projectId"
        AND p."organizationId" = NULLIF(current_setting('app.organization_id', true), '')::text
    )
  );
-- ── QualityInspection — quality inspections ──
ALTER TABLE "QualityInspection" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "QualityInspection" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "quality_inspection_project_org_isolation" ON "QualityInspection";
CREATE POLICY "quality_inspection_project_org_isolation" ON "QualityInspection"
  FOR ALL
  USING (
    current_setting('app.is_superadmin', true) = 'true'
    OR EXISTS (
      SELECT 1 FROM "Project" p
      WHERE p."id" = "QualityInspection"."projectId"
        AND p."organizationId" = NULLIF(current_setting('app.organization_id', true), '')::text
    )
  )
  WITH CHECK (
    current_setting('app.is_superadmin', true) = 'true'
    OR EXISTS (
      SELECT 1 FROM "Project" p
      WHERE p."id" = "QualityInspection"."projectId"
        AND p."organizationId" = NULLIF(current_setting('app.organization_id', true), '')::text
    )
  );
-- ── Rfi — RFIs (responses update in a transaction) ──
ALTER TABLE "Rfi" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Rfi" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "rfi_project_org_isolation" ON "Rfi";
CREATE POLICY "rfi_project_org_isolation" ON "Rfi"
  FOR ALL
  USING (
    current_setting('app.is_superadmin', true) = 'true'
    OR EXISTS (
      SELECT 1 FROM "Project" p
      WHERE p."id" = "Rfi"."projectId"
        AND p."organizationId" = NULLIF(current_setting('app.organization_id', true), '')::text
    )
  )
  WITH CHECK (
    current_setting('app.is_superadmin', true) = 'true'
    OR EXISTS (
      SELECT 1 FROM "Project" p
      WHERE p."id" = "Rfi"."projectId"
        AND p."organizationId" = NULLIF(current_setting('app.organization_id', true), '')::text
    )
  );
-- ── SafetyIncident — safety incidents ──
ALTER TABLE "SafetyIncident" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SafetyIncident" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "safety_incident_project_org_isolation" ON "SafetyIncident";
CREATE POLICY "safety_incident_project_org_isolation" ON "SafetyIncident"
  FOR ALL
  USING (
    current_setting('app.is_superadmin', true) = 'true'
    OR EXISTS (
      SELECT 1 FROM "Project" p
      WHERE p."id" = "SafetyIncident"."projectId"
        AND p."organizationId" = NULLIF(current_setting('app.organization_id', true), '')::text
    )
  )
  WITH CHECK (
    current_setting('app.is_superadmin', true) = 'true'
    OR EXISTS (
      SELECT 1 FROM "Project" p
      WHERE p."id" = "SafetyIncident"."projectId"
        AND p."organizationId" = NULLIF(current_setting('app.organization_id', true), '')::text
    )
  );
-- ── Subcontractor — subcontractors per project ──
ALTER TABLE "Subcontractor" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Subcontractor" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "subcontractor_project_org_isolation" ON "Subcontractor";
CREATE POLICY "subcontractor_project_org_isolation" ON "Subcontractor"
  FOR ALL
  USING (
    current_setting('app.is_superadmin', true) = 'true'
    OR EXISTS (
      SELECT 1 FROM "Project" p
      WHERE p."id" = "Subcontractor"."projectId"
        AND p."organizationId" = NULLIF(current_setting('app.organization_id', true), '')::text
    )
  )
  WITH CHECK (
    current_setting('app.is_superadmin', true) = 'true'
    OR EXISTS (
      SELECT 1 FROM "Project" p
      WHERE p."id" = "Subcontractor"."projectId"
        AND p."organizationId" = NULLIF(current_setting('app.organization_id', true), '')::text
    )
  );
-- ── Submittal — submittals ──
ALTER TABLE "Submittal" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Submittal" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "submittal_project_org_isolation" ON "Submittal";
CREATE POLICY "submittal_project_org_isolation" ON "Submittal"
  FOR ALL
  USING (
    current_setting('app.is_superadmin', true) = 'true'
    OR EXISTS (
      SELECT 1 FROM "Project" p
      WHERE p."id" = "Submittal"."projectId"
        AND p."organizationId" = NULLIF(current_setting('app.organization_id', true), '')::text
    )
  )
  WITH CHECK (
    current_setting('app.is_superadmin', true) = 'true'
    OR EXISTS (
      SELECT 1 FROM "Project" p
      WHERE p."id" = "Submittal"."projectId"
        AND p."organizationId" = NULLIF(current_setting('app.organization_id', true), '')::text
    )
  );
-- ── Transmittal — transmittals ──
ALTER TABLE "Transmittal" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Transmittal" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "transmittal_project_org_isolation" ON "Transmittal";
CREATE POLICY "transmittal_project_org_isolation" ON "Transmittal"
  FOR ALL
  USING (
    current_setting('app.is_superadmin', true) = 'true'
    OR EXISTS (
      SELECT 1 FROM "Project" p
      WHERE p."id" = "Transmittal"."projectId"
        AND p."organizationId" = NULLIF(current_setting('app.organization_id', true), '')::text
    )
  )
  WITH CHECK (
    current_setting('app.is_superadmin', true) = 'true'
    OR EXISTS (
      SELECT 1 FROM "Project" p
      WHERE p."id" = "Transmittal"."projectId"
        AND p."organizationId" = NULLIF(current_setting('app.organization_id', true), '')::text
    )
  );
-- ── VariationOrder — variation orders ──
ALTER TABLE "VariationOrder" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "VariationOrder" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "variation_order_project_org_isolation" ON "VariationOrder";
CREATE POLICY "variation_order_project_org_isolation" ON "VariationOrder"
  FOR ALL
  USING (
    current_setting('app.is_superadmin', true) = 'true'
    OR EXISTS (
      SELECT 1 FROM "Project" p
      WHERE p."id" = "VariationOrder"."projectId"
        AND p."organizationId" = NULLIF(current_setting('app.organization_id', true), '')::text
    )
  )
  WITH CHECK (
    current_setting('app.is_superadmin', true) = 'true'
    OR EXISTS (
      SELECT 1 FROM "Project" p
      WHERE p."id" = "VariationOrder"."projectId"
        AND p."organizationId" = NULLIF(current_setting('app.organization_id', true), '')::text
    )
  );
-- ── AuditLog — composite: project-EXISTS / acting-user's org; append-only ──
-- projectId is NULL for project-less actions (login, org admin) — those
-- rows stay visible through the ACTING USER's org. Mirrors the read
-- paths: /api/audit filters projectId IN <user's projects> (NULL rows
-- never returned to org users); admin.listAuditLogs runs as
-- superAdminProcedure (bypass branch).
--
-- INSERT is deliberately permissive (WITH CHECK (true)): audit rows are
-- written from after() hooks on arbitrary pooled connections where the
-- org GUC may be absent — an INSERT-side tenant check would silently
-- drop audit rows (the helper swallows errors by design: logging must
-- never break the request). Tenant isolation is enforced on the READ
-- side, which is where the cross-tenant risk lives.
--
-- There are deliberately NO UPDATE/DELETE policies: the audit trail is
-- append-only at the database layer for EVERY role including
-- superadmin (tamper-evident). Retention pruning requires a true
-- superuser session (postgres), not the app role.
ALTER TABLE "AuditLog" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AuditLog" FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "audit_log_select_isolation" ON "AuditLog";
CREATE POLICY "audit_log_select_isolation" ON "AuditLog"
  FOR SELECT
  USING (
    current_setting('app.is_superadmin', true) = 'true'
    OR EXISTS (
      SELECT 1 FROM "Project" p
      WHERE p."id" = "AuditLog"."projectId"
        AND p."organizationId" = NULLIF(current_setting('app.organization_id', true), '')::text
    )
    OR EXISTS (
      SELECT 1 FROM "User" u
      WHERE u."id" = "AuditLog"."userId"
        AND u."organizationId" = NULLIF(current_setting('app.organization_id', true), '')::text
    )
  );

DROP POLICY IF EXISTS "audit_log_insert_allow" ON "AuditLog";
CREATE POLICY "audit_log_insert_allow" ON "AuditLog"
  FOR INSERT
  WITH CHECK (true);

-- ── Notification — composite: project-EXISTS / recipient's org ──
-- projectId is NULL for user-level notifications. Reads are always
-- userId-scoped at the app layer (notification.ts list/markRead); RLS
-- adds the tenant boundary: a row is visible when its project belongs
-- to the caller's org OR its recipient (userId) belongs to the
-- caller's org. Recipients of a given notification are same-org in
-- practice (notifyProjectMembers notifies a project's members).
--
-- Writes: src/server/utils/notify.ts was retrofitted to create
-- notifications inside an interactive transaction with the org
-- context derived from the recipient's org (bootstrap-superadmin
-- lookups, then the real context before INSERT) — the reliable
-- withOrgContext primitive, not the best-effort session GUC.
ALTER TABLE "Notification" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Notification" FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "notification_isolation" ON "Notification";
CREATE POLICY "notification_isolation" ON "Notification"
  FOR ALL
  USING (
    current_setting('app.is_superadmin', true) = 'true'
    OR EXISTS (
      SELECT 1 FROM "Project" p
      WHERE p."id" = "Notification"."projectId"
        AND p."organizationId" = NULLIF(current_setting('app.organization_id', true), '')::text
    )
    OR EXISTS (
      SELECT 1 FROM "User" u
      WHERE u."id" = "Notification"."userId"
        AND u."organizationId" = NULLIF(current_setting('app.organization_id', true), '')::text
    )
  )
  WITH CHECK (
    current_setting('app.is_superadmin', true) = 'true'
    OR EXISTS (
      SELECT 1 FROM "Project" p
      WHERE p."id" = "Notification"."projectId"
        AND p."organizationId" = NULLIF(current_setting('app.organization_id', true), '')::text
    )
    OR EXISTS (
      SELECT 1 FROM "User" u
      WHERE u."id" = "Notification"."userId"
        AND u."organizationId" = NULLIF(current_setting('app.organization_id', true), '')::text
    )
  );

-- ── ChatChannel — composite: project-EXISTS / creator's org / member org ──
-- projectId is NULL for org_order channels (org-wide broadcasts) and
-- for personal/group DMs. Mirrors chat.ts exactly:
--   * project channels (public/project_order) → project-EXISTS;
--   * org_order channels → creator's org (createdById → User);
--   * personal/group channels → visible when any member is in the
--     caller's org (ChatMember → User).
-- Channels with no creator and no members fail closed (legacy orphans
-- are excluded from user lists by the app too).
ALTER TABLE "ChatChannel" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ChatChannel" FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "chat_channel_isolation" ON "ChatChannel";
CREATE POLICY "chat_channel_isolation" ON "ChatChannel"
  FOR ALL
  USING (
    current_setting('app.is_superadmin', true) = 'true'
    OR EXISTS (
      SELECT 1 FROM "Project" p
      WHERE p."id" = "ChatChannel"."projectId"
        AND p."organizationId" = NULLIF(current_setting('app.organization_id', true), '')::text
    )
    OR EXISTS (
      SELECT 1 FROM "User" u
      WHERE u."id" = "ChatChannel"."createdById"
        AND u."organizationId" = NULLIF(current_setting('app.organization_id', true), '')::text
    )
    OR EXISTS (
      SELECT 1 FROM "ChatMember" cm
      JOIN "User" u ON u."id" = cm."userId"
      WHERE cm."channelId" = "ChatChannel"."id"
        AND u."organizationId" = NULLIF(current_setting('app.organization_id', true), '')::text
    )
  )
  WITH CHECK (
    current_setting('app.is_superadmin', true) = 'true'
    OR EXISTS (
      SELECT 1 FROM "Project" p
      WHERE p."id" = "ChatChannel"."projectId"
        AND p."organizationId" = NULLIF(current_setting('app.organization_id', true), '')::text
    )
    OR EXISTS (
      SELECT 1 FROM "User" u
      WHERE u."id" = "ChatChannel"."createdById"
        AND u."organizationId" = NULLIF(current_setting('app.organization_id', true), '')::text
    )
  );

-- Rollback for the composites:
--   DROP POLICY IF EXISTS "audit_log_select_isolation" ON "AuditLog";
--   DROP POLICY IF EXISTS "audit_log_insert_allow" ON "AuditLog";
--   DROP POLICY IF EXISTS "notification_isolation" ON "Notification";
--   DROP POLICY IF EXISTS "chat_channel_isolation" ON "ChatChannel";
--   ALTER TABLE "AuditLog" NO FORCE ROW LEVEL SECURITY;
--   ALTER TABLE "AuditLog" DISABLE ROW LEVEL SECURITY;
--   ALTER TABLE "Notification" NO FORCE ROW LEVEL SECURITY;
--   ALTER TABLE "Notification" DISABLE ROW LEVEL SECURITY;
--   ALTER TABLE "ChatChannel" NO FORCE ROW LEVEL SECURITY;
--   ALTER TABLE "ChatChannel" DISABLE ROW LEVEL SECURITY;
