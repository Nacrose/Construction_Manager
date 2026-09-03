/**
 * Router-layer tests for the payroll router — org-level runs at person
 * grain (ADR-0007).
 *
 * Pins:
 *   - Server-side recomputation: client-submitted amounts are IGNORED —
 *     the server recomputes from assignments + attendance + advances
 *   - Fiscal-year lock uses the run's PERIOD (back-dating cannot bypass)
 *   - Status machine: disburse marks person records paid + locks
 *     disbursedAmount
 *   - Records of another org are rejected (payrollPersonRecord scoped
 *     through payrollRun.organizationId)
 *   - A PayrollAllocation row is written per person record and the JE's
 *     labor line carries the allocation's projectId
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
const ENGINEER = buildUser();
const PM = buildUser();

function member(role: string | null) {
  anyDb.projectMember.findUnique.mockResolvedValue(role ? { role } : null);
}

beforeEach(() => {
  vi.resetAllMocks();
  // assertDelegation/capabilityGuard resolve the caller's org (Phase C).
  anyDb.organization.findUnique.mockResolvedValue(orgPolicyFixture());
});

// ─── createPayrollRun ────────────────────────────────────────────────────────
describe("payroll.createPayrollRun", () => {
  const runInput = {
    projectId: "p-1",
    month: "2025-01",
    records: [
      {
        personId: "per-1",
        presentDays: 30, // LIE — server recomputes from attendance
        baseRate: 5000, // LIE
        regularPay: 999999, // LIE
        netPayable: 999999, // LIE
      },
    ],
  };

  it("FORBIDDENs callers without a writable project membership", async () => {
    member(null);
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

  it("NOT_FOUNDs persons that have no active assignment on the project", async () => {
    member("engineer");
    anyDb.projectStaffAssignment.findMany.mockResolvedValue([]); // per-1 not on p-1
    const caller = createCaller(payrollRouter, ENGINEER);
    await expectTRPCError(caller.createPayrollRun(runInput), "NOT_FOUND");
    expect(anyDb.payrollRun.upsert).not.toHaveBeenCalled();
  });

  it("recomputes pay server-side, IGNORES client amounts, and writes an allocation", async () => {
    member("engineer");
    // Daily-wage worker: NPR 1000/day, has a PAN (TDS 1%) — the terms come
    // from the ACTIVE ASSIGNMENT, identity from the PERSON.
    anyDb.projectStaffAssignment.findMany.mockResolvedValue([
      {
        id: "a-1",
        projectId: "p-1",
        personId: "per-1",
        status: "active",
        designation: "Mason",
        category: "skilled",
        employmentType: "daily",
        gangName: null,
        dailyWage: 1000,
        monthlySalary: 0,
        fromDate: new Date("2024-01-01"),
        person: {
          id: "per-1",
          displayName: "Ram Bahadur",
          bankAccountNo: null,
          bankName: null,
          pan: "12345",
        },
      },
    ]);
    // Attendance: 20 present + 2 half days (effective 21 days), keyed by
    // the ASSIGNMENT (attendance grain is [assignmentId, date], ADR-0005)
    anyDb.staffAttendance.findMany.mockResolvedValue([
      ...Array.from({ length: 20 }, () => ({
        assignmentId: "a-1",
        date: new Date("2025-01-15"),
        status: "present",
        hours: 8,
        overtime: 0,
      })),
      ...Array.from({ length: 2 }, () => ({
        assignmentId: "a-1",
        date: new Date("2025-01-16"),
        status: "half_day",
        hours: 4,
        overtime: 0,
      })),
    ]);
    anyDb.staffAdvance.findMany.mockResolvedValue([]);
    anyDb.organization.findUnique.mockResolvedValue({
      id: ENGINEER.organizationId,
      activePolicyVersionId: "policy-1",
      operatingMethod: "delegated", // capabilityGuard: all capabilities on
      activePolicyVersion: null,
      financeLocation: "centralized",
      sitePettyCashLimit: 50000,
    });
    anyDb.payrollRun.upsert.mockResolvedValue({ id: "run-1" });
    anyDb.payrollPersonRecord.create.mockResolvedValue({ id: "rec-1" });
    // the allocation loop reads back what it wrote for JE line construction
    anyDb.payrollAllocation.findMany.mockResolvedValue([
      { projectId: "p-1", gross: 21000 },
    ]);

    const caller = createCaller(payrollRouter, ENGINEER);
    await caller.createPayrollRun(runInput);

    // Persisted PERSON record carries SERVER-COMPUTED values:
    //   regularPay = 21 effective days × 1000 = 21000
    //   tdsAmount  = 21000 × 1% (PAN holder) = 210
    //   netPayable = 21000 − 210 = 20790  (NOT the forged 999999)
    const recordData = anyDb.payrollPersonRecord.create.mock.calls[0][0].data;
    expect(recordData.organizationId).toBe(ENGINEER.organizationId); // RLS anchor
    expect(recordData.personId).toBe("per-1");
    expect(recordData.presentDays).toBe(20);
    expect(recordData.halfDays).toBe(2);
    expect(recordData.regularPay).toBe(21000);
    expect(recordData.tdsAmount).toBe(210);
    expect(recordData.netPayable).toBe(20790);
    expect(recordData.netPayable).not.toBe(999999);

    // Run is ORG-level: keyed (organizationId, period), bound to the active
    // policy version, one record per person.
    const upsertArgs = anyDb.payrollRun.upsert.mock.calls[0][0];
    expect(upsertArgs.where).toEqual({
      organizationId_period: {
        organizationId: ENGINEER.organizationId,
        period: "2025-01",
      },
    });
    const upsertData = upsertArgs.create;
    expect(upsertData.totalGross).toBe(21000);
    expect(upsertData.totalNetPayable).toBe(20790);
    expect(upsertData.totalPersonCount).toBe(1);
    expect(upsertData.policyVersionId).toBe("policy-1");

    // Allocation row: cost lands on the project via the assignment
    const allocData = anyDb.payrollAllocation.create.mock.calls[0][0].data;
    expect(allocData).toMatchObject({
      organizationId: ENGINEER.organizationId,
      payrollRunId: "run-1",
      personRecordId: "rec-1",
      assignmentId: "a-1",
      projectId: "p-1",
      basis: "actual_days",
      net: 20790,
    });

    // Payroll JE balanced: Dr 5010 (allocation line, projectId p-1) 21000
    //                   = Cr 2030 20790 + Cr 2020 210
    const jeData = anyDb.journalEntry.create.mock.calls[0][0].data;
    expect(jeData.source).toBe("payroll");
    expect(jeData.totalDebit).toBe(21000);
    expect(jeData.totalCredit).toBe(21000);
    const laborLine = jeData.lines.create.find((l: any) => l.accountCode === "5010");
    expect(laborLine.projectId).toBe("p-1");
    const liabilityLine = jeData.lines.create.find((l: any) => l.accountCode === "2030");
    expect(liabilityLine.projectId ?? null).toBeNull(); // org-level liability
  });
});

// ─── updateRunStatus ─────────────────────────────────────────────────────────
describe("payroll.updateRunStatus", () => {
  /** The router reads via findFirst; the engine re-reads via findUnique. */
  function mockRun(run: Record<string, unknown> | null) {
    anyDb.payrollRun.findFirst.mockResolvedValue(run);
    anyDb.payrollRun.findUnique.mockResolvedValue(run);
  }
  const statusInput = { projectId: "p-1", runId: "run-1", action: "disburse" as const };

  it("FORBIDDENs non-admin roles", async () => {
    member("engineer");
    const caller = createCaller(payrollRouter, ENGINEER);
    await expectTRPCError(caller.updateRunStatus(statusInput), "FORBIDDEN");
  });

  it("NOT_FOUNDs a run that is not in the caller's organization", async () => {
    member("project_manager");
    anyDb.payrollRun.findFirst.mockResolvedValue(null);
    const caller = createCaller(payrollRouter, PM);
    await expectTRPCError(caller.updateRunStatus(statusInput), "NOT_FOUND");
  });

  it("FORBIDDENs status changes on a run inside a locked fiscal year", async () => {
    member("project_manager");
    mockRun({
      id: "run-1",
      organizationId: PM.organizationId,
      period: "2025-01",
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
    expect(anyDb.payrollRun.updateMany).not.toHaveBeenCalled();
  });

  it("disburse marks all person records paid and locks disbursedAmount", async () => {
    member("project_manager");
    mockRun({
      id: "run-1",
      organizationId: PM.organizationId,
      period: "2026-02",
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

    expect(anyDb.payrollPersonRecord.updateMany).toHaveBeenCalledWith({
      where: { payrollRunId: "run-1" },
      data: { paymentStatus: "paid" },
    });
    // Engine CAS contract: compare-and-swap on the approved status, with the
    // disbursed amount locked in via additionalData.
    const updateData = anyDb.payrollRun.updateMany.mock.calls[0][0];
    expect(updateData.where).toEqual({ id: "run-1", status: "approved" });
    expect(updateData.data).toMatchObject({
      status: "disbursed",
      disbursedAmount: 20790,
    });
  });

  it("approve records the approver and timestamp", async () => {
    member("project_manager");
    mockRun({
      id: "run-1",
      organizationId: PM.organizationId,
      period: "2026-02",
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

    const updateData = anyDb.payrollRun.updateMany.mock.calls[0][0];
    expect(updateData.where).toEqual({ id: "run-1", status: "draft" });
    expect(updateData.data).toMatchObject({
      status: "approved",
      approvedById: PM.id,
    });
    expect(updateData.data.approvedAt).toBeInstanceOf(Date);
  });

  it("reopen returns an approved run to draft (engine graph edge)", async () => {
    member("project_manager");
    mockRun({
      id: "run-1",
      organizationId: PM.organizationId,
      period: "2026-02",
      status: "approved",
      totalNetPayable: 20790,
      createdAt: new Date("2025-02-01"),
      notes: null,
      approvedById: "pm-1",
      approvedAt: new Date("2025-02-02"),
      disbursedAmount: 0,
    });

    const caller = createCaller(payrollRouter, PM);
    await caller.updateRunStatus({
      projectId: "p-1",
      runId: "run-1",
      action: "reopen",
    });

    const updateData = anyDb.payrollRun.updateMany.mock.calls[0][0];
    expect(updateData.where).toEqual({ id: "run-1", status: "approved" });
    expect(updateData.data).toMatchObject({ status: "draft" });
  });

  it("BAD_REQUESTs disbursing a draft run (out-of-order lifecycle move)", async () => {
    member("project_manager");
    mockRun({
      id: "run-1",
      organizationId: PM.organizationId,
      period: "2026-02",
      status: "draft",
      totalNetPayable: 20790,
      createdAt: new Date("2025-02-01"),
      notes: null,
      approvedById: null,
      approvedAt: null,
      disbursedAmount: 0,
    });

    const caller = createCaller(payrollRouter, PM);
    await expectTRPCError(
      caller.updateRunStatus({ projectId: "p-1", runId: "run-1", action: "disburse" }),
      "BAD_REQUEST",
    );
    expect(anyDb.payrollRun.updateMany).not.toHaveBeenCalled();
    expect(anyDb.payrollPersonRecord.updateMany).not.toHaveBeenCalled();
  });
});

// ─── updateStaffPayment ──────────────────────────────────────────────────────
describe("payroll.updateStaffPayment", () => {
  const staffPayInput = {
    projectId: "p-1",
    recordId: "rec-1",
    paymentStatus: "paid" as const,
  };

  it("NOT_FOUNDs records belonging to another organization", async () => {
    member("engineer");
    anyDb.payrollPersonRecord.findFirst.mockResolvedValue(null);
    const caller = createCaller(payrollRouter, ENGINEER);
    await expectTRPCError(caller.updateStaffPayment(staffPayInput), "NOT_FOUND");
    expect(anyDb.payrollPersonRecord.update).not.toHaveBeenCalled();
  });

  it("paid without explicit amount defaults paidAmount to netPayable", async () => {
    member("engineer");
    anyDb.payrollPersonRecord.findFirst.mockResolvedValue({
      id: "rec-1",
      netPayable: 20790,
      paidAmount: 0,
      payrollRun: { status: "approved", createdAt: new Date("2025-02-01"), period: "2025-01" },
    });

    const caller = createCaller(payrollRouter, ENGINEER);
    await caller.updateStaffPayment(staffPayInput);

    const updateData = anyDb.payrollPersonRecord.update.mock.calls[0][0].data;
    expect(updateData.paidAmount).toBe(20790);
    expect(updateData.paymentStatus).toBe("paid");
  });
});

// ─── Phase C capability gates (ADR-0004) ────────────────────────────────────
describe("payroll capability gates", () => {
  it("createPayrollRun FORBIDDENs when the org disables workforcePlanning", async () => {
    anyDb.organization.findUnique.mockResolvedValue(
      orgPolicyFixture({ capabilities: { workforcePlanning: false } })
    );
    const caller = createCaller(payrollRouter, ENGINEER);
    await expectTRPCError(
      caller.createPayrollRun({ projectId: "p-1", month: "2081-05", records: [] } as any),
      "FORBIDDEN"
    );
  });
});
