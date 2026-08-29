/**
 * Router-layer tests for rate-analysis (RA engine).
 *
 * Pins:
 *   - IDOR: every procedure resolves the BOQ item FIRST and asserts project
 *     membership before touching data
 *   - Cross-item guards: an analysis/ingredient owned by a different BOQ
 *     item is NOT_FOUND (no cross-item mutation by cuid)
 *   - Fixed-mode ingredient amount = (qty + qty×wastage%/100) × rate
 *   - Percentage-mode ingredients store amount 0 at create (computed later
 *     by recalc)
 *   - copyIngredients is a replace-operation: target rows deleted before
 *     the source rows are bulk-inserted, all in one transaction
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { buildUser, createCaller, expectTRPCError } from "./test-utils";

vi.mock("@/lib/db", async () => {
  const { buildDbMock } = await import("./test-utils");
  const db = buildDbMock();
  return { db, getFreshDb: () => db };
});

import { db } from "@/lib/db";
import { rateAnalysisRouter } from "../rate-analysis";

const anyDb = db as any;
const ENGINEER = buildUser();

function member(role: string | null) {
  anyDb.projectMember.findUnique.mockResolvedValue(role ? { role } : null);
}

/** The BOQ item every scenario hangs off. */
function primeItem() {
  anyDb.boqItem.findUnique.mockImplementation(async (args: any) => ({
    id: "bi-1",
    projectId: "p-1",
    code: "A.1",
    quantity: 10,
    // recalcItemRate fetches with `include: { ingredients }` — feed it an
    // empty list so the recalc is a no-op unless a test says otherwise.
    ...(args?.include ? { ingredients: [] } : {}),
  }));
}

beforeEach(() => {
  vi.resetAllMocks();
});

// ─── access control ─────────────────────────────────────────────────────────
describe("rateAnalysis.list", () => {
  it("FORBIDDENs users who cannot see the item's project (IDOR via itemId)", async () => {
    primeItem();
    member(null);
    const caller = createCaller(rateAnalysisRouter, ENGINEER);
    await expectTRPCError(caller.list({ itemId: "bi-1" }), "FORBIDDEN");
    expect(anyDb.rateAnalysis.findMany).not.toHaveBeenCalled();
  });

  it("returns item + its analyses for project members", async () => {
    primeItem();
    member("engineer");
    anyDb.rateAnalysis.findMany.mockResolvedValue([
      { id: "ra-1", name: "Standard Mix", ingredients: [] },
    ]);
    const caller = createCaller(rateAnalysisRouter, ENGINEER);
    const res = await caller.list({ itemId: "bi-1" });
    expect(res.item.id).toBe("bi-1");
    expect(res.analyses).toHaveLength(1);
  });
});

describe("rateAnalysis.create", () => {
  it("FORBIDDENs read-only roles", async () => {
    primeItem();
    member("client");
    const caller = createCaller(rateAnalysisRouter, ENGINEER);
    await expectTRPCError(
      caller.create({ itemId: "bi-1", name: "Mix B", batchSize: 1 }),
      "FORBIDDEN",
    );
    expect(anyDb.rateAnalysis.create).not.toHaveBeenCalled();
  });

  it("unsets other defaults before creating a default analysis", async () => {
    primeItem();
    member("engineer");
    const caller = createCaller(rateAnalysisRouter, ENGINEER);
    await caller.create({ itemId: "bi-1", name: "Mix B", batchSize: 2, isDefault: true });

    expect(anyDb.rateAnalysis.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { boqItemId: "bi-1", isDefault: true },
        data: { isDefault: false },
      }),
    );
    const data = anyDb.rateAnalysis.create.mock.calls[0][0].data;
    expect(data).toMatchObject({ boqItemId: "bi-1", name: "Mix B", batchSize: 2, isDefault: true });
  });
});

