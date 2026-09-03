/**
 * Router-layer tests for the payroll router — org-wide runs at person
 * grain (ADR-0007) with the Phase E money boundaries (ADR-0006 §2).
 *
 * Pins:
 *   - Org-wide combined attendance: one person paid ONCE per period from
 *     ALL their assignments across ALL projects
 *   - Server-side recomputation: client-submitted amounts are IGNORED
 *   - Cross-project allocations: Σ allocation.net ≡ record.netPayable
 *     EXACTLY (residual on the last allocation); allocationPercent
 *     fallback; manual splits require overrideReason and balance to the cent
 *   - Draft-only re-save (approved/disbursed immutable); ADDITIVE re-save
 *     (saving one project never wipes another's people)
 *   - Authority: org admin/owner only — a project role is neither
 *     necessary nor sufficient
 *   - APPROVE is the liability boundary: CAS advance recovery (ledgered)
 *     + org-level JE whose labor lines carry projectId per allocation
 *   - DISBURSE rides the settlement primitive: settlement JE + bank
 *     decrement + payslips bumped by AMOUNT (status DERIVED, never flipped)
 *   - REOPEN reverses exactly: JE reversal + ledgered un-recovery
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { buildUser, createCaller, expectTRPCError, orgPolicyFixture } from "./test-utils";

vi.mock("@/lib/db", async () => {
  const { buildDbMock } = await import("./test-utils");
  const db = buildDbMock();
  return { db, getFreshDb: () => db };
});

import { db } from "@/lib/db";
import { payrollRouter } from "../payroll";

const anyDb = db as any;
const MEMBER = buildUser(); // orgRole: member
const ADMIN = buildUser({ orgRole: "owner" });

function member(role: string | null) {
  anyDb.projectMember.findUnique.mockResolvedValue(role ? { role } : null);
}

/** Daily-wage person with assignments; attendance keyed per assignment. */
function assignment(id: string, personId: string, projectId: string, over: Record<string, unknown> = {}) {
  return {
    id,
    projectId,
    personId,
    status: "active",
    designation: "Mason",
    category: "skilled",
    employmentType: "daily",
    gangName: null,
    dailyWage: 1000,
    monthlySalary: 0,
    allocationPercent: null,
    fromDate: new Date("2024-01-01"),
    person: {
      id: personId,
      displayName: "Ram Bahadur",
      bankAccountNo: null,
      bankName: null,
      pan: "12345", // PAN holder → 1% TDS
    },
    ...over,
  };
}

function attendanceRow(assignmentId: string, status: string, date = "2025-01-15") {
  return { assignmentId, date: new Date(date), status, hours: 8, overtime: 0 };
}

beforeEach(() => {
  vi.resetAllMocks();
  // assertDelegation/capabilityGuard resolve the caller's org (Phase C).
  anyDb.organization.findUnique.mockResolvedValue(orgPolicyFixture());
});

// ─── createPayrollRun ────────────────────────────────────────────────────────

