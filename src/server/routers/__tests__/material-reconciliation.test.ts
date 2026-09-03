/**
 * Router-layer tests for material-reconciliation.ts.
 *
 * Pins:
 *   - getRequirements: planned demand = Σ boqQty × ingredientDosage keyed by
 *     ingredient NAME, category fallback for sub-category materials,
 *     remainingToProcure clamped at 0, only "issue" txns count as issued,
 *     default-library ingredient filter (libraryId vs client_estimate
 *     purpose fallback)
 *   - lowStock: critical vs warning urgency, shortfall math, project-scoped
 *     where clause comparing currentStock to the reorderLevel FIELD
 *   - reconciliation: opening = closing − receives − adjustments + issues
 *     (transfers are store-level moves and never change project stock —
 *     regression: they used to inflate opening and double-count in
 *     expectedClosing; prior-period transactions used to corrupt opening
 *     with their net movement, fabricating variance), date-window transforms
 *     (YYYY-MM-DD → start/end of day), summary aggregation
 *   - physicalCount: adjustment txn with |difference| at rate 0, stock reset
 *     to the counted qty, no-op when the count matches, zod min(0),
 *     cross-project material NOT_FOUND, non-member FORBIDDEN, and the
 *     fiscal-year lock (regression: this wrote a MaterialTransaction with no
 *     assertNotLocked while createTransaction enforces it)
 *   - getYieldReconciliation: batched vs payable variance, variancePct
 *     rounding, ingredient explosion (batchedUsed / payableUsed /
 *     wastageUsed / wastageCost), explicit payableQty = 0 is 100% wastage
 *     (regression: `||` fallback re-rated explicit zeros to actualQty and
 *     hid wastage), report status filter, date + boqItemId filters,
 *     multi-row aggregation, unlinked rows
 *   - stockAlerts: avgDailyConsumption = totalIssued/30, daysUntilStockout,
 *     urgency classification + sort, summary counts, OR where clause
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { buildUser, createCaller, expectTRPCError } from "./test-utils";

vi.mock("@/lib/db", async () => {
  const { buildDbMock } = await import("./test-utils");
  const db = buildDbMock();
  return { db, getFreshDb: () => db };
});

import { db } from "@/lib/db";
import { materialReconciliationProcedures } from "../material-reconciliation";
import { router } from "@/server/trpc";

const materialReconRouter = router(materialReconciliationProcedures);

const anyDb = db as any;
const USER = buildUser();

function member(role: string | null) {
  anyDb.projectMember.findUnique.mockResolvedValue(role ? { role } : null);
}

// Prisma field references (db.material.fields.*) are opaque to the mock —
// install sentinels so where-clauses referencing them can be asserted.
const REORDER_FIELD = { __field: "Material.reorderLevel" };
const MIN_STOCK_FIELD = { __field: "Material.minStock" };

beforeEach(() => {
  vi.resetAllMocks();
  anyDb.material.fields = { reorderLevel: REORDER_FIELD, minStock: MIN_STOCK_FIELD };
});

// ─── getRequirements ────────────────────────────────────────────────────────
describe("materialReconciliation.getRequirements", () => {
  function setup(boqItems: any[], issueTxns: any[] = []) {
    anyDb.material.findMany.mockResolvedValue([
      { id: "m-1", name: "Cement", unit: "bags", currentStock: 50, category: null },
    ]);
    anyDb.boqItem.findMany.mockResolvedValue(boqItems);
    anyDb.materialTransaction.findMany.mockResolvedValue(issueTxns);
  }

  it("computes planned demand as Σ boqQty × ingredient dosage, matched by name", async () => {
    member("engineer");
    setup(
      [
        { id: "b-1", quantity: 100, ingredients: [{ name: "cement", quantity: 2 }] },
        { id: "b-2", quantity: 50, ingredients: [{ name: "Cement ", quantity: 2 }] },
      ],
      [{ materialId: "m-1", quantity: 50 }],
    );
    const caller = createCaller(materialReconRouter, USER);
    const res = await caller.getRequirements({ projectId: "p-1" });

    const cement = res.requirements.find((r: any) => r.materialId === "m-1")!;
    expect(cement.plannedQty).toBe(300); // 100×2 + 50×2 (name matching is case/trim insensitive)
    expect(cement.issuedQty).toBe(50);
    expect(cement.remainingToProcure).toBe(250);
  });

  it("falls back to the parent category when the material is a sub-category item", async () => {
    member("engineer");
    anyDb.material.findMany.mockResolvedValue([
      { id: "m-1", name: "Rebar 12mm", unit: "no", currentStock: 10, category: "Rebar" },
    ]);
    anyDb.boqItem.findMany.mockResolvedValue([
      { id: "b-1", quantity: 100, ingredients: [{ name: "Rebar", quantity: 1 }] },
    ]);
    anyDb.materialTransaction.findMany.mockResolvedValue([]);

    const caller = createCaller(materialReconRouter, USER);
    const res = await caller.getRequirements({ projectId: "p-1" });
    expect(res.requirements[0].plannedQty).toBe(100);
  });

  it("clamps remainingToProcure at 0 when more was issued than planned", async () => {
    member("engineer");
    setup(
      [{ id: "b-1", quantity: 100, ingredients: [{ name: "cement", quantity: 2 }] }],
      [{ materialId: "m-1", quantity: 250 }],
    );
    const caller = createCaller(materialReconRouter, USER);
    const res = await caller.getRequirements({ projectId: "p-1" });
    expect(res.requirements[0].remainingToProcure).toBe(0);
  });

  it("counts only issue transactions, scoped to the project", async () => {
    member("engineer");
    setup([]);
    const caller = createCaller(materialReconRouter, USER);
    await caller.getRequirements({ projectId: "p-1" });

    expect(anyDb.materialTransaction.findMany).toHaveBeenCalledWith({
      where: { projectId: "p-1", type: "issue" },
      take: 1000, // bounded (pagination sweep)
    });
    expect(anyDb.material.findMany.mock.calls[0][0].where).toEqual({ projectId: "p-1" });
    expect(anyDb.boqItem.findMany.mock.calls[0][0].where).toEqual({ projectId: "p-1" });
  });

  it("filters ingredients by the project's default library when one exists", async () => {
    member("engineer");
    setup([]);
    anyDb.analysisLibrary.findMany.mockResolvedValue([
      { id: "lib-1", name: "Client's Estimate", purpose: "client_estimate", isDefault: true },
    ]);
    const caller = createCaller(materialReconRouter, USER);
    await caller.getRequirements({ projectId: "p-1" });
    expect(anyDb.boqItem.findMany.mock.calls[0][0].include.ingredients.where).toEqual({
      type: "material",
      rateAnalysis: { libraryId: "lib-1" },
    });
  });

  it("falls back to client_estimate purpose when the project has no library", async () => {
    member("engineer");
    setup([]);
    anyDb.analysisLibrary.findMany.mockResolvedValue([]);
    const caller = createCaller(materialReconRouter, USER);
    await caller.getRequirements({ projectId: "p-1" });
    expect(anyDb.boqItem.findMany.mock.calls[0][0].include.ingredients.where).toEqual({
      type: "material",
      rateAnalysis: { library: { purpose: "client_estimate" } },
    });
  });

  it("FORBIDDENs non-members", async () => {
    member(null);
    const caller = createCaller(materialReconRouter, USER);
    await expectTRPCError(
      caller.getRequirements({ projectId: "p-1" }),
      "FORBIDDEN",
    );
  });
});

// ─── lowStock ───────────────────────────────────────────────────────────────
describe("materialReconciliation.lowStock", () => {
  it("flags critical (≤ minStock) and warning (≤ reorderLevel) with shortfall", async () => {
    member("engineer");
    anyDb.material.findMany.mockResolvedValue([
      { id: "m-1", name: "Cement", code: "C-1", unit: "bags", currentStock: 5, reorderLevel: 30, minStock: 10 },
      { id: "m-2", name: "Sand", code: "S-1", unit: "cum", currentStock: 20, reorderLevel: 30, minStock: 0 },
    ]);
    const caller = createCaller(materialReconRouter, USER);
    const res = await caller.lowStock({ projectId: "p-1" });

    expect(res.materials[0]).toEqual(
      expect.objectContaining({ id: "m-1", urgency: "critical", shortfall: 25 }),
    );
    expect(res.materials[1]).toEqual(
      expect.objectContaining({ id: "m-2", urgency: "warning", shortfall: 10 }),
    );
  });

  it("queries stock at/below the reorderLevel field within the project", async () => {
    member("engineer");
    anyDb.material.findMany.mockResolvedValue([]);
    const caller = createCaller(materialReconRouter, USER);
    await caller.lowStock({ projectId: "p-1" });

    const where = anyDb.material.findMany.mock.calls[0][0].where;
    expect(where.projectId).toBe("p-1");
    expect(where.reorderLevel).toEqual({ gt: 0 });
    expect(where.currentStock).toEqual({ lte: REORDER_FIELD });
  });

  it("FORBIDDENs non-members", async () => {
    member(null);
    const caller = createCaller(materialReconRouter, USER);
    await expectTRPCError(caller.lowStock({ projectId: "p-1" }), "FORBIDDEN");
  });
});

// ─── reconciliation ─────────────────────────────────────────────────────────
describe("materialReconciliation.reconciliation", () => {
  function material(overrides: Record<string, unknown> = {}) {
    return {
      id: "m-1",
      name: "Cement",
      code: "C-1",
      unit: "bags",
      currentStock: 120,
      minStock: 10,
      reorderLevel: 30,
      ...overrides,
    };
  }

  it("derives opening stock and expected closing from the period's movements", async () => {
    member("engineer");
    anyDb.material.findMany.mockResolvedValue([material()]);
    anyDb.materialTransaction.findMany.mockResolvedValue([
      { materialId: "m-1", type: "receive", quantity: 50, date: new Date("2026-08-05") },
      { materialId: "m-1", type: "issue", quantity: 30, date: new Date("2026-08-10") },
    ]);

    const caller = createCaller(materialReconRouter, USER);
    const res = await caller.reconciliation({
      projectId: "p-1",
      startDate: "2026-08-01",
      endDate: "2026-08-31",
    });

    const row = res.materials[0];
    expect(row.opening).toBe(100); // 120 closing − 50 received + 30 issued
    expect(row.received).toBe(50);
    expect(row.issued).toBe(30);
    expect(row.expectedClosing).toBe(120);
    expect(row.actualClosing).toBe(120);
    expect(row.variance).toBe(0);
    expect(row.variancePct).toBe(0);
    expect(res.summary).toEqual({
      totalReceived: 50,
      totalIssued: 30,
      totalVariance: 0,
      materialsWithVariance: 0,
    });
  });

  it("counts adjustments as stock increases in expectedClosing", async () => {
    member("engineer");
    anyDb.material.findMany.mockResolvedValue([material({ currentStock: 90 })]);
    anyDb.materialTransaction.findMany.mockResolvedValue([
      { materialId: "m-1", type: "adjustment", quantity: 10, date: new Date("2026-08-05") },
      { materialId: "m-1", type: "issue", quantity: 20, date: new Date("2026-08-10") },
    ]);

    const caller = createCaller(materialReconRouter, USER);
    const res = await caller.reconciliation({
      projectId: "p-1",
      startDate: "2026-08-01",
      endDate: "2026-08-31",
    });

    expect(res.materials[0].opening).toBe(100); // 90 − 10 + 20
    expect(res.materials[0].expectedClosing).toBe(90); // 100 + 10 − 20
    expect(res.materials[0].variance).toBe(0);
  });

  it("reports variance when the book stock disagrees with the ledger (clamped opening)", async () => {
    member("engineer");
    // Book stock says 5, but the ledger shows a +50 receive and −30 issue
    // inside the window: the implied opening would be negative, so it is
    // clamped to 0 and the expected closing (20) exposes the 15-unit loss.
    anyDb.material.findMany.mockResolvedValue([material({ currentStock: 5 })]);
    anyDb.materialTransaction.findMany.mockResolvedValue([
      { materialId: "m-1", type: "receive", quantity: 50 },
      { materialId: "m-1", type: "issue", quantity: 30 },
    ]);

    const caller = createCaller(materialReconRouter, USER);
    const res = await caller.reconciliation({
      projectId: "p-1",
      startDate: "2026-08-01",
      endDate: "2026-08-31",
    });

    expect(res.materials[0].opening).toBe(0); // max(0, 5 − 50 + 30)
    expect(res.materials[0].expectedClosing).toBe(20); // 0 + 50 − 30
    expect(res.materials[0].variance).toBe(-15); // 5 − 20
    expect(res.materials[0].variancePct).toBe(-75); // Math.round(-15/20 × 100)
    expect(res.summary.totalVariance).toBe(-15);
    expect(res.summary.materialsWithVariance).toBe(1);
  });

  /**
   * REGRESSION: prior-period transactions were APPLIED (not reversed) onto
   * the opening stock, so opening became stockAtStart + netPriorMovement and
   * every historical period reported a fabricated variance equal to −net
   * prior movement. Opening must be the stock at startDate, full stop.
   */
  it("does not let prior-period transactions corrupt the opening stock", async () => {
    member("engineer");
    anyDb.material.findMany.mockResolvedValue([material({ currentStock: 100 })]);
    anyDb.materialTransaction.findMany.mockImplementation(async ({ where }: any) => {
      if (where.date?.lt) {
        // prior-period query (date < startDate): a 100-bag receive last month
        return [{ materialId: "m-1", type: "receive", quantity: 100 }];
      }
      return []; // in-period: no movement
    });

    const caller = createCaller(materialReconRouter, USER);
    const res = await caller.reconciliation({
      projectId: "p-1",
      startDate: "2026-08-01",
      endDate: "2026-08-31",
    });

    expect(res.materials[0].opening).toBe(100);
    expect(res.materials[0].expectedClosing).toBe(100);
    expect(res.materials[0].variance).toBe(0);
  });

  /**
   * REGRESSION: transfers are store-to-store moves — the stock engine keeps
   * project-level stock UNCHANGED (material-transaction delta = 0). The
   * report used to un-apply them into opening AND subtract them from
   * expectedClosing; the displayed opening was inflated by transfersOut.
   */
  it("treats transfers as project-stock-neutral (informational only)", async () => {
    member("engineer");
    anyDb.material.findMany.mockResolvedValue([material({ currentStock: 120 })]);
    anyDb.materialTransaction.findMany.mockResolvedValue([
      { materialId: "m-1", type: "receive", quantity: 50 },
      { materialId: "m-1", type: "issue", quantity: 30 },
      { materialId: "m-1", type: "transfer", quantity: 20 },
    ]);

    const caller = createCaller(materialReconRouter, USER);
    const res = await caller.reconciliation({
      projectId: "p-1",
      startDate: "2026-08-01",
      endDate: "2026-08-31",
    });

    const row = res.materials[0];
    expect(row.opening).toBe(100); // not 120 — transfers never moved project stock
    expect(row.transfersOut).toBe(20); // still reported for information
    expect(row.expectedClosing).toBe(120);
    expect(row.variance).toBe(0);
  });

  it("expands YYYY-MM-DD dates to start/end of day in the transaction window", async () => {
    member("engineer");
    anyDb.material.findMany.mockResolvedValue([material()]);
    anyDb.materialTransaction.findMany.mockResolvedValue([]);

    const caller = createCaller(materialReconRouter, USER);
    await caller.reconciliation({
      projectId: "p-1",
      startDate: "2026-08-01",
      endDate: "2026-08-31",
    });

    const where = anyDb.materialTransaction.findMany.mock.calls[0][0].where;
    expect(where.projectId).toBe("p-1");
    expect(where.date.gte).toEqual(new Date("2026-08-01T00:00:00.000Z"));
    expect(where.date.lte).toEqual(new Date("2026-08-31T23:59:59.999Z"));
  });

  it("returns a zeroed summary for a project with no materials", async () => {
    member("engineer");
    anyDb.material.findMany.mockResolvedValue([]);
    const caller = createCaller(materialReconRouter, USER);
    const res = await caller.reconciliation({
      projectId: "p-1",
      startDate: "2026-08-01",
      endDate: "2026-08-31",
    });
    expect(res).toEqual({
      materials: [],
      summary: { totalReceived: 0, totalIssued: 0, totalVariance: 0, materialsWithVariance: 0 },
    });
    expect(anyDb.materialTransaction.findMany).not.toHaveBeenCalled();
  });

  it("FORBIDDENs non-members", async () => {
    member(null);
    const caller = createCaller(materialReconRouter, USER);
    await expectTRPCError(
      caller.reconciliation({ projectId: "p-1", startDate: "2026-08-01", endDate: "2026-08-31" }),
      "FORBIDDEN",
    );
  });
});

