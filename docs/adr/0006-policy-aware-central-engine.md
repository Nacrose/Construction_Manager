# ADR 0006 — Policy-Aware Central Engine (Extend, Never Parallel)

- **Status:** Accepted
- **Date:** 2026-09
- **Deciders:** Core engineering

## Context

The central engine (declarative lifecycle graphs, CAS transitions,
transactional outbox, financial guard pipeline — ADR-0002/0001) is the right
foundation, but its API is stringly typed: raw `targetState: string`,
`additionalData: Record<string, any>`, `db as any` delegate resolution, and
separately maintained graph/delegate/policy maps. Parallel domain engines
would multiply authority paths; forcing ordinary reads through the engine
would bury it in CRUD.

## Decision

1. **One engine system, extended in place — never a parallel one.** The
   engine owns every controlled boundary: lifecycle transitions, financial
   settlement, posted-history, authority, capability, and fiscal-period
   checks. Domain services (workforce, payroll, inventory) consume shared
   primitives and never build side channels around them.

2. **Three primitives, three kinds of truth:**

   | Primitive | Owns | Never owns |
   |---|---|---|
   | Lifecycle engine | submit/approve/reject/issue/receive/certify/close | payment arithmetic, derived values |
   | Settlement primitive | partial/complete payments, reversals, payroll disbursement (CAS on amounts) | generic document state machines |
   | Derived-status evaluator | paid/partially paid, expired, overdue, allocation conflicts | persisted transitions |

   Derived payment status (e.g. vendor bill paid/partially paid) is computed
   from amounts, never flipped by lifecycle transitions.

3. **Transitions are actions, not raw target states.** Callers say
   `approve requisition`, not `set status = approved`. Two actions may share a
   target state but differ in authority and side effects. The engine resolves
   action → source states → target → capability → authority/delegation →
   fiscal period → hooks → CAS update → audit/outbox event.

4. **Typed engine context is mandatory.** Every controlled command executes
   through one context carrying the org-scoped transaction, actor,
   organizationId, project scope, resolved policy, `policyVersionId`, and
   effective business date. There is no way to run a financial or lifecycle
   command outside that context.

5. **Not everything goes through the engine.** Reads, filters, UI preferences,
   lookups, and harmless CRUD stay ordinary code. The test is *controlled
   state, money, authority, or posted history* — if none apply, the engine is
   not invited.

6. **Capability enforcement is middleware at the procedure factory, not
   per-router calls** (the H-16 lesson: payroll once had no delegation action
   at all). A mutation without a declared capability cannot be expressed.

## Consequences

- Migration is a shrink-only ratchet: convert cleanest models first
  (site expense, leave, requisition, purchase order), keep a deprecated bridge
  for legacy `targetState` callers, and forbid growth of raw status writes via
  CI baselines (ADR-0003).
- Type the money-touching lifecycles first; the long tail converts
  opportunistically.
- Legacy data cleanup is not a concern under ADR-0008 (clean break).