describe("payroll.createPayrollRun", () => {
  const runInput = {
    month: "2025-01",
    records: [{ personId: "per-1" }],
  };

  function mockSinglePersonOrg() {
    anyDb.projectStaffAssignment.findMany.mockResolvedValue([assignment("a-1", "per-1", "p-1")]);
    // 20 present + 2 half days (effective 21) → 21000 regular, 210 TDS
    anyDb.staffAttendance.findMany.mockResolvedValue([
      ...Array.from({ length: 20 }, () => attendanceRow("a-1", "present")),
      ...Array.from({ length: 2 }, () => attendanceRow("a-1", "half_day")),
    ]);
    anyDb.staffAdvance.findMany.mockResolvedValue([]);
    anyDb.payrollRun.findUnique.mockResolvedValue(null); // no existing run
    anyDb.payrollRun.upsert.mockResolvedValue({ id: "run-1", organizationId: "org-1", period: "2025-01" });
    anyDb.payrollPersonRecord.create.mockResolvedValue({
      id: "rec-1", personId: "per-1",
      regularPay: 21000, overtimePay: 0, allowances: 0,
      advanceDeduction: 0, messDeduction: 0, otherDeductions: 0,
      tdsAmount: 210, netPayable: 20790, paidAmount: 0,
    });
    anyDb.payrollPersonRecord.findMany.mockResolvedValue([{
      id: "rec-1", personId: "per-1",
      regularPay: 21000, overtimePay: 0, allowances: 0,
      advanceDeduction: 0, messDeduction: 0, otherDeductions: 0,
      tdsAmount: 210, netPayable: 20790, paidAmount: 0,
    }]);
    anyDb.organization.findUnique.mockResolvedValue(orgPolicyFixture({}) as any);
    anyDb.organization.findUnique.mockResolvedValue({
      ...orgPolicyFixture(),
      activePolicyVersionId: "policy-1",
    });
  }

  it("FORBIDDENs non-org-admin callers even with project write access", async () => {
    member("engineer");
    const caller = createCaller(payrollRouter, MEMBER);
    await expectTRPCError(caller.createPayrollRun(runInput), "FORBIDDEN");
    expect(anyDb.payrollRun.upsert).not.toHaveBeenCalled();
  });

  it("FORBIDDENs a back-dated month inside a locked fiscal year BEFORE any write", async () => {
    anyDb.fiscalYearLock.findFirst.mockResolvedValue({ fiscalYear: "2081-82" });
    const caller = createCaller(payrollRouter, ADMIN);
    await expectTRPCError(caller.createPayrollRun(runInput), "FORBIDDEN");
    expect(anyDb.payrollRun.upsert).not.toHaveBeenCalled();

    // The lock must be checked for the RUN MONTH (2025-01-01), not today.
    const where = anyDb.fiscalYearLock.findFirst.mock.calls[0][0].where;
    expect(where.isLocked).toBe(true);
    expect(where.endDate.gte).toEqual(new Date("2025-01-01"));
  });

  it("FORBIDDENs the save when the org disables workforcePlanning", async () => {
    anyDb.organization.findUnique.mockResolvedValue(
      orgPolicyFixture({ capabilities: { workforcePlanning: false } }),
    );
    const caller = createCaller(payrollRouter, ADMIN);
    await expectTRPCError(caller.createPayrollRun(runInput), "FORBIDDEN");
    expect(anyDb.payrollRun.upsert).not.toHaveBeenCalled();
  });

  it("BAD_REQUESTs re-saving an approved run (draft-only mutation)", async () => {
    anyDb.payrollRun.findUnique.mockResolvedValue({ id: "run-1", status: "approved" });
    const caller = createCaller(payrollRouter, ADMIN);
    await expectTRPCError(caller.createPayrollRun(runInput), "BAD_REQUEST");
    expect(anyDb.payrollRun.upsert).not.toHaveBeenCalled();
  });

  it("NOT_FOUNDs persons with no active assignment anywhere in the org", async () => {
    anyDb.projectStaffAssignment.findMany.mockResolvedValue([]);
    const caller = createCaller(payrollRouter, ADMIN);
    await expectTRPCError(caller.createPayrollRun(runInput), "NOT_FOUND");
    expect(anyDb.payrollRun.upsert).not.toHaveBeenCalled();
  });

  it("recomputes pay server-side from org-wide combined attendance and writes the allocation", async () => {
    mockSinglePersonOrg();

    const caller = createCaller(payrollRouter, ADMIN);
    await caller.createPayrollRun(runInput);

    // Persisted PERSON record carries SERVER-COMPUTED values:
    //   regularPay = 21 effective days × 1000 = 21000
    //   tdsAmount  = 21000 × 1% (PAN holder) = 210
    //   netPayable = 21000 − 210 = 20790
    const recordData = anyDb.payrollPersonRecord.create.mock.calls[0][0].data;
    expect(recordData.organizationId).toBe(ADMIN.organizationId); // RLS anchor
    expect(recordData.personId).toBe("per-1");
    expect(recordData.presentDays).toBe(20);
    expect(recordData.halfDays).toBe(2);
    expect(recordData.regularPay).toBe(21000);
    expect(recordData.tdsAmount).toBe(210);
    expect(recordData.netPayable).toBe(20790);

    // Run is ORG-level: keyed (organizationId, period), bound to the
    // active policy version. Drafts consume nothing — no JE, no recovery.
    const upsertArgs = anyDb.payrollRun.upsert.mock.calls[0][0];
    expect(upsertArgs.where).toEqual({
      organizationId_period: { organizationId: ADMIN.organizationId, period: "2025-01" },
    });
    expect(upsertArgs.create.policyVersionId).toBe("policy-1");
    expect(anyDb.journalEntry.create).not.toHaveBeenCalled();
    expect(anyDb.$executeRaw).not.toHaveBeenCalled(); // no advance CAS at draft

    // Allocation row: cost lands on the project via the assignment
    const allocData = anyDb.payrollAllocation.create.mock.calls[0][0].data;
    expect(allocData).toMatchObject({
      organizationId: ADMIN.organizationId,
      payrollRunId: "run-1",
      personRecordId: "rec-1",
      assignmentId: "a-1",
      projectId: "p-1",
      basis: "actual_days",
      net: 20790,
    });

    // Totals recomputed from ALL stored records
    const updateData = anyDb.payrollRun.update.mock.calls[0][0].data;
    expect(updateData.totalGross).toBe(21000);
    expect(updateData.totalNetPayable).toBe(20790);
    expect(updateData.totalPersonCount).toBe(1);
  });

  it("re-save is ADDITIVE: deletes only the submitted persons, keeps the rest", async () => {
    mockSinglePersonOrg();
    anyDb.payrollRun.findUnique.mockResolvedValue({ id: "run-1", status: "draft" });

    const caller = createCaller(payrollRouter, ADMIN);
    await caller.createPayrollRun(runInput);

    const deleteArgs = anyDb.payrollPersonRecord.deleteMany.mock.calls[0][0];
    expect(deleteArgs.where).toEqual({
      payrollRunId: "run-1",
      personId: { in: ["per-1"] }, // NOT a blanket delete of the run
    });
  });

  it("allocates across projects by actual days with the residual on the last assignment", async () => {
    // Person holds concurrent assignments on p-1 (12 effective days) and p-2 (8).
    anyDb.projectStaffAssignment.findMany.mockResolvedValue([
      assignment("a-1", "per-1", "p-1"),
      assignment("a-2", "per-1", "p-2", { fromDate: new Date("2024-02-01") }),
    ]);
    anyDb.staffAttendance.findMany.mockResolvedValue([
      ...Array.from({ length: 12 }, () => attendanceRow("a-1", "present")),
      ...Array.from({ length: 8 }, () => attendanceRow("a-2", "present")),
    ]);
    anyDb.staffAdvance.findMany.mockResolvedValue([]);
    anyDb.payrollRun.findUnique.mockResolvedValue(null);
    anyDb.payrollRun.upsert.mockResolvedValue({ id: "run-1", organizationId: "org-1", period: "2025-01" });
    // 20 effective days × 1000 = 20000 regular; TDS 1% = 200; net 19800
    anyDb.payrollPersonRecord.create.mockResolvedValue({
      id: "rec-1", personId: "per-1",
      regularPay: 20000, overtimePay: 0, allowances: 0,
      advanceDeduction: 0, messDeduction: 0, otherDeductions: 0,
      tdsAmount: 200, netPayable: 19800, paidAmount: 0,
    });

    const caller = createCaller(payrollRouter, ADMIN);
    await caller.createPayrollRun(runInput);

    const allocs = anyDb.payrollAllocation.create.mock.calls.map((c: any) => c[0].data);
    expect(allocs).toHaveLength(2);

    const byProject = new Map<string, any>(allocs.map((a: any): [string, any] => [a.projectId, a]));
    expect(byProject.get("p-1")).toMatchObject({ basis: "actual_days", presentDays: 12 });
    expect(byProject.get("p-2")).toMatchObject({ basis: "actual_days", presentDays: 8 });

    // Hard invariant (ADR-0007 §2): Σ allocation.net ≡ record.netPayable EXACTLY.
    const sumNet = allocs.reduce((s: number, a: any) => s + a.net, 0);
    expect(sumNet).toBe(19800);
    // 12/20 share of net = 11880 exactly; the residual 7920 lands on p-2.
    expect(byProject.get("p-1").net).toBe(11880);
    expect(byProject.get("p-2").net).toBe(7920);
    // Σ gross ≡ 20000 as well (the JE's labor lines must balance).
    const sumGross = allocs.reduce((s: number, a: any) => s + a.gross, 0);
    expect(sumGross).toBe(20000);
  });

  it("falls back to allocationPercent when the period has no attendance", async () => {
    anyDb.projectStaffAssignment.findMany.mockResolvedValue([
      assignment("a-1", "per-1", "p-1", { allocationPercent: 40, monthlySalary: 30000, employmentType: "monthly" }),
      assignment("a-2", "per-1", "p-2", { allocationPercent: 60, monthlySalary: 30000, employmentType: "monthly", fromDate: new Date("2024-02-01") }),
    ]);
    anyDb.staffAttendance.findMany.mockResolvedValue([]); // no attendance
    anyDb.staffAdvance.findMany.mockResolvedValue([]);
    anyDb.payrollRun.findUnique.mockResolvedValue(null);
    anyDb.payrollRun.upsert.mockResolvedValue({ id: "run-1", organizationId: "org-1", period: "2025-01" });
    // Monthly: full salary (no absences), TDS 1% → net 29700
    anyDb.payrollPersonRecord.create.mockResolvedValue({
      id: "rec-1", personId: "per-1",
      regularPay: 30000, overtimePay: 0, allowances: 0,
      advanceDeduction: 0, messDeduction: 0, otherDeductions: 0,
      tdsAmount: 300, netPayable: 29700, paidAmount: 0,
    });

    const caller = createCaller(payrollRouter, ADMIN);
    await caller.createPayrollRun(runInput);

    const allocs = anyDb.payrollAllocation.create.mock.calls.map((c: any) => c[0].data);
    const byProject = new Map<string, any>(allocs.map((a: any): [string, any] => [a.projectId, a]));
    expect(byProject.get("p-1").basis).toBe("allocation_percent");
    expect(byProject.get("p-1").net).toBe(11880); // 40%
    expect(byProject.get("p-2").net).toBe(17820); // 60% (residual)
    expect(allocs.reduce((s: number, a: any) => s + a.net, 0)).toBe(29700);
  });

  it("accepts an audited manual split that balances exactly", async () => {
    mockSinglePersonOrg();
    const caller = createCaller(payrollRouter, ADMIN);
    await caller.createPayrollRun({
      ...runInput,
      records: [{
        personId: "per-1",
        manualAllocations: [{
          assignmentId: "a-1",
          gross: 21000, allowances: 0, advanceDeduction: 0, tdsAmount: 210,
          net: 20790,
          overrideReason: "worker agreed to park all cost on site A this month",
        }],
      }],
    });

    const allocData = anyDb.payrollAllocation.create.mock.calls[0][0].data;
    expect(allocData).toMatchObject({ basis: "manual", net: 20790 });
    expect(allocData.overrideReason).toContain("site A");
  });

  it("rejects a manual split that does not balance to the cent", async () => {
    mockSinglePersonOrg();
    const caller = createCaller(payrollRouter, ADMIN);
    await expectTRPCError(
      caller.createPayrollRun({
        ...runInput,
        records: [{
          personId: "per-1",
          manualAllocations: [{
            assignmentId: "a-1",
            gross: 21000, allowances: 0, advanceDeduction: 0, tdsAmount: 0,
            net: 20000, // ≠ 20790
            overrideReason: "wrong on purpose",
          }],
        }],
      }),
      "BAD_REQUEST",
    );
    expect(anyDb.payrollAllocation.create).not.toHaveBeenCalled();
  });
});

