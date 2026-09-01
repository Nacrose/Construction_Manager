/**
 * Central Multi-Entity State Machine & Approval Transition Engine
 *
 * Provides safe, audited status transitions across construction domain entities:
 * - Subcontractor Bills, Vendor Invoices, Site Expenses
 * - Purchase Orders, Requisitions, Variation Orders
 * - Leaves, RFIs, Daily Reports, Drawing Approvals, Submittals, Punch Items
 */
import { TRPCError } from "@trpc/server";
import type { DbTxClient } from "@/lib/db";
import { emitDomainEvent } from "./domain-events";

export type SupportedLifecycleModel =
  | "siteExpense"
  | "subcontractorBill"
  | "purchaseOrder"
  | "purchaseRequisition"
  | "variationOrder"
  | "leave"
  | "dailyReport"
  | "submittal"
  | "punchItem"
  | "boqVersion"
  | "payrollRun"
  | "dailyProgram"
  | "ipc"
  | "rfi"
  | "ganttVersion"
  | "bankGuarantee"
  | "equipment"
  | "equipmentMaintenance"
  | "equipmentRental"
  | "uncatalogedMaterial"
  | "gateEntry"
  | "interSiteTransfer"
  | "project"
  | "vendorBill";

/**
 * Declarative state transition graphs for all lifecycle models in Construction Manager.
 * Maps: Model -> Current Status -> Allowed Next Statuses
 */
