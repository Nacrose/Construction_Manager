/**
 * Router-layer tests for vendor-bill (Accounts Payable).
 *
 * Pins the Nepal AP invariants:
 *   - 3-Way Match: no billing against a PO with zero GRN value; >10%
 *     over-billing on an open PO is rejected
 *   - VAT 13% / TDS 1.5% math: netPayable = gross + VAT − TDS
 *   - Liability JE at create: Dr 5001/1410, Cr 2020/2001, balanced
 *   - Fiscal-year lock rejects BEFORE any write
 *   - Overpayment guard + atomic paidAmount increment on recordPayment
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { buildUser, createCaller, expectTRPCError } from "./test-utils";

vi.mock("@/lib/db", async () => {
  const { buildDbMock } = await import("./test-utils");
  const db = buildDbMock();
  return { db, getFreshDb: () => db };
});

import { db } from "@/lib/db";
import { vendorBillRouter } from "../vendor-bill";

const anyDb = db as any;

const ENGINEER = buildUser(); // org-1 member
const PM = buildUser();
const CLIENT = buildUser(); // read-only role comes from membership mock

function member(role: string | null) {
  anyDb.projectMember.findUnique.mockResolvedValue(role ? { role } : null);
}

beforeEach(() => {
  // resetAllMocks (not clearAllMocks): clears per-test mockResolvedValue
  // implementations too, restoring the harness defaults — clearAllMocks
  // leaked implementations across tests within a file (e.g. a fiscal-lock
  // mock from one test firing FORBIDDEN in unrelated later tests).
  vi.resetAllMocks();
  anyDb.partner.findFirst.mockResolvedValue({ id: "partner-1", projectId: "p-1" });
});

// ─── Authorization ───────────────────────────────────────────────────────────
describe("vendorBill.list", () => {
  it("FORBIDDENs non-project-members", async () => {
    member(null);
    const caller = createCaller(vendorBillRouter, ENGINEER);
    await expectTRPCError(caller.list({ projectId: "p-1" }), "FORBIDDEN");
  });
});

describe("vendorBill.create authorization", () => {
  it("FORBIDDENs read-only roles (client/inspector)", async () => {
    member("client");
    const caller = createCaller(vendorBillRouter, CLIENT);
    await expectTRPCError(
      caller.create({
        projectId: "p-1",
        partnerId: "partner-1",
        billNumber: "B-001",
        billDate: "2026-08-01",
        grossAmount: 1000,
      }),
      "FORBIDDEN",
    );
    expect(anyDb.vendorBill.create).not.toHaveBeenCalled();
  });
});

// ─── 3-Way Match ─────────────────────────────────────────────────────────────
describe("vendorBill.create 3-way match", () => {
  const baseInput = {
    projectId: "p-1",
    partnerId: "partner-1",
    billNumber: "B-001",
    billDate: "2026-08-01",
    grossAmount: 1000,
    purchaseOrderId: "po-1",
  };

  it("NOT_FOUNDs a PO that does not belong to the project", async () => {
    member("engineer");
    anyDb.purchaseOrder.findFirst.mockResolvedValue(null);
    const caller = createCaller(vendorBillRouter, ENGINEER);
    await expectTRPCError(caller.create(baseInput), "NOT_FOUND");
    expect(anyDb.vendorBill.create).not.toHaveBeenCalled();
  });

  it("BAD_REQUESTs billing against a PO with zero GRN value", async () => {
    member("engineer");
    anyDb.purchaseOrder.findFirst.mockResolvedValue({
      id: "po-1",
      number: "PO-001",
      status: "open",
      transactions: [],
    });
    const caller = createCaller(vendorBillRouter, ENGINEER);
    await expectTRPCError(caller.create(baseInput), "BAD_REQUEST");
    expect(anyDb.vendorBill.create).not.toHaveBeenCalled();
  });

  it("BAD_REQUESTs billing >10% over received value on an open PO", async () => {
    member("engineer");
    anyDb.purchaseOrder.findFirst.mockResolvedValue({
      id: "po-1",
      number: "PO-001",
      status: "open",
      transactions: [{ quantity: 10, rate: 100 }], // GRN value 1000
    });
    const caller = createCaller(vendorBillRouter, ENGINEER);
    await expectTRPCError(
      caller.create({ ...baseInput, grossAmount: 1200 }), // > 1000 * 1.10
      "BAD_REQUEST",
    );
    expect(anyDb.vendorBill.create).not.toHaveBeenCalled();
  });
});

// ─── VAT / TDS math + liability JE ──────────────────────────────────────────
describe("vendorBill.create happy path", () => {
  it("computes VAT/TDS/net and posts a balanced liability JE", async () => {
    member("engineer");
    anyDb.vendorBill.create.mockResolvedValue({
      id: "bill-1",
      billNumber: "B-001",
      partnerId: "partner-1",
      partner: { name: "Acme Bricks" },
    });

    const caller = createCaller(vendorBillRouter, ENGINEER);
    const res = await caller.create({
      projectId: "p-1",
      partnerId: "partner-1",
      billNumber: "B-001",
      billDate: "2026-08-01",
      grossAmount: 100000,
    });

    expect(res.bill.id).toBe("bill-1");

    // VAT 13%, TDS 1.5%, net = gross + VAT − TDS
    const createData = anyDb.vendorBill.create.mock.calls[0][0].data;
    expect(createData.vatAmount).toBe(13000);
    expect(createData.tdsAmount).toBe(1500);
    expect(createData.netPayable).toBe(111500);
    expect(createData.paidAmount).toBe(0);
    expect(createData.status).toBe("unpaid");

    // Liability JE: Dr 5001 gross, Dr 1410 VAT, Cr 2020 TDS, Cr 2001 net
    const jeData = anyDb.journalEntry.create.mock.calls[0][0].data;
    expect(jeData.source).toBe("vendor_bill");
    expect(jeData.organizationId).toBe("org-1");
    expect(jeData.totalDebit).toBe(113000);
    expect(jeData.totalCredit).toBe(113000);

    const lines = jeData.lines.create;
    expect(lines).toHaveLength(4);
    expect(lines[0]).toMatchObject({ accountCode: "5001", debit: 100000, credit: 0 });
    expect(lines[1]).toMatchObject({ accountCode: "1410", debit: 13000, credit: 0 });
    expect(lines[2]).toMatchObject({ accountCode: "2020", debit: 0, credit: 1500 });
    expect(lines[3]).toMatchObject({ accountCode: "2001", debit: 0, credit: 111500 });
  });

  it("omits the 1410 VAT line when vatPercent is 0", async () => {
    member("engineer");
    anyDb.vendorBill.create.mockResolvedValue({ id: "bill-2", billNumber: "B-002" });

    const caller = createCaller(vendorBillRouter, ENGINEER);
    await caller.create({
      projectId: "p-1",
      partnerId: "partner-1",
      billNumber: "B-002",
      billDate: "2026-08-01",
      grossAmount: 10000,
      vatPercent: 0,
    });

    const createData = anyDb.vendorBill.create.mock.calls[0][0].data;
    expect(createData.vatAmount).toBe(0);
    expect(createData.netPayable).toBe(9850); // 10000 − 150 TDS

    const lines = anyDb.journalEntry.create.mock.calls[0][0].data.lines.create;
    expect(lines).toHaveLength(3); // no 1410 line
    expect(lines.map((l: any) => l.accountCode)).toEqual(["5001", "2020", "2001"]);
  });
});

// ─── Fiscal-year lock ────────────────────────────────────────────────────────
describe("vendorBill.create fiscal-year lock", () => {
  it("FORBIDDENs bills dated inside a locked fiscal year BEFORE any write", async () => {
    member("engineer");
    anyDb.fiscalYearLock.findFirst.mockResolvedValue({ fiscalYear: "2083-84" });

    const caller = createCaller(vendorBillRouter, ENGINEER);
    await expectTRPCError(
      caller.create({
        projectId: "p-1",
        partnerId: "partner-1",
        billNumber: "B-003",
        billDate: "2026-08-01",
        grossAmount: 5000,
      }),
      "FORBIDDEN",
    );
    // Lock check must fire before the bill row (and its JE) is written
    expect(anyDb.vendorBill.create).not.toHaveBeenCalled();
    expect(anyDb.journalEntry.create).not.toHaveBeenCalled();
    // and it must have consulted the lock table for the BILL date
    const where = anyDb.fiscalYearLock.findFirst.mock.calls[0][0].where;
    expect(where.isLocked).toBe(true);
    expect(where.endDate.gte).toEqual(new Date("2026-08-01"));
  });
});

// ─── Payments ────────────────────────────────────────────────────────────────
describe("vendorBill.recordPayment", () => {
  const payInput = { projectId: "p-1", vendorBillId: "bill-1", amount: 1000 };

  it("FORBIDDENs non-admin roles (needs PM/coordinator)", async () => {
    member("engineer");
    const caller = createCaller(vendorBillRouter, ENGINEER);
    await expectTRPCError(
      caller.recordPayment({ ...payInput, amount: 100 }),
      "FORBIDDEN",
    );
    expect(anyDb.vendorPayment.create).not.toHaveBeenCalled();
  });

  it("NOT_FOUNDs a bill that is not in the authorized project", async () => {
    member("project_manager");
    anyDb.vendorBill.findFirst.mockResolvedValue(null); // scoped by projectId
    const caller = createCaller(vendorBillRouter, PM);
    await expectTRPCError(caller.recordPayment(payInput), "NOT_FOUND");
  });

  it("BAD_REQUESTs overpayment beyond remaining net payable", async () => {
    member("project_manager");
    anyDb.vendorBill.findFirst.mockResolvedValue({
      id: "bill-1",
      netPayable: 100000,
      paidAmount: 95000, // remaining 5000
      billNumber: "B-001",
      partner: { id: "p-1", name: "Acme" },
    });
    const caller = createCaller(vendorBillRouter, PM);
    await expectTRPCError(
      caller.recordPayment({ ...payInput, amount: 6000 }),
      "BAD_REQUEST",
    );
    expect(anyDb.vendorPayment.create).not.toHaveBeenCalled();
  });

  it("full payment → status paid + atomic increment + balanced payment JE", async () => {
    member("project_manager");
    anyDb.vendorBill.findFirst.mockResolvedValue({
      id: "bill-1",
      netPayable: 111500,
      paidAmount: 0,
      billNumber: "B-001",
      partner: { id: "partner-1", name: "Acme" },
    });

    const caller = createCaller(vendorBillRouter, PM);
    const res = await caller.recordPayment({ ...payInput, amount: 111500 });

    expect(res.newStatus).toBe("paid");
    expect(res.remainingPayable).toBe(0);

    // Payment row records who paid it
    const payData = anyDb.vendorPayment.create.mock.calls[0][0].data;
    expect(payData.amount).toBe(111500);
    expect(payData.createdById).toBe(PM.id);

    // Atomic increment (NOT read-then-write) via raw UPDATE
    expect(anyDb.$executeRaw).toHaveBeenCalledTimes(1);
    const rawArgs = anyDb.$executeRaw.mock.calls[0];
    expect(rawArgs[1]).toBe(111500); // amount param
    expect(rawArgs[2]).toBe("paid"); // status param
    expect(rawArgs[3]).toBe("bill-1"); // id param

    // Payment JE: Dr 2001 (Sundry Creditors) = Cr 1010 (Bank)
    const jeData = anyDb.journalEntry.create.mock.calls[0][0].data;
    expect(jeData.totalDebit).toBe(111500);
    expect(jeData.totalCredit).toBe(111500);
    expect(jeData.lines.create[0]).toMatchObject({
      accountCode: "2001",
      debit: 111500,
    });
  });

  it("partial payment → partially_paid with remaining balance", async () => {
    member("project_manager");
    anyDb.vendorBill.findFirst.mockResolvedValue({
      id: "bill-1",
      netPayable: 100000,
      paidAmount: 0,
      billNumber: "B-001",
      partner: { id: "partner-1", name: "Acme" },
    });

    const caller = createCaller(vendorBillRouter, PM);
    const res = await caller.recordPayment({ ...payInput, amount: 40000 });

    expect(res.newStatus).toBe("partially_paid");
    expect(res.remainingPayable).toBe(60000);
  });
});