// ─── updateRunStatus (approve / disburse / reopen) ──────────────────────────

describe("payroll.updateRunStatus", () => {
  /** The router reads via findFirst; the engine re-reads via findUnique. */
  function mockRun(run: Record<string, unknown> | null) {
    anyDb.payrollRun.findFirst.mockResolvedValue(run);
    anyDb.payrollRun.findUnique.mockResolvedValue(run);
  }
  // The engine populates approvedBy/At only when the entity carries the
  // fields — include them the way the Prisma row would.
  function runRow(over: Record<string, unknown>) {
    return {
      approvedById: null,
      approvedAt: null,
      disbursedAmount: 0,
      notes: null,
      ...over,
    };
  }
  const storedRecord = {
    id: "rec-1", personId: "per-1",
    presentDays: 20, halfDays: 2, absentDays: 0, leaveDays: 0, overtimeHours: 0, baseRate: 1000,
    regularPay: 21000, overtimePay: 0, allowances: 0,
    advanceDeduction: 0, messDeduction: 0, otherDeductions: 0,
    tdsAmount: 210, netPayable: 20790, paidAmount: 0,
  };

  it("FORBIDDENs non-org-admin callers", async () => {
    member("project_manager"); // project role is irrelevant now
    const caller = createCaller(payrollRouter, MEMBER);
    await expectTRPCError(
      caller.updateRunStatus({ runId: "run-1", action: "disburse" }),
      "FORBIDDEN",
    );
    expect(anyDb.payrollRun.updateMany).not.toHaveBeenCalled();
  });

  it("NOT_FOUNDs a run that is not in the caller's organization", async () => {
    anyDb.payrollRun.findFirst.mockResolvedValue(null);
    const caller = createCaller(payrollRouter, ADMIN);
    await expectTRPCError(
      caller.updateRunStatus({ runId: "run-1", action: "disburse" }),
      "NOT_FOUND",
    );
  });

  it("FORBIDDENs status changes on a run inside a locked fiscal year", async () => {
    mockRun({
      id: "run-1", organizationId: ADMIN.organizationId, period: "2025-01",
      status: "approved", totalNetPayable: 20790,
    });
    anyDb.fiscalYearLock.findFirst.mockResolvedValue({ fiscalYear: "2081-82" });

    const caller = createCaller(payrollRouter, ADMIN);
    await expectTRPCError(
      caller.updateRunStatus({ runId: "run-1", action: "disburse" }),
      "FORBIDDEN",
    );
    expect(anyDb.payrollRun.updateMany).not.toHaveBeenCalled();
  });

  it("approve is the LIABILITY boundary: CAS advance recovery + org-level JE, no labor line without allocations", async () => {
    mockRun(runRow({
      id: "run-1", organizationId: ADMIN.organizationId, period: "2026-02",
      status: "draft", totalNetPayable: 20790,
    }));
    anyDb.payrollPersonRecord.findMany.mockResolvedValue([{
      ...storedRecord,
      advanceDeduction: 2000, messDeduction: 500, // deductions to recover
      netPayable: 18290,
    }]);
    // FIFO outstanding advance for the person
    anyDb.staffAdvance.findMany.mockResolvedValue([
      { id: "adv-1", personId: "per-1", amount: 5000, recoveredAmount: 0, date: new Date("2025-12-01") },
    ]);
    anyDb.payrollAllocation.findMany.mockResolvedValue([
      { projectId: "p-1", gross: 21000 },
    ]);
    anyDb.journalEntry.findFirst.mockResolvedValue(null); // no JE yet

    const caller = createCaller(payrollRouter, ADMIN);
    await caller.updateRunStatus({ runId: "run-1", action: "approve" });

    // CAS recovery of exactly advanceDeduction + messDeduction = 2500
    const casSql = anyDb.$executeRaw.mock.calls[0][0];
    expect(String(casSql)).toContain("StaffAdvance");
    // Ledger row records the exact amount for exact reversal
    expect(anyDb.payrollAdvanceRecovery.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        payrollRunId: "run-1",
        advanceId: "adv-1",
        personRecordId: "rec-1",
        organizationId: ADMIN.organizationId,
      }),
    });

    // Liability JE: source payroll, idempotency lookup first, balanced
    // Dr 5010 (allocation, projectId) = Cr 2030 + Cr 2020 + Cr 2040 + Cr 1001
    expect(anyDb.journalEntry.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { source: "payroll", sourceRefId: "run-1" } }),
    );
    const jeData = anyDb.journalEntry.create.mock.calls[0][0].data;
    expect(jeData.source).toBe("payroll");
    expect(jeData.totalDebit).toBe(jeData.totalCredit);
    const laborLine = jeData.lines.create.find((l: any) => l.accountCode === "5010");
    expect(laborLine.projectId).toBe("p-1");
    const liabilityLine = jeData.lines.create.find((l: any) => l.accountCode === "2030");
    expect(liabilityLine.credit).toBe(18290);
    const recoverable = jeData.lines.create.filter((l: any) => l.accountCode === "2040");
    expect(recoverable.some((l: any) => l.credit === 2000)).toBe(true); // advance recovery

    // Engine CAS contract on the lifecycle move
    const updateData = anyDb.payrollRun.updateMany.mock.calls[0][0];
    expect(updateData.where).toEqual({ id: "run-1", status: "draft" });
    expect(updateData.data).toMatchObject({ status: "approved", approvedById: ADMIN.id });
  });

  it("approve is idempotent on the JE: skips posting when it already exists", async () => {
    mockRun(runRow({
      id: "run-1", organizationId: ADMIN.organizationId, period: "2026-02",
      status: "draft", totalNetPayable: 20790,
    }));
    anyDb.payrollPersonRecord.findMany.mockResolvedValue([storedRecord]);
    anyDb.staffAdvance.findMany.mockResolvedValue([]);
    anyDb.journalEntry.findFirst.mockResolvedValue({ id: "je-1" }); // already posted

    const caller = createCaller(payrollRouter, ADMIN);
    await caller.updateRunStatus({ runId: "run-1", action: "approve" });

    expect(anyDb.journalEntry.create).not.toHaveBeenCalled();
  });

  it("disburse rides the settlement primitive: settlement JE + paidAmount bump (no status flip)", async () => {
    mockRun(runRow({
      id: "run-1", organizationId: ADMIN.organizationId, period: "2026-02",
      status: "approved", totalNetPayable: 20790,
    }));
    anyDb.journalEntry.findFirst.mockResolvedValue(null); // no settlement JE yet
    anyDb.companyBankAccount.findUnique.mockResolvedValue({
      id: "bank-1", organizationId: ADMIN.organizationId, currentBalance: 100000, name: "Main", accountNumber: "001",
    });

    const caller = createCaller(payrollRouter, ADMIN);
    await caller.updateRunStatus({
      runId: "run-1",
      action: "disburse",
      companyBankAccountId: "bank-1",
    });

    // Settlement JE: Dr 2030 / Cr 1010, org-level
    const jeData = anyDb.journalEntry.create.mock.calls[0][0].data;
    expect(jeData.source).toBe("payroll_disbursement");
    expect(jeData.totalDebit).toBe(20790);
    expect(jeData.totalCredit).toBe(20790);

    // Bank decrement rode the same tx for the chosen org account
    const sqls = anyDb.$executeRaw.mock.calls.map((c: any) => String(c[0]));
    expect(sqls.some((s: string) => s.includes("PayrollPersonRecord"))).toBe(true); // paidAmount bump

    // disbursedAmount locked via additionalData on the engine CAS
    const updateData = anyDb.payrollRun.updateMany.mock.calls[0][0];
    expect(updateData.data).toMatchObject({ status: "disbursed", disbursedAmount: 20790 });
    // No payslip status flip exists anymore — amounts are the truth
    expect(anyDb.payrollPersonRecord.updateMany).not.toHaveBeenCalled();
  });

  it("BAD_REQUESTs disbursing a draft run (out-of-order lifecycle move)", async () => {
    mockRun(runRow({
      id: "run-1", organizationId: ADMIN.organizationId, period: "2026-02",
      status: "draft", totalNetPayable: 20790,
    }));
    const caller = createCaller(payrollRouter, ADMIN);
    await expectTRPCError(
      caller.updateRunStatus({ runId: "run-1", action: "disburse" }),
      "BAD_REQUEST",
    );
    expect(anyDb.payrollRun.updateMany).not.toHaveBeenCalled();
  });

  it("reopen reverses exactly: JE reversal + ledgered un-recovery + amount reset", async () => {
    mockRun(runRow({
      id: "run-1", organizationId: ADMIN.organizationId, period: "2026-02",
      status: "approved", totalNetPayable: 20790,
    }));
    // Liability JE exists → must be reversed
    anyDb.journalEntry.findFirst.mockResolvedValueOnce({ id: "je-orig" }); // liability lookup
    // reverseJournalEntry re-reads the original WITH its lines (array)
    anyDb.journalEntry.findUnique.mockResolvedValue({
      id: "je-orig", entryNumber: "JE-2026-0001",
      totalDebit: 21000, totalCredit: 21000, organizationId: ADMIN.organizationId,
      lines: [
        { accountCode: "5010", accountName: "Direct Labor", debit: 21000, credit: 0, description: "labor", projectId: "p-1", partnerId: null },
        { accountCode: "2030", accountName: "Salary Payable", debit: 0, credit: 21000, description: "net", projectId: null, partnerId: null },
      ],
    });
    anyDb.journalEntry.count.mockResolvedValue(0);
    // Recovery ledger rows to reverse
    anyDb.payrollAdvanceRecovery.findMany.mockResolvedValue([
      { id: "par-1", advanceId: "adv-1", amount: 2500 },
    ]);

    const caller = createCaller(payrollRouter, ADMIN);
    await caller.updateRunStatus({ runId: "run-1", action: "reopen" });

    // Reversal JE created against the original
    expect(anyDb.journalEntry.create).toHaveBeenCalled();

    // Un-recovery CAS decrements by the ledgered amount, then deletes the row
    const sqls = anyDb.$executeRaw.mock.calls.map((c: any) => String(c[0]));
    expect(sqls.some((s: string) => s.includes("StaffAdvance"))).toBe(true);
    expect(anyDb.payrollAdvanceRecovery.delete).toHaveBeenCalledWith({ where: { id: "par-1" } });

    // Payslip amounts reset to 0 (status will derive to unpaid)
    expect(anyDb.payrollPersonRecord.updateMany).toHaveBeenCalledWith({
      where: { payrollRunId: "run-1" },
      data: { paidAmount: 0 },
    });

    const updateData = anyDb.payrollRun.updateMany.mock.calls[0][0];
    expect(updateData.where).toEqual({ id: "run-1", status: "approved" });
    expect(updateData.data).toMatchObject({ status: "draft" });
  });
});

