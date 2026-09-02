/**
 * Router-layer tests for requisition.ts.
 *
 * Pins:
 *   - Comparison-statement discipline: ≥3 quotes per item (zod), higher-
 *     priced vendor selection REQUIRES a justification
 *   - PR numbering per project (PR-0001 from count)
 *   - updateStatus/reject: project-admin only; ordered PRs immutable;
 *     rejection requires a trimmed reason
 *   - generatePOs: vendor-isolated POs (one PO per vendor), rate =
 *     exFactory + transport, amount = qty × rate, over-ordering past the
 *     remaining requisitioned qty rejected, PO number collision retry,
 *     PR status flips ordered/partially_ordered, cancelled PO items do
 *     not count toward ordered qty, missing quote for the selected vendor
 *     fails loud
 *   - checkBudgetVariance: planned demand from BOQ ingredients, over-budget
 *     flag and allowance math
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { buildUser, createCaller, expectTRPCError } from "./test-utils";

vi.mock("@/lib/db", async () => {
  const { buildDbMock } = await import("./test-utils");
  const db = buildDbMock();
  return { db, getFreshDb: () => db };
});

import { db } from "@/lib/db";
import { requisitionRouter } from "../requisition";

const anyDb = db as any;
const USER = buildUser();
const PM = buildUser({ id: "pm-1" });

function member(role: string | null) {
  anyDb.projectMember.findUnique.mockResolvedValue(role ? { role } : null);
}

function quote(partnerId: string, exFactoryRate: number, transportRate: number) {
  return { partnerId, exFactoryRate, transportRate, notes: null };
}

/** 3 quotes; cheapest total 100 (v1), expensive 120 (v2), 110 (v3). */
function stdQuotes() {
  return [
    quote("v1", 90, 10),
    quote("v2", 110, 10),
    quote("v3", 100, 10),
  ];
}

function reqItem(overrides: Record<string, unknown> = {}) {
  return {
    id: "pri-1",
    requisitionId: "pr-1",
    materialId: "mat-1",
    quantity: 100,
    unit: "bags",
    selectedPartnerId: "v1",
    justification: null,
    requisition: { id: "pr-1", projectId: "p-1", status: "approved" },
    material: { id: "mat-1", name: "Cement", unit: "bags" },
    quotes: [
      { partnerId: "v1", exFactoryRate: 90, transportRate: 10 },
      { partnerId: "v2", exFactoryRate: 110, transportRate: 10 },
      { partnerId: "v3", exFactoryRate: 100, transportRate: 10 },
    ],
    poItems: [],
    ...overrides,
  };
}

beforeEach(() => {
  vi.resetAllMocks();
});

// ─── create ─────────────────────────────────────────────────────────────────
describe("requisition.create", () => {
  const createInput = {
    projectId: "p-1",
    items: [
      {
        materialId: "mat-1",
        quantity: 100,
        unit: "bags",
        selectedPartnerId: "v1",
        quotes: stdQuotes(),
      },
    ],
  };

  it("requires at least 3 quotes per item (zod boundary)", async () => {
    member("engineer");
    const caller = createCaller(requisitionRouter, USER);
    await expectTRPCError(
      caller.create({
        ...createInput,
        items: [
          { ...createInput.items[0], quotes: stdQuotes().slice(0, 2) },
        ],
      }),
      "BAD_REQUEST",
    );
    expect(anyDb.purchaseRequisition.create).not.toHaveBeenCalled();
  });

  it("requires a justification when a higher-priced vendor is selected", async () => {
    member("engineer");
    const caller = createCaller(requisitionRouter, USER);
    await expectTRPCError(
      caller.create({
        ...createInput,
        items: [{ ...createInput.items[0], selectedPartnerId: "v2" }],
      }),
      "BAD_REQUEST",
    );
    expect(anyDb.purchaseRequisition.create).not.toHaveBeenCalled();
  });

  it("accepts the higher-priced vendor WITH a justification", async () => {
    member("engineer");
    const caller = createCaller(requisitionRouter, USER);
    await caller.create({
      ...createInput,
      items: [
        { ...createInput.items[0], selectedPartnerId: "v2", justification: "v1 out of stock" },
      ],
    });
    expect(anyDb.purchaseRequisition.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          number: "PR-0001",
          status: "pending_approval",
        }),
      }),
    );
  });

  it("numbers the PR from the project-scoped count", async () => {
    member("engineer");
    anyDb.purchaseRequisition.count.mockResolvedValue(4);
    const caller = createCaller(requisitionRouter, USER);
    await caller.create(createInput);
    expect(anyDb.purchaseRequisition.create.mock.calls[0][0].data.number).toBe("PR-0005");
  });
});

