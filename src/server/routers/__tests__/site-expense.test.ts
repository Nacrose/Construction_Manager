/**
 * Router-layer tests for site-expense (petty cash).
 *
 * Pins:
 *   - Approve is PM/coordinator-only and only for pending expenses
 *   - Fiscal-year lock rejects using the EXPENSE's date (not today), so
 *     back-dated expenses to locked years are blocked — BEFORE any write
 *   - Approve posts the GL entry in the SAME transaction as the status
 *     flip (no approved-expense-without-JE state), debiting the proper
 *     site-overhead account per category (not a hardcoded "6006")
 *   - Cash → credit 1001, everything else → credit 1010
 *   - Sequence-number collision retry (P2002) actually retries
 *   - Delegation petty-cash limit enforced on create
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { buildUser, createCaller, expectTRPCError } from "./test-utils";

vi.mock("@/lib/db", async () => {
  const { buildDbMock } = await import("./test-utils");
  const db = buildDbMock();
  return { db, getFreshDb: () => db };
});

import { db } from "@/lib/db";
import { siteExpenseRouter } from "../site-expense";

const anyDb = db as any;
const ENGINEER = buildUser();
const PM = buildUser({ id: "pm-1" });

function member(role: string | null) {
  anyDb.projectMember.findUnique.mockResolvedValue(role ? { role } : null);
}

/** A pending expense as stored in the db. */
function pendingExpense(overrides: Record<string, unknown> = {}) {
  return {
    id: "exp-1",
    projectId: "p-1",
    number: "EXP-001",
    status: "pending",
    date: new Date("2026-08-01"),
    amount: 4500,
    vatAmount: 500,
    totalAmount: 5000,
    category: "fuel",
    description: "Diesel for excavator",
    paymentMode: "bank_transfer",
    ...overrides,
  };
}

beforeEach(() => {
  vi.resetAllMocks();
});

// ─── create ─────────────────────────────────────────────────────────────────
describe("siteExpense.create", () => {
  const createInput = {
    projectId: "p-1",
    description: "Diesel for excavator",
    amount: 4500,
    vatAmount: 500,
    category: "fuel",
  };

  it("FORBIDDENs non-members with no write", async () => {
    member(null);
    const caller = createCaller(siteExpenseRouter, ENGINEER);
    await expectTRPCError(caller.create(createInput), "FORBIDDEN");
    expect(anyDb.siteExpense.create).not.toHaveBeenCalled();
  });

  it("rejects a locked fiscal year BEFORE any write, using the expense date", async () => {
    member("engineer");
    anyDb.fiscalYearLock.findFirst.mockResolvedValue({ fiscalYear: "2083-84" });
    const caller = createCaller(siteExpenseRouter, ENGINEER);
    await expectTRPCError(
      caller.create({ ...createInput, date: "2026-08-01" }),
      "FORBIDDEN",
    );
    expect(anyDb.siteExpense.create).not.toHaveBeenCalled();

    // the lock was checked for the EXPENSE date, not "today"
    const where = anyDb.fiscalYearLock.findFirst.mock.calls[0][0].where;
    expect(where.isLocked).toBe(true);
    expect(where.endDate.gte).toEqual(new Date("2026-08-01"));
  });

  it("FORBIDDENs amounts above the org petty-cash delegation limit", async () => {
    member("engineer");
    anyDb.organization.findUnique.mockResolvedValue({
      operatingModel: "hq_centralized_imprest",
      sitePettyCashLimit: 25000,
    });
    anyDb.delegationRule.findMany.mockResolvedValue([]); // model defaults apply
    const caller = createCaller(siteExpenseRouter, ENGINEER);
    await expectTRPCError(
      caller.create({ ...createInput, amount: 30000, vatAmount: 0 }),
      "FORBIDDEN",
    );
    expect(anyDb.siteExpense.create).not.toHaveBeenCalled();
  });

  it("stores totalAmount = amount + vatAmount", async () => {
    member("engineer");
    const caller = createCaller(siteExpenseRouter, ENGINEER);
    await caller.create(createInput);
    const data = anyDb.siteExpense.create.mock.calls[0][0].data;
    expect(data.amount).toBe(4500);
    expect(data.vatAmount).toBe(500);
    expect(data.totalAmount).toBe(5000);
  });

  it("retries with the next number on a P2002 sequence collision", async () => {
    member("engineer");
    anyDb.siteExpense.count.mockResolvedValue(0); // seq → EXP-001
    anyDb.siteExpense.findFirst.mockResolvedValue(null);
    let calls = 0;
    anyDb.siteExpense.create.mockImplementation(async () => {
      calls++;
      if (calls === 1) {
        const err = new Error("Unique constraint failed") as any;
        err.code = "P2002";
        throw err;
      }
      return { id: "exp-1", number: "EXP-002" };
    });

    const caller = createCaller(siteExpenseRouter, ENGINEER);
    const res = await caller.create(createInput);
    expect(res.expense.number).toBe("EXP-002");
    expect(anyDb.siteExpense.create).toHaveBeenCalledTimes(2);
  });
});