// ─── updateStaffPayment (CAS increment, derived status) ─────────────────────

describe("payroll.updateStaffPayment", () => {
  it("FORBIDDENs non-org-admin callers", async () => {
    const caller = createCaller(payrollRouter, MEMBER);
    await expectTRPCError(
      caller.updateStaffPayment({ recordId: "rec-1", amount: 100 }),
      "FORBIDDEN",
    );
    expect(anyDb.$executeRaw).not.toHaveBeenCalled();
  });

  it("NOT_FOUNDs records belonging to another organization", async () => {
    anyDb.payrollPersonRecord.findFirst.mockResolvedValue(null);
    const caller = createCaller(payrollRouter, ADMIN);
    await expectTRPCError(
      caller.updateStaffPayment({ recordId: "rec-1", amount: 100 }),
      "NOT_FOUND",
    );
  });

  it("BAD_REQUESTs paying a payslip on a draft run", async () => {
    anyDb.payrollPersonRecord.findFirst.mockResolvedValue({
      id: "rec-1", netPayable: 20790, paidAmount: 0, createdAt: new Date("2025-02-01"),
      payrollRun: { status: "draft", period: "2025-01" },
    });
    const caller = createCaller(payrollRouter, ADMIN);
    await expectTRPCError(
      caller.updateStaffPayment({ recordId: "rec-1", amount: 100 }),
      "BAD_REQUEST",
    );
    expect(anyDb.$executeRaw).not.toHaveBeenCalled();
  });

  it("increments paidAmount under CAS and returns the DERIVED payment status", async () => {
    anyDb.payrollPersonRecord.findFirst.mockResolvedValue({
      id: "rec-1", netPayable: 20790, paidAmount: 10000, createdAt: new Date("2025-02-01"),
      payrollRun: { status: "approved", period: "2025-01" },
    });
    anyDb.$executeRaw.mockResolvedValue(1); // CAS win
    anyDb.payrollPersonRecord.findUnique.mockResolvedValue({
      id: "rec-1", netPayable: 20790, paidAmount: 10790,
    });

    const caller = createCaller(payrollRouter, ADMIN);
    const res = await caller.updateStaffPayment({
      recordId: "rec-1", amount: 790, paymentMethod: "bank_transfer",
    });

    const casSql = String(anyDb.$executeRaw.mock.calls[0][0]);
    expect(casSql).toContain("paidAmount");
    expect(res.record.paymentStatus).toBe("partial"); // 10790 < 20790
  });

  it("rejects a payment that would overpay the payslip", async () => {
    anyDb.payrollPersonRecord.findFirst.mockResolvedValue({
      id: "rec-1", netPayable: 20790, paidAmount: 20790, createdAt: new Date("2025-02-01"),
      payrollRun: { status: "disbursed", period: "2025-01" },
    });
    anyDb.$executeRaw.mockResolvedValue(0); // CAS guard rejects

    const caller = createCaller(payrollRouter, ADMIN);
    await expectTRPCError(
      caller.updateStaffPayment({ recordId: "rec-1", amount: 100 }),
      "BAD_REQUEST",
    );
  });
});

