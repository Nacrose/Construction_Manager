/**
 * Lifecycle Graph Integrity & Router-Alignment Tests (Engine Protocol Phase A)
 *
 * Two layers, both static — no database required:
 *
 * 1. INTEGRITY: the graph itself must be a sane state machine
 *    (no self-edges, no dead ends, terminals closed, everything reachable,
 *    real Prisma delegate names).
 *
 * 2. ALIGNMENT: every status literal in each owning router must be a known
 *    state of that model's graph (or an explicitly documented BACKLOG state).
 *    This is the drift detector: if a router starts writing a status the
 *    engine doesn't know about, CI fails here — the "sweep" becomes automatic.
 *
 * KNOWN_DRIFT documents behaviors that exist in routers today but are NOT
 * sanctioned by the graph (the graph is normative). Each entry must be closed
 * during Phase B/C migration of that domain — either the router gains a guard
 * or the graph gains the edge.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  LIFECYCLE_GRAPHS,
  lifecycleStates,
  isTerminalState,
  canTransition,
  sourceStatesFor,
  type LifecycleModel,
} from "./lifecycle-graph";

const ROUTERS_DIR = join(__dirname, "..", "routers");

/** Delegate names that MUST exist on the Prisma client. */
const VALID_PRISMA_DELEGATES = new Set([
  "leaveRequest",
  "siteExpense",
  "subcontractorBill",
  "purchaseOrder",
  "purchaseRequisition",
  "variationOrder",
  "dailyReport",
]);

const VALID_ROLES = new Set([
  "project_manager",
  "engineer",
  "coordinator",
  "client",
  "inspector",
]);

/**
 * Status literals that appear in an owning router but have NO graph edges —
 * each with the reason it is legitimately absent from the graph. The alignment
 * test fails if a NEW unexplained literal appears; close backlog entries
 * (add a real edge, or delete the dead state) during that domain's migration.
 */
const BACKLOG_STATES: Record<string, Array<{ state: string; reason: string }>> = {
  subcontractorBill: [
    { state: "verified", reason: "Declared in schema comment and legacy filters; no write path sets it today." },
    { state: "disputed", reason: "Declared in schema comment; dispute flow not yet built." },
    { state: "active", reason: "Belongs to Project queries joined in reconciliation lookups, not the bill itself." },
    { state: "approved", reason: "Belongs to IPC queries joined in reconciliation lookups, not the bill itself." },
  ],
  purchaseOrder: [
    { state: "partially_received", reason: "Schema-comment state set by the material receipt flow outside purchase-order.ts." },
  ],
  purchaseRequisition: [
    { state: "cancelled", reason: "Belongs to PurchaseOrder status checks in POI aggregations inside requisition.ts." },
  ],
  dailyReport: [
    { state: "checked", reason: "Legacy status still present in stored data — mapped into list filters for back-compat." },
    { state: "rejected", reason: "Legacy status still present in stored data — mapped into list filters for back-compat." },
  ],
};

/**
 * Behaviors that exist in routers today but are deliberately NOT sanctioned
 * by the graph. Phase B/C migration must close each entry (guard the router
 * or formally add the edge). Tracked here so drift is visible, not silent.
 */
const KNOWN_DRIFT: Array<{ model: LifecycleModel; behavior: string }> = [
  {
    model: "purchaseRequisition",
    behavior:
      "updateStatus() accepts approved/rejected from ANY non-ordered state (including draft and partially_ordered) — the graph only sanctions pending_approval/submitted → approved/rejected.",
  },
  {
    model: "variationOrder",
    behavior:
      "updateStatus() allows draft→draft and submitted→submitted no-op writes (guard only blocks re-approval of approved VOs).",
  },
  {
    model: "purchaseOrder",
    behavior:
      "updateStatus() allows issued→draft rollback and draft→received direct receipt; both are kept in the graph but marked for review during PO migration.",
  },
];

