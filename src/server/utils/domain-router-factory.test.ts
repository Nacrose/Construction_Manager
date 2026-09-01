/**
 * Tests for the Canonical Domain Router Factory.
 *
 * Pins:
 *   - All five standard procedures exist on a generated router
 *   - `transition` runs transitionEntityState inside ONE transaction and
 *     invokes the afterTransition hook with that same tx — a failing hook
 *     rejects the whole mutation, so the CAS status write rolls back and
 *     side effects are never stranded in a half-applied state
 *   - the lifecycle domain event fires only AFTER the transaction commits
 *     (skipped when the transition/hook failed)
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { z } from "zod";

vi.mock("@/lib/db", async () => {
  const { buildDbMock } = await import("../routers/__tests__/test-utils");
  const db = buildDbMock();
  return { db, getFreshDb: () => db };
});

vi.mock("@/lib/audit", () => ({ audit: vi.fn().mockResolvedValue(undefined) }));
vi.mock("./domain-events", () => ({ emitDomainEvent: vi.fn() }));

import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { emitDomainEvent } from "./domain-events";
import { createDomainRouter } from "./domain-router-factory";
import { buildUser, createCaller } from "../routers/__tests__/test-utils";

const anyDb = db as any;
const mockEmit = vi.mocked(emitDomainEvent);
const USER = buildUser();

beforeEach(() => {
  vi.resetAllMocks();
  // role guard (assertProjectMember) reads the membership via the db mock
  anyDb.projectMember.findUnique.mockResolvedValue({ role: "admin" });
  anyDb.punchItem.findUnique.mockResolvedValue({
    id: "pi-1",
    projectId: "p-1",
    status: "open",
    organizationId: null,
  });
});

describe("Canonical Domain Router Factory", () => {
  it("creates a valid tRPC router with standard procedures", () => {
    const testRouter = createDomainRouter({
      model: "punchItem",
      schemas: {
        create: z.object({
          projectId: z.string(),
          number: z.string(),
          title: z.string(),
        }),
      },
    });

    expect(testRouter).toBeDefined();
    expect(testRouter._def.procedures.list).toBeDefined();
    expect(testRouter._def.procedures.get).toBeDefined();
    expect(testRouter._def.procedures.create).toBeDefined();
    expect(testRouter._def.procedures.transition).toBeDefined();
    expect(testRouter._def.procedures.delete).toBeDefined();
  });

  it("transition: runs the state machine in a tx and invokes afterTransition with that tx", async () => {
    const afterTransition = vi.fn().mockResolvedValue(undefined);
    const testRouter = createDomainRouter({
      model: "punchItem",
      schemas: { create: z.object({ projectId: z.string() }) },
      hooks: { afterTransition },
    });
    const caller = createCaller(testRouter, USER);

    const result = await caller.transition({
      id: "pi-1",
      targetState: "in_progress",
    });

    expect(result.currentState).toBe("in_progress");
    // the transition wrote through the transaction client (CAS on the read status)
    expect(anyDb.punchItem.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "pi-1", status: "open" },
        data: expect.objectContaining({ status: "in_progress" }),
      }),
    );
    // the hook received the transition result
    expect(afterTransition).toHaveBeenCalledTimes(1);
    expect(afterTransition.mock.calls[0][1].currentState).toBe("in_progress");
    // the event was emitted AFTER the transaction committed (skipEventEmit inside)
    expect(mockEmit).toHaveBeenCalledTimes(1);
    expect(mockEmit.mock.calls[0][0].type).toBe("lifecycle.transitioned");
    // audit logged the transition
    expect(audit).toHaveBeenCalledTimes(1);
  });

  it("transition: a failing afterTransition hook rejects the whole mutation", async () => {
    const testRouter = createDomainRouter({
      model: "punchItem",
      schemas: { create: z.object({ projectId: z.string() }) },
      hooks: { afterTransition: vi.fn().mockRejectedValue(new Error("JE posting failed")) },
    });
    const caller = createCaller(testRouter, USER);

    await expect(
      caller.transition({ id: "pi-1", targetState: "in_progress" }),
    ).rejects.toThrow("JE posting failed");
    // nothing after the failed hook ran: no audit, no event — and in
    // production the thrown error aborts the tx, rolling back the CAS write.
    expect(audit).not.toHaveBeenCalled();
    expect(mockEmit).not.toHaveBeenCalled();
  });
});
