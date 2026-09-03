/**
 * Typed action registry (ADR-0006 §3) — "transitions are actions, not raw
 * target states."
 *
 * Callers say `approve the payroll run`, not `set status = approved`. Two
 * actions may share a target state but differ in authority and side
 * effects — the action id, not the state string, is the API.
 *
 * The registry is statically validated against the declarative graphs
 * (state-machine.ts): every action's model must be a supported lifecycle
 * model and every from→to edge must exist in the graph, so the typed
 * layer can never drift from the single source of lifecycle truth.
 * ADR-0006: "type the money-touching lifecycles first" — this set covers
 * the money-touching conversions (payroll, site expense, leave); the long
 * tail converts opportunistically through the deprecated raw-state bridge.
 */
import {
  LIFECYCLE_GRAPHS,
  type SupportedLifecycleModel,
} from "@/server/utils/state-machine";

export type EngineActionDef = {
  /** Lifecycle model the action operates on. */
  model: SupportedLifecycleModel;
  /** Human label used in errors and audit metadata. */
  label: string;
  /** Source states the action is legal from (all must be graph nodes). */
  from: readonly string[];
  /** The single target state (must be a graph successor of every `from`). */
  to: string;
  /** What the action is allowed to touch — documentation + test hooks. */
  sideEffects?: readonly string[];
};

export const ENGINE_ACTIONS = {
  // ── Payroll runs (ADR-0007): approve is the liability boundary —
  // advance recovery + liability JE ride the transition's transaction.
  // disburse is the settlement primitive. reopen reverses exactly.
  "payrollRun.approve": {
    model: "payrollRun",
    label: "Approve payroll run",
    from: ["draft"],
    to: "approved",
    sideEffects: ["advance_recovery_cas", "payroll_liability_je"],
  },
  "payrollRun.disburse": {
    model: "payrollRun",
    label: "Disburse payroll run",
    from: ["approved"],
    to: "disbursed",
    sideEffects: ["settlement_je", "bank_decrement", "payslip_amounts"],
  },
  "payrollRun.reopen": {
    model: "payrollRun",
    label: "Reopen payroll run",
    from: ["approved"],
    to: "draft",
    sideEffects: ["je_reversal", "advance_unrecovery"],
  },

  // ── Site expenses (ADR-0006 consequence: convert the cleanest first;
  // approval posts the expense JE inside the transition transaction).
  "siteExpense.approve": {
    model: "siteExpense",
    label: "Approve site expense",
    from: ["pending"],
    to: "approved",
    sideEffects: ["expense_je"],
  },
  "siteExpense.reject": {
    model: "siteExpense",
    label: "Reject site expense",
    from: ["pending"],
    to: "rejected",
  },

  // ── Leave (person-grain approvals; balance decrement follows approval).
  "leave.approve": {
    model: "leave",
    label: "Approve leave request",
    from: ["pending"],
    to: "approved",
    sideEffects: ["leave_balance_decrement"],
  },
  "leave.reject": {
    model: "leave",
    label: "Reject leave request",
    from: ["pending"],
    to: "rejected",
  },

  // ── Requisitions (money-touching procurement chain).
  "purchaseRequisition.approve": {
    model: "purchaseRequisition",
    label: "Approve purchase requisition",
    from: ["submitted", "pending_approval"],
    to: "approved",
  },
  "purchaseRequisition.reject": {
    model: "purchaseRequisition",
    label: "Reject purchase requisition",
    from: ["submitted", "pending_approval"],
    to: "rejected",
  },

  // ── Purchase orders (committed spend).
  "purchaseOrder.issue": {
    model: "purchaseOrder",
    label: "Issue purchase order",
    from: ["draft", "pending_approval"],
    to: "issued",
  },
  "purchaseOrder.cancel": {
    model: "purchaseOrder",
    label: "Cancel purchase order",
    from: ["draft", "pending_approval", "issued", "partially_received"],
    to: "cancelled",
  },
} as const satisfies Record<string, EngineActionDef>;

export type EngineActionId = keyof typeof ENGINE_ACTIONS;

export const ENGINE_ACTION_IDS = Object.keys(ENGINE_ACTIONS) as EngineActionId[];

export function isEngineActionId(value: string): value is EngineActionId {
  return Object.prototype.hasOwnProperty.call(ENGINE_ACTIONS, value);
}
