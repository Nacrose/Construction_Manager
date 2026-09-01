# ADR 0001 — Fail-Loud Financial Guard Pipeline

- **Status:** Accepted
- **Date:** 2026-09
- **Deciders:** Core engineering

## Context

Construction Manager posts journal entries, enforces fiscal-year locks, checks
approval delegation limits, and isolates bank operations. Before Phase E these
invariants were enforced by hand-rolled calls (`assertNotLocked`,
`assertDelegation`, `assertOrgBankAccount`, …) sprinkled through individual
router handlers. Two failure modes kept appearing:

1. **Silent omission.** A new financial endpoint would simply forget one of
   the four checks. Nothing failed at build time, test time, or runtime —
   the invariant only surfaced in an audit.
2. **Silent recovery.** When a guard *did* run and its precondition was
   missing (no fiscal-year config, no delegation config for the org), the
   path of least resistance was to fall back to a permissive default. Money
   then moved under rules nobody had chosen.

## Decision

1. **One declarative pipeline.** `createDomainRouter().proc.*` plus
   `financialGuard({ action, dateField, amountFields })` own the security
   prelude for financial mutations: role gate → org isolation → fiscal-year
   lock → delegation limit → bank isolation. Handlers contain business logic
   only.

2. **Fail loud, never fall back.** Every guard throws when a precondition or
   configuration is missing. There is no permissive default: a missing
   delegation config is an error, not an unlimited budget. A misconfigured
   org blocks money movement until someone configures it — that is the
   correct default for a financial system.

3. **Explicit fields.** `amountFields` names the exact inputs that carry
   money; the guard coerces/validates them centrally so a renamed payload
   field cannot bypass a delegation check.

## Consequences

- Adding a financial endpoint is *harder to do unsafely* than safely: the
  declarative path is the path of least resistance.
- Record-level authorization (the record's `projectId` governs, not the
  input) stays inline by design — it is a different concern and cannot be
  declared from input alone. See the engine ratchet for the pinned split.
- `engine-ratchet.test.ts` pins the hand-rolled counts shrink-only, so the
  pipeline's adoption can only grow.

## Compliance (2026-09 verification)

- `financialGuard` restored after an accidental revert; guarded routers:
  `site-expense`, `jv-partner` (floor pinned in the ratchet).
- Approval paths post journal entries inside the same `$transaction` as the
  status change, guarded by compare-and-swap status locks (see ADR 0002).
