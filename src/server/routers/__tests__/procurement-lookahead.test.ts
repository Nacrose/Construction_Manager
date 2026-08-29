/**
 * Router-layer tests for procurement-lookahead.ts.
 *
 * Pins:
 *   - Demand math: plannedDemand = linkQuantity × ingredientDosage ×
 *     (1 − progress/100); shortfall = max(0, demand − stock); 2dp rounding
 *   - Task-window query: only tasks starting within the horizon and not yet
 *     100% complete, scoped to the project; version filter only when an
 *     active Gantt version exists
 *   - Nepal material lead-time table (steel/rebar 14, cement 7, bitumen 21,
 *     aggregate/sand 3, pipe 10, hdpe 14, admixture 7, explosive 30,
 *     general 7) matched against name AND category
 *   - Status machine: overdue (requisition due < 0 AND shortfall > 0),
 *     urgent (due ≤ 3 AND shortfall > 0), upcoming otherwise — ample stock
 *     downgrades even an overdue requisition
 *   - Material↔ingredient matching: exact name, subCategory-augmented name,
 *     ingredient-name-contains-material-name; unmatched ingredients ignored
 *   - Aggregation across tasks: demand sums, earliest task drives the alert
 *   - Ordering: overdue first, then by daysUntilRequisitionDue ascending
 *   - AuthZ: non-members FORBIDDEN; lookaheadDays bounded 7–90
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { buildUser, createCaller, expectTRPCError } from "./test-utils";

vi.mock("@/lib/db", async () => {
  const { buildDbMock } = await import("./test-utils");
  const db = buildDbMock();
  return { db, getFreshDb: () => db };
});

import { db } from "@/lib/db";
import { procurementLookaheadRouter } from "../procurement-lookahead";

const anyDb = db as any;
const USER = buildUser();
const DAY = 24 * 60 * 60 * 1000;

function member(role: string | null) {
  anyDb.projectMember.findUnique.mockResolvedValue(role ? { role } : null);
}

/** Task start offsets use half-days so Math.ceil() stays deterministic. */
function inDays(days: number) {
  return new Date(Date.now() + days * DAY);
}

function task(overrides: Record<string, unknown> = {}) {
  return {
    id: "t-1",
    projectId: "p-1",
    name: "Slab casting",
    startDate: inDays(20.5), // daysUntilTask = ceil(20.5) = 21
    progress: 0,
    boqLinks: [
      {
        boqItemId: "b-1",
        quantity: 100,
        boqItem: { id: "b-1", quantity: 100 },
      },
    ],
    ...overrides,
  };
}

function mat(overrides: Record<string, unknown> = {}) {
  return {
    id: "m-1",
    name: "Cement",
    code: "C-1",
    category: null,
    subCategory: null,
    unit: "bags",
    currentStock: 50,
    minStock: 0,
    reorderLevel: 0,
    ...overrides,
  };
}

function boq(ingredients: any[], id = "b-1") {
  return { id, ingredients };
}

function setup(tasks: any[], materials: any[], boqItems: any[], activeVersion: any = null) {
  anyDb.ganttVersion.findFirst.mockResolvedValue(activeVersion);
  anyDb.ganttTask.findMany.mockResolvedValue(tasks);
  anyDb.material.findMany.mockResolvedValue(materials);
  anyDb.boqItem.findMany.mockResolvedValue(boqItems);
}

beforeEach(() => {
  vi.resetAllMocks();
});

