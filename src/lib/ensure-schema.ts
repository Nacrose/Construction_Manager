import { db } from "@/lib/db";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { splitSqlStatements } from "@/lib/split-sql";
import { RLS_SQL } from "@/lib/rls";

/**
 * Shared schema-ensure logic for /api/setup and /api/seed.
 *
 * Reads prisma/migrations/0_init/migration.sql, splits it into statements,
 * and applies ALL of them — every statement uses CREATE TABLE IF NOT EXISTS
 * or CREATE INDEX IF NOT EXISTS, so they're idempotent and safe to re-run.
 *
 * This is important: when we add new models to schema.prisma and regenerate
 * the baseline migration, the new CREATE TABLE statements get appended.
 * Re-running ensureSchema() on an existing database will:
 * - Skip existing tables (IF NOT EXISTS → "already exists" → skipped)
 * - Create new tables (StaffRole, StaffRoleAssignment, new columns, etc.)
 *
 * We do NOT use the _prisma_migrations "already applied" check anymore —
 * that prevented incremental schema updates. Instead, we always run all
 * statements and rely on IF NOT EXISTS for idempotency.
 *
 * For ALTER TABLE (adding columns to existing tables), we catch errors
 * and treat "already exists" / "duplicate column" as skipped.
 */

export type EnsureSchemaResult = {
  applied: boolean;
  executed: number;
  skipped: number;
  failed: number;
  errors: string[]; // list of error messages for failed statements
};

