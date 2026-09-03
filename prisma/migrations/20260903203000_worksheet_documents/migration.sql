-- Persisted generic office workbooks. Scope is JSON deliberately: it lets the
-- calculation engine serve IPC, variation and future record workspaces without
-- hard-coding a separate table for each business module.
CREATE TABLE "WorksheetDocument" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "projectId" TEXT,
    "documentKey" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "scope" JSONB NOT NULL,
    "workbook" JSONB NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorksheetDocument_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WorksheetDocument_organizationId_documentKey_key"
  ON "WorksheetDocument"("organizationId", "documentKey");
CREATE INDEX "WorksheetDocument_projectId_idx" ON "WorksheetDocument"("projectId");
CREATE INDEX "WorksheetDocument_organizationId_updatedAt_idx"
  ON "WorksheetDocument"("organizationId", "updatedAt");

ALTER TABLE "WorksheetDocument"
  ADD CONSTRAINT "WorksheetDocument_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorksheetDocument"
  ADD CONSTRAINT "WorksheetDocument_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "WorksheetDocument" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "WorksheetDocument" FORCE ROW LEVEL SECURITY;
CREATE POLICY "worksheet_document_org_isolation" ON "WorksheetDocument"
  FOR ALL
  USING (
    current_setting('app.is_superadmin', true) = 'true'
    OR "organizationId" = NULLIF(current_setting('app.organization_id', true), '')::text
  )
  WITH CHECK (
    current_setting('app.is_superadmin', true) = 'true'
    OR "organizationId" = NULLIF(current_setting('app.organization_id', true), '')::text
  );
