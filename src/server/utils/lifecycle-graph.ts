/**
 * LIFECYCLE GRAPH — the single source of truth for entity status transitions.
 *
 * Engine Protocol artifact (Phase A). Every graph edge below was EXTRACTED
 * from the actual router guard code (not designed on a whiteboard):
 *
 *   - leave.ts            (approve/reject: pending → approved/rejected, admin-gated)
 *   - site-expense.ts     (approve/reject: pending → approved/rejected + delegation + JE)
 *   - subcontractor-bill.ts (submit: draft→submitted; certify: submitted→certified;
 *                            markPaid: certified→paid with full-payment guard)
 *   - purchase-order.ts   (updateStatus: generic, issued/received PM-gated, closed = terminal)
 *   - requisition.ts      (updateStatus/approvePr/rejectPr + PO-generation → ordered)
 *   - variation-order.ts  (updateStatus: approved = locked terminal)
 *   - daily-report.ts     (inline allowed-table: draft→submitted→approved→archived + rollbacks)
 *
 * GOING FORWARD: this graph is the ONLY place a status transition is defined.
 * Routers migrate onto it via `transitionEntityState` (Phase B+) and the UI
 * renders transition buttons from `canTransition()` / the `lifecycle` tRPC
 * router — so adding an edge here makes the feature appear everywhere at once.
 *
 * RULES:
 *  - Pure module: NO db import, NO runtime server deps. Safe to import from
 *    client bundles (via the `lifecycle.graph` tRPC query) and from tests.
 *  - prismaModel MUST equal the real Prisma delegate name (e.g. "leaveRequest",
 *    NOT "leave" — the pre-graph state machine had "leave" which could never
 *    resolve against `db.leave`; latent dead-engine bug now fixed).
 *  - Every non-terminal state must have ≥1 outgoing edge; terminal states none.
 */

/** Canonical project-member roles (mirrors src/lib/authz.ts ProjectRole). */
export type GraphRole =
  | "project_manager"
  | "engineer"
  | "coordinator"
  | "client"
  | "inspector";

/** Roles that pass assertCanWrite (everything except read-only spectators). */
export const WRITE_ROLES: GraphRole[] = [
  "project_manager",
  "engineer",
  "coordinator",
];

/** Roles that pass assertProjectAdmin. */
export const ADMIN_ROLES: GraphRole[] = ["project_manager", "coordinator"];

/**
 * Delegation actions referenced by guards (string here to keep this module
 * dependency-free; typed against DelegationAction at the call site).
 */
export type TransitionGuard = {
  /** Project roles allowed to execute this transition. */
  roles: GraphRole[];
  /** Transition touches a locked fiscal year's ledger — assertNotLocked required. */
  fiscalLock?: boolean;
  /** Transition moves money — a balanced JournalEntry MUST be posted in the same tx. */
  journalEntry?: boolean;
  /** Delegation-engine action to assert (amount limits per operating model). */
  delegation?: string;
  /** Executed internally by the system (e.g. PO generation), not user-clickable. */
  system?: boolean;
  /** Terminal target: once reached, no further transitions exist. */
  terminal?: boolean;
  /** Human explanation shown by the UI next to the transition button. */
  note?: string;
};

export type LifecycleGraph = {
  /** Real Prisma delegate name — what `(db as any)[prismaModel]` must resolve to. */
  prismaModel: string;
  /** Router file that currently owns these transitions (for the alignment scan). */
  ownerRouter: string;
  /** Status value assigned on create (schema default). */
  initialState: string;
  /** States with no outgoing edges. */
  terminalStates: string[];
  /** Human description of the entity's lifecycle. */
  description: string;
  /** from → to → guard. No self-edges. */
  transitions: Record<string, Record<string, TransitionGuard>>;
};

export type LifecycleModel =
  | "leaveRequest"
  | "siteExpense"
  | "subcontractorBill"
  | "purchaseOrder"
  | "purchaseRequisition"
  | "variationOrder"
  | "dailyReport";

