/**
 * Action execution pipeline (ADR-0006 §3/§4).
 *
 * `executeAction` resolves: action → source states → target → graph
 * validation → CAS claim → audit attribution → outbox event. It rides the
 * SAME central engine machinery as the deprecated raw-state bridge
 * (transitionEntityState) — extend in place, never a parallel engine —
 * but the caller speaks in ACTIONS and must bring a complete
 * EngineContext (there is no way to run a controlled command outside
 * one).
 *
 * Money side effects (recovery, journal entries, settlement) are the
 * CALLER's responsibility within the same transaction, declared on the
 * action's `sideEffects` in the registry — the engine owns state,
 * authority, and audit; the domain service owns arithmetic.
 */
import { TRPCError } from "@trpc/server";
import {
  ENGINE_ACTIONS,
  isEngineActionId,
  type EngineActionId,
} from "./actions";
import { requireEngineContext, type EngineContext } from "./context";
import {
  transitionEntityState,
  type TransitionEntityStateResult,
} from "@/server/utils/state-machine";

export type ExecuteActionInput = {
  id: string;
  notes?: string | null;
  additionalData?: Record<string, unknown>;
  /**
   * Extra narrowing on top of the action's declared `from` states (same
   * semantics as the engine's allowedCurrentStates) — used when a caller
   * legitimately accepts fewer source states than the graph allows.
   */
  restrictCurrentStates?: readonly string[];
  /** Suppress the transactional-outbox event (caller emits a richer one post-commit). */
  skipEventEmit?: boolean;
};

export async function executeAction(
  ctx: EngineContext,
  actionId: EngineActionId,
  input: ExecuteActionInput,
): Promise<TransitionEntityStateResult> {
  // Fail loud on an incomplete context — no controlled command runs
  // outside the engine context (ADR-0006 §4).
  requireEngineContext(ctx);

  if (!isEngineActionId(actionId)) {
    // Unreachable for well-typed callers; guards dynamic strings.
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: `Unknown engine action '${actionId}'.`,
    });
  }
  const action = ENGINE_ACTIONS[actionId];

  const allowedCurrentStates = input.restrictCurrentStates
    ? [...input.restrictCurrentStates]
    : [...action.from];

  try {
    return await transitionEntityState(ctx.tx, {
      model: action.model,
      id: input.id,
      targetState: action.to,
      allowedCurrentStates,
      userId: ctx.actor.userId,
      userName: ctx.actor.userName ?? undefined,
      projectId: ctx.projectId ?? undefined,
      notes: input.notes ?? null,
      additionalData: input.additionalData,
      // Keep the primitive's default (emit) — the engine's typed entry
      // point must NOT silently invert it. transitionEntityState emits the
      // lifecycle event unless a caller explicitly opts out; `?? false`
      // preserves that contract so a new action follows the codebase-wide
      // "emit by default, like every other transition" rule.
      skipEventEmit: input.skipEventEmit ?? false,
    });
  } catch (err) {
    // Enrich lifecycle failures with the ACTION vocabulary — the caller
    // asked to approve, not to "transition to approved".
    if (err instanceof TRPCError && err.code === "BAD_REQUEST") {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: `${action.label}: ${err.message}`,
      });
    }
    throw err;
  }
}
