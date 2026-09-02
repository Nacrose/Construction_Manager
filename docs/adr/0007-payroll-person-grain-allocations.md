# ADR 0007 — Payroll at Person Grain with Project Allocations

- **Status:** Accepted
- **Date:** 2026-09
- **Deciders:** Core engineering

## Context

Payroll runs are project-scoped and keyed to per-project `Staff` rows. A
monthly employee shared across projects is paid three times or reconciled by
hand; advances can be recovered twice across projects (the old flow even
mutated the advance principal downward for partial recovery, destroying
history); attendance and leave live at the wrong grain.

## Decision

1. **Payroll is organization-level.** One `PayrollRun` per org per period
   (database-enforced unique index, not app code). Runs carry
   `policyVersionId`. `PayrollPersonRecord` rows are per *person* — salary is
   calculated once per person per period from combined attendance.

2. **`PayrollAllocation` splits cost to projects.** Each person record holds
   allocations per `ProjectStaffAssignment` (actual approved days/hours;
   assignment `allocationPercent` as fallback; manual splits require an
   override reason and audit record). Invariant: the sum of allocation nets
   equals the person record's net **exactly** — Decimal arithmetic via
   `money.ts`, largest-remainder or residual-on-primary-assignment. JE balance
   tolerance is `eq(0)` (ADR-0001), so rounding drift fails the ledger loudly.

3. **One posting, many lines.** Payroll cost posts once as an org-level
   balanced journal entry whose labor expense *lines* carry
   `JournalEntryLine.projectId` per allocation (the column already exists and
   is indexed). Liability accounts (salary payable, TDS, advances recoverable)
   and bank remain organization-level.

4. **Advances belong to the person.** The issuing project is retained for
   ledger attribution. Recovery is a CAS-guarded increment:
   `recoveredAmount + x ≤ amount` enforced by a guarded conditional UPDATE —
   never a boolean flip, never principal mutation. The same advance cannot be
   recovered twice, including across concurrent runs.

5. **Daily-report workforce is an attendance source, not a second labor-cost
   system.** Productivity/attendance feeds the person record; project cost
   flows only through allocations.

## Consequences

- Legacy project-grain runs are migrated during the clean break (ADR-0008);
  the reconciliation window required for production data does not apply.
- The settlement primitive (ADR-0006) owns disbursement; the payroll
  liability → settlement JE chain stays idempotent on the run id.
- Opening stock / store setup for new capabilities never rewrites historic
  direct-expense labor records.