// ─── demand math ────────────────────────────────────────────────────────────
describe("procurementLookahead.getLookahead — demand math", () => {
  it("computes demand = linkQuantity × dosage and shortfall vs stock", async () => {
    member("engineer");
    setup(
      [task()], // 100 cum × 2 bags/cum
      [mat({ currentStock: 50 })],
      [boq([{ name: "cement", quantity: 2, unit: "bags" }])],
    );

    const caller = createCaller(procurementLookaheadRouter, USER);
    const res = await caller.getLookahead({ projectId: "p-1" });

    expect(res.alerts).toHaveLength(1);
    const alert = res.alerts[0];
    expect(alert.materialName).toBe("Cement");
    expect(alert.plannedDemand).toBe(200);
    expect(alert.shortfall).toBe(150); // 200 − 50 on hand
    expect(alert.currentStock).toBe(50);
    expect(alert.unit).toBe("bags");
    expect(alert.leadDays).toBe(7); // cement
    expect(alert.daysUntilTask).toBe(21); // ceil(20.5)
    expect(alert.daysUntilRequisitionDue).toBe(14); // 21 − 7
    expect(alert.status).toBe("upcoming");
    expect(alert.tasksCount).toBe(1);
    expect(res.totalTasksAnalyzed).toBe(1);
    expect(res.criticalAlertsCount).toBe(0);
  });

  it("discounts demand by task progress (40% done → 60% remaining)", async () => {
    member("engineer");
    setup(
      [task({ progress: 40 })],
      [mat({ currentStock: 0 })],
      [boq([{ name: "cement", quantity: 2 }])],
    );

    const caller = createCaller(procurementLookaheadRouter, USER);
    const res = await caller.getLookahead({ projectId: "p-1" });
    expect(res.alerts[0].plannedDemand).toBe(120); // 200 × (1 − 0.4)
  });

  it("uses the task link quantity when set, else the BOQ item quantity", async () => {
    member("engineer");
    const caller = createCaller(procurementLookaheadRouter, USER);

    setup(
      [task({ boqLinks: [{ boqItemId: "b-1", quantity: 50, boqItem: { id: "b-1", quantity: 100 } }] })],
      [mat()],
      [boq([{ name: "cement", quantity: 2 }])],
    );
    let res = await caller.getLookahead({ projectId: "p-1" });
    expect(res.alerts[0].plannedDemand).toBe(100); // 50 × 2

    setup(
      [task({ boqLinks: [{ boqItemId: "b-1", quantity: undefined, boqItem: { id: "b-1", quantity: 100 } }] })],
      [mat()],
      [boq([{ name: "cement", quantity: 2 }])],
    );
    res = await caller.getLookahead({ projectId: "p-1" });
    expect(res.alerts[0].plannedDemand).toBe(200); // falls back to BOQ qty
  });

  it("rounds plannedDemand and shortfall to 2 decimals", async () => {
    member("engineer");
    setup(
      [task({ boqLinks: [{ boqItemId: "b-1", quantity: 10, boqItem: { id: "b-1", quantity: 10 } }] })],
      [mat({ currentStock: 3 })],
      [boq([{ name: "cement", quantity: 3.333 }])],
    );

    const caller = createCaller(procurementLookaheadRouter, USER);
    const res = await caller.getLookahead({ projectId: "p-1" });
    expect(res.alerts[0].plannedDemand).toBe(33.33); // 33.333 → 33.33
    expect(res.alerts[0].shortfall).toBe(30.33); // 30.333 → 30.33
  });
});

// ─── lead times ─────────────────────────────────────────────────────────────
describe("procurementLookahead.getLookahead — lead-time table", () => {
  it("maps Nepali construction materials to their standard lead times", async () => {
    member("engineer");
    const cases: Array<[string, number]> = [
      ["Steel Rebar", 14],
      ["Cement OPC", 7],
      ["Bitumen VG-30", 21],
      ["Crushed Aggregate", 3],
      ["River Sand", 3],
      ["PVC Pipe", 10],
      ["HDPE Coil", 14],
      ["Superplasticizer Admixture", 7],
      ["Emulsion Explosive", 30],
      ["Marble Tiles", 7], // unknown → general
    ];

    const materials = cases.map(([name], i) => mat({ id: `m-${i}`, name, currentStock: 0 }));
    const boqItems = cases.map(([name], i) =>
      boq([{ name, quantity: 1 }], `b-${i}`),
    );
    const links = cases.map(([, ], i) => ({
      boqItemId: `b-${i}`,
      quantity: 1,
      boqItem: { id: `b-${i}`, quantity: 1 },
    }));
    setup([task({ boqLinks: links, startDate: inDays(10.5) })], materials, boqItems);

    const caller = createCaller(procurementLookaheadRouter, USER);
    const res = await caller.getLookahead({ projectId: "p-1" });

    const byName = new Map<string, any>(
      res.alerts.map((a: any) => [a.materialName, a] as [string, any]),
    );
    for (const [name, leadDays] of cases) {
      expect(byName.get(name)?.leadDays, `${name} lead time`).toBe(leadDays);
    }
  });

  it("matches lead-time keywords against name AND category", async () => {
    member("engineer");
    setup(
      [task({ startDate: inDays(10.5) })],
      [mat({ name: "XYZ Fitting", category: "Steel Structure", currentStock: 0 })],
      [boq([{ name: "xyz fitting", quantity: 1 }])],
    );

    const caller = createCaller(procurementLookaheadRouter, USER);
    const res = await caller.getLookahead({ projectId: "p-1" });
    expect(res.alerts[0].leadDays).toBe(14); // category contains "steel"
  });
});

