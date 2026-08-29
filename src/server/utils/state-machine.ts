/**
 * Central Multi-Entity State Machine & Approval Transition Engine
 *
 * Provides safe, audited status transitions across construction domain entities:
 * - Subcontractor Bills, Vendor Invoices, Site Expenses
 * - Purchase Orders, Requisitions, Variation Orders
 * - Leaves, RFIs, Daily Reports, Drawing Approvals
 */
import { TRPCError } from "@trpc/server";
import { type PrismaClient, type Prisma } from "@prisma/client";
import { emitDomainEvent } from "./domain-events";

export type SupportedLifecycleModel =
  | "siteExpense"
  | "subcontractorBill"
  | "purchaseOrder"
  | "purchaseRequisition"
  | "variationOrder"
  | "leave"
  | "dailyReport";

export type TransitionEntityStateInput = {
  model: SupportedLifecycleModel;
  id: string;
  projectId?: string;
  allowedCurrentStates: string[];
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

type DbClientOrTx = PrismaClient | Prisma.TransactionClient;

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
  const normalizedAllowed = input.allowedCurrentStates.map((s) => s.toLowerCase());

  // 2. Validate state transition
  if (!normalizedAllowed.includes(currentStatus)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Invalid state transition for ${input.model}. Current status is '${currentStatus}', but expected one of: [${input.allowedCurrentStates.join(", ")}].`,
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
      type: "expense.created",
      projectId: input.projectId,
      actorUserId: input.userId,
      entityType: input.model,
      entityId: input.id,
      title: `${input.model.toUpperCase()} marked as ${input.targetState.toUpperCase()}`,
      message: input.notes || `State transitioned from ${currentStatus} to ${input.targetState}.`,
      metadata: {
        entityId: input.id,
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
