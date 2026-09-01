/**
 * Router-layer tests for material-transaction.ts.
 *
 * Pins:
 *   - Project-level stock math: receive/adjustment +qty, issue −qty,
 *     transfer net-zero; negative stock rejected pre-write
 *   - Store-level stock guard for issue/transfer from a source store
 *   - Same source/destination store transfer rejected
 *   - Over-issue guard: 105% of BOQ-planned demand blocks without an
 *     explicit override; override returns a warning, not an error
 *   - VAT/TDS computed ONLY on receive (issues never carry tax amounts)
 *   - PO over-receiving rejected; PO status flips received/partially_received
 *   - Gate entry flips to "received" when a receive cites it
 *   - Gate pass numbers unique per project
 *   - updateTransaction: un-deducts (clears deductedInIpcId) and
 *     recalculates affected draft IPCs when isDebitable is turned off
 *   - logDirectDelivery: fiscal-year lock enforced with the ORG id and the
 *     DELIVERY date (regression: used to pass projectId as the org → the
 *     lock could never match and back-dated deliveries bypassed it)
 *   - logDirectDelivery: paid_now decrements the org-scoped bank account;
 *     credit creates a VAT bill instead of a payment; cross-org bank
 *     account FORBIDDEN
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { buildUser, createCaller, expectTRPCError } from "./test-utils";

vi.mock("@/lib/db", async () => {
  const { buildDbMock } = await import("./test-utils");
  const db = buildDbMock();
  return { db, getFreshDb: () => db };
});

import { db } from "@/lib/db";
import { materialTransactionProcedures } from "../material-transaction";

// The procedures object is merged into a router elsewhere; wrap it the same
// way tRPC's router() does so createCaller works.
import { router } from "@/server/trpc";
const materialTxnRouter = router(materialTransactionProcedures);

const anyDb = db as any;
const USER = buildUser();

function member(role: string | null) {
  anyDb.projectMember.findUnique.mockResolvedValue(role ? { role } : null);
}

function material(overrides: Record<string, unknown> = {}) {
  return {
    id: "m-1",
    projectId: "p-1",
    name: "Cement",
    unit: "bags",
    currentStock: 100,
    ...overrides,
  };
}

beforeEach(() => {
  vi.resetAllMocks();
});

// ─── createTransaction: stock math ─────────────────────────────────────────
describe("materialTransaction.createTransaction — stock math", () => {
  it("receive increments project stock by the quantity", async () => {
    member("engineer");
    anyDb.material.findFirst.mockResolvedValue(material());
    const caller = createCaller(materialTxnRouter, USER);
    const res = await caller.createTransaction({
      projectId: "p-1",
      materialId: "m-1",
      type: "receive",
      quantity: 50,
      rate: 900,
    });
    expect(anyDb.material.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "m-1" },
        data: { currentStock: 150 },
      }),
    );
    expect(res.transaction).toBeDefined();
  });

  it("issue decrements project stock", async () => {
    member("engineer");
    anyDb.material.findFirst.mockResolvedValue(material());
    const caller = createCaller(materialTxnRouter, USER);
    await caller.createTransaction({
      projectId: "p-1",
      materialId: "m-1",
      type: "issue",
      quantity: 30,
      rate: 0,
    });
    expect(anyDb.material.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { currentStock: 70 } }),
    );
  });

  it("rejects an issue that would drive project stock negative", async () => {
    member("engineer");
    anyDb.material.findFirst.mockResolvedValue(material());
    const caller = createCaller(materialTxnRouter, USER);
    await expectTRPCError(
      caller.createTransaction({
        projectId: "p-1",
        materialId: "m-1",
        type: "issue",
        quantity: 150,
        rate: 0,
      }),
      "BAD_REQUEST",
    );
    expect(anyDb.materialTransaction.create).not.toHaveBeenCalled();
  });

  it("transfer leaves total project stock unchanged", async () => {
    member("engineer");
    anyDb.material.findFirst.mockResolvedValue(material());
    const caller = createCaller(materialTxnRouter, USER);
    await caller.createTransaction({
      projectId: "p-1",
      materialId: "m-1",
      type: "transfer",
      quantity: 20,
      rate: 0,
    });
    expect(anyDb.material.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { currentStock: 100 } }),
    );
  });

  it("rejects a transfer where source and destination stores are identical", async () => {
    member("engineer");
    anyDb.material.findFirst.mockResolvedValue(material());
    const caller = createCaller(materialTxnRouter, USER);
    await expectTRPCError(
      caller.createTransaction({
        projectId: "p-1",
        materialId: "m-1",
        type: "transfer",
        quantity: 20,
        rate: 0,
        storeLocationId: "store-1",
        targetStoreLocationId: "store-1",
      }),
      "BAD_REQUEST",
    );
    expect(anyDb.materialTransaction.create).not.toHaveBeenCalled();
  });

  it("rejects an issue exceeding the SOURCE STORE's stock", async () => {
    member("engineer");
    anyDb.material.findFirst.mockResolvedValue(material());
    anyDb.materialStoreStock.findUnique.mockResolvedValue({ currentStock: 5 });
    const caller = createCaller(materialTxnRouter, USER);
    const err = await expectTRPCError(
      caller.createTransaction({
        projectId: "p-1",
        materialId: "m-1",
        type: "issue",
        quantity: 10,
        rate: 0,
        storeLocationId: "store-1",
      }),
      "BAD_REQUEST",
    );
    expect(err.message).toContain("Insufficient stock at source store");
  });

  it("FORBIDDENs read-only roles", async () => {
    member("client");
    const caller = createCaller(materialTxnRouter, USER);
    await expectTRPCError(
      caller.createTransaction({
        projectId: "p-1",
        materialId: "m-1",
        type: "receive",
        quantity: 5,
        rate: 100,
      }),
      "FORBIDDEN",
    );
  });
});

// ─── createTransaction: over-issue guard ───────────────────────────────────
describe("materialTransaction.createTransaction — over-issue guard", () => {
  function plannedSetup() {
    // BOQ plans 200 bags total (100 qty × 2 per unit)
    anyDb.boqItem.findMany.mockResolvedValue([
      { quantity: 100, ingredients: [{ type: "material", name: "cement", quantity: 2 }] },
    ]);
  }

  it("blocks an issue past 105% of planned demand without override", async () => {
    member("engineer");
    anyDb.material.findFirst.mockResolvedValue(material({ currentStock: 500 }));
    plannedSetup();
    anyDb.materialTransaction.aggregate.mockResolvedValue({ _sum: { quantity: 205 } });
    const caller = createCaller(materialTxnRouter, USER);
    const err = await expectTRPCError(
      caller.createTransaction({
        projectId: "p-1",
        materialId: "m-1",
        type: "issue",
        quantity: 10,
        rate: 0,
      }),
      "BAD_REQUEST",
    );
    expect(err.message).toContain("OVER_ISSUE");
    expect(anyDb.materialTransaction.create).not.toHaveBeenCalled();
  });

  it("override:true proceeds and returns a warning", async () => {
    member("engineer");
    anyDb.material.findFirst.mockResolvedValue(material({ currentStock: 500 }));
    plannedSetup();
    anyDb.materialTransaction.aggregate.mockResolvedValue({ _sum: { quantity: 205 } });
    const caller = createCaller(materialTxnRouter, USER);
    const res = await caller.createTransaction({
      projectId: "p-1",
      materialId: "m-1",
      type: "issue",
      quantity: 10,
      rate: 0,
      override: true,
    });
    expect(anyDb.materialTransaction.create).toHaveBeenCalled();
    expect(res.warning).toContain("OVER_ISSUE_BYPASSED");
  });
});

// ─── createTransaction: tax computation ────────────────────────────────────
describe("materialTransaction.createTransaction — tax math", () => {
  it("computes VAT/TDS only on receive", async () => {
    member("engineer");
    anyDb.material.findFirst.mockResolvedValue(material());
    const caller = createCaller(materialTxnRouter, USER);
    await caller.createTransaction({
      projectId: "p-1",
      materialId: "m-1",
      type: "receive",
      quantity: 10,
      rate: 100,
      vatPercent: 13,
      tdsPercent: 1.5,
    });
    const data = anyDb.materialTransaction.create.mock.calls[0][0].data;
    expect(data.vatAmount).toBe(130);
    expect(data.tdsAmount).toBe(15);
    expect(data.totalWithVat).toBe(1130);
    expect(data.netPayable).toBe(1115);
  });

  it("issues never carry tax amounts even if percents are passed", async () => {
    member("engineer");
    anyDb.material.findFirst.mockResolvedValue(material());
    const caller = createCaller(materialTxnRouter, USER);
    await caller.createTransaction({
      projectId: "p-1",
      materialId: "m-1",
      type: "issue",
      quantity: 10,
      rate: 100,
      vatPercent: 13,
      tdsPercent: 1.5,
    });
    const data = anyDb.materialTransaction.create.mock.calls[0][0].data;
    expect(data.vatPercent).toBe(0);
    expect(data.vatAmount).toBe(0);
    expect(data.tdsAmount).toBe(0);
    expect(data.netPayable).toBe(1000);
  });
});

// ─── createTransaction: PO linkage ─────────────────────────────────────────
describe("materialTransaction.createTransaction — PO linkage", () => {
  it("rejects receiving more than the PO item's ordered quantity", async () => {
    member("engineer");
    anyDb.material.findFirst.mockResolvedValue(material());
    anyDb.purchaseOrderItem.findFirst.mockResolvedValue({
      id: "poi-1",
      materialId: "m-1",
      quantity: 100,
      receivedQty: 90,
      unit: "bags",
    });
    const caller = createCaller(materialTxnRouter, USER);
    await expectTRPCError(
      caller.createTransaction({
        projectId: "p-1",
        materialId: "m-1",
        type: "receive",
        quantity: 20,
        rate: 100,
        purchaseOrderId: "po-1",
      }),
      "BAD_REQUEST",
    );
    expect(anyDb.purchaseOrderItem.update).not.toHaveBeenCalled();
  });

  it("marks the PO received when the last item completes", async () => {
    member("engineer");
    anyDb.material.findFirst.mockResolvedValue(material());
    anyDb.purchaseOrderItem.findFirst.mockResolvedValue({
      id: "poi-1",
      materialId: "m-1",
      quantity: 100,
      receivedQty: 90,
      unit: "bags",
    });
    anyDb.purchaseOrderItem.findMany.mockResolvedValue([
      { id: "poi-1", materialId: "m-1", quantity: 100, receivedQty: 90 },
      { id: "poi-2", materialId: "m-2", quantity: 50, receivedQty: 50 },
    ]);
    const caller = createCaller(materialTxnRouter, USER);
    await caller.createTransaction({
      projectId: "p-1",
      materialId: "m-1",
      type: "receive",
      quantity: 10,
      rate: 100,
      purchaseOrderId: "po-1",
    });
    expect(anyDb.purchaseOrderItem.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { receivedQty: 100 } }),
    );
    expect(anyDb.purchaseOrder.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: "received" } }),
    );
  });

  it("flips the cited gate entry to received", async () => {
    member("engineer");
    anyDb.material.findFirst.mockResolvedValue(material());
    // engine pre-read inside tx (CAS source for the pending→received claim)
    anyDb.gateEntry.findUnique.mockResolvedValue({ id: "ge-1", status: "pending" });
    const caller = createCaller(materialTxnRouter, USER);
    await caller.createTransaction({
      projectId: "p-1",
      materialId: "m-1",
      type: "receive",
      quantity: 10,
      rate: 100,
      gateEntryId: "ge-1",
    });
    expect(anyDb.gateEntry.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "ge-1", status: "pending" },
        data: expect.objectContaining({ status: "received" }),
      }),
    );
  });
});

// ─── gate entries ───────────────────────────────────────────────────────────
describe("materialTransaction.createGateEntry", () => {
  it("rejects duplicate gate pass numbers within a project", async () => {
    member("engineer");
    anyDb.gateEntry.count.mockResolvedValue(3);
    anyDb.gateEntry.findFirst.mockResolvedValue({ id: "existing" });
    const caller = createCaller(materialTxnRouter, USER);
    await expectTRPCError(
      caller.createGateEntry({ projectId: "p-1", vehicleNo: "BA 2 KHA 1234" }),
      "BAD_REQUEST",
    );
    expect(anyDb.gateEntry.create).not.toHaveBeenCalled();
  });
});

// ─── updateTransaction: IPC deduction recalculation ────────────────────────
describe("materialTransaction.updateTransaction", () => {
  it("clears deductedInIpcId when isDebitable is turned off and recalculates affected IPCs", async () => {
    member("engineer");
    anyDb.materialTransaction.findFirst.mockResolvedValue({
      id: "txn-1",
      projectId: "p-1",
      date: new Date("2026-08-01"),
      subcontractorId: "sub-1",
      isDebitable: true,
      deductedInIpcId: "ipc-1",
    });
    anyDb.materialTransaction.update.mockResolvedValue({
      id: "txn-1",
      subcontractorId: "sub-1",
      isDebitable: false,
      deductedInIpcId: "ipc-1",
    });
    anyDb.ipc.findMany.mockResolvedValue([{ id: "ipc-1" }]);
    anyDb.ipc.findUnique.mockResolvedValue({
      projectId: "p-1",
      retention: 5,
      advanceRecovery: 1000,
      subcontractorId: "sub-1",
      vatPercent: 13,
      tdsPercent: 1.5,
    });
    anyDb.ipcItem.findMany.mockResolvedValue([{ amount: 10000 }]);
    // After un-deducting, no debitable txns remain → deductions = 0
    anyDb.materialTransaction.findMany.mockResolvedValue([]);

    const caller = createCaller(materialTxnRouter, USER);
    await caller.updateTransaction({
      projectId: "p-1",
      transactionId: "txn-1",
      isDebitable: false,
    });

    // Second update clears the IPC link (un-deduct)
    const secondUpdate = anyDb.materialTransaction.update.mock.calls[1];
    expect(secondUpdate[0].data.deductedInIpcId).toBeNull();

    // IPC recalculated: gross 10000, retention 5% = 500, deductions 0
    // netPayable = 10000 − 500 − 1000 − 0 = 8500
    // finalPayable = 11300 − 500 − 1000 − 0 − 150 = 9650
    expect(anyDb.ipc.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "ipc-1" },
        data: expect.objectContaining({
          grossAmount: 10000,
          retentionAmount: 500,
          netPayable: 8500,
          vatAmount: 1300,
          tdsAmount: 150,
          finalPayable: 9650,
        }),
      }),
    );
  });

  it("NOT_FOUNDs a transaction from another project", async () => {
    member("engineer");
    anyDb.materialTransaction.findFirst.mockResolvedValue(null);
    const caller = createCaller(materialTxnRouter, USER);
    await expectTRPCError(
      caller.updateTransaction({
        projectId: "p-1",
        transactionId: "foreign-txn",
        isDebitable: true,
      }),
      "NOT_FOUND",
    );
  });
});

// ─── logDirectDelivery ─────────────────────────────────────────────────────
describe("materialTransaction.logDirectDelivery", () => {
  const deliveryInput = {
    projectId: "p-1",
    materialName: "Cement",
    unit: "bags",
    quantity: 10,
    rate: 100,
    totalAmount: 1130,
    date: "2026-08-01",
    supplierName: "Everest Suppliers",
    isVatBill: true,
    vatPercent: 13,
    isTdsDeductible: false,
    paymentStatus: "credit" as const,
  };

  /**
   * REGRESSION: logDirectDelivery used to call
   * assertNotLocked(input.projectId) — passing the PROJECT id where the
   * ORGANIZATION id is expected. The lock query could never match, so
   * back-dated deliveries into locked fiscal years were silently allowed.
   * The lock must be looked up with the caller's org id and the delivery date.
   */
  it("rejects a delivery dated in a locked fiscal year for the caller's org", async () => {
    member("engineer");
    anyDb.fiscalYearLock.findFirst.mockImplementation(async (args: any) =>
      args.where.organizationId === "org-1" ? { fiscalYear: "2083-84" } : null,
    );
    const caller = createCaller(materialTxnRouter, USER);
    await expectTRPCError(caller.logDirectDelivery(deliveryInput), "FORBIDDEN");
    expect(anyDb.materialTransaction.create).not.toHaveBeenCalled();
  });

  it("credit delivery creates a VAT bill (not a payment) and back-computes the taxable amount", async () => {
    member("engineer");
    anyDb.material.findFirst.mockResolvedValue(null);
    anyDb.material.create.mockResolvedValue(material({ id: "m-9", currentStock: 0 }));
    anyDb.material.update.mockResolvedValue(material({ id: "m-9", currentStock: 10 }));
    anyDb.partner.findFirst.mockResolvedValue(null);

    const caller = createCaller(materialTxnRouter, USER);
    await caller.logDirectDelivery(deliveryInput);

    expect(anyDb.payment.create).not.toHaveBeenCalled();
    const vatData = anyDb.vatBill.create.mock.calls[0][0].data;
    expect(vatData.taxableAmount).toBe(1000);
    expect(vatData.vatAmount).toBe(130);
    expect(vatData.vatPercent).toBe(13);
    expect(vatData.totalAmount).toBe(1130);
    expect(vatData.netPayable).toBe(1130);
  });

  it("paid_now delivery decrements the org bank account and records the payment", async () => {
    member("engineer");
    anyDb.material.findFirst.mockResolvedValue(material({ id: "m-9" }));
    anyDb.material.update.mockResolvedValue(material({ id: "m-9", currentStock: 110 }));
    anyDb.partner.findFirst.mockResolvedValue(null);
    anyDb.companyBankAccount.findUnique.mockResolvedValue({
      id: "bank-1",
      organizationId: "org-1",
      currentBalance: 50000,
    });

    const caller = createCaller(materialTxnRouter, USER);
    await caller.logDirectDelivery({
      ...deliveryInput,
      paymentStatus: "paid_now",
      bankAccountId: "bank-1",
    });

    expect(anyDb.payment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ amount: 1130, payeeName: "Everest Suppliers" }),
      }),
    );
    expect(anyDb.companyBankAccount.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "bank-1" },
        data: { currentBalance: { decrement: 1130 } },
      }),
    );
    expect(anyDb.vatBill.create).not.toHaveBeenCalled();
  });

  it("FORBIDDENs a bank account outside the caller's org", async () => {
    member("engineer");
    anyDb.material.findFirst.mockResolvedValue(material({ id: "m-9" }));
    anyDb.material.update.mockResolvedValue(material({ id: "m-9", currentStock: 110 }));
    anyDb.partner.findFirst.mockResolvedValue(null);
    anyDb.companyBankAccount.findUnique.mockResolvedValue({
      id: "bank-2",
      organizationId: "org-2",
      currentBalance: 100,
    });

    const caller = createCaller(materialTxnRouter, USER);
    await expectTRPCError(
      caller.logDirectDelivery({
        ...deliveryInput,
        paymentStatus: "paid_now",
        bankAccountId: "bank-2",
      }),
      "FORBIDDEN",
    );
    expect(anyDb.payment.create).not.toHaveBeenCalled();
  });
});
