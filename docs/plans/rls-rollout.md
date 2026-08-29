# RLS Rollout Plan — Row-Level Security Beyond `Project`

**Status:** DRAFT — awaiting go-ahead before any schema/migration changes
**Scope:** Extend PostgreSQL Row-Level Security from the single `Project` table to the full tenant-scoped surface (50 org-scoped models + 71 project-scoped models).
**Author:** repo governance agent · **Date:** 2026-08-30

---

## 1. Current state

- RLS exists **only** on `"Project"` (`src/lib/rls.ts`, applied manually — not in a Prisma migration).
- `setOrgContext(db, orgId, isSuperAdmin)` is called from the three tRPC procedure families in `src/server/trpc.ts` (`protectedProcedure`, `orgProcedure`, `superAdminProcedure`) via session-level `set_config('app.organization_id', …, false)`.
- App-level org/project filtering in routers is the **primary** defense and is now well-tested (22 router test files, incl. `tenant-isolation.test.ts`). RLS is defense-in-depth: it contains the blast radius of any future missing-`where` bug at the database layer.

### Table inventory (from `prisma/schema.prisma`, 132 models)

| Class | Count | Examples |
|---|---|---|
| Org-scoped (`organizationId` column) | 50 | `JournalEntry`, `Payment`, `VendorBill`, `Vendor`, `BankAccount`, `OrganizationBankAccount`, `FiscalYear`, `GlobalPreset`, … |
| Project-scoped (`projectId` column) | 71 | `Material`, `MaterialTransaction`, `PurchaseOrder`, `Staff`, `StaffAdvance`, `EquipmentRental`, `DailyReport`, `Rfi`, … |
| Global / pre-auth | 11 | `User`, `Session`, `Organization`, `RateCatalog*` (shared reference data), `StoredFile`, … |

## 2. Gaps found while drafting this plan

| # | Gap | Severity | Notes |
|---|---|---|---|
| G-1 | **No `FORCE ROW LEVEL SECURITY`** on `"Project"` | High | RLS policies do **not** apply to the table owner, and Prisma typically connects as the owner. The existing policies may currently be no-ops. Must add `ALTER TABLE "Project" FORCE ROW LEVEL SECURITY;` and verify the connect role. |
| G-2 | **REST API routes bypass `setOrgContext`** | High | `src/app/api/{search, dashboard, audit, documents/[itemId], drawings/[itemId]/file, files/[key]}` query the db directly after `getCurrentUser()` without setting `app.organization_id`. Extending RLS **before** fixing these would make them return zero rows (fail-closed) — correct security-wise but a functional regression. Fix order matters. |
| G-3 | **`organizationId IS NULL` legacy hole** | Medium | All four Project policies allow `organizationId IS NULL` rows to be visible to *every* org. Any org-scoped table with legacy NULL rows would be fully cross-readable the moment the same policy template is reused. Requires a backfill migration first. |
| G-4 | **Session-level `set_config` + pgbouncer** | Medium | With transaction-mode pooling, a session-level variable can land on backend connection A while the next query runs on backend B → wrong org context (either over-permissive or fail-closed). Documented in code; must be resolved as part of rollout (§4, Phase 0). |
| G-5 | Policies not under migration control | Low | Current SQL lives in `src/lib/rls.ts` as a string. A `prisma migrate reset` / new environment silently loses RLS. All new policies must ship as numbered Prisma migrations. |
| G-6 | Prisma `$transaction` blocks don't re-set context | Medium | `setOrgContext` runs per request in the context builder. Interactive transactions reuse a dedicated connection; with transaction-scoped settings (§4) each `$transaction` must set `app.organization_id` **inside** the tx callback. |

## 3. Policy templates

### 3.1 Org-scoped tables (Phase 1–2)

```sql
ALTER TABLE "<Table>" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "<Table>" FORCE ROW LEVEL SECURITY;   -- G-1: applies policies to the owner role too

DROP POLICY IF EXISTS "<table>_org_isolation" ON "<Table>";
CREATE POLICY "<table>_org_isolation" ON "<Table>"
  FOR ALL
  USING (
    current_setting('app.is_superadmin', true) = 'true'
    OR "organizationId" = NULLIF(current_setting('app.organization_id', true), '')::text
  )
  WITH CHECK (
    current_setting('app.is_superadmin', true) = 'true'
    OR "organizationId" = NULLIF(current_setting('app.organization_id', true), '')::text
  );
```

