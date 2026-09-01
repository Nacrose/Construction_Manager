# ADR 0003 — Shrink-Only Ratchets as Architectural Debt Budgets

- **Status:** Accepted
- **Date:** 2026-09
- **Deciders:** Core engineering

## Context

Large refactors decay. The engine adoption (ADR 0001/0002) started with a
few migrated routers; legacy hand-rolled guards, float money coercions, and
`any` types remained scattered across ~70 routers. Experience shows the
failure mode is never a big regression commit — it is fifty small PRs that
each add one more shortcut while nobody is looking, until the architecture
is fiction.

Conventional lint rules reject *any* occurrence, which forces a big-bang
cleanup nobody has time for, so the rule gets deleted instead.

## Decision

Pin **current counts as ceilings** in ordinary vitest tests, and let them
only shrink:

| Ratchet | Scope | Baseline |
|---|---|---|
| `engine-ratchet.test.ts` — hand-rolled authz calls | routers | 456 |
| `engine-ratchet.test.ts` — hand-rolled fiscal locks | routers | 37 |
| `engine-ratchet.test.ts` — float-money coercions | server + lib | 34 |
| `any-ratchet.test.ts` — `: any` / `as any` | server + lib | 235 |

Grow-only floors complement them (declarative adoption must not shrink:
`createDomainRouter` ≥ 3, `financialGuard` ≥ 2).

Rules for engineers:

- **A PR that grows a ratchet fails CI.** There is no "temporarily bump the
  number" — increasing a baseline is a revert of the budget, not a config
  change.
- **Lowering a baseline is encouraged** and is the unit of refactoring
  progress: migrate one router, drop the number, commit both together.
- Legitimate residue is documented in the test header (e.g. record-level
  authorization stays inline by design; the authz count will not reach
  zero — and that is fine).

## Consequences

- Debt becomes visible, quantified, and monotonic — the architecture
  cannot silently erode.
- Tests run in milliseconds (filesystem counting), no runtime cost.
- The mechanism generalizes: any countable regression class (console.log,
  TODOs, raw SQL strings) can be ratcheted the same way.

## Related incidents

The one security-layer revert this codebase suffered (Phase E) would have
been caught immediately by the ratchet suite had CI been running on push —
both the ratchet and the push trigger are now in place.
