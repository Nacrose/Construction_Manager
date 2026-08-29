/**
 * Router-layer tests for boq (Bill of Quantities).
 *
 * Pins:
 *   - Locks: project-level boqLocked and per-item locked both block
 *     create/update/delete
 *   - Duplicate BOQ codes within a project CONFLICT (create + rename)
 *   - amount = quantity × rate, recomputed on update
 *   - Workspace Rule 4 (BOQ rate vs RA rate independence): a quantity
 *     change alone NEVER recomputes the BOQ rate unless the item still
 *     uses legacy direct ingredients
 *   - create is atomic with its auto-created rate analyses
 *   - reorder rejects items that belong to another project
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { buildUser, createCaller, expectTRPCError } from "./test-utils";

vi.mock("@/lib/db", async () => {
  const { buildDbMock } = await import("./test-utils");
  const db = buildDbMock();
  return { db, getFreshDb: () => db };
});

import { db } from "@/lib/db";
import { boqRouter } from "../boq";

const anyDb = db as any;
const ENGINEER = buildUser();

function member(role: string | null) {
  anyDb.projectMember.findUnique.mockResolvedValue(role ? { role } : null);
}

function unlockedProject() {
  anyDb.project.findUnique.mockResolvedValue({ boqLocked: false });
}

const baseItem = {
  id: "bi-1",
  projectId: "p-1",
  code: "A.1",
  quantity: 10,
  rate: 75,
  locked: false,
};

beforeEach(() => {
  vi.resetAllMocks();
  // default: aggregate returns a usable _max so sortOrder auto-assign works
  anyDb.boqItem.aggregate.mockResolvedValue({ _max: { sortOrder: 5 } });
});

// ─── create ─────────────────────────────────────────────────────────────────
describe("boq.create", () => {
  const createInput = {
    projectId: "p-1",
    code: "A.1",
    description: "PCC 1:2:4 in foundation",
    unit: "cum",
    quantity: 10,
    rate: 75,
  };

  it("FORBIDDENs read-only roles", async () => {
    member("client");
    unlockedProject();
    const caller = createCaller(boqRouter, ENGINEER);
    await expectTRPCError(caller.create(createInput), "FORBIDDEN");
    expect(anyDb.boqItem.create).not.toHaveBeenCalled();
  });

  it("FORBIDDENs when the project BOQ is locked", async () => {
    member("engineer");
    anyDb.project.findUnique.mockResolvedValue({ boqLocked: true });
    const caller = createCaller(boqRouter, ENGINEER);
    await expectTRPCError(caller.create(createInput), "FORBIDDEN");
    expect(anyDb.boqItem.create).not.toHaveBeenCalled();
  });

  it("CONFLICTs on a duplicate code within the project", async () => {
    member("engineer");
    unlockedProject();
    anyDb.boqItem.findUnique.mockResolvedValue({ id: "bi-existing" });
    const caller = createCaller(boqRouter, ENGINEER);
    await expectTRPCError(caller.create(createInput), "CONFLICT");
    expect(anyDb.boqItem.create).not.toHaveBeenCalled();
  });

  it("stores amount = quantity × rate and auto-assigns sortOrder", async () => {
    member("engineer");
    unlockedProject();
    const caller = createCaller(boqRouter, ENGINEER);
    await caller.create(createInput);

    const data = anyDb.boqItem.create.mock.calls[0][0].data;
    expect(data.amount).toBe(750);
    expect(data.sortOrder).toBe(6); // max 5 + 1
  });

  it("creates one rate analysis per library inside the SAME transaction", async () => {
    member("engineer");
    unlockedProject();
    anyDb.analysisLibrary.findMany.mockResolvedValue([
      { id: "lib-1", name: "Standard Mix", isDefault: true },
      { id: "lib-2", name: "Alternative Mix", isDefault: false },
    ]);
    anyDb.boqItem.create.mockResolvedValue({ id: "bi-1", code: "A.1" });

    const caller = createCaller(boqRouter, ENGINEER);
    await caller.create(createInput);

    expect(anyDb.rateAnalysis.create).toHaveBeenCalledTimes(2);
    expect(anyDb.rateAnalysis.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          boqItemId: "bi-1",
          libraryId: "lib-1",
          name: "Standard Mix",
          batchSize: 1,
          isDefault: true,
        }),
      }),
    );
  });
});

// ─── update ─────────────────────────────────────────────────────────────────
describe("boq.update", () => {
  it("FORBIDDENs individually locked items", async () => {
    anyDb.boqItem.findUnique.mockResolvedValue({ ...baseItem, locked: true });
    member("engineer");
    unlockedProject();
    const caller = createCaller(boqRouter, ENGINEER);
    await expectTRPCError(
      caller.update({ itemId: "bi-1", quantity: 20 }),
      "FORBIDDEN",
    );
    expect(anyDb.boqItem.update).not.toHaveBeenCalled();
  });

  it("CONFLICTs when renaming to a code owned by another item", async () => {
    anyDb.boqItem.findUnique.mockImplementation(async ({ where }) => {
      if (where.id) return { ...baseItem };
      if (where.projectId_code) return { id: "bi-2" }; // someone else owns A.2
      return null;
    });
    member("engineer");
    unlockedProject();
    const caller = createCaller(boqRouter, ENGINEER);
    await expectTRPCError(
      caller.update({ itemId: "bi-1", code: "A.2" }),
      "CONFLICT",
    );
    expect(anyDb.boqItem.update).not.toHaveBeenCalled();
  });

  it("recomputes amount = quantity × rate on explicit edits", async () => {
    anyDb.boqItem.findUnique.mockResolvedValue({ ...baseItem });
    member("engineer");
    unlockedProject();
    const caller = createCaller(boqRouter, ENGINEER);
    await caller.update({ itemId: "bi-1", quantity: 20, rate: 50 });

    const data = anyDb.boqItem.update.mock.calls[0][0].data;
    expect(data.amount).toBe(1000);
  });

  it("Rule 4: quantity-only change NEVER recomputes the BOQ rate for RA-based items", async () => {
    anyDb.boqItem.findUnique.mockImplementation(async ({ where }) => {
      if (where.id && where.select && "locked" in where.select) {
        return { ...baseItem };
      }
      if (where.id) return { ...baseItem, ingredients: [] };
      return null;
    });
    // no LEGACY direct ingredients → recalc must not fire
    anyDb.boqIngredient.count.mockResolvedValue(0);
    member("engineer");
    unlockedProject();

    const caller = createCaller(boqRouter, ENGINEER);
    await caller.update({ itemId: "bi-1", quantity: 20 });

    // legacy-direct-ingredient detection ran …
    expect(anyDb.boqIngredient.count).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { boqItemId: "bi-1", rateAnalysisId: null },
      }),
    );
    // … found none, so the contract rate 75 is preserved and only the
    // amount is recomputed (20 × 75)
    const data = anyDb.boqItem.update.mock.calls[0][0].data;
    expect(data.amount).toBe(1500);
    expect(data.rate).toBeUndefined();
    // no second rate-overwriting update
    expect(anyDb.boqItem.update).toHaveBeenCalledTimes(1);
  });
});

// ─── delete ─────────────────────────────────────────────────────────────────
describe("boq.delete", () => {
  it("FORBIDDENs locked items", async () => {
    anyDb.boqItem.findUnique.mockResolvedValue({ ...baseItem, locked: true });
    member("engineer");
    unlockedProject();
    const caller = createCaller(boqRouter, ENGINEER);
    await expectTRPCError(caller.delete({ itemId: "bi-1" }), "FORBIDDEN");
    expect(anyDb.boqItem.delete).not.toHaveBeenCalled();
  });

  it("deletes unlocked items", async () => {
    anyDb.boqItem.findUnique.mockResolvedValue({ ...baseItem });
    member("engineer");
    unlockedProject();
    const caller = createCaller(boqRouter, ENGINEER);
    const res = await caller.delete({ itemId: "bi-1" });
    expect(res.ok).toBe(true);
    expect(anyDb.boqItem.delete).toHaveBeenCalledWith({
      where: { id: "bi-1" },
    });
  });
});

// ─── lockItem ───────────────────────────────────────────────────────────────
describe("boq.lockItem", () => {
  it("toggles the per-item lock for write roles", async () => {
    anyDb.boqItem.findUnique.mockResolvedValue({ ...baseItem });
    member("engineer");
    const caller = createCaller(boqRouter, ENGINEER);
    await caller.lockItem({ itemId: "bi-1", locked: true });
    expect(anyDb.boqItem.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "bi-1" },
        data: { locked: true },
      }),
    );
  });

  it("FORBIDDENs read-only roles", async () => {
    anyDb.boqItem.findUnique.mockResolvedValue({ ...baseItem });
    member("client");
    const caller = createCaller(boqRouter, ENGINEER);
    await expectTRPCError(
      caller.lockItem({ itemId: "bi-1", locked: true }),
      "FORBIDDEN",
    );
    expect(anyDb.boqItem.update).not.toHaveBeenCalled();
  });
});

// ─── reorder ────────────────────────────────────────────────────────────────
describe("boq.reorder", () => {
  it("BAD_REQUESTs when an item does not belong to the project", async () => {
    member("engineer");
    unlockedProject();
    anyDb.boqItem.findMany.mockResolvedValue([{ id: "bi-1" }]); // bi-2 missing
    const caller = createCaller(boqRouter, ENGINEER);
    await expectTRPCError(
      caller.reorder({
        projectId: "p-1",
        items: [
          { id: "bi-1", sortOrder: 0 },
          { id: "bi-2", sortOrder: 1 },
        ],
      }),
      "BAD_REQUEST",
    );
    expect(anyDb.$transaction).not.toHaveBeenCalled();
  });

  it("reorders owned items in one transaction", async () => {
    member("engineer");
    unlockedProject();
    anyDb.boqItem.findMany.mockResolvedValue([{ id: "bi-1" }, { id: "bi-2" }]);
    const caller = createCaller(boqRouter, ENGINEER);
    const res = await caller.reorder({
      projectId: "p-1",
      items: [
        { id: "bi-1", sortOrder: 2 },
        { id: "bi-2", sortOrder: 1 },
      ],
    });
    expect(res.ok).toBe(true);
    expect(anyDb.$transaction).toHaveBeenCalledTimes(1);
    expect(anyDb.boqItem.update).toHaveBeenCalledTimes(2);
  });
});