// ─── physicalCount ──────────────────────────────────────────────────────────
describe("materialReconciliation.physicalCount", () => {
  function countedMaterial(overrides: Record<string, unknown> = {}) {
    return {
      id: "m-1",
      projectId: "p-1",
      name: "Cement",
      unit: "bags",
      currentStock: 100,
      ...overrides,
    };
  }

  it("writes an adjustment transaction for the shortfall and resets the stock", async () => {
    member("engineer");
    anyDb.material.findFirst.mockResolvedValue(countedMaterial());
    const caller = createCaller(materialReconRouter, USER);
    const res = await caller.physicalCount({
      projectId: "p-1",
      materialId: "m-1",
      countedQty: 90,
      notes: "rain damage",
    });

    expect(anyDb.materialTransaction.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        materialId: "m-1",
        projectId: "p-1",
        type: "adjustment",
        quantity: 10,
        unit: "bags",
        rate: 0,
        reference: "Physical Count",
        remarks: expect.stringContaining("-10.00 bags"),
        createdById: "user-1",
      }),
    });
    expect(anyDb.material.update).toHaveBeenCalledWith({
      where: { id: "m-1" },
      data: { currentStock: 90 },
    });
    expect(res.ok).toBe(true);
  });

  it("records a surplus as a positive adjustment", async () => {
    member("engineer");
    anyDb.material.findFirst.mockResolvedValue(countedMaterial());
    const caller = createCaller(materialReconRouter, USER);
    await caller.physicalCount({ projectId: "p-1", materialId: "m-1", countedQty: 110 });
    const data = anyDb.materialTransaction.create.mock.calls[0][0].data;
    expect(data.quantity).toBe(10);
    expect(data.remarks).toContain("+10.00");
    expect(anyDb.material.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { currentStock: 110 } }),
    );
  });

  it("is a no-op when the count matches the system stock", async () => {
    member("engineer");
    anyDb.material.findFirst.mockResolvedValue(countedMaterial());
    const caller = createCaller(materialReconRouter, USER);
    const res = await caller.physicalCount({ projectId: "p-1", materialId: "m-1", countedQty: 100 });
    expect(res.message).toContain("No adjustment needed");
    expect(anyDb.materialTransaction.create).not.toHaveBeenCalled();
    expect(anyDb.material.update).not.toHaveBeenCalled();
  });

  it("rejects negative counted quantities (zod min(0))", async () => {
    member("engineer");
    const caller = createCaller(materialReconRouter, USER);
    await expectTRPCError(
      caller.physicalCount({ projectId: "p-1", materialId: "m-1", countedQty: -5 }),
      "BAD_REQUEST",
    );
    expect(anyDb.materialTransaction.create).not.toHaveBeenCalled();
  });

  it("NOT_FOUNDs a material outside the project (IDOR guard)", async () => {
    member("engineer");
    anyDb.material.findFirst.mockResolvedValue(null);
    const caller = createCaller(materialReconRouter, USER);
    await expectTRPCError(
      caller.physicalCount({ projectId: "p-1", materialId: "m-foreign", countedQty: 10 }),
      "NOT_FOUND",
    );
  });

  it("FORBIDDENs non-members", async () => {
    member(null);
    const caller = createCaller(materialReconRouter, USER);
    await expectTRPCError(
      caller.physicalCount({ projectId: "p-1", materialId: "m-1", countedQty: 10 }),
      "FORBIDDEN",
    );
    expect(anyDb.materialTransaction.create).not.toHaveBeenCalled();
  });

  /**
   * REGRESSION (fiscal-lock bypass): physicalCount writes a MaterialTransaction
   * (the same model createTransaction guards with assertNotLocked) but never
   * checked the lock — stock could be adjusted inside a locked fiscal year.
   */
  it("rejects adjustments while the fiscal year is locked, before any write", async () => {
    member("engineer");
    anyDb.material.findFirst.mockResolvedValue(countedMaterial());
    anyDb.fiscalYearLock.findFirst.mockResolvedValue({ fiscalYear: "2083-84" });
    const caller = createCaller(materialReconRouter, USER);
    await expectTRPCError(
      caller.physicalCount({ projectId: "p-1", materialId: "m-1", countedQty: 90 }),
      "FORBIDDEN",
    );
    expect(anyDb.materialTransaction.create).not.toHaveBeenCalled();
    expect(anyDb.material.update).not.toHaveBeenCalled();
    // the lock was checked for the caller's org
    expect(anyDb.fiscalYearLock.findFirst.mock.calls[0][0].where.organizationId).toBe("org-1");
    expect(anyDb.fiscalYearLock.findFirst.mock.calls[0][0].where.isLocked).toBe(true);
  });
});

