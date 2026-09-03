/**
 * Router-layer tests for the subcontractor-bill router.
 *
 * Pins:
 *   - Bill math: gross/retention/VAT/TDS/net with Nepal defaults, and the
 *     7-line liability JE (5020/1410/2020/2010/2003/1130/2002)
 *   - Fiscal-year lock BEFORE any write (regression: the lock used to run
 *     after the bill row was committed, leaving orphan un-journaled bills)
 *   - markPaid: only certified bills, overpayment guard, atomic increment,
 *     payment JE posted under its OWN source (subcontractor_payment)
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { buildUser, createCaller, expectTRPCError } from "./test-utils";

vi.mock("@/lib/db", async () => {
  const { buildDbMock } = await import("./test-utils");
  const db = buildDbMock();
  return { db, getFreshDb: () => db };
});

import { db } from "@/lib/db";
import { subcontractorBillRouter } from "../subcontractor-bill";

const anyDb = db as any;
const ENGINEER = buildUser();
const PM = buildUser();

function member(role: string | null) {
  anyDb.projectMember.findUnique.mockResolvedValue(role ? { role } : null);
}

beforeEach(() => {
  vi.resetAllMocks();
});

const createInput = {
  projectId: "p-1",
  subcontractorId: "sub-1",
  items: [{ description: "Concrete work", thisQty: 10, rate: 1000 }],
  materialDeduction: 500,
  advanceRecovery: 300,
};

// ─── create ──────────────────────────────────────────────────────────────────
describe("subcontractorBill.submit", () => {
  function draftBill(overrides: Record<string, unknown> = {}) {
    return {
      id: "bill-1",
      number: "SUB-BILL-001",
      status: "draft",
      subcontractor: { id: "sub-1", name: "ABC Constructions" },
      // Engine attribution fields — transitionEntityState writes these only
      // when the entity actually carries the columns.
      submittedById: null,
      submittedAt: null,
      ...overrides,
    };
  }

  it("submits a draft bill via the engine (CAS on the draft status)", async () => {
    member("engineer");
    anyDb.subcontractorBill.findFirst.mockResolvedValue(draftBill());
    anyDb.subcontractorBill.findUnique.mockResolvedValue(draftBill()); // engine re-read
    const caller = createCaller(subcontractorBillRouter, ENGINEER);
    await caller.submit({ projectId: "p-1", billId: "bill-1" });

    expect(anyDb.subcontractorBill.updateMany).toHaveBeenCalledWith({
      where: { id: "bill-1", status: "draft" },
      data: expect.objectContaining({ status: "submitted", submittedById: ENGINEER.id }),
    });
  });

  it("BAD_REQUESTs submitting a non-draft bill", async () => {
    member("engineer");
    anyDb.subcontractorBill.findFirst.mockResolvedValue(draftBill({ status: "submitted" }));
    anyDb.subcontractorBill.findUnique.mockResolvedValue(draftBill({ status: "submitted" })); // engine re-read
    const caller = createCaller(subcontractorBillRouter, ENGINEER);
    await expectTRPCError(
      caller.submit({ projectId: "p-1", billId: "bill-1" }),
      "BAD_REQUEST",
    );
    expect(anyDb.subcontractorBill.updateMany).not.toHaveBeenCalled();
  });

  it("NOT_FOUNDs a bill from another project", async () => {
    member("engineer");
    anyDb.subcontractorBill.findFirst.mockResolvedValue(null);
    const caller = createCaller(subcontractorBillRouter, ENGINEER);
    await expectTRPCError(
      caller.submit({ projectId: "p-1", billId: "bill-1" }),
      "NOT_FOUND",
    );
  });
});

describe("subcontractorBill.certify", () => {
  function submittedBill(overrides: Record<string, unknown> = {}) {
    return {
      id: "bill-1",
      number: "SUB-BILL-001",
      status: "submitted",
      netPayable: 100000,
      subcontractor: { id: "sub-1", name: "ABC Constructions" },
      ...overrides,
    };
  }

  it("certifies a submitted bill via the engine with certifiedBy attribution", async () => {
    member("project_manager");
    anyDb.subcontractorBill.findFirst.mockResolvedValue(submittedBill());
    anyDb.subcontractorBill.findUnique.mockResolvedValue(submittedBill()); // engine re-read
    const caller = createCaller(subcontractorBillRouter, PM);
    await caller.certify({ projectId: "p-1", billId: "bill-1" });

    const call = anyDb.subcontractorBill.updateMany.mock.calls[0][0];
    expect(call.where).toEqual({ id: "bill-1", status: "submitted" });
    expect(call.data).toMatchObject({
      status: "certified",
      certifiedById: PM.id,
    });
    expect(call.data.certifiedAt).toBeInstanceOf(Date);
  });

  it("FORBIDDENs non-admin roles", async () => {
    member("engineer");
    anyDb.subcontractorBill.findFirst.mockResolvedValue(submittedBill());
    const caller = createCaller(subcontractorBillRouter, ENGINEER);
    await expectTRPCError(
      caller.certify({ projectId: "p-1", billId: "bill-1" }),
      "FORBIDDEN",
    );
    expect(anyDb.subcontractorBill.updateMany).not.toHaveBeenCalled();
  });

  it("BAD_REQUESTs certifying a paid bill (terminal state)", async () => {
    member("project_manager");
    anyDb.subcontractorBill.findFirst.mockResolvedValue(submittedBill({ status: "paid" }));
    anyDb.subcontractorBill.findUnique.mockResolvedValue(submittedBill({ status: "paid" })); // engine re-read
    const caller = createCaller(subcontractorBillRouter, PM);
    await expectTRPCError(
      caller.certify({ projectId: "p-1", billId: "bill-1" }),
      "BAD_REQUEST",
    );
    expect(anyDb.subcontractorBill.updateMany).not.toHaveBeenCalled();
  });
});

describe("subcontractorBill.create", () => {
  it("FORBIDDENs non-members", async () => {
    member(null);
    const caller = createCaller(subcontractorBillRouter, ENGINEER);
    await expectTRPCError(caller.create(createInput), "FORBIDDEN");
    expect(anyDb.subcontractorBill.create).not.toHaveBeenCalled();
  });

  it("FORBIDDENs creation inside a locked fiscal year BEFORE any write (regression)", async () => {
    member("engineer");
    anyDb.fiscalYearLock.findFirst.mockResolvedValue({ fiscalYear: "2083-84" });

    const caller = createCaller(subcontractorBillRouter, ENGINEER);
    await expectTRPCError(caller.create(createInput), "FORBIDDEN");

    // The lock must fire before the bill row, its items, and the JE —
    // previously the bill was committed first and left orphaned on error.
    expect(anyDb.subcontractorBill.create).not.toHaveBeenCalled();
    expect(anyDb.subcontractorBillItem.create).not.toHaveBeenCalled();
    expect(anyDb.journalEntry.create).not.toHaveBeenCalled();
  });

  it("NOT_FOUNDs a subcontractor that is not in the project", async () => {
    member("engineer");
    anyDb.subcontractor.findFirst.mockResolvedValue(null);
    const caller = createCaller(subcontractorBillRouter, ENGINEER);
    await expectTRPCError(caller.create(createInput), "NOT_FOUND");
    expect(anyDb.subcontractorBill.create).not.toHaveBeenCalled();
  });

  it("computes Nepal bill amounts and posts the 7-line liability JE", async () => {
    member("engineer");
    anyDb.subcontractor.findFirst.mockResolvedValue({ id: "sub-1", name: "ABC Constructions" });
    anyDb.subcontractorBill.count.mockResolvedValue(0); // → SUB-BILL-001
    anyDb.subcontractorBill.findFirst.mockResolvedValue(null); // no number collision
    anyDb.subcontractorBill.create.mockResolvedValue({
      id: "bill-1",
      number: "SUB-BILL-001",
      billDate: new Date("2026-08-01"),
    });

    const caller = createCaller(subcontractorBillRouter, ENGINEER);
    await caller.create(createInput);

    // gross 10000; retention 10% = 1000; VAT 13% = 1300; TDS 1.5% = 150
    // net = 10000 − 1000 + 1300 − 150 − 500 (matDed) − 300 (advRec) = 9350
    const createData = anyDb.subcontractorBill.create.mock.calls[0][0].data;
    expect(createData.grossAmount).toBe(10000);
    expect(createData.retentionAmount).toBe(1000);
    expect(createData.vatAmount).toBe(1300);
    expect(createData.tdsAmount).toBe(150);
    expect(createData.netPayable).toBe(9350);
    expect(createData.status).toBe("draft");
    expect(createData.paidAmount).toBe(0);

    // Line item: amount = thisQty × rate
    const itemData = anyDb.subcontractorBillItem.create.mock.calls[0][0].data;
    expect(itemData.amount).toBe(10000);
    expect(itemData.cumQty).toBe(10);

    // Liability JE: Dr 5020 + 1410 = Cr 2020 + 2010 + 2003 + 1130 + 2002
    const jeData = anyDb.journalEntry.create.mock.calls[0][0].data;
    expect(jeData.source).toBe("subcontractor_bill");
    expect(jeData.totalDebit).toBe(11300);
    expect(jeData.totalCredit).toBe(11300);

    const lines = jeData.lines.create;
    expect(lines.map((l: any) => l.accountCode)).toEqual([
      "5020", "1410", "2020", "2010", "2003", "1130", "2002",
    ]);
    expect(lines[0]).toMatchObject({ debit: 10000 }); // Subcontractor Cost
    expect(lines[1]).toMatchObject({ debit: 1300 }); // Input VAT
    expect(lines[6]).toMatchObject({ credit: 9350 }); // Subcontractor Payables
  });

  it("omits zero-value deduction lines from the JE", async () => {
    member("engineer");
    anyDb.subcontractor.findFirst.mockResolvedValue({ id: "sub-1", name: "ABC" });
    anyDb.subcontractorBill.create.mockResolvedValue({
      id: "bill-2",
      number: "SUB-BILL-002",
      billDate: new Date("2026-08-01"),
    });

    const caller = createCaller(subcontractorBillRouter, ENGINEER);
    await caller.create({
      projectId: "p-1",
      subcontractorId: "sub-1",
      items: [{ description: "Steel fixing", thisQty: 5, rate: 2000 }], // gross 10000
      // materialDeduction / advanceRecovery default to 0
    });

    const jeData = anyDb.journalEntry.create.mock.calls[0][0].data;
    const codes = jeData.lines.create.map((l: any) => l.accountCode);
    // no 2003 (material deduction) or 1130 (advance recovery) lines
    expect(codes).toEqual(["5020", "1410", "2020", "2010", "2002"]);
  });
});

// ─── markPaid ────────────────────────────────────────────────────────────────
describe("subcontractorBill.markPaid", () => {
  const payInput = { projectId: "p-1", billId: "bill-1", amount: 5000 };

  function certifiedBill(overrides: Record<string, unknown> = {}) {
    return {
      id: "bill-1",
      number: "SUB-BILL-001",
      status: "certified",
      netPayable: 100000,
      paidAmount: 90000,
      billDate: new Date("2026-08-01"),
      subcontractor: { id: "sub-1", name: "ABC Constructions" },
      ...overrides,
    };
  }

  it("FORBIDDENs non-admin roles", async () => {
    member("engineer");
    const caller = createCaller(subcontractorBillRouter, ENGINEER);
    await expectTRPCError(caller.markPaid(payInput), "FORBIDDEN");
    expect(anyDb.$executeRaw).not.toHaveBeenCalled();
  });

  it("NOT_FOUNDs a bill that is not in the authorized project", async () => {
    member("project_manager");
    anyDb.subcontractorBill.findFirst.mockResolvedValue(null);
    const caller = createCaller(subcontractorBillRouter, PM);
    await expectTRPCError(caller.markPaid(payInput), "NOT_FOUND");
  });

  it("BAD_REQUESTs paying a draft bill (only certified bills)", async () => {
    member("project_manager");
    anyDb.subcontractorBill.findFirst.mockResolvedValue(certifiedBill({ status: "draft" }));
    const caller = createCaller(subcontractorBillRouter, PM);
    await expectTRPCError(caller.markPaid(payInput), "BAD_REQUEST");
    expect(anyDb.$executeRaw).not.toHaveBeenCalled();
  });

  it("BAD_REQUESTs overpayment beyond net payable", async () => {
    member("project_manager");
    anyDb.subcontractorBill.findFirst.mockResolvedValue(certifiedBill());
    // 90000 + 11000 = 101000 > 100000.01
    const caller = createCaller(subcontractorBillRouter, PM);
    await expectTRPCError(
      caller.markPaid({ ...payInput, amount: 11000 }),
      "BAD_REQUEST",
    );
    expect(anyDb.$executeRaw).not.toHaveBeenCalled();
  });

  it("FORBIDDENs payment of a bill dated in a locked fiscal year", async () => {
    member("project_manager");
    anyDb.subcontractorBill.findFirst.mockResolvedValue(
      certifiedBill({ billDate: new Date("2025-06-01") }),
    );
    anyDb.fiscalYearLock.findFirst.mockResolvedValue({ fiscalYear: "2081-82" });

    const caller = createCaller(subcontractorBillRouter, PM);
    await expectTRPCError(caller.markPaid(payInput), "FORBIDDEN");
    expect(anyDb.$executeRaw).not.toHaveBeenCalled();
    expect(anyDb.journalEntry.create).not.toHaveBeenCalled();
  });

  it("full payment → paid, guarded atomic increment, payment JE under its own source", async () => {
    member("project_manager");
    anyDb.subcontractorBill.findFirst.mockResolvedValue(
      certifiedBill({ paidAmount: 0 }), // net 100000, pay all
    );
    anyDb.subcontractorPayment.create.mockResolvedValue({ id: "subpay-1" });
    anyDb.subcontractorBill.findUniqueOrThrow.mockResolvedValue({
      id: "bill-1",
      paidAmount: 100000,
    });

    const caller = createCaller(subcontractorBillRouter, PM);
    const res = await caller.markPaid({ ...payInput, amount: 100000 });

    expect(res.remaining).toBe(0);

    // GUARDED ATOMIC SETTLEMENT (audit C-2): raw UPDATE whose WHERE clause
    // carries the overpayment guard; status is derived in-statement (CASE
    // → 'paid'), never passed in from a stale read. Tagged-template call:
    // [strings, ...values] = [amount, amount, id, amount].
    const rawArgs = anyDb.$executeRaw.mock.calls[0];
    const sqlText = rawArgs[0].join("?");
    expect(sqlText).toContain('UPDATE "SubcontractorBill"');
    expect(sqlText).toContain('"paidAmount" + ? <= "netPayable" + 0.01');
    expect(sqlText).toContain("THEN 'paid'");
    expect(rawArgs[1]).toBe(100000); // amount
    expect(rawArgs[3]).toBe("bill-1"); // id

    // Per-payment ledger row exists (audit C-3 — JE keys on THIS id)
    expect(anyDb.subcontractorPayment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ subcontractorBillId: "bill-1", amount: 100000 }),
      }),
    );

    // Payment JE uses its OWN source + the PAYMENT row id (not the bill id)
    // so installments no longer collide on @@unique([source, sourceRefId])
    const jeData = anyDb.journalEntry.create.mock.calls[0][0].data;
    expect(jeData.source).toBe("subcontractor_payment");
    expect(jeData.sourceRefId).toBe("subpay-1");
    expect(jeData.sourceRefType).toBe("SubcontractorPayment");
    expect(jeData.totalDebit).toBe(100000);
    expect(jeData.lines.create[0]).toMatchObject({
      accountCode: "2002", // Dr Subcontractor Payables
      debit: 100000,
    });
    expect(jeData.lines.create[1]).toMatchObject({
      accountCode: "1010", // Cr Bank
      credit: 100000,
    });
  });

  it("partial payment keeps the bill certified with remaining balance", async () => {
    member("project_manager");
    anyDb.subcontractorBill.findFirst.mockResolvedValue(
      certifiedBill({ paidAmount: 0 }),
    );
    anyDb.subcontractorPayment.create.mockResolvedValue({ id: "subpay-2" });
    anyDb.subcontractorBill.findUniqueOrThrow.mockResolvedValue({
      id: "bill-1",
      paidAmount: 40000,
    });

    const caller = createCaller(subcontractorBillRouter, PM);
    const res = await caller.markPaid({ ...payInput, amount: 40000 });

    // 40000 < 100000 → not full → stays certified (derived in-statement)
    expect(anyDb.$executeRaw.mock.calls[0][0].join("?")).toContain("ELSE 'certified'");
    expect(res.remaining).toBe(60000);
  });

  it("rejects payment when the guarded UPDATE's WHERE-clause guard fails (C-2)", async () => {
    // Even when the stale pre-tx check passes, a concurrent payment that
    // moved paidAmount forward makes the guarded UPDATE affect 0 rows →
    // overpayment error, no JE, no payment row.
    member("project_manager");
    anyDb.subcontractorBill.findFirst.mockResolvedValue(certifiedBill({ paidAmount: 0 }));
    anyDb.$executeRaw.mockResolvedValue(0); // guard rejected
    const caller = createCaller(subcontractorBillRouter, PM);
    await expectTRPCError(caller.markPaid(payInput), "BAD_REQUEST");
    expect(anyDb.journalEntry.create).not.toHaveBeenCalled();
  });
});
