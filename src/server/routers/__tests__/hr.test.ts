/**
 * Router-layer tests for hr.ts (staff directory, attendance, muster roll,
 * site advances) — person/assignment grain (ADR-0005).
 *
 * Pins:
 *   - list: roster rows come from ACTIVE ProjectStaffAssignment joins;
 *     status filter maps "active" to the assignment, others to the person
 *   - gang list derived from distinct non-null gangName
 *   - create: creates a Person (org-wide) + an active assignment; wage
 *     defaults via zod
 *   - update: assignment terms vs person identity fields split; NOT_FOUND
 *     for unknown assignment ids; cross-project rows rejected via
 *     project-scoped write assertion
 *   - delete: ENDS the assignment (soft) — never destroys history
 *   - getAttendanceByDate: unlogged workers default present/8h/0 OT;
 *     logged attendance wins; rows keyed by assignmentId
 *   - bulkLogAttendance: cross-project assignment ids are dropped;
 *     date normalized to UTC midnight; upsert against assignmentId_date
 *   - getMusterRoll: effectiveDays = present + ½·half; OT paid at
 *     1.5× (dailyWage/8); monthly staff estimated at monthlySalary
 *   - getStaffAdvances: pending total = Σ (amount − recoveredAmount) over
 *     outstanding advances
 *   - createStaffAdvance: person must have an ACTIVE assignment on the
 *     project (cross-project guard); amount must be positive
 *   - deleteStaffAdvance: IDOR guard; partially-recovered advances are
 *     immutable
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { buildUser, createCaller, expectTRPCError } from "./test-utils";

vi.mock("@/lib/db", async () => {
  const { buildDbMock } = await import("./test-utils");
  const db = buildDbMock();
  return { db, getFreshDb: () => db };
});

import { db } from "@/lib/db";
import { hrRouter } from "../hr";

const anyDb = db as any;
const ENGINEER = buildUser();

function member(role: string | null) {
  anyDb.projectMember.findUnique.mockResolvedValue(role ? { role } : null);
}

/** Roster row shape returned by the assignment join (see ASSIGNMENT_LIST_SELECT). */
function assignmentRow(id: string, personId: string, over: Record<string, unknown> = {}) {
  return {
    id,
    personId,
    designation: "Mason",
    category: "skilled",
    employmentType: "daily",
    dailyWage: 1000,
    monthlySalary: 0,
    gangName: null,
    fromDate: new Date("2026-01-01"),
    person: {
      id: personId,
      displayName: id === "a-1" ? "Ram" : "Shyam",
      phone: null,
      bankAccountNo: null,
      bankName: null,
      pan: null,
      idNumber: null,
      status: "active",
    },
    ...over,
  };
}

beforeEach(() => {
  vi.resetAllMocks();
});

