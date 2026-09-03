/**
 * Policy version service (ADR-0004 §3 — prospective-only versioning).
 *
 * The ACTIVE OrganizationPolicyVersion is the single workflow authority for
 * an org. Rules encoded here:
 *   - Forward-only: activating a policy CREATES a new version row and
 *     stamps the previous one `supersededAt`. Existing versions' capability
 *     maps are NEVER edited — posted history (e.g. PayrollRun.policyVersionId)
 *     keeps pointing at the snapshot it was executed under and is never
 *     reinterpreted.
 *   - The method supplies defaults; overrides are validated through
 *     src/lib/capabilities.ts, never trusted from raw client input.
 *   - Every org MUST have an active version. Bootstrap paths (signup,
 *     admin create-org, seed, payroll binding) call
 *     `ensureActivePolicyVersion` so the invariant self-heals.
 */

import { TRPCError } from "@trpc/server";
import { db } from "@/lib/db";
import {
  methodDefaults,
  operatingMethodSchema,
  parseCapabilities,
  resolveCapabilityMap,
  type CapabilityOverrides,
  type OperatingCapabilities,
  type OperatingMethod,
} from "@/lib/capabilities";

/** Structural Prisma client (standard client or an open transaction). */
type DbLike = typeof db | any;

export type ResolvedOrgPolicy = {
  organizationId: string;
  operatingMethod: OperatingMethod;
  capabilities: OperatingCapabilities;
  /** Active snapshot id; null only before bootstrap self-heals. */
  policyVersionId: string | null;
  /** Active version number; null when no snapshot exists yet. */
  policyVersionNumber: number | null;
};

/**
 * Resolves the org's effective policy: the ACTIVE version's capability map
 * when one exists, otherwise the current method's defaults. Fails loud on
 * unknown methods or malformed stored maps — never silently degrades.
 */
export async function resolveOrgPolicy(
  organizationId: string | null | undefined,
  txDb: DbLike = db
): Promise<ResolvedOrgPolicy> {
  if (!organizationId) {
    throw new TRPCError({ code: "FORBIDDEN", message: "User has no organization assigned." });
  }

  const org = await txDb.organization.findUnique({
    where: { id: organizationId },
    select: {
      operatingMethod: true,
      activePolicyVersionId: true,
      activePolicyVersion: { select: { version: true, operatingMethod: true, capabilities: true } },
    },
  });
  if (!org) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Organization not found." });
  }

  if (org.activePolicyVersion) {
    return {
      organizationId,
      operatingMethod: operatingMethodSchema.parse(org.activePolicyVersion.operatingMethod),
      capabilities: parseCapabilities(org.activePolicyVersion.capabilities),
      policyVersionId: org.activePolicyVersionId,
      policyVersionNumber: org.activePolicyVersion.version,
    };
  }

  // No active snapshot yet (pre-bootstrap org) — method defaults apply.
  return {
    organizationId,
    operatingMethod: operatingMethodSchema.parse(org.operatingMethod),
    capabilities: methodDefaults(org.operatingMethod),
    policyVersionId: null,
    policyVersionNumber: null,
  };
}

export type ActivatePolicyInput = {
  organizationId: string;
  /** Switch of workflow template. Omit to re-snapshot the current method. */
  operatingMethod?: OperatingMethod;
  /** Validated overrides applied on top of the target method's defaults. */
  capabilities?: CapabilityOverrides;
  notes?: string | null;
  activatedById?: string | null;
};

/**
 * Activates a NEW policy version (forward-only). Supersedes the previous
 * active snapshot (supersededAt only — its capabilities are immutable),
 * creates version N+1 and re-points the organization. Run inside a
 * transaction by passing an open tx as `txDb`.
 */
export async function activatePolicyVersion(
  input: ActivatePolicyInput,
  txDb: DbLike = db
) {
  const org = await txDb.organization.findUnique({
    where: { id: input.organizationId },
    select: { operatingMethod: true, activePolicyVersionId: true },
  });
  if (!org) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Organization not found." });
  }

  const method = operatingMethodSchema.parse(input.operatingMethod ?? org.operatingMethod);
  const capabilities = resolveCapabilityMap(method, input.capabilities);

  const last = await txDb.organizationPolicyVersion.findFirst({
    where: { organizationId: input.organizationId },
    orderBy: { version: "desc" },
    select: { version: true },
  });
  const nextVersion = (last?.version ?? 0) + 1;

  // Forward-only: the outgoing snapshot is stamped, never rewritten.
  if (org.activePolicyVersionId) {
    await txDb.organizationPolicyVersion.update({
      where: { id: org.activePolicyVersionId },
      data: { supersededAt: new Date() },
    });
  }

  const created = await txDb.organizationPolicyVersion.create({
    data: {
      organizationId: input.organizationId,
      version: nextVersion,
      operatingMethod: method,
      capabilities,
      notes: input.notes ?? null,
      activatedById: input.activatedById ?? null,
    },
  });

  await txDb.organization.update({
    where: { id: input.organizationId },
    data: { operatingMethod: method, activePolicyVersionId: created.id },
  });

  return created;
}

/**
 * Returns the org's active policy version, bootstrap-creating version 1
 * from the org's current method when none exists (signup, admin create-org,
 * legacy rows). Safe under concurrent activation: a unique-constraint loss
 * re-reads the winner instead of failing the caller.
 */
export async function ensureActivePolicyVersion(
  organizationId: string,
  opts?: { activatedById?: string | null; notes?: string | null },
  txDb: DbLike = db
) {
  const org = await txDb.organization.findUnique({
    where: { id: organizationId },
    select: { activePolicyVersionId: true },
  });
  if (!org) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Organization not found." });
  }

  if (org.activePolicyVersionId) {
    const active = await txDb.organizationPolicyVersion.findUnique({
      where: { id: org.activePolicyVersionId },
    });
    if (active) return active;
  }

  try {
    return await activatePolicyVersion(
      {
        organizationId,
        notes: opts?.notes ?? "Initial policy — auto-provisioned",
        activatedById: opts?.activatedById ?? null,
      },
      txDb
    );
  } catch (err: any) {
    // Concurrent bootstrap lost the (organizationId, version) race — the
    // winner's snapshot is just as valid; return it.
    if (err?.code === "P2002") {
      const fresh = await txDb.organization.findUnique({
        where: { id: organizationId },
        select: { activePolicyVersionId: true },
      });
      if (fresh?.activePolicyVersionId) {
        const active = await txDb.organizationPolicyVersion.findUnique({
          where: { id: fresh.activePolicyVersionId },
        });
        if (active) return active;
      }
    }
    throw err;
  }
}