// ─── getYieldReconciliation ─────────────────────────────────────────────────
describe("materialReconciliation.getYieldReconciliation", () => {
  function boqWithCement() {
    return [
      {
        id: "b-1",
        code: "1.1.1",
        description: "M20 Concrete",
        unit: "cum",
        ingredients: [
          { name: "cement", unit: "bags", quantity: 2, rate: 15 },
        ],
      },
    ];
  }

  function progressRow(overrides: Record<string, unknown> = {}) {
    return {
      boqItemId: "b-1",
      boqCode: "1.1.1",
      boqDesc: "M20 Concrete",
      unit: "cum",
      plannedQty: 100,
      actualQty: 0,
      batchedQty: 110,
      payableQty: 100,
      report: { id: "r-1", number: "DR-001", reportDate: new Date("2026-08-01") },
      ...overrides,
    };
  }

  it("computes batched-vs-payable variance and explodes ingredients into wastage cost", async () => {
    member("engineer");
    anyDb.boqItem.findMany.mockResolvedValue(boqWithCement());
    anyDb.dailyReportProgress.findMany.mockResolvedValue([progressRow()]);

    const caller = createCaller(materialReconRouter, USER);
    const res = await caller.getYieldReconciliation({ projectId: "p-1" });

    const item = res.items[0];
    expect(item.totalBatchedQty).toBe(110);
    expect(item.totalPayableQty).toBe(100);
    expect(item.varianceQty).toBe(10);
    expect(item.variancePct).toBe(10); // round(10/100 × 1000)/10
    expect(item.logCount).toBe(1);

    const ing = item.ingredientBreakdown[0];
    expect(ing).toEqual({
      name: "cement",
      unit: "bags",
      dosagePerUnit: 2,
      batchedUsed: 220,
      payableUsed: 200,
      wastageUsed: 20,
      rate: 15,
      wastageCost: 300,
    });
    expect(res.summary).toEqual({
      totalWorkItems: 1,
      totalBatchedAll: 110,
      totalPayableAll: 100,
      netVarianceAll: 10,
      totalWastageCostNPR: 300,
    });
  });

  /**
   * REGRESSION (zero-value re-rating): `Number(row.payableQty) || actualQty`
   * turned an explicit payableQty = 0 (nothing certified — 100% wastage, a
   * state daily-program writes) back into actualQty, hiding the entire
   * wastage. Explicit zeros must be respected; only null/undefined falls back.
   */
  it("treats an explicit payableQty of 0 as 100% wastage, not as actualQty", async () => {
    member("engineer");
    anyDb.boqItem.findMany.mockResolvedValue(boqWithCement());
    anyDb.dailyReportProgress.findMany.mockResolvedValue([
      progressRow({ batchedQty: 100, payableQty: 0, actualQty: 100 }),
    ]);

    const caller = createCaller(materialReconRouter, USER);
    const res = await caller.getYieldReconciliation({ projectId: "p-1" });

    expect(res.items[0].totalPayableQty).toBe(0);
    expect(res.items[0].varianceQty).toBe(100); // pre-fix: 0 (payable re-rated to 100)
    expect(res.items[0].ingredientBreakdown[0].wastageUsed).toBe(200); // 100 × dosage 2
    expect(res.summary.totalWastageCostNPR).toBe(3000); // 200 × rate 15
  });

  it("respects an explicit batchedQty of 0 instead of re-rating it to actualQty", async () => {
    member("engineer");
    anyDb.boqItem.findMany.mockResolvedValue(boqWithCement());
    anyDb.dailyReportProgress.findMany.mockResolvedValue([
      progressRow({ batchedQty: 0, payableQty: 0, actualQty: 50 }),
    ]);

    const caller = createCaller(materialReconRouter, USER);
    const res = await caller.getYieldReconciliation({ projectId: "p-1" });
    expect(res.items[0].totalBatchedQty).toBe(0);
    expect(res.items[0].varianceQty).toBe(0);
  });

  it("reports variancePct of 0 when nothing is payable (avoids division by zero)", async () => {
    member("engineer");
    anyDb.boqItem.findMany.mockResolvedValue(boqWithCement());
    anyDb.dailyReportProgress.findMany.mockResolvedValue([
      progressRow({ batchedQty: 50, payableQty: 0, actualQty: 0 }),
    ]);
    const caller = createCaller(materialReconRouter, USER);
    const res = await caller.getYieldReconciliation({ projectId: "p-1" });
    expect(res.items[0].variancePct).toBe(0);
  });

  it("only aggregates progress from submitted/approved/checked reports of the project", async () => {
    member("engineer");
    anyDb.boqItem.findMany.mockResolvedValue([]);
    anyDb.dailyReportProgress.findMany.mockResolvedValue([]);
    const caller = createCaller(materialReconRouter, USER);
    await caller.getYieldReconciliation({ projectId: "p-1" });

    const where = anyDb.dailyReportProgress.findMany.mock.calls[0][0].where;
    expect(where.report.projectId).toBe("p-1");
    expect(where.report.status).toEqual({ in: ["submitted", "approved", "checked"] });
  });

  it("applies the date window and boqItemId filters to the progress query", async () => {
    member("engineer");
    anyDb.boqItem.findMany.mockResolvedValue([]);
    anyDb.dailyReportProgress.findMany.mockResolvedValue([]);
    const caller = createCaller(materialReconRouter, USER);
    await caller.getYieldReconciliation({
      projectId: "p-1",
      startDate: "2026-08-01T00:00:00.000Z",
      endDate: "2026-08-31T00:00:00.000Z",
      boqItemId: "b-1",
    });

    expect(anyDb.boqItem.findMany.mock.calls[0][0].where).toEqual({
      projectId: "p-1",
      id: "b-1",
    });
    const where = anyDb.dailyReportProgress.findMany.mock.calls[0][0].where;
    expect(where.boqItemId).toBe("b-1");
    expect(where.report.reportDate).toEqual({
      gte: new Date("2026-08-01T00:00:00.000Z"),
      lte: new Date("2026-08-31T00:00:00.000Z"),
    });
  });

  it("aggregates multiple progress logs for the same work item", async () => {
    member("engineer");
    anyDb.boqItem.findMany.mockResolvedValue(boqWithCement());
    anyDb.dailyReportProgress.findMany.mockResolvedValue([
      progressRow({ batchedQty: 110, payableQty: 100, report: { number: "DR-001" } }),
      progressRow({ batchedQty: 100, payableQty: 90, report: { number: "DR-002" } }),
    ]);

    const caller = createCaller(materialReconRouter, USER);
    const res = await caller.getYieldReconciliation({ projectId: "p-1" });

    const item = res.items[0];
    expect(item.totalBatchedQty).toBe(210);
    expect(item.totalPayableQty).toBe(190);
    expect(item.varianceQty).toBe(20);
    expect(item.variancePct).toBe(10.5);
    expect(item.logCount).toBe(2);
    // dosage applies to the AGGREGATED quantities
    expect(item.ingredientBreakdown[0].batchedUsed).toBe(420);
    expect(item.ingredientBreakdown[0].wastageUsed).toBe(40);
  });

  it("labels progress rows with no BOQ link as UNLINKED", async () => {
    member("engineer");
    anyDb.boqItem.findMany.mockResolvedValue([]);
    anyDb.dailyReportProgress.findMany.mockResolvedValue([
      progressRow({ boqItemId: null, boqCode: null, boqDesc: null, taskDescription: "Site cleanup" }),
    ]);

    const caller = createCaller(materialReconRouter, USER);
    const res = await caller.getYieldReconciliation({ projectId: "p-1" });
    expect(res.items[0].boqCode).toBe("UNLINKED");
    expect(res.items[0].boqDesc).toBe("Site cleanup");
  });

  it("FORBIDDENs non-members", async () => {
    member(null);
    const caller = createCaller(materialReconRouter, USER);
    await expectTRPCError(
      caller.getYieldReconciliation({ projectId: "p-1" }),
      "FORBIDDEN",
    );
  });
});