// ─── list ───────────────────────────────────────────────────────────────────
describe("hr.list", () => {
  it("scopes the roster query to the project and maps the active filter to assignments", async () => {
    member("engineer");
    anyDb.projectStaffAssignment.findMany.mockResolvedValue([]);

    const caller = createCaller(hrRouter, ENGINEER);
    await caller.list({ projectId: "p-1" }); // status defaults to "active"

    const where = anyDb.projectStaffAssignment.findMany.mock.calls[0][0].where;
    expect(where).toEqual({ projectId: "p-1", status: "active" });

    await caller.list({ projectId: "p-1", status: "all", gangName: "Mason Gang A" });
    const where2 = anyDb.projectStaffAssignment.findMany.mock.calls[2][0].where;
    expect(where2).toEqual({ projectId: "p-1", gangName: "Mason Gang A" });
  });

  it("derives the gang list from distinct non-null gangNames", async () => {
    member("engineer");
    anyDb.projectStaffAssignment.findMany.mockResolvedValueOnce([]); // roster query
    anyDb.projectStaffAssignment.findMany.mockResolvedValueOnce([
      { gangName: "Mason Gang A" },
      { gangName: null },
      { gangName: "Carpentry Toli" },
    ]); // distinct gang query

    const caller = createCaller(hrRouter, ENGINEER);
    const res = await caller.list({ projectId: "p-1" });
    expect(res.gangs).toEqual(["Mason Gang A", "Carpentry Toli"]);
    expect(anyDb.projectStaffAssignment.findMany.mock.calls[1][0]).toMatchObject({
      where: { projectId: "p-1", gangName: { not: null } },
      distinct: ["gangName"],
    });
  });

  it("projects roster rows to person identity with assignment id + personId", async () => {
    member("engineer");
    anyDb.projectStaffAssignment.findMany.mockResolvedValue([
      assignmentRow("a-1", "per-1"),
    ]);

    const caller = createCaller(hrRouter, ENGINEER);
    const res = await caller.list({ projectId: "p-1" });
    expect(res.staff[0]).toMatchObject({
      id: "a-1",
      personId: "per-1",
      name: "Ram",
      dailyWage: 1000,
    });
  });

  it("attendance tab queries staffAttendance scoped to the project (max 200)", async () => {
    member("engineer");
    anyDb.staffAttendance.findMany.mockResolvedValue([]);

    const caller = createCaller(hrRouter, ENGINEER);
    await caller.list({ projectId: "p-1", tab: "attendance" });

    expect(anyDb.staffAttendance.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { projectId: "p-1" },
        take: 200,
      }),
    );
  });

  it("FORBIDDENs non-members", async () => {
    member(null);
    const caller = createCaller(hrRouter, ENGINEER);
    await expectTRPCError(
      caller.list({ projectId: "p-1" }),
      "FORBIDDEN",
    );
    expect(anyDb.projectStaffAssignment.findMany).not.toHaveBeenCalled();
  });
});

