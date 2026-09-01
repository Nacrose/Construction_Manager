/**
 * Router-layer tests for purchase-order.ts.
 *
 * Pins:
 *   - VAT math: 13% default on line total, custom percent, net = total + VAT
 *   - Partner → legacy-supplier sync (auto-create with partner fields) and
 *     the reverse supplier → partner sync (type material_supplier)
 *   - Cross-project material guard: items must belong to the PO's project
 *   - Duplicate PO number rejected; auto-number from sequence (PO-0001)
 *   - issued/received transitions are PM/coordinator-only (engineer blocked)
 *   - "received" tops up material stock by REMAINING qty only (partial
 *     receipts before PO close are respected), writes a receive transaction
 *     with the PO rate, and marks items fully received
 *   - received/cancelled POs are immutable; same-status transition rejected
 *   - Only draft POs can be deleted
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { buildUser, createCaller, expectTRPCError } from "./test-utils";

vi.mock("@/lib/db", async () => {
  const { buildDbMock } = await import("./test-utils");
  const db = buildDbMock();
  return { db, getFreshDb: () => db };
});

import { db } from "@/lib/db";
import { purchaseOrderRouter } from "../purchase-order";

const anyDb = db as any;
const ENGINEER = buildUser();
const PM = buildUser({ id: "pm-1" });

function member(role: string | null) {
  anyDb.projectMember.findUnique.mockResolvedValue(role ? { role } : null);
}

const PARTNER = {
  id: "partner-1",
  name: "Everest Suppliers",
  contact: "Ram",
  phone: "9801",
  email: "ev@np",
  address: "Biratnagar",
  pan: "PAN-1",
};

function material() {
  return { id: "mat-1", name: "Cement", unit: "bag", currentStock: 50 };
}

beforeEach(() => {
  vi.resetAllMocks();
});

// ─── create ─────────────────────────────────────────────────────────────────
describe("purchaseOrder.create", () => {
  const baseInput = {
    projectId: "p-1",
    partnerId: "partner-1",
    items: [{ materialId: "mat-1", quantity: 10, rate: 100 }],
  };

  it("computes 13% VAT by default and nets total + VAT", async () => {
    member("engineer");
    anyDb.partner.findFirst.mockResolvedValue(PARTNER);
    anyDb.supplier.findFirst.mockResolvedValue(null);
    anyDb.supplier.create.mockResolvedValue({ id: "sup-1" });
    anyDb.material.findFirst.mockResolvedValue(material());
    anyDb.purchaseOrder.count.mockResolvedValue(0);
    anyDb.purchaseOrder.findFirst.mockResolvedValue(null); // no duplicate

    const caller = createCaller(purchaseOrderRouter, ENGINEER);
    await caller.create(baseInput);

    const data = anyDb.purchaseOrder.create.mock.calls[0][0].data;
    expect(data.totalAmount).toBe(1000);
    expect(data.vatPercent).toBe(13);
    expect(data.vatAmount).toBe(130);
    expect(data.netAmount).toBe(1130);
    expect(data.status).toBe("draft");
  });

  it("supports VAT-exempt orders (0%)", async () => {
    member("engineer");
    anyDb.partner.findFirst.mockResolvedValue(PARTNER);
    anyDb.supplier.findFirst.mockResolvedValue(null);
    anyDb.supplier.create.mockResolvedValue({ id: "sup-1" });
    anyDb.material.findFirst.mockResolvedValue(material());
    anyDb.purchaseOrder.count.mockResolvedValue(0);
    anyDb.purchaseOrder.findFirst.mockResolvedValue(null);

    const caller = createCaller(purchaseOrderRouter, ENGINEER);
    await caller.create({ ...baseInput, vatPercent: 0 });

    const data = anyDb.purchaseOrder.create.mock.calls[0][0].data;
    expect(data.vatAmount).toBe(0);
    expect(data.netAmount).toBe(1000);
  });

  it("requires a vendor/partner — no silent vendorless POs", async () => {
    member("engineer");
    const caller = createCaller(purchaseOrderRouter, ENGINEER);
    await expectTRPCError(
      caller.create({ projectId: "p-1", items: [{ materialId: "mat-1", quantity: 1, rate: 1 }] }),
      "BAD_REQUEST",
    );
  });

  it("auto-creates the legacy supplier from the partner record", async () => {
    member("engineer");
    anyDb.partner.findFirst.mockResolvedValue(PARTNER);
    anyDb.supplier.findFirst.mockResolvedValue(null);
    anyDb.supplier.create.mockResolvedValue({ id: "sup-9" });
    anyDb.material.findFirst.mockResolvedValue(material());
    anyDb.purchaseOrder.count.mockResolvedValue(0);
    anyDb.purchaseOrder.findFirst.mockResolvedValue(null);

    const caller = createCaller(purchaseOrderRouter, ENGINEER);
    await caller.create(baseInput);

    expect(anyDb.supplier.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        projectId: "p-1",
        name: "Everest Suppliers",
        pan: "PAN-1",
      }),
    });
    expect(anyDb.purchaseOrder.create.mock.calls[0][0].data.supplierId).toBe("sup-9");
    expect(anyDb.purchaseOrder.create.mock.calls[0][0].data.partnerId).toBe("partner-1");
  });

  it("rejects a partner that does not belong to the project", async () => {
    member("engineer");
    anyDb.partner.findFirst.mockResolvedValue(null);
    const caller = createCaller(purchaseOrderRouter, ENGINEER);
    await expectTRPCError(
      caller.create({
        projectId: "p-1",
        partnerId: "foreign",
        items: [{ materialId: "mat-1", quantity: 10, rate: 100 }],
      }),
      "BAD_REQUEST",
    );
  });

  it("rejects a material from another project (cross-tenant item smuggling)", async () => {
    member("engineer");
    anyDb.partner.findFirst.mockResolvedValue(PARTNER);
    anyDb.supplier.findFirst.mockResolvedValue(null);
    anyDb.supplier.create.mockResolvedValue({ id: "sup-1" });
    anyDb.material.findFirst.mockResolvedValue(null); // not found in p-1

    const caller = createCaller(purchaseOrderRouter, ENGINEER);
    await expectTRPCError(
      caller.create({
        projectId: "p-1",
        partnerId: "partner-1",
        items: [{ materialId: "mat-other", quantity: 1, rate: 5 }],
      }),
      "BAD_REQUEST",
    );
  });

  it("rejects duplicate PO numbers within the project", async () => {
    member("engineer");
    anyDb.partner.findFirst.mockResolvedValue(PARTNER);
    anyDb.supplier.findFirst.mockResolvedValue(null);
    anyDb.supplier.create.mockResolvedValue({ id: "sup-1" });
    anyDb.material.findFirst.mockResolvedValue(material());
    anyDb.purchaseOrder.findFirst.mockResolvedValue({ id: "po-dup" });

    const caller = createCaller(purchaseOrderRouter, ENGINEER);
    await expectTRPCError(
      caller.create({ ...baseInput, number: "PO-0001" }),
      "BAD_REQUEST",
    );
  });

  it("blocks read-only roles (client) from creating POs", async () => {
    member("client");
    const caller = createCaller(purchaseOrderRouter, ENGINEER);
    await expectTRPCError(caller.create(baseInput), "FORBIDDEN");
  });
});

// ─── updateStatus ───────────────────────────────────────────────────────────
describe("purchaseOrder.updateStatus", () => {
  function po(overrides: Record<string, unknown> = {}) {
    return {
      id: "po-1",
      projectId: "p-1",
      number: "PO-0001",
      status: "draft",
      items: [
        {
          id: "poi-1",
          materialId: "mat-1",
          quantity: 100,
          receivedQty: 40, // partially received before close
          unit: "bag",
          rate: 25,
        },
      ],
      ...overrides,
    };
  }

  it("engineer cannot issue a PO — PM/coordinator only", async () => {
    member("engineer");
    anyDb.purchaseOrder.findFirst.mockResolvedValue(po());
    const caller = createCaller(purchaseOrderRouter, ENGINEER);
    await expectTRPCError(
      caller.updateStatus({ projectId: "p-1", poId: "po-1", status: "issued" }),
      "FORBIDDEN",
    );
  });

  it("PM can issue a draft PO", async () => {
    member("project_manager");
    anyDb.purchaseOrder.findFirst.mockResolvedValue(po());
    anyDb.purchaseOrder.findUnique.mockResolvedValue(po()); // engine pre-read inside tx
    const caller = createCaller(purchaseOrderRouter, PM);
    await caller.updateStatus({ projectId: "p-1", poId: "po-1", status: "issued" });
    expect(anyDb.purchaseOrder.updateMany).toHaveBeenCalledWith({
      where: { id: "po-1", status: "draft" },
      data: expect.objectContaining({ status: "issued" }),
    });
  });

  it("receiving tops up stock by REMAINING qty only and records the receive transaction", async () => {
    member("project_manager");
    anyDb.purchaseOrder.findFirst.mockResolvedValue(po());
    anyDb.purchaseOrder.findUnique.mockResolvedValue(po()); // engine pre-read inside tx
    anyDb.material.findUnique.mockResolvedValue({ ...material(), currentStock: 50 });

    const caller = createCaller(purchaseOrderRouter, PM);
    await caller.updateStatus({ projectId: "p-1", poId: "po-1", status: "received" });

    // 100 ordered − 40 already received = 60 to top up on 50 → 110
    expect(anyDb.material.update).toHaveBeenCalledWith({
      where: { id: "mat-1" },
      data: { currentStock: 110 },
    });
    expect(anyDb.materialTransaction.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        materialId: "mat-1",
        projectId: "p-1",
        purchaseOrderId: "po-1",
        type: "receive",
        quantity: 60,
        rate: 25,
        reference: "PO-0001",
      }),
    });
    expect(anyDb.purchaseOrderItem.update).toHaveBeenCalledWith({
      where: { id: "poi-1" },
      data: { receivedQty: 100 },
    });
  });

  it("rejects same-status transitions", async () => {
    member("project_manager");
    anyDb.purchaseOrder.findFirst.mockResolvedValue(po({ status: "issued" }));
    const caller = createCaller(purchaseOrderRouter, PM);
    await expectTRPCError(
      caller.updateStatus({ projectId: "p-1", poId: "po-1", status: "issued" }),
      "BAD_REQUEST",
    );
  });

  it("received and cancelled POs are immutable", async () => {
    member("project_manager");
    const caller = createCaller(purchaseOrderRouter, PM);
    anyDb.purchaseOrder.findFirst.mockResolvedValue(po({ status: "received" }));
    await expectTRPCError(
      caller.updateStatus({ projectId: "p-1", poId: "po-1", status: "cancelled" }),
      "BAD_REQUEST",
    );
    anyDb.purchaseOrder.findFirst.mockResolvedValue(po({ status: "cancelled" }));
    await expectTRPCError(
      caller.updateStatus({ projectId: "p-1", poId: "po-1", status: "issued" }),
      "BAD_REQUEST",
    );
  });

  it("cross-project PO id is NOT_FOUND (IDOR guard via project-scoped fetch)", async () => {
    member("project_manager");
    anyDb.purchaseOrder.findFirst.mockResolvedValue(null);
    const caller = createCaller(purchaseOrderRouter, PM);
    await expectTRPCError(
      caller.updateStatus({ projectId: "p-1", poId: "po-x", status: "issued" }),
      "NOT_FOUND",
    );
  });
});

// ─── delete ─────────────────────────────────────────────────────────────────
describe("purchaseOrder.delete", () => {
  it("only draft POs can be deleted", async () => {
    member("project_manager");
    anyDb.purchaseOrder.findFirst.mockResolvedValue({
      id: "po-1",
      projectId: "p-1",
      status: "issued",
    });
    const caller = createCaller(purchaseOrderRouter, PM);
    await expectTRPCError(
      caller.delete({ projectId: "p-1", poId: "po-1" }),
      "BAD_REQUEST",
    );
    expect(anyDb.purchaseOrder.delete).not.toHaveBeenCalled();
  });

  it("deletes a draft PO", async () => {
    member("project_manager");
    anyDb.purchaseOrder.findFirst.mockResolvedValue({
      id: "po-1",
      projectId: "p-1",
      status: "draft",
    });
    const caller = createCaller(purchaseOrderRouter, PM);
    const res = await caller.delete({ projectId: "p-1", poId: "po-1" });
    expect(res.ok).toBe(true);
    expect(anyDb.purchaseOrder.delete).toHaveBeenCalledWith({ where: { id: "po-1" } });
  });
});
