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
 * ── Connection-pool reality (Phase 0 of the RLS rollout) ─────────────
 * setOrgContext uses SESSION-level settings on the shared client. Prisma
 * pools connections, so a later query (and every interactive transaction)
 * may run on a DIFFERENT physical connection where the variable was never
 * set — session-level context is therefore best-effort only, even without
 * pgbouncer. The reliable primitive is withOrgContext(): TRANSACTION-scoped
 * settings set as the first statement INSIDE an interactive $transaction
 * callback, which pins the org for exactly that transaction's connection.
 *
 * Rollout rule (docs/plans/rls-rollout.md): any interactive $transaction
 * that touches RLS-covered tables MUST open with withOrgContext. Array-form
 * $transaction([...]) cannot run set_config (Prisma operations only) — such
 * call sites must be converted to interactive form when their tables get
 * RLS-enabled in their rollout phase.
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

/**
 * Transaction-scoped org context — the RELIABLE RLS primitive.
 *
 * Set this as the FIRST statement inside a Prisma interactive transaction:
 *
 *   await db.$transaction(async (tx) => {
 *     await withOrgContext(tx, ctx.user.organizationId, !!ctx.user.isSuperAdmin);
 *     // ... writes to RLS-covered tables ...
 *   });
 *
 * `is_local = true` scopes the setting to the current transaction, which
 * runs on exactly one pooled connection — unlike session-level
 * setOrgContext, this cannot miss due to pool rotation. When RLS is
 * FORCEd on a table (rollout phases 1–3), a transaction that forgot this
 * call fails CLOSED (0 rows) instead of leaking cross-org data.
 *
 * Fail-soft like setOrgContext: telemetry over correctness of the
 * defense-in-depth layer; app-level where clauses remain the primary
 * tenant filter.
 */
export async function withOrgContext(
  tx: DbTxClient,
  organizationId: string | null | undefined,
  isSuperAdmin = false,
): Promise<void> {
  try {
    await tx.$executeRawUnsafe(
      `SELECT set_config('app.organization_id', $1, true), set_config('app.is_superadmin', $2, true)`,
      organizationId ?? "",
      isSuperAdmin ? "true" : "false"
    );
  } catch (err) {
    // Don't throw — RLS is defense-in-depth, not the primary filter.
    console.error("Failed to set RLS org context (tx):", err);
  }
}