describe("Lifecycle Graph — integrity", () => {
  const models = Object.keys(LIFECYCLE_GRAPHS) as LifecycleModel[];

  it("covers exactly the supported lifecycle models with real Prisma delegates", () => {
    expect(models.sort()).toEqual(
      [
        "dailyReport",
        "leaveRequest",
        "purchaseOrder",
        "purchaseRequisition",
        "siteExpense",
        "subcontractorBill",
        "variationOrder",
      ].sort()
    );
    for (const model of models) {
      expect(
        VALID_PRISMA_DELEGATES.has(LIFECYCLE_GRAPHS[model].prismaModel),
        `${model}.prismaModel must be a real Prisma delegate name`
      ).toBe(true);
    }
  });

  it.each(models)("%s: has no self-edges and all guards are well-formed", (model) => {
    const graph = LIFECYCLE_GRAPHS[model];
    for (const [from, tos] of Object.entries(graph.transitions)) {
      for (const [to, guard] of Object.entries(tos)) {
        expect(to, `self-edge ${from}→${from} in ${model} is forbidden`).not.toBe(from);
        expect(guard.roles.length, `edge ${from}→${to} must declare roles`).toBeGreaterThan(0);
        for (const role of guard.roles) {
          expect(VALID_ROLES.has(role), `edge ${from}→${to} has invalid role ${role}`).toBe(true);
        }
        if (guard.journalEntry) {
          // Money-moving transitions must be visible in their note for audit review.
          expect(guard.note || guard.delegation, `edge ${from}→${to} posts a JE — document it`).toBeTruthy();
        }
      }
    }
  });

  it.each(models)("%s: every non-terminal state has an outgoing edge (no dead ends)", (model) => {
    const graph = LIFECYCLE_GRAPHS[model];
    const states = lifecycleStates(model);
    for (const state of states) {
      if (isTerminalState(model, state)) {
        expect(Object.keys(graph.transitions[state] ?? {}).length, `terminal state ${state} must have no outgoing edges`).toBe(0);
      } else {
        expect(
          Object.keys(graph.transitions[state] ?? {}).length,
          `non-terminal state '${state}' in ${model} is a dead end`
        ).toBeGreaterThan(0);
      }
    }
  });

  it.each(models)("%s: every state is reachable from the initial state", (model) => {
    const graph = LIFECYCLE_GRAPHS[model];
    const reachable = new Set<string>([graph.initialState]);
    let changed = true;
    while (changed) {
      changed = false;
      for (const [from, tos] of Object.entries(graph.transitions)) {
        if (reachable.has(from)) {
          for (const to of Object.keys(tos)) {
            if (!reachable.has(to)) {
              reachable.add(to);
              changed = true;
            }
          }
        }
      }
    }
    for (const state of lifecycleStates(model)) {
      expect(reachable.has(state), `state '${state}' in ${model} is unreachable from '${graph.initialState}'`).toBe(true);
    }
  });

  it.each(models)("%s: sourceStatesFor() derives exactly the from-states with an edge to the target", (model) => {
    const graph = LIFECYCLE_GRAPHS[model];
    const allTos = new Set<string>();
    for (const tos of Object.values(graph.transitions)) {
      for (const to of Object.keys(tos)) allTos.add(to);
    }
    for (const to of allTos) {
      const sources = sourceStatesFor(model, to);
      for (const [from, tos] of Object.entries(graph.transitions)) {
        expect(sources.includes(from)).toBe(to in tos);
      }
    }
  });

  it("money-moving edges are correctly flagged (journalEntry + fiscalLock)", () => {
    // Approving a site expense posts a JE and is delegation-limited.
    const guard = LIFECYCLE_GRAPHS.siteExpense.transitions.pending.approved;
    expect(guard.journalEntry).toBe(true);
    expect(guard.fiscalLock).toBe(true);
    expect(guard.delegation).toBe("approve_site_expense");
    // Paying a subcontractor bill posts a JE.
    expect(LIFECYCLE_GRAPHS.subcontractorBill.transitions.certified.paid.journalEntry).toBe(true);
    // A pure status flip must NOT be flagged as money movement.
    expect(LIFECYCLE_GRAPHS.leaveRequest.transitions.pending.approved.journalEntry).toBeUndefined();
  });

  it("canTransition() respects system-only and role gates", () => {
    // Ordered is set by PO generation (system), never user-clickable.
    expect(canTransition("purchaseRequisition", "approved", "ordered", "project_manager")).toBe(false);
    expect(canTransition("purchaseRequisition", "approved", "ordered", null)).toBe(false);
    // PM can certify a submitted sub-bill; an engineer cannot.
    expect(canTransition("subcontractorBill", "submitted", "certified", "project_manager")).toBe(true);
    expect(canTransition("subcontractorBill", "submitted", "certified", "engineer")).toBe(false);
    // Read-only roles can never transition.
    expect(canTransition("leaveRequest", "pending", "approved", "client")).toBe(false);
    expect(canTransition("leaveRequest", "pending", "approved", "inspector")).toBe(false);
    // Unknown edges are always false.
    expect(canTransition("dailyReport", "draft", "archived", "project_manager")).toBe(false);
  });
});

describe("Lifecycle Graph — router alignment (drift detector)", () => {
  const models = Object.keys(LIFECYCLE_GRAPHS) as LifecycleModel[];

  it.each(models)("%s: every status literal in %s is a known state (or documented backlog)", (model) => {
    const graph = LIFECYCLE_GRAPHS[model];
    const source = readFileSync(join(ROUTERS_DIR, graph.ownerRouter), "utf8");

    const STATE_WORD = [
      "draft", "pending", "pending_approval", "submitted", "approved", "rejected",
      "issued", "partially_received", "received", "cancelled",
      "ordered", "partially_ordered",
      "checked", "verified", "certified", "paid", "partially_paid", "settled",
      "disputed", "overdue", "active", "completed", "archived",
    ].join("|");
    const re = new RegExp(`["'](${STATE_WORD})["']`, "g");
    const literals = new Set<string>();
    for (const m of source.matchAll(re)) literals.add(m[1]);

    const known = new Set(lifecycleStates(model));
    const backlog = (BACKLOG_STATES[model] ?? []).map((b) => b.state);
    const unknown = [...literals].filter((s) => !known.has(s) && !backlog.includes(s));

    expect(
      unknown,
      `${graph.ownerRouter} references statuses the ${model} graph doesn't know about. ` +
        `Add the state/edge to lifecycle-graph.ts (if real) or extend BACKLOG_STATES (if legacy).`
    ).toEqual([]);
  });

  it("known drift is documented, bounded, and non-empty entries map to real models", () => {
    for (const entry of KNOWN_DRIFT) {
      expect(LIFECYCLE_GRAPHS[entry.model]).toBeDefined();
      expect(entry.behavior.length).toBeGreaterThan(20);
    }
    // Bounded: the list may only shrink or stay equal once migrations close
    // entries — it must never silently grow. (Phase B/C: replace this with
    // an exact-count assertion per closed domain.)
    expect(KNOWN_DRIFT.length).toBeLessThanOrEqual(3);
  });
});