// ─── updateStatus / approvePr / rejectPr ───────────────────────────────────
describe("requisition.updateStatus", () => {
  it("is project-admin only", async () => {
    member("engineer");
    const caller = createCaller(requisitionRouter, USER);
    await expectTRPCError(
      caller.updateStatus({
        projectId: "p-1",
        requisitionId: "pr-1",
        status: "approved",
      }),
      "FORBIDDEN",
    );
  });

  it("NOT_FOUNDs a requisition from another project", async () => {
    member("project_manager");
    anyDb.purchaseRequisition.findFirst.mockResolvedValue(null);
    const caller = createCaller(requisitionRouter, PM);
    await expectTRPCError(
      caller.updateStatus({
        projectId: "p-1",
        requisitionId: "pr-1",
        status: "approved",
      }),
      "NOT_FOUND",
    );
  });

  it("rejects status changes on an already-ordered PR", async () => {
    member("project_manager");
    anyDb.purchaseRequisition.findFirst.mockResolvedValue({
      id: "pr-1",
      projectId: "p-1",
      status: "ordered",
    });
    // engine re-read (transitionEntityState resolves the entity itself)
    anyDb.purchaseRequisition.findUnique.mockResolvedValue({
      id: "pr-1",
      projectId: "p-1",
      status: "ordered",
    });
    const caller = createCaller(requisitionRouter, PM);
    await expectTRPCError(
      caller.updateStatus({
        projectId: "p-1",
        requisitionId: "pr-1",
        status: "approved",
      }),
      "BAD_REQUEST",
    );
    expect(anyDb.purchaseRequisition.updateMany).not.toHaveBeenCalled();
  });

  it("requires a rejection reason", async () => {
    member("project_manager");
    anyDb.purchaseRequisition.findFirst.mockResolvedValue({
      id: "pr-1",
      projectId: "p-1",
      status: "pending_approval",
    });
    const caller = createCaller(requisitionRouter, PM);
    await expectTRPCError(
      caller.updateStatus({
        projectId: "p-1",
        requisitionId: "pr-1",
        status: "rejected",
      }),
      "BAD_REQUEST",
    );
  });

  it("stores the trimmed rejection reason via the engine (CAS + attribution)", async () => {
    member("project_manager");
    const prFixture = {
      id: "pr-1",
      projectId: "p-1",
      status: "pending_approval",
      approvedById: null,
      rejectionReason: null,
      rejectedAt: null,
    };
    anyDb.purchaseRequisition.findFirst.mockResolvedValue(prFixture);
    anyDb.purchaseRequisition.findUnique.mockResolvedValue(prFixture); // engine re-read
    const caller = createCaller(requisitionRouter, PM);
    await caller.updateStatus({
      projectId: "p-1",
      requisitionId: "pr-1",
      status: "rejected",
      rejectionReason: "  Budget exceeded  ",
    });
    // Engine contract: CAS claim on the status just read; the trimmed
    // reason rides notes → rejectionReason; rejection attribution is
    // rejectedAt (same as the rejectPr sibling — approvedById is only
    // stamped on approval).
    expect(anyDb.purchaseRequisition.updateMany).toHaveBeenCalledWith({
      where: { id: "pr-1", status: "pending_approval" },
      data: expect.objectContaining({
        status: "rejected",
        rejectionReason: "Budget exceeded",
        rejectedAt: expect.any(Date),
      }),
    });
  });
});

