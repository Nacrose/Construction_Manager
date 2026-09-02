/**
 * Router-layer tests for boq-version.ts.
 *
 * Pins:
 *   - approve: engine-backed transition (CAS on the draft status) — only
 *     draft versions can be approved, concurrent approvals CONFLICT
 *   - approve locks the project BOQ in the SAME transaction as the status
 *     flip (no approved-version-with-unlocked-BOQ state)
 *   - approve: version must belong to the authorized project (IDOR guard)
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { buildUser, createCaller, expectTRPCError } from "./test-utils";

vi.mock("@/lib/db", async () => {
  const { buildDbMock } = await import("./test-utils");
  const db = buildDbMock();
  return { db, getFreshDb: () => db };
});

import { db } from "@/lib/db";
import { boqVersionRouter } from "../boq-version";

const anyDb = db as any;
const ENGINEER = buildUser();

function member(role: string | null) {
  anyDb.projectMember.findUnique.mockResolvedValue(role ? { role } : null);
}

function draftVersion(overrides: Record<string, unknown> = {}) {
  return {
    id: "bv-1",
    projectId: "p-1",
    versionNumber: 1,
    status: "draft",
    ...overrides,
  };
}

beforeEach(() => {
  vi.resetAllMocks();
});

// ─── approve ────────────────────────────────────────────────────────────────
describe("boqVersion.approve", () => {
  it("approves a draft version and locks the project BOQ in one transaction", async () => {
    member("project_manager"); // H-7: approval is a PM-tier decision
    anyDb.boqVersion.findUnique.mockResolvedValue(draftVersion());
    anyDb.project.findUnique.mockResolvedValue({ boqLocked: false });
    const caller = createCaller(boqVersionRouter, ENGINEER);
    await caller.approve({ projectId: "p-1", versionId: "bv-1" });

    // Engine CAS contract: compare-and-swap on the draft status
    expect(anyDb.boqVersion.updateMany).toHaveBeenCalledWith({
      where: { id: "bv-1", status: "draft" },
      data: expect.objectContaining({ status: "approved" }),
    });
    // BOQ lock rides the same transaction
    expect(anyDb.project.update).toHaveBeenCalledWith({
      where: { id: "p-1" },
      data: { boqLocked: true },
    });
  });

  it("does not re-lock an already-locked project BOQ", async () => {
    member("project_manager"); // H-7: approval is a PM-tier decision
    anyDb.boqVersion.findUnique.mockResolvedValue(draftVersion());
    anyDb.project.findUnique.mockResolvedValue({ boqLocked: true });
    const caller = createCaller(boqVersionRouter, ENGINEER);
    await caller.approve({ projectId: "p-1", versionId: "bv-1" });
    expect(anyDb.boqVersion.updateMany).toHaveBeenCalled();
    expect(anyDb.project.update).not.toHaveBeenCalled();
  });

  it("BAD_REQUESTs approving a non-draft version", async () => {
    member("project_manager"); // H-7: approval is a PM-tier decision
    anyDb.boqVersion.findUnique.mockResolvedValue(draftVersion({ status: "approved" }));
    const caller = createCaller(boqVersionRouter, ENGINEER);
    await expectTRPCError(
      caller.approve({ projectId: "p-1", versionId: "bv-1" }),
      "BAD_REQUEST",
    );
    expect(anyDb.boqVersion.updateMany).not.toHaveBeenCalled();
    expect(anyDb.project.update).not.toHaveBeenCalled();
  });

  it("NOT_FOUNDs a version from ANOTHER project (IDOR guard)", async () => {
    member("project_manager"); // H-7: approval is a PM-tier decision
    anyDb.boqVersion.findUnique.mockResolvedValue(draftVersion({ projectId: "p-other" }));
    const caller = createCaller(boqVersionRouter, ENGINEER);
    await expectTRPCError(
      caller.approve({ projectId: "p-1", versionId: "bv-1" }),
      "NOT_FOUND",
    );
    expect(anyDb.boqVersion.updateMany).not.toHaveBeenCalled();
  });

  it("CONFLICTs when a concurrent approval wins the race (CAS regression)", async () => {
    member("project_manager"); // H-7: approval is a PM-tier decision
    anyDb.boqVersion.findUnique.mockResolvedValue(draftVersion());
    // 0 rows matched → another approver already transitioned the version
    anyDb.boqVersion.updateMany.mockResolvedValue({ count: 0 });
    const caller = createCaller(boqVersionRouter, ENGINEER);
    await expectTRPCError(
      caller.approve({ projectId: "p-1", versionId: "bv-1" }),
      "CONFLICT",
    );
    // the lock must NOT be applied when the transition lost the race
    expect(anyDb.project.update).not.toHaveBeenCalled();
  });
});
