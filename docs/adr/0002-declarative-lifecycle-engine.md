# ADR 0002 — Declarative Lifecycle Engine with Compare-and-Swap Transitions

- **Status:** Accepted
- **Date:** 2026-09
- **Deciders:** Core engineering

## Context

The app manages dozens of approval lifecycles: site expenses, subcontractor
bills, purchase orders, requisitions, variation orders, leaves, daily
reports, submittals, punch items. Each lifecycle historically encoded its
rules as ad-hoc `if (status !== "x") throw` checks inside router handlers,
then performed an unconditional `update({ where: { id } })`.

Problems observed in audit:

1. **Divergent rules.** The same conceptual flow (draft → pending →
   approved) allowed different transitions in different routers, and no
   single place described the lifecycle.
2. **Lost update races.** Two concurrent approvals both passed the
   `status === "pending"` read-time check, both executed an unconditional
   write, and both posted a journal entry — a double payment on paper.
   The window is small but real on mobile networks with retrying clients.
3. **Mass assignment.** Transition payloads could smuggle protected fields
   (`status`, `approvedById`, `organizationId`, …) through
   `additionalData`.

## Decision

1. **One declarative graph.** `LIFECYCLE_GRAPHS` in
   `src/server/utils/state-machine.ts` maps every supported model to its
   allowed `currentStatus → [nextStatuses]`. Routers call
   `canTransition()` / `transitionEntityState()` instead of encoding rules
   inline.

2. **Compare-and-swap persistence.** The write is
   `updateMany({ where: { id, status: <status-as-read> } })`. Zero matched
   rows means a concurrent request transitioned the record between our read
   and write; the transition fails with `CONFLICT` and the client retries.
   This makes double-posting structurally impossible rather than unlikely.

3. **Reserved-key stripping.** `additionalData` is filtered against
   `RESERVED_KEYS` and spread *first* (status/attribution fields are set
   last), so protected fields cannot be overridden by caller input.

4. **Atomic side effects.** Where a transition posts a journal entry
   (e.g. `siteExpense.approve`), the CAS write, the re-read, and the entry
   live in one `$transaction` — the JE can never exist without the status
   change or vice versa.

## Consequences

- Client UX must handle `CONFLICT` by reloading the record ("already
  processed by another approver") instead of blindly retrying.
- Adding a lifecycle state is a one-line graph edit plus a test, visible in
  review.
- `transitionEntityState` accepts any `DbTxClient`, so the same engine runs
  inside fiscal-locked transactions and RLS-scoped contexts unchanged.