// ─── approvePr / rejectPr — engine-backed approval flows ───────────────────
describe("requisition.approvePr", () => {
  function prFixture(overrides: Record<string, unknown> = {}) {
    return {
      id: "pr-1",
      projectId: "p-1",
      status: "pending_approval",
      approvedById: null,
      rejectionReason: null,
      notes: null,
      ...overrides,
    };
  }

  it("approves a pending_approval PR via the engine (CAS + attribution)", async () => {
    member("project_manager");
    anyDb.purchaseRequisition.findFirst.mockResolvedValue(prFixture());
    anyDb.purchaseRequisition.findUnique.mockResolvedValue(prFixture()); // engine re-read
    const caller = createCaller(requisitionRouter, PM);
    await caller.approvePr({ projectId: "p-1", requisitionId: "pr-1" });

    expect(anyDb.purchaseRequisition.updateMany).toHaveBeenCalledWith({
      where: { id: "pr-1", status: "pending_approval" },
      data: expect.objectContaining({
        status: "approved",
        approvedById: PM.id,
        rejectionReason: null, // a prior rejection reason is cleared
      }),
    });
  });

  it("also approves a submitted PR (graph edge submitted→approved)", async () => {
    member("project_manager");
    anyDb.purchaseRequisition.findFirst.mockResolvedValue(prFixture({ status: "submitted" }));
    anyDb.purchaseRequisition.findUnique.mockResolvedValue(prFixture({ status: "submitted" })); // engine re-read
    const caller = createCaller(requisitionRouter, PM);
    await caller.approvePr({ projectId: "p-1", requisitionId: "pr-1" });
    expect(anyDb.purchaseRequisition.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "pr-1", status: "submitted" },
      }),
    );
  });

  it("FORBIDDENs non-admin roles", async () => {
    member("engineer");
    anyDb.purchaseRequisition.findFirst.mockResolvedValue(prFixture());
    const caller = createCaller(requisitionRouter, USER);
    await expectTRPCError(
      caller.approvePr({ projectId: "p-1", requisitionId: "pr-1" }),
      "FORBIDDEN",
    );
    expect(anyDb.purchaseRequisition.updateMany).not.toHaveBeenCalled();
  });

  it("BAD_REQUESTs approving a draft PR", async () => {
    member("project_manager");
    anyDb.purchaseRequisition.findFirst.mockResolvedValue(prFixture({ status: "draft" }));
    const caller = createCaller(requisitionRouter, PM);
    await expectTRPCError(
      caller.approvePr({ projectId: "p-1", requisitionId: "pr-1" }),
      "BAD_REQUEST",
    );
    expect(anyDb.purchaseRequisition.updateMany).not.toHaveBeenCalled();
  });

  it("CONFLICTs when a concurrent decision wins the race (CAS regression)", async () => {
    member("project_manager");
    anyDb.purchaseRequisition.findFirst.mockResolvedValue(prFixture());
    anyDb.purchaseRequisition.findUnique.mockResolvedValue(prFixture()); // engine re-read
    anyDb.purchaseRequisition.updateMany.mockResolvedValue({ count: 0 });
    const caller = createCaller(requisitionRouter, PM);
    await expectTRPCError(
      caller.approvePr({ projectId: "p-1", requisitionId: "pr-1" }),
      "CONFLICT",
    );
  });
});

describe("requisition.rejectPr", () => {
  function prFixture(overrides: Record<string, unknown> = {}) {
    return {
      id: "pr-1",
      projectId: "p-1",
      status: "submitted",
      approvedById: null,
      rejectionReason: null,
      notes: null,
      ...overrides,
    };
  }

  it("rejects a submitted PR with the trimmed reason (engine CAS)", async () => {
    member("project_manager");
    anyDb.purchaseRequisition.findFirst.mockResolvedValue(prFixture());
    anyDb.purchaseRequisition.findUnique.mockResolvedValue(prFixture()); // engine re-read
    const caller = createCaller(requisitionRouter, PM);
    await caller.rejectPr({
      projectId: "p-1",
      requisitionId: "pr-1",
      rejectionReason: "  Budget exceeded  ",
    });

    expect(anyDb.purchaseRequisition.updateMany).toHaveBeenCalledWith({
      where: { id: "pr-1", status: "submitted" },
      data: expect.objectContaining({
        status: "rejected",
        rejectionReason: "Budget exceeded",
      }),
    });
  });

  it("BAD_REQUESTs an already-ordered PR", async () => {
    member("project_manager");
    anyDb.purchaseRequisition.findFirst.mockResolvedValue(prFixture({ status: "ordered" }));
    const caller = createCaller(requisitionRouter, PM);
    await expectTRPCError(
      caller.rejectPr({ projectId: "p-1", requisitionId: "pr-1", rejectionReason: "x" }),
      "BAD_REQUEST",
    );
    expect(anyDb.purchaseRequisition.updateMany).not.toHaveBeenCalled();
  });

  it("BAD_REQUESTs rejecting an approved PR (graph tightening — engine edge only from submitted/pending_approval)", async () => {
    member("project_manager");
    anyDb.purchaseRequisition.findFirst.mockResolvedValue(prFixture({ status: "approved" }));
    const caller = createCaller(requisitionRouter, PM);
    await expectTRPCError(
      caller.rejectPr({ projectId: "p-1", requisitionId: "pr-1", rejectionReason: "x" }),
      "BAD_REQUEST",
    );
    expect(anyDb.purchaseRequisition.updateMany).not.toHaveBeenCalled();
  });
});