// ─── create / update / delete ───────────────────────────────────────────────
describe("hr staff CRUD", () => {
  it("create makes a Person + an active assignment with wage defaults", async () => {
    member("engineer");
    anyDb.person.create.mockResolvedValue({ id: "per-1", displayName: "Ram Bahadur" });

    const caller = createCaller(hrRouter, ENGINEER);
    await caller.create({
      projectId: "p-1",
      name: "Ram Bahadur",
      dailyWage: 1200,
      monthlySalary: 0,
    });

    // person row is org-wide and carries the identity fields
    const personData = anyDb.person.create.mock.calls[0][0].data;
    expect(personData.organizationId).toBe(ENGINEER.organizationId);
    expect(personData.displayName).toBe("Ram Bahadur");
    expect(personData.category).toBe("skilled"); // zod default
    expect(personData.employmentType).toBe("daily"); // zod default

    // assignment starts immediately with the engagement terms
    const asgData = anyDb.projectStaffAssignment.create.mock.calls[0][0].data;
    expect(asgData.projectId).toBe("p-1");
    expect(asgData.personId).toBe("per-1");
    expect(asgData.dailyWage).toBe(1200);
    expect(asgData.fromDate).toBeInstanceOf(Date); // defaulted to now
  });

  it("create FORBIDDENs read-only roles", async () => {
    member(null); // no write-capable membership
    const caller = createCaller(hrRouter, ENGINEER);
    await expectTRPCError(
      caller.create({ projectId: "p-1", name: "X", dailyWage: 100, monthlySalary: 0 }),
      "FORBIDDEN",
    );
    expect(anyDb.person.create).not.toHaveBeenCalled();
    expect(anyDb.projectStaffAssignment.create).not.toHaveBeenCalled();
  });

  it("create rejects negative dailyWage (zod nonnegative)", async () => {
    member("engineer");
    const caller = createCaller(hrRouter, ENGINEER);
    await expectTRPCError(
      caller.create({ projectId: "p-1", name: "X", dailyWage: -100, monthlySalary: 0 }),
      "BAD_REQUEST",
    );
    expect(anyDb.person.create).not.toHaveBeenCalled();
  });

  it("update NOT_FOUNDs unknown assignments", async () => {
    member("engineer");
    anyDb.projectStaffAssignment.findUnique.mockResolvedValue(null);
    const caller = createCaller(hrRouter, ENGINEER);
    await expectTRPCError(
      caller.update({ itemId: "nope", name: "Y" }),
      "NOT_FOUND",
    );
    expect(anyDb.projectStaffAssignment.update).not.toHaveBeenCalled();
  });

  it("update rejects assignments belonging to ANOTHER project (cross-project IDOR)", async () => {
    // assignment lives in p-2; caller is only a member of p-1.
    anyDb.projectStaffAssignment.findUnique.mockResolvedValue({
      id: "a-1",
      projectId: "p-2",
      personId: "per-1",
    });
    member(null); // membership lookup for p-2 → null → FORBIDDEN
    const caller = createCaller(hrRouter, ENGINEER);
    await expectTRPCError(
      caller.update({ itemId: "a-1", name: "Y" }),
      "FORBIDDEN",
    );
    expect(anyDb.projectStaffAssignment.update).not.toHaveBeenCalled();
  });

  it("update routes identity fields to the person and terms to the assignment", async () => {
    member("engineer");
    anyDb.projectStaffAssignment.findUnique.mockResolvedValue({
      id: "a-1",
      projectId: "p-1",
      personId: "per-1",
    });
    anyDb.projectStaffAssignment.findUnique.mockResolvedValueOnce({
      id: "a-1",
      projectId: "p-1",
      personId: "per-1",
    });

    const caller = createCaller(hrRouter, ENGINEER);
    await caller.update({ itemId: "a-1", name: "New Name", dailyWage: 1500, pan: "123" });

    expect(anyDb.person.update).toHaveBeenCalledWith({
      where: { id: "per-1" },
      data: expect.objectContaining({ displayName: "New Name", pan: "123" }),
    });
    expect(anyDb.projectStaffAssignment.update).toHaveBeenCalledWith({
      where: { id: "a-1" },
      data: expect.objectContaining({ dailyWage: 1500 }),
    });
  });

  it("delete ENDS the assignment softly (history is never destroyed)", async () => {
    member("engineer");
    anyDb.projectStaffAssignment.findUnique.mockResolvedValue({
      id: "a-1",
      projectId: "p-1",
      status: "active",
    });
    const caller = createCaller(hrRouter, ENGINEER);
    const res = await caller.delete({ itemId: "a-1" });
    expect(res.ok).toBe(true);
    expect(anyDb.projectStaffAssignment.update).toHaveBeenCalledWith({
      where: { id: "a-1" },
      data: expect.objectContaining({ status: "ended" }),
    });
    expect(anyDb.projectStaffAssignment.delete).not.toHaveBeenCalled();
  });

  it("delete NOT_FOUNDs unknown assignments and FORBIDDENs other-project rows", async () => {
    member("engineer");
    anyDb.projectStaffAssignment.findUnique.mockResolvedValue(null);
    const caller = createCaller(hrRouter, ENGINEER);
    await expectTRPCError(caller.delete({ itemId: "nope" }), "NOT_FOUND");

    anyDb.projectStaffAssignment.findUnique.mockResolvedValue({
      id: "a-1",
      projectId: "p-2",
      status: "active",
    });
    member(null);
    await expectTRPCError(caller.delete({ itemId: "a-1" }), "FORBIDDEN");
    expect(anyDb.projectStaffAssignment.update).not.toHaveBeenCalled();
  });
});

