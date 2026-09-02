/**
 * Router-layer tests for the batch-3 engine adoption sweep
 * (lifecycle moves that previously rode hand-rolled status writes).
 *
 * Pins:
 *   - uncatalogedMaterial.ignore: pending→ignored via transitionEntityState
 *     (CAS updateMany on the pre-read status); an already-MAPPED entry can
 *     no longer be discarded (graph rejects the edge — BAD_REQUEST)
 *   - project.archive: CAS updateMany + audit log; archiving an
 *     already-archived project fails loudly (graph rejects the edge)
 *   - equipment.resolveMaintenance: work order pending→resolved with
 *     engine-populated resolved* fields; the equipment cascade back to
 *     active is guarded (skips when the machine is already active) and
 *     rides the equipment graph (breakdown→active CAS)
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { buildUser, createCaller, expectTRPCError } from "./test-utils";

vi.mock("@/lib/db", async () => {
  const { buildDbMock } = await import("./test-utils");
  const db = buildDbMock();
  return { db, getFreshDb: () => db };
});

// audit() defers its insert through next/server `after()`; flush it now.
vi.mock("next/server", () => ({ after: (fn: () => unknown) => void fn() }));

import { db } from "@/lib/db";
import { uncatalogedMaterialRouter } from "../uncataloged-material";
import { projectRouter } from "../project";
import { equipmentRouter } from "../equipment";

const anyDb = db as any;
const PM = buildUser({ orgRole: "member" });

function member(role: string | null) {
  anyDb.projectMember.findUnique.mockResolvedValue(role ? { role } : null);
}

beforeEach(() => {
  vi.resetAllMocks();
});

// ─── uncatalogedMaterial.ignore ─────────────────────────────────────────────
describe("uncatalogedMaterial.ignore (engine adoption)", () => {
  it("flips a pending entry to ignored via a CAS updateMany", async () => {
    anyDb.uncatalogedMaterial.findUnique.mockResolvedValue({
      id: "uc-1",
      status: "pending",
      organizationId: "org-1",
    });
    const caller = createCaller(uncatalogedMaterialRouter, PM);
    await caller.ignore({ id: "uc-1" });

    expect(anyDb.uncatalogedMaterial.updateMany).toHaveBeenCalledWith({
      where: { id: "uc-1", status: "pending" },
      data: expect.objectContaining({ status: "ignored" }),
    });
  });

  it("rejects discarding an already-MAPPED entry (graph rejects the edge)", async () => {
    anyDb.uncatalogedMaterial.findUnique.mockResolvedValue({
      id: "uc-1",
      status: "mapped",
      organizationId: "org-1",
    });
    const caller = createCaller(uncatalogedMaterialRouter, PM);
    await expectTRPCError(caller.ignore({ id: "uc-1" }), "BAD_REQUEST");
    expect(anyDb.uncatalogedMaterial.updateMany).not.toHaveBeenCalled();
  });
});

// ─── project.archive ────────────────────────────────────────────────────────
describe("project.archive (engine adoption)", () => {
  it("archives an active project via CAS updateMany and writes the audit log", async () => {
    member("project_manager");
    anyDb.project.findUnique.mockResolvedValue({
      id: "p-1",
      status: "active",
      name: "Tower A",
    });
    const caller = createCaller(projectRouter, PM);
    await caller.archive({ id: "p-1" });

    expect(anyDb.project.updateMany).toHaveBeenCalledWith({
      where: { id: "p-1", status: "active" },
      data: expect.objectContaining({ status: "archived" }),
    });
    expect(anyDb.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: "project.archive",
        entityType: "project",
        entityId: "p-1",
      }),
    });
  });

  it("refuses to archive an already-archived project (terminal state)", async () => {
    member("project_manager");
    anyDb.project.findUnique.mockResolvedValue({
      id: "p-1",
      status: "archived",
      name: "Tower A",
    });
    const caller = createCaller(projectRouter, PM);
    await expectTRPCError(caller.archive({ id: "p-1" }), "BAD_REQUEST");
    expect(anyDb.project.updateMany).not.toHaveBeenCalled();
  });
});

// ─── equipment.resolveMaintenance ───────────────────────────────────────────
describe("equipment.resolveMaintenance (engine adoption)", () => {
  it("resolves the work order via CAS and cascades the machine back to active", async () => {
    member("engineer");
    anyDb.equipmentMaintenance.findUnique.mockResolvedValue({
      id: "maint-1",
      status: "pending",
      equipmentId: "eq-1",
      projectId: "p-1",
      resolvedNotes: null,
      resolvedDate: null,
      resolvedBy: null,
    });
    anyDb.equipment.findUnique.mockResolvedValue({
      id: "eq-1",
      status: "breakdown",
      projectId: "p-1",
    });
    const caller = createCaller(equipmentRouter, PM);
    await caller.resolveMaintenance({
      projectId: "p-1",
      maintId: "maint-1",
      resolvedNotes: "Hydraulic line replaced",
      cost: 4500,
    });

    // Work order: CAS on the pre-read status, engine-stamped resolved fields
    const call = anyDb.equipmentMaintenance.updateMany.mock.calls[0][0];
    expect(call.where).toEqual({ id: "maint-1", status: "pending" });
    expect(call.data.status).toBe("resolved");
    expect(call.data.cost).toBe(4500);
    expect(call.data.resolvedDate).toBeInstanceOf(Date);
    expect(call.data.resolvedNotes).toBe("Hydraulic line replaced");

    // Machine: breakdown → active via the equipment graph (CAS updateMany)
    expect(anyDb.equipment.updateMany).toHaveBeenCalledWith({
      where: { id: "eq-1", status: "breakdown" },
      data: expect.objectContaining({ status: "active" }),
    });
  });

  it("skips the equipment write when the machine is already active (guarded cascade)", async () => {
    member("engineer");
    anyDb.equipmentMaintenance.findUnique.mockResolvedValue({
      id: "maint-1",
      status: "pending",
      equipmentId: "eq-1",
      projectId: "p-1",
      resolvedNotes: null,
      resolvedDate: null,
      resolvedBy: null,
    });
    anyDb.equipment.findUnique.mockResolvedValue({
      id: "eq-1",
      status: "active",
      projectId: "p-1",
    });
    const caller = createCaller(equipmentRouter, PM);
    await caller.resolveMaintenance({
      projectId: "p-1",
      maintId: "maint-1",
      resolvedNotes: "Routine service done",
      cost: 0,
    });

    expect(anyDb.equipment.updateMany).not.toHaveBeenCalled();
    expect(anyDb.equipment.update).not.toHaveBeenCalled();
  });

  it("refuses to resolve an already-resolved work order (graph rejects the edge)", async () => {
    member("engineer");
    anyDb.equipmentMaintenance.findUnique.mockResolvedValue({
      id: "maint-1",
      status: "resolved",
      equipmentId: "eq-1",
      projectId: "p-1",
      resolvedNotes: "done",
      resolvedDate: new Date(),
      resolvedBy: "someone",
    });
    const caller = createCaller(equipmentRouter, PM);
    await expectTRPCError(
      caller.resolveMaintenance({
        projectId: "p-1",
        maintId: "maint-1",
        resolvedNotes: "again",
        cost: 0,
      }),
      "BAD_REQUEST",
    );
    expect(anyDb.equipmentMaintenance.updateMany).not.toHaveBeenCalled();
  });
});