export async function ensureSchema(): Promise<EnsureSchemaResult> {
  const migrationsDir = join(process.cwd(), "prisma", "migrations", "0_init");
  const migrationFile = join(migrationsDir, "migration.sql");

  if (!existsSync(migrationFile)) {
    throw new Error(
      "Migration file not found at prisma/migrations/0_init/migration.sql. " +
        "Run `npm run db:regenerate-baseline` to regenerate it from schema.prisma."
    );
  }

  const sql = readFileSync(migrationFile, "utf8");
  const statements = splitSqlStatements(sql);

  // Ensure _prisma_migrations table exists (for Prisma CLI compatibility)
  await db.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "_prisma_migrations" (
      "id" VARCHAR(36) NOT NULL,
      "checksum" VARCHAR(64) NOT NULL,
      "finished_at" TIMESTAMPTZ,
      "migration_name" VARCHAR(255) NOT NULL,
      "logs" TEXT,
      "rolled_back_at" TIMESTAMPTZ,
      "started_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "applied_steps_count" INTEGER NOT NULL DEFAULT 0,
      CONSTRAINT "_prisma_migrations_pkey" PRIMARY KEY ("id")
    );
  `);

  // Always run ALL statements — they're idempotent (IF NOT EXISTS).
  // This handles incremental schema changes: when new models are added to
  // schema.prisma and the baseline migration is regenerated, the new
  // CREATE TABLE statements will be applied here. Existing tables are
  // skipped via IF NOT EXISTS.
  let executed = 0;
  let skipped = 0;
  let failed = 0;
  const errors: string[] = [];
  for (const stmt of statements) {
    try {
      await db.$executeRawUnsafe(stmt);
      executed++;
    } catch (e) {
      const msg = e instanceof Error ? e.message : "";
      // Tolerate "already exists" (tables, indexes) and "duplicate column"
      // (ALTER TABLE ADD COLUMN that already ran)
      if (
        msg.includes("already exists") ||
        msg.includes("duplicate column") ||
        msg.includes("already exists") ||
        msg.includes("relation") && msg.includes("already exists")
      ) {
        skipped++;
      } else {
        failed++;
        errors.push(`${msg.slice(0, 150)} — statement: ${stmt.slice(0, 80)}`);
        console.error(
          "Migration statement failed:",
          msg.slice(0, 200),
          "— statement:",
          stmt.slice(0, 100)
        );
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // ALTER TABLE: add new columns to existing tables (for incremental migrations)
  // These use ADD COLUMN IF NOT EXISTS (PostgreSQL 9.6+), so they're idempotent.
  // This handles the case where a table already exists but new columns were
  // added to schema.prisma since the last migration.
  // ═══════════════════════════════════════════════════════════════
  const alterStatements = [
    // User — multi-tenancy columns
    `ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "organizationId" TEXT`,
    `ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "orgRole" TEXT NOT NULL DEFAULT 'member'`,
    `ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "lastActiveAt" TIMESTAMP(3)`,

    // Project — multi-tenancy
    `ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "organizationId" TEXT`,

    // GanttVersion — dual schedule + revision chain
    `ALTER TABLE "GanttVersion" ADD COLUMN IF NOT EXISTS "scheduleType" TEXT NOT NULL DEFAULT 'PLANNING'`,
    `ALTER TABLE "GanttVersion" ADD COLUMN IF NOT EXISTS "revisionOfId" TEXT`,
    `ALTER TABLE "GanttVersion" ADD COLUMN IF NOT EXISTS "revisionReason" TEXT`,
    `ALTER TABLE "GanttVersion" ADD COLUMN IF NOT EXISTS "revisionStatus" TEXT NOT NULL DEFAULT 'DRAFT'`,
    `ALTER TABLE "GanttVersion" ADD COLUMN IF NOT EXISTS "submittedAt" TIMESTAMPTZ`,
    `ALTER TABLE "GanttVersion" ADD COLUMN IF NOT EXISTS "submittedById" TEXT`,
    `ALTER TABLE "GanttVersion" ADD COLUMN IF NOT EXISTS "approvalNote" TEXT`,

    // GanttTask — execution → planning link
    `ALTER TABLE "GanttTask" ADD COLUMN IF NOT EXISTS "planningTaskId" TEXT`,

    // GanttTask — MS Project compatibility fields (all optional, default = no behavior change)
    `ALTER TABLE "GanttTask" ADD COLUMN IF NOT EXISTS "workHours" DOUBLE PRECISION NOT NULL DEFAULT 0`,
    `ALTER TABLE "GanttTask" ADD COLUMN IF NOT EXISTS "taskType" TEXT NOT NULL DEFAULT 'fixed_duration'`,
    `ALTER TABLE "GanttTask" ADD COLUMN IF NOT EXISTS "constraintType" TEXT NOT NULL DEFAULT 'asap'`,
    `ALTER TABLE "GanttTask" ADD COLUMN IF NOT EXISTS "constraintDate" TIMESTAMP(3)`,
    `ALTER TABLE "GanttTask" ADD COLUMN IF NOT EXISTS "deadline" TIMESTAMP(3)`,
    `ALTER TABLE "GanttTask" ADD COLUMN IF NOT EXISTS "notes" TEXT`,
    `ALTER TABLE "GanttTask" ADD COLUMN IF NOT EXISTS "effortDriven" BOOLEAN NOT NULL DEFAULT false`,
    `ALTER TABLE "GanttTask" ADD COLUMN IF NOT EXISTS "estimated" BOOLEAN NOT NULL DEFAULT false`,
    `ALTER TABLE "GanttTask" ADD COLUMN IF NOT EXISTS "ignoreResourceCalendar" BOOLEAN NOT NULL DEFAULT false`,
    `ALTER TABLE "GanttTask" ADD COLUMN IF NOT EXISTS "priority" INTEGER NOT NULL DEFAULT 500`,
    `ALTER TABLE "GanttTask" ADD COLUMN IF NOT EXISTS "earnedValueMethod" TEXT NOT NULL DEFAULT 'percent_complete'`,

    // ResourceAssignment — MS Project compatibility fields
    `ALTER TABLE "ResourceAssignment" ADD COLUMN IF NOT EXISTS "workHours" DOUBLE PRECISION NOT NULL DEFAULT 0`,
    `ALTER TABLE "ResourceAssignment" ADD COLUMN IF NOT EXISTS "resourceType" TEXT NOT NULL DEFAULT 'work'`,
    `ALTER TABLE "ResourceAssignment" ADD COLUMN IF NOT EXISTS "materialLabel" TEXT`,

    // PushSubscription — web push notifications
    `CREATE TABLE IF NOT EXISTS "PushSubscription" (
      "id" TEXT NOT NULL,
      "userId" TEXT NOT NULL,
      "endpoint" TEXT NOT NULL,
      "p256dh" TEXT NOT NULL,
      "auth" TEXT NOT NULL,
      "userAgent" TEXT,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL,
      CONSTRAINT "PushSubscription_pkey" PRIMARY KEY ("id")
    )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "PushSubscription_endpoint_key" ON "PushSubscription"("endpoint")`,
    `CREATE INDEX IF NOT EXISTS "PushSubscription_userId_idx" ON "PushSubscription"("userId")`,

    // Subcontractor — retention tracking fields
    `ALTER TABLE "Subcontractor" ADD COLUMN IF NOT EXISTS "totalRetentionHeld" DOUBLE PRECISION NOT NULL DEFAULT 0`,
    `ALTER TABLE "Subcontractor" ADD COLUMN IF NOT EXISTS "totalRetentionReleased" DOUBLE PRECISION NOT NULL DEFAULT 0`,
    `ALTER TABLE "Subcontractor" ADD COLUMN IF NOT EXISTS "contractValue" DOUBLE PRECISION NOT NULL DEFAULT 0`,

    // User — deactivation tracking
    `ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "deactivatedAt" TIMESTAMP(3)`,
    `ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "deactivatedReason" TEXT`,

    // FeatureFlag — global feature toggles
    `CREATE TABLE IF NOT EXISTS "FeatureFlag" (
      "id" TEXT NOT NULL,
      "key" TEXT NOT NULL,
      "description" TEXT,
      "enabledGlobally" BOOLEAN NOT NULL DEFAULT true,
      "orgOverrides" TEXT,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL,
      CONSTRAINT "FeatureFlag_pkey" PRIMARY KEY ("id")
    )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "FeatureFlag_key_key" ON "FeatureFlag"("key")`,

    // DailyReport — approval workflow columns
    `ALTER TABLE "DailyReport" ADD COLUMN IF NOT EXISTS "submittedAt" TIMESTAMPTZ`,
    `ALTER TABLE "DailyReport" ADD COLUMN IF NOT EXISTS "submittedById" TEXT`,
    `ALTER TABLE "DailyReport" ADD COLUMN IF NOT EXISTS "clientApprovedAt" TIMESTAMPTZ`,
    `ALTER TABLE "DailyReport" ADD COLUMN IF NOT EXISTS "clientApprovedById" TEXT`,
    `ALTER TABLE "DailyReport" ADD COLUMN IF NOT EXISTS "clientApprovalNote" TEXT`,
    `ALTER TABLE "DailyReport" ADD COLUMN IF NOT EXISTS "archivedAt" TIMESTAMPTZ`,

    // ReportTemplate — cell-based PDF designer templates
    `CREATE TABLE IF NOT EXISTS "ReportTemplate" (
      "id" TEXT NOT NULL,
      "name" TEXT NOT NULL,
      "entityType" TEXT NOT NULL,
      "scope" TEXT NOT NULL DEFAULT 'user',
      "projectId" TEXT,
      "ownerId" TEXT,
      "organizationId" TEXT,
      "layout" TEXT NOT NULL,
      "isDefault" BOOLEAN NOT NULL DEFAULT false,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
      "updatedAt" TIMESTAMPTZ NOT NULL,
      CONSTRAINT "ReportTemplate_pkey" PRIMARY KEY ("id")
    )`,
    `CREATE INDEX IF NOT EXISTS "ReportTemplate_entityType_scope_idx" ON "ReportTemplate"("entityType", "scope")`,
    `CREATE INDEX IF NOT EXISTS "ReportTemplate_projectId_idx" ON "ReportTemplate"("projectId")`,
    `CREATE INDEX IF NOT EXISTS "ReportTemplate_ownerId_idx" ON "ReportTemplate"("ownerId")`,
    `CREATE INDEX IF NOT EXISTS "ReportTemplate_organizationId_idx" ON "ReportTemplate"("organizationId")`,
    `DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ReportTemplate_projectId_fkey') THEN
        ALTER TABLE "ReportTemplate" ADD CONSTRAINT "ReportTemplate_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE;
      END IF;
    END $$`,
    `DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ReportTemplate_ownerId_fkey') THEN
        ALTER TABLE "ReportTemplate" ADD CONSTRAINT "ReportTemplate_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL;
      END IF;
    END $$`,
    `DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ReportTemplate_organizationId_fkey') THEN
        ALTER TABLE "ReportTemplate" ADD CONSTRAINT "ReportTemplate_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL;
      END IF;
    END $$`,

    // RFI — subcontractor link
    `ALTER TABLE "Rfi" ADD COLUMN IF NOT EXISTS "subcontractorId" TEXT`,
    `CREATE INDEX IF NOT EXISTS "Rfi_subcontractorId_idx" ON "Rfi"("subcontractorId")`,

    // DailyProgramTask — subcontractor link
    `ALTER TABLE "DailyProgramTask" ADD COLUMN IF NOT EXISTS "subcontractorId" TEXT`,
    `CREATE INDEX IF NOT EXISTS "DailyProgramTask_subcontractorId_idx" ON "DailyProgramTask"("subcontractorId")`,

    // Foreign keys for subcontractor relations
    `DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Rfi_subcontractorId_fkey') THEN
        ALTER TABLE "Rfi" ADD CONSTRAINT "Rfi_subcontractorId_fkey" FOREIGN KEY ("subcontractorId") REFERENCES "Subcontractor"("id") ON DELETE SET NULL;
      END IF;
    END $$`,
    `DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'DailyProgramTask_subcontractorId_fkey') THEN
        ALTER TABLE "DailyProgramTask" ADD CONSTRAINT "DailyProgramTask_subcontractorId_fkey" FOREIGN KEY ("subcontractorId") REFERENCES "Subcontractor"("id") ON DELETE SET NULL;
      END IF;
    END $$`,

    // ApprovedDocument — signed hardcopy archive for any exportable entity
    `CREATE TABLE IF NOT EXISTS "ApprovedDocument" (
      "id" TEXT NOT NULL,
      "projectId" TEXT NOT NULL,
      "entityType" TEXT NOT NULL,
      "entityId" TEXT NOT NULL,
      "documentType" TEXT NOT NULL,
      "fileName" TEXT NOT NULL,
      "fileType" TEXT NOT NULL,
      "fileSize" INTEGER NOT NULL,
      "data" TEXT NOT NULL,
      "uploadedById" TEXT,
      "uploadedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
      "signedBy" TEXT,
      "signedAt" TIMESTAMPTZ,
      "receivedAt" TIMESTAMPTZ,
      "notes" TEXT,
      "pdfConfig" TEXT,
      CONSTRAINT "ApprovedDocument_pkey" PRIMARY KEY ("id")
    )`,
    `CREATE INDEX IF NOT EXISTS "ApprovedDocument_entityType_entityId_idx" ON "ApprovedDocument"("entityType", "entityId")`,
    `CREATE INDEX IF NOT EXISTS "ApprovedDocument_projectId_idx" ON "ApprovedDocument"("projectId")`,
    `CREATE INDEX IF NOT EXISTS "ApprovedDocument_uploadedById_idx" ON "ApprovedDocument"("uploadedById")`,
    `DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ApprovedDocument_projectId_fkey') THEN
        ALTER TABLE "ApprovedDocument" ADD CONSTRAINT "ApprovedDocument_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE;
      END IF;
    END $$`,
    `DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ApprovedDocument_uploadedById_fkey') THEN
        ALTER TABLE "ApprovedDocument" ADD CONSTRAINT "ApprovedDocument_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE SET NULL;
      END IF;
    END $$`,

    // ProjectCost — cost ledger (auto + manual expenses)
    `CREATE TABLE IF NOT EXISTS "ProjectCost" (
      "id" TEXT NOT NULL,
      "projectId" TEXT NOT NULL,
      "date" TIMESTAMPTZ NOT NULL DEFAULT now(),
      "amount" DOUBLE PRECISION NOT NULL,
      "category" TEXT NOT NULL,
      "subcategory" TEXT,
      "description" TEXT,
      "boqItemId" TEXT,
      "ganttTaskId" TEXT,
      "subcontractorId" TEXT,
      "source" TEXT NOT NULL DEFAULT 'manual',
      "sourceRef" TEXT,
      "sourceRefId" TEXT,
      "vendor" TEXT,
      "paymentMode" TEXT,
      "receiptData" TEXT,
      "receiptFileType" TEXT,
      "notes" TEXT,
      "createdById" TEXT,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
      CONSTRAINT "ProjectCost_pkey" PRIMARY KEY ("id")
    )`,
    `CREATE INDEX IF NOT EXISTS "ProjectCost_projectId_date_idx" ON "ProjectCost"("projectId", "date")`,
    `CREATE INDEX IF NOT EXISTS "ProjectCost_projectId_category_idx" ON "ProjectCost"("projectId", "category")`,
    `CREATE INDEX IF NOT EXISTS "ProjectCost_boqItemId_idx" ON "ProjectCost"("boqItemId")`,
    `CREATE INDEX IF NOT EXISTS "ProjectCost_ganttTaskId_idx" ON "ProjectCost"("ganttTaskId")`,
    `CREATE INDEX IF NOT EXISTS "ProjectCost_source_idx" ON "ProjectCost"("source")`,
    `DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ProjectCost_projectId_fkey') THEN
        ALTER TABLE "ProjectCost" ADD CONSTRAINT "ProjectCost_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE;
      END IF;
    END $$`,
    `DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ProjectCost_boqItemId_fkey') THEN
        ALTER TABLE "ProjectCost" ADD CONSTRAINT "ProjectCost_boqItemId_fkey" FOREIGN KEY ("boqItemId") REFERENCES "BoqItem"("id") ON DELETE SET NULL;
      END IF;
    END $$`,
    `DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ProjectCost_ganttTaskId_fkey') THEN
        ALTER TABLE "ProjectCost" ADD CONSTRAINT "ProjectCost_ganttTaskId_fkey" FOREIGN KEY ("ganttTaskId") REFERENCES "GanttTask"("id") ON DELETE SET NULL;
      END IF;
    END $$`,
    `DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ProjectCost_subcontractorId_fkey') THEN
        ALTER TABLE "ProjectCost" ADD CONSTRAINT "ProjectCost_subcontractorId_fkey" FOREIGN KEY ("subcontractorId") REFERENCES "Subcontractor"("id") ON DELETE SET NULL;
      END IF;
    END $$`,
    `DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ProjectCost_createdById_fkey') THEN
        ALTER TABLE "ProjectCost" ADD CONSTRAINT "ProjectCost_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL;
      END IF;
    END $$`,

    // Drawing — enhanced with ganttTaskId, approval workflow, createdById
    `ALTER TABLE "Drawing" ADD COLUMN IF NOT EXISTS "ganttTaskId" TEXT`,
    `ALTER TABLE "Drawing" ADD COLUMN IF NOT EXISTS "approvalStatus" TEXT NOT NULL DEFAULT 'pending'`,
    `ALTER TABLE "Drawing" ADD COLUMN IF NOT EXISTS "approvedById" TEXT`,
    `ALTER TABLE "Drawing" ADD COLUMN IF NOT EXISTS "approvedAt" TIMESTAMPTZ`,
    `ALTER TABLE "Drawing" ADD COLUMN IF NOT EXISTS "approvalNotes" TEXT`,
    `ALTER TABLE "Drawing" ADD COLUMN IF NOT EXISTS "createdById" TEXT`,
    `CREATE INDEX IF NOT EXISTS "Drawing_projectId_status_idx" ON "Drawing"("projectId", "status")`,
    `CREATE INDEX IF NOT EXISTS "Drawing_ganttTaskId_idx" ON "Drawing"("ganttTaskId")`,
    `DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Drawing_ganttTaskId_fkey') THEN
        ALTER TABLE "Drawing" ADD CONSTRAINT "Drawing_ganttTaskId_fkey" FOREIGN KEY ("ganttTaskId") REFERENCES "GanttTask"("id") ON DELETE SET NULL;
      END IF;
    END $$`,

    // DrawingRevision — enhanced with fileData, approval, createdById
    `ALTER TABLE "DrawingRevision" ADD COLUMN IF NOT EXISTS "fileData" TEXT`,
    `ALTER TABLE "DrawingRevision" ADD COLUMN IF NOT EXISTS "fileName" TEXT`,
    `ALTER TABLE "DrawingRevision" ADD COLUMN IF NOT EXISTS "fileType" TEXT`,
    `ALTER TABLE "DrawingRevision" ADD COLUMN IF NOT EXISTS "approvalStatus" TEXT NOT NULL DEFAULT 'pending'`,
    `ALTER TABLE "DrawingRevision" ADD COLUMN IF NOT EXISTS "approvedById" TEXT`,
    `ALTER TABLE "DrawingRevision" ADD COLUMN IF NOT EXISTS "approvedAt" TIMESTAMPTZ`,
    `ALTER TABLE "DrawingRevision" ADD COLUMN IF NOT EXISTS "approvalNotes" TEXT`,
    `ALTER TABLE "DrawingRevision" ADD COLUMN IF NOT EXISTS "createdById" TEXT`,
    `ALTER TABLE "DrawingRevision" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now()`,

    // Correspondence — formal letter tracking
    `CREATE TABLE IF NOT EXISTS "Correspondence" (
      "id" TEXT NOT NULL,
      "projectId" TEXT NOT NULL,
      "direction" TEXT NOT NULL DEFAULT 'incoming',
      "theirRef" TEXT,
      "ourRef" TEXT,
      "date" TIMESTAMPTZ NOT NULL DEFAULT now(),
      "receivedDate" TIMESTAMPTZ,
      "fromParty" TEXT,
      "fromName" TEXT,
      "toParty" TEXT,
      "toName" TEXT,
      "subject" TEXT NOT NULL,
      "category" TEXT NOT NULL DEFAULT 'other',
      "letterType" TEXT NOT NULL DEFAULT 'informative',
      "actionAssignedTo" TEXT,
      "replyDraftedBy" TEXT,
      "replyDueDate" TIMESTAMPTZ,
      "replyStatus" TEXT NOT NULL DEFAULT 'not_started',
      "replySentDate" TIMESTAMPTZ,
      "replyOurRef" TEXT,
      "replyNotes" TEXT,
      "fileData" TEXT,
      "fileName" TEXT,
      "fileType" TEXT,
      "replyFileData" TEXT,
      "replyFileName" TEXT,
      "replyFileType" TEXT,
      "linkedRfiId" TEXT,
      "linkedBoqItemId" TEXT,
      "linkedGanttTaskId" TEXT,
      "statusHistory" TEXT,
      "createdById" TEXT,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
      "updatedAt" TIMESTAMPTZ NOT NULL,
      CONSTRAINT "Correspondence_pkey" PRIMARY KEY ("id")
    )`,
    `CREATE INDEX IF NOT EXISTS "Correspondence_projectId_direction_idx" ON "Correspondence"("projectId", "direction")`,
    `CREATE INDEX IF NOT EXISTS "Correspondence_projectId_replyStatus_idx" ON "Correspondence"("projectId", "replyStatus")`,
    `CREATE INDEX IF NOT EXISTS "Correspondence_projectId_category_idx" ON "Correspondence"("projectId", "category")`,
    `CREATE INDEX IF NOT EXISTS "Correspondence_replyDueDate_idx" ON "Correspondence"("replyDueDate")`,
    `DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Correspondence_projectId_fkey') THEN
        ALTER TABLE "Correspondence" ADD CONSTRAINT "Correspondence_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE;
      END IF;
    END $$`,

    // Correspondence — thread linking + EOT + CC
    `ALTER TABLE "Correspondence" ADD COLUMN IF NOT EXISTS "repliesToId" TEXT`,
    `ALTER TABLE "Correspondence" ADD COLUMN IF NOT EXISTS "ccList" TEXT`,
    `ALTER TABLE "Correspondence" ADD COLUMN IF NOT EXISTS "eotDaysClaimed" DOUBLE PRECISION`,
    `ALTER TABLE "Correspondence" ADD COLUMN IF NOT EXISTS "eotDaysGranted" DOUBLE PRECISION`,
    `ALTER TABLE "Correspondence" ADD COLUMN IF NOT EXISTS "eotStatus" TEXT`,
    `ALTER TABLE "Correspondence" ADD COLUMN IF NOT EXISTS "eotLinkedTaskIds" TEXT`,
    `CREATE INDEX IF NOT EXISTS "Correspondence_projectId_letterType_idx" ON "Correspondence"("projectId", "letterType")`,
    `CREATE INDEX IF NOT EXISTS "Correspondence_repliesToId_idx" ON "Correspondence"("repliesToId")`,
    `DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Correspondence_repliesToId_fkey') THEN
        ALTER TABLE "Correspondence" ADD CONSTRAINT "Correspondence_repliesToId_fkey" FOREIGN KEY ("repliesToId") REFERENCES "Correspondence"("id") ON DELETE SET NULL;
      END IF;
    END $$`,

    // DrawingMarkup — annotations
    `CREATE TABLE IF NOT EXISTS "DrawingMarkup" (
      "id" TEXT NOT NULL,
      "drawingId" TEXT NOT NULL,
      "revisionId" TEXT,
      "type" TEXT NOT NULL,
      "x" DOUBLE PRECISION NOT NULL,
      "y" DOUBLE PRECISION NOT NULL,
      "w" DOUBLE PRECISION,
      "h" DOUBLE PRECISION,
      "rotation" DOUBLE PRECISION,
      "color" TEXT NOT NULL DEFAULT '#ef4444',
      "text" TEXT,
      "linkedItemId" TEXT,
      "linkedItemType" TEXT,
      "createdById" TEXT,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
      CONSTRAINT "DrawingMarkup_pkey" PRIMARY KEY ("id")
    )`,
    `CREATE INDEX IF NOT EXISTS "DrawingMarkup_drawingId_idx" ON "DrawingMarkup"("drawingId")`,
    `CREATE INDEX IF NOT EXISTS "DrawingMarkup_revisionId_idx" ON "DrawingMarkup"("revisionId")`,
    `DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'DrawingMarkup_drawingId_fkey') THEN
        ALTER TABLE "DrawingMarkup" ADD CONSTRAINT "DrawingMarkup_drawingId_fkey" FOREIGN KEY ("drawingId") REFERENCES "Drawing"("id") ON DELETE CASCADE;
      END IF;
    END $$`,

    // DrawingMarkup — new columns for bluebeam-style markups
    `DO $$ BEGIN ALTER TABLE "DrawingMarkup" ADD COLUMN IF NOT EXISTS "x2" DOUBLE PRECISION; EXCEPTION WHEN duplicate_column THEN NULL; END $$`,
    `DO $$ BEGIN ALTER TABLE "DrawingMarkup" ADD COLUMN IF NOT EXISTS "y2" DOUBLE PRECISION; EXCEPTION WHEN duplicate_column THEN NULL; END $$`,
    `DO $$ BEGIN ALTER TABLE "DrawingMarkup" ADD COLUMN IF NOT EXISTS "strokeWidth" DOUBLE PRECISION DEFAULT 2; EXCEPTION WHEN duplicate_column THEN NULL; END $$`,
    `DO $$ BEGIN ALTER TABLE "DrawingMarkup" ADD COLUMN IF NOT EXISTS "opacity" DOUBLE PRECISION DEFAULT 1; EXCEPTION WHEN duplicate_column THEN NULL; END $$`,
    `DO $$ BEGIN ALTER TABLE "DrawingMarkup" ADD COLUMN IF NOT EXISTS "points" TEXT; EXCEPTION WHEN duplicate_column THEN NULL; END $$`,
    `DO $$ BEGIN ALTER TABLE "DrawingMarkup" ADD COLUMN IF NOT EXISTS "stampType" TEXT; EXCEPTION WHEN duplicate_column THEN NULL; END $$`,

    // Drawing — scale fields for real-world measurements
    `DO $$ BEGIN ALTER TABLE "Drawing" ADD COLUMN IF NOT EXISTS "scaleValue" DOUBLE PRECISION; EXCEPTION WHEN duplicate_column THEN NULL; END $$`,
    `DO $$ BEGIN ALTER TABLE "Drawing" ADD COLUMN IF NOT EXISTS "scaleUnit" TEXT DEFAULT 'm'; EXCEPTION WHEN duplicate_column THEN NULL; END $$`,

    // DrawingSet — group drawings
    `CREATE TABLE IF NOT EXISTS "DrawingSet" (
      "id" TEXT NOT NULL,
      "projectId" TEXT NOT NULL,
      "name" TEXT NOT NULL,
      "description" TEXT,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
      CONSTRAINT "DrawingSet_pkey" PRIMARY KEY ("id")
    )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "DrawingSet_projectId_name_key" ON "DrawingSet"("projectId", "name")`,
    `CREATE INDEX IF NOT EXISTS "DrawingSet_projectId_idx" ON "DrawingSet"("projectId")`,
    `DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'DrawingSet_projectId_fkey') THEN
        ALTER TABLE "DrawingSet" ADD CONSTRAINT "DrawingSet_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE;
      END IF;
    END $$`,

    // Drawing — add drawingSetId
    `ALTER TABLE "Drawing" ADD COLUMN IF NOT EXISTS "drawingSetId" TEXT`,
    `DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Drawing_drawingSetId_fkey') THEN
        ALTER TABLE "Drawing" ADD CONSTRAINT "Drawing_drawingSetId_fkey" FOREIGN KEY ("drawingSetId") REFERENCES "DrawingSet"("id") ON DELETE SET NULL;
      END IF;
    END $$`,

    // EquipmentRental — equipment rental tracking
    `CREATE TABLE IF NOT EXISTS "EquipmentRental" (
      "id" TEXT NOT NULL,
      "equipmentId" TEXT NOT NULL,
      "projectId" TEXT NOT NULL,
      "isExternal" BOOLEAN NOT NULL DEFAULT false,
      "vendorName" TEXT,
      "vendorPhone" TEXT,
      "rentalType" TEXT NOT NULL DEFAULT 'daily',
      "rentalRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
      "startDate" TIMESTAMPTZ NOT NULL DEFAULT now(),
      "scheduledEndDate" TIMESTAMPTZ,
      "storedFromDate" TIMESTAMPTZ,
      "actualReturnDate" TIMESTAMPTZ,
      "status" TEXT NOT NULL DEFAULT 'active',
      "totalBillableDays" DOUBLE PRECISION,
      "totalRentalCost" DOUBLE PRECISION,
      "notes" TEXT,
      "createdById" TEXT,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
      "updatedAt" TIMESTAMPTZ NOT NULL,
      CONSTRAINT "EquipmentRental_pkey" PRIMARY KEY ("id")
    )`,
    `CREATE INDEX IF NOT EXISTS "EquipmentRental_equipmentId_idx" ON "EquipmentRental"("equipmentId")`,
    `CREATE INDEX IF NOT EXISTS "EquipmentRental_projectId_status_idx" ON "EquipmentRental"("projectId", "status")`,
    `DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'EquipmentRental_equipmentId_fkey') THEN
        ALTER TABLE "EquipmentRental" ADD CONSTRAINT "EquipmentRental_equipmentId_fkey" FOREIGN KEY ("equipmentId") REFERENCES "Equipment"("id") ON DELETE CASCADE;
      END IF;
    END $$`,
    `DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'EquipmentRental_projectId_fkey') THEN
        ALTER TABLE "EquipmentRental" ADD CONSTRAINT "EquipmentRental_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE;
      END IF;
    END $$`,

    // EquipmentCrew — operators/drivers/helpers per rental
    `CREATE TABLE IF NOT EXISTS "EquipmentCrew" (
      "id" TEXT NOT NULL,
      "rentalId" TEXT NOT NULL,
      "name" TEXT NOT NULL,
      "role" TEXT NOT NULL DEFAULT 'operator',
      "phone" TEXT,
      "salaryType" TEXT NOT NULL DEFAULT 'daily',
      "salaryRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
      "salaryPaidBy" TEXT NOT NULL DEFAULT 'project',
      "allowanceType" TEXT NOT NULL DEFAULT 'daily',
      "allowanceRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
      "allowancePaidBy" TEXT NOT NULL DEFAULT 'project',
      "lodgingType" TEXT NOT NULL DEFAULT 'none',
      "lodgingRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
      "lodgingPaidBy" TEXT NOT NULL DEFAULT 'project',
      "foodingType" TEXT NOT NULL DEFAULT 'none',
      "foodingRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
      "foodingPaidBy" TEXT NOT NULL DEFAULT 'project',
      "startDate" TIMESTAMPTZ NOT NULL DEFAULT now(),
      "endDate" TIMESTAMPTZ,
      "notes" TEXT,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
      "updatedAt" TIMESTAMPTZ NOT NULL,
      CONSTRAINT "EquipmentCrew_pkey" PRIMARY KEY ("id")
    )`,
    `CREATE INDEX IF NOT EXISTS "EquipmentCrew_rentalId_idx" ON "EquipmentCrew"("rentalId")`,
    `DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'EquipmentCrew_rentalId_fkey') THEN
        ALTER TABLE "EquipmentCrew" ADD CONSTRAINT "EquipmentCrew_rentalId_fkey" FOREIGN KEY ("rentalId") REFERENCES "EquipmentRental"("id") ON DELETE CASCADE;
      END IF;
    END $$`,

    // EquipmentVendor — vendor master data
    `CREATE TABLE IF NOT EXISTS "EquipmentVendor" (
      "id" TEXT NOT NULL,
      "projectId" TEXT NOT NULL,
      "name" TEXT NOT NULL,
      "contact" TEXT,
      "phone" TEXT,
      "email" TEXT,
      "pan" TEXT,
      "address" TEXT,
      "status" TEXT NOT NULL DEFAULT 'active',
      "notes" TEXT,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
      "updatedAt" TIMESTAMPTZ NOT NULL,
      CONSTRAINT "EquipmentVendor_pkey" PRIMARY KEY ("id")
    )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "EquipmentVendor_projectId_name_key" ON "EquipmentVendor"("projectId", "name")`,
    `CREATE INDEX IF NOT EXISTS "EquipmentVendor_projectId_idx" ON "EquipmentVendor"("projectId")`,
    `DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'EquipmentVendor_projectId_fkey') THEN
        ALTER TABLE "EquipmentVendor" ADD CONSTRAINT "EquipmentVendor_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE;
      END IF;
    END $$`,

    // EquipmentRental — enhanced with vendor, maintenance, consumables, agreement
    `ALTER TABLE "EquipmentRental" ADD COLUMN IF NOT EXISTS "vendorId" TEXT`,
    `ALTER TABLE "EquipmentRental" ADD COLUMN IF NOT EXISTS "maintenanceBy" TEXT NOT NULL DEFAULT 'vendor'`,
    `ALTER TABLE "EquipmentRental" ADD COLUMN IF NOT EXISTS "maintenanceMinContractor" DOUBLE PRECISION NOT NULL DEFAULT 0`,
    `ALTER TABLE "EquipmentRental" ADD COLUMN IF NOT EXISTS "consumablesBy" TEXT NOT NULL DEFAULT 'vendor'`,
    `ALTER TABLE "EquipmentRental" ADD COLUMN IF NOT EXISTS "agreementFileData" TEXT`,
    `ALTER TABLE "EquipmentRental" ADD COLUMN IF NOT EXISTS "agreementFileName" TEXT`,
    `ALTER TABLE "EquipmentRental" ADD COLUMN IF NOT EXISTS "agreementFileType" TEXT`,
    `ALTER TABLE "EquipmentRental" ADD COLUMN IF NOT EXISTS "totalDeductions" DOUBLE PRECISION NOT NULL DEFAULT 0`,
    `CREATE INDEX IF NOT EXISTS "EquipmentRental_vendorId_idx" ON "EquipmentRental"("vendorId")`,
    `DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'EquipmentRental_vendorId_fkey') THEN
        ALTER TABLE "EquipmentRental" ADD CONSTRAINT "EquipmentRental_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "EquipmentVendor"("id") ON DELETE SET NULL;
      END IF;
    END $$`,

    // EquipmentDamage — damage incident tracking
    `CREATE TABLE IF NOT EXISTS "EquipmentDamage" (
      "id" TEXT NOT NULL,
      "rentalId" TEXT NOT NULL,
      "date" TIMESTAMPTZ NOT NULL DEFAULT now(),
      "description" TEXT NOT NULL,
      "damageType" TEXT NOT NULL DEFAULT 'normal_wear',
      "responsibleParty" TEXT NOT NULL DEFAULT 'contractor',
      "repairCost" DOUBLE PRECISION NOT NULL DEFAULT 0,
      "paidBy" TEXT NOT NULL DEFAULT 'contractor',
      "contractorShare" DOUBLE PRECISION,
      "vendorShare" DOUBLE PRECISION,
      "status" TEXT NOT NULL DEFAULT 'reported',
      "photoData" TEXT,
      "photoName" TEXT,
      "photoType" TEXT,
      "resolvedDate" TIMESTAMPTZ,
      "resolvedNotes" TEXT,
      "createdById" TEXT,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
      CONSTRAINT "EquipmentDamage_pkey" PRIMARY KEY ("id")
    )`,
    `CREATE INDEX IF NOT EXISTS "EquipmentDamage_rentalId_idx" ON "EquipmentDamage"("rentalId")`,
    `CREATE INDEX IF NOT EXISTS "EquipmentDamage_date_idx" ON "EquipmentDamage"("date")`,
    `DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'EquipmentDamage_rentalId_fkey') THEN
        ALTER TABLE "EquipmentDamage" ADD CONSTRAINT "EquipmentDamage_rentalId_fkey" FOREIGN KEY ("rentalId") REFERENCES "EquipmentRental"("id") ON DELETE CASCADE;
      END IF;
    END $$`,

    // Submittal — shop drawing/material approval tracking
    `CREATE TABLE IF NOT EXISTS "Submittal" (
      "id" TEXT NOT NULL,
      "projectId" TEXT NOT NULL,
      "number" TEXT NOT NULL,
      "title" TEXT NOT NULL,
      "description" TEXT,
      "type" TEXT NOT NULL DEFAULT 'shop_drawing',
      "category" TEXT,
      "status" TEXT NOT NULL DEFAULT 'draft',
      "submittedDate" TIMESTAMPTZ,
      "reviewedDate" TIMESTAMPTZ,
      "reviewedBy" TEXT,
      "reviewComments" TEXT,
      "scheduledDate" TIMESTAMPTZ,
      "dueDate" TIMESTAMPTZ,
      "linkedBoqItemId" TEXT,
      "linkedGanttTaskId" TEXT,
      "linkedDrawingId" TEXT,
      "fileData" TEXT,
      "fileName" TEXT,
      "fileType" TEXT,
      "returnedFileData" TEXT,
      "returnedFileName" TEXT,
      "returnedFileType" TEXT,
      "createdById" TEXT,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
      "updatedAt" TIMESTAMPTZ NOT NULL,
      CONSTRAINT "Submittal_pkey" PRIMARY KEY ("id")
    )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "Submittal_projectId_number_key" ON "Submittal"("projectId", "number")`,
    `CREATE INDEX IF NOT EXISTS "Submittal_projectId_status_idx" ON "Submittal"("projectId", "status")`,
    `DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Submittal_projectId_fkey') THEN
        ALTER TABLE "Submittal" ADD CONSTRAINT "Submittal_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE;
      END IF;
    END $$`,

    // PunchItem — defect tracking
    `CREATE TABLE IF NOT EXISTS "PunchItem" (
      "id" TEXT NOT NULL,
      "projectId" TEXT NOT NULL,
      "number" TEXT NOT NULL,
      "title" TEXT NOT NULL,
      "description" TEXT NOT NULL,
      "location" TEXT,
      "category" TEXT,
      "severity" TEXT NOT NULL DEFAULT 'minor',
      "status" TEXT NOT NULL DEFAULT 'open',
      "assignedTo" TEXT,
      "dueDate" TIMESTAMPTZ,
      "linkedBoqItemId" TEXT,
      "linkedGanttTaskId" TEXT,
      "linkedDrawingId" TEXT,
      "photoData" TEXT,
      "photoName" TEXT,
      "photoType" TEXT,
      "resolvedDate" TIMESTAMPTZ,
      "resolvedBy" TEXT,
      "resolvedNotes" TEXT,
      "verifiedDate" TIMESTAMPTZ,
      "verifiedBy" TEXT,
      "createdById" TEXT,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
      "updatedAt" TIMESTAMPTZ NOT NULL,
      CONSTRAINT "PunchItem_pkey" PRIMARY KEY ("id")
    )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "PunchItem_projectId_number_key" ON "PunchItem"("projectId", "number")`,
    `CREATE INDEX IF NOT EXISTS "PunchItem_projectId_status_idx" ON "PunchItem"("projectId", "status")`,
    `CREATE INDEX IF NOT EXISTS "PunchItem_projectId_severity_idx" ON "PunchItem"("projectId", "severity")`,
    `DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PunchItem_projectId_fkey') THEN
        ALTER TABLE "PunchItem" ADD CONSTRAINT "PunchItem_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE;
      END IF;
    END $$`,

    // ChatChannel
    `CREATE TABLE IF NOT EXISTS "ChatChannel" (
      "id" TEXT NOT NULL,
      "projectId" TEXT,
      "name" TEXT NOT NULL,
      "type" TEXT NOT NULL DEFAULT 'group',
      "description" TEXT,
      "createdById" TEXT,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
      "updatedAt" TIMESTAMPTZ NOT NULL,
      CONSTRAINT "ChatChannel_pkey" PRIMARY KEY ("id")
    )`,
    `CREATE INDEX IF NOT EXISTS "ChatChannel_projectId_type_idx" ON "ChatChannel"("projectId", "type")`,
    `DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ChatChannel_projectId_fkey') THEN
        ALTER TABLE "ChatChannel" ADD CONSTRAINT "ChatChannel_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE;
      END IF;
    END $$`,

    // ChatMember
    `CREATE TABLE IF NOT EXISTS "ChatMember" (
      "id" TEXT NOT NULL,
      "channelId" TEXT NOT NULL,
      "userId" TEXT NOT NULL,
      "role" TEXT NOT NULL DEFAULT 'member',
      "joinedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
      CONSTRAINT "ChatMember_pkey" PRIMARY KEY ("id")
    )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "ChatMember_channelId_userId_key" ON "ChatMember"("channelId", "userId")`,
    `CREATE INDEX IF NOT EXISTS "ChatMember_userId_idx" ON "ChatMember"("userId")`,
    `DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ChatMember_channelId_fkey') THEN
        ALTER TABLE "ChatMember" ADD CONSTRAINT "ChatMember_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "ChatChannel"("id") ON DELETE CASCADE;
      END IF;
    END $$`,

    // ChatMessage
    `CREATE TABLE IF NOT EXISTS "ChatMessage" (
      "id" TEXT NOT NULL,
      "channelId" TEXT NOT NULL,
      "userId" TEXT NOT NULL,
      "text" TEXT NOT NULL,
      "attachmentData" TEXT,
      "attachmentName" TEXT,
      "attachmentType" TEXT,
      "linkedEntityType" TEXT,
      "linkedEntityId" TEXT,
      "isPinned" BOOLEAN NOT NULL DEFAULT false,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
      CONSTRAINT "ChatMessage_pkey" PRIMARY KEY ("id")
    )`,
    `CREATE INDEX IF NOT EXISTS "ChatMessage_channelId_createdAt_idx" ON "ChatMessage"("channelId", "createdAt")`,
    `DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ChatMessage_channelId_fkey') THEN
        ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "ChatChannel"("id") ON DELETE CASCADE;
      END IF;
    END $$`,

    // ChatReadReceipt
    `CREATE TABLE IF NOT EXISTS "ChatReadReceipt" (
      "id" TEXT NOT NULL,
      "channelId" TEXT NOT NULL,
      "userId" TEXT NOT NULL,
      "lastReadMessageId" TEXT,
      "lastReadAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
      CONSTRAINT "ChatReadReceipt_pkey" PRIMARY KEY ("id")
    )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "ChatReadReceipt_channelId_userId_key" ON "ChatReadReceipt"("channelId", "userId")`,
    `DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ChatReadReceipt_channelId_fkey') THEN
        ALTER TABLE "ChatReadReceipt" ADD CONSTRAINT "ChatReadReceipt_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "ChatChannel"("id") ON DELETE CASCADE;
      END IF;
    END $$`,

    // IPC — tax fields (VAT/TDS)
    `ALTER TABLE "Ipc" ADD COLUMN IF NOT EXISTS "vatPercent" DOUBLE PRECISION NOT NULL DEFAULT 13`,
    `ALTER TABLE "Ipc" ADD COLUMN IF NOT EXISTS "vatAmount" DOUBLE PRECISION NOT NULL DEFAULT 0`,
    `ALTER TABLE "Ipc" ADD COLUMN IF NOT EXISTS "tdsPercent" DOUBLE PRECISION NOT NULL DEFAULT 0`,
    `ALTER TABLE "Ipc" ADD COLUMN IF NOT EXISTS "tdsAmount" DOUBLE PRECISION NOT NULL DEFAULT 0`,
    `ALTER TABLE "Ipc" ADD COLUMN IF NOT EXISTS "totalWithVat" DOUBLE PRECISION NOT NULL DEFAULT 0`,
    `ALTER TABLE "Ipc" ADD COLUMN IF NOT EXISTS "finalPayable" DOUBLE PRECISION NOT NULL DEFAULT 0`,

    // MaterialTransaction — tax fields (VAT/TDS for receive transactions)
    `ALTER TABLE "MaterialTransaction" ADD COLUMN IF NOT EXISTS "vatPercent" DOUBLE PRECISION NOT NULL DEFAULT 0`,
    `ALTER TABLE "MaterialTransaction" ADD COLUMN IF NOT EXISTS "vatAmount" DOUBLE PRECISION NOT NULL DEFAULT 0`,
    `ALTER TABLE "MaterialTransaction" ADD COLUMN IF NOT EXISTS "tdsPercent" DOUBLE PRECISION NOT NULL DEFAULT 0`,
    `ALTER TABLE "MaterialTransaction" ADD COLUMN IF NOT EXISTS "tdsAmount" DOUBLE PRECISION NOT NULL DEFAULT 0`,
    `ALTER TABLE "MaterialTransaction" ADD COLUMN IF NOT EXISTS "totalWithVat" DOUBLE PRECISION NOT NULL DEFAULT 0`,
    `ALTER TABLE "MaterialTransaction" ADD COLUMN IF NOT EXISTS "netPayable" DOUBLE PRECISION NOT NULL DEFAULT 0`,
    `ALTER TABLE "MaterialTransaction" ADD COLUMN IF NOT EXISTS "supplierInvoiceNo" TEXT`,
    `ALTER TABLE "MaterialTransaction" ADD COLUMN IF NOT EXISTS "supplierPan" TEXT`,
    // MaterialTransaction — IPC deduction tracking (prevents double-counting
    // of material deductions across multiple IPCs for the same subcontractor).
    // When an IPC is approved, debitable materials are marked with the IPC ID
    // so subsequent IPC recalculations don't re-deduct them.
    `ALTER TABLE "MaterialTransaction" ADD COLUMN IF NOT EXISTS "deductedInIpcId" TEXT`,

    // Payment — vendor/subcontractor payment tracking
    `CREATE TABLE IF NOT EXISTS "Payment" (
      "id" TEXT NOT NULL, "projectId" TEXT NOT NULL,
      "payeeType" TEXT NOT NULL, "payeeId" TEXT, "payeeName" TEXT NOT NULL,
      "ipcId" TEXT, "invoiceNumber" TEXT,
      "amount" DOUBLE PRECISION NOT NULL, "tdsDeducted" DOUBLE PRECISION NOT NULL DEFAULT 0,
      "vatIncluded" DOUBLE PRECISION NOT NULL DEFAULT 0, "netPaid" DOUBLE PRECISION NOT NULL DEFAULT 0,
      "paymentDate" TIMESTAMPTZ NOT NULL DEFAULT now(), "paymentMode" TEXT NOT NULL DEFAULT 'bank_transfer',
      "chequeNo" TEXT, "bankRef" TEXT, "status" TEXT NOT NULL DEFAULT 'paid',
      "retentionReleased" DOUBLE PRECISION NOT NULL DEFAULT 0, "notes" TEXT, "createdById" TEXT,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
      CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
    )`,
    `CREATE INDEX IF NOT EXISTS "Payment_projectId_payeeType_idx" ON "Payment"("projectId", "payeeType")`,
    `CREATE INDEX IF NOT EXISTS "Payment_projectId_paymentDate_idx" ON "Payment"("projectId", "paymentDate")`,
    `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Payment_projectId_fkey') THEN ALTER TABLE "Payment" ADD CONSTRAINT "Payment_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE; END IF; END $$`,

    // SafetyIncident
    `CREATE TABLE IF NOT EXISTS "SafetyIncident" (
      "id" TEXT NOT NULL, "projectId" TEXT NOT NULL,
      "date" TIMESTAMPTZ NOT NULL DEFAULT now(), "type" TEXT NOT NULL DEFAULT 'incident',
      "severity" TEXT NOT NULL DEFAULT 'minor', "title" TEXT NOT NULL, "description" TEXT NOT NULL,
      "location" TEXT, "reportedBy" TEXT, "involvedPersons" TEXT, "actionTaken" TEXT,
      "rootCause" TEXT, "preventiveAction" TEXT, "status" TEXT NOT NULL DEFAULT 'reported',
      "photoData" TEXT, "photoName" TEXT, "photoType" TEXT,
      "toolboxTopic" TEXT, "toolboxAttendees" TEXT, "createdById" TEXT,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
      CONSTRAINT "SafetyIncident_pkey" PRIMARY KEY ("id")
    )`,
    `CREATE INDEX IF NOT EXISTS "SafetyIncident_projectId_type_idx" ON "SafetyIncident"("projectId", "type")`,
    `CREATE INDEX IF NOT EXISTS "SafetyIncident_projectId_status_idx" ON "SafetyIncident"("projectId", "status")`,
    `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'SafetyIncident_projectId_fkey') THEN ALTER TABLE "SafetyIncident" ADD CONSTRAINT "SafetyIncident_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE; END IF; END $$`,

    // QualityInspection
    `CREATE TABLE IF NOT EXISTS "QualityInspection" (
      "id" TEXT NOT NULL, "projectId" TEXT NOT NULL,
      "number" TEXT NOT NULL, "title" TEXT NOT NULL,
      "inspectionType" TEXT NOT NULL DEFAULT 'work_inspection',
      "status" TEXT NOT NULL DEFAULT 'requested',
      "requestedDate" TIMESTAMPTZ NOT NULL DEFAULT now(), "scheduledDate" TIMESTAMPTZ,
      "inspectedDate" TIMESTAMPTZ, "inspectedBy" TEXT, "location" TEXT,
      "boqItemId" TEXT, "ganttTaskId" TEXT, "checklist" TEXT,
      "result" TEXT, "remarks" TEXT, "ncrNumber" TEXT,
      "photoData" TEXT, "photoName" TEXT, "photoType" TEXT,
      "createdById" TEXT, "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(), "updatedAt" TIMESTAMPTZ NOT NULL,
      CONSTRAINT "QualityInspection_pkey" PRIMARY KEY ("id")
    )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "QualityInspection_projectId_number_key" ON "QualityInspection"("projectId", "number")`,
    `CREATE INDEX IF NOT EXISTS "QualityInspection_projectId_status_idx" ON "QualityInspection"("projectId", "status")`,
    `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'QualityInspection_projectId_fkey') THEN ALTER TABLE "QualityInspection" ADD CONSTRAINT "QualityInspection_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE; END IF; END $$`,

    // Meeting
    `CREATE TABLE IF NOT EXISTS "Meeting" (
      "id" TEXT NOT NULL, "projectId" TEXT NOT NULL,
      "title" TEXT NOT NULL, "type" TEXT NOT NULL DEFAULT 'site_coordination',
      "date" TIMESTAMPTZ NOT NULL DEFAULT now(), "location" TEXT,
      "attendees" TEXT, "agenda" TEXT, "minutes" TEXT,
      "status" TEXT NOT NULL DEFAULT 'scheduled', "createdById" TEXT,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(), "updatedAt" TIMESTAMPTZ NOT NULL,
      CONSTRAINT "Meeting_pkey" PRIMARY KEY ("id")
    )`,
    `CREATE INDEX IF NOT EXISTS "Meeting_projectId_date_idx" ON "Meeting"("projectId", "date")`,
    `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Meeting_projectId_fkey') THEN ALTER TABLE "Meeting" ADD CONSTRAINT "Meeting_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE; END IF; END $$`,

    // MeetingActionItem
    `CREATE TABLE IF NOT EXISTS "MeetingActionItem" (
      "id" TEXT NOT NULL, "meetingId" TEXT NOT NULL,
      "description" TEXT NOT NULL, "assignedTo" TEXT NOT NULL,
      "dueDate" TIMESTAMPTZ, "status" TEXT NOT NULL DEFAULT 'open',
      "completedDate" TIMESTAMPTZ, "notes" TEXT,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
      CONSTRAINT "MeetingActionItem_pkey" PRIMARY KEY ("id")
    )`,
    `CREATE INDEX IF NOT EXISTS "MeetingActionItem_meetingId_idx" ON "MeetingActionItem"("meetingId")`,
    `CREATE INDEX IF NOT EXISTS "MeetingActionItem_status_idx" ON "MeetingActionItem"("status")`,
    `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'MeetingActionItem_meetingId_fkey') THEN ALTER TABLE "MeetingActionItem" ADD CONSTRAINT "MeetingActionItem_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "Meeting"("id") ON DELETE CASCADE; END IF; END $$`,

    // Project — configurable cost rates
    `ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "skilledWageRate" DOUBLE PRECISION`,
    `ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "unskilledWageRate" DOUBLE PRECISION`,
    `ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "supervisorWageRate" DOUBLE PRECISION`,
    `ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "ownedEquipRate" DOUBLE PRECISION`,
    `ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "hiredEquipRate" DOUBLE PRECISION`,
    `ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "fuelPricePerLiter" DOUBLE PRECISION`,

    // Create indexes for new columns (idempotent)
    `CREATE INDEX IF NOT EXISTS "User_organizationId_idx" ON "User"("organizationId")`,
    `CREATE INDEX IF NOT EXISTS "Project_organizationId_idx" ON "Project"("organizationId")`,
    `CREATE INDEX IF NOT EXISTS "GanttVersion_scheduleType_idx" ON "GanttVersion"("projectId", "scheduleType")`,
    `CREATE INDEX IF NOT EXISTS "GanttVersion_revisionOfId_idx" ON "GanttVersion"("revisionOfId")`,

    // Add foreign key constraints for new columns (idempotent — wrapped in DO block)
    `DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'User_organizationId_fkey') THEN
        ALTER TABLE "User" ADD CONSTRAINT "User_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL;
      END IF;
    END $$`,
    `DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Project_organizationId_fkey') THEN
        ALTER TABLE "Project" ADD CONSTRAINT "Project_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL;
      END IF;
    END $$`,
    `DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'GanttVersion_revisionOfId_fkey') THEN
        ALTER TABLE "GanttVersion" ADD CONSTRAINT "GanttVersion_revisionOfId_fkey" FOREIGN KEY ("revisionOfId") REFERENCES "GanttVersion"("id") ON DELETE SET NULL;
      END IF;
    END $$`,

    // Drop the global unique constraint on Project.code and add per-org unique
    // Drop constraint by name (if it exists as a table constraint)
    `DO $$ BEGIN
      IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Project_code_key') THEN
        ALTER TABLE "Project" DROP CONSTRAINT "Project_code_key";
      END IF;
    END $$`,
    // Also drop any unique index on just "code" (could be named differently)
    `DO $$ BEGIN
      DECLARE idx_rec RECORD;
      BEGIN
        FOR idx_rec IN
          SELECT indexname FROM pg_indexes
          WHERE tablename = 'Project'
          AND indexdef ILIKE '%UNIQUE%'
          AND indexdef ILIKE '%code%'
          AND indexname NOT LIKE '%organizationId%'
        LOOP
          EXECUTE format('DROP INDEX IF EXISTS %I', idx_rec.indexname);
        END LOOP;
      END;
    END $$`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "Project_organizationId_code_key" ON "Project"("organizationId", "code")`,

    // Session — admin-kind sessions + impersonation tracking
    `ALTER TABLE "Session" ADD COLUMN IF NOT EXISTS "kind" TEXT NOT NULL DEFAULT 'user'`,
    `ALTER TABLE "Session" ADD COLUMN IF NOT EXISTS "impersonatedOrgId" TEXT`,
    `ALTER TABLE "Session" ADD COLUMN IF NOT EXISTS "impersonatedAt" TIMESTAMPTZ`,
    `ALTER TABLE "Session" ADD COLUMN IF NOT EXISTS "impersonatedReason" TEXT`,
    `CREATE INDEX IF NOT EXISTS "Session_kind_idx" ON "Session"("kind")`,
    `CREATE INDEX IF NOT EXISTS "Session_impersonatedOrgId_idx" ON "Session"("impersonatedOrgId")`,

    // AuditLog — capture impersonation context
    `ALTER TABLE "AuditLog" ADD COLUMN IF NOT EXISTS "impersonatedOrgId" TEXT`,
    `ALTER TABLE "AuditLog" ADD COLUMN IF NOT EXISTS "impersonatedByUserId" TEXT`,
    `CREATE INDEX IF NOT EXISTS "AuditLog_impersonatedOrgId_idx" ON "AuditLog"("impersonatedOrgId")`,

    // ChatMessage — @mentions support
    `ALTER TABLE "ChatMessage" ADD COLUMN IF NOT EXISTS "mentionedUserIds" TEXT`,

    // PunchItem — snag/punch list for defect tracking
    `CREATE TABLE IF NOT EXISTS "PunchItem" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "projectId" TEXT NOT NULL,
      "drawingId" TEXT,
      "revisionId" TEXT,
      "markupId" TEXT,
      "number" TEXT NOT NULL,
      "title" TEXT NOT NULL,
      "description" TEXT,
      "category" TEXT NOT NULL DEFAULT 'general',
      "severity" TEXT NOT NULL DEFAULT 'minor',
      "status" TEXT NOT NULL DEFAULT 'open',
      "location" TEXT,
      "assignedToId" TEXT,
      "dueDate" TIMESTAMP(3),
      "photoData" TEXT,
      "photoName" TEXT,
      "resolvedAt" TIMESTAMP(3),
      "resolvedById" TEXT,
      "verifiedAt" TIMESTAMP(3),
      "verifiedById" TEXT,
      "createdById" TEXT,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "PunchItem_projectId_number_key" ON "PunchItem"("projectId", "number")`,
    `CREATE INDEX IF NOT EXISTS "PunchItem_projectId_status_idx" ON "PunchItem"("projectId", "status")`,
    `CREATE INDEX IF NOT EXISTS "PunchItem_drawingId_idx" ON "PunchItem"("drawingId")`,
    `CREATE INDEX IF NOT EXISTS "PunchItem_markupId_idx" ON "PunchItem"("markupId")`,

    // DrawingMarkup — completed/staged work percentage
    `DO $$ BEGIN ALTER TABLE "DrawingMarkup" ADD COLUMN IF NOT EXISTS "percentComplete" DOUBLE PRECISION; EXCEPTION WHEN duplicate_column THEN NULL; END $$`,

    // LeaveRequest
    `CREATE TABLE IF NOT EXISTS "LeaveRequest" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "projectId" TEXT NOT NULL,
      "staffId" TEXT NOT NULL,
      "leaveType" TEXT NOT NULL DEFAULT 'casual',
      "startDate" TIMESTAMP(3) NOT NULL,
      "endDate" TIMESTAMP(3) NOT NULL,
      "totalDays" DOUBLE PRECISION NOT NULL,
      "reason" TEXT,
      "status" TEXT NOT NULL DEFAULT 'pending',
      "approvedById" TEXT,
      "approvedAt" TIMESTAMP(3),
      "rejectionReason" TEXT,
      "createdById" TEXT,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE INDEX IF NOT EXISTS "LeaveRequest_projectId_staffId_idx" ON "LeaveRequest"("projectId", "staffId")`,
    `CREATE INDEX IF NOT EXISTS "LeaveRequest_status_idx" ON "LeaveRequest"("status")`,

    // LeaveBalance
    `CREATE TABLE IF NOT EXISTS "LeaveBalance" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "projectId" TEXT NOT NULL,
      "staffId" TEXT NOT NULL,
      "leaveType" TEXT NOT NULL DEFAULT 'casual',
      "year" INTEGER NOT NULL,
      "totalAllowed" DOUBLE PRECISION NOT NULL DEFAULT 0,
      "taken" DOUBLE PRECISION NOT NULL DEFAULT 0,
      "remaining" DOUBLE PRECISION NOT NULL DEFAULT 0
    )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "LeaveBalance_projectId_staffId_leaveType_year_key" ON "LeaveBalance"("projectId", "staffId", "leaveType", "year")`,

    // SiteExpense
    `CREATE TABLE IF NOT EXISTS "SiteExpense" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "projectId" TEXT NOT NULL,
      "number" TEXT NOT NULL,
      "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "category" TEXT NOT NULL DEFAULT 'general',
      "description" TEXT NOT NULL,
      "amount" DOUBLE PRECISION NOT NULL,
      "vatAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
      "totalAmount" DOUBLE PRECISION NOT NULL,
      "paymentMode" TEXT NOT NULL DEFAULT 'cash',
      "referenceNo" TEXT,
      "vendorName" TEXT,
      "receiptData" TEXT,
      "receiptName" TEXT,
      "approvedById" TEXT,
      "approvedAt" TIMESTAMP(3),
      "status" TEXT NOT NULL DEFAULT 'pending',
      "createdById" TEXT,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "SiteExpense_projectId_number_key" ON "SiteExpense"("projectId", "number")`,
    `CREATE INDEX IF NOT EXISTS "SiteExpense_projectId_date_idx" ON "SiteExpense"("projectId", "date")`,
    `CREATE INDEX IF NOT EXISTS "SiteExpense_projectId_category_idx" ON "SiteExpense"("projectId", "category")`,

    // SubcontractorBill
    `CREATE TABLE IF NOT EXISTS "SubcontractorBill" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "projectId" TEXT NOT NULL,
      "subcontractorId" TEXT NOT NULL,
      "number" TEXT NOT NULL,
      "billDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "period" TEXT,
      "grossAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
      "retentionPercent" DOUBLE PRECISION NOT NULL DEFAULT 0,
      "retentionAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
      "vatPercent" DOUBLE PRECISION NOT NULL DEFAULT 13,
      "vatAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
      "tdsPercent" DOUBLE PRECISION NOT NULL DEFAULT 0,
      "tdsAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
      "materialDeduction" DOUBLE PRECISION NOT NULL DEFAULT 0,
      "advanceRecovery" DOUBLE PRECISION NOT NULL DEFAULT 0,
      "netPayable" DOUBLE PRECISION NOT NULL DEFAULT 0,
      "paidAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
      "status" TEXT NOT NULL DEFAULT 'draft',
      "notes" TEXT,
      "createdById" TEXT,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "SubcontractorBill_projectId_number_key" ON "SubcontractorBill"("projectId", "number")`,
    `CREATE INDEX IF NOT EXISTS "SubcontractorBill_projectId_subcontractorId_idx" ON "SubcontractorBill"("projectId", "subcontractorId")`,
    `CREATE INDEX IF NOT EXISTS "SubcontractorBill_status_idx" ON "SubcontractorBill"("status")`,

    // SubcontractorBillItem
    `CREATE TABLE IF NOT EXISTS "SubcontractorBillItem" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "billId" TEXT NOT NULL,
      "boqCode" TEXT,
      "description" TEXT NOT NULL,
      "unit" TEXT,
      "contractQty" DOUBLE PRECISION NOT NULL DEFAULT 0,
      "previousQty" DOUBLE PRECISION NOT NULL DEFAULT 0,
      "thisQty" DOUBLE PRECISION NOT NULL DEFAULT 0,
      "cumQty" DOUBLE PRECISION NOT NULL DEFAULT 0,
      "rate" DOUBLE PRECISION NOT NULL DEFAULT 0,
      "amount" DOUBLE PRECISION NOT NULL DEFAULT 0
    )`,
    `CREATE INDEX IF NOT EXISTS "SubcontractorBillItem_billId_idx" ON "SubcontractorBillItem"("billId")`,
  ];

  for (const stmt of alterStatements) {
    try {
      await db.$executeRawUnsafe(stmt);
      executed++;
    } catch (e) {
      const msg = e instanceof Error ? e.message : "";
      if (msg.includes("already exists") || msg.includes("duplicate")) {
        skipped++;
      } else {
        console.error("ALTER statement failed:", msg.slice(0, 200), "— statement:", stmt.slice(0, 80));
        failed++;
        errors.push(`${msg.slice(0, 150)} — statement: ${stmt.slice(0, 80)}`);
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // Financial Architecture — Journal Entry Foundation
  // ═══════════════════════════════════════════════════════════════
  const financialArchStatements = [
    `CREATE TABLE IF NOT EXISTS "JournalEntry" (
      "id" TEXT NOT NULL,
      "entryNumber" TEXT NOT NULL,
      "entryDate" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "miti" TEXT,
      "fiscalYearId" TEXT,
      "organizationId" TEXT,
      "source" TEXT NOT NULL,
      "sourceRefId" TEXT,
      "sourceRefType" TEXT,
      "description" TEXT NOT NULL,
      "totalDebit" DOUBLE PRECISION NOT NULL DEFAULT 0,
      "totalCredit" DOUBLE PRECISION NOT NULL DEFAULT 0,
      "isPosted" BOOLEAN NOT NULL DEFAULT false,
      "postedById" TEXT,
      "postedAt" TIMESTAMPTZ,
      "reversalOfId" TEXT,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "JournalEntry_pkey" PRIMARY KEY ("id")
    )`,
    `CREATE INDEX IF NOT EXISTS "JournalEntry_entryDate_idx" ON "JournalEntry"("entryDate")`,
    `CREATE INDEX IF NOT EXISTS "JournalEntry_source_sourceRefId_idx" ON "JournalEntry"("source", "sourceRefId")`,
    `CREATE INDEX IF NOT EXISTS "JournalEntry_fiscalYearId_idx" ON "JournalEntry"("fiscalYearId")`,
    `CREATE INDEX IF NOT EXISTS "JournalEntry_isPosted_idx" ON "JournalEntry"("isPosted")`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "JournalEntry_entryNumber_key" ON "JournalEntry"("entryNumber")`,
    // Multi-tenant org scope for journal entries. Org-level entries (HO
    // expenses, head-office bank charges) have projectId=null LINES — the
    // organizationId column is the ONLY reliable org scope for them.
    `ALTER TABLE "JournalEntry" ADD COLUMN IF NOT EXISTS "organizationId" TEXT`,
    `CREATE INDEX IF NOT EXISTS "JournalEntry_organizationId_idx" ON "JournalEntry"("organizationId")`,
    // Backfill: derive org ownership from the posting user for legacy
    // entries (idempotent — only touches rows still NULL).
    `UPDATE "JournalEntry" SET "organizationId" = u."organizationId"
       FROM "User" u
       WHERE "JournalEntry"."postedById" = u."id"
         AND u."organizationId" IS NOT NULL
         AND "JournalEntry"."organizationId" IS NULL`,

    `CREATE TABLE IF NOT EXISTS "JournalEntryLine" (
      "id" TEXT NOT NULL,
      "journalEntryId" TEXT NOT NULL,
      "lineNumber" INTEGER NOT NULL,
      "accountCode" TEXT NOT NULL,
      "accountName" TEXT NOT NULL,
      "debit" DOUBLE PRECISION NOT NULL DEFAULT 0,
      "credit" DOUBLE PRECISION NOT NULL DEFAULT 0,
      "description" TEXT,
      "projectId" TEXT,
      "partnerId" TEXT,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "JournalEntryLine_pkey" PRIMARY KEY ("id")
    )`,
    `CREATE INDEX IF NOT EXISTS "JournalEntryLine_journalEntryId_idx" ON "JournalEntryLine"("journalEntryId")`,
    `CREATE INDEX IF NOT EXISTS "JournalEntryLine_accountCode_idx" ON "JournalEntryLine"("accountCode")`,
    `CREATE INDEX IF NOT EXISTS "JournalEntryLine_projectId_idx" ON "JournalEntryLine"("projectId")`,
    `ALTER TABLE "JournalEntryLine" ADD CONSTRAINT IF NOT EXISTS "JournalEntryLine_journalEntryId_fkey" FOREIGN KEY ("journalEntryId") REFERENCES "JournalEntry"("id") ON DELETE CASCADE`,

    // Fiscal Year Locking
    `CREATE TABLE IF NOT EXISTS "FiscalYearLock" (
      "id" TEXT NOT NULL,
      "organizationId" TEXT NOT NULL,
      "fiscalYear" TEXT NOT NULL,
      "startDate" TIMESTAMPTZ NOT NULL,
      "endDate" TIMESTAMPTZ NOT NULL,
      "isLocked" BOOLEAN NOT NULL DEFAULT false,
      "lockedById" TEXT,
      "lockedAt" TIMESTAMPTZ,
      "lockNotes" TEXT,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "FiscalYearLock_pkey" PRIMARY KEY ("id")
    )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "FiscalYearLock_organizationId_fiscalYear_key" ON "FiscalYearLock"("organizationId", "fiscalYear")`,
    `CREATE INDEX IF NOT EXISTS "FiscalYearLock_organizationId_isLocked_idx" ON "FiscalYearLock"("organizationId", "isLocked")`,
    `ALTER TABLE "FiscalYearLock" ADD CONSTRAINT IF NOT EXISTS "FiscalYearLock_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE`,

    // Report Snapshot
    `CREATE TABLE IF NOT EXISTS "ReportSnapshot" (
      "id" TEXT NOT NULL,
      "organizationId" TEXT,
      "projectId" TEXT,
      "reportType" TEXT NOT NULL,
      "reportDate" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "generatedById" TEXT NOT NULL,
      "snapshotData" TEXT NOT NULL,
      "periodLabel" TEXT,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "ReportSnapshot_pkey" PRIMARY KEY ("id")
    )`,
    `CREATE INDEX IF NOT EXISTS "ReportSnapshot_organizationId_reportType_idx" ON "ReportSnapshot"("organizationId", "reportType")`,
    `CREATE INDEX IF NOT EXISTS "ReportSnapshot_projectId_reportType_idx" ON "ReportSnapshot"("projectId", "reportType")`,
    `CREATE INDEX IF NOT EXISTS "ReportSnapshot_reportDate_idx" ON "ReportSnapshot"("reportDate")`,

    // Standard Cost Codes
    `CREATE TABLE IF NOT EXISTS "CostCode" (
      "id" TEXT NOT NULL,
      "code" TEXT NOT NULL,
      "name" TEXT NOT NULL,
      "nameNp" TEXT,
      "category" TEXT NOT NULL,
      "parentId" TEXT,
      "level" INTEGER NOT NULL DEFAULT 1,
      "isActive" BOOLEAN NOT NULL DEFAULT true,
      "sortOrder" INTEGER NOT NULL DEFAULT 0,
      "isSystem" BOOLEAN NOT NULL DEFAULT false,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "CostCode_pkey" PRIMARY KEY ("id")
    )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "CostCode_code_key" ON "CostCode"("code")`,
    `CREATE INDEX IF NOT EXISTS "CostCode_category_idx" ON "CostCode"("category")`,
    `CREATE INDEX IF NOT EXISTS "CostCode_parentId_idx" ON "CostCode"("parentId")`,
    `CREATE INDEX IF NOT EXISTS "CostCode_sortOrder_idx" ON "CostCode"("sortOrder")`,
    `ALTER TABLE "CostCode" ADD CONSTRAINT IF NOT EXISTS "CostCode_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "CostCode"("id") ON DELETE SET NULL`,

    // Bank Reconciliation
    `CREATE TABLE IF NOT EXISTS "BankReconciliation" (
      "id" TEXT NOT NULL,
      "bankAccountId" TEXT NOT NULL,
      "periodStart" TIMESTAMPTZ NOT NULL,
      "periodEnd" TIMESTAMPTZ NOT NULL,
      "statementClosingBalance" DOUBLE PRECISION NOT NULL DEFAULT 0,
      "recordedBalance" DOUBLE PRECISION NOT NULL DEFAULT 0,
      "adjustedBalance" DOUBLE PRECISION NOT NULL DEFAULT 0,
      "matchedCount" INTEGER NOT NULL DEFAULT 0,
      "unmatchedStatementCount" INTEGER NOT NULL DEFAULT 0,
      "unmatchedPaymentCount" INTEGER NOT NULL DEFAULT 0,
      "outstandingPayments" DOUBLE PRECISION NOT NULL DEFAULT 0,
      "unmatchedDeposits" DOUBLE PRECISION NOT NULL DEFAULT 0,
      "isReconciled" BOOLEAN NOT NULL DEFAULT false,
      "reconciliationData" TEXT NOT NULL,
      "status" TEXT NOT NULL DEFAULT 'draft',
      "confirmedById" TEXT,
      "confirmedAt" TIMESTAMPTZ,
      "notes" TEXT,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "BankReconciliation_pkey" PRIMARY KEY ("id")
    )`,
    `CREATE INDEX IF NOT EXISTS "BankReconciliation_bankAccountId_periodStart_idx" ON "BankReconciliation"("bankAccountId", "periodStart")`,
    `CREATE INDEX IF NOT EXISTS "BankReconciliation_status_idx" ON "BankReconciliation"("status")`,
    `ALTER TABLE "BankReconciliation" ADD CONSTRAINT IF NOT EXISTS "BankReconciliation_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "CompanyBankAccount"("id") ON DELETE CASCADE`,

    // Stored File Registry — ownership map for the authenticated
    // /api/files/[key] streaming route (audit C-4 fix). Every file written
    // by src/lib/storage.ts gets a row here; the route rejects any key
    // without a registry entry (fail closed).
    `CREATE TABLE IF NOT EXISTS "StoredFile" (
      "id" TEXT NOT NULL,
      "key" TEXT NOT NULL,
      "organizationId" TEXT NOT NULL,
      "projectId" TEXT,
      "fileName" TEXT,
      "mimeType" TEXT NOT NULL,
      "size" INTEGER,
      "externalUrl" TEXT,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "StoredFile_pkey" PRIMARY KEY ("id")
    )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "StoredFile_key_key" ON "StoredFile"("key")`,
    `CREATE INDEX IF NOT EXISTS "StoredFile_organizationId_idx" ON "StoredFile"("organizationId")`,
    `ALTER TABLE "StoredFile" ADD CONSTRAINT IF NOT EXISTS "StoredFile_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE`,

    // Bank Guarantee & Insurance Policy Tracker
    `CREATE TABLE IF NOT EXISTS "BankGuarantee" (
      "id" TEXT NOT NULL,
      "organizationId" TEXT,
      "projectId" TEXT,
      "type" TEXT NOT NULL,
      "guaranteeNumber" TEXT NOT NULL,
      "issuingBank" TEXT NOT NULL,
      "branch" TEXT,
      "beneficiary" TEXT NOT NULL,
      "amount" DECIMAL(15, 2) NOT NULL,
      "currency" TEXT NOT NULL DEFAULT 'NPR',
      "issuedDate" TIMESTAMPTZ NOT NULL,
      "issuedMiti" TEXT,
      "expiryDate" TIMESTAMPTZ NOT NULL,
      "expiryMiti" TEXT,
      "claimPeriodDays" INTEGER NOT NULL DEFAULT 30,
      "claimExpiryDate" TIMESTAMPTZ,
      "status" TEXT NOT NULL DEFAULT 'active',
      "purpose" TEXT,
      "marginAmount" DECIMAL(15, 2) NOT NULL DEFAULT 0,
      "commissionRate" DECIMAL(15, 4) NOT NULL DEFAULT 0,
      "commissionPaid" DECIMAL(15, 2) NOT NULL DEFAULT 0,
      "documentUrl" TEXT,
      "documentName" TEXT,
      "amendments" JSONB NOT NULL DEFAULT '[]',
      "notes" TEXT,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "BankGuarantee_pkey" PRIMARY KEY ("id")
    )`,
    `CREATE INDEX IF NOT EXISTS "BankGuarantee_organizationId_status_expiryDate_idx" ON "BankGuarantee"("organizationId", "status", "expiryDate")`,
    `CREATE INDEX IF NOT EXISTS "BankGuarantee_projectId_status_expiryDate_idx" ON "BankGuarantee"("projectId", "status", "expiryDate")`,
    `ALTER TABLE "BankGuarantee" ADD CONSTRAINT IF NOT EXISTS "BankGuarantee_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE`,
    `ALTER TABLE "BankGuarantee" ADD CONSTRAINT IF NOT EXISTS "BankGuarantee_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE`,

    // Joint Venture Partner Agreement Tracker
    `CREATE TABLE IF NOT EXISTS "JvPartnerAgreement" (
      "id" TEXT NOT NULL,
      "organizationId" TEXT NOT NULL,
      "projectId" TEXT NOT NULL,
      "partnerName" TEXT NOT NULL,
      "partnerPan" TEXT,
      "partnerType" TEXT NOT NULL DEFAULT 'lead',
      "sharePercentage" DOUBLE PRECISION NOT NULL DEFAULT 100,
      "leadPartnerShare" DECIMAL(15, 2) NOT NULL DEFAULT 0,
      "commissionRate" DECIMAL(15, 4) NOT NULL DEFAULT 0,
      "agreementDate" TIMESTAMPTZ,
      "agreementMiti" TEXT,
      "bankName" TEXT,
      "bankAccountNumber" TEXT,
      "notes" TEXT,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "JvPartnerAgreement_pkey" PRIMARY KEY ("id")
    )`,
    `CREATE INDEX IF NOT EXISTS "JvPartnerAgreement_organizationId_projectId_idx" ON "JvPartnerAgreement"("organizationId", "projectId")`,
    `ALTER TABLE "JvPartnerAgreement" ADD CONSTRAINT IF NOT EXISTS "JvPartnerAgreement_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE`,
    `ALTER TABLE "JvPartnerAgreement" ADD CONSTRAINT IF NOT EXISTS "JvPartnerAgreement_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE`,
  ];

  for (const stmt of financialArchStatements) {
    try {
      await db.$executeRawUnsafe(stmt);
      executed++;
    } catch (e) {
      const msg = e instanceof Error ? e.message : "";
      if (msg.includes("already exists")) {
        skipped++;
      } else {
        failed++;
        errors.push(`${msg.slice(0, 150)} — statement: ${stmt.slice(0, 80)}`);
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // Decimal Precision Migration (Float → NUMERIC(15,2))
  // ═══════════════════════════════════════════════════════════════
  // Migrate critical financial amount fields from DOUBLE PRECISION
  // to NUMERIC(15,2) to eliminate floating-point rounding errors.
  // ALTER TYPE is idempotent — safe to run on already-NUMERIC columns.
  const decimalMigrationStatements = [
    `ALTER TABLE "Ipc" ALTER COLUMN "grossAmount" TYPE NUMERIC(15,2) USING "grossAmount"::NUMERIC(15,2)`,
    `ALTER TABLE "Ipc" ALTER COLUMN "netPayable" TYPE NUMERIC(15,2) USING "netPayable"::NUMERIC(15,2)`,
    `ALTER TABLE "Ipc" ALTER COLUMN "vatAmount" TYPE NUMERIC(15,2) USING "vatAmount"::NUMERIC(15,2)`,
    `ALTER TABLE "Ipc" ALTER COLUMN "totalWithVat" TYPE NUMERIC(15,2) USING "totalWithVat"::NUMERIC(15,2)`,
    `ALTER TABLE "Ipc" ALTER COLUMN "tdsAmount" TYPE NUMERIC(15,2) USING "tdsAmount"::NUMERIC(15,2)`,
    `ALTER TABLE "Ipc" ALTER COLUMN "finalPayable" TYPE NUMERIC(15,2) USING "finalPayable"::NUMERIC(15,2)`,
    `ALTER TABLE "Ipc" ALTER COLUMN "retentionAmount" TYPE NUMERIC(15,2) USING "retentionAmount"::NUMERIC(15,2)`,
    `ALTER TABLE "Ipc" ALTER COLUMN "advanceRecovery" TYPE NUMERIC(15,2) USING "advanceRecovery"::NUMERIC(15,2)`,
    `ALTER TABLE "VendorBill" ALTER COLUMN "grossAmount" TYPE NUMERIC(15,2) USING "grossAmount"::NUMERIC(15,2)`,
    `ALTER TABLE "VendorBill" ALTER COLUMN "vatAmount" TYPE NUMERIC(15,2) USING "vatAmount"::NUMERIC(15,2)`,
    `ALTER TABLE "VendorBill" ALTER COLUMN "tdsAmount" TYPE NUMERIC(15,2) USING "tdsAmount"::NUMERIC(15,2)`,
    `ALTER TABLE "VendorBill" ALTER COLUMN "netPayable" TYPE NUMERIC(15,2) USING "netPayable"::NUMERIC(15,2)`,
    `ALTER TABLE "VendorBill" ALTER COLUMN "paidAmount" TYPE NUMERIC(15,2) USING "paidAmount"::NUMERIC(15,2)`,
    `ALTER TABLE "SubcontractorBill" ALTER COLUMN "grossAmount" TYPE NUMERIC(15,2) USING "grossAmount"::NUMERIC(15,2)`,
    `ALTER TABLE "SubcontractorBill" ALTER COLUMN "retentionAmount" TYPE NUMERIC(15,2) USING "retentionAmount"::NUMERIC(15,2)`,
    `ALTER TABLE "SubcontractorBill" ALTER COLUMN "vatAmount" TYPE NUMERIC(15,2) USING "vatAmount"::NUMERIC(15,2)`,
    `ALTER TABLE "SubcontractorBill" ALTER COLUMN "tdsAmount" TYPE NUMERIC(15,2) USING "tdsAmount"::NUMERIC(15,2)`,
    `ALTER TABLE "SubcontractorBill" ALTER COLUMN "materialDeduction" TYPE NUMERIC(15,2) USING "materialDeduction"::NUMERIC(15,2)`,
    `ALTER TABLE "SubcontractorBill" ALTER COLUMN "advanceRecovery" TYPE NUMERIC(15,2) USING "advanceRecovery"::NUMERIC(15,2)`,
    `ALTER TABLE "SubcontractorBill" ALTER COLUMN "netPayable" TYPE NUMERIC(15,2) USING "netPayable"::NUMERIC(15,2)`,
    `ALTER TABLE "SubcontractorBill" ALTER COLUMN "paidAmount" TYPE NUMERIC(15,2) USING "paidAmount"::NUMERIC(15,2)`,
    `ALTER TABLE "SubcontractorBill" ALTER COLUMN "verifiedGross" TYPE NUMERIC(15,2) USING "verifiedGross"::NUMERIC(15,2)`,
    `ALTER TABLE "SubcontractorBill" ALTER COLUMN "verifiedNet" TYPE NUMERIC(15,2) USING "verifiedNet"::NUMERIC(15,2)`,
    `ALTER TABLE "Payment" ALTER COLUMN "amount" TYPE NUMERIC(15,2) USING "amount"::NUMERIC(15,2)`,
    `ALTER TABLE "Payment" ALTER COLUMN "tdsDeducted" TYPE NUMERIC(15,2) USING "tdsDeducted"::NUMERIC(15,2)`,
    `ALTER TABLE "Payment" ALTER COLUMN "vatIncluded" TYPE NUMERIC(15,2) USING "vatIncluded"::NUMERIC(15,2)`,
    `ALTER TABLE "Payment" ALTER COLUMN "netPaid" TYPE NUMERIC(15,2) USING "netPaid"::NUMERIC(15,2)`,
    `ALTER TABLE "Payment" ALTER COLUMN "retentionReleased" TYPE NUMERIC(15,2) USING "retentionReleased"::NUMERIC(15,2)`,
    `ALTER TABLE "ProjectCost" ALTER COLUMN "amount" TYPE NUMERIC(15,2) USING "amount"::NUMERIC(15,2)`,
    `ALTER TABLE "SiteExpense" ALTER COLUMN "amount" TYPE NUMERIC(15,2) USING "amount"::NUMERIC(15,2)`,
    `ALTER TABLE "SiteExpense" ALTER COLUMN "vatAmount" TYPE NUMERIC(15,2) USING "vatAmount"::NUMERIC(15,2)`,
    `ALTER TABLE "SiteExpense" ALTER COLUMN "totalAmount" TYPE NUMERIC(15,2) USING "totalAmount"::NUMERIC(15,2)`,
    `ALTER TABLE "CompanyBankAccount" ALTER COLUMN "openingBalance" TYPE NUMERIC(15,2) USING "openingBalance"::NUMERIC(15,2)`,
    `ALTER TABLE "CompanyBankAccount" ALTER COLUMN "currentBalance" TYPE NUMERIC(15,2) USING "currentBalance"::NUMERIC(15,2)`,
    `ALTER TABLE "HeadOfficeExpense" ALTER COLUMN "amount" TYPE NUMERIC(15,2) USING "amount"::NUMERIC(15,2)`,
    `ALTER TABLE "JournalEntry" ALTER COLUMN "totalDebit" TYPE NUMERIC(15,2) USING "totalDebit"::NUMERIC(15,2)`,
    `ALTER TABLE "JournalEntry" ALTER COLUMN "totalCredit" TYPE NUMERIC(15,2) USING "totalCredit"::NUMERIC(15,2)`,
    `ALTER TABLE "JournalEntryLine" ALTER COLUMN "debit" TYPE NUMERIC(15,2) USING "debit"::NUMERIC(15,2)`,
    `ALTER TABLE "JournalEntryLine" ALTER COLUMN "credit" TYPE NUMERIC(15,2) USING "credit"::NUMERIC(15,2)`,
    `ALTER TABLE "EquipmentRental" ALTER COLUMN "rentalRate" TYPE NUMERIC(15,2) USING "rentalRate"::NUMERIC(15,2)`,
    `ALTER TABLE "EquipmentRental" ALTER COLUMN "totalRentalCost" TYPE NUMERIC(15,2) USING "totalRentalCost"::NUMERIC(15,2)`,
    `ALTER TABLE "EquipmentSpotHire" ALTER COLUMN "rate" TYPE NUMERIC(15,2) USING "rate"::NUMERIC(15,2)`,
    `ALTER TABLE "EquipmentSpotHire" ALTER COLUMN "mobilizationFee" TYPE NUMERIC(15,2) USING "mobilizationFee"::NUMERIC(15,2)`,
    `ALTER TABLE "EquipmentSpotHire" ALTER COLUMN "fuelUnitCost" TYPE NUMERIC(15,2) USING "fuelUnitCost"::NUMERIC(15,2)`,
    `ALTER TABLE "EquipmentSpotHire" ALTER COLUMN "totalGross" TYPE NUMERIC(15,2) USING "totalGross"::NUMERIC(15,2)`,
    `ALTER TABLE "EquipmentSpotHire" ALTER COLUMN "fuelDeduction" TYPE NUMERIC(15,2) USING "fuelDeduction"::NUMERIC(15,2)`,
    `ALTER TABLE "EquipmentSpotHire" ALTER COLUMN "netPayable" TYPE NUMERIC(15,2) USING "netPayable"::NUMERIC(15,2)`,
    `ALTER TABLE "BankGuarantee" ALTER COLUMN "amount" TYPE NUMERIC(15,2) USING "amount"::NUMERIC(15,2)`,
    `ALTER TABLE "BankGuarantee" ALTER COLUMN "marginAmount" TYPE NUMERIC(15,2) USING "marginAmount"::NUMERIC(15,2)`,
    `ALTER TABLE "BankGuarantee" ALTER COLUMN "commissionPaid" TYPE NUMERIC(15,2) USING "commissionPaid"::NUMERIC(15,2)`,
    `ALTER TABLE "PayrollRun" ALTER COLUMN "totalGross" TYPE NUMERIC(15,2) USING "totalGross"::NUMERIC(15,2)`,
    `ALTER TABLE "PayrollRun" ALTER COLUMN "totalAllowances" TYPE NUMERIC(15,2) USING "totalAllowances"::NUMERIC(15,2)`,
    `ALTER TABLE "PayrollRun" ALTER COLUMN "totalDeductions" TYPE NUMERIC(15,2) USING "totalDeductions"::NUMERIC(15,2)`,
    `ALTER TABLE "PayrollRun" ALTER COLUMN "totalAdvancesRecovered" TYPE NUMERIC(15,2) USING "totalAdvancesRecovered"::NUMERIC(15,2)`,
    `ALTER TABLE "PayrollRun" ALTER COLUMN "totalNetPayable" TYPE NUMERIC(15,2) USING "totalNetPayable"::NUMERIC(15,2)`,
    `ALTER TABLE "PayrollRun" ALTER COLUMN "disbursedAmount" TYPE NUMERIC(15,2) USING "disbursedAmount"::NUMERIC(15,2)`,
    `ALTER TABLE "PayrollStaffRecord" ALTER COLUMN "baseRate" TYPE NUMERIC(15,2) USING "baseRate"::NUMERIC(15,2)`,
    `ALTER TABLE "PayrollStaffRecord" ALTER COLUMN "regularPay" TYPE NUMERIC(15,2) USING "regularPay"::NUMERIC(15,2)`,
    `ALTER TABLE "PayrollStaffRecord" ALTER COLUMN "overtimePay" TYPE NUMERIC(15,2) USING "overtimePay"::NUMERIC(15,2)`,
    `ALTER TABLE "PayrollStaffRecord" ALTER COLUMN "allowances" TYPE NUMERIC(15,2) USING "allowances"::NUMERIC(15,2)`,
    `ALTER TABLE "PayrollStaffRecord" ALTER COLUMN "advanceDeduction" TYPE NUMERIC(15,2) USING "advanceDeduction"::NUMERIC(15,2)`,
    `ALTER TABLE "PayrollStaffRecord" ALTER COLUMN "messDeduction" TYPE NUMERIC(15,2) USING "messDeduction"::NUMERIC(15,2)`,
    `ALTER TABLE "PayrollStaffRecord" ALTER COLUMN "otherDeductions" TYPE NUMERIC(15,2) USING "otherDeductions"::NUMERIC(15,2)`,
    `ALTER TABLE "PayrollStaffRecord" ALTER COLUMN "tdsAmount" TYPE NUMERIC(15,2) USING "tdsAmount"::NUMERIC(15,2)`,
    `ALTER TABLE "PayrollStaffRecord" ALTER COLUMN "netPayable" TYPE NUMERIC(15,2) USING "netPayable"::NUMERIC(15,2)`,
  ];

  for (const stmt of decimalMigrationStatements) {
    try {
      await db.$executeRawUnsafe(stmt);
      executed++;
    } catch (e) {
      const msg = e instanceof Error ? e.message : "";
      // ALTER TYPE failures are non-fatal — the column might already
      // be NUMERIC or the table might not exist yet on a fresh DB.
      if (msg.includes("does not exist") || msg.includes("already the right type")) {
        skipped++;
      } else {
        // Log but don't fail — decimal migration is best-effort
        console.warn(`[decimal-migration] ${msg.slice(0, 100)}`);
        skipped++;
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // Apply RLS (Row-Level Security) policies
  // ═══════════════════════════════════════════════════════════════
  // RLS policies are idempotent (DROP IF EXISTS + CREATE)
  // so safe to run on every setup/seed call.
  try {
    const rlsStatements = splitSqlStatements(RLS_SQL);
    for (const stmt of rlsStatements) {
      try {
        await db.$executeRawUnsafe(stmt);
      } catch (e) {
        // RLS might not be supported on all Neon plans, or policies
        // might already exist — log but don't fail
        const msg = e instanceof Error ? e.message : "";
        if (!msg.includes("already exists")) {
          console.error("RLS statement failed:", msg.slice(0, 150));
        }
      }
    }
  } catch (e) {
    console.error("RLS setup failed (non-blocking):", e);
  }

  // Record/update the migration in _prisma_migrations
  const crypto = await import("node:crypto");
  const id = crypto.randomUUID();
  const checksum = crypto.createHash("sha256").update(sql).digest("hex");

  // Check if migration record exists
  const existing = await db.$queryRaw<{ count: number }[]>`
    SELECT COUNT(*)::int AS count FROM "_prisma_migrations" WHERE "migration_name" = '0_init'
  `;

  if ((existing[0]?.count ?? 0) > 0) {
    // Update the checksum (schema changed since last run)
    await db.$executeRawUnsafe(
      `UPDATE "_prisma_migrations" SET "checksum" = $1, "finished_at" = NOW(), "applied_steps_count" = $2 WHERE "migration_name" = '0_init'`,
      checksum,
      statements.length
    );
  } else {
    // Insert new migration record
    await db.$executeRawUnsafe(
      `INSERT INTO "_prisma_migrations" ("id", "checksum", "migration_name", "finished_at", "applied_steps_count") VALUES ($1, $2, $3, NOW(), $4)`,
      id,
      checksum,
      "0_init",
      statements.length
    );
  }



  // ═══════════════════════════════════════════════════════════════
  // Float → DECIMAL migration (exact money at rest)
  // ═══════════════════════════════════════════════════════════════
  // GENERATED by scripts/decimal-migration.mjs (via scripts/decimal-alters.json).
  // DECIMAL(15,2) for money, DECIMAL(15,4) for quantities/rates/percents.
  // Idempotent: re-casting a column to its existing type is a no-op.
  // The Prisma client surfaces these as plain numbers via
  // src/lib/decimal-extension.ts (decimal boundary) — app code unchanged.
  const decimalBoundaryStatements: string[] = [
    `ALTER TABLE "Organization" ALTER COLUMN "sitePettyCashLimit" TYPE DECIMAL(15, 2) USING "sitePettyCashLimit"::DECIMAL(15, 2)`,
    `ALTER TABLE "DelegationRule" ALTER COLUMN "maxAmount" TYPE DECIMAL(15, 2) USING "maxAmount"::DECIMAL(15, 2)`,
    `ALTER TABLE "MarketRateRevisionLog" ALTER COLUMN "totalCostImpact" TYPE DECIMAL(15, 2) USING "totalCostImpact"::DECIMAL(15, 2)`,
    `ALTER TABLE "MarketRateRevisionEntry" ALTER COLUMN "oldMarketRate" TYPE DECIMAL(15, 4) USING "oldMarketRate"::DECIMAL(15, 4)`,
    `ALTER TABLE "MarketRateRevisionEntry" ALTER COLUMN "newMarketRate" TYPE DECIMAL(15, 4) USING "newMarketRate"::DECIMAL(15, 4)`,
    `ALTER TABLE "MarketRateRevisionEntry" ALTER COLUMN "rateDelta" TYPE DECIMAL(15, 4) USING "rateDelta"::DECIMAL(15, 4)`,
    `ALTER TABLE "MarketRateRevisionEntry" ALTER COLUMN "estimatedRemainingQty" TYPE DECIMAL(15, 4) USING "estimatedRemainingQty"::DECIMAL(15, 4)`,
    `ALTER TABLE "MarketRateRevisionEntry" ALTER COLUMN "costImpact" TYPE DECIMAL(15, 2) USING "costImpact"::DECIMAL(15, 2)`,
    `ALTER TABLE "Project" ALTER COLUMN "contractValue" TYPE DECIMAL(15, 2) USING "contractValue"::DECIMAL(15, 2)`,
    `ALTER TABLE "Project" ALTER COLUMN "skilledWageRate" TYPE DECIMAL(15, 4) USING "skilledWageRate"::DECIMAL(15, 4)`,
    `ALTER TABLE "Project" ALTER COLUMN "unskilledWageRate" TYPE DECIMAL(15, 4) USING "unskilledWageRate"::DECIMAL(15, 4)`,
    `ALTER TABLE "Project" ALTER COLUMN "supervisorWageRate" TYPE DECIMAL(15, 4) USING "supervisorWageRate"::DECIMAL(15, 4)`,
    `ALTER TABLE "Project" ALTER COLUMN "ownedEquipRate" TYPE DECIMAL(15, 4) USING "ownedEquipRate"::DECIMAL(15, 4)`,
    `ALTER TABLE "Project" ALTER COLUMN "hiredEquipRate" TYPE DECIMAL(15, 4) USING "hiredEquipRate"::DECIMAL(15, 4)`,
    `ALTER TABLE "Project" ALTER COLUMN "fuelPricePerLiter" TYPE DECIMAL(15, 2) USING "fuelPricePerLiter"::DECIMAL(15, 2)`,
    `ALTER TABLE "Rfi" ALTER COLUMN "pinX" TYPE DECIMAL(15, 2) USING "pinX"::DECIMAL(15, 2)`,
    `ALTER TABLE "Rfi" ALTER COLUMN "pinY" TYPE DECIMAL(15, 2) USING "pinY"::DECIMAL(15, 2)`,
    `ALTER TABLE "RfiItem" ALTER COLUMN "quantity" TYPE DECIMAL(15, 4) USING "quantity"::DECIMAL(15, 4)`,
    `ALTER TABLE "DailyReportWorkforce" ALTER COLUMN "regHours" TYPE DECIMAL(15, 4) USING "regHours"::DECIMAL(15, 4)`,
    `ALTER TABLE "DailyReportWorkforce" ALTER COLUMN "otHours" TYPE DECIMAL(15, 4) USING "otHours"::DECIMAL(15, 4)`,
    `ALTER TABLE "DailyReportProgress" ALTER COLUMN "plannedQty" TYPE DECIMAL(15, 4) USING "plannedQty"::DECIMAL(15, 4)`,
    `ALTER TABLE "DailyReportProgress" ALTER COLUMN "actualQty" TYPE DECIMAL(15, 4) USING "actualQty"::DECIMAL(15, 4)`,
    `ALTER TABLE "DailyReportProgress" ALTER COLUMN "batchedQty" TYPE DECIMAL(15, 4) USING "batchedQty"::DECIMAL(15, 4)`,
    `ALTER TABLE "DailyReportProgress" ALTER COLUMN "payableQty" TYPE DECIMAL(15, 4) USING "payableQty"::DECIMAL(15, 4)`,
    `ALTER TABLE "DailyReportEquipment" ALTER COLUMN "workingHours" TYPE DECIMAL(15, 4) USING "workingHours"::DECIMAL(15, 4)`,
    `ALTER TABLE "DailyReportEquipment" ALTER COLUMN "fuel" TYPE DECIMAL(15, 2) USING "fuel"::DECIMAL(15, 2)`,
    `ALTER TABLE "DailyReportMaterial" ALTER COLUMN "qty" TYPE DECIMAL(15, 4) USING "qty"::DECIMAL(15, 4)`,
    `ALTER TABLE "DailyReportMaterialConsumed" ALTER COLUMN "quantity" TYPE DECIMAL(15, 4) USING "quantity"::DECIMAL(15, 4)`,
    `ALTER TABLE "BoqItem" ALTER COLUMN "quantity" TYPE DECIMAL(15, 4) USING "quantity"::DECIMAL(15, 4)`,
    `ALTER TABLE "BoqItem" ALTER COLUMN "rate" TYPE DECIMAL(15, 4) USING "rate"::DECIMAL(15, 4)`,
    `ALTER TABLE "BoqItem" ALTER COLUMN "amount" TYPE DECIMAL(15, 2) USING "amount"::DECIMAL(15, 2)`,
    `ALTER TABLE "BoqItem" ALTER COLUMN "baselineQty" TYPE DECIMAL(15, 4) USING "baselineQty"::DECIMAL(15, 4)`,
    `ALTER TABLE "BoqItem" ALTER COLUMN "baselineRate" TYPE DECIMAL(15, 4) USING "baselineRate"::DECIMAL(15, 4)`,
    `ALTER TABLE "BoqIngredient" ALTER COLUMN "quantity" TYPE DECIMAL(15, 4) USING "quantity"::DECIMAL(15, 4)`,
    `ALTER TABLE "BoqIngredient" ALTER COLUMN "percentage" TYPE DECIMAL(15, 4) USING "percentage"::DECIMAL(15, 4)`,
    `ALTER TABLE "BoqIngredient" ALTER COLUMN "rate" TYPE DECIMAL(15, 4) USING "rate"::DECIMAL(15, 4)`,
    `ALTER TABLE "BoqIngredient" ALTER COLUMN "amount" TYPE DECIMAL(15, 2) USING "amount"::DECIMAL(15, 2)`,
    `ALTER TABLE "RateAnalysis" ALTER COLUMN "batchSize" TYPE DECIMAL(15, 2) USING "batchSize"::DECIMAL(15, 2)`,
    `ALTER TABLE "BoqVersionItem" ALTER COLUMN "quantity" TYPE DECIMAL(15, 4) USING "quantity"::DECIMAL(15, 4)`,
    `ALTER TABLE "BoqVersionItem" ALTER COLUMN "rate" TYPE DECIMAL(15, 4) USING "rate"::DECIMAL(15, 4)`,
    `ALTER TABLE "BoqVersionItem" ALTER COLUMN "amount" TYPE DECIMAL(15, 2) USING "amount"::DECIMAL(15, 2)`,
    `ALTER TABLE "BoqVersionItem" ALTER COLUMN "baselineQty" TYPE DECIMAL(15, 4) USING "baselineQty"::DECIMAL(15, 4)`,
    `ALTER TABLE "BoqVersionItem" ALTER COLUMN "baselineRate" TYPE DECIMAL(15, 4) USING "baselineRate"::DECIMAL(15, 4)`,
    `ALTER TABLE "BoqVersionItem" ALTER COLUMN "previousQty" TYPE DECIMAL(15, 4) USING "previousQty"::DECIMAL(15, 4)`,
    `ALTER TABLE "BoqVersionItem" ALTER COLUMN "previousRate" TYPE DECIMAL(15, 4) USING "previousRate"::DECIMAL(15, 4)`,
    `ALTER TABLE "GlobalPresetAnalysis" ALTER COLUMN "batchSize" TYPE DECIMAL(15, 2) USING "batchSize"::DECIMAL(15, 2)`,
    `ALTER TABLE "GlobalPresetIngredient" ALTER COLUMN "quantity" TYPE DECIMAL(15, 4) USING "quantity"::DECIMAL(15, 4)`,
    `ALTER TABLE "GlobalPresetIngredient" ALTER COLUMN "percentage" TYPE DECIMAL(15, 4) USING "percentage"::DECIMAL(15, 4)`,
    `ALTER TABLE "GlobalPresetIngredient" ALTER COLUMN "rate" TYPE DECIMAL(15, 4) USING "rate"::DECIMAL(15, 4)`,
    `ALTER TABLE "GlobalPresetIngredient" ALTER COLUMN "amount" TYPE DECIMAL(15, 2) USING "amount"::DECIMAL(15, 2)`,
    `ALTER TABLE "RateProfileItem" ALTER COLUMN "rate" TYPE DECIMAL(15, 4) USING "rate"::DECIMAL(15, 4)`,
    `ALTER TABLE "GanttTask" ALTER COLUMN "progress" TYPE DECIMAL(15, 4) USING "progress"::DECIMAL(15, 4)`,
    `ALTER TABLE "GanttTask" ALTER COLUMN "baseProgress" TYPE DECIMAL(15, 4) USING "baseProgress"::DECIMAL(15, 4)`,
    `ALTER TABLE "GanttTask" ALTER COLUMN "plannedValue" TYPE DECIMAL(15, 2) USING "plannedValue"::DECIMAL(15, 2)`,
    `ALTER TABLE "GanttTask" ALTER COLUMN "workHours" TYPE DECIMAL(15, 4) USING "workHours"::DECIMAL(15, 4)`,
    `ALTER TABLE "ResourceAssignment" ALTER COLUMN "quantity" TYPE DECIMAL(15, 4) USING "quantity"::DECIMAL(15, 4)`,
    `ALTER TABLE "ResourceAssignment" ALTER COLUMN "workHours" TYPE DECIMAL(15, 4) USING "workHours"::DECIMAL(15, 4)`,
    `ALTER TABLE "TaskBoqLink" ALTER COLUMN "quantity" TYPE DECIMAL(15, 4) USING "quantity"::DECIMAL(15, 4)`,
    `ALTER TABLE "PartnerSupply" ALTER COLUMN "exFactoryRate" TYPE DECIMAL(15, 4) USING "exFactoryRate"::DECIMAL(15, 4)`,
    `ALTER TABLE "PartnerSupply" ALTER COLUMN "transportRate" TYPE DECIMAL(15, 4) USING "transportRate"::DECIMAL(15, 4)`,
    `ALTER TABLE "Material" ALTER COLUMN "minStock" TYPE DECIMAL(15, 2) USING "minStock"::DECIMAL(15, 2)`,
    `ALTER TABLE "Material" ALTER COLUMN "currentStock" TYPE DECIMAL(15, 2) USING "currentStock"::DECIMAL(15, 2)`,
    `ALTER TABLE "Material" ALTER COLUMN "reorderLevel" TYPE DECIMAL(15, 2) USING "reorderLevel"::DECIMAL(15, 2)`,
    `ALTER TABLE "MaterialTransaction" ALTER COLUMN "quantity" TYPE DECIMAL(15, 4) USING "quantity"::DECIMAL(15, 4)`,
    `ALTER TABLE "MaterialTransaction" ALTER COLUMN "rate" TYPE DECIMAL(15, 4) USING "rate"::DECIMAL(15, 4)`,
    `ALTER TABLE "MaterialTransaction" ALTER COLUMN "recoveryRate" TYPE DECIMAL(15, 4) USING "recoveryRate"::DECIMAL(15, 4)`,
    `ALTER TABLE "MaterialTransaction" ALTER COLUMN "vatPercent" TYPE DECIMAL(15, 4) USING "vatPercent"::DECIMAL(15, 4)`,
    `ALTER TABLE "MaterialTransaction" ALTER COLUMN "vatAmount" TYPE DECIMAL(15, 2) USING "vatAmount"::DECIMAL(15, 2)`,
    `ALTER TABLE "MaterialTransaction" ALTER COLUMN "tdsPercent" TYPE DECIMAL(15, 4) USING "tdsPercent"::DECIMAL(15, 4)`,
    `ALTER TABLE "MaterialTransaction" ALTER COLUMN "tdsAmount" TYPE DECIMAL(15, 2) USING "tdsAmount"::DECIMAL(15, 2)`,
    `ALTER TABLE "MaterialTransaction" ALTER COLUMN "totalWithVat" TYPE DECIMAL(15, 2) USING "totalWithVat"::DECIMAL(15, 2)`,
    `ALTER TABLE "MaterialTransaction" ALTER COLUMN "netPayable" TYPE DECIMAL(15, 2) USING "netPayable"::DECIMAL(15, 2)`,
    `ALTER TABLE "MaterialTransaction" ALTER COLUMN "weighbridgeGross" TYPE DECIMAL(15, 2) USING "weighbridgeGross"::DECIMAL(15, 2)`,
    `ALTER TABLE "MaterialTransaction" ALTER COLUMN "weighbridgeTare" TYPE DECIMAL(15, 2) USING "weighbridgeTare"::DECIMAL(15, 2)`,
    `ALTER TABLE "MaterialTransaction" ALTER COLUMN "densityFactor" TYPE DECIMAL(15, 4) USING "densityFactor"::DECIMAL(15, 4)`,
    `ALTER TABLE "PurchaseOrder" ALTER COLUMN "totalAmount" TYPE DECIMAL(15, 2) USING "totalAmount"::DECIMAL(15, 2)`,
    `ALTER TABLE "PurchaseOrder" ALTER COLUMN "vatPercent" TYPE DECIMAL(15, 4) USING "vatPercent"::DECIMAL(15, 4)`,
    `ALTER TABLE "PurchaseOrder" ALTER COLUMN "vatAmount" TYPE DECIMAL(15, 2) USING "vatAmount"::DECIMAL(15, 2)`,
    `ALTER TABLE "PurchaseOrder" ALTER COLUMN "netAmount" TYPE DECIMAL(15, 2) USING "netAmount"::DECIMAL(15, 2)`,
    `ALTER TABLE "PurchaseOrderItem" ALTER COLUMN "quantity" TYPE DECIMAL(15, 4) USING "quantity"::DECIMAL(15, 4)`,
    `ALTER TABLE "PurchaseOrderItem" ALTER COLUMN "receivedQty" TYPE DECIMAL(15, 4) USING "receivedQty"::DECIMAL(15, 4)`,
    `ALTER TABLE "PurchaseOrderItem" ALTER COLUMN "rate" TYPE DECIMAL(15, 4) USING "rate"::DECIMAL(15, 4)`,
    `ALTER TABLE "PurchaseOrderItem" ALTER COLUMN "amount" TYPE DECIMAL(15, 2) USING "amount"::DECIMAL(15, 2)`,
    `ALTER TABLE "Equipment" ALTER COLUMN "fuelRate" TYPE DECIMAL(15, 4) USING "fuelRate"::DECIMAL(15, 4)`,
    `ALTER TABLE "Equipment" ALTER COLUMN "factoryFuelRate" TYPE DECIMAL(15, 4) USING "factoryFuelRate"::DECIMAL(15, 4)`,
    `ALTER TABLE "EquipmentLog" ALTER COLUMN "startHours" TYPE DECIMAL(15, 4) USING "startHours"::DECIMAL(15, 4)`,
    `ALTER TABLE "EquipmentLog" ALTER COLUMN "endHours" TYPE DECIMAL(15, 4) USING "endHours"::DECIMAL(15, 4)`,
    `ALTER TABLE "EquipmentLog" ALTER COLUMN "workedHours" TYPE DECIMAL(15, 4) USING "workedHours"::DECIMAL(15, 4)`,
    `ALTER TABLE "EquipmentLog" ALTER COLUMN "fuelFilled" TYPE DECIMAL(15, 2) USING "fuelFilled"::DECIMAL(15, 2)`,
    `ALTER TABLE "EquipmentLog" ALTER COLUMN "outputQty" TYPE DECIMAL(15, 4) USING "outputQty"::DECIMAL(15, 4)`,
    `ALTER TABLE "EquipmentMaintenance" ALTER COLUMN "cost" TYPE DECIMAL(15, 2) USING "cost"::DECIMAL(15, 2)`,
    `ALTER TABLE "EquipmentMaintenance" ALTER COLUMN "nextDueHours" TYPE DECIMAL(15, 4) USING "nextDueHours"::DECIMAL(15, 4)`,
    `ALTER TABLE "EquipmentRental" ALTER COLUMN "rentalRate" TYPE DECIMAL(15, 4) USING "rentalRate"::DECIMAL(15, 4)`,
    `ALTER TABLE "EquipmentRental" ALTER COLUMN "maintenanceMinContractor" TYPE DECIMAL(15, 2) USING "maintenanceMinContractor"::DECIMAL(15, 2)`,
    `ALTER TABLE "EquipmentRental" ALTER COLUMN "totalBillableDays" TYPE DECIMAL(15, 2) USING "totalBillableDays"::DECIMAL(15, 2)`,
    `ALTER TABLE "EquipmentRental" ALTER COLUMN "totalRentalCost" TYPE DECIMAL(15, 2) USING "totalRentalCost"::DECIMAL(15, 2)`,
    `ALTER TABLE "EquipmentRental" ALTER COLUMN "totalDeductions" TYPE DECIMAL(15, 2) USING "totalDeductions"::DECIMAL(15, 2)`,
    `ALTER TABLE "EquipmentCrew" ALTER COLUMN "salaryRate" TYPE DECIMAL(15, 4) USING "salaryRate"::DECIMAL(15, 4)`,
    `ALTER TABLE "EquipmentCrew" ALTER COLUMN "allowanceRate" TYPE DECIMAL(15, 4) USING "allowanceRate"::DECIMAL(15, 4)`,
    `ALTER TABLE "EquipmentCrew" ALTER COLUMN "lodgingRate" TYPE DECIMAL(15, 4) USING "lodgingRate"::DECIMAL(15, 4)`,
    `ALTER TABLE "EquipmentCrew" ALTER COLUMN "foodingRate" TYPE DECIMAL(15, 4) USING "foodingRate"::DECIMAL(15, 4)`,
    `ALTER TABLE "EquipmentDamage" ALTER COLUMN "repairCost" TYPE DECIMAL(15, 2) USING "repairCost"::DECIMAL(15, 2)`,
    `ALTER TABLE "EquipmentDamage" ALTER COLUMN "contractorShare" TYPE DECIMAL(15, 2) USING "contractorShare"::DECIMAL(15, 2)`,
    `ALTER TABLE "EquipmentDamage" ALTER COLUMN "vendorShare" TYPE DECIMAL(15, 2) USING "vendorShare"::DECIMAL(15, 2)`,
    `ALTER TABLE "EquipmentSpotHire" ALTER COLUMN "rate" TYPE DECIMAL(15, 4) USING "rate"::DECIMAL(15, 4)`,
    `ALTER TABLE "EquipmentSpotHire" ALTER COLUMN "minCalloutHours" TYPE DECIMAL(15, 4) USING "minCalloutHours"::DECIMAL(15, 4)`,
    `ALTER TABLE "EquipmentSpotHire" ALTER COLUMN "mobilizationFee" TYPE DECIMAL(15, 2) USING "mobilizationFee"::DECIMAL(15, 2)`,
    `ALTER TABLE "EquipmentSpotHire" ALTER COLUMN "fuelLitersIssued" TYPE DECIMAL(15, 2) USING "fuelLitersIssued"::DECIMAL(15, 2)`,
    `ALTER TABLE "EquipmentSpotHire" ALTER COLUMN "fuelUnitCost" TYPE DECIMAL(15, 2) USING "fuelUnitCost"::DECIMAL(15, 2)`,
    `ALTER TABLE "EquipmentSpotHire" ALTER COLUMN "hoursWorked" TYPE DECIMAL(15, 4) USING "hoursWorked"::DECIMAL(15, 4)`,
    `ALTER TABLE "EquipmentSpotHire" ALTER COLUMN "totalGross" TYPE DECIMAL(15, 2) USING "totalGross"::DECIMAL(15, 2)`,
    `ALTER TABLE "EquipmentSpotHire" ALTER COLUMN "fuelDeduction" TYPE DECIMAL(15, 2) USING "fuelDeduction"::DECIMAL(15, 2)`,
    `ALTER TABLE "EquipmentSpotHire" ALTER COLUMN "netPayable" TYPE DECIMAL(15, 2) USING "netPayable"::DECIMAL(15, 2)`,
    `ALTER TABLE "Plant" ALTER COLUMN "capacityValue" TYPE DECIMAL(15, 2) USING "capacityValue"::DECIMAL(15, 2)`,
    `ALTER TABLE "PlantMixDesign" ALTER COLUMN "waterCementRatio" TYPE DECIMAL(15, 4) USING "waterCementRatio"::DECIMAL(15, 4)`,
    `ALTER TABLE "PlantMixDesign" ALTER COLUMN "bitumenContentPct" TYPE DECIMAL(15, 4) USING "bitumenContentPct"::DECIMAL(15, 4)`,
    `ALTER TABLE "PlantBatchTicket" ALTER COLUMN "orderedQty" TYPE DECIMAL(15, 4) USING "orderedQty"::DECIMAL(15, 4)`,
    `ALTER TABLE "PlantBatchTicket" ALTER COLUMN "dispatchedQty" TYPE DECIMAL(15, 4) USING "dispatchedQty"::DECIMAL(15, 4)`,
    `ALTER TABLE "PlantBatchTicket" ALTER COLUMN "receivedQty" TYPE DECIMAL(15, 4) USING "receivedQty"::DECIMAL(15, 4)`,
    `ALTER TABLE "PlantSilo" ALTER COLUMN "capacity" TYPE DECIMAL(15, 2) USING "capacity"::DECIMAL(15, 2)`,
    `ALTER TABLE "PlantSilo" ALTER COLUMN "currentStock" TYPE DECIMAL(15, 2) USING "currentStock"::DECIMAL(15, 2)`,
    `ALTER TABLE "PlantSilo" ALTER COLUMN "minAlertLevel" TYPE DECIMAL(15, 2) USING "minAlertLevel"::DECIMAL(15, 2)`,
    `ALTER TABLE "PlantSilo" ALTER COLUMN "lastDipValue" TYPE DECIMAL(15, 2) USING "lastDipValue"::DECIMAL(15, 2)`,
    `ALTER TABLE "PlantDailyLog" ALTER COLUMN "totalProduced" TYPE DECIMAL(15, 2) USING "totalProduced"::DECIMAL(15, 2)`,
    `ALTER TABLE "PlantDailyLog" ALTER COLUMN "operatingHours" TYPE DECIMAL(15, 4) USING "operatingHours"::DECIMAL(15, 4)`,
    `ALTER TABLE "PlantDailyLog" ALTER COLUMN "idleHours" TYPE DECIMAL(15, 4) USING "idleHours"::DECIMAL(15, 4)`,
    `ALTER TABLE "PlantDailyLog" ALTER COLUMN "breakdownHours" TYPE DECIMAL(15, 4) USING "breakdownHours"::DECIMAL(15, 4)`,
    `ALTER TABLE "PlantDailyLog" ALTER COLUMN "electricityUnitsKwh" TYPE DECIMAL(15, 2) USING "electricityUnitsKwh"::DECIMAL(15, 2)`,
    `ALTER TABLE "PlantDailyLog" ALTER COLUMN "dieselLitres" TYPE DECIMAL(15, 2) USING "dieselLitres"::DECIMAL(15, 2)`,
    `ALTER TABLE "Drawing" ALTER COLUMN "scaleValue" TYPE DECIMAL(15, 2) USING "scaleValue"::DECIMAL(15, 2)`,
    `ALTER TABLE "Ipc" ALTER COLUMN "grossAmount" TYPE DECIMAL(15, 2) USING "grossAmount"::DECIMAL(15, 2)`,
    `ALTER TABLE "Ipc" ALTER COLUMN "retention" TYPE DECIMAL(15, 2) USING "retention"::DECIMAL(15, 2)`,
    `ALTER TABLE "Ipc" ALTER COLUMN "retentionAmount" TYPE DECIMAL(15, 2) USING "retentionAmount"::DECIMAL(15, 2)`,
    `ALTER TABLE "Ipc" ALTER COLUMN "advanceRecovery" TYPE DECIMAL(15, 2) USING "advanceRecovery"::DECIMAL(15, 2)`,
    `ALTER TABLE "Ipc" ALTER COLUMN "netPayable" TYPE DECIMAL(15, 2) USING "netPayable"::DECIMAL(15, 2)`,
    `ALTER TABLE "Ipc" ALTER COLUMN "vatPercent" TYPE DECIMAL(15, 4) USING "vatPercent"::DECIMAL(15, 4)`,
    `ALTER TABLE "Ipc" ALTER COLUMN "vatAmount" TYPE DECIMAL(15, 2) USING "vatAmount"::DECIMAL(15, 2)`,
    `ALTER TABLE "Ipc" ALTER COLUMN "tdsPercent" TYPE DECIMAL(15, 4) USING "tdsPercent"::DECIMAL(15, 4)`,
    `ALTER TABLE "Ipc" ALTER COLUMN "tdsAmount" TYPE DECIMAL(15, 2) USING "tdsAmount"::DECIMAL(15, 2)`,
    `ALTER TABLE "Ipc" ALTER COLUMN "totalWithVat" TYPE DECIMAL(15, 2) USING "totalWithVat"::DECIMAL(15, 2)`,
    `ALTER TABLE "Ipc" ALTER COLUMN "finalPayable" TYPE DECIMAL(15, 2) USING "finalPayable"::DECIMAL(15, 2)`,
    `ALTER TABLE "Ipc" ALTER COLUMN "originalContractAmountWithoutVat" TYPE DECIMAL(15, 2) USING "originalContractAmountWithoutVat"::DECIMAL(15, 2)`,
    `ALTER TABLE "Ipc" ALTER COLUMN "originalContractAmountWithVat" TYPE DECIMAL(15, 2) USING "originalContractAmountWithVat"::DECIMAL(15, 2)`,
    `ALTER TABLE "Ipc" ALTER COLUMN "mobilizationAdvanceTotal" TYPE DECIMAL(15, 2) USING "mobilizationAdvanceTotal"::DECIMAL(15, 2)`,
    `ALTER TABLE "Ipc" ALTER COLUMN "mobilizationAdvanceDeducted" TYPE DECIMAL(15, 2) USING "mobilizationAdvanceDeducted"::DECIMAL(15, 2)`,
    `ALTER TABLE "Ipc" ALTER COLUMN "mobilizationAdvanceRate" TYPE DECIMAL(15, 4) USING "mobilizationAdvanceRate"::DECIMAL(15, 4)`,
    `ALTER TABLE "Ipc" ALTER COLUMN "previousGrossAmount" TYPE DECIMAL(15, 2) USING "previousGrossAmount"::DECIMAL(15, 2)`,
    `ALTER TABLE "Ipc" ALTER COLUMN "previousVatAmount" TYPE DECIMAL(15, 2) USING "previousVatAmount"::DECIMAL(15, 2)`,
    `ALTER TABLE "Ipc" ALTER COLUMN "previousAdvanceRecovery" TYPE DECIMAL(15, 2) USING "previousAdvanceRecovery"::DECIMAL(15, 2)`,
    `ALTER TABLE "Ipc" ALTER COLUMN "previousRetentionAmount" TYPE DECIMAL(15, 2) USING "previousRetentionAmount"::DECIMAL(15, 2)`,
    `ALTER TABLE "Ipc" ALTER COLUMN "previousTdsAmount" TYPE DECIMAL(15, 2) USING "previousTdsAmount"::DECIMAL(15, 2)`,
    `ALTER TABLE "Ipc" ALTER COLUMN "previousFinalPayable" TYPE DECIMAL(15, 2) USING "previousFinalPayable"::DECIMAL(15, 2)`,
    `ALTER TABLE "VatBill" ALTER COLUMN "taxableAmount" TYPE DECIMAL(15, 2) USING "taxableAmount"::DECIMAL(15, 2)`,
    `ALTER TABLE "VatBill" ALTER COLUMN "exemptAmount" TYPE DECIMAL(15, 2) USING "exemptAmount"::DECIMAL(15, 2)`,
    `ALTER TABLE "VatBill" ALTER COLUMN "vatPercent" TYPE DECIMAL(15, 4) USING "vatPercent"::DECIMAL(15, 4)`,
    `ALTER TABLE "VatBill" ALTER COLUMN "vatAmount" TYPE DECIMAL(15, 2) USING "vatAmount"::DECIMAL(15, 2)`,
    `ALTER TABLE "VatBill" ALTER COLUMN "totalAmount" TYPE DECIMAL(15, 2) USING "totalAmount"::DECIMAL(15, 2)`,
    `ALTER TABLE "VatBill" ALTER COLUMN "tdsPercent" TYPE DECIMAL(15, 4) USING "tdsPercent"::DECIMAL(15, 4)`,
    `ALTER TABLE "VatBill" ALTER COLUMN "tdsAmount" TYPE DECIMAL(15, 2) USING "tdsAmount"::DECIMAL(15, 2)`,
    `ALTER TABLE "VatBill" ALTER COLUMN "netPayable" TYPE DECIMAL(15, 2) USING "netPayable"::DECIMAL(15, 2)`,
    `ALTER TABLE "IpcItem" ALTER COLUMN "contractQty" TYPE DECIMAL(15, 4) USING "contractQty"::DECIMAL(15, 4)`,
    `ALTER TABLE "IpcItem" ALTER COLUMN "previousQty" TYPE DECIMAL(15, 4) USING "previousQty"::DECIMAL(15, 4)`,
    `ALTER TABLE "IpcItem" ALTER COLUMN "thisQty" TYPE DECIMAL(15, 4) USING "thisQty"::DECIMAL(15, 4)`,
    `ALTER TABLE "IpcItem" ALTER COLUMN "cumQty" TYPE DECIMAL(15, 4) USING "cumQty"::DECIMAL(15, 4)`,
    `ALTER TABLE "IpcItem" ALTER COLUMN "rate" TYPE DECIMAL(15, 4) USING "rate"::DECIMAL(15, 4)`,
    `ALTER TABLE "IpcItem" ALTER COLUMN "amount" TYPE DECIMAL(15, 2) USING "amount"::DECIMAL(15, 2)`,
    `ALTER TABLE "Staff" ALTER COLUMN "dailyWage" TYPE DECIMAL(15, 2) USING "dailyWage"::DECIMAL(15, 2)`,
    `ALTER TABLE "Staff" ALTER COLUMN "monthlySalary" TYPE DECIMAL(15, 2) USING "monthlySalary"::DECIMAL(15, 2)`,
    `ALTER TABLE "StaffRole" ALTER COLUMN "dailyWage" TYPE DECIMAL(15, 2) USING "dailyWage"::DECIMAL(15, 2)`,
    `ALTER TABLE "StaffAttendance" ALTER COLUMN "hours" TYPE DECIMAL(15, 4) USING "hours"::DECIMAL(15, 4)`,
    `ALTER TABLE "StaffAttendance" ALTER COLUMN "overtime" TYPE DECIMAL(15, 2) USING "overtime"::DECIMAL(15, 2)`,
    `ALTER TABLE "StaffAdvance" ALTER COLUMN "amount" TYPE DECIMAL(15, 2) USING "amount"::DECIMAL(15, 2)`,
    `ALTER TABLE "PayrollRun" ALTER COLUMN "totalGross" TYPE DECIMAL(15, 2) USING "totalGross"::DECIMAL(15, 2)`,
    `ALTER TABLE "PayrollRun" ALTER COLUMN "totalAllowances" TYPE DECIMAL(15, 2) USING "totalAllowances"::DECIMAL(15, 2)`,
    `ALTER TABLE "PayrollRun" ALTER COLUMN "totalDeductions" TYPE DECIMAL(15, 2) USING "totalDeductions"::DECIMAL(15, 2)`,
    `ALTER TABLE "PayrollRun" ALTER COLUMN "totalAdvancesRecovered" TYPE DECIMAL(15, 2) USING "totalAdvancesRecovered"::DECIMAL(15, 2)`,
    `ALTER TABLE "PayrollRun" ALTER COLUMN "totalNetPayable" TYPE DECIMAL(15, 2) USING "totalNetPayable"::DECIMAL(15, 2)`,
    `ALTER TABLE "PayrollRun" ALTER COLUMN "disbursedAmount" TYPE DECIMAL(15, 2) USING "disbursedAmount"::DECIMAL(15, 2)`,
    `ALTER TABLE "PayrollStaffRecord" ALTER COLUMN "presentDays" TYPE DECIMAL(15, 2) USING "presentDays"::DECIMAL(15, 2)`,
    `ALTER TABLE "PayrollStaffRecord" ALTER COLUMN "halfDays" TYPE DECIMAL(15, 2) USING "halfDays"::DECIMAL(15, 2)`,
    `ALTER TABLE "PayrollStaffRecord" ALTER COLUMN "absentDays" TYPE DECIMAL(15, 2) USING "absentDays"::DECIMAL(15, 2)`,
    `ALTER TABLE "PayrollStaffRecord" ALTER COLUMN "leaveDays" TYPE DECIMAL(15, 2) USING "leaveDays"::DECIMAL(15, 2)`,
    `ALTER TABLE "PayrollStaffRecord" ALTER COLUMN "overtimeHours" TYPE DECIMAL(15, 4) USING "overtimeHours"::DECIMAL(15, 4)`,
    `ALTER TABLE "PayrollStaffRecord" ALTER COLUMN "baseRate" TYPE DECIMAL(15, 4) USING "baseRate"::DECIMAL(15, 4)`,
    `ALTER TABLE "PayrollStaffRecord" ALTER COLUMN "regularPay" TYPE DECIMAL(15, 2) USING "regularPay"::DECIMAL(15, 2)`,
    `ALTER TABLE "PayrollStaffRecord" ALTER COLUMN "overtimePay" TYPE DECIMAL(15, 2) USING "overtimePay"::DECIMAL(15, 2)`,
    `ALTER TABLE "PayrollStaffRecord" ALTER COLUMN "allowances" TYPE DECIMAL(15, 2) USING "allowances"::DECIMAL(15, 2)`,
    `ALTER TABLE "PayrollStaffRecord" ALTER COLUMN "advanceDeduction" TYPE DECIMAL(15, 2) USING "advanceDeduction"::DECIMAL(15, 2)`,
    `ALTER TABLE "PayrollStaffRecord" ALTER COLUMN "messDeduction" TYPE DECIMAL(15, 2) USING "messDeduction"::DECIMAL(15, 2)`,
    `ALTER TABLE "PayrollStaffRecord" ALTER COLUMN "otherDeductions" TYPE DECIMAL(15, 2) USING "otherDeductions"::DECIMAL(15, 2)`,
    `ALTER TABLE "PayrollStaffRecord" ALTER COLUMN "tdsAmount" TYPE DECIMAL(15, 2) USING "tdsAmount"::DECIMAL(15, 2)`,
    `ALTER TABLE "PayrollStaffRecord" ALTER COLUMN "netPayable" TYPE DECIMAL(15, 2) USING "netPayable"::DECIMAL(15, 2)`,
    `ALTER TABLE "PayrollStaffRecord" ALTER COLUMN "paidAmount" TYPE DECIMAL(15, 2) USING "paidAmount"::DECIMAL(15, 2)`,
    `ALTER TABLE "DailyProgramTask" ALTER COLUMN "plannedQty" TYPE DECIMAL(15, 4) USING "plannedQty"::DECIMAL(15, 4)`,
    `ALTER TABLE "DailyProgramTask" ALTER COLUMN "actualQty" TYPE DECIMAL(15, 4) USING "actualQty"::DECIMAL(15, 4)`,
    `ALTER TABLE "DailyProgramTask" ALTER COLUMN "batchedQty" TYPE DECIMAL(15, 4) USING "batchedQty"::DECIMAL(15, 4)`,
    `ALTER TABLE "DailyProgramTask" ALTER COLUMN "payableQty" TYPE DECIMAL(15, 4) USING "payableQty"::DECIMAL(15, 4)`,
    `ALTER TABLE "GateEntry" ALTER COLUMN "estQty" TYPE DECIMAL(15, 4) USING "estQty"::DECIMAL(15, 4)`,
    `ALTER TABLE "GateEntry" ALTER COLUMN "grossWeight" TYPE DECIMAL(15, 4) USING "grossWeight"::DECIMAL(15, 4)`,
    `ALTER TABLE "GateEntry" ALTER COLUMN "tareWeight" TYPE DECIMAL(15, 4) USING "tareWeight"::DECIMAL(15, 4)`,
    `ALTER TABLE "GateEntry" ALTER COLUMN "netWeight" TYPE DECIMAL(15, 4) USING "netWeight"::DECIMAL(15, 4)`,
    `ALTER TABLE "Subcontractor" ALTER COLUMN "totalRetentionHeld" TYPE DECIMAL(15, 2) USING "totalRetentionHeld"::DECIMAL(15, 2)`,
    `ALTER TABLE "Subcontractor" ALTER COLUMN "totalRetentionReleased" TYPE DECIMAL(15, 2) USING "totalRetentionReleased"::DECIMAL(15, 2)`,
    `ALTER TABLE "Subcontractor" ALTER COLUMN "contractValue" TYPE DECIMAL(15, 2) USING "contractValue"::DECIMAL(15, 2)`,
    `ALTER TABLE "VariationOrderItem" ALTER COLUMN "previousQty" TYPE DECIMAL(15, 4) USING "previousQty"::DECIMAL(15, 4)`,
    `ALTER TABLE "VariationOrderItem" ALTER COLUMN "newQty" TYPE DECIMAL(15, 4) USING "newQty"::DECIMAL(15, 4)`,
    `ALTER TABLE "VariationOrderItem" ALTER COLUMN "previousRate" TYPE DECIMAL(15, 4) USING "previousRate"::DECIMAL(15, 4)`,
    `ALTER TABLE "VariationOrderItem" ALTER COLUMN "newRate" TYPE DECIMAL(15, 4) USING "newRate"::DECIMAL(15, 4)`,
    `ALTER TABLE "ProjectCost" ALTER COLUMN "amount" TYPE DECIMAL(15, 2) USING "amount"::DECIMAL(15, 2)`,
    `ALTER TABLE "Correspondence" ALTER COLUMN "eotDaysClaimed" TYPE DECIMAL(15, 2) USING "eotDaysClaimed"::DECIMAL(15, 2)`,
    `ALTER TABLE "Correspondence" ALTER COLUMN "eotDaysGranted" TYPE DECIMAL(15, 2) USING "eotDaysGranted"::DECIMAL(15, 2)`,
    `ALTER TABLE "DrawingMarkup" ALTER COLUMN "x" TYPE DECIMAL(15, 2) USING "x"::DECIMAL(15, 2)`,
    `ALTER TABLE "DrawingMarkup" ALTER COLUMN "y" TYPE DECIMAL(15, 2) USING "y"::DECIMAL(15, 2)`,
    `ALTER TABLE "DrawingMarkup" ALTER COLUMN "w" TYPE DECIMAL(15, 2) USING "w"::DECIMAL(15, 2)`,
    `ALTER TABLE "DrawingMarkup" ALTER COLUMN "h" TYPE DECIMAL(15, 2) USING "h"::DECIMAL(15, 2)`,
    `ALTER TABLE "DrawingMarkup" ALTER COLUMN "x2" TYPE DECIMAL(15, 2) USING "x2"::DECIMAL(15, 2)`,
    `ALTER TABLE "DrawingMarkup" ALTER COLUMN "y2" TYPE DECIMAL(15, 2) USING "y2"::DECIMAL(15, 2)`,
    `ALTER TABLE "DrawingMarkup" ALTER COLUMN "rotation" TYPE DECIMAL(15, 2) USING "rotation"::DECIMAL(15, 2)`,
    `ALTER TABLE "DrawingMarkup" ALTER COLUMN "strokeWidth" TYPE DECIMAL(15, 4) USING "strokeWidth"::DECIMAL(15, 4)`,
    `ALTER TABLE "DrawingMarkup" ALTER COLUMN "opacity" TYPE DECIMAL(15, 2) USING "opacity"::DECIMAL(15, 2)`,
    `ALTER TABLE "DrawingMarkup" ALTER COLUMN "percentComplete" TYPE DECIMAL(15, 4) USING "percentComplete"::DECIMAL(15, 4)`,
    `ALTER TABLE "Payment" ALTER COLUMN "amount" TYPE DECIMAL(15, 2) USING "amount"::DECIMAL(15, 2)`,
    `ALTER TABLE "Payment" ALTER COLUMN "tdsDeducted" TYPE DECIMAL(15, 2) USING "tdsDeducted"::DECIMAL(15, 2)`,
    `ALTER TABLE "Payment" ALTER COLUMN "vatIncluded" TYPE DECIMAL(15, 2) USING "vatIncluded"::DECIMAL(15, 2)`,
    `ALTER TABLE "Payment" ALTER COLUMN "netPaid" TYPE DECIMAL(15, 2) USING "netPaid"::DECIMAL(15, 2)`,
    `ALTER TABLE "Payment" ALTER COLUMN "retentionReleased" TYPE DECIMAL(15, 2) USING "retentionReleased"::DECIMAL(15, 2)`,
    `ALTER TABLE "PurchaseRequisitionItem" ALTER COLUMN "quantity" TYPE DECIMAL(15, 4) USING "quantity"::DECIMAL(15, 4)`,
    `ALTER TABLE "RequisitionItemQuote" ALTER COLUMN "exFactoryRate" TYPE DECIMAL(15, 4) USING "exFactoryRate"::DECIMAL(15, 4)`,
    `ALTER TABLE "RequisitionItemQuote" ALTER COLUMN "transportRate" TYPE DECIMAL(15, 4) USING "transportRate"::DECIMAL(15, 4)`,
    `ALTER TABLE "MaterialStoreStock" ALTER COLUMN "currentStock" TYPE DECIMAL(15, 2) USING "currentStock"::DECIMAL(15, 2)`,
    `ALTER TABLE "VendorBill" ALTER COLUMN "grossAmount" TYPE DECIMAL(15, 2) USING "grossAmount"::DECIMAL(15, 2)`,
    `ALTER TABLE "VendorBill" ALTER COLUMN "vatAmount" TYPE DECIMAL(15, 2) USING "vatAmount"::DECIMAL(15, 2)`,
    `ALTER TABLE "VendorBill" ALTER COLUMN "tdsAmount" TYPE DECIMAL(15, 2) USING "tdsAmount"::DECIMAL(15, 2)`,
    `ALTER TABLE "VendorBill" ALTER COLUMN "netPayable" TYPE DECIMAL(15, 2) USING "netPayable"::DECIMAL(15, 2)`,
    `ALTER TABLE "VendorBill" ALTER COLUMN "paidAmount" TYPE DECIMAL(15, 2) USING "paidAmount"::DECIMAL(15, 2)`,
    `ALTER TABLE "VendorPayment" ALTER COLUMN "amount" TYPE DECIMAL(15, 2) USING "amount"::DECIMAL(15, 2)`,
    `ALTER TABLE "LeaveRequest" ALTER COLUMN "totalDays" TYPE DECIMAL(15, 2) USING "totalDays"::DECIMAL(15, 2)`,
    `ALTER TABLE "LeaveBalance" ALTER COLUMN "totalAllowed" TYPE DECIMAL(15, 2) USING "totalAllowed"::DECIMAL(15, 2)`,
    `ALTER TABLE "LeaveBalance" ALTER COLUMN "taken" TYPE DECIMAL(15, 2) USING "taken"::DECIMAL(15, 2)`,
    `ALTER TABLE "LeaveBalance" ALTER COLUMN "remaining" TYPE DECIMAL(15, 2) USING "remaining"::DECIMAL(15, 2)`,
    `ALTER TABLE "SiteExpense" ALTER COLUMN "amount" TYPE DECIMAL(15, 2) USING "amount"::DECIMAL(15, 2)`,
    `ALTER TABLE "SiteExpense" ALTER COLUMN "vatAmount" TYPE DECIMAL(15, 2) USING "vatAmount"::DECIMAL(15, 2)`,
    `ALTER TABLE "SiteExpense" ALTER COLUMN "totalAmount" TYPE DECIMAL(15, 2) USING "totalAmount"::DECIMAL(15, 2)`,
    `ALTER TABLE "SubcontractorBill" ALTER COLUMN "grossAmount" TYPE DECIMAL(15, 2) USING "grossAmount"::DECIMAL(15, 2)`,
    `ALTER TABLE "SubcontractorBill" ALTER COLUMN "retentionPercent" TYPE DECIMAL(15, 4) USING "retentionPercent"::DECIMAL(15, 4)`,
    `ALTER TABLE "SubcontractorBill" ALTER COLUMN "retentionAmount" TYPE DECIMAL(15, 2) USING "retentionAmount"::DECIMAL(15, 2)`,
    `ALTER TABLE "SubcontractorBill" ALTER COLUMN "vatPercent" TYPE DECIMAL(15, 4) USING "vatPercent"::DECIMAL(15, 4)`,
    `ALTER TABLE "SubcontractorBill" ALTER COLUMN "vatAmount" TYPE DECIMAL(15, 2) USING "vatAmount"::DECIMAL(15, 2)`,
    `ALTER TABLE "SubcontractorBill" ALTER COLUMN "tdsPercent" TYPE DECIMAL(15, 4) USING "tdsPercent"::DECIMAL(15, 4)`,
    `ALTER TABLE "SubcontractorBill" ALTER COLUMN "tdsAmount" TYPE DECIMAL(15, 2) USING "tdsAmount"::DECIMAL(15, 2)`,
    `ALTER TABLE "SubcontractorBill" ALTER COLUMN "materialDeduction" TYPE DECIMAL(15, 2) USING "materialDeduction"::DECIMAL(15, 2)`,
    `ALTER TABLE "SubcontractorBill" ALTER COLUMN "advanceRecovery" TYPE DECIMAL(15, 2) USING "advanceRecovery"::DECIMAL(15, 2)`,
    `ALTER TABLE "SubcontractorBill" ALTER COLUMN "netPayable" TYPE DECIMAL(15, 2) USING "netPayable"::DECIMAL(15, 2)`,
    `ALTER TABLE "SubcontractorBill" ALTER COLUMN "paidAmount" TYPE DECIMAL(15, 2) USING "paidAmount"::DECIMAL(15, 2)`,
    `ALTER TABLE "SubcontractorBill" ALTER COLUMN "verifiedGross" TYPE DECIMAL(15, 2) USING "verifiedGross"::DECIMAL(15, 2)`,
    `ALTER TABLE "SubcontractorBill" ALTER COLUMN "verifiedNet" TYPE DECIMAL(15, 2) USING "verifiedNet"::DECIMAL(15, 2)`,
    `ALTER TABLE "SubcontractorBillItem" ALTER COLUMN "contractQty" TYPE DECIMAL(15, 4) USING "contractQty"::DECIMAL(15, 4)`,
    `ALTER TABLE "SubcontractorBillItem" ALTER COLUMN "previousQty" TYPE DECIMAL(15, 4) USING "previousQty"::DECIMAL(15, 4)`,
    `ALTER TABLE "SubcontractorBillItem" ALTER COLUMN "thisQty" TYPE DECIMAL(15, 4) USING "thisQty"::DECIMAL(15, 4)`,
    `ALTER TABLE "SubcontractorBillItem" ALTER COLUMN "cumQty" TYPE DECIMAL(15, 4) USING "cumQty"::DECIMAL(15, 4)`,
    `ALTER TABLE "SubcontractorBillItem" ALTER COLUMN "rate" TYPE DECIMAL(15, 4) USING "rate"::DECIMAL(15, 4)`,
    `ALTER TABLE "SubcontractorBillItem" ALTER COLUMN "amount" TYPE DECIMAL(15, 2) USING "amount"::DECIMAL(15, 2)`,
    `ALTER TABLE "SubcontractorBillItem" ALTER COLUMN "verifiedQty" TYPE DECIMAL(15, 4) USING "verifiedQty"::DECIMAL(15, 4)`,
    `ALTER TABLE "SubcontractorBillItem" ALTER COLUMN "verifiedAmount" TYPE DECIMAL(15, 2) USING "verifiedAmount"::DECIMAL(15, 2)`,
    `ALTER TABLE "SubcontractorBillItem" ALTER COLUMN "disallowedQty" TYPE DECIMAL(15, 4) USING "disallowedQty"::DECIMAL(15, 4)`,
    `ALTER TABLE "CatalogMaterial" ALTER COLUMN "defaultRate" TYPE DECIMAL(15, 4) USING "defaultRate"::DECIMAL(15, 4)`,
    `ALTER TABLE "RateEntry" ALTER COLUMN "rate" TYPE DECIMAL(15, 4) USING "rate"::DECIMAL(15, 4)`,
    `ALTER TABLE "BankGuarantee" ALTER COLUMN "amount" TYPE DECIMAL(15, 2) USING "amount"::DECIMAL(15, 2)`,
    `ALTER TABLE "BankGuarantee" ALTER COLUMN "marginAmount" TYPE DECIMAL(15, 2) USING "marginAmount"::DECIMAL(15, 2)`,
    `ALTER TABLE "BankGuarantee" ALTER COLUMN "commissionRate" TYPE DECIMAL(15, 4) USING "commissionRate"::DECIMAL(15, 4)`,
    `ALTER TABLE "BankGuarantee" ALTER COLUMN "commissionPaid" TYPE DECIMAL(15, 2) USING "commissionPaid"::DECIMAL(15, 2)`,
    `ALTER TABLE "JvPartnerAgreement" ALTER COLUMN "commissionRate" TYPE DECIMAL(15, 4) USING "commissionRate"::DECIMAL(15, 4)`,
    `ALTER TABLE "JvPartnerAgreement" ALTER COLUMN "leadPartnerShare" TYPE DECIMAL(15, 2) USING "leadPartnerShare"::DECIMAL(15, 2)`,
    `ALTER TABLE "JvCommissionPayout" ALTER COLUMN "grossAmount" TYPE DECIMAL(15, 2) USING "grossAmount"::DECIMAL(15, 2)`,
    `ALTER TABLE "JvCommissionPayout" ALTER COLUMN "tdsPercent" TYPE DECIMAL(15, 4) USING "tdsPercent"::DECIMAL(15, 4)`,
    `ALTER TABLE "JvCommissionPayout" ALTER COLUMN "tdsAmount" TYPE DECIMAL(15, 2) USING "tdsAmount"::DECIMAL(15, 2)`,
    `ALTER TABLE "JvCommissionPayout" ALTER COLUMN "netAmount" TYPE DECIMAL(15, 2) USING "netAmount"::DECIMAL(15, 2)`,
    `ALTER TABLE "CompanyBankAccount" ALTER COLUMN "openingBalance" TYPE DECIMAL(15, 2) USING "openingBalance"::DECIMAL(15, 2)`,
    `ALTER TABLE "CompanyBankAccount" ALTER COLUMN "currentBalance" TYPE DECIMAL(15, 2) USING "currentBalance"::DECIMAL(15, 2)`,
    `ALTER TABLE "HeadOfficeExpense" ALTER COLUMN "amount" TYPE DECIMAL(15, 2) USING "amount"::DECIMAL(15, 2)`,
    `ALTER TABLE "JournalEntry" ALTER COLUMN "totalDebit" TYPE DECIMAL(15, 2) USING "totalDebit"::DECIMAL(15, 2)`,
    `ALTER TABLE "JournalEntry" ALTER COLUMN "totalCredit" TYPE DECIMAL(15, 2) USING "totalCredit"::DECIMAL(15, 2)`,
    `ALTER TABLE "JournalEntryLine" ALTER COLUMN "debit" TYPE DECIMAL(15, 2) USING "debit"::DECIMAL(15, 2)`,
    `ALTER TABLE "JournalEntryLine" ALTER COLUMN "credit" TYPE DECIMAL(15, 2) USING "credit"::DECIMAL(15, 2)`,
    `ALTER TABLE "BankReconciliation" ALTER COLUMN "statementClosingBalance" TYPE DECIMAL(15, 2) USING "statementClosingBalance"::DECIMAL(15, 2)`,
    `ALTER TABLE "BankReconciliation" ALTER COLUMN "recordedBalance" TYPE DECIMAL(15, 2) USING "recordedBalance"::DECIMAL(15, 2)`,
    `ALTER TABLE "BankReconciliation" ALTER COLUMN "adjustedBalance" TYPE DECIMAL(15, 2) USING "adjustedBalance"::DECIMAL(15, 2)`,
    `ALTER TABLE "BankReconciliation" ALTER COLUMN "outstandingPayments" TYPE DECIMAL(15, 2) USING "outstandingPayments"::DECIMAL(15, 2)`,
    `ALTER TABLE "BankReconciliation" ALTER COLUMN "unmatchedDeposits" TYPE DECIMAL(15, 2) USING "unmatchedDeposits"::DECIMAL(15, 2)`,
  ];

  for (const stmt of decimalBoundaryStatements) {
    try {
      await db.$executeRawUnsafe(stmt);
      executed++;
    } catch (e) {
      const msg = e instanceof Error ? e.message : "";
      if (msg.includes("already exists") || msg.includes("cannot be cast automatically")) {
        skipped++;
      } else {
        failed++;
        errors.push(`${msg.slice(0, 150)} — statement: ${stmt.slice(0, 80)}`);
      }
    }
  }

  return { applied: true, executed, skipped, failed, errors };
}