Differences from the current Project policy: **no `IS NULL` escape** (G-3) and one `FOR ALL` policy instead of four per-command policies (simpler, same semantics once `WITH CHECK` is present).

> ⚠️ `FORCE` + missing context = **fail closed** (0 rows). That is the desired direction for defense-in-depth, but it makes G-2 (REST routes) a hard prerequisite.

### 3.2 Project-scoped tables (Phase 3)

```sql
ALTER TABLE "<Table>" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "<Table>" FORCE ROW LEVEL SECURITY;

CREATE POLICY "<table>_project_org_isolation" ON "<Table>"
  FOR ALL
  USING (
    current_setting('app.is_superadmin', true) = 'true'
    OR EXISTS (
      SELECT 1 FROM "Project" p
      WHERE p."id" = "<Table>"."projectId"
        AND p."organizationId" = NULLIF(current_setting('app.organization_id', true), '')::text
    )
  )
  WITH CHECK ( /* same predicate */ );
```

Notes:
- Verify on the target PG version during Phase-3 staging how the `EXISTS` subquery interacts with the invoking user's own policies on `"Project"` (policy subqueries run with the invoking user's permissions on PG < 15 behavior changes; on PG 15+ they can be subject to RLS depending on configuration). This is exactly why Phase 3 ships last and in sub-batches.
- Rows with `projectId IS NULL` on project-scoped tables (if any exist) fail closed. The inventory query in §5 flags them before rollout.

### 3.3 Global tables (Phase 4 — mostly NO RLS)

`User`, `Session`, `Organization` are queried **pre-auth** (login, signup, first-user check) and must stay world-readable-by-code. RLS is not the right tool; rely on:
- existing auth flows (already hardened), and
- (optional, later) splitting a `read-only reporting` Postgres role with column grants if analytics tooling is ever attached.

## 4. Rollout phases

### Phase 0 — Groundwork (prerequisite, no policies yet)
1. **Connection mode decision (G-4):** confirm which endpoint Prisma uses (Neon direct vs pooled).
   - Pooled/transaction mode → switch to **transaction-scoped context**: `set_config(..., true)` executed as the **first statement inside every Prisma interactive `$transaction` callback**, via a `withOrgContext(tx, orgId)` helper in `src/lib/rls.ts` (G-6). Non-transactional single queries on pooled connections keep session-level as best-effort.
   - Direct/session mode → keep current session-level approach, but set it per connection (e.g. a `pg` pool connect hook) so it cannot leak across requests on reused connections.
2. **REST route fix (G-2):** call `setOrgContext(db, user.organizationId, user.isSuperAdmin)` right after `getCurrentUser()` in the six authenticated REST routes (`search`, `dashboard`, `audit`, `documents/[itemId]`, `drawings/[itemId]/file`, `files/[key]`).
3. **Backfill migration (G-3):** one-off script that backfills `organizationId` from the owning project/user chain for org-scoped tables with NULLs, then adds `NOT NULL` where the model allows.
4. **Inventory script:** `scripts/rls-inventory.ts` — parses `prisma/schema.prisma`, emits the three table lists, and (with `DATABASE_URL`) reports NULL-org/NULL-project row counts against the target database (read-only).
5. **Drift guard test (G-5):** unit test `src/server/routers/__tests__/rls-coverage.test.ts` that parses `schema.prisma`, extracts org/project-scoped models, and asserts every one of them appears in the RLS migration SQL under `prisma/migrations/` (pure static check, no DB needed). This prevents new models from silently shipping without policies.

### Phase 1 — Money-critical org-scoped tables (staging → prod)
`JournalEntry`, `JournalLine`, `Payment`, `VendorBill`, `VendorBillItem`, `BankAccount`, `OrganizationBankAccount`, `FiscalYear`, `PayrollRun`, `PayrollItem`.
Ship as `prisma/migrations/<ts>_rls_phase1_org_money/`. After deploy, monitor error rates + run the smoke checklist (§6) in prod for 48 h.