// ─── getAttendanceByDate ────────────────────────────────────────────────────
describe("hr.getAttendanceByDate", () => {
  it("defaults unlogged workers to present/8h and keeps logged attendance", async () => {
    member("engineer");
    anyDb.projectStaffAssignment.findMany.mockResolvedValue([
      assignmentRow("a-1", "per-1"),
      assignmentRow("a-2", "per-2"),
    ]);
    anyDb.staffAttendance.findMany.mockResolvedValue([
      { assignmentId: "a-1", date: new Date("2026-08-01"), status: "absent", hours: 0, overtime: 0, remarks: "sick" },
    ]);

    const caller = createCaller(hrRouter, ENGINEER);
    const res = await caller.getAttendanceByDate({ projectId: "p-1", date: "2026-08-01" });

    expect(res.totalWorkers).toBe(2);
    expect(res.loggedCount).toBe(1);
    const ram = res.items.find((i: any) => i.assignmentId === "a-1")!;
    expect(ram.status).toBe("absent");
    expect(ram.hours).toBe(0);
    expect(ram.isLogged).toBe(true);
    const shyam = res.items.find((i: any) => i.assignmentId === "a-2")!;
    expect(shyam.status).toBe("present"); // default for unlogged
    expect(shyam.hours).toBe(8);
    expect(shyam.overtime).toBe(0);
    expect(shyam.isLogged).toBe(false);

    // attendance is looked up for the exact UTC-normalized date
    expect(anyDb.staffAttendance.findMany.mock.calls[0][0].where).toEqual({
      projectId: "p-1",
      date: new Date("2026-08-01T00:00:00.000Z"),
    });
  });

  it("FORBIDDENs non-members", async () => {
    member(null);
    const caller = createCaller(hrRouter, ENGINEER);
    await expectTRPCError(
      caller.getAttendanceByDate({ projectId: "p-1", date: "2026-08-01" }),
      "FORBIDDEN",
    );
  });
});

// ─── bulkLogAttendance ──────────────────────────────────────────────────────
describe("hr.bulkLogAttendance", () => {
  const input = {
    projectId: "p-1",
    date: "2026-08-01",
    records: [
      { assignmentId: "a-1", status: "present" as const, hours: 8, overtime: 2 },
      { assignmentId: "a-2", status: "half_day" as const, hours: 4, overtime: 0 },
    ],
  };

  it("upserts each record against the assignmentId_date unique key at UTC midnight", async () => {
    member("engineer");
    anyDb.projectStaffAssignment.findMany.mockResolvedValue([{ id: "a-1" }, { id: "a-2" }]);

    const caller = createCaller(hrRouter, ENGINEER);
    const res = await caller.bulkLogAttendance(input);
    expect(res.success).toBe(true);

    expect(anyDb.staffAttendance.upsert).toHaveBeenCalledTimes(2);
    const targetDate = new Date("2026-08-01T00:00:00.000Z");
    expect(anyDb.staffAttendance.upsert.mock.calls[0][0].where).toEqual({
      assignmentId_date: { assignmentId: "a-1", date: targetDate },
    });
    expect(anyDb.staffAttendance.upsert.mock.calls[0][0].create).toMatchObject({
      projectId: "p-1",
      assignmentId: "a-1",
      status: "present",
      hours: 8,
      overtime: 2,
    });
    expect(anyDb.staffAttendance.upsert.mock.calls[1][0].create).toMatchObject({
      assignmentId: "a-2",
      status: "half_day",
      hours: 4,
    });
  });

  it("drops assignment IDs that do not belong to the project (cross-project overwrite guard)", async () => {
    member("engineer");
    // only a-1 belongs to p-1; "foreign" belongs to another project/org
    anyDb.projectStaffAssignment.findMany.mockResolvedValue([{ id: "a-1" }]);

    const caller = createCaller(hrRouter, ENGINEER);
    await caller.bulkLogAttendance({
      ...input,
      records: [
        { assignmentId: "a-1", status: "present", hours: 8, overtime: 0 },
        { assignmentId: "foreign", status: "absent", hours: 0, overtime: 0 },
      ],
    });

    expect(anyDb.staffAttendance.upsert).toHaveBeenCalledTimes(1);
    expect(anyDb.staffAttendance.upsert.mock.calls[0][0].where.assignmentId_date.assignmentId).toBe("a-1");
  });

  it("FORBIDDENs read-only roles", async () => {
    member(null);
    const caller = createCaller(hrRouter, ENGINEER);
    await expectTRPCError(caller.bulkLogAttendance(input), "FORBIDDEN");
    expect(anyDb.staffAttendance.upsert).not.toHaveBeenCalled();
  });
});

