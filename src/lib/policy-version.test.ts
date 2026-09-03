import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({
  db: {
    organization: { findUnique: vi.fn(), update: vi.fn() },
    organizationPolicyVersion: { findUnique: vi.fn(), findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
  },
}));

import { db } from "@/lib/db";
import {
  activatePolicyVersion,
  ensureActivePolicyVersion,
  resolveOrgPolicy,
} from "./policy-version";
import { METHOD_CAPABILITY_DEFAULTS, parseCapabilities } from "./capabilities";

const anyDb = db as any;
const DELEGATED = METHOD_CAPABILITY_DEFAULTS.delegated;
const OWNER_LED = METHOD_CAPABILITY_DEFAULTS.owner_led;

beforeEach(() => {
  // resetAllMocks (not clearAllMocks): once-queues from P2002-simulation
  // must not leak across tests.
  vi.resetAllMocks();
});

describe("resolveOrgPolicy", () => {
  it("throws FORBIDDEN when the caller has no organization id", async () => {
    await expect(resolveOrgPolicy(null)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(resolveOrgPolicy(undefined)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("throws FORBIDDEN when the organization does not exist", async () => {
    anyDb.organization.findUnique.mockResolvedValue(null);
    await expect(resolveOrgPolicy("org-x")).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("returns the ACTIVE version's parsed capability map when one exists", async () => {
    anyDb.organization.findUnique.mockResolvedValue({
      operatingMethod: "delegated",
      activePolicyVersionId: "pv-2",
      activePolicyVersion: { version: 2, operatingMethod: "delegated", capabilities: DELEGATED },
    });

    const policy = await resolveOrgPolicy("org-1");
    expect(policy).toEqual({
      organizationId: "org-1",
      operatingMethod: "delegated",
      capabilities: DELEGATED,
      policyVersionId: "pv-2",
      policyVersionNumber: 2,
    });
  });

  it("falls back to the org's method defaults when no active version exists yet", async () => {
    anyDb.organization.findUnique.mockResolvedValue({
      operatingMethod: "owner_led",
      activePolicyVersionId: null,
      activePolicyVersion: null,
    });

    const policy = await resolveOrgPolicy("org-1");
    expect(policy.capabilities).toEqual(OWNER_LED);
    expect(policy.policyVersionId).toBeNull();
    expect(policy.policyVersionNumber).toBeNull();
  });

  it("fails loud on an unknown stored operating method", async () => {
    anyDb.organization.findUnique.mockResolvedValue({
      operatingMethod: "hybrid_workshop_model",
      activePolicyVersionId: null,
      activePolicyVersion: null,
    });
    await expect(resolveOrgPolicy("org-1")).rejects.toThrow(/Unknown operating method|Invalid enum value|out of range|expected/i);
  });

  it("fails loud on a malformed stored capabilities payload (never silently degrades)", async () => {
    anyDb.organization.findUnique.mockResolvedValue({
      operatingMethod: "delegated",
      activePolicyVersionId: "pv-bad",
      activePolicyVersion: { version: 1, operatingMethod: "delegated", capabilities: { nope: true } },
    });
    await expect(resolveOrgPolicy("org-1")).rejects.toThrow(/Invalid capabilities payload/);
  });
});

describe("activatePolicyVersion", () => {
  const existingOrg = { operatingMethod: "owner_led", activePolicyVersionId: "pv-1" };

  it("creates version N+1, supersedes the previous snapshot and re-points the org", async () => {
    anyDb.organization.findUnique.mockResolvedValue(existingOrg);
    anyDb.organizationPolicyVersion.findFirst.mockResolvedValue({ version: 3 });
    anyDb.organizationPolicyVersion.create.mockImplementation(async ({ data }: any) => ({
      id: "pv-4",
      version: data.version,
      operatingMethod: data.operatingMethod,
      capabilities: data.capabilities,
    }));

    const created = await activatePolicyVersion({
      organizationId: "org-1",
      operatingMethod: "delegated",
      notes: "upgrade",
    });

    expect(created.version).toBe(4);
    // Forward-only: the outgoing snapshot is STAMPED, its capabilities untouched.
    expect(anyDb.organizationPolicyVersion.update).toHaveBeenCalledWith({
      where: { id: "pv-1" },
      data: { supersededAt: expect.any(Date) },
    });
    expect(anyDb.organizationPolicyVersion.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        organizationId: "org-1",
        version: 4,
        operatingMethod: "delegated",
        capabilities: DELEGATED,
        notes: "upgrade",
      }),
    });
    expect(anyDb.organization.update).toHaveBeenCalledWith({
      where: { id: "org-1" },
      data: { operatingMethod: "delegated", activePolicyVersionId: "pv-4" },
    });
  });

  it("defaults to the org's current method and applies validated overrides", async () => {
    anyDb.organization.findUnique.mockResolvedValue(existingOrg);
    anyDb.organizationPolicyVersion.findFirst.mockResolvedValue(null);
    anyDb.organizationPolicyVersion.create.mockImplementation(async ({ data }: any) => ({ id: "pv-n", ...data }));

    await activatePolicyVersion({
      organizationId: "org-1",
      capabilities: { procurementChain: "quotes" },
    });

    const arg = anyDb.organizationPolicyVersion.create.mock.calls[0][0];
    expect(arg.data.operatingMethod).toBe("owner_led"); // current method kept
    expect(arg.data.capabilities).toEqual({ ...OWNER_LED, procurementChain: "quotes" });
    expect(arg.data.version).toBe(1); // no prior versions
  });

  it("never mutates the previous version's capability map (history is immutable)", async () => {
    anyDb.organization.findUnique.mockResolvedValue(existingOrg);
    anyDb.organizationPolicyVersion.findFirst.mockResolvedValue({ version: 1 });
    anyDb.organizationPolicyVersion.create.mockResolvedValue({ id: "pv-2", version: 2 });

    await activatePolicyVersion({ organizationId: "org-1", operatingMethod: "crew_led" });

    const updateArg = anyDb.organizationPolicyVersion.update.mock.calls[0][0];
    expect(updateArg.data).toEqual({ supersededAt: expect.any(Date) });
    expect(JSON.stringify(updateArg)).not.toContain("capabilities");
  });

  it("throws NOT_FOUND for an unknown organization", async () => {
    anyDb.organization.findUnique.mockResolvedValue(null);
    await expect(activatePolicyVersion({ organizationId: "org-x" })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("ensureActivePolicyVersion", () => {
  it("returns the existing active version without creating anything", async () => {
    anyDb.organization.findUnique.mockResolvedValue({ activePolicyVersionId: "pv-7" });
    anyDb.organizationPolicyVersion.findUnique.mockResolvedValue({ id: "pv-7", version: 7 });

    const active = await ensureActivePolicyVersion("org-1");
    expect(active.id).toBe("pv-7");
    expect(anyDb.organizationPolicyVersion.create).not.toHaveBeenCalled();
  });

  it("bootstraps version 1 from the org's current method when none exists", async () => {
    anyDb.organization.findUnique
      .mockResolvedValueOnce({ activePolicyVersionId: null })
      .mockResolvedValue({ activePolicyVersionId: null, operatingMethod: "owner_led" });
    anyDb.organizationPolicyVersion.findFirst.mockResolvedValue(null);
    anyDb.organizationPolicyVersion.create.mockResolvedValue({ id: "pv-1", version: 1 });

    const active = await ensureActivePolicyVersion("org-1");
    expect(active.version).toBe(1);
    expect(anyDb.organizationPolicyVersion.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ organizationId: "org-1", version: 1, notes: "Initial policy — auto-provisioned" }),
    });
  });

  it("self-heals after a concurrent bootstrap loses the version race (P2002)", async () => {
    anyDb.organization.findUnique.mockResolvedValue({ activePolicyVersionId: null });
    anyDb.organizationPolicyVersion.findFirst.mockResolvedValue(null);
    anyDb.organizationPolicyVersion.create
      .mockRejectedValueOnce(Object.assign(new Error("Unique constraint failed"), { code: "P2002" }))
      .mockResolvedValue({ id: "pv-winner", version: 1 });

    // Second read (after P2002) finds the winner's snapshot.
    const secondOrgRead = vi.fn().mockResolvedValue({ activePolicyVersionId: "pv-winner" });
    anyDb.organization.findUnique.mockImplementation(secondOrgRead);
    anyDb.organizationPolicyVersion.findUnique.mockResolvedValue({ id: "pv-winner", version: 1 });

    const active = await ensureActivePolicyVersion("org-1");
    expect(active.id).toBe("pv-winner");
  });

  it("throws NOT_FOUND when the organization is missing", async () => {
    anyDb.organization.findUnique.mockResolvedValue(null);
    await expect(ensureActivePolicyVersion("org-x")).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("capability JSON round-trip", () => {
  it("activations store maps that parseCapabilities accepts verbatim", async () => {
    anyDb.organization.findUnique.mockResolvedValue({ operatingMethod: "delegated", activePolicyVersionId: null });
    anyDb.organizationPolicyVersion.findFirst.mockResolvedValue(null);
    anyDb.organizationPolicyVersion.create.mockImplementation(async ({ data }: any) => data);

    const created = await activatePolicyVersion({ organizationId: "org-1", operatingMethod: "delegated" });
    expect(parseCapabilities((created as any).capabilities)).toEqual(DELEGATED);
  });
});