// ─── approve ────────────────────────────────────────────────────────────────
describe("siteExpense.approve", () => {
  it("FORBIDDENs non-admin roles (engineer)", async () => {
    anyDb.siteExpense.findUnique.mockResolvedValue(
      pendingExpense({ status: undefined }),
    );
    member("engineer");
    const caller = createCaller(siteExpenseRouter, ENGINEER);
    await expectTRPCError(caller.approve({ id: "exp-1" }), "FORBIDDEN");
    expect(anyDb.siteExpense.updateMany).not.toHaveBeenCalled();
  });

  it("BAD_REQUESTs non-pending expenses", async () => {
    anyDb.siteExpense.findUnique.mockResolvedValue(pendingExpense({ status: "approved" }));
    member("project_manager");
    const caller = createCaller(siteExpenseRouter, PM);
    await expectTRPCError(caller.approve({ id: "exp-1" }), "BAD_REQUEST");
    expect(anyDb.siteExpense.updateMany).not.toHaveBeenCalled();
  });

  it("rejects back-dated expenses in a locked fiscal year BEFORE any write", async () => {
    anyDb.siteExpense.findUnique.mockResolvedValue(
      pendingExpense({ date: new Date("2025-07-15") }),
    );
    member("project_manager");
    anyDb.fiscalYearLock.findFirst.mockResolvedValue({ fiscalYear: "2082-83" });
    const caller = createCaller(siteExpenseRouter, PM);
    await expectTRPCError(caller.approve({ id: "exp-1" }), "FORBIDDEN");
    expect(anyDb.siteExpense.updateMany).not.toHaveBeenCalled();

    // lock checked against the EXPENSE date, not today
    const where = anyDb.fiscalYearLock.findFirst.mock.calls[0][0].where;
    expect(where.endDate.gte).toEqual(new Date("2025-07-15"));
  });

  it("posts a balanced JE to the category-mapped overhead account, in the same transaction", async () => {
    anyDb.siteExpense.findUnique.mockResolvedValue(pendingExpense());
    member("project_manager");
    // the tx re-read returns the full expense the JE is built from
    anyDb.siteExpense.findUniqueOrThrow.mockResolvedValue(pendingExpense());

    const caller = createCaller(siteExpenseRouter, PM);
    const res = await caller.approve({ id: "exp-1" });
    expect(res.expense.id).toBe("exp-1");

    // status flip happened — compare-and-swap on the validated status
    expect(anyDb.siteExpense.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "exp-1", status: "pending" },
        data: expect.objectContaining({ status: "approved" }),
      }),
    );

    // JE: Dr 6003 (fuel — NOT the old hardcoded 6006), Cr 1010 (bank_transfer)
    const jeData = anyDb.journalEntry.create.mock.calls[0][0].data;
    expect(jeData.source).toBe("site_expense");
    expect(jeData.organizationId).toBe("org-1");
    expect(jeData.totalDebit).toBe(5000);
    expect(jeData.totalCredit).toBe(5000);
    const lines = jeData.lines.create;
    expect(lines[0]).toMatchObject({ accountCode: "6003", debit: 5000, credit: 0 });
    expect(lines[1]).toMatchObject({ accountCode: "1010", debit: 0, credit: 5000 });
  });

  it("credits 1001 Cash for cash-mode expenses and maps food to 6004", async () => {
    anyDb.siteExpense.findUnique.mockResolvedValue(
      pendingExpense({ category: "food", paymentMode: "cash" }),
    );
    member("project_manager");
    anyDb.siteExpense.findUniqueOrThrow.mockResolvedValue(
      pendingExpense({ category: "food", paymentMode: "cash" }),
    );

    const caller = createCaller(siteExpenseRouter, PM);
    await caller.approve({ id: "exp-1" });

    const lines = anyDb.journalEntry.create.mock.calls[0][0].data.lines.create;
    expect(lines[0].accountCode).toBe("6004"); // food → Food & Mess
    expect(lines[1].accountCode).toBe("1001"); // cash
  });

  it("falls back to 6006 Misc for unknown categories", async () => {
    anyDb.siteExpense.findUnique.mockResolvedValue(
      pendingExpense({ category: "something-new" }),
    );
    member("project_manager");
    anyDb.siteExpense.findUniqueOrThrow.mockResolvedValue(
      pendingExpense({ category: "something-new" }),
    );

    const caller = createCaller(siteExpenseRouter, PM);
    await caller.approve({ id: "exp-1" });
    expect(
      anyDb.journalEntry.create.mock.calls[0][0].data.lines.create[0].accountCode,
    ).toBe("6006");
  });
});

