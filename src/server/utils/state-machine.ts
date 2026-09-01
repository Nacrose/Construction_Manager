/**
 * Central Multi-Entity State Machine & Approval Transition Engine
 *
 * Provides safe, audited status transitions across construction domain entities:
 * - Subcontractor Bills, Vendor Invoices, Site Expenses
 * - Purchase Orders, Requisitions, Variation Orders
 * - Leaves, RFIs, Daily Reports, Drawing Approvals
 */
import { TRPCError } from "@trpc/server";
import type { DbTxClient } from "@/lib/db";
import { emitDomainEvent } from "./domain-events";
import { LIFECYCLE_GRAPHS, sourceStatesFor, type LifecycleModel } from "./lifecycle-graph";
import { logger } from "@/lib/logger";

/** Module-scoped structured logger (JSON lines — serverless-queryable). */
const log = logger({ module: "state-machine" });

export type SupportedLifecycleModel = LifecycleModel;

export type TransitionEntityStateInput = {
  model: SupportedLifecycleModel;
  id: string;
  projectId?: string;
  /**
   * Explicit from-states. OPTIONAL when the lifecycle graph covers the
   * (from → targetState) edge — omit it and the graph derives the valid
   * source states via `sourceStatesFor(model, targetState)`.
   */
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

/**
 * Execute an atomic state transition with validation, user attribution, and event dispatch.
 */
export async function transitionEntityState(
  db: DbClientOrTx,
  input: TransitionEntityStateInput
): Promise<TransitionEntityStateResult> {
  const modelDelegate = (db as any)[input.model];
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

  // Resolve allowed from-states: explicit argument wins; otherwise derive
  // from the central lifecycle graph (single source of truth).
  const graphModel = input.model as LifecycleModel;
  const graph = LIFECYCLE_GRAPHS[graphModel];
  const allowedFromStates =
    input.allowedCurrentStates ??
    (graph ? sourceStatesFor(graphModel, input.targetState.toLowerCase()) : []);
  const normalizedAllowed = allowedFromStates.map((s) => s.toLowerCase());

  // 2. Validate state transition
  if (!normalizedAllowed.includes(currentStatus)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Invalid state transition for ${input.model}. Current status is '${currentStatus}', but expected one of: [${allowedFromStates.join(", ")}].`,
    });
  }

  // 2b. Graph alignment (Phase A: observational, non-blocking).
  // The lifecycle graph is the single source of truth; while call sites
  // still pass per-call allowedCurrentStates, we log drift so the graph
  // can be tightened BEFORE hard enforcement (Phase E).
  const graphEdge = LIFECYCLE_GRAPHS[input.model as LifecycleModel]?.transitions[currentStatus]?.[input.targetState.toLowerCase()];
  if (!graphEdge) {
    log.warn("lifecycle transition not covered by graph", {
      model: input.model,
      from: currentStatus,
      to: input.targetState,
      entityId: input.id,
    });
  }

  const now = new Date();
  const updateData: Record<string, any> = {
    status: input.targetState.toLowerCase(),
    ...(input.additionalData || {}),
  };

  // 3. Populate audit timestamps & attribution fields if supported by model
  if (input.targetState.toLowerCase() === "approved") {
    if ("approvedById" in entity) updateData.approvedById = input.userId;
    if ("approvedAt" in entity) updateData.approvedAt = now;
  } else if (input.targetState.toLowerCase() === "rejected") {
    if ("rejectionReason" in entity) updateData.rejectionReason = input.notes || null;
    if ("rejectedAt" in entity) updateData.rejectedAt = now;
  } else if (input.targetState.toLowerCase() === "submitted") {
    if ("submittedById" in entity) updateData.submittedById = input.userId;
    if ("submittedAt" in entity) updateData.submittedAt = now;
  }

  // 4. Persist transition
  const updatedEntity = await modelDelegate.update({
    where: { id: input.id },
    data: updateData,
  });

  // 5. Emit Domain Event
  if (!input.skipEventEmit && input.projectId) {
    emitDomainEvent({
      // Generic lifecycle event — the previous hard-coded "expense.created"
      // mislabeled every transition (leave requests, RFIs, POs...) as
      // expense events. Model + from/to travel in metadata; title/message
      // stay human-readable.
      type: "lifecycle.transitioned",
      projectId: input.projectId,
      actorUserId: input.userId,
      entityType: input.model,
      entityId: input.id,
      title: `${input.model.toUpperCase()} marked as ${input.targetState.toUpperCase()}`,
      message: input.notes || `State transitioned from ${currentStatus} to ${input.targetState}.`,
      metadata: {
        entityId: input.id,
        model: input.model,
        previousState: currentStatus,
        newState: input.targetState,
      },
    });
  }

  return {
    entity: updatedEntity,
    previousState: currentStatus,
    currentState: input.targetState.toLowerCase(),
    transitionedAt: now,
  };
}