// ─── calculate (org-wide preview) + getRun (derived status) ─────────────────

describe("payroll.calculate (org-wide preview)", () => {
  it("combines attendance across the person's projects into ONE line and badges the calling project", async () => {
    anyDb.projectStaffAssignment.findMany.mockResolvedValue([
      assignment("a-1", "per-1", "p-1"),
      assignment("a-2", "per-1", "p-2", { fromDate: new Date("2024-02-01") }),
    ]);
    anyDb.staffAttendance.findMany.mockResolvedValue([
      ...Array.from({ length: 12 }, () => attendanceRow("a-1", "present")),
      ...Array.from({ length: 8 }, () => attendanceRow("a-2", "present")),
    ]);
    anyDb.staffAdvance.findMany.mockResolvedValue([]);
    anyDb.payrollRun.findUnique.mockResolvedValue(null);

    const caller = createCaller(payrollRouter, ADMIN);
    const res = await caller.calculate({ projectId: "p-1", month: "2025-01" });

    expect(res.payrollItems).toHaveLength(1); // ONE person, ONE line
    expect(res.payrollItems[0].presentDays).toBe(20); // 12 + 8 combined
    expect(res.payrollItems[0].regularPay).toBe(20000);
    expect(res.payrollItems[0].onCallingProject).toBe(true); // engaged on p-1
    expect(res.summary.grandTotal).toBe(19800);
  });

  it("flags other-site workers and derives existing-run payment statuses", async () => {
    anyDb.projectStaffAssignment.findMany.mockResolvedValue([
      assignment("a-1", "per-1", "p-2"), // NOT on the calling project
    ]);
    anyDb.staffAttendance.findMany.mockResolvedValue([attendanceRow("a-1", "present")]);
    anyDb.staffAdvance.findMany.mockResolvedValue([]);
    anyDb.payrollRun.findUnique.mockResolvedValue({
      id: "run-1", status: "approved",
      records: [
        { id: "rec-1", paidAmount: 990, netPayable: 990 },
        { id: "rec-2", paidAmount: 500, netPayable: 990 },
        { id: "rec-3", paidAmount: 0, netPayable: 990 },
      ],
    });

    const caller = createCaller(payrollRouter, ADMIN);
    const res = await caller.calculate({ projectId: "p-1", month: "2025-01" });

    expect(res.payrollItems[0].onCallingProject).toBe(false);
    const statuses = res.existingRun.records.map((r: any) => r.paymentStatus);
    expect(statuses).toEqual(["paid", "partial", "unpaid"]);
  });

  it("FORBIDDENs callers without an organization", async () => {
    const ORPHAN = buildUser({ organizationId: null as any });
    const caller = createCaller(payrollRouter, ORPHAN);
    await expectTRPCError(caller.calculate({ month: "2025-01" }), "FORBIDDEN");
  });
});

describe("payroll.getRun", () => {
  it("scopes to the caller's organization and derives payment status", async () => {
    anyDb.payrollRun.findFirst.mockResolvedValue({
      id: "run-1",
      records: [
        { id: "rec-1", paidAmount: 20790, netPayable: 20790, person: {}, allocations: [] },
        { id: "rec-2", paidAmount: 1000, netPayable: 20790, person: {}, allocations: [] },
      ],
    });

    const caller = createCaller(payrollRouter, ADMIN);
    const res = await caller.getRun({ runId: "run-1" });

    expect(anyDb.payrollRun.findFirst.mock.calls[0][0].where.organizationId).toBe(ADMIN.organizationId);
    expect(res.run.records[0].paymentStatus).toBe("paid");
    expect(res.run.records[1].paymentStatus).toBe("partial");
  });
});
