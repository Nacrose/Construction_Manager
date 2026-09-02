# ADR 0004 — Operating Method and Capability Model

- **Status:** Accepted
- **Date:** 2026-09
- **Deciders:** Core engineering

## Context

Workflow authority is currently spread across `Organization.operatingModel`
(four legacy string values), a JSON `allowedRoles` column on `DelegationRule`,
and hard-coded role checks in routers. Two values in active use are not even
members of the declared union (`delegation.ts` falls back to
`"hybrid_project_autonomous"`), and the same JSON list mixes org roles and
project roles. Contractors range from a sole owner operating ten projects to
structured JVs, but the current model has no way to say "this org simply has
no procurement workflow" without hiding UI by hand.

## Decision

1. **Operating method is a workflow template, not a contractor-size class.**
   Exactly three methods: `owner_led`, `crew_led`, `delegated`. It must never
   be inferred from project count, user count, staff count, or pricing tier —
   the product has no commercial packaging axis at all.

2. **Capabilities are the real workflow authority.** Each method resolves to a
   capability map:

   ```ts
   type OperatingCapabilities = {
     procurementChain: "none" | "quotes" | "full";
     inventoryControl: "none" | "basic" | "controlled";
     gateRegister: boolean;
     financeReview: "owner_recorded" | "delegated_review";
     directPurchase: boolean;
     directExpense: boolean;
     workforcePlanning: boolean;
   };
   ```

   The method supplies defaults; the capability map is what routers and the
   engine check. Capabilities gate *what the org can do*; roles gate *who*;
   delegation `maxAmount` gates *how much*. Three different axes, three
   different types — never merged again.

3. **Disabling a capability is prospective.** New and unposted work binds to
   the active policy version; historical posted records are never reinterpreted
   under later settings. Re-enabling restores prior history untouched.

4. **`owner_led` defaults:** procurementChain none, inventoryControl none,
   gateRegister off, financeReview owner_recorded, directPurchase on,
   directExpense on, workforcePlanning on. No requisitions, POs, quotes,
   stores, gate register, or approval chain exist server-side — they are
   absent from the capability map, not hidden in the UI.

## Consequences

- `Organization` gains `operatingMethod` plus an `activePolicyVersionId`; the
  legacy `operatingModel` column is dropped in the policy phase.
- Every controlled mutation asserts its capability at the procedure-factory
  choke point (ADR-0006), so a router cannot forget it.
- UI navigation is *derived* from the resolved capability map — it is a
  projection, never the guard.