export const LIFECYCLE_GRAPHS: Record<SupportedLifecycleModel, Record<string, string[]>> = {
  leave: {
    pending: ["approved", "rejected"],
    approved: [],
    rejected: [],
  },
  submittal: {
    draft: ["submitted"],
    revise_resubmit: ["submitted"],
    submitted: ["approved", "rejected", "revise_resubmit"],
    approved: [],
    rejected: [],
  },
  punchItem: {
    open: ["in_progress"],
    in_progress: ["resolved"],
    resolved: ["verified"],
    verified: ["closed"],
    closed: [],
  },
  siteExpense: {
    draft: ["pending"],
    pending: ["approved", "rejected"],
    approved: [],
    rejected: [],
  },
  // Graph reconciled with the SubcontractorBill schema (draft | submitted |
  // verified | certified | paid | disputed): verifyBill transitions
  // submitted -> verified/disputed, certify follows verification, and
  // disputed bills can be resubmitted. `rejected` remains as a legacy
  // terminal node — the column is a String and old rows may still carry it.
  subcontractorBill: {
    draft: ["submitted"],
    submitted: ["verified", "certified", "rejected", "disputed"],
    verified: ["certified", "disputed"],
    certified: ["paid", "rejected", "disputed"],
    paid: [],
    rejected: [],
    disputed: ["submitted"],
  },

  boqVersion: {
    draft: ["approved"],
    approved: [],
  },

  // Payroll runs may reopen (approved|disbursed -> draft) to fix errors
  // before re-approval — matches updateRunStatus's "reopen" action.
  payrollRun: {
    draft: ["approved"],
    approved: ["disbursed", "draft"],
    disbursed: ["draft"],
  },

  dailyProgram: {
    draft: ["approved"],
    approved: [],
  },

  purchaseOrder: {
    draft: ["issued", "pending_approval", "received", "cancelled"],
    pending_approval: ["issued", "rejected", "cancelled"],
    issued: ["partially_received", "received", "cancelled"],
    partially_received: ["received", "cancelled"],
    received: [],
    cancelled: [],
  },

  purchaseRequisition: {
    draft: ["submitted", "pending_approval"],
    submitted: ["approved", "rejected"],
    pending_approval: ["approved", "rejected"],
    approved: ["partially_ordered", "ordered"],
    partially_ordered: ["ordered"],
    ordered: [],
    rejected: [],
  },

  variationOrder: {
    draft: ["submitted", "approved"],
    submitted: ["approved", "rejected"],
    approved: [],
    rejected: [],
  },

  // Graph reconciled with the daily-report router (updateReport): reports
  // can be reverted to draft, approved reports can be archived or reopened
  // for re-approval. `rejected` remains a legacy terminal node — the column
  // is a String and old rows may still carry it.
  dailyReport: {
    draft: ["submitted"],
    submitted: ["draft", "approved"],
    approved: ["archived", "submitted"],
    archived: [],
    rejected: [],
  },

  // Interim Payment Certificates: draft → submitted → certified (revenue
  // JE fires here) → approved → paid, with revision back-edges
  // (submitted → draft, certified → submitted, approved → certified).
  ipc: {
    draft: ["submitted"],
    submitted: ["certified", "draft"],
    certified: ["approved", "submitted"],
    approved: ["paid", "certified"],
    paid: [],
  },

  // RFIs: request-for-inspection review flow. The generic update route and
  // the admin-only respond route share this graph.
  rfi: {
    draft: ["submitted"],
    submitted: ["approved", "rejected", "closed"],
    approved: ["closed"],
    rejected: ["closed"],
    closed: [],
  },

  // Gantt schedule versions (uppercase VersionStatus enum — the engine
  // lowercases for graph lookup and writes back exactly the caller's
  // casing). One active version per project is enforced at the router.
  ganttVersion: {
    draft: ["approved"],
    approved: ["archived"],
    archived: [],
  },

  // Bank guarantees: extend is a self-loop (a guarantee can be extended
  // repeatedly), release/claim are terminal. `expired` is written by the
  // list endpoint's date-derived sweep, not by user transitions.
  bankGuarantee: {
    active: ["extended", "released", "claimed"],
    extended: ["extended", "released", "claimed"],
    released: [],
    claimed: [],
    expired: [],
  },

  // Equipment operating state — idempotent set-to-active flows (rental
  // return, transfer arrival, maintenance resolve) are guarded at the
  // call site (skip the write when already active) so the graph stays
  // strict (no self-loops) and CAS double-claims stay meaningful.
  equipment: {
    active: ["maintenance", "breakdown", "idle"],
    maintenance: ["active", "breakdown", "idle"],
    breakdown: ["active", "maintenance", "idle"],
    idle: ["active", "maintenance", "breakdown"],
  },

  // Maintenance work orders: pending -> resolved (cost/notes ride
  // additionalData; resolvedDate/By are engine-populated).
  equipmentMaintenance: {
    pending: ["resolved"],
    resolved: [],
  },

  // Rentals: active -> stored_on_site (rent accrual stops) -> returned;
  // a stored rental can be reactivated back to active. `returned` is
  // terminal — settled money figures must not be overwritten.
  equipmentRental: {
    active: ["stored_on_site", "returned"],
    stored_on_site: ["active", "returned"],
    returned: [],
  },

  // Uncataloged material review queue: pending -> mapped | promoted |
  // ignored, all terminal (re-mapping happens on the target material's
  // alias list, not by flipping this record back).
  uncatalogedMaterial: {
    pending: ["mapped", "promoted", "ignored"],
    mapped: [],
    promoted: [],
    ignored: [],
  },

  // Gate entries (site security log): pending -> received | rejected.
  gateEntry: {
    pending: ["received", "rejected"],
    received: [],
    rejected: [],
  },

  // Inter-site transfers: dispatched -> in_transit -> received, with
  // cancellation allowed while in motion. Instant transfers are created
  // directly as `received` (creation, not a transition). received/cancelled
  // are terminal — a double-receive must fail loudly.
  interSiteTransfer: {
    dispatched: ["in_transit", "received", "cancelled"],
    in_transit: ["received", "cancelled"],
    received: [],
    cancelled: [],
  },

  // Project lifecycle: active <-> on_hold, completion, and archive
  // (archived is terminal; un-archive requires a data fix by design).
  project: {
    active: ["on_hold", "completed", "archived"],
    on_hold: ["active", "completed", "archived"],
    completed: ["archived"],
    archived: [],
  },

  // Vendor bills: payment progress is DERIVED from paidAmount (the
  // recordPayment path intentionally uses an atomic increment on
  // paidAmount as its concurrency token — the engine's status CAS would
  // reject legitimate concurrent partial payments). The graph is
  // declarative documentation + getAllowedTransitions source; the write
  // intentionally stays on the raw atomic-increment path.
  vendorBill: {
    unpaid: ["partially_paid", "paid", "disputed"],
    partially_paid: ["partially_paid", "paid", "disputed"],
    paid: [],
    disputed: [],
  },
};

/**
 * Check whether an entity transition is valid according to the declarative state graph.
 */
export function canTransition(
  model: SupportedLifecycleModel,
  currentState: string,
  targetState: string
): { allowed: boolean; reason?: string } {
  const graph = LIFECYCLE_GRAPHS[model];
  if (!graph) {
    return { allowed: false, reason: `Unknown lifecycle model '${model}'.` };
  }

  const normalizedCurrent = String(currentState || "draft").toLowerCase();
  const normalizedTarget = String(targetState || "").toLowerCase();

  const allowedTargets = graph[normalizedCurrent] || [];
  if (!allowedTargets.includes(normalizedTarget)) {
    return {
      allowed: false,
      reason: `Invalid state transition for ${model}: cannot transition from '${normalizedCurrent}' to '${normalizedTarget}'. Allowed next states: [${allowedTargets.join(", ") || "none"}].`,
    };
  }

  return { allowed: true };
}

/**
 * Get all permitted target states from the current state.
 */