// ─── cross-item guards ──────────────────────────────────────────────────────
describe("cross-item guards", () => {
  it("update: analysis owned by another item → NOT_FOUND", async () => {
    primeItem();
    member("engineer");
    anyDb.rateAnalysis.findUnique.mockResolvedValue({ boqItemId: "bi-OTHER" });
    const caller = createCaller(rateAnalysisRouter, ENGINEER);
    await expectTRPCError(
      caller.update({ itemId: "bi-1", analysisId: "ra-1", name: "X" }),
      "NOT_FOUND",
    );
    expect(anyDb.rateAnalysis.update).not.toHaveBeenCalled();
  });

  it("deleteAnalysis: analysis owned by another item → NOT_FOUND", async () => {
    primeItem();
    member("engineer");
    anyDb.rateAnalysis.findUnique.mockResolvedValue({ boqItemId: "bi-OTHER", name: "Mix" });
    const caller = createCaller(rateAnalysisRouter, ENGINEER);
    await expectTRPCError(
      caller.deleteAnalysis({ itemId: "bi-1", analysisId: "ra-1" }),
      "NOT_FOUND",
    );
    expect(anyDb.rateAnalysis.delete).not.toHaveBeenCalled();
  });

  it("updateIngredient: ingredient owned by another item → NOT_FOUND", async () => {
    primeItem();
    member("engineer");
    anyDb.boqIngredient.findUnique.mockResolvedValue({ boqItemId: "bi-OTHER" });
    const caller = createCaller(rateAnalysisRouter, ENGINEER);
    await expectTRPCError(
      caller.updateIngredient({ itemId: "bi-1", ingredientId: "ing-1", rate: 10 }),
      "NOT_FOUND",
    );
    expect(anyDb.boqIngredient.update).not.toHaveBeenCalled();
  });

  it("deleteIngredient: ingredient owned by another item → NOT_FOUND", async () => {
    primeItem();
    member("engineer");
    anyDb.boqIngredient.findUnique.mockResolvedValue({ boqItemId: "bi-OTHER", rateAnalysisId: null });
    const caller = createCaller(rateAnalysisRouter, ENGINEER);
    await expectTRPCError(
      caller.deleteIngredient({ itemId: "bi-1", ingredientId: "ing-1" }),
      "NOT_FOUND",
    );
    expect(anyDb.boqIngredient.delete).not.toHaveBeenCalled();
  });
});

// ─── ingredient math ────────────────────────────────────────────────────────
describe("rateAnalysis.addIngredient", () => {
  const fixedInput = {
    itemId: "bi-1",
    name: "Cement",
    type: "material" as const,
    calcMode: "fixed" as const,
    quantity: 10,
    unit: "bag",
    percentage: 5, // wastage
    rate: 100,
  };

  it("computes fixed-mode amount = (qty + qty×pct/100) × rate", async () => {
    primeItem();
    member("engineer");
    const caller = createCaller(rateAnalysisRouter, ENGINEER);
    await caller.addIngredient(fixedInput);

    const data = anyDb.boqIngredient.create.mock.calls[0][0].data;
    expect(data.amount).toBe(1050); // (10 + 0.5) × 100
    expect(data.calcMode).toBe("fixed");
  });

  it("stores percentage-mode ingredients with amount 0 (recalc computes later)", async () => {
    primeItem();
    member("engineer");
    const caller = createCaller(rateAnalysisRouter, ENGINEER);
    await caller.addIngredient({
      ...fixedInput,
      calcMode: "percentage",
      percentage: 10,
      pctBase: "material",
      rate: 0,
    });
    const data = anyDb.boqIngredient.create.mock.calls[0][0].data;
    expect(data.amount).toBe(0);
    expect(data.pctBase).toBe("material");
  });

  it("auto-fills name/unit from a linked project resource", async () => {
    primeItem();
    member("engineer");
    anyDb.material.findUnique.mockResolvedValue({
      id: "mat-1",
      name: "OPC Cement",
      unit: "bag",
      catalogMaterialId: "cat-9",
    });
    const caller = createCaller(rateAnalysisRouter, ENGINEER);
    await caller.addIngredient({ ...fixedInput, materialId: "mat-1" });

    const data = anyDb.boqIngredient.create.mock.calls[0][0].data;
    expect(data.name).toBe("OPC Cement"); // resource name wins
    expect(data.unit).toBe("bag");
    expect(data.catalogMaterialId).toBe("cat-9"); // inherited from resource
    expect(data.materialId).toBe("mat-1");
  });
});

