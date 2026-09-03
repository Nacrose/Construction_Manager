/**
 * EngineContext (ADR-0006 §4) — the mandatory execution context for every
 * controlled command.
 *
 * "There is no way to run a financial or lifecycle command outside that
 * context": the context carries the org-scoped transaction, the actor,
 * the organization scope, the optional project scope, the resolved policy
 * snapshot (the ACTIVE OrganizationPolicyVersion the command executes
 * under), and the effective business date. `executeAction` refuses to run
 * without one — a statically-impossible state must fail loud, not pass
 * silently.
 */
import type { DbTxClient } from "@/lib/db";
import { resolveOrgPolicy } from "@/lib/policy-version";
import type { AuthUser } from "@/lib/auth";

/** Structural subset of the tRPC context the builder consumes (type-only — no import cycle with trpc.ts). */
type TrpcLikeContext = {
  user: AuthUser | null;
  /** capabilityGuard injects these (Phase C) — preferred when present. */
  operatingMethod?: unknown;
  policyVersionId?: unknown;
  projectId?: string | null;
};

export type EnginePolicySnapshot = {
  operatingMethod: string;
  /** The ACTIVE OrganizationPolicyVersion this command is bound to (ADR-0004). */
  policyVersionId: string | null;
};

export type EngineActor = {
  userId: string;
  userName?: string | null;
};

export type EngineContext = {
  /** Org-scoped transaction — every controlled command executes inside one. */
  tx: DbTxClient;
  actor: EngineActor;
  organizationId: string;
  projectId?: string | null;
  /** Resolved policy snapshot (capabilityGuard injects it into tRPC ctx). */
  policy: EnginePolicySnapshot;
  /** Effective business date — fiscal-period checks key on this. */
  businessDate: Date;
};

/**
 * Build an EngineContext from a tRPC context + the command's transaction.
 * Prefers the policy snapshot capabilityGuard already injected into ctx;
 * falls back to resolving the org's ACTIVE policy version on demand (one
 * bounded read) so non-gated routers still get an authoritative snapshot.
 */
export async function engineContextFromTrpc(
  ctx: TrpcLikeContext,
  tx: DbTxClient,
  opts?: { projectId?: string | null; businessDate?: Date },
): Promise<EngineContext> {
  if (!ctx.user) {
    throw new Error("engineContextFromTrpc requires an authenticated user");
  }
  const user: AuthUser = ctx.user;
  if (!user.organizationId) {
    throw new Error("engineContextFromTrpc requires an organization-scoped user");
  }

  let policy: EnginePolicySnapshot;
  if (typeof ctx.operatingMethod === "string") {
    policy = {
      operatingMethod: ctx.operatingMethod,
      policyVersionId: typeof ctx.policyVersionId === "string" ? ctx.policyVersionId : null,
    };
  } else {
    const resolved = await resolveOrgPolicy(user.organizationId, tx);
    policy = {
      operatingMethod: resolved.operatingMethod,
      policyVersionId: resolved.policyVersionId,
    };
  }

  return {
    tx,
    actor: { userId: user.id, userName: user.name },
    organizationId: user.organizationId,
    projectId: opts?.projectId ?? ctx.projectId ?? null,
    policy,
    businessDate: opts?.businessDate ?? new Date(),
  };
}

/**
 * Fail-loud structural guard — executeAction runs this before anything
 * else. A context missing any mandatory member means a caller bypassed
 * the builder; that is a bug, not a condition to tolerate.
 */
export function requireEngineContext(ctx: EngineContext): void {
  const problems: string[] = [];
  if (!ctx.tx) problems.push("tx");
  if (!ctx.actor?.userId) problems.push("actor.userId");
  if (!ctx.organizationId) problems.push("organizationId");
  if (!ctx.policy || typeof ctx.policy.operatingMethod !== "string") problems.push("policy");
  if (!(ctx.businessDate instanceof Date)) problems.push("businessDate");
  if (problems.length > 0) {
    throw new Error(
      `EngineContext is incomplete (missing: ${problems.join(", ")}) — build it with engineContextFromTrpc.`,
    );
  }
}
