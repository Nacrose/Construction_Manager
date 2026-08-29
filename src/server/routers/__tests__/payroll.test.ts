/**
 * Router-layer tests for the payroll router.
 *
 * Pins:
 *   - Server-side recomputation: client-submitted amounts are IGNORED —
 *     the server recomputes from staff + attendance + advances
 *   - Fiscal-year lock uses the run's MONTH (back-dating cannot bypass)
 *   - Status machine: disburse marks records paid + locks disbursedAmount
 *   - Cross-project record access is rejected (payrollStaffRecord scoped
 *     through payrollRun.projectId)
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { buildUser, createCaller, expectTRPCError } from "./test-utils";

vi.mock("@/lib/db", async () => {
  const { buildDbMock } = await import("./test-utils");
  const db = buildDbMock();
  return { db, getFreshDb: () => db };
});

import { db } from "@/lib/db";
import { payrollRouter } from "../payroll";

const anyDb = db as any;
const ENGINEER = buildUser();
const PM = buildUser();

function member(role: string) {
  anyDb.projectMember.findUnique.mockResolvedValue({ role });
}

beforeEach(() => {
  vi.resetAllMocks();
});

// ─── createPayrollRun ────────────────────────────────────────────────────────
describe("payroll.createPayrollRun", () => {
  const runInput = {
    projectId: "p-1",
    month: "2025-01",
    records: [
      {
        staffId: "s-1",
        presentDays: 30, // LIE — server recomputes from attendance
        baseRate: 5000, // LIE
        regularPay: 999999, // LIE
        netPayable: 999999, // LIE
      },
    ],
  };

  it("FORBIDDENs read-only roles", async () => {
    member("client");
    const caller = createCaller(payrollRouter, ENGINEER);
    await expectTRPCError(caller.createPayrollRun(runInput), "FORBIDDEN");
    expect(anyDb.payrollRun.upsert).not.toHaveBeenCalled();
  });

  it("FORBIDDENs a back-dated month inside a locked fiscal year BEFORE any write", async () => {
    member("engineer");
    anyDb.fiscalYearLock.findFirst.mockResolvedValue({ fiscalYear: "2081-82" });

    const caller = createCaller(payrollRouter, ENGINEER);
    await expectTRPCError(caller.createPayrollRun(runInput), "FORBIDDEN");
    expect(anyDb.payrollRun.upsert).not.toHaveBeenCalled();

    // The lock must be checked for the RUN MONTH (2025-01-01), not today —
    // this was the back-dating bypass fixed in the audit.
    const where = anyDb.fiscalYearLock.findFirst.mock.calls[0][0].where;
    expect(where.isLocked).toBe(true);
    expect(where.endDate.gte).toEqual(new Date("2025-01-01"));
  });

  it("NOT_FOUNDs staff that are not active members of the project", async () => {
    member("engineer");
    anyDb.staff.findMany.mockResolvedValue([]); // staff s-1 not in p-1
    const caller = createCaller(payrollRouter, ENGINEER);
    await expectTRPCError(caller.createPayrollRun(runInput), "NOT_FOUND");
    expect(anyDb.payrollRun.upsert).not.toHaveBeenCalled();
  });

  it("recomputes pay server-side and IGNORES client-submitted amounts", async () => {
    member("engineer");
    // Daily-wage worker: NPR 1000/day, has a PAN (TDS 1%)
    anyDb.staff.findMany.mockResolvedValue([
      {
        id: "s-1",
        name: "Ram Bahadur",
        designation: "Mason",
        category: "skilled",
        employmentType: "daily",
        gangName: null,
        dailyWage: 1000,
        monthlySalary: null,
        bankAccountNo: null,
        bankName: null,
        pan: "12345",
      },
    ]);
    // Attendance: 20 present + 2 half days (effective 21 days)
    anyDb.staffAttendance.findMany.mockResolvedValue([
      ...Array.from({ length: 20 }, () => ({
        staffId: "s-1",
        date: new Date("2025-01-15"),
        status: "present",
        hours: 8,
        overtime: 0,
      })),
      ...Array.from({ length: 2 }, () => ({
        staffId: "s-1",
        date: new Date("2025-01-16"),
        status: "half_day",
        hours: 4,
        overtime: 0,
      })),
    ]);
    anyDb.staffAdvance.findMany.mockResolvedValue([]);
    anyDb.payrollRun.upsert.mockResolvedValue({ id: "run-1" });

    const caller = createCaller(payrollRouter, ENGINEER);
    await caller.createPayrollRun(runInput);

    // Persisted record carries SERVER-COMPUTED values:
    //   regularPay = 21 effective days × 1000 = 21000
    //   tdsAmount  = 21000 × 1% (PAN holder) = 210
    //   netPayable = 21000 − 210 = 20790  (NOT the forged 999999)
    const recordData = anyDb.payrollStaffRecord.create.mock.calls[0][0].data;
    expect(recordData.presentDays).toBe(20);
    expect(recordData.halfDays).toBe(2);
    expect(recordData.regularPay).toBe(21000);
    expect(recordData.tdsAmount).toBe(210);
    expect(recordData.netPayable).toBe(20790);
    expect(recordData.netPayable).not.toBe(999999);

    // Run totals also server-computed
    const upsertData = anyDb.payrollRun.upsert.mock.calls[0][0].create;
    expect(upsertData.totalGross).toBe(21000);
    expect(upsertData.totalNetPayable).toBe(20790);
    expect(upsertData.totalStaffCount).toBe(1);

    // Payroll JE balanced: Dr 5010 21000 = Cr 2030 20790 + Cr 2020 210
    const jeData = anyDb.journalEntry.create.mock.calls[0][0].data;
    expect(jeData.source).toBe("payroll");
    expect(jeData.totalDebit).toBe(21000);
    expect(jeData.totalCredit).toBe(21000);
  });
});

// ─── updateRunStatus ─────────────────────────────────────────────────────────
describe("payroll.updateRunStatus", () => {
  const statusInput = { projectId: "p-1", runId: "run-1", action: "disburse" as const };

  it("FORBIDDENs non-admin roles", async () => {
    member("engineer");
    const caller = createCaller(payrollRouter, ENGINEER);
    await expectTRPCError(caller.updateRunStatus(statusInput), "FORBIDDEN");
  });

  it("NOT_FOUNDs a run that is not in the authorized project", async () => {
    member("project_manager");
    anyDb.payrollRun.findFirst.mockResolvedValue(null);
    const caller = createCaller(payrollRouter, PM);
    await expectTRPCError(caller.updateRunStatus(statusInput), "NOT_FOUND");
  });

  it("FORBIDDENs status changes on a run inside a locked fiscal year", async () => {
    member("project_manager");
    anyDb.payrollRun.findFirst.mockResolvedValue({
      id: "run-1",
      projectId: "p-1",
      status: "approved",
      totalNetPayable: 20790,
      createdAt: new Date("2025-01-15"),
      notes: null,
      approvedById: null,
      approvedAt: null,
      disbursedAmount: 0,
    });
    anyDb.fiscalYearLock.findFirst.mockResolvedValue({ fiscalYear: "2081-82" });

    const caller = createCaller(payrollRouter, PM);
    await expectTRPCError(caller.updateRunStatus(statusInput), "FORBIDDEN");
    expect(anyDb.payrollRun.update).not.toHaveBeenCalled();
  });

  it("disburse marks all staff records paid and locks disbursedAmount", async () => {
    member("project_manager");
    anyDb.payrollRun.findFirst.mockResolvedValue({
      id: "run-1",
      projectId: "p-1",
      status: "approved",
      totalNetPayable: 20790,
      createdAt: new Date("2025-02-01"),
      notes: null,
      approvedById: null,
      approvedAt: null,
      disbursedAmount: 0,
    });

    const caller = createCaller(payrollRouter, PM);
    await caller.updateRunStatus(statusInput);

    expect(anyDb.payrollStaffRecord.updateMany).toHaveBeenCalledWith({
      where: { payrollRunId: "run-1" },
      data: { paymentStatus: "paid" },
    });
    const updateData = anyDb.payrollRun.update.mock.calls[0][0].data;
    expect(updateData.status).toBe("disbursed");
    expect(updateData.disbursedAmount).toBe(20790);
  });

  it("approve records the approver and timestamp", async () => {
    member("project_manager");
    anyDb.payrollRun.findFirst.mockResolvedValue({
      id: "run-1",
      projectId: "p-1",
      status: "draft",
      totalNetPayable: 20790,
      createdAt: new Date("2025-02-01"),
      notes: null,
      approvedById: null,
      approvedAt: null,
      disbursedAmount: 0,
    });

    const caller = createCaller(payrollRouter, PM);
    await caller.updateRunStatus({
      projectId: "p-1",
      runId: "run-1",
      action: "approve",
    });

    const updateData = anyDb.payrollRun.update.mock.calls[0][0].data;
    expect(updateData.status).toBe("approved");
    expect(updateData.approvedById).toBe(PM.id);
    expect(updateData.approvedAt).toBeInstanceOf(Date);
  });
});

// ─── updateStaffPayment ──────────────────────────────────────────────────────
describe("payroll.updateStaffPayment", () => {
  const staffPayInput = {
    projectId: "p-1",
    recordId: "rec-1",
    paymentStatus: "paid" as const,
  };

  it("NOT_FOUNDs records belonging to another project", async () => {
    member("engineer");
    anyDb.payrollStaffRecord.findFirst.mockResolvedValue(null);
    const caller = createCaller(payrollRouter, ENGINEER);
    await expectTRPCError(caller.updateStaffPayment(staffPayInput), "NOT_FOUND");
    expect(anyDb.payrollStaffRecord.update).not.toHaveBeenCalled();
  });

  it("paid without explicit amount defaults paidAmount to netPayable", async () => {
    member("engineer");
    anyDb.payrollStaffRecord.findFirst.mockResolvedValue({
      id: "rec-1",
      netPayable: 20790,
      paidAmount: 0,
      payrollRun: { createdAt: new Date("2025-02-01") },
    });

    const caller = createCaller(payrollRouter, ENGINEER);
    await caller.updateStaffPayment(staffPayInput);

    const updateData = anyDb.payrollStaffRecord.update.mock.calls[0][0].data;
    expect(updateData.paidAmount).toBe(20790);
    expect(updateData.paymentStatus).toBe("paid");
  });
});