// ─── status machine ─────────────────────────────────────────────────────────
describe("procurementLookahead.getLookahead — urgency status", () => {
  it("marks overdue when the requisition date has passed AND stock is short", async () => {
    member("engineer");
    setup(
      [task({ startDate: inDays(-5.5) })], // daysUntilTask = ceil(-5.5) = -5
      [mat({ currentStock: 0 })],
      [boq([{ name: "cement", quantity: 2 }])],
    );

    const caller = createCaller(procurementLookaheadRouter, USER);
    const res = await caller.getLookahead({ projectId: "p-1" });
    expect(res.alerts[0].daysUntilTask).toBe(-5);
    expect(res.alerts[0].daysUntilRequisitionDue).toBe(-12); // −5 − 7
    expect(res.alerts[0].status).toBe("overdue");
    expect(res.criticalAlertsCount).toBe(1);
  });

  it("marks urgent when the requisition is due within 3 days and stock is short", async () => {
    member("engineer");
    setup(
      [task({ startDate: inDays(9.5) })], // daysUntilTask = 10
      [mat({ currentStock: 0 })],
      [boq([{ name: "cement", quantity: 2 }])],
    );

    const caller = createCaller(procurementLookaheadRouter, USER);
    const res = await caller.getLookahead({ projectId: "p-1" });
    expect(res.alerts[0].daysUntilRequisitionDue).toBe(3); // 10 − 7 (boundary)
    expect(res.alerts[0].status).toBe("urgent");
    expect(res.criticalAlertsCount).toBe(1);
  });

  it("keeps a short-dated requisition 'upcoming' when stock covers the demand", async () => {
    member("engineer");
    setup(
      [task({ startDate: inDays(-5.5) })],
      [mat({ currentStock: 1000 })], // ample stock
      [boq([{ name: "cement", quantity: 2 }])],
    );

    const caller = createCaller(procurementLookaheadRouter, USER);
    const res = await caller.getLookahead({ projectId: "p-1" });
    expect(res.alerts[0].shortfall).toBe(0);
    expect(res.alerts[0].status).toBe("upcoming"); // no shortfall → never overdue/urgent
    expect(res.criticalAlertsCount).toBe(0);
  });

  it("sorts overdue before urgent before upcoming, then by requisition due date", async () => {
    member("engineer");
    const materials = [
      mat({ id: "m-steel", name: "Steel Rebar", currentStock: 0 }), // lead 14
      mat({ id: "m-cement", name: "Cement", currentStock: 0 }), // lead 7
      mat({ id: "m-sand", name: "River Sand", currentStock: 0 }), // lead 3
    ];
    const boqItems = [
      boq([{ name: "steel rebar", quantity: 1 }], "b-steel"),
      boq([{ name: "cement", quantity: 1 }], "b-cement"),
      boq([{ name: "river sand", quantity: 1 }], "b-sand"),
    ];
    const tasks = [
      // sand: +20.5d → due 18 → upcoming
      task({ id: "t-sand", name: "Backfill", startDate: inDays(20.5), boqLinks: [{ boqItemId: "b-sand", quantity: 1, boqItem: { quantity: 1 } }] }),
      // steel: −5.5d → due −19 → overdue
      task({ id: "t-steel", name: "Footing rebar", startDate: inDays(-5.5), boqLinks: [{ boqItemId: "b-steel", quantity: 1, boqItem: { quantity: 1 } }] }),
      // cement: +9.5d → due 3 → urgent
      task({ id: "t-cement", name: "Slab cast", startDate: inDays(9.5), boqLinks: [{ boqItemId: "b-cement", quantity: 1, boqItem: { quantity: 1 } }] }),
    ];
    setup(tasks, materials, boqItems);

    const caller = createCaller(procurementLookaheadRouter, USER);
    const res = await caller.getLookahead({ projectId: "p-1" });

    expect(res.alerts.map((a: any) => a.materialName)).toEqual([
      "Steel Rebar", // overdue
      "Cement", // urgent
      "River Sand", // upcoming
    ]);
    expect(res.criticalAlertsCount).toBe(2);
    expect(res.totalTasksAnalyzed).toBe(3);
  });
});