describe("rateAnalysis.updateIngredient", () => {
  it("recomputes fixed-mode amount with the new rate", async () => {
    primeItem();
    member("engineer");
    anyDb.boqIngredient.findUnique.mockResolvedValue({
      boqItemId: "bi-1",
      quantity: 10,
      rate: 100,
      percentage: 5,
      calcMode: "fixed",
      amount: 1050,
      rateAnalysisId: null,
    });
    const caller = createCaller(rateAnalysisRouter, ENGINEER);
    await caller.updateIngredient({ itemId: "bi-1", ingredientId: "ing-1", rate: 200 });

    const data = anyDb.boqIngredient.update.mock.calls[0][0].data;
    expect(data.amount).toBe(2100); // (10 + 0.5) × 200
    expect(data.rate).toBe(200);
  });
});

// ─── copyIngredients ────────────────────────────────────────────────────────
describe("rateAnalysis.copyIngredients", () => {
  function primeAnalyses() {
    anyDb.rateAnalysis.findUnique.mockImplementation(async ({ where }: any) => {
      if (where.id === "ra-src") return { id: "ra-src", boqItemId: "bi-1" };
      if (where.id === "ra-tgt") {
        return { id: "ra-tgt", boqItemId: "bi-1", ingredients: [], isDefault: false, batchSize: 1 };
      }
      return null;
    });
  }

  it("is a no-op when source and target are the same analysis", async () => {
    primeItem();
    member("engineer");
    const caller = createCaller(rateAnalysisRouter, ENGINEER);
    const res = await caller.copyIngredients({
      itemId: "bi-1",
      sourceAnalysisId: "ra-1",
      targetAnalysisId: "ra-1",
    });
    expect(res.copiedCount).toBe(0);
    expect(anyDb.$transaction).not.toHaveBeenCalled();
  });

  it("NOT_FOUNDs when source or target analysis is missing", async () => {
    primeItem();
    member("engineer");
    const caller = createCaller(rateAnalysisRouter, ENGINEER);
    await expectTRPCError(
      caller.copyIngredients({
        itemId: "bi-1",
        sourceAnalysisId: "ra-src",
        targetAnalysisId: "ra-tgt",
      }),
      "NOT_FOUND",
    );
    expect(anyDb.boqIngredient.createMany).not.toHaveBeenCalled();
  });

  it("replaces target ingredients with the source rows atomically", async () => {
    primeItem();
    member("engineer");
    primeAnalyses();
    anyDb.boqIngredient.findMany.mockResolvedValue([
      {
        id: "ing-1",
        name: "Cement",
        type: "material",
        calcMode: "fixed",
        quantity: 4,
        unit: "bag",
        percentage: 0,
        pctBase: "",
        rate: 800,
        amount: 3200,
        sortOrder: 1,
        materialId: "mat-1",
        catalogMaterialId: "cat-1",
      },
      {
        id: "ing-2",
        name: "Mason",
        type: "labor",
        calcMode: "fixed",
        quantity: 2,
        unit: "day",
        percentage: 0,
        pctBase: "",
        rate: 1200,
        amount: 2400,
        sortOrder: 2,
        materialId: null,
        catalogMaterialId: null,
      },
    ]);

    const caller = createCaller(rateAnalysisRouter, ENGINEER);
    const res = await caller.copyIngredients({
      itemId: "bi-1",
      sourceAnalysisId: "ra-src",
      targetAnalysisId: "ra-tgt",
    });

    expect(res.copiedCount).toBe(2);

    // target cleared BEFORE the copy lands (replace semantics)
    const deleteOrder = anyDb.boqIngredient.deleteMany.mock.invocationCallOrder[0];
    const createOrder = anyDb.boqIngredient.createMany.mock.invocationCallOrder[0];
    expect(deleteOrder).toBeLessThan(createOrder);

    expect(anyDb.boqIngredient.deleteMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { rateAnalysisId: "ra-tgt" } }),
    );
    const createData = anyDb.boqIngredient.createMany.mock.calls[0][0].data;
    expect(createData).toHaveLength(2);
    expect(createData[0]).toMatchObject({
      boqItemId: "bi-1",
      rateAnalysisId: "ra-tgt",
      name: "Cement",
      rate: 800,
      amount: 3200,
      materialId: "mat-1",
    });
    expect(createData[1]).toMatchObject({ name: "Mason", rate: 1200 });
  });
});