### Phase 2 — Remaining org-scoped tables (39 more)
Generated from the inventory script in one migration. Same 48 h watch window.

### Phase 3 — Project-scoped tables (71)
Highest blast radius (policy subquery semantics + performance). Sub-batched:
- 3a: procurement/materials (`Material`, `MaterialTransaction`, `PurchaseOrder*`, `Requisition*`, `StoreLocation*`)
- 3b: HR/equipment (`Staff`, `StaffAdvance`, `Attendance*`, `Leave*`, `Equipment*`, `PayrollAdvance`)
- 3c: site/office documents (`DailyReport*`, `Rfi`, `Submittal`, `PunchList`, `Correspondence*`, `Drawing*`, `Document*`)
Only after 3a is green in prod for a week do we start 3b, etc.

### Phase 4 — Hardening & maintenance
- Add `FORCE` to `"Project"` itself and retire the legacy NULL-org policies.
- CI integration test gated on `TEST_DATABASE_URL`: spin scratch Postgres, run migrations, assert cross-org SELECT/INSERT/UPDATE/DELETE return 0 rows / error, same-org CRUD succeeds, superadmin bypass works.
- Add the RLS inventory + drift test to the required CI gates.

## 5. Pre-flight inventory SQL (read-only, run against prod)

```sql
-- Org-scoped tables with NULL org rows (must be 0 rows before Phase 1)
SELECT 'JournalEntry' t, count(*) FROM "JournalEntry" WHERE "organizationId" IS NULL
UNION ALL SELECT 'Payment', count(*) FROM "Payment" WHERE "organizationId" IS NULL
-- … one line per org-scoped table (generated by scripts/rls-inventory.ts)

-- Project-scoped tables with NULL project rows (must be 0 before Phase 3)
SELECT 'Material' t, count(*) FROM "Material" WHERE "projectId" IS NULL
UNION ALL …
```

## 6. Smoke checklist (per phase, in staging then prod)

1. Login as org-A user → project list shows only org-A projects.
2. Create a vendor bill / journal entry → succeeds; row visible only to org A.
3. As org-B user, attempt `GET /api/documents/<org-A-doc-id>` → 404 (fail-closed, not 403 — do not leak existence).
4. Superadmin login → sees all orgs (bypass works).
5. REST search `/api/search?q=<term-from-org-B>` → no org-B hits.
6. Prisma interactive transactions (payment posting) still work after the `withOrgContext` change (G-6).
7. Error rate / `Failed to set RLS org context` log lines unchanged in the 48 h window.

## 7. Performance considerations

- Every org-scoped table needs an index on `"organizationId"` if not already present (Prisma relation indexes usually cover this — the inventory script lists missing ones).
- Phase-3 `EXISTS` policies evaluate per row; for hot project-scoped tables (`MaterialTransaction`, `DailyReport`) verify with `EXPLAIN (ANALYZE)` on a realistic dataset and add a composite index if the planner degrades. Expected impact is small because app-level `where` clauses already restrict to the same rows — RLS re-checks the same predicate.
- `current_setting(..., true)` is cheap; the cast + `NULLIF` run per row but are trivial.

## 8. Rollback

Every phase migration has a paired down-migration (`DROP POLICY …; ALTER TABLE … NO FORCE ROW LEVEL SECURITY; ALTER TABLE … DISABLE ROW LEVEL SECURITY;`). Policies are additive metadata (no table rewrite, brief `ShareRowExclusive` lock only), so rollback is instant. The 48 h monitoring window per phase exists to catch functional regressions, not performance ones.

## 9. Effort estimate

| Phase | Effort | Risk |
|---|---|---|
| 0 | 1–1.5 days (script + REST fix + tx helper + drift test) | Low |
| 1 | 0.5 day + 48 h watch | Medium |
| 2 | 0.5 day + 48 h watch | Medium |
| 3 | 1.5–2 days + 1 week watch (3 sub-batches) | High (do last) |
| 4 | 0.5 day | Low |

Total ≈ 4–5 working days spread over ~3 calendar weeks (watch windows between phases).
