import type { DbTxClient } from "@/lib/db";

/**
 * PostgreSQL Row-Level Security (RLS) for multi-tenant isolation.
 *
 * Enables RLS on tenant-scoped tables and creates policies that enforce
 * organization-level data isolation at the database level — not just the
 * application level.
 *
 * How it works:
 * 1. RLS is enabled on the "Project" table (and other tenant tables).
 * 2. A policy checks: row.organization_id = current_setting('app.organization_id')
 * 3. Before each request, the tRPC context sets this session variable
 *    via: SELECT set_config('app.organization_id', '<org_id>', false)
 *
 * This means even if a bug in the application code skips the org filter,
 * the database itself will block the query from returning data from
 * another organization.
 *
 * NOTE: With Neon's pooled connections (pgbouncer), session-level
 * settings (set_config with is_local=false) may not persist across
 * queries if pgbouncer routes them to different backend connections.
 * For maximum safety, use Neon's session-pooler endpoint for RLS-backed
 * deployments. The app-level filtering in project.list is the primary
 * defense; RLS is defense-in-depth.
 */

/**
 * The SQL statements to enable RLS.
 * These are idempotent (safe to run multiple times).
 */
export const RLS_SQL = `
-- ═══════════════════════════════════════════════════════════════
-- Row-Level Security on Project table
-- ═══════════════════════════════════════════════════════════════

-- Enable RLS on Project table
ALTER TABLE "Project" ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist (idempotent)
DROP POLICY IF EXISTS "project_org_isolation" ON "Project";
DROP POLICY IF EXISTS "project_insert_org_check" ON "Project";

-- Policy 1: Users can only see projects in their organization
-- (or projects with no organization — for backwards compatibility with
--  shared/global rows that predate multi-tenancy)
CREATE POLICY "project_org_isolation" ON "Project"
  FOR SELECT
  USING (
    current_setting('app.is_superadmin', true) = 'true'  -- platform superadmin sees all orgs
    OR "organizationId" IS NULL  -- legacy/shared rows (pre-multi-tenancy)
    OR "organizationId" = NULLIF(current_setting('app.organization_id', true), '')::text
  );

-- Policy 2: When inserting, the org must match (or be null for legacy)
CREATE POLICY "project_insert_org_check" ON "Project"
  FOR INSERT
  WITH CHECK (
    "organizationId" IS NULL
    OR "organizationId" = NULLIF(current_setting('app.organization_id', true), '')::text
  );

-- Policy 3: Updates — users can update projects in their org
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

-- Policy 4: Deletes — only org members can delete
CREATE POLICY "project_delete_org_check" ON "Project"
  FOR DELETE
  USING (
    "organizationId" IS NULL
    OR "organizationId" = NULLIF(current_setting('app.organization_id', true), '')::text
  );
`;

/**
 * Set the organization context for the current database session.
 * Must be called at the start of each request (tRPC context).
 *
 * With Neon's pgbouncer pooler, we use session-level (is_local=false)
 * settings. This may not be 100% reliable with pgbouncer in transaction
 * mode, but provides defense-in-depth alongside app-level filtering.
 *
 * @param db Prisma client
 * @param organizationId The user's organization ID (null for users without an org)
 * @param isSuperAdmin When true, the session can bypass organization scoping
 */
export async function setOrgContext(
  db: DbTxClient,
  organizationId: string | null | undefined,
  isSuperAdmin = false,
): Promise<void> {
  try {
    await db.$executeRawUnsafe(
      `SELECT set_config('app.organization_id', $1, false), set_config('app.is_superadmin', $2, false)`,
      organizationId ?? "",
      isSuperAdmin ? "true" : "false"
    );
  } catch (err) {
    // Don't throw — RLS is defense-in-depth, not the primary filter.
    console.error("Failed to set RLS org context:", err);
  }
}