// ─── matching & aggregation ─────────────────────────────────────────────────
describe("procurementLookahead.getLookahead — matching & aggregation", () => {
  it("matches ingredients via exact name, subCategory spec, or containment", async () => {
    member("engineer");
    const materials = [
      mat({ id: "m-exact", name: "Cement" }),
      mat({ id: "m-sub", name: "OPC", subCategory: "53 Grade", currentStock: 10 }),
    ];
    const boqItems = [
      // "cement" ⊂ "opc 53 grade" full spec → matches m-sub too, but m-exact wins by order
      boq([{ name: "cement", quantity: 1 }], "b-1"),
      boq([{ name: "opc 53 grade", quantity: 1 }], "b-2"),
    ];
    const links = [
      { boqItemId: "b-1", quantity: 10, boqItem: { id: "b-1", quantity: 10 } },
      { boqItemId: "b-2", quantity: 5, boqItem: { id: "b-2", quantity: 5 } },
    ];
    setup([task({ boqLinks: links })], materials, boqItems);

    const caller = createCaller(procurementLookaheadRouter, USER);
    const res = await caller.getLookahead({ projectId: "p-1" });

    // ingredient "cement" → first match is the exact-named material
    // ingredient "opc 53 grade" → matches m-sub (ingredient name contains "opc")
    const ids = res.alerts.map((a: any) => a.materialId).sort();
    expect(ids).toEqual(["m-exact", "m-sub"]);
  });

  it("ignores ingredients with no matching material", async () => {
    member("engineer");
    setup(
      [task()],
      [mat()],
      [boq([{ name: "unicorn dust", quantity: 5 }])],
    );
    const caller = createCaller(procurementLookaheadRouter, USER);
    const res = await caller.getLookahead({ projectId: "p-1" });
    expect(res.alerts).toHaveLength(0);
    expect(res.totalTasksAnalyzed).toBe(1);
  });

  it("accumulates demand across tasks and alerts on the earliest task", async () => {
    member("engineer");
    const earlierStart = inDays(10.5); // captured once — comparing a re-computed Date is flaky at ms granularity
    const later = task({
      id: "t-later",
      name: "Beam casting",
      startDate: inDays(20.5),
      boqLinks: [{ boqItemId: "b-1", quantity: 50, boqItem: { id: "b-1", quantity: 50 } }],
    });
    const earlier = task({
      id: "t-earlier",
      name: "Column casting",
      startDate: earlierStart,
      boqLinks: [{ boqItemId: "b-1", quantity: 25, boqItem: { id: "b-1", quantity: 25 } }],
    });
    setup([later, earlier], [mat({ currentStock: 0 })], [boq([{ name: "cement", quantity: 2 }])]);

    const caller = createCaller(procurementLookaheadRouter, USER);
    const res = await caller.getLookahead({ projectId: "p-1" });

    const alert = res.alerts[0];
    expect(alert.plannedDemand).toBe(150); // 50×2 + 25×2
    expect(alert.tasksCount).toBe(2);
    expect(alert.earliestTaskName).toBe("Column casting");
    expect(alert.earliestTaskDate).toEqual(earlierStart);
  });
});

