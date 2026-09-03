/**
 * Unit tests for the workforce domain service (Phase D, ADR-0005).
 *
 * Pins the invariants the schema deliberately does NOT enforce:
 *   - overlap: cross-project concurrency is a WARNING requiring an
 *     audited overrideReason; same-project overlap is always rejected
 *   - daily capacity: one person's combined effective days across ALL
 *     projects on one date cannot exceed 1.0 without an override
 *   - transfer: ends the old engagement (CAS) and opens a chained new
 *     one, defaulting terms from the old row; history is preserved
 *   - merge: re-points every referencing row, consolidates leave
 *     balances, marks the duplicate mergedIntoId — and FAILS LOUD on
 *     same-payroll-run collisions and cross-org attempts
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { buildDbMock } from "../../routers/__tests__/test-utils";

vi.mock("@/lib/db", async () => {
  const db = buildDbMock();
  return { db, getFreshDb: () => db };
});

vi.mock("@/lib/audit", () => ({ audit: vi.fn() }));

import { db } from "@/lib/db";
import {
  EFFECTIVE_DAY_WEIGHTS,
  effectiveDaysOf,
  assertAssignmentOverlapAcked,
  assertBulkDailyCapacity,
  assertDailyCapacity,
  transferAssignment,
  mergePersons,
  getPersonHistory,
} from "../workforce";

const anyDb = db as any;
const tx = db; // service accepts db-or-tx; the mock $transaction passes the proxy through

beforeEach(() => {
  vi.resetAllMocks();
});

// ─── effective-day weights ──────────────────────────────────────────────────

describe("effectiveDaysOf", () => {
  it("weights present/overtime at 1, half_day at 0.5, absent/leave/unlogged at 0", () => {
    expect(effectiveDaysOf("present")).toBe(1);
    expect(effectiveDaysOf("overtime")).toBe(1);
    expect(effectiveDaysOf("half_day")).toBe(0.5);
    expect(effectiveDaysOf("absent")).toBe(0);
    expect(effectiveDaysOf("leave")).toBe(0);
    expect(effectiveDaysOf("unlogged")).toBe(0);
  });

  it("fails safe on unknown statuses (0, never inflating capacity)", () => {
    expect(effectiveDaysOf("mystery")).toBe(0);
    expect(Object.keys(EFFECTIVE_DAY_WEIGHTS)).not.toContain("mystery");
  });
});

// ─── overlap (warning → audited override) ───────────────────────────────────

describe("assertAssignmentOverlapAcked", () => {
  const window = { fromDate: new Date("2026-05-01"), toDate: null };

  it("passes cleanly when no active assignment overlaps", async () => {
    anyDb.projectStaffAssignment.findMany.mockResolvedValue([]);

    const res = await assertAssignmentOverlapAcked(tx, {
      personId: "per-1",
      projectId: "p-2",
      window,
    });

    expect(res).toEqual({ warning: false, overlaps: [] });
  });

  it("REJECTS a cross-project overlap without an override reason", async () => {
    anyDb.projectStaffAssignment.findMany.mockResolvedValue([
      { id: "a-9", projectId: "p-1", status: "active", fromDate: new Date("2026-01-01"), toDate: null },
    ]);

    await expect(
      assertAssignmentOverlapAcked(tx, { personId: "per-1", projectId: "p-2", window }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST", message: expect.stringContaining("override reason") });
  });

  it("returns warning=true when the override acknowledges a cross-project overlap", async () => {
    anyDb.projectStaffAssignment.findMany.mockResolvedValue([
      { id: "a-9", projectId: "p-1", status: "active", fromDate: new Date("2026-01-01"), toDate: null },
    ]);

    const res = await assertAssignmentOverlapAcked(tx, {
      personId: "per-1",
      projectId: "p-2",
      window,
      overrideReason: "worker alternates sites weekly",
    });

    expect(res.warning).toBe(true);
    expect(res.overlaps).toHaveLength(1);
  });

  it("always rejects a SAME-project overlap, even with an override", async () => {
    anyDb.projectStaffAssignment.findMany.mockResolvedValue([
      { id: "a-9", projectId: "p-1", status: "active", fromDate: new Date("2026-01-01"), toDate: null },
    ]);

    await expect(
      assertAssignmentOverlapAcked(tx, {
        personId: "per-1",
        projectId: "p-1",
        window,
        overrideReason: "try anyway",
      }),
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: expect.stringContaining("end or transfer the existing engagement"),
    });
  });

  it("excludes the given assignment (transfer path re-checks the target, not the source)", async () => {
    anyDb.projectStaffAssignment.findMany.mockResolvedValue([]);

    await assertAssignmentOverlapAcked(tx, {
      personId: "per-1",
      projectId: "p-1",
      window,
      excludeAssignmentId: "a-self",
    });

    const where = anyDb.projectStaffAssignment.findMany.mock.calls[0][0].where;
    expect(where.id).toEqual({ not: "a-self" });
  });
});

// ─── cross-project daily capacity ───────────────────────────────────────────

describe("assertDailyCapacity (single-record primitive)", () => {
  it("passes when the combined effective days stay at or under 1.0", async () => {
    anyDb.staffAttendance.findMany.mockResolvedValue([{ status: "half_day" }]);

    const res = await assertDailyCapacity(tx, {
      personId: "per-1",
      date: new Date("2026-05-01"),
      incomingEffective: 0.5,
      assignmentId: "a-1",
    });
    expect(res.totalEffective).toBe(1);
  });

  it("rejects when another project's full day already exists (no override)", async () => {
    anyDb.staffAttendance.findMany.mockResolvedValue([{ status: "present" }]);

    await expect(
      assertDailyCapacity(tx, {
        personId: "per-1",
        date: new Date("2026-05-01"),
        incomingEffective: 1,
        assignmentId: "a-1",
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST", message: expect.stringContaining("Daily capacity exceeded") });
  });

  it("excludes the incoming assignment's own row (upsert semantics)", async () => {
    anyDb.staffAttendance.findMany.mockResolvedValue([]);

    await assertDailyCapacity(tx, {
      personId: "per-1",
      date: new Date("2026-05-01"),
      incomingEffective: 1,
      assignmentId: "a-1",
    });

    const where = anyDb.staffAttendance.findMany.mock.calls[0][0].where;
    expect(where.assignment).toEqual({ personId: "per-1", id: { not: "a-1" } });
  });
});

describe("assertBulkDailyCapacity (bulk write path)", () => {
  const date = new Date("2026-05-01");

  it("accepts a batch where each person stays within one effective day", async () => {
    anyDb.staffAttendance.findMany.mockResolvedValue([]); // no outside rows

    await assertBulkDailyCapacity(tx, {
      date,
      records: [
        { personId: "per-1", assignmentId: "a-1", status: "half_day" },
        { personId: "per-1", assignmentId: "a-2", status: "half_day" }, // two sites, 0.5 + 0.5 = 1.0
        { personId: "per-2", assignmentId: "a-3", status: "present" },
      ],
    });
  });

  it("rejects a person whose batch total exceeds one day (no override)", async () => {
    await expect(
      assertBulkDailyCapacity(tx, {
        date,
        records: [
          { personId: "per-1", assignmentId: "a-1", status: "present" },
          { personId: "per-1", assignmentId: "a-2", status: "present" },
        ],
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST", message: expect.stringContaining("per-1 → 2") });
  });

  it("counts DB rows on assignments OUTSIDE the batch (other-project capacity)", async () => {
    anyDb.staffAttendance.findMany.mockResolvedValue([
      { status: "present", assignment: { personId: "per-1" } },
    ]);

    await expect(
      assertBulkDailyCapacity(tx, {
        date,
        records: [{ personId: "per-1", assignmentId: "a-1", status: "present" }],
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST", message: expect.stringContaining("Daily capacity") });
  });

  it("treats a half-day batch over an absent DB row as fine (absent weighs 0)", async () => {
    anyDb.staffAttendance.findMany.mockResolvedValue([
      { status: "absent", assignment: { personId: "per-1" } },
    ]);

    await assertBulkDailyCapacity(tx, {
      date,
      records: [{ personId: "per-1", assignmentId: "a-1", status: "half_day" }],
    });
  });

  it("allows an over-capacity batch through with an override reason", async () => {
    anyDb.staffAttendance.findMany.mockResolvedValue([]);

    await expect(
      assertBulkDailyCapacity(tx, {
        date,
        records: [
          { personId: "per-1", assignmentId: "a-1", status: "present" },
          { personId: "per-1", assignmentId: "a-2", status: "present" },
        ],
        overrideReason: "emergency crew split",
      }),
    ).resolves.toBeUndefined();
  });
});

// ─── transfer / rehire ──────────────────────────────────────────────────────

describe("transferAssignment", () => {
  const currentAssignment = {
    id: "a-1",
    projectId: "p-1",
    personId: "per-1",
    status: "active",
    fromDate: new Date("2026-01-01"),
    designation: "Mason",
    category: "skilled",
    employmentType: "daily",
    dailyWage: 1000,
    monthlySalary: 0,
    gangName: "Mason Gang A",
  };

  it("ends the old engagement (CAS) and opens a chained new one with old terms", async () => {
    anyDb.projectStaffAssignment.findUnique.mockResolvedValue(currentAssignment);
    anyDb.projectStaffAssignment.findMany.mockResolvedValue([]); // no overlap on target
    anyDb.projectStaffAssignment.updateMany.mockResolvedValue({ count: 1 });
    anyDb.projectStaffAssignment.create.mockResolvedValue({ id: "a-2" });

    const res = await transferAssignment(tx, {
      assignmentId: "a-1",
      terms: { fromDate: new Date("2026-05-01") },
      actorId: "user-1",
    });

    expect(res).toEqual({ endedAssignmentId: "a-1", createdAssignmentId: "a-2" });

    // Old row ended with CAS on status=active, day before the new start.
    const updateCall = anyDb.projectStaffAssignment.updateMany.mock.calls[0][0];
    expect(updateCall.where).toEqual({ id: "a-1", status: "active" });
    expect(updateCall.data.status).toBe("ended");
    expect(updateCall.data.endReason).toBe("contract_end"); // same-project re-hire
    expect(updateCall.data.toDate).toEqual(new Date("2026-04-30"));

    // New row chained to the old, terms defaulted from it.
    const createCall = anyDb.projectStaffAssignment.create.mock.calls[0][0].data;
    expect(createCall).toMatchObject({
      projectId: "p-1",
      personId: "per-1",
      sourceAssignmentId: "a-1",
      fromDate: new Date("2026-05-01"),
      designation: "Mason",
      dailyWage: 1000,
      gangName: "Mason Gang A",
      status: "active",
    });
  });

  it("marks a cross-project transfer and applies new terms when given", async () => {
    anyDb.projectStaffAssignment.findUnique.mockResolvedValue(currentAssignment);
    anyDb.projectStaffAssignment.findMany.mockResolvedValue([]);
    anyDb.projectStaffAssignment.updateMany.mockResolvedValue({ count: 1 });
    anyDb.projectStaffAssignment.create.mockResolvedValue({ id: "a-3" });

    await transferAssignment(tx, {
      assignmentId: "a-1",
      newProjectId: "p-2",
      terms: {
        fromDate: new Date("2026-06-01"),
        dailyWage: 1200,
        gangName: null,
      },
      actorId: "user-1",
    });

    expect(anyDb.projectStaffAssignment.updateMany.mock.calls[0][0].data.endReason).toBe("transferred");
    const createCall = anyDb.projectStaffAssignment.create.mock.calls[0][0].data;
    expect(createCall).toMatchObject({
      projectId: "p-2",
      dailyWage: 1200,
      gangName: null,
      designation: "Mason", // not overridden → carried over
    });
  });

  it("collapses to a same-day end when the new start precedes the old start", async () => {
    anyDb.projectStaffAssignment.findUnique.mockResolvedValue(currentAssignment);
    anyDb.projectStaffAssignment.findMany.mockResolvedValue([]);
    anyDb.projectStaffAssignment.updateMany.mockResolvedValue({ count: 1 });
    anyDb.projectStaffAssignment.create.mockResolvedValue({ id: "a-4" });

    await transferAssignment(tx, {
      assignmentId: "a-1",
      terms: { fromDate: new Date("2026-01-01") }, // same day as old start
      actorId: "user-1",
    });

    // toDate must never precede the old engagement's own start.
    expect(anyDb.projectStaffAssignment.updateMany.mock.calls[0][0].data.toDate)
      .toEqual(new Date("2026-01-01"));
  });

  it("NOT_FOUNDs an unknown assignment and refuses non-active ones", async () => {
    anyDb.projectStaffAssignment.findUnique.mockResolvedValue(null);
    await expect(
      transferAssignment(tx, { assignmentId: "x", terms: { fromDate: new Date() }, actorId: "u" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });

    anyDb.projectStaffAssignment.findUnique.mockResolvedValue({ ...currentAssignment, status: "ended" });
    await expect(
      transferAssignment(tx, { assignmentId: "a-1", terms: { fromDate: new Date() }, actorId: "u" }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST", message: expect.stringContaining("active assignment") });
  });

  it("fails CONFLICT when the CAS end loses a concurrent transfer", async () => {
    anyDb.projectStaffAssignment.findUnique.mockResolvedValue(currentAssignment);
    anyDb.projectStaffAssignment.findMany.mockResolvedValue([]);
    anyDb.projectStaffAssignment.updateMany.mockResolvedValue({ count: 0 }); // someone else won

    await expect(
      transferAssignment(tx, { assignmentId: "a-1", terms: { fromDate: new Date() }, actorId: "u" }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    expect(anyDb.projectStaffAssignment.create).not.toHaveBeenCalled();
  });

  it("rejects when the target project already holds an unacknowledged overlap", async () => {
    anyDb.projectStaffAssignment.findUnique.mockResolvedValue(currentAssignment);
    anyDb.projectStaffAssignment.findMany.mockResolvedValue([
      { id: "a-9", projectId: "p-2", status: "active", fromDate: new Date("2026-01-01"), toDate: null },
    ]);

    await expect(
      transferAssignment(tx, {
        assignmentId: "a-1",
        newProjectId: "p-2",
        terms: { fromDate: new Date("2026-05-01") },
        actorId: "u",
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(anyDb.projectStaffAssignment.updateMany).not.toHaveBeenCalled();
  });
});

// ─── merge ──────────────────────────────────────────────────────────────────

describe("mergePersons", () => {
  const primary = { id: "per-1", organizationId: "org-1", displayName: "Ram", linkedUserId: null, mergedIntoId: null, status: "active" };
  const duplicate = { id: "per-2", organizationId: "org-1", displayName: "Ram (2)", linkedUserId: "user-9", mergedIntoId: null, status: "active" };

  function happyDb() {
    // person.findUnique is set per-test (primary vs duplicate resolution).
    anyDb.person.update.mockResolvedValue({});
    anyDb.projectStaffAssignment.updateMany.mockResolvedValue({ count: 2 });
    anyDb.staffAdvance.updateMany.mockResolvedValue({ count: 1 });
    anyDb.leaveRequest.updateMany.mockResolvedValue({ count: 1 });
    anyDb.staffRoleAssignment.updateMany.mockResolvedValue({ count: 0 });
    anyDb.resourceAssignment.updateMany.mockResolvedValue({ count: 0 });
    anyDb.payrollPersonRecord.updateMany.mockResolvedValue({ count: 0 });
    anyDb.payrollPersonRecord.findMany.mockResolvedValue([]);
    anyDb.leaveBalance.findMany.mockResolvedValue([]);
    anyDb.leaveBalance.update.mockResolvedValue({});
    anyDb.leaveBalance.delete.mockResolvedValue({});
  }

  it("re-points every referencing row, consolidates balances, marks the duplicate merged", async () => {
    happyDb();
    anyDb.person.findUnique.mockImplementation((args: any) =>
      Promise.resolve(args.where.id === "per-1" ? primary : duplicate));

    const res = await mergePersons(tx, {
      organizationId: "org-1",
      primaryId: "per-1",
      duplicateId: "per-2",
      reason: "same phone number",
      actorId: "user-1",
    });

    expect(res.merged).toBe(true);
    expect(res.rePointed.assignments).toBe(2);

    // Duplicate marked with mergedIntoId + inactive (nothing deleted).
    const markCall = anyDb.person.update.mock.calls.find(
      (c: any) => c[0].where.id === "per-2" && c[0].data.mergedIntoId === "per-1",
    );
    expect(markCall).toBeTruthy();
    expect(markCall[0].data.status).toBe("inactive");

    // The duplicate's linked app account moves to the primary (primary had none).
    const linkMove = anyDb.person.update.mock.calls.find(
      (c: any) => c[0].where.id === "per-1" && c[0].data.linkedUserId === "user-9",
    );
    expect(linkMove).toBeTruthy();
  });

  it("consolidates leave balances of the same type+year instead of colliding", async () => {
    anyDb.person.findUnique.mockImplementation((args: any) =>
      Promise.resolve(args.where.id === "per-1" ? primary : duplicate));
    happyDb();
    anyDb.leaveBalance.findMany.mockImplementation((args: any) =>
      args.where.personId === "per-1"
        ? Promise.resolve([{ id: "lb-1", leaveType: "casual", year: 2026, totalAllowed: 12, taken: 3, remaining: 9 }])
        : Promise.resolve([{ id: "lb-2", leaveType: "casual", year: 2026, totalAllowed: 12, taken: 5, remaining: 7 }]),
    );

    await mergePersons(tx, {
      organizationId: "org-1", primaryId: "per-1", duplicateId: "per-2", actorId: "u",
    });

    expect(anyDb.leaveBalance.update).toHaveBeenCalledWith({
      where: { id: "lb-1" },
      data: { totalAllowed: 24, taken: 8, remaining: 16 },
    });
    expect(anyDb.leaveBalance.delete).toHaveBeenCalledWith({ where: { id: "lb-2" } });
  });

  it("FAILS LOUD when both persons hold payslips in the same payroll run", async () => {
    anyDb.person.findUnique.mockImplementation((args: any) =>
      Promise.resolve(args.where.id === "per-1" ? primary : duplicate));
    anyDb.payrollPersonRecord.findMany.mockImplementation((args: any) =>
      Promise.resolve(args.where.personId === "per-1"
        ? [{ payrollRunId: "run-1" }]
        : [{ payrollRunId: "run-1" }]),
    );

    await expect(
      mergePersons(tx, { organizationId: "org-1", primaryId: "per-1", duplicateId: "per-2", actorId: "u" }),
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: expect.stringContaining("same payroll run"),
    });
  });

  it("refuses self-merge, already-merged duplicates, and cross-org merges", async () => {
    await expect(
      mergePersons(tx, { organizationId: "org-1", primaryId: "per-1", duplicateId: "per-1", actorId: "u" }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });

    anyDb.person.findUnique.mockImplementation((args: any) =>
      Promise.resolve(args.where.id === "per-1"
        ? primary
        : { ...duplicate, mergedIntoId: "per-9" }));
    await expect(
      mergePersons(tx, { organizationId: "org-1", primaryId: "per-1", duplicateId: "per-2", actorId: "u" }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST", message: expect.stringContaining("already merged") });

    anyDb.person.findUnique.mockImplementation((args: any) =>
      Promise.resolve(args.where.id === "per-1" ? primary : { ...duplicate, organizationId: "org-2" }));
    await expect(
      mergePersons(tx, { organizationId: "org-1", primaryId: "per-1", duplicateId: "per-2", actorId: "u" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("drops the duplicate's app-account link when the primary already has one", async () => {
    happyDb();
    anyDb.person.findUnique.mockImplementation((args: any) =>
      Promise.resolve(args.where.id === "per-1"
        ? { ...primary, linkedUserId: "user-1" }
        : duplicate));

    await mergePersons(tx, { organizationId: "org-1", primaryId: "per-1", duplicateId: "per-2", actorId: "u" });

    const unlink = anyDb.person.update.mock.calls.find(
      (c: any) => c[0].where.id === "per-2" && c[0].data.linkedUserId === null,
    );
    expect(unlink).toBeTruthy();
  });

  it("REJECTS a merge that leaves the survivor with two concurrent active assignments on one project", async () => {
    anyDb.person.findUnique.mockImplementation((args: any) =>
      Promise.resolve(args.where.id === "per-1" ? primary : duplicate));
    happyDb();
    // After both people's assignments are re-pointed onto the survivor, the
    // person holds two ACTIVE, overlapping stints on the SAME project — the
    // schema has no [projectId, personId] unique by design, so this must be
    // caught by the merge's own post-re-point check (ADR-0005 §2).
    anyDb.projectStaffAssignment.findMany.mockResolvedValue([
      { id: "a-1", projectId: "p-1", status: "active", fromDate: new Date("2026-01-01T00:00:00.000Z"), toDate: null },
      { id: "a-2", projectId: "p-1", status: "active", fromDate: new Date("2026-02-01T00:00:00.000Z"), toDate: null },
    ]);

    await expect(
      mergePersons(tx, { organizationId: "org-1", primaryId: "per-1", duplicateId: "per-2", actorId: "u" }),
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: expect.stringContaining("concurrent active assignments"),
    });
  });
});

// ─── history ────────────────────────────────────────────────────────────────

describe("getPersonHistory", () => {
  it("aggregates assignments, advances (with outstanding total), payroll and leave", async () => {
    anyDb.person.findUnique.mockResolvedValue({
      id: "per-1", displayName: "Ram", mergedInto: null,
    });
    anyDb.projectStaffAssignment.findMany.mockResolvedValue([
      { id: "a-1", projectId: "p-1", project: { id: "p-1", name: "Road", code: "RD" } },
    ]);
    anyDb.staffAdvance.findMany.mockResolvedValue([
      { id: "adv-1", amount: 5000, recoveredAmount: 2000, project: { id: "p-1", name: "Road" } },
      { id: "adv-2", amount: 3000, recoveredAmount: 3000, project: { id: "p-1", name: "Road" } },
    ]);
    anyDb.payrollPersonRecord.findMany.mockResolvedValue([
      { id: "ppr-1", netPayable: 10000, payrollRun: { id: "run-1", period: "2026-04", status: "disbursed" } },
    ]);
    anyDb.leaveRequest.findMany.mockResolvedValue([]);

    const res = await getPersonHistory(tx, "per-1");

    expect(res.person.id).toBe("per-1");
    expect(res.assignments).toHaveLength(1);
    expect(res.advances.outstandingTotal).toBe(3000); // 5000-2000 + 3000-3000
    expect(res.payrollRecords).toHaveLength(1);
  });

  it("NOT_FOUNDs an unknown person", async () => {
    anyDb.person.findUnique.mockResolvedValue(null);
    await expect(getPersonHistory(tx, "ghost")).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