// ─── generatePOs ────────────────────────────────────────────────────────────
describe("requisition.generatePOs", () => {
  it("rejects ordering more than the remaining requisitioned quantity", async () => {
    member("engineer");
    anyDb.purchaseRequisitionItem.findMany.mockResolvedValue([
      reqItem({
        poItems: [{ quantity: 80, purchaseOrder: { status: "draft" } }],
      }),
    ]);
    const caller = createCaller(requisitionRouter, USER);
    await expectTRPCError(
      caller.generatePOs({
        projectId: "p-1",
        items: [{ requisitionItemId: "pri-1", quantityToOrder: 30 }],
      }),
      "BAD_REQUEST",
    );
    expect(anyDb.purchaseOrder.create).not.toHaveBeenCalled();
  });

  it("ignores quantities on cancelled POs when computing remaining", async () => {
    member("engineer");
    anyDb.purchaseRequisitionItem.findMany.mockResolvedValue([
      reqItem({
        poItems: [{ quantity: 50, purchaseOrder: { status: "cancelled" } }],
      }),
    ]);
    anyDb.partner.findUnique.mockResolvedValue({ id: "v1", name: "Vendor One" });
    anyDb.supplier.findFirst.mockResolvedValue(null);
    anyDb.purchaseOrder.create.mockImplementation(async ({ data }: any) => ({ id: "po-new", ...data }));
    const caller = createCaller(requisitionRouter, USER);
    // 100 req qty, 50 cancelled → remaining 100 → ordering 60 must pass
    await caller.generatePOs({
      projectId: "p-1",
      items: [{ requisitionItemId: "pri-1", quantityToOrder: 60 }],
    });
    expect(anyDb.purchaseOrder.create).toHaveBeenCalled();
  });

  it("rejects items whose requisition is not approved", async () => {
    member("engineer");
    anyDb.purchaseRequisitionItem.findMany.mockResolvedValue([]);
    const caller = createCaller(requisitionRouter, USER);
    await expectTRPCError(
      caller.generatePOs({
        projectId: "p-1",
        items: [{ requisitionItemId: "pri-x", quantityToOrder: 10 }],
      }),
      "BAD_REQUEST",
    );
  });

  it("creates one PO per vendor with rate = exFactory + transport", async () => {
    member("engineer");
    const itemV1 = reqItem();
    const itemV2 = reqItem({
      id: "pri-2",
      materialId: "mat-2",
      material: { id: "mat-2", name: "Sand", unit: "cft" },
      selectedPartnerId: "v2",
    });
    anyDb.purchaseRequisitionItem.findMany.mockResolvedValue([itemV1, itemV2]);
    anyDb.partner.findUnique.mockImplementation(async ({ where }: any) =>
      where.id === "v1" ? { id: "v1", name: "Vendor One" } : { id: "v2", name: "Vendor Two" },
    );
    anyDb.supplier.findFirst.mockResolvedValue(null);
    anyDb.purchaseOrder.create.mockImplementation(async ({ data }: any) => ({
      id: `po-${data.number}`,
      ...data,
    }));

    const caller = createCaller(requisitionRouter, USER);
    const res = await caller.generatePOs({
      projectId: "p-1",
      items: [
        { requisitionItemId: "pri-1", quantityToOrder: 100 },
        { requisitionItemId: "pri-2", quantityToOrder: 50 },
      ],
    });

    expect(res.count).toBe(2);
    expect(anyDb.purchaseOrder.create).toHaveBeenCalledTimes(2);

    // PO 1: v1, 100 bags @ (90+10) = 10,000
    const po1 = anyDb.purchaseOrder.create.mock.calls[0][0].data;
    expect(po1.partnerId).toBe("v1");
    expect(po1.totalAmount).toBe(10000);
    // PO items carry qty × rate
    expect(po1.totalAmount).toBe(100 * 100);

    // PO 2: v2, 50 @ (110+10) = 6,000
    const po2 = anyDb.purchaseOrder.create.mock.calls[1][0].data;
    expect(po2.partnerId).toBe("v2");
    expect(po2.totalAmount).toBe(50 * 120);
  });

  it("retries the PO number on a collision", async () => {
    member("engineer");
    anyDb.purchaseRequisitionItem.findMany.mockResolvedValue([reqItem()]);
    anyDb.partner.findUnique.mockResolvedValue({ id: "v1", name: "Vendor One" });
    anyDb.supplier.findFirst.mockResolvedValue(null);
    anyDb.purchaseOrder.count.mockResolvedValue(0);
    // PO-0001 exists → collision → PO-0002 free
    anyDb.purchaseOrder.findFirst
      .mockResolvedValueOnce({ id: "po-existing", number: "PO-0001" })
      .mockResolvedValueOnce(null);
    anyDb.purchaseOrder.create.mockImplementation(async ({ data }: any) => ({ id: "po-new", ...data }));

    const caller = createCaller(requisitionRouter, USER);
    await caller.generatePOs({
      projectId: "p-1",
      items: [{ requisitionItemId: "pri-1", quantityToOrder: 10 }],
    });
    expect(anyDb.purchaseOrder.create.mock.calls[0][0].data.number).toBe("PO-0002");
  });

  it("fails loud when the selected vendor has no quote on the item", async () => {
    member("engineer");
    anyDb.purchaseRequisitionItem.findMany.mockResolvedValue([
      reqItem({
        quotes: [
          { partnerId: "v2", exFactoryRate: 110, transportRate: 10 },
          { partnerId: "v3", exFactoryRate: 100, transportRate: 10 },
          { partnerId: "v9", exFactoryRate: 90, transportRate: 10 },
        ],
      }),
    ]);
    anyDb.partner.findUnique.mockResolvedValue({ id: "v1", name: "Vendor One" });
    const caller = createCaller(requisitionRouter, USER);
    await expectTRPCError(
      caller.generatePOs({
        projectId: "p-1",
        items: [{ requisitionItemId: "pri-1", quantityToOrder: 10 }],
      }),
      "BAD_REQUEST",
    );
  });

  it("flips the requisition to ordered once every item is fully ordered", async () => {
    member("engineer");
    anyDb.purchaseRequisitionItem.findMany.mockResolvedValue([reqItem()]);
    anyDb.partner.findUnique.mockResolvedValue({ id: "v1", name: "Vendor One" });
    anyDb.supplier.findFirst.mockResolvedValue(null);
    anyDb.purchaseOrder.create.mockImplementation(async ({ data }: any) => ({ id: "po-new", ...data }));
    // Post-PO status recompute: fully ordered now
    anyDb.purchaseRequisition.findUnique.mockResolvedValue({
      id: "pr-1",
      items: [
        { quantity: 100, poItems: [{ quantity: 100, purchaseOrder: { status: "draft" } }] },
      ],
    });

    const caller = createCaller(requisitionRouter, USER);
    await caller.generatePOs({
      projectId: "p-1",
      items: [{ requisitionItemId: "pri-1", quantityToOrder: 100 }],
    });
    expect(anyDb.purchaseRequisition.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "pr-1" },
        data: { status: "ordered" },
      }),
    );
  });
});

// ─── checkBudgetVariance ────────────────────────────────────────────────────
describe("requisition.checkBudgetVariance", () => {
  it("flags over-budget requests against BOQ planned demand", async () => {
    member("engineer");
    anyDb.material.findMany.mockResolvedValue([
      { id: "mat-1", name: "Cement", unit: "bags", category: null, subCategory: null },
    ]);
    anyDb.boqItem.findMany.mockResolvedValue([
      { quantity: 100, ingredients: [{ type: "material", name: "cement", quantity: 2 }] },
    ]);
    anyDb.purchaseRequisitionItem.findMany.mockResolvedValue([
      { materialId: "mat-1", quantity: 150 },
    ]);

    const caller = createCaller(requisitionRouter, USER);
    const res = await caller.checkBudgetVariance({
      projectId: "p-1",
      items: [{ materialId: "mat-1", quantity: 100 }],
    });

    // planned 200, already procured 150, requesting 100 → over budget
    const row = res.results[0];
    expect(row.plannedQty).toBe(200);
    expect(row.alreadyProcured).toBe(150);
    expect(row.remainingAllowance).toBe(50);
    expect(row.isOverBudget).toBe(true);
    expect(row.variancePercent).toBe(25);
  });
});