// ─── getMusterRoll ──────────────────────────────────────────────────────────
describe("hr.getMusterRoll", () => {
  function att(day: number, status: string, overtime = 0) {
    return {
      assignmentId: "a-1",
      date: new Date(Date.UTC(2025, 0, day)),
      status,
      hours: status === "half_day" ? 4 : 8,
      overtime,
    };
  }

  it("computes effectiveDays, OT at 1.5× hourly, and gross for a daily worker", async () => {
    member("engineer");
    anyDb.projectStaffAssignment.findMany.mockResolvedValue([
      assignmentRow("a-1", "per-1"),
    ]);
    // 20 present + 2 half days + 1 absent + 1 leave + 1 "overtime" status
    // (counts as present) with 4 OT hours booked on it
    anyDb.staffAttendance.findMany.mockResolvedValue([
      ...Array.from({ length: 20 }, (_, i) => att(i + 1, "present")),
      att(21, "half_day"),
      att(22, "half_day"),
      att(23, "absent"),
      att(24, "leave"),
      att(25, "overtime", 4),
    ]);

    const caller = createCaller(hrRouter, ENGINEER);
    const res = await caller.getMusterRoll({ projectId: "p-1", month: "2025-01" });

    expect(res.daysInMonth).toBe(31);
    const row = res.rows[0];
    expect(row.presentDays).toBe(21); // 20 present + 1 overtime-status day
    expect(row.halfDays).toBe(2);
    expect(row.absentDays).toBe(1);
    expect(row.leaveDays).toBe(1);
    expect(row.effectiveDays).toBe(22); // 21 + 2×0.5
    expect(row.totalOvertimeHours).toBe(4);
    // gross = 22 days × NPR 1000 + OT 4 h × (1000/8) × 1.5 = 22000 + 750
    expect(row.estimatedGross).toBe(22750);

    expect(res.summary).toEqual({
      totalStaff: 1,
      totalPresentManDays: 22,
      totalOtHours: 4,
      totalEstimatedGross: 22750,
    });

    // days matrix is bounded by the month's days and unlogged days marked
    expect(row.days[25]).toEqual({ status: "overtime", overtime: 4 });
    expect(row.days[31]).toEqual({ status: "unlogged", overtime: 0 });
  });

  it("estimates monthly staff at their monthlySalary regardless of attendance", async () => {
    member("engineer");
    anyDb.projectStaffAssignment.findMany.mockResolvedValue([
      assignmentRow("a-2", "per-2", {
        employmentType: "monthly",
        category: "supervisor",
        designation: "Supervisor",
        dailyWage: 0,
        monthlySalary: 45000,
      }),
    ]);
    anyDb.staffAttendance.findMany.mockResolvedValue([
      att(3, "absent"),
      att(4, "absent"),
    ]);

    const caller = createCaller(hrRouter, ENGINEER);
    const res = await caller.getMusterRoll({ projectId: "p-1", month: "2025-01" });
    // monthly salary is not docked for absences in this estimate
    expect(res.rows[0].estimatedGross).toBe(45000);
  });
});