// ─── update / reject / delete — status machine ──────────────────────────────
describe("siteExpense status machine", () => {
  it("update: only pending expenses can be edited", async () => {
    anyDb.siteExpense.findUnique.mockResolvedValue(
      pendingExpense({ status: "approved" }),
    );
    member("engineer");
    const caller = createCaller(siteExpenseRouter, ENGINEER);
    await expectTRPCError(
      caller.update({ id: "exp-1", description: "edited" }),
      "BAD_REQUEST",
    );
    expect(anyDb.siteExpense.update).not.toHaveBeenCalled();
  });

  it("update: recalculates totalAmount when only amount changes", async () => {
    anyDb.siteExpense.findUnique.mockImplementation(async ({ select }) => {
      if (select && "status" in select) return pendingExpense();
      return { amount: 4500, vatAmount: 500 };
    });
    member("engineer");
    const caller = createCaller(siteExpenseRouter, ENGINEER);
    await caller.update({ id: "exp-1", amount: 6000 });
    const data = anyDb.siteExpense.update.mock.calls[0][0].data;
    expect(data.amount).toBe(6000);
    expect(data.totalAmount).toBe(6500); // 6000 + existing vat 500
  });

  it("reject: only pending expenses can be rejected", async () => {
    anyDb.siteExpense.findUnique.mockResolvedValue(
      pendingExpense({ status: "rejected" }),
    );
    member("project_manager");
    const caller = createCaller(siteExpenseRouter, PM);
    await expectTRPCError(caller.reject({ id: "exp-1" }), "BAD_REQUEST");
    expect(anyDb.siteExpense.updateMany).not.toHaveBeenCalled();
  });

  it("delete: only pending expenses can be deleted", async () => {
    anyDb.siteExpense.findUnique.mockResolvedValue(
      pendingExpense({ status: "approved" }),
    );
    member("engineer");
    const caller = createCaller(siteExpenseRouter, ENGINEER);
    await expectTRPCError(caller.delete({ id: "exp-1" }), "BAD_REQUEST");
    expect(anyDb.siteExpense.delete).not.toHaveBeenCalled();
  });
});

// ─── stats ──────────────────────────────────────────────────────────────────
describe("siteExpense.stats", () => {
  it("aggregates by category and status", async () => {
    member("engineer");
    anyDb.siteExpense.findMany.mockResolvedValue([
      { category: "fuel", status: "approved", totalAmount: 1000 },
      { category: "fuel", status: "pending", totalAmount: 500 },
      { category: "food", status: "approved", totalAmount: 300 },
    ]);
    const caller = createCaller(siteExpenseRouter, ENGINEER);
    const res = await caller.stats({ projectId: "p-1" });
    expect(res.byCategory).toEqual({ fuel: 1500, food: 300 });
    expect(res.totalPending).toBe(500);
    expect(res.totalApproved).toBe(1300);
    expect(res.totalAll).toBe(1800);
    expect(res.totalCount).toBe(3);
  });
});