// ─── query scoping & validation ─────────────────────────────────────────────
describe("procurementLookahead.getLookahead — scoping & validation", () => {
  it("scopes tasks, materials and BOQ items to the project with the horizon window", async () => {
    member("engineer");
    setup(
      [task()],
      [mat()],
      [boq([{ name: "cement", quantity: 2 }])],
      { id: "v-1", isActive: true },
    );

    const caller = createCaller(procurementLookaheadRouter, USER);
    await caller.getLookahead({ projectId: "p-1", lookaheadDays: 14 });

    const taskWhere = anyDb.ganttTask.findMany.mock.calls[0][0].where;
    expect(taskWhere.projectId).toBe("p-1");
    expect(taskWhere.versionId).toBe("v-1"); // active version filter
    expect(taskWhere.progress).toEqual({ lt: 100 }); // completed tasks excluded
    expect(taskWhere.startDate.lte).toBeInstanceOf(Date);
    // horizon ≈ now + 14 days
    const expected = Date.now() + 14 * DAY;
    expect(taskWhere.startDate.lte.getTime()).toBeGreaterThan(expected - 60_000);
    expect(taskWhere.startDate.lte.getTime()).toBeLessThan(expected + 60_000);

    expect(anyDb.material.findMany.mock.calls[0][0].where).toEqual({ projectId: "p-1" });
    expect(anyDb.boqItem.findMany.mock.calls[0][0].where).toEqual({ projectId: "p-1" });
    // no analysis libraries → client_estimate purpose fallback for ingredients
    expect(anyDb.boqItem.findMany.mock.calls[0][0].include.ingredients.where).toEqual({
      type: "material",
      rateAnalysis: { library: { purpose: "client_estimate" } },
    });
  });

  it("omits the version filter when the project has no active Gantt version", async () => {
    member("engineer");
    setup([task()], [mat()], [boq([{ name: "cement", quantity: 1 }])], null);

    const caller = createCaller(procurementLookaheadRouter, USER);
    await caller.getLookahead({ projectId: "p-1" });
    const taskWhere = anyDb.ganttTask.findMany.mock.calls[0][0].where;
    expect("versionId" in taskWhere).toBe(false);
  });

  it("filters ingredients by the project's default library when one exists", async () => {
    member("engineer");
    setup([task()], [mat()], [boq([{ name: "cement", quantity: 1 }])]);
    anyDb.analysisLibrary.findMany.mockResolvedValue([
      { id: "lib-1", name: "Client's Estimate", purpose: "client_estimate", isDefault: true },
    ]);

    const caller = createCaller(procurementLookaheadRouter, USER);
    await caller.getLookahead({ projectId: "p-1" });
    expect(anyDb.boqItem.findMany.mock.calls[0][0].include.ingredients.where).toEqual({
      type: "material",
      rateAnalysis: { libraryId: "lib-1" },
    });
  });

  it("rejects lookaheadDays outside 7–90 and defaults to 30", async () => {
    member("engineer");
    setup([], [], []);
    const caller = createCaller(procurementLookaheadRouter, USER);

    await expectTRPCError(
      caller.getLookahead({ projectId: "p-1", lookaheadDays: 6 }),
      "BAD_REQUEST",
    );
    await expectTRPCError(
      caller.getLookahead({ projectId: "p-1", lookaheadDays: 91 }),
      "BAD_REQUEST",
    );
    const res = await caller.getLookahead({ projectId: "p-1" });
    expect(res.lookaheadDays).toBe(30);
  });

  it("FORBIDDENs non-members", async () => {
    member(null);
    const caller = createCaller(procurementLookaheadRouter, USER);
    await expectTRPCError(
      caller.getLookahead({ projectId: "p-1" }),
      "FORBIDDEN",
    );
    expect(anyDb.ganttTask.findMany).not.toHaveBeenCalled();
  });
});