// ─── staff advances ─────────────────────────────────────────────────────────
describe("hr staff advances", () => {
  it("getStaffAdvances sums only OUTSTANDING balances into the pending total", async () => {
    member("engineer");
    anyDb.staffAdvance.findMany.mockResolvedValue([
      { amount: 5000, recoveredAmount: 0 },
      { amount: 2000, recoveredAmount: 500 }, // partially recovered
      { amount: 1000, recoveredAmount: 1000 }, // fully recovered
    ]);

    const caller = createCaller(hrRouter, ENGINEER);
    const res = await caller.getStaffAdvances({ projectId: "p-1" });
    expect(res.totalPendingAdvances).toBe(6500); // 5000 + 1500
    expect(anyDb.staffAdvance.findMany.mock.calls[0][0].where).toEqual({
      projectId: "p-1",
    });
  });

  it("getStaffAdvances filters by personId and recovery state", async () => {
    member("engineer");
    anyDb.staffAdvance.findMany.mockResolvedValue([
      { amount: 1000, recoveredAmount: 1000 }, // recovered → passes filter
    ]);
    const caller = createCaller(hrRouter, ENGINEER);
    const res = await caller.getStaffAdvances({
      projectId: "p-1",
      personId: "per-1",
      isRecovered: true,
    });
    expect(anyDb.staffAdvance.findMany.mock.calls[0][0].where).toEqual({
      projectId: "p-1",
      personId: "per-1",
    });
    expect(res.advances).toHaveLength(1);
  });

  it("createStaffAdvance persists amount, type, creator and default date", async () => {
    member("engineer");
    anyDb.projectStaffAssignment.findFirst.mockResolvedValue({ id: "a-1" });
    const caller = createCaller(hrRouter, ENGINEER);
    await caller.createStaffAdvance({
      projectId: "p-1",
      personId: "per-1",
      amount: 3000,
      type: "cash_advance",
    });

    const data = anyDb.staffAdvance.create.mock.calls[0][0].data;
    expect(data).toMatchObject({
      projectId: "p-1",
      personId: "per-1",
      amount: 3000,
      type: "cash_advance",
      createdById: ENGINEER.id,
    });
    expect(data.date).toBeInstanceOf(Date); // defaulted to now
  });

  it("createStaffAdvance rejects zero/negative amounts (zod positive)", async () => {
    member("engineer");
    anyDb.projectStaffAssignment.findFirst.mockResolvedValue({ id: "a-1" });
    const caller = createCaller(hrRouter, ENGINEER);
    await expectTRPCError(
      caller.createStaffAdvance({ projectId: "p-1", personId: "per-1", amount: 0 }),
      "BAD_REQUEST",
    );
    await expectTRPCError(
      caller.createStaffAdvance({ projectId: "p-1", personId: "per-1", amount: -100 }),
      "BAD_REQUEST",
    );
    expect(anyDb.staffAdvance.create).not.toHaveBeenCalled();
  });

  it("createStaffAdvance NOT_FOUNDs persons without an active assignment on the project (cross-project guard)", async () => {
    member("engineer");
    // person "foreign" has no active assignment on p-1 → findFirst returns null
    anyDb.projectStaffAssignment.findFirst.mockResolvedValue(null);
    const caller = createCaller(hrRouter, ENGINEER);
    await expectTRPCError(
      caller.createStaffAdvance({ projectId: "p-1", personId: "foreign", amount: 5000 }),
      "NOT_FOUND",
    );
    expect(anyDb.staffAdvance.create).not.toHaveBeenCalled();
  });

  it("deleteStaffAdvance NOT_FOUNDs advances in another project (IDOR guard)", async () => {
    member("engineer");
    anyDb.staffAdvance.findFirst.mockResolvedValue(null);
    const caller = createCaller(hrRouter, ENGINEER);
    await expectTRPCError(
      caller.deleteStaffAdvance({ projectId: "p-1", advanceId: "adv-1" }),
      "NOT_FOUND",
    );
    expect(anyDb.staffAdvance.delete).not.toHaveBeenCalled();
  });

  it("deleteStaffAdvance refuses to delete (partially) recovered advances", async () => {
    member("engineer");
    anyDb.staffAdvance.findFirst.mockResolvedValue({
      id: "adv-1",
      amount: 1000,
      recoveredAmount: 400,
    });
    const caller = createCaller(hrRouter, ENGINEER);
    await expectTRPCError(
      caller.deleteStaffAdvance({ projectId: "p-1", advanceId: "adv-1" }),
      "BAD_REQUEST",
    );
    expect(anyDb.staffAdvance.delete).not.toHaveBeenCalled();
  });

  it("deleteStaffAdvance deletes a fully outstanding advance in the authorized project", async () => {
    member("engineer");
    anyDb.staffAdvance.findFirst.mockResolvedValue({
      id: "adv-1",
      amount: 1000,
      recoveredAmount: 0,
    });
    const caller = createCaller(hrRouter, ENGINEER);
    const res = await caller.deleteStaffAdvance({ projectId: "p-1", advanceId: "adv-1" });
    expect(res.success).toBe(true);
    expect(anyDb.staffAdvance.delete).toHaveBeenCalledWith({ where: { id: "adv-1" } });
  });
});