export const LIFECYCLE_GRAPHS: Record<LifecycleModel, LifecycleGraph> = {
  leaveRequest: {
    prismaModel: "leaveRequest",
    ownerRouter: "leave.ts",
    initialState: "pending",
    terminalStates: ["approved", "rejected"],
    description: "Staff leave request approval.",
    transitions: {
      pending: {
        approved: {
          roles: ADMIN_ROLES,
          note: "Approves the leave and updates the staff leave balance.",
        },
        rejected: {
          roles: ADMIN_ROLES,
          note: "Rejects the leave request.",
        },
      },
      approved: {},
      rejected: {},
    },
  },

  siteExpense: {
    prismaModel: "siteExpense",
    ownerRouter: "site-expense.ts",
    initialState: "pending",
    terminalStates: ["approved", "rejected"],
    description:
      "Site petty-cash/overhead expense. Approval posts a journal entry and is delegation-limited.",
    transitions: {
      pending: {
        approved: {
          roles: ADMIN_ROLES,
          fiscalLock: true,
          journalEntry: true,
          delegation: "approve_site_expense",
          note: "Posts Dr Site Overhead / Cr Bank-Cash journal entry in the same transaction.",
        },
        rejected: {
          roles: ADMIN_ROLES,
        },
      },
      approved: {},
      rejected: {},
    },
  },

  subcontractorBill: {
    prismaModel: "subcontractorBill",
    ownerRouter: "subcontractor-bill.ts",
    initialState: "draft",
    // NOTE: schema also declares "verified" and "disputed" but no router
    // currently transitions INTO them — see BACKLOG_STATES in the alignment test.
    terminalStates: ["paid"],
    description:
      "Theka/subcontractor bill: submit → certify (PM) → pay (full payment flips to paid; partial stays certified).",
    transitions: {
      draft: {
        submitted: {
          roles: WRITE_ROLES,
          note: "Locks the bill figures and sends to PM for certification.",
        },
      },
      submitted: {
        certified: {
          roles: ADMIN_ROLES,
          note: "PM/coordinator certifies the bill for payment.",
        },
      },
      certified: {
        paid: {
          roles: WRITE_ROLES,
          fiscalLock: true,
          journalEntry: true,
          note: "Only flips to paid when the FULL net payable is settled; partial payments stay certified.",
        },
      },
      paid: {},
    },
  },

  purchaseOrder: {
    prismaModel: "purchaseOrder",
    ownerRouter: "purchase-order.ts",
    initialState: "draft",
    // NOTE: schema comment mentions "partially_received" (set by the material
    // receipt flow outside this router) — see BACKLOG_STATES in the alignment test.
    terminalStates: ["received", "cancelled"],
    description:
      "PO lifecycle. updateStatus is generic: any non-closed state may move to any status; issued/received are PM-gated; receipt posts stock.",
    transitions: {
      draft: {
        issued: { roles: ADMIN_ROLES },
        received: { roles: ADMIN_ROLES, note: "Direct receipt — posts received quantities into stock." },
        cancelled: { roles: WRITE_ROLES },
      },
      issued: {
        received: { roles: ADMIN_ROLES, note: "Receipt flow — posts received quantities into stock." },
        cancelled: { roles: WRITE_ROLES },
      },
      received: {},
      cancelled: {},
    },
  },

  purchaseRequisition: {
    prismaModel: "purchaseRequisition",
    ownerRouter: "requisition.ts",
    initialState: "draft",
    // Code truth: updateStatus blocks only "ordered" (terminal); approvePr/
    // rejectPr accept pending_approval OR submitted (legacy state still guarded).
    terminalStates: ["ordered", "rejected"],
    description:
      "Site purchase requisition: submit → approve/reject (PM) → ordered/partially_ordered when POs are generated (status recomputed per PO coverage).",
    transitions: {
      draft: {
        pending_approval: { roles: WRITE_ROLES, note: "Submits the requisition for PM approval." },
        submitted: { roles: WRITE_ROLES, note: "Legacy submit state — still accepted by approve/reject guards." },
      },
      pending_approval: {
        approved: { roles: ADMIN_ROLES },
        rejected: { roles: ADMIN_ROLES, note: "Rejection reason is required." },
      },
      submitted: {
        approved: { roles: ADMIN_ROLES },
        rejected: { roles: ADMIN_ROLES, note: "Rejection reason is required." },
      },
      approved: {
        ordered: { roles: WRITE_ROLES, system: true, note: "Set automatically once every line has a PO." },
        partially_ordered: {
          roles: WRITE_ROLES,
          system: true,
          note: "Some lines have POs — recomputed on each PO generation.",
        },
      },
      partially_ordered: {
        ordered: { roles: WRITE_ROLES, system: true, note: "Remaining lines fully covered by POs." },
      },
      rejected: {},
      ordered: {},
    },
  },

  variationOrder: {
    prismaModel: "variationOrder",
    ownerRouter: "variation-order.ts",
    initialState: "draft",
    terminalStates: ["approved"],
    description:
      "Contract variation. updateStatus accepts draft/submitted/approved/rejected; approval locks the VO and creates a BOQ version.",
    transitions: {
      draft: {
        submitted: { roles: WRITE_ROLES },
        approved: {
          roles: WRITE_ROLES,
          fiscalLock: true,
          journalEntry: true,
          note: "Creates the approved BOQ version and posts the JV entry.",
        },
        rejected: { roles: WRITE_ROLES },
      },
      submitted: {
        approved: {
          roles: WRITE_ROLES,
          fiscalLock: true,
          journalEntry: true,
          note: "Creates the approved BOQ version and posts the JV entry.",
        },
        rejected: { roles: WRITE_ROLES },
        draft: { roles: WRITE_ROLES, note: "Back to draft for revision." },
      },
      rejected: {
        submitted: { roles: WRITE_ROLES, note: "Revise and resubmit." },
        draft: { roles: WRITE_ROLES },
      },
      approved: {},
    },
  },

  dailyReport: {
    prismaModel: "dailyReport",
    ownerRouter: "daily-report.ts",
    initialState: "draft",
    terminalStates: ["archived"],
    description:
      "Site daily report. Draft → submitted → approved → archived, with PM-gated rollbacks. Approval deducts materials from stock (guarded against double-deduction).",
    transitions: {
      draft: {
        submitted: { roles: ADMIN_ROLES, fiscalLock: true, note: "Triggers stock-issue transactions." },
      },
      submitted: {
        draft: { roles: ADMIN_ROLES, note: "Rollback for edits." },
        approved: { roles: ADMIN_ROLES, fiscalLock: true, note: "Deducts consumed materials from stock." },
      },
      approved: {
        submitted: { roles: ADMIN_ROLES, note: "Rollback — re-submission re-guards deductions." },
        archived: { roles: ADMIN_ROLES },
      },
      archived: {},
    },
  },
};

