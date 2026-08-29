/**
 * Router-layer tests for the accounting router.
 *
 * Pins:
 *   - trialBalance is GL-DRIVEN: posted journal-entry lines only, scoped
 *     to the caller's project, aggregated through the central engine
 *   - logJournalEntry (Money In): balanced cash-in JE, correct bank/cash
 *     account selection, org-scoped bank lookup, balance increment in the
 *     same transaction, fiscal-lock before any write
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { buildUser, createCaller, expectTRPCError } from "./test-utils";

vi.mock("@/lib/db", async () => {
  const { buildDbMock } = await import("./test-utils");
  const db = buildDbMock();
  return { db, getFreshDb: () => db };
});

import { db } from "@/lib/db";
import { accountingRouter } from "../accounting";

const anyDb = db as any;
const ENGINEER = buildUser();

function member(role: string | null) {
  anyDb.projectMember.findUnique.mockResolvedValue(role ? { role } : null);
}

beforeEach(() => {
  vi.resetAllMocks();
});

// ─── trialBalance ────────────────────────────────────────────────────────────
describe("accounting.trialBalance", () => {
  it("FORBIDDENs non-project-members", async () => {
    member(null);
    const caller = createCaller(accountingRouter, ENGINEER);
    await expectTRPCError(caller.trialBalance({ projectId: "p-1" }), "FORBIDDEN");
  });

  it("aggregates POSTED lines only, through the GL engine", async () => {
    member("engineer");
    anyDb.journalEntryLine.findMany.mockResolvedValue([
      { accountCode: "1010", accountName: "Bank", debit: 100000, credit: 0 },
      { accountCode: "1100", accountName: "Client Receivables", debit: 0, credit: 100000 },
    ]);

    const caller = createCaller(accountingRouter, ENGINEER);
    const res = await caller.trialBalance({ projectId: "p-1" });

    // Posted entries only, scoped to the project
    const where = anyDb.journalEntryLine.findMany.mock.calls[0][0].where;
    expect(where).toEqual({
      projectId: "p-1",
      journalEntry: { isPosted: true },
    });

    expect(res.totalDebits).toBe(100000);
    expect(res.totalCredits).toBe(100000);
    expect(res.isBalanced).toBe(true);
    expect(res.rows).toHaveLength(2);
  });

  it("flags unbalanced GL data (corruption detection)", async () => {
    member("engineer");
    anyDb.journalEntryLine.findMany.mockResolvedValue([
      { accountCode: "1010", accountName: "Bank", debit: 100, credit: 0 },
      { accountCode: "2001", accountName: "Sundry Creditors", debit: 0, credit: 90 },
    ]);
    const caller = createCaller(accountingRouter, ENGINEER);
    const res = await caller.trialBalance({ projectId: "p-1" });
    expect(res.isBalanced).toBe(false);
    expect(res.difference).toBe(10);
  });
});

// ─── logJournalEntry (Money In) ──────────────────────────────────────────────
describe("accounting.logJournalEntry", () => {
  const inflowInput = {
    projectId: "p-1",
    date: "2026-08-01",
    debitAccountId: "bank-1",
    inflowType: "Client IPC Running Bill",
    receivedFrom: "Nepal Electricity Authority",
    amount: 500000,
    narration: "IPC 3 running bill payment",
  };

  it("FORBIDDENs read-only roles", async () => {
    member("client");
    const caller = createCaller(accountingRouter, ENGINEER);
    await expectTRPCError(caller.logJournalEntry(inflowInput), "FORBIDDEN");
    expect(anyDb.payment.create).not.toHaveBeenCalled();
  });

  it("FORBIDDENs inflows dated in a locked fiscal year BEFORE any write", async () => {
    member("engineer");
    anyDb.fiscalYearLock.findFirst.mockResolvedValue({ fiscalYear: "2083-84" });
    const caller = createCaller(accountingRouter, ENGINEER);
    await expectTRPCError(caller.logJournalEntry(inflowInput), "FORBIDDEN");
    expect(anyDb.payment.create).not.toHaveBeenCalled();

    // the lock was checked for the ENTRY date, not "today"
    const where = anyDb.fiscalYearLock.findFirst.mock.calls[0][0].where;
    expect(where.isLocked).toBe(true);
    expect(where.endDate.gte).toEqual(new Date("2026-08-01"));
  });

  it("bank inflow: receipt payment + balanced JE + atomic balance increment", async () => {
    member("engineer");
    anyDb.companyBankAccount.findFirst.mockResolvedValue({
      id: "bank-1",
      accountType: "bank",
    });
    anyDb.payment.create.mockResolvedValue({ id: "pay-1" });

    const caller = createCaller(accountingRouter, ENGINEER);
    const res = await caller.logJournalEntry(inflowInput);

    expect(res.success).toBe(true);

    // Payment row: direction marked for ledgers/day book
    const payData = anyDb.payment.create.mock.calls[0][0].data;
    expect(payData).toMatchObject({
      projectId: "p-1",
      amount: 500000,
      paymentMode: "bank_transfer",
      voucherType: "receipt",
      category: "Client IPC Running Bill",
      payeeName: "Nepal Electricity Authority",
      companyBankAccountId: "bank-1",
    });

    // Cash-in JE: Dr 1010 Bank = Cr 1100 Client Receivables
    const jeData = anyDb.journalEntry.create.mock.calls[0][0].data;
    expect(jeData.source).toBe("receipt");
    expect(jeData.totalDebit).toBe(500000);
    expect(jeData.totalCredit).toBe(500000);
    expect(jeData.lines.create[0]).toMatchObject({ accountCode: "1010", debit: 500000 });
    expect(jeData.lines.create[1]).toMatchObject({ accountCode: "1100", credit: 500000 });

    // Bank balance incremented atomically in the same transaction
    expect(anyDb.$executeRaw).toHaveBeenCalledTimes(1);
    expect(anyDb.$executeRaw.mock.calls[0][1]).toBe(500000);
    expect(anyDb.$executeRaw.mock.calls[0][2]).toBe("bank-1");
  });

  it("unknown bank account falls back to CASH (no balance increment)", async () => {
    member("engineer");
    anyDb.companyBankAccount.findFirst.mockResolvedValue(null);

    const caller = createCaller(accountingRouter, ENGINEER);
    await caller.logJournalEntry(inflowInput);

    const payData = anyDb.payment.create.mock.calls[0][0].data;
    expect(payData.paymentMode).toBe("cash");
    expect(payData.companyBankAccountId).toBeNull();

    // cash → Dr 1001 Cash on Hand; no bank balance to increment
    const jeData = anyDb.journalEntry.create.mock.calls[0][0].data;
    expect(jeData.lines.create[0].accountCode).toBe("1001");
    expect(anyDb.$executeRaw).not.toHaveBeenCalled();
  });

  it("org-less users cannot match a bank account — treated as cash", async () => {
    member("engineer");
    const orgless = buildUser({ organizationId: null });
    const caller = createCaller(accountingRouter, orgless);
    await caller.logJournalEntry(inflowInput);

    // bank lookup is skipped entirely for org-less users
    expect(anyDb.companyBankAccount.findFirst).not.toHaveBeenCalled();
    const payData = anyDb.payment.create.mock.calls[0][0].data;
    expect(payData.paymentMode).toBe("cash");
  });

  it("petty cash account is treated as cash", async () => {
    member("engineer");
    anyDb.companyBankAccount.findFirst.mockResolvedValue({
      id: "petty-1",
      accountType: "petty_cash",
    });
    const caller = createCaller(accountingRouter, ENGINEER);
    await caller.logJournalEntry(inflowInput);

    const payData = anyDb.payment.create.mock.calls[0][0].data;
    expect(payData.paymentMode).toBe("cash");
    expect(anyDb.$executeRaw).not.toHaveBeenCalled();
  });
});
