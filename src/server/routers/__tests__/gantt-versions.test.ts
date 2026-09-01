/**
 * Router-layer tests for gantt-versions.ts approval flows.
 *
 * Pins:
 *   - approveVersion: engine-backed transition (CAS on the DRAFT status) —
 *     only PMs approve, only draft versions approve, concurrent approvals
 *     of the SAME version CONFLICT (engine CAS regression)
 *   - approveVersion: the currently-active version is claimed with a
 *     compare-and-swap BEFORE the new approval — two PMs approving two
 *     DIFFERENT versions concurrently can no longer leave two active
 *     versions (one-active-per-project invariant)
 *   - approveRevision: same CAS contract; the superseded revision target
 *     is claimed, revisionStatus rides additionalData
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { buildUser, createCaller, expectTRPCError } from "./test-utils";

vi.mock("@/lib/db", async () => {
  const { buildDbMock } = await import("./test-utils");
  const db = buildDbMock();
  return { db, getFreshDb: () => db };
});

import { db } from "@/lib/db";
import { ganttVersionsRouter } from "../gantt-versions";

const anyDb = db as any;
const PM = buildUser({ role: "member" });
const ENGINEER = buildUser({ id: "user-2", role: "member" });

function member(role: string | null) {
  anyDb.projectMember.findUnique.mockResolvedValue(role ? { role } : null);
}

function draftVersion(overrides: Record<string, unknown> = {}) {
  return {
    id: "gv-1",
    projectId: "p-1",
    versionNumber: 2,
    status: "DRAFT",
    ...overrides,
  };
}

beforeEach(() => {
  vi.resetAllMocks();
});

// ─── approveVersion ─────────────────────────────────────────────────────────
describe("ganttVersions.approveVersion", () => {
  it("approves a draft version via the engine (CAS on DRAFT) and activates it", async () => {
    member("project_manager");
    anyDb.ganttVersion.findUnique.mockResolvedValue(draftVersion());
    anyDb.ganttVersion.findFirst.mockResolvedValue(null);
    const caller = createCaller(ganttVersionsRouter, PM);

    await caller.approveVersion({ projectId: "p-1", versionId: "gv-1" });

    // Engine CAS contract: compare-and-swap on the stored DRAFT status,
    // writing the caller's exact uppercase casing + isActive via additionalData
    expect(anyDb.ganttVersion.updateMany).toHaveBeenCalledWith({
      where: { id: "gv-1", status: "DRAFT" },
      data: expect.objectContaining({ status: "APPROVED", isActive: true }),
    });
  });

  it("claims the currently-active version with a CAS before approving", async () => {
    member("project_manager");
    anyDb.ganttVersion.findUnique.mockResolvedValue(draftVersion());
    anyDb.ganttVersion.findFirst.mockResolvedValue({ id: "gv-0" });
    const caller = createCaller(ganttVersionsRouter, PM);

    await caller.approveVersion({ projectId: "p-1", versionId: "gv-1" });

    // First updateMany = archive claim on the OLD active version
    expect(anyDb.ganttVersion.updateMany.mock.calls[0][0]).toEqual({
      where: { id: "gv-0", isActive: true, status: "APPROVED" },
      data: { isActive: false, status: "ARCHIVED" },
    });
    // Second updateMany = the engine's approval CAS
    expect(anyDb.ganttVersion.updateMany.mock.calls[1][0]).toEqual({
      where: { id: "gv-1", status: "DRAFT" },
      data: expect.objectContaining({ status: "APPROVED" }),
    });
  });

  it("CONFLICTs when the active version was just claimed by another approval", async () => {
    member("project_manager");
    anyDb.ganttVersion.findUnique.mockResolvedValue(draftVersion());
    anyDb.ganttVersion.findFirst.mockResolvedValue({ id: "gv-0" });
    // 0 rows matched → a concurrent approval already archived the old active
    anyDb.ganttVersion.updateMany.mockResolvedValue({ count: 0 });
    const caller = createCaller(ganttVersionsRouter, PM);

    await expectTRPCError(
      caller.approveVersion({ projectId: "p-1", versionId: "gv-1" }),
      "CONFLICT",
    );
    // the losing approval must not touch the new version
    expect(anyDb.ganttVersion.updateMany).toHaveBeenCalledTimes(1);
  });

  it("CONFLICTs when a concurrent approval of the SAME version wins (engine CAS regression)", async () => {
    member("project_manager");
    anyDb.ganttVersion.findUnique.mockResolvedValue(draftVersion());
    anyDb.ganttVersion.findFirst.mockResolvedValue(null);
    // engine CAS matches 0 rows → another approver already transitioned it
    anyDb.ganttVersion.updateMany.mockResolvedValue({ count: 0 });
    const caller = createCaller(ganttVersionsRouter, PM);

    await expectTRPCError(
      caller.approveVersion({ projectId: "p-1", versionId: "gv-1" }),
      "CONFLICT",
    );
  });

  it("FORBIDDENs non-PM roles", async () => {
    member("engineer");
    anyDb.ganttVersion.findUnique.mockResolvedValue(draftVersion());
    const caller = createCaller(ganttVersionsRouter, ENGINEER);

    await expectTRPCError(
      caller.approveVersion({ projectId: "p-1", versionId: "gv-1" }),
      "FORBIDDEN",
    );
    expect(anyDb.ganttVersion.updateMany).not.toHaveBeenCalled();
  });

  it("BAD_REQUESTs approving a non-draft version", async () => {
    member("project_manager");
    anyDb.ganttVersion.findUnique.mockResolvedValue(draftVersion({ status: "APPROVED" }));
    const caller = createCaller(ganttVersionsRouter, PM);

    await expectTRPCError(
      caller.approveVersion({ projectId: "p-1", versionId: "gv-1" }),
      "BAD_REQUEST",
    );
    expect(anyDb.ganttVersion.updateMany).not.toHaveBeenCalled();
  });

  it("NOT_FOUNDs a version from ANOTHER project (IDOR guard)", async () => {
    member("project_manager");
    anyDb.ganttVersion.findUnique.mockResolvedValue(draftVersion({ projectId: "p-other" }));
    const caller = createCaller(ganttVersionsRouter, PM);

    await expectTRPCError(
      caller.approveVersion({ projectId: "p-1", versionId: "gv-1" }),
      "FORBIDDEN",
    );
    expect(anyDb.ganttVersion.updateMany).not.toHaveBeenCalled();
  });
});

// ─── approveRevision ────────────────────────────────────────────────────────
describe("ganttVersions.approveRevision", () => {
  function revisionVersion(overrides: Record<string, unknown> = {}) {
    return {
      id: "gv-2",
      projectId: "p-1",
      status: "DRAFT",
      scheduleType: "baseline",
      revisionStatus: "SUBMITTED",
      revisionOfId: "gv-0",
      approvedAt: null,
      approvedById: null,
      ...overrides,
    };
  }

  it("approves a submitted revision via the engine and archives the superseded version", async () => {
    member("project_manager");
    anyDb.ganttVersion.findUnique.mockResolvedValue(revisionVersion());
    const caller = createCaller(ganttVersionsRouter, PM);

    await caller.approveRevision({
      projectId: "p-1",
      versionId: "gv-2",
      approvalNote: "ok",
    });

    // First updateMany = claim on the superseded active version
    expect(anyDb.ganttVersion.updateMany.mock.calls[0][0]).toEqual({
      where: { id: "gv-0", isActive: true },
      data: { isActive: false, status: "ARCHIVED", revisionStatus: "ARCHIVED" },
    });
    // Second updateMany = engine approval CAS (revisionStatus + note ride
    // additionalData; approvedAt/approvedById are engine-stamped)
    const approval = anyDb.ganttVersion.updateMany.mock.calls[1][0];
    expect(approval.where).toEqual({ id: "gv-2", status: "DRAFT" });
    expect(approval.data).toEqual(
      expect.objectContaining({
        status: "APPROVED",
        isActive: true,
        revisionStatus: "APPROVED",
        approvalNote: "ok",
        approvedById: PM.id,
      }),
    );
  });

  it("CONFLICTs when the superseded version was just claimed", async () => {
    member("project_manager");
    anyDb.ganttVersion.findUnique.mockResolvedValue(revisionVersion());
    anyDb.ganttVersion.updateMany.mockResolvedValue({ count: 0 });
    const caller = createCaller(ganttVersionsRouter, PM);

    await expectTRPCError(
      caller.approveRevision({ projectId: "p-1", versionId: "gv-2" }),
      "CONFLICT",
    );
  });

  it("BAD_REQUESTs a revision whose revisionStatus is not SUBMITTED", async () => {
    member("project_manager");
    anyDb.ganttVersion.findUnique.mockResolvedValue(revisionVersion({ revisionStatus: "DRAFT" }));
    const caller = createCaller(ganttVersionsRouter, PM);

    await expectTRPCError(
      caller.approveRevision({ projectId: "p-1", versionId: "gv-2" }),
      "BAD_REQUEST",
    );
    expect(anyDb.ganttVersion.updateMany).not.toHaveBeenCalled();
  });
});