// ── Query API (pure, UI-consumable) ────────────────────────────────

/** All distinct state names in a model's graph (including initial + terminals). */
export function lifecycleStates(model: LifecycleModel): string[] {
  const graph = LIFECYCLE_GRAPHS[model];
  const states = new Set<string>([graph.initialState, ...graph.terminalStates]);
  for (const [from, tos] of Object.entries(graph.transitions)) {
    states.add(from);
    for (const to of Object.keys(tos)) states.add(to);
  }
  return [...states];
}

/**
 * Can an actor with `role` move an entity of `model` from `from` to `to`?
 * System-only transitions (system: true) are not executable by any user role.
 */
export function canTransition(
  model: LifecycleModel,
  from: string,
  to: string,
  role: GraphRole | null
): boolean {
  const guard = LIFECYCLE_GRAPHS[model]?.transitions[from]?.[to];
  if (!guard) return false;
  if (guard.system) return false;
  return !!role && guard.roles.includes(role);
}

/** Transitions available to `role` from `from`, as { to, guard } pairs. */
export function availableTransitions(
  model: LifecycleModel,
  from: string,
  role: GraphRole | null
): Array<{ to: string; guard: TransitionGuard }> {
  const tos = LIFECYCLE_GRAPHS[model]?.transitions[from] ?? {};
  return Object.entries(tos)
    .filter(([, guard]) => !guard.system && !!role && guard.roles.includes(role))
    .map(([to, guard]) => ({ to, guard }));
}

/**
 * Derive the valid "from" states for moving an entity INTO `to` —
 * lets `transitionEntityState` validate without per-call-site state lists.
 */
export function sourceStatesFor(model: LifecycleModel, to: string): string[] {
  const transitions = LIFECYCLE_GRAPHS[model]?.transitions ?? {};
  return Object.entries(transitions)
    .filter(([, tos]) => to in tos)
    .map(([from]) => from);
}

export function isTerminalState(model: LifecycleModel, state: string): boolean {
  return LIFECYCLE_GRAPHS[model]?.terminalStates.includes(state) ?? false;
}