export function getAllowedTransitions(
  model: SupportedLifecycleModel,
  currentState: string
): string[] {
  const graph = LIFECYCLE_GRAPHS[model];
  if (!graph) return [];
  return graph[String(currentState || "draft").toLowerCase()] || [];
}

export type TransitionEntityStateInput = {
  model: SupportedLifecycleModel;
  id: string;
  projectId?: string;
  allowedCurrentStates?: string[];
  targetState: string;
  userId: string;
  userName?: string;
  notes?: string | null;
  additionalData?: Record<string, any>;
  skipEventEmit?: boolean;
};

export type TransitionEntityStateResult<T = any> = {
  entity: T;
  previousState: string;
  currentState: string;
  transitionedAt: Date;
};

/**
 * Build the `lifecycle.transitioned` domain event for a transition.
 *
 * Exported separately from `transitionEntityState` so callers that run the
 * transition inside a transaction (with `skipEventEmit: true`) can emit the
 * identical event AFTER the transaction commits — a hook or journal-entry
 * failure must never broadcast an event for a transition that never happened.
 */
export function buildTransitionEvent(args: {
  model: SupportedLifecycleModel;
  entityId: string;
  projectId?: string;
  actorUserId: string;
  previousState: string;
  currentState: string;
  notes?: string | null;
}) {
  return {
    type: "lifecycle.transitioned" as const,
    projectId: args.projectId,
    actorUserId: args.actorUserId,
    entityType: args.model,
    entityId: args.entityId,
    title: `${args.model.toUpperCase()} marked as ${args.currentState.toUpperCase()}`,
    message:
      args.notes ||
      `State transitioned from ${args.previousState} to ${args.currentState}.`,
    metadata: {
      entityId: args.entityId,
      model: args.model,
      previousState: args.previousState,
      newState: args.currentState,
    },
  };
}

type DbClientOrTx = DbTxClient;

const MODEL_DELEGATES: Record<SupportedLifecycleModel, string> = {
  leave: "leaveRequest",
  punchItem: "punchItem",
  siteExpense: "siteExpense",
  subcontractorBill: "subcontractorBill",
  purchaseOrder: "purchaseOrder",
  purchaseRequisition: "purchaseRequisition",
  variationOrder: "variationOrder",
  dailyReport: "dailyReport",
  submittal: "submittal",
  boqVersion: "boqVersion",
  payrollRun: "payrollRun",
  dailyProgram: "dailyProgram",
  ipc: "ipc",
  rfi: "rfi",
  ganttVersion: "ganttVersion",
  bankGuarantee: "bankGuarantee",
  equipment: "equipment",
  equipmentMaintenance: "equipmentMaintenance",
  equipmentRental: "equipmentRental",
  uncatalogedMaterial: "uncatalogedMaterial",
  gateEntry: "gateEntry",
  interSiteTransfer: "interSiteTransfer",
  project: "project",
  vendorBill: "vendorBill",
};

/**
 * Execute an atomic state transition with validation, user attribution, and event dispatch.
 */