// ─── stockAlerts ────────────────────────────────────────────────────────────
describe("materialReconciliation.stockAlerts", () => {
  function setupAlerts() {
    anyDb.material.findMany.mockResolvedValue([
      { id: "m-crit", name: "Cement", code: "C-1", unit: "bags", currentStock: 5, reorderLevel: 30, minStock: 10 },
      { id: "m-warn", name: "Sand", code: "S-1", unit: "cum", currentStock: 20, reorderLevel: 30, minStock: 0 },
      { id: "m-zero", name: "Bitumen", code: "B-1", unit: "drum", currentStock: 0, reorderLevel: 0, minStock: 0 },
    ]);
    anyDb.materialTransaction.findMany.mockResolvedValue([
      { materialId: "m-crit", quantity: 60, date: new Date() },
      { materialId: "m-crit", quantity: 30, date: new Date() },
    ]);
  }

  it("derives daily consumption (total/30), days-to-stockout and urgency", async () => {
    member("engineer");
    setupAlerts();
    const caller = createCaller(materialReconRouter, USER);
    const res = await caller.stockAlerts({ projectId: "p-1" });

    const cement = res.alerts.find((a: any) => a.id === "m-crit");
    expect(cement.avgDailyConsumption).toBe(3); // 90 issued / 30 days
    expect(cement.daysUntilStockout).toBe(2); // 5 / 3
    expect(cement.urgency).toBe("critical");

    const sand = res.alerts.find((a: any) => a.id === "m-warn");
    expect(sand.avgDailyConsumption).toBe(0);
    expect(sand.daysUntilStockout).toBeNull();
    expect(sand.urgency).toBe("warning");

    const bitumen = res.alerts.find((a: any) => a.id === "m-zero");
    expect(bitumen.urgency).toBe("critical");
  });

  it("sorts critical before warning and summarizes counts", async () => {
    member("engineer");
    setupAlerts();
    const caller = createCaller(materialReconRouter, USER);
    const res = await caller.stockAlerts({ projectId: "p-1" });

    const urgencies = res.alerts.map((a: any) => a.urgency);
    expect(urgencies).toEqual(["critical", "critical", "warning"]);
    expect(res.summary).toEqual({ total: 3, critical: 2, warning: 1, adequate: 0 });
  });

  it("queries active materials below their thresholds (field-based OR)", async () => {
    member("engineer");
    anyDb.material.findMany.mockResolvedValue([]);
    const caller = createCaller(materialReconRouter, USER);
    await caller.stockAlerts({ projectId: "p-1" });

    const where = anyDb.material.findMany.mock.calls[0][0].where;
    expect(where.projectId).toBe("p-1");
    expect(where.isActive).toBe(true);
    expect(where.OR[0]).toEqual({ currentStock: { lte: REORDER_FIELD }, reorderLevel: { gt: 0 } });
    expect(where.OR[1]).toEqual({ currentStock: { lte: MIN_STOCK_FIELD }, minStock: { gt: 0 } });
    expect(where.OR[2]).toEqual({ currentStock: 0 });
  });

  it("FORBIDDENs non-members", async () => {
    member(null);
    const caller = createCaller(materialReconRouter, USER);
    await expectTRPCError(caller.stockAlerts({ projectId: "p-1" }), "FORBIDDEN");
  });
});
