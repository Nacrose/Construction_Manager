# ADR 0008 — Clean Break Over Coexistence

- **Status:** Accepted
- **Date:** 2026-09
- **Deciders:** Core engineering

## Context

The operating-model redesign would normally require backfills, dual-write
contracts, reconciliation periods, id-mapping, and legacy/new model
coexistence — machinery that exists solely to protect production data. All
database and storage data in every deployment is test data and is explicitly
declared disposable by the product owner. Meanwhile the design principle is
"consolidate or throw away, not duplicate".

## Decision

1. **Reshape in place; never duplicate.** Where a concept survives, the
   existing table is re-grained or renamed (`PayrollRun`, `StaffAttendance`,
   `StaffAdvance`, `LeaveBalance`). Where a concept is new
   (`Person`, `ProjectStaffAssignment`, `OrganizationPolicyVersion`,
   `PayrollAllocation`), new tables are created. Tables replaced by a better
   concept (`Staff`) are dropped. No `V2`-suffixed tables, no legacy/new
   read paths, no `staffId ↔ personId` mapping tables.

2. **No data-preservation machinery.** No backfill, no dual-write matrix, no
   reconciliation reports, no deep-link compatibility shims. Migrations may
   truncate replaced child tables.

3. **This is a one-way door, accepted once.** Dropping legacy tables destroys
   whatever is in any deployment. Accepted explicitly for test data; if real
   contractor data ever exists in a deployment, this ADR must be revisited
   BEFORE any further destructive migration ships.

4. **The window is temporary.** Once real data exists, every future
   structural change reverts to standard migration discipline (backfill,
   dual-write, reconciliation). This ADR covers the operating-model redesign
   only.

## Consequences

- Status columns being touched can adopt native Postgres enums matching the
  typed registry (no legacy-value shims like "Rejected" terminal nodes).
- Every milestone still ends green (tsc, tests, live-PG migrate/RLS/smoke) —
  failure mode is `git revert` + database rebuild, which is cheap.
- `admin.verifyDbSchema` EXPECTED_TABLES and the RLS tracker must be updated
  in the same change as any rename, so schema verification stays honest.
