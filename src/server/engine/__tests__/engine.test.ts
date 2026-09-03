/**
 * Typed engine tests (Phase F, ADR-0006).
 *
 * Pins:
 *   - Registry coherence: every action's model is a supported lifecycle
 *     model and every from→to edge exists in the declarative graph — the
 *     typed layer can never drift from the single source of truth.
 *   - Context is MANDATORY: executeAction refuses to run with an
 *     incomplete EngineContext (no financial or lifecycle command
 *     outside the context).
 *   - Action resolution: from-states → CAS claim → attribution — and
 *     failures speak the action vocabulary ("Approve payroll run: ..."),
 *     not raw state strings.
 *   - Unknown action ids fail loud (guards dynamic strings).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { buildDbMock, buildUser, type DbMock } from "../../routers/__tests__/test-utils";
import type { AuthUser } from "@/lib/auth";
import type { DbTxClient } from "@/lib/db";

vi.mock("@/lib/db", async () => {
  const db = buildDbMock();
  return { db, getFreshDb: () => db };
});

import { ENGINE_ACTIONS, ENGINE_ACTION_IDS, isEngineActionId } from "../actions";
import { LIFECYCLE_GRAPHS, type SupportedLifecycleModel } from "@/server/utils/state-machine";
import { engineContextFromTrpc, requireEngineContext, type EngineContext } from "../context";
import { executeAction } from "../execute";

const USER: AuthUser = buildUser();

function makeCtx(db: DbMock, over: Partial<EngineContext> = {}): EngineContext {
  return {
    tx: db as unknown as DbTxClient,
    actor: { userId: USER.id, userName: USER.name },
    organizationId: USER.organizationId as string,
    projectId: "p-1",
    policy: { operatingMethod: "delegated", policyVersionId: "pv-1" },
    businessDate: new Date("2026-05-01"),
    ...over,
  };
}

beforeEach(() => {
  vi.resetAllMocks();
});

// ─── registry coherence (static, no db) ─────────────────────────────────────

describe("ENGINE_ACTIONS registry", () => {
  it("only references supported lifecycle models", () => {
    for (const id of ENGINE_ACTION_IDS) {
      const action = ENGINE_ACTIONS[id];
      expect(LIFECYCLE_GRAPHS[action.model]).toBeDefined();
    }
  });

  it("every action's from→to edge exists in the declarative graph", () => {
    for (const id of ENGINE_ACTION_IDS) {
      const action = ENGINE_ACTIONS[id];
      expect(action.from.length, `${id} declares at least one source state`).toBeGreaterThan(0);
      for (const from of action.from) {
        const allowed = LIFECYCLE_GRAPHS[action.model as SupportedLifecycleModel][from] ?? [];
        expect(
          allowed,
          `${id}: ${from} must be a graph node of ${action.model}`,
        ).toBeDefined();
        expect(
          allowed.map((s) => s.toLowerCase()).includes(action.to.toLowerCase()),
          `${id}: ${from}→${action.to} must be a graph edge of ${action.model}`,
        ).toBe(true);
      }
    }
  });

  it("exposes a runtime guard for dynamic action ids", () => {
    expect(isEngineActionId("payrollRun.approve")).toBe(true);
    expect(isEngineActionId("payrollRun.nuke")).toBe(false);
  });
});

// ─── context is mandatory ───────────────────────────────────────────────────

describe("EngineContext", () => {
  it("requireEngineContext accepts a complete context", () => {
    expect(() => requireEngineContext(makeCtx({} as any))).not.toThrow();
  });

  it("requireEngineContext names every missing member (fail loud)", () => {
    expect(() =>
      requireEngineContext({} as unknown as EngineContext),
    ).toThrow(/missing: tx, actor\.userId, organizationId, policy, businessDate/);
  });

  it("engineContextFromTrpc prefers the capabilityGuard-injected policy snapshot", async () => {
    const db = {} as DbMock;
    const ctx = await engineContextFromTrpc(
      {
        user: USER,
        operatingMethod: "owner_led",
        policyVersionId: "pv-7",
      },
      db as any,
      { projectId: "p-9" },
    );
    expect(ctx.policy).toEqual({ operatingMethod: "owner_led", policyVersionId: "pv-7" });
    expect(ctx.organizationId).toBe(USER.organizationId);
    expect(ctx.projectId).toBe("p-9");
    expect(ctx.businessDate).toBeInstanceOf(Date);
  });

  it("engineContextFromTrpc refuses an unauthenticated or org-less user", async () => {
    await expect(engineContextFromTrpc({ user: null }, {} as any)).rejects.toThrow(/authenticated/);
    await expect(
      engineContextFromTrpc({ user: { ...USER, organizationId: null } as AuthUser }, {} as any),
    ).rejects.toThrow(/organization-scoped/);
  });
});

// ─── executeAction pipeline ─────────────────────────────────────────────────

describe("executeAction", () => {
  it("resolves the action to the graph edge and CAS-claims via the engine", async () => {
    const db = buildDbMock();
    const run = { id: "run-1", status: "draft", approvedById: null, approvedAt: null };
    db.payrollRun.findUnique.mockResolvedValue(run);
    db.payrollRun.updateMany.mockResolvedValue({ count: 1 });
    db.payrollRun.findUnique.mockResolvedValueOnce(run).mockResolvedValueOnce({ ...run, status: "approved" });

    const ctx = makeCtx(db);
    const res = await executeAction(ctx, "payrollRun.approve", { id: "run-1" });

    expect(res.previousState).toBe("draft");
    expect(res.currentState).toBe("approved");

    // Engine CAS contract: compare-and-swap on the read status, approver attributed.
    const claim = db.payrollRun.updateMany.mock.calls[0][0];
    expect(claim.where).toEqual({ id: "run-1", status: "draft" });
    expect(claim.data).toMatchObject({ status: "approved", approvedById: USER.id });
  });

  it("BAD_REQUEST failures speak the ACTION vocabulary", async () => {
    const db = buildDbMock();
    // Run is already disbursed — approve is out of order.
    db.payrollRun.findUnique.mockResolvedValue({ id: "run-1", status: "disbursed" });

    const ctx = makeCtx(db);
    await expect(
      executeAction(ctx, "payrollRun.approve", { id: "run-1" }),
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: expect.stringContaining("Approve payroll run:"),
    });
    expect(db.payrollRun.updateMany).not.toHaveBeenCalled();
  });

  it("CONFLICT (CAS loss) passes through untouched", async () => {
    const db = buildDbMock();
    db.payrollRun.findUnique.mockResolvedValue({ id: "run-1", status: "draft" });
    db.payrollRun.updateMany.mockResolvedValue({ count: 0 }); // concurrent winner

    const ctx = makeCtx(db);
    await expect(
      executeAction(ctx, "payrollRun.approve", { id: "run-1" }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("rejects an incomplete context before touching the database", async () => {
    const db = buildDbMock();
    const ctx = makeCtx(db, { organizationId: undefined as unknown as string });

    await expect(
      executeAction(ctx, "payrollRun.approve", { id: "run-1" }),
    ).rejects.toThrow(/EngineContext is incomplete/);
    expect(db.payrollRun.findUnique).not.toHaveBeenCalled();
  });

  it("rejects unknown action ids (dynamic-string guard)", async () => {
    const db = buildDbMock();
    const ctx = makeCtx(db);
    await expect(
      executeAction(ctx, "payrollRun.nuke" as never, { id: "run-1" }),
    ).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" });
    expect(db.payrollRun.findUnique).not.toHaveBeenCalled();
  });

  it("restrictCurrentStates narrows the action's declared from-states", async () => {
    const db = buildDbMock();
    db.purchaseRequisition.findUnique.mockResolvedValue({ id: "pr-1", status: "pending_approval" });
    db.purchaseRequisition.updateMany.mockResolvedValue({ count: 1 });
    db.purchaseRequisition.findUnique.mockResolvedValueOnce({ id: "pr-1", status: "pending_approval" })
      .mockResolvedValueOnce({ id: "pr-1", status: "approved" });

    const ctx = makeCtx(db);
    const res = await executeAction(ctx, "purchaseRequisition.approve", {
      id: "pr-1",
      restrictCurrentStates: ["pending_approval"], // caller only accepts this source
    });

    expect(res.currentState).toBe("approved");
    // The graph edge submitted→approved also exists, but the caller's
    // restriction must reach the engine.
    const claim = db.purchaseRequisition.updateMany.mock.calls[0][0];
    expect(claim.where).toEqual({ id: "pr-1", status: "pending_approval" });
  });
});
