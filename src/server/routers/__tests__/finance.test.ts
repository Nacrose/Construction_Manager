/**
 * Router-layer tests for finance (org-level treasury).
 *
 * Pins:
 *   - createBankAccount: org-admin-only, duplicate account-number CONFLICT
 *     within the org, isDefault exclusivity, currentBalance = openingBalance
 *   - orgSettleMultiBill (central cheque run):
 *       • org-admin-only
 *       • every bill's project must belong to the caller's org (cross-tenant
 *         settlement rejected with zero writes)
 *       • amountToPay = tdsDeducted + netPaid consistency guard
 *       • overpayment rejected inside the transaction
 *       • happy path: Payment row + balanced JE per bill (Dr 2001/2002,
 *         Cr 2020 TDS when withheld, Cr 1010/1001), bill status transition,
 *         atomic bank-account decrement
 *   - createHeadOfficeExpense: org-admin-only, balanced JE to the mapped HO
 *     overhead account, atomic decrement in the same transaction
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { buildUser, createCaller, expectTRPCError, orgPolicyFixture } from "./test-utils";

vi.mock("@/lib/db", async () => {
  const { buildDbMock } = await import("./test-utils");
  const db = buildDbMock();
  return { db, getFreshDb: () => db };
});

import { db } from "@/lib/db";
import { financeRouter } from "../finance";

const anyDb = db as any;
const MEMBER = buildUser(); // org-1, orgRole member
const ORG_ADMIN = buildUser({ id: "admin-1", orgRole: "org_admin" });

beforeEach(() => {
  vi.resetAllMocks();
  // most finance procedures re-fetch the caller's org membership
  anyDb.user.findUniqueOrThrow.mockResolvedValue({ organizationId: "org-1" });
  // assertDelegation resolves the caller's org for money actions (Phase C).
  anyDb.organization.findUnique.mockResolvedValue(orgPolicyFixture());
});

// ─── orgBankAccounts ────────────────────────────────────────────────────────
describe("finance.orgBankAccounts", () => {
  it("returns an empty list for org-less users", async () => {
    anyDb.user.findUniqueOrThrow.mockResolvedValue({ organizationId: null });
    const caller = createCaller(financeRouter, MEMBER);
    const res = await caller.orgBankAccounts();
    expect(res.accounts).toEqual([]);
    expect(anyDb.companyBankAccount.findMany).not.toHaveBeenCalled();
  });

  it("scopes accounts to the caller's org", async () => {
    const caller = createCaller(financeRouter, MEMBER);
    await caller.orgBankAccounts();
    expect(anyDb.companyBankAccount.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { organizationId: "org-1" } }),
    );
  });
});

// ─── createBankAccount ──────────────────────────────────────────────────────
describe("finance.createBankAccount", () => {
  const input = {
    bankName: "Nabil Bank",
    accountNumber: "1234567890",
    accountName: "Constructor Pvt Ltd",
    openingBalance: 100000,
    isDefault: true,
  };

  it("FORBIDDENs non-org-admins", async () => {
    const caller = createCaller(financeRouter, MEMBER);
    await expectTRPCError(caller.createBankAccount(input), "FORBIDDEN");
    expect(anyDb.companyBankAccount.create).not.toHaveBeenCalled();
  });

  it("CONFLICTs on a duplicate account number within the org", async () => {
    anyDb.companyBankAccount.findFirst.mockResolvedValue({ id: "existing" });
    const caller = createCaller(financeRouter, ORG_ADMIN);
    await expectTRPCError(caller.createBankAccount(input), "CONFLICT");
    expect(anyDb.companyBankAccount.create).not.toHaveBeenCalled();
  });

  it("unsets other defaults when isDefault, and opens with the given balance", async () => {
    const caller = createCaller(financeRouter, ORG_ADMIN);
    await caller.createBankAccount(input);

    expect(anyDb.companyBankAccount.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { organizationId: "org-1" },
        data: { isDefault: false },
      }),
    );
    const data = anyDb.companyBankAccount.create.mock.calls[0][0].data;
    expect(data.organizationId).toBe("org-1");
    expect(data.currentBalance).toBe(100000);
    expect(data.isDefault).toBe(true);
  });
});

// ─── orgSettleMultiBill ─────────────────────────────────────────────────────
describe("finance.orgSettleMultiBill", () => {
  const baseSettle = {
    companyBankAccountId: "bank-1",
    paymentMode: "cheque" as const,
    chequeNo: "CHQ-1001",
    paymentDate: "2026-08-15",
    bills: [
      {
        billId: "vb-1",
        billType: "vendor" as const,
        projectId: "p-1",
        supplierName: "Steel Supplier Ltd",
        billNumber: "B-001",
        amountToPay: 1000,
        tdsDeducted: 15,
        netPaid: 985,
      },
    ],
  };

  function primeVendorBill(overrides: Record<string, unknown> = {}) {
    anyDb.companyBankAccount.findUnique.mockResolvedValue({
      id: "bank-1",
      organizationId: "org-1",
      currentBalance: 500000,
    });
    anyDb.project.findMany.mockResolvedValue([{ id: "p-1" }]);
    anyDb.vendorBill.findUnique.mockResolvedValue({
      projectId: "p-1",
      paidAmount: 0,
      netPayable: 1000,
      ...overrides,
    });
  }

  it("FORBIDDENs non-org-admins with no writes", async () => {
    const caller = createCaller(financeRouter, MEMBER);
    await expectTRPCError(caller.orgSettleMultiBill(baseSettle), "FORBIDDEN");
    expect(anyDb.payment.create).not.toHaveBeenCalled();
  });

  it("FORBIDDENs a bank account outside the caller's org", async () => {
    anyDb.companyBankAccount.findUnique.mockResolvedValue({
      id: "bank-1",
      organizationId: "org-2", // another tenant's account
    });
    const caller = createCaller(financeRouter, ORG_ADMIN);
    await expectTRPCError(caller.orgSettleMultiBill(baseSettle), "FORBIDDEN");
    expect(anyDb.payment.create).not.toHaveBeenCalled();
  });

  it("FORBIDDENs bills whose project is outside the caller's org (cross-tenant)", async () => {
    anyDb.companyBankAccount.findUnique.mockResolvedValue({
      id: "bank-1",
      organizationId: "org-1",
    });
    anyDb.project.findMany.mockResolvedValue([]); // p-1 belongs to nobody in org-1
    const caller = createCaller(financeRouter, ORG_ADMIN);
    await expectTRPCError(caller.orgSettleMultiBill(baseSettle), "FORBIDDEN");
    expect(anyDb.payment.create).not.toHaveBeenCalled();
  });

  it("BAD_REQUESTs when amountToPay ≠ tdsDeducted + netPaid", async () => {
    anyDb.companyBankAccount.findUnique.mockResolvedValue({
      id: "bank-1",
      organizationId: "org-1",
    });
    anyDb.project.findMany.mockResolvedValue([{ id: "p-1" }]);
    const caller = createCaller(financeRouter, ORG_ADMIN);
    await expectTRPCError(
      caller.orgSettleMultiBill({
        ...baseSettle,
        bills: [{ ...baseSettle.bills[0], netPaid: 800 }], // 1000 - 15 ≠ 800
      }),
      "BAD_REQUEST",
    );
    expect(anyDb.payment.create).not.toHaveBeenCalled();
  });

  it("BAD_REQUESTs when the bill does not belong to a stated org project", async () => {
    primeVendorBill({ projectId: "p-9" }); // bill actually in another project
    const caller = createCaller(financeRouter, ORG_ADMIN);
    await expectTRPCError(caller.orgSettleMultiBill(baseSettle), "NOT_FOUND");
    expect(anyDb.payment.create).not.toHaveBeenCalled();
  });

  it("BAD_REQUESTs overpayment inside the transaction", async () => {
    primeVendorBill({ netPayable: 500 }); // paying 1000 on a 500 bill
    // The overpayment guard now lives in the settlement UPDATE's WHERE
    // clause (atomic conditional update). Rowcount 0 = guard rejected.
    anyDb.$executeRaw.mockResolvedValue(0);
    const caller = createCaller(financeRouter, ORG_ADMIN);
    await expectTRPCError(caller.orgSettleMultiBill(baseSettle), "BAD_REQUEST");
    expect(anyDb.vendorBill.update).not.toHaveBeenCalled();
    // Exactly ONE raw statement ran: the guarded settlement attempt that
    // was rejected. The bank decrement (2nd raw statement) never ran.
    expect(anyDb.$executeRaw).toHaveBeenCalledTimes(1);
  });

  it("happy path: payment + balanced JE (Dr 2001, Cr 2020 TDS, Cr 1010) + paid + atomic decrement", async () => {
    primeVendorBill();
    anyDb.payment.create.mockResolvedValue({ id: "pay-1" });
    anyDb.$executeRaw.mockResolvedValue(1); // settlement guard passes, bank decrement ok

    const caller = createCaller(financeRouter, ORG_ADMIN);
    const res = await caller.orgSettleMultiBill(baseSettle);

    expect(res.ok).toBe(true);
    expect(res.totalDisbursement).toBe(985);

    // Payment row per bill
    const payData = anyDb.payment.create.mock.calls[0][0].data;
    expect(payData).toMatchObject({
      projectId: "p-1",
      payeeType: "vendor",
      amount: 1000,
      tdsDeducted: 15,
      netPaid: 985,
      status: "paid",
      companyBankAccountId: "bank-1",
      category: "Materials",
    });

    // JE: Dr 2001 Sundry Creditors 1000; Cr 2020 TDS 15; Cr 1010 Bank 985
    const jeData = anyDb.journalEntry.create.mock.calls[0][0].data;
    expect(jeData.source).toBe("payment");
    expect(jeData.organizationId).toBe("org-1");
    expect(jeData.totalDebit).toBe(1000);
    expect(jeData.totalCredit).toBe(1000);
    const lines = jeData.lines.create;
    expect(lines).toHaveLength(3);
    expect(lines[0]).toMatchObject({ accountCode: "2001", debit: 1000 });
    expect(lines[1]).toMatchObject({ accountCode: "2020", credit: 15 });
    expect(lines[2]).toMatchObject({ accountCode: "1010", credit: 985 });

    // Bill fully settled — atomically. The overpayment guard lives in the
    // UPDATE's WHERE clause; status is derived in SQL from the NEW balance.
    // Raw statement #1 = settlement (bound values: amountToPay + billId),
    // raw statement #2 = atomic bank decrement.
    expect(anyDb.vendorBill.update).not.toHaveBeenCalled();
    expect(anyDb.$executeRaw).toHaveBeenCalledTimes(2);
    expect(anyDb.$executeRaw.mock.calls[0]).toEqual(
      expect.arrayContaining([1000, "vb-1"]),
    );

    // Atomic bank decrement by total net disbursement
    expect(anyDb.$executeRaw.mock.calls[1][1]).toBe(985);
    expect(anyDb.$executeRaw.mock.calls[1][2]).toBe("bank-1");
  });

  it("runs the atomic settlement UPDATE when under-settled (status derived in SQL)", async () => {
    primeVendorBill({ netPayable: 2000 });
    anyDb.payment.create.mockResolvedValue({ id: "pay-1" });
    anyDb.$executeRaw.mockResolvedValue(1); // guard passed, 1 row updated
    const caller = createCaller(financeRouter, ORG_ADMIN);
    await caller.orgSettleMultiBill(baseSettle);
    // Settlement rides the guarded atomic UPDATE — no read-then-write.
    expect(anyDb.vendorBill.update).not.toHaveBeenCalled();
    expect(anyDb.$executeRaw).toHaveBeenCalledTimes(2);
    expect(anyDb.$executeRaw.mock.calls[0]).toEqual(
      expect.arrayContaining([1000, "vb-1"]),
    );
  });

  it("omits the TDS line entirely when nothing was withheld", async () => {
    primeVendorBill();
    anyDb.payment.create.mockResolvedValue({ id: "pay-1" });
    anyDb.$executeRaw.mockResolvedValue(1);
    const caller = createCaller(financeRouter, ORG_ADMIN);
    await caller.orgSettleMultiBill({
      ...baseSettle,
      bills: [{ ...baseSettle.bills[0], tdsDeducted: 0, netPaid: 1000 }],
    });
    const lines = anyDb.journalEntry.create.mock.calls[0][0].data.lines.create;
    expect(lines).toHaveLength(2);
    expect(lines.map((l: any) => l.accountCode)).toEqual(["2001", "1010"]);
  });

  it("debits 2002 Subcontractor Payables for subcontractor bills", async () => {
    anyDb.companyBankAccount.findUnique.mockResolvedValue({
      id: "bank-1",
      organizationId: "org-1",
    });
    anyDb.project.findMany.mockResolvedValue([{ id: "p-1" }]);
    anyDb.subcontractorBill.findUnique.mockResolvedValue({
      projectId: "p-1",
      paidAmount: 0,
      netPayable: 500,
    });
    anyDb.payment.create.mockResolvedValue({ id: "pay-1" });
    anyDb.$executeRaw.mockResolvedValue(1); // settlement guard passes

    const caller = createCaller(financeRouter, ORG_ADMIN);
    await caller.orgSettleMultiBill({
      ...baseSettle,
      bills: [
        {
          billId: "sb-1",
          billType: "subcontractor",
          projectId: "p-1",
          supplierName: "XYZ Subcontractor",
          billNumber: "SUB-001",
          amountToPay: 500,
          tdsDeducted: 0,
          netPaid: 500,
        },
      ],
    });

    const jeData = anyDb.journalEntry.create.mock.calls[0][0].data;
    expect(jeData.lines.create[0]).toMatchObject({ accountCode: "2002", debit: 500 });
    const payData = anyDb.payment.create.mock.calls[0][0].data;
    expect(payData.category).toBe("Subcontractor");
    // Atomic guarded settlement UPDATE — no read-then-write update call.
    expect(anyDb.subcontractorBill.update).not.toHaveBeenCalled();
    expect(anyDb.$executeRaw).toHaveBeenCalledTimes(2);
    expect(anyDb.$executeRaw.mock.calls[0]).toEqual(
      expect.arrayContaining([500, "sb-1"]),
    );
  });
});

// ─── createHeadOfficeExpense ────────────────────────────────────────────────
describe("finance.createHeadOfficeExpense", () => {
  const hoInput = {
    category: "rent",
    particulars: "Kathmandu office monthly rent",
    amount: 60000,
    date: "2026-08-01",
    paymentMode: "bank_transfer",
    bankAccountId: "bank-1",
  };

  it("FORBIDDENs non-org-admins", async () => {
    const caller = createCaller(financeRouter, MEMBER);
    await expectTRPCError(caller.createHeadOfficeExpense(hoInput), "FORBIDDEN");
    expect(anyDb.headOfficeExpense.create).not.toHaveBeenCalled();
  });

  it("FORBIDDENs a bank account outside the caller's org", async () => {
    anyDb.companyBankAccount.findUnique.mockResolvedValue({
      id: "bank-1",
      organizationId: "org-2",
    });
    const caller = createCaller(financeRouter, ORG_ADMIN);
    await expectTRPCError(caller.createHeadOfficeExpense(hoInput), "FORBIDDEN");
    expect(anyDb.headOfficeExpense.create).not.toHaveBeenCalled();
  });

  it("creates the expense with a balanced JE to the mapped HO account and decrements the bank atomically", async () => {
    anyDb.companyBankAccount.findUnique.mockResolvedValue({
      id: "bank-1",
      organizationId: "org-1",
    });
    anyDb.headOfficeExpense.create.mockResolvedValue({ id: "hoe-1" });

    const caller = createCaller(financeRouter, ORG_ADMIN);
    const res = await caller.createHeadOfficeExpense(hoInput);
    expect(res.expense.id).toBe("hoe-1");

    const expData = anyDb.headOfficeExpense.create.mock.calls[0][0].data;
    expect(expData.organizationId).toBe("org-1");
    expect(expData.amount).toBe(60000);

    // JE: Dr 6100 HO Rent / Cr 1010 Bank — balanced
    const jeData = anyDb.journalEntry.create.mock.calls[0][0].data;
    expect(jeData.source).toBe("head_office_expense");
    expect(jeData.totalDebit).toBe(60000);
    expect(jeData.totalCredit).toBe(60000);
    expect(jeData.lines.create[0]).toMatchObject({ accountCode: "6100", debit: 60000 });
    expect(jeData.lines.create[1]).toMatchObject({ accountCode: "1010", credit: 60000 });

    // atomic decrement in the same transaction
    expect(anyDb.$executeRaw).toHaveBeenCalledTimes(1);
    expect(anyDb.$executeRaw.mock.calls[0][1]).toBe(60000);
    expect(anyDb.$executeRaw.mock.calls[0][2]).toBe("bank-1");
  });

  it("rejects expenses dated in a locked fiscal year BEFORE any write", async () => {
    anyDb.fiscalYearLock.findFirst.mockResolvedValue({ fiscalYear: "2083-84" });
    const caller = createCaller(financeRouter, ORG_ADMIN);
    await expectTRPCError(caller.createHeadOfficeExpense(hoInput), "FORBIDDEN");
    expect(anyDb.headOfficeExpense.create).not.toHaveBeenCalled();

    const where = anyDb.fiscalYearLock.findFirst.mock.calls[0][0].where;
    expect(where.endDate.gte).toEqual(new Date("2026-08-01")); // expense date, not today
  });
});

// ─── cashFlow ───────────────────────────────────────────────────────────────
describe("finance.cashFlow — outflow completeness (B6 regression)", () => {
  it("includes payments, payroll disbursements, and site expenses in outflow", async () => {
    anyDb.projectMember.findUnique.mockResolvedValue({ role: "engineer" });
    anyDb.ganttTask.findFirst.mockResolvedValue(null); // start = current month
    anyDb.ganttTask.findMany.mockResolvedValue([]); // no planned-cost tasks
    const now = new Date();
    anyDb.projectCost.findMany.mockResolvedValue([
      { amount: 100, date: now, category: "material" },
    ]);
    anyDb.payment.findMany.mockResolvedValue([
      { netPaid: 500, paymentDate: now },
    ]);
    const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    anyDb.payrollRun.findMany.mockResolvedValue([
      { period: monthKey, disbursedAmount: 700, totalNetPayable: 700 },
    ]);
    anyDb.siteExpense.findMany.mockResolvedValue([
      { totalAmount: 200, date: now },
    ]);
    anyDb.ipc.findMany.mockResolvedValue([]); // no client inflows

    const caller = createCaller(financeRouter, MEMBER);
    const res = await caller.cashFlow({ projectId: "p-1", months: 3 });

    const m = res.months[0];
    expect(m.actualCost).toBe(100);
    expect(m.paymentsOut).toBe(500);
    expect(m.payrollOut).toBe(700);
    expect(m.siteExpenses).toBe(200);
    // net = inflow − ALL outflows (previously payments/payroll/site were invisible)
    expect(m.netCashFlow).toBe(-(100 + 500 + 700 + 200));
    expect(res.totals.totalPaymentsOut).toBe(500);
    expect(res.totals.totalPayrollOut).toBe(700);
    expect(res.totals.totalSiteExpenses).toBe(200);
  });
});
