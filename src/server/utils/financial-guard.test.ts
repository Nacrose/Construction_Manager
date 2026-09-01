import { describe, it, expect, vi, beforeEach } from "vitest";
import { z } from "zod";

// Mock the guard's dependency trio + RLS/authz so the FULL declarative
// pipeline (proc.write -> financialGuard -> handler) is exercised via a
// real tRPC caller, no database. The mocks assert WHAT flows through the
// pipeline (dates, summed amounts, bank ids, role checks) — the contract.
vi.mock("@/lib/fiscal-year-lock", () => ({
  assertNotLocked: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/delegation", () => ({
  assertDelegation: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/authz", () => ({
  assertProjectMember: vi.fn().mockResolvedValue("member"),
  assertCanWrite: vi.fn().mockResolvedValue("write"),
  assertProjectAdmin: vi.fn().mockResolvedValue("admin"),
  assertProjectManager: vi.fn().mockResolvedValue("manager"),
  assertOrgBankAccount: vi.fn().mockResolvedValue({ id: "bank-1" }),
  isOrgAdmin: vi.fn().mockReturnValue(false),
}));
vi.mock("@/lib/rls", () => ({
  setOrgContext: vi.fn().mockResolvedValue(undefined),
  withOrgContext: vi.fn().mockResolvedValue(undefined),
}));

import { assertNotLocked } from "@/lib/fiscal-year-lock";
import { assertDelegation } from "@/lib/delegation";
import { assertOrgBankAccount, assertCanWrite } from "@/lib/authz";
import { TRPCError } from "@trpc/server";
import { createCallerFactory } from "@/server/trpc";
import { createDomainRouter, financialGuard } from "@/server/trpc";

const mockedFiscal = vi.mocked(assertNotLocked);
const mockedDelegation = vi.mocked(assertDelegation);
const mockedBank = vi.mocked(assertOrgBankAccount);
const mockedCanWrite = vi.mocked(assertCanWrite);

const USER = { id: "user-1", organizationId: "org-1" } as any;

function buildCaller() {
  const { router, proc } = createDomainRouter();
  const testRouter = router({
    createExpense: proc.write
      .use(financialGuard({
        action: "create_site_expense",
        dateField: "date",
        amountFields: ["amount", "vatAmount"],
      }))
      .input(z.object({
        projectId: z.string(),
        date: z.string().optional(),
        amount: z.number().min(0).optional(),
        vatAmount: z.number().min(0).optional(),
      }))
      .mutation(async ({ ctx, input }) => ({
        callerId: ctx.user.id, // proves ctx.user narrowing survives the guard
        fiscalDate: ctx.fiscalDate,
        action: ctx.delegatedAction,
        projectId: input.projectId,
      })),
  });
  return createCallerFactory(testRouter)({ user: USER });
}

describe("financialGuard declarative pipeline (caller-level)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("runs authz -> fiscal lock -> delegation -> handler, in order", async () => {
    const caller = buildCaller();
    const result = await caller.createExpense({
      projectId: "p-1",
      date: "2026-04-15",
      amount: 1000,
      vatAmount: 130,
    });

    // Role check ran (proc.write)
    expect(mockedCanWrite).toHaveBeenCalledWith(USER, "p-1");
    // Fiscal lock got the named date field
    expect(mockedFiscal).toHaveBeenCalledWith("org-1", new Date("2026-04-15"));
    // Delegation got the SUM of the named amount fields
    expect(mockedDelegation).toHaveBeenCalledWith(USER, "create_site_expense", 1130);
    // Handler received narrowed user + injected financial metadata
    expect(result.callerId).toBe("user-1");
    expect(result.fiscalDate).toEqual(new Date("2026-04-15"));
    expect(result.action).toBe("create_site_expense");
  });

  it("defaults the fiscal date to today when the date field is absent", async () => {
    const caller = buildCaller();
    const result = await caller.createExpense({ projectId: "p-1", amount: 100 });
    const fiscal = result.fiscalDate as Date;
    expect(fiscal.getTime()).toBeGreaterThanOrEqual(Date.now() - 5_000);
  });

  it("skips delegation when the summed amount is zero", async () => {
    const caller = buildCaller();
    await caller.createExpense({ projectId: "p-1", amount: 0, vatAmount: 0 });
    expect(mockedDelegation).not.toHaveBeenCalled();
  });

  it("fails loud when the fiscal year is locked (before any handler logic)", async () => {
    mockedFiscal.mockRejectedValueOnce(
      new TRPCError({ code: "FORBIDDEN", message: "Fiscal year 2082 is locked." })
    );
    const caller = buildCaller();
    await expect(
      caller.createExpense({ projectId: "p-1", date: "2020-01-01", amount: 10 })
    ).rejects.toThrow("Fiscal year 2082 is locked.");
  });

  it("rejects unauthenticated callers at the guard, never silently passing", async () => {
    const { router, proc } = createDomainRouter();
    const t = router({
      probe: proc.write
        .use(financialGuard({ action: "create_site_expense", amountFields: ["amount"] }))
        .input(z.object({ projectId: z.string() }))
        .mutation(async () => "reached"),
    });
    const nullCaller = createCallerFactory(t)({ user: null });
    await expect(nullCaller.probe({ projectId: "p-1" })).rejects.toBeInstanceOf(TRPCError);
  });

  it("verifies named bank-account fields and skips null optionals", async () => {
    const { router, proc } = createDomainRouter();
    const t = router({
      payout: proc.write
        .use(financialGuard({
          action: "record_jv_payout",
          dateField: "payoutDate",
          amountFields: ["grossAmount"],
          bankAccountFields: ["bankAccountId"],
        }))
        .input(z.object({
          projectId: z.string(),
          payoutDate: z.string().optional(),
          grossAmount: z.number().positive().optional(),
          bankAccountId: z.string().optional().nullable(),
        }))
        .mutation(async () => "ok"),
    });
    const caller = createCallerFactory(t)({ user: USER });

    await caller.payout({ projectId: "p-1", payoutDate: "2026-04-15", grossAmount: 5000, bankAccountId: "bank-9" });
    expect(mockedBank).toHaveBeenCalledWith("bank-9", "org-1");
    expect(mockedDelegation).toHaveBeenCalledWith(USER, "record_jv_payout", 5000);

    await caller.payout({ projectId: "p-1", grossAmount: 5000, bankAccountId: null });
    expect(mockedBank).toHaveBeenCalledTimes(1); // not called again for null
  });
});
