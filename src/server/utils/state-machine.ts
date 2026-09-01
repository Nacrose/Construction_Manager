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
  | "punchItem";

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
  subcontractorBill: {
    draft: ["submitted"],
    submitted: ["certified", "rejected"],
    certified: ["paid", "rejected"],
    paid: [],
    rejected: [],
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

  dailyReport: {
    draft: ["submitted"],
    submitted: ["approved", "rejected"],
    approved: [],
    rejected: [],
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
};

/**
 * Execute an atomic state transition with validation, user attribution, and event dispatch.
 */
export async function transitionEntityState(
  db: DbClientOrTx,
  input: TransitionEntityStateInput
): Promise<TransitionEntityStateResult> {
  const delegateKey =
    (db as any)[input.model] && typeof (db as any)[input.model].findUnique === "function"
      ? input.model
      : MODEL_DELEGATES[input.model] || input.model;

  const modelDelegate = (db as any)[delegateKey];
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
    status: targetStatus,
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
    emitDomainEvent({
      type: "lifecycle.transitioned",
      projectId: input.projectId,
      actorUserId: input.userId,
      entityType: input.model,
      entityId: input.id,
      title: `${input.model.toUpperCase()} marked as ${targetStatus.toUpperCase()}`,
      message: input.notes || `State transitioned from ${currentStatus} to ${targetStatus}.`,
      metadata: {
        entityId: input.id,
        model: input.model,
        previousState: currentStatus,
        newState: targetStatus,
      },
    });
  }

  return {
    entity: updatedEntity,
    previousState: currentStatus,
    currentState: targetStatus,
    transitionedAt: now,
  };
}
