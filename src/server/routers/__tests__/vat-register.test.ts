/**
 * Router-layer tests for vat-register (Nepal statutory VAT schedules).
 *
 * Pins:
 *   - Schedule 8 (Purchase Register): exempt vs taxable bucketing for GRNs
 *     (vatPercent=0 → exempt), PAN-less spot hires → exempt, direct bills
 *     routed to capital-goods / import buckets
 *   - Schedule 9 (Sales Register): CLIENT IPCs only (subcontractorId null,
 *     statutory statuses), and ZERO-VAT/zero-TDS IPCs are reported as 0 —
 *     NOT silently re-rated at 13% / 1.5% (regression: `||` fallback bug)
 *   - Schedule 10: net VAT payable vs credit direction
 *   - createDirectVatBill: explicit vatPercent=0 (VAT-exempt bill) produces
 *     zero VAT — regression for the `input.vatPercent || 13` bug
 *   - attachScannedBill IDOR guard: targets outside the project are NOT_FOUND
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { buildUser, createCaller, expectTRPCError, orgPolicyFixture } from "./test-utils";

vi.mock("@/lib/db", async () => {
  const { buildDbMock } = await import("./test-utils");
  const db = buildDbMock();
  return { db, getFreshDb: () => db };
});

import { db } from "@/lib/db";
import { vatRegisterRouter } from "../vat-register";

const anyDb = db as any;
const ENGINEER = buildUser();

function member(role: string | null) {
  anyDb.projectMember.findUnique.mockResolvedValue(role ? { role } : null);
}

beforeEach(() => {
  vi.resetAllMocks();
  // assertDelegation/capabilityGuard resolve the caller's org (Phase C).
  anyDb.organization.findUnique.mockResolvedValue(orgPolicyFixture());
});

// ─── Schedule 8: Purchase Register ──────────────────────────────────────────
describe("vatRegister.getPurchaseRegister", () => {
  it("FORBIDDENs non-project-members", async () => {
    member(null);
    const caller = createCaller(vatRegisterRouter, ENGINEER);
    await expectTRPCError(
      caller.getPurchaseRegister({ projectId: "p-1" }),
      "FORBIDDEN",
    );
  });

  it("buckets VAT-exempt GRNs (vatPercent=0) as exempt with zero VAT", async () => {
    member("engineer");
    anyDb.materialTransaction.findMany.mockResolvedValue([
      {
        id: "mat-1",
        date: new Date("2026-08-01"),
        quantity: 10,
        rate: 100,
        vatPercent: 0,      // legitimately exempt
        vatAmount: 0,
        tdsAmount: 0,
        material: { name: "Sand", code: "M-01", unit: "cft" },
      },
      {
        id: "mat-2",
        date: new Date("2026-08-02"),
        quantity: 4,
        rate: 1000,
        vatPercent: 13,
        vatAmount: 520,
        tdsAmount: 60,
        material: { name: "Cement", code: "M-02", unit: "bag" },
      },
    ]);

    const caller = createCaller(vatRegisterRouter, ENGINEER);
    const res = await caller.getPurchaseRegister({ projectId: "p-1" });

    expect(res.rows).toHaveLength(2);
    const byId = new Map<string, any>(res.rows.map((r: any) => [r.sourceRefId, r] as [string, any]));
    const exempt = byId.get("mat-1");
    const taxable = byId.get("mat-2");
    expect(exempt.taxableLocal).toBe(0);
    expect(exempt.exemptAmount).toBe(1000);
    expect(exempt.vatAmount).toBe(0);
    expect(taxable.taxableLocal).toBe(4000);
    expect(taxable.vatAmount).toBe(520);
    expect(taxable.netPayable).toBe(4000 + 520 - 60);

    expect(res.totals.totalTaxableLocal).toBe(4000);
    expect(res.totals.totalExempt).toBe(1000);
    expect(res.totals.totalInputVat).toBe(520);
    expect(res.totals.totalTdsDeducted).toBe(60);
  });

  it("reports a zero-VAT subcontractor bill with zero VAT (no silent 13%)", async () => {
    member("engineer");
    anyDb.subcontractorBill.findMany.mockResolvedValue([
      {
        id: "sb-1",
        number: "SUB-001",
        billDate: new Date("2026-08-01"),
        grossAmount: 100000,
        vatAmount: 0, // VAT-exempt subcontract
        tdsAmount: 1500,
        netPayable: 98500,
        subcontractor: { name: "ABC Sub", pan: "601234567" },
      },
    ]);

    const caller = createCaller(vatRegisterRouter, ENGINEER);
    const res = await caller.getPurchaseRegister({ projectId: "p-1" });

    const row = res.rows[0];
    expect(row.taxableLocal).toBe(100000);
    expect(row.vatAmount).toBe(0); // regression: was 13000 via `|| 0.13`
    expect(row.totalAmount).toBe(100000);
    expect(res.totals.totalInputVat).toBe(0);
  });

  it("splits spot hires by PAN presence (no PAN → exempt)", async () => {
    member("engineer");
    anyDb.equipmentSpotHire.findMany.mockResolvedValue([
      {
        id: "sp-1",
        date: new Date("2026-08-01"),
        totalGross: 1000,
        slipNumber: "SLIP-1",
        vendorName: "Registered Vendor",
        machineName: "Excavator",
        hireType: "hour",
        hoursWorked: 5,
        partner: { pan: "609998877" },
        vendor: null,
        netPayable: 1130,
      },
      {
        id: "sp-2",
        date: new Date("2026-08-02"),
        totalGross: 400,
        slipNumber: "SLIP-2",
        vendorName: "Casual Local Owner",
        machineName: "Tipper",
        hireType: "trip",
        tripCount: 2,
        partner: null,
        vendor: null,
        netPayable: 400,
      },
    ]);

    const caller = createCaller(vatRegisterRouter, ENGINEER);
    const res = await caller.getPurchaseRegister({ projectId: "p-1" });

    const byId = new Map<string, any>(res.rows.map((r: any) => [r.sourceRefId, r] as [string, any]));
    const withPan = byId.get("sp-1");
    const withoutPan = byId.get("sp-2");
    expect(withPan.taxableLocal).toBe(1000);
    expect(withPan.vatAmount).toBe(130);
    expect(withoutPan.exemptAmount).toBe(400);
    expect(withoutPan.vatAmount).toBe(0);
  });

  it("routes direct bills to capital-goods and import buckets", async () => {
    member("engineer");
    anyDb.vatBill.findMany.mockResolvedValue([
      {
        id: "db-1",
        billNumber: "CG-001",
        billDate: new Date("2026-08-01"),
        billType: "capital_goods",
        taxableAmount: 5000,
        exemptAmount: 0,
        vatAmount: 650,
        totalAmount: 5650,
        tdsAmount: 0,
        netPayable: 5650,
        partyName: "Equipment Nepal",
        partyPan: "601112223",
      },
      {
        id: "db-2",
        billNumber: "IM-001",
        billDate: new Date("2026-08-02"),
        billType: "import",
        taxableAmount: 2000,
        exemptAmount: 0,
        vatAmount: 260,
        totalAmount: 2260,
        tdsAmount: 0,
        netPayable: 2260,
        partyName: "Foreign Supplier",
        partyPan: null,
      },
    ]);

    const caller = createCaller(vatRegisterRouter, ENGINEER);
    const res = await caller.getPurchaseRegister({ projectId: "p-1" });

    const byId = new Map<string, any>(res.rows.map((r: any) => [r.sourceRefId, r] as [string, any]));
    const cap = byId.get("db-1");
    const imp = byId.get("db-2");
    expect(cap.capitalGoods).toBe(5000);
    expect(cap.taxableLocal).toBe(0);
    expect(imp.importAmount).toBe(2000);
    expect(imp.taxableLocal).toBe(0);
    expect(res.totals.totalCapitalGoods).toBe(5000);
    expect(res.totals.totalImport).toBe(2000);
  });
});

// ─── Schedule 9: Sales Register ─────────────────────────────────────────────
describe("vatRegister.getSalesRegister", () => {
  it("includes only statutory CLIENT IPCs (no sub IPCs, no drafts)", async () => {
    member("engineer");
    anyDb.project.findUnique.mockResolvedValue({ name: "Highway", client: "NEA" });
    anyDb.ipc.findMany.mockResolvedValue([]);

    const caller = createCaller(vatRegisterRouter, ENGINEER);
    await caller.getSalesRegister({ projectId: "p-1" });

    const where = anyDb.ipc.findMany.mock.calls[0][0].where;
    expect(where.subcontractorId).toBeNull();
    expect(where.status).toEqual({ in: ["certified", "approved", "paid"] });
  });

  it("reports a zero-VAT zero-TDS IPC as zeros — no silent 13%/1.5% re-rating", async () => {
    member("engineer");
    anyDb.project.findUnique.mockResolvedValue({ name: "Highway", client: "NEA" });
    anyDb.ipc.findMany.mockResolvedValue([
      {
        id: "ipc-1",
        number: "03",
        issueDate: new Date("2026-08-01"),
        grossAmount: 100000,
        vatAmount: 0,        // VAT-exempt client contract (vatPercent=0 at create)
        tdsAmount: 0,        // TDS-exempt
        totalWithVat: 100000,
        retentionAmount: 5000,
        advanceRecovery: 0,
        finalPayable: 95000,
        clientName: "NEA",
        clientPan: "12345",
      },
    ]);

    const caller = createCaller(vatRegisterRouter, ENGINEER);
    const res = await caller.getSalesRegister({ projectId: "p-1" });

    const row = res.rows[0];
    expect(row.vatAmount).toBe(0);  // regression: was 13000
    expect(row.tdsAmount).toBe(0);  // regression: was 1500
    expect(row.totalAmount).toBe(100000);
    expect(row.netReceived).toBe(95000);
    expect(res.totals.totalOutputVat).toBe(0);
  });

  it("falls back to 13% only for legacy IPC rows with null VAT (pre-tracking data)", async () => {
    member("engineer");
    anyDb.project.findUnique.mockResolvedValue({ name: "Highway", client: "NEA" });
    anyDb.ipc.findMany.mockResolvedValue([
      {
        id: "ipc-old",
        number: "01",
        issueDate: new Date("2024-01-15"),
        grossAmount: 10000,
        vatAmount: null,     // legacy row
        tdsAmount: null,
        totalWithVat: null,
        retentionAmount: 500,
        advanceRecovery: 0,
        finalPayable: null,
        clientName: "NEA",
        clientPan: null,
      },
    ]);

    const caller = createCaller(vatRegisterRouter, ENGINEER);
    const res = await caller.getSalesRegister({ projectId: "p-1" });

    const row = res.rows[0];
    expect(row.vatAmount).toBe(1300);   // null → statutory 13% fallback
    expect(row.tdsAmount).toBe(150);    // null → 1.5% fallback
    expect(row.totalAmount).toBe(11300);
    expect(row.netReceived).toBe(11300 - 150 - 500);
  });
});

// ─── Schedule 10: VAT Return ────────────────────────────────────────────────
describe("vatRegister.getVatReturnSchedule10", () => {
  function primeAggregates({
    ipcVat = 260, ipcGross = 2000, salesVat = 30,
    subVat = 50, subGross = 400, purchaseVat = 20,
  } = {}) {
    anyDb.materialTransaction.findMany.mockResolvedValue([
      { quantity: 10, rate: 100, vatAmount: 130, vatPercent: 13 }, // taxable 1000, vat 130
      { quantity: 5, rate: 20, vatAmount: 0, vatPercent: 0 },      // exempt 100
    ]);
    anyDb.subcontractorBill.aggregate.mockResolvedValue({
      _sum: { vatAmount: subVat, grossAmount: subGross },
    });
    anyDb.equipmentSpotHire.findMany.mockResolvedValue([
      { totalGross: 500, partner: { pan: "PAN" }, vendor: null }, // taxable, vat 65
      { totalGross: 200, partner: null, vendor: null },           // exempt
    ]);
    anyDb.vatBill.aggregate.mockImplementation(async ({ where }) =>
      where.billType === "sales"
        ? { _sum: { vatAmount: salesVat, taxableAmount: 200, exemptAmount: 0 } }
        : { _sum: { vatAmount: purchaseVat, taxableAmount: 150, exemptAmount: 10 } },
    );
    anyDb.ipc.aggregate.mockResolvedValue({
      _sum: { vatAmount: ipcVat, grossAmount: ipcGross },
    });
  }

  it("computes net VAT PAYABLE when output exceeds input", async () => {
    member("engineer");
    primeAggregates(); // output 290 vs input 265

    const caller = createCaller(vatRegisterRouter, ENGINEER);
    const res = await caller.getVatReturnSchedule10({ projectId: "p-1" });

    expect(res.sales.outputVat).toBe(290);          // 260 IPC + 30 direct
    expect(res.purchases.inputVat).toBe(265);        // 130 mat + 50 sub + 65 spot + 20 direct
    expect(res.reconciliation.netVatPayable).toBe(25);
    expect(res.reconciliation.netVatCredit).toBe(0);
  });

  it("computes net VAT CREDIT when input exceeds output", async () => {
    member("engineer");
    primeAggregates({ ipcVat: 0, salesVat: 0 }); // output 0 vs input 265

    const caller = createCaller(vatRegisterRouter, ENGINEER);
    const res = await caller.getVatReturnSchedule10({ projectId: "p-1" });

    expect(res.reconciliation.netVatPayable).toBe(0);
    expect(res.reconciliation.netVatCredit).toBe(265);
  });

  it("splits purchases into taxable and exempt pools", async () => {
    member("engineer");
    primeAggregates();

    const caller = createCaller(vatRegisterRouter, ENGINEER);
    const res = await caller.getVatReturnSchedule10({ projectId: "p-1" });

    // 1000 mat + 400 sub + 500 spot + 150 direct
    expect(res.purchases.taxable).toBe(2050);
    // 100 exempt mat + 200 PAN-less spot + 10 exempt direct
    expect(res.purchases.exempt).toBe(310);
  });
});

// ─── createDirectVatBill ────────────────────────────────────────────────────
describe("vatRegister.createDirectVatBill", () => {
  const baseInput = {
    projectId: "p-1",
    billType: "purchase" as const,
    billNumber: "VB-001",
    partyName: "Supplier Pvt Ltd",
    taxableAmount: 10000,
    exemptAmount: 0,
    vatPercent: 13,
    tdsPercent: 1.5,
  };

  it("FORBIDDENs non-members with no write", async () => {
    member(null);
    const caller = createCaller(vatRegisterRouter, ENGINEER);
    await expectTRPCError(caller.createDirectVatBill(baseInput), "FORBIDDEN");
    expect(anyDb.vatBill.create).not.toHaveBeenCalled();
  });

  it("computes VAT, TDS and net payable", async () => {
    member("engineer");
    const caller = createCaller(vatRegisterRouter, ENGINEER);
    await caller.createDirectVatBill(baseInput);

    const data = anyDb.vatBill.create.mock.calls[0][0].data;
    expect(data.vatAmount).toBe(1300);
    expect(data.tdsAmount).toBe(150);
    expect(data.totalAmount).toBe(11300);
    expect(data.netPayable).toBe(11150);
  });

  it("respects an explicit vatPercent=0 (VAT-exempt bill) — regression", async () => {
    member("engineer");
    const caller = createCaller(vatRegisterRouter, ENGINEER);
    await caller.createDirectVatBill({ ...baseInput, vatPercent: 0 });

    const data = anyDb.vatBill.create.mock.calls[0][0].data;
    expect(data.vatAmount).toBe(0);        // regression: was 1300 via `|| 13`
    expect(data.totalAmount).toBe(10000);
    expect(data.netPayable).toBe(9850);     // TDS 1.5% still withheld
  });

  it("marks the bill attached only when a scan URL is provided", async () => {
    member("engineer");
    const caller = createCaller(vatRegisterRouter, ENGINEER);
    await caller.createDirectVatBill({
      ...baseInput,
      scannedBillUrl: "/api/files/scan-abc123",
    });
    const withScan = anyDb.vatBill.create.mock.calls[0][0].data;
    expect(withScan.isBillAttached).toBe(true);

    await caller.createDirectVatBill(baseInput);
    const withoutScan = anyDb.vatBill.create.mock.calls[1][0].data;
    expect(withoutScan.isBillAttached).toBe(false);
  });
});

// ─── attachScannedBill (IDOR) ───────────────────────────────────────────────
describe("vatRegister.attachScannedBill", () => {
  const attachInput = {
    projectId: "p-1",
    targetType: "material_grn" as const,
    targetId: "txn-1",
    scannedBillUrl: "/api/files/scan-abc123",
  };

  it("NOT_FOUNDs a target that does not belong to the caller's project", async () => {
    member("engineer");
    anyDb.materialTransaction.findFirst.mockResolvedValue(null);
    const caller = createCaller(vatRegisterRouter, ENGINEER);
    await expectTRPCError(caller.attachScannedBill(attachInput), "NOT_FOUND");
    expect(anyDb.materialTransaction.update).not.toHaveBeenCalled();
  });

  it("updates the target and flags isBillAttached when it does belong", async () => {
    member("engineer");
    anyDb.materialTransaction.findFirst.mockResolvedValue({ id: "txn-1" });
    const caller = createCaller(vatRegisterRouter, ENGINEER);
    const res = await caller.attachScannedBill(attachInput);
    expect(res.success).toBe(true);
    expect(anyDb.materialTransaction.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "txn-1" },
        data: expect.objectContaining({
          scannedBillUrl: "/api/files/scan-abc123",
          isBillAttached: true,
        }),
      }),
    );
  });
});