export async function transitionEntityState(
  db: DbClientOrTx,
  input: TransitionEntityStateInput
): Promise<TransitionEntityStateResult> {
  // Resolve the Prisma delegate: the explicit MODEL_DELEGATES map wins
  // (e.g. leave → leaveRequest); fall back to the model name itself. Do NOT
  // probe `db[model]` first — any object that happens to carry a matching
  // property (test proxies, annotated clients) would hijack resolution and
  // silently query an empty delegate.
  const delegateKey = MODEL_DELEGATES[input.model] || input.model;
  const modelDelegate = (db as any)[delegateKey] ?? (db as any)[input.model];
  if (!modelDelegate || typeof modelDelegate.findUnique !== "function") {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: `Invalid lifecycle model '${input.model}' specified in state machine.`,
    });
  }

  // 1. Fetch current entity
  const entity = await modelDelegate.findUnique({
    where: { id: input.id },
  });

  if (!entity) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: `${input.model} record with ID ${input.id} not found.`,
    });
  }

  const currentStatus = String(entity.status || "draft").toLowerCase();
  const targetStatus = input.targetState.toLowerCase();

  // 2. Validate state transition against declarative graph
  const transitionCheck = canTransition(input.model, currentStatus, targetStatus);
  if (!transitionCheck.allowed) {
    if (input.allowedCurrentStates && !input.allowedCurrentStates.map((s) => s.toLowerCase()).includes(currentStatus)) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: `Invalid state transition for ${input.model}. Current status is '${currentStatus}', but expected one of: [${input.allowedCurrentStates.join(", ")}].`,
      });
    }
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: transitionCheck.reason || `Invalid transition for ${input.model} from '${currentStatus}' to '${targetStatus}'.`,
    });
  }

  // Also verify explicit allowedCurrentStates if supplied
  if (input.allowedCurrentStates) {
    const normalizedAllowed = input.allowedCurrentStates.map((s) => s.toLowerCase());
    if (!normalizedAllowed.includes(currentStatus)) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: `Invalid state transition for ${input.model}. Current status is '${currentStatus}', but expected one of: [${input.allowedCurrentStates.join(", ")}].`,
      });
    }
  }

  const now = new Date();

  // Strip reserved / protected fields from additionalData to prevent mass-assignment
  const RESERVED_KEYS = new Set([
    "id",
    "status",
    "projectId",
    "organizationId",
    "approvedById",
    "approvedAt",
    "rejectedAt",
    "submittedById",
    "submittedAt",
    "createdById",
    "createdAt",
  ]);

  const sanitizedAdditionalData: Record<string, any> = {};
  if (input.additionalData && typeof input.additionalData === "object") {
    for (const [k, v] of Object.entries(input.additionalData)) {
      if (!RESERVED_KEYS.has(k)) {
        sanitizedAdditionalData[k] = v;
      }
    }
  }

  const updateData: Record<string, any> = {
    ...sanitizedAdditionalData,
    // Write the target EXACTLY as the caller passed it. Graph lookups above
    // lowercase both sides (so "APPROVED" resolves against the "approved"
    // node), but models with uppercase enums (e.g. GanttVersion's
    // VersionStatus) would reject a lowercase value at the Prisma layer —
    // preserving the caller's casing keeps stored values consistent.
    status: input.targetState,
  };

  // 3. Populate audit timestamps & attribution fields if supported by model
  if (targetStatus === "approved") {
    if ("approvedById" in entity) updateData.approvedById = input.userId;
    if ("approvedAt" in entity) updateData.approvedAt = now;
    if ("reviewedDate" in entity) updateData.reviewedDate = now;
    if ("reviewedBy" in entity) updateData.reviewedBy = input.userName || input.userId;
  } else if (targetStatus === "rejected") {
    if ("rejectionReason" in entity) updateData.rejectionReason = input.notes || null;
    if ("rejectedAt" in entity) updateData.rejectedAt = now;
    if ("reviewedDate" in entity) updateData.reviewedDate = now;
    if ("reviewedBy" in entity) updateData.reviewedBy = input.userName || input.userId;
  } else if (targetStatus === "submitted") {
    if ("submittedById" in entity) updateData.submittedById = input.userId;
    if ("submittedAt" in entity) updateData.submittedAt = now;
    if ("submittedDate" in entity) updateData.submittedDate = now;
  } else if (targetStatus === "resolved") {
    if ("resolvedNotes" in entity) updateData.resolvedNotes = input.notes || entity.resolvedNotes;
    if ("resolvedDate" in entity) updateData.resolvedDate = now;
    if ("resolvedBy" in entity) updateData.resolvedBy = input.userName || input.userId;
  } else if (targetStatus === "verified") {
    if ("resolvedNotes" in entity) updateData.resolvedNotes = entity.resolvedNotes;
    if ("resolvedDate" in entity) updateData.resolvedDate = entity.resolvedDate;
    if ("resolvedBy" in entity) updateData.resolvedBy = entity.resolvedBy;
    if ("verifiedDate" in entity) updateData.verifiedDate = now;
    if ("verifiedBy" in entity) updateData.verifiedBy = input.userName || input.userId;
  } else if (input.model === "punchItem") {
    if ("resolvedDate" in entity) updateData.resolvedDate = entity.resolvedDate ?? null;
    if ("verifiedDate" in entity) updateData.verifiedDate = entity.verifiedDate ?? null;
  }


  // 4. Persist transition — compare-and-swap on the status we just read
  // and validated. `updateMany` matches 0 rows if a concurrent request
  // already transitioned the record between our read and our write, so a
  // double-approval (double journal entry) fails loudly with CONFLICT
  // instead of silently overwriting.
  const claimed = await modelDelegate.updateMany({
    where: { id: input.id, status: entity.status },
    data: updateData,
  });
  if (claimed.count === 0) {
    throw new TRPCError({
      code: "CONFLICT",
      message: `${input.model} record was just modified by someone else — reload and retry.`,
    });
  }
  const updatedEntity = await modelDelegate.findUnique({
    where: { id: input.id },
  });

  // 5. Emit Domain Event
  if (!input.skipEventEmit && input.projectId) {
    emitDomainEvent(
      buildTransitionEvent({
        model: input.model,
        entityId: input.id,
        projectId: input.projectId,
        actorUserId: input.userId,
        previousState: currentStatus,
        currentState: targetStatus,
        notes: input.notes,
      }),
    );
  }

  return {
    entity: updatedEntity,
    previousState: currentStatus,
    currentState: targetStatus,
    transitionedAt: now,
  };
}
