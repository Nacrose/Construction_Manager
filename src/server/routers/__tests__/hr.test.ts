/**
 * Router-layer tests for hr.ts (staff directory, attendance, muster roll,
 * site advances).
 *
 * Pins:
 *   - list: org scoping (projectId + status/gang filters in the where
 *     clause), gang list derived from distinct non-null gangName
 *   - create: read-only roles blocked; negative wages rejected (zod);
 *     defaults applied (category/employmentType/joinedDate)
 *   - update/delete: NOT_FOUND for unknown ids; cross-project rows
 *     (staff belonging to another project) rejected via project-scoped
 *     write assertion
 *   - getAttendanceByDate: unlogged workers default present/8h/0 OT;
 *     logged attendance wins
 *   - bulkLogAttendance: cross-project staffIds are dropped (only
 *     project staff are upserted); date normalized to UTC midnight
 *   - getMusterRoll: effectiveDays = present + ½·half; OT paid at
 *     1.5× (dailyWage/8); monthly staff estimated at monthlySalary
 *   - getStaffAdvances: pending total excludes recovered advances
 *   - createStaffAdvance: staff must belong to the project (cross-project
 *     guard); amount must be positive
 *   - deleteStaffAdvance: IDOR guard (advance must belong to the
 *     authorized project); recovered advances are immutable
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

beforeEach(() => {
  vi.resetAllMocks();
});

// ─── list ───────────────────────────────────────────────────────────────────
describe("hr.list", () => {
  it("scopes the staff query to the project and applies the status filter", async () => {
    member("engineer");
    anyDb.staff.findMany.mockResolvedValue([]);

    const caller = createCaller(hrRouter, ENGINEER);
    await caller.list({ projectId: "p-1" }); // status defaults to "active"

    const where = anyDb.staff.findMany.mock.calls[0][0].where;
    expect(where).toEqual({ projectId: "p-1", status: "active" });

    await caller.list({ projectId: "p-1", status: "all", gangName: "Mason Gang A" });
    const where2 = anyDb.staff.findMany.mock.calls[2][0].where;
    expect(where2).toEqual({ projectId: "p-1", gangName: "Mason Gang A" });
  });

  it("derives the gang list from distinct non-null gangNames", async () => {
    member("engineer");
    anyDb.staff.findMany.mockResolvedValue([]);
    anyDb.staff.findMany.mockResolvedValueOnce([]); // staff query
    anyDb.staff.findMany.mockResolvedValueOnce([
      { gangName: "Mason Gang A" },
      { gangName: null },
      { gangName: "Carpentry Toli" },
    ]); // distinct gang query

    const caller = createCaller(hrRouter, ENGINEER);
    const res = await caller.list({ projectId: "p-1" });
    expect(res.gangs).toEqual(["Mason Gang A", "Carpentry Toli"]);
    expect(anyDb.staff.findMany.mock.calls[1][0]).toMatchObject({
      where: { projectId: "p-1", gangName: { not: null } },
      distinct: ["gangName"],
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
    expect(anyDb.staff.findMany).not.toHaveBeenCalled();
  });
});

// ─── create / update / delete ───────────────────────────────────────────────
describe("hr staff CRUD", () => {
  it("create persists wages and applies category/employment/joinedDate defaults", async () => {
    member("engineer");
    const caller = createCaller(hrRouter, ENGINEER);
    await caller.create({
      projectId: "p-1",
      name: "Ram Bahadur",
      dailyWage: 1200,
      monthlySalary: 0,
    });

    const data = anyDb.staff.create.mock.calls[0][0].data;
    expect(data.projectId).toBe("p-1");
    expect(data.name).toBe("Ram Bahadur");
    expect(data.dailyWage).toBe(1200);
    expect(data.category).toBe("skilled"); // zod default
    expect(data.employmentType).toBe("daily"); // zod default
    expect(data.joinedDate).toBeInstanceOf(Date); // defaulted to now
  });

  it("create FORBIDDENs read-only roles (client)", async () => {
    member("client");
    const caller = createCaller(hrRouter, ENGINEER);
    await expectTRPCError(
      caller.create({ projectId: "p-1", name: "X", dailyWage: 100, monthlySalary: 0 }),
      "FORBIDDEN",
    );
    expect(anyDb.staff.create).not.toHaveBeenCalled();
  });

  it("create rejects negative dailyWage (zod nonnegative)", async () => {
    member("engineer");
    const caller = createCaller(hrRouter, ENGINEER);
    await expectTRPCError(
      caller.create({ projectId: "p-1", name: "X", dailyWage: -100, monthlySalary: 0 }),
      "BAD_REQUEST",
    );
    expect(anyDb.staff.create).not.toHaveBeenCalled();
  });

  it("update NOT_FOUNDs unknown staff", async () => {
    member("engineer");
    anyDb.staff.findUnique.mockResolvedValue(null);
    const caller = createCaller(hrRouter, ENGINEER);
    await expectTRPCError(
      caller.update({ itemId: "nope", name: "Y" }),
      "NOT_FOUND",
    );
    expect(anyDb.staff.update).not.toHaveBeenCalled();
  });

  it("update rejects staff belonging to ANOTHER project (cross-project IDOR)", async () => {
    // Staff row lives in p-2; caller is only a member of p-1.
    anyDb.staff.findUnique.mockResolvedValue({ projectId: "p-2" });
    member(null); // membership lookup for p-2 → null → FORBIDDEN
    const caller = createCaller(hrRouter, ENGINEER);
    await expectTRPCError(
      caller.update({ itemId: "st-1", name: "Y" }),
      "FORBIDDEN",
    );
    expect(anyDb.staff.update).not.toHaveBeenCalled();
  });

  it("update converts joinedDate strings to Date and null stays null", async () => {
    member("engineer");
    anyDb.staff.findUnique.mockResolvedValue({ projectId: "p-1" });
    const caller = createCaller(hrRouter, ENGINEER);

    await caller.update({ itemId: "st-1", joinedDate: "2026-01-15" });
    expect(anyDb.staff.update.mock.calls[0][0].data.joinedDate).toEqual(
      new Date("2026-01-15"),
    );

    await caller.update({ itemId: "st-1", joinedDate: null });
    expect(anyDb.staff.update.mock.calls[1][0].data.joinedDate).toBeNull();
  });

  it("delete removes the staff row only after project-scope verification", async () => {
    member("engineer");
    anyDb.staff.findUnique.mockResolvedValue({ projectId: "p-1" });
    const caller = createCaller(hrRouter, ENGINEER);
    const res = await caller.delete({ itemId: "st-1" });
    expect(res.ok).toBe(true);
    expect(anyDb.staff.delete).toHaveBeenCalledWith({ where: { id: "st-1" } });
  });

  it("delete NOT_FOUNDs unknown staff and FORBIDDENs other-project staff", async () => {
    member("engineer");
    anyDb.staff.findUnique.mockResolvedValue(null);
    const caller = createCaller(hrRouter, ENGINEER);
    await expectTRPCError(caller.delete({ itemId: "nope" }), "NOT_FOUND");

    anyDb.staff.findUnique.mockResolvedValue({ projectId: "p-2" });
    member(null);
    await expectTRPCError(caller.delete({ itemId: "st-1" }), "FORBIDDEN");
    expect(anyDb.staff.delete).not.toHaveBeenCalled();
  });
});

// ─── getAttendanceByDate ────────────────────────────────────────────────────
describe("hr.getAttendanceByDate", () => {
  it("defaults unlogged workers to present/8h and keeps logged attendance", async () => {
    member("engineer");
    anyDb.staff.findMany.mockResolvedValue([
      { id: "s-1", name: "Ram", designation: "Mason", category: "skilled", employmentType: "daily", gangName: null, dailyWage: 1000 },
      { id: "s-2", name: "Shyam", designation: "Helper", category: "unskilled", employmentType: "daily", gangName: null, dailyWage: 800 },
    ]);
    anyDb.staffAttendance.findMany.mockResolvedValue([
      { staffId: "s-1", date: new Date("2026-08-01"), status: "absent", hours: 0, overtime: 0, remarks: "sick" },
    ]);

    const caller = createCaller(hrRouter, ENGINEER);
    const res = await caller.getAttendanceByDate({ projectId: "p-1", date: "2026-08-01" });

    expect(res.totalWorkers).toBe(2);
    expect(res.loggedCount).toBe(1);
    const ram = res.items.find((i: any) => i.staffId === "s-1")!;
    expect(ram.status).toBe("absent");
    expect(ram.hours).toBe(0);
    expect(ram.isLogged).toBe(true);
    const shyam = res.items.find((i: any) => i.staffId === "s-2")!;
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
      { staffId: "s-1", status: "present" as const, hours: 8, overtime: 2 },
      { staffId: "s-2", status: "half_day" as const, hours: 4, overtime: 0 },
    ],
  };

  it("upserts each record against the staffId_date unique key at UTC midnight", async () => {
    member("engineer");
    anyDb.staff.findMany.mockResolvedValue([{ id: "s-1" }, { id: "s-2" }]);

    const caller = createCaller(hrRouter, ENGINEER);
    const res = await caller.bulkLogAttendance(input);
    expect(res.success).toBe(true);

    expect(anyDb.staffAttendance.upsert).toHaveBeenCalledTimes(2);
    const targetDate = new Date("2026-08-01T00:00:00.000Z");
    expect(anyDb.staffAttendance.upsert.mock.calls[0][0].where).toEqual({
      staffId_date: { staffId: "s-1", date: targetDate },
    });
    expect(anyDb.staffAttendance.upsert.mock.calls[0][0].create).toMatchObject({
      projectId: "p-1",
      staffId: "s-1",
      status: "present",
      hours: 8,
      overtime: 2,
    });
    expect(anyDb.staffAttendance.upsert.mock.calls[1][0].create).toMatchObject({
      staffId: "s-2",
      status: "half_day",
      hours: 4,
    });
  });

  it("drops staff IDs that do not belong to the project (cross-project overwrite guard)", async () => {
    member("engineer");
    // only s-1 belongs to p-1; "foreign" belongs to another project/org
    anyDb.staff.findMany.mockResolvedValue([{ id: "s-1" }]);

    const caller = createCaller(hrRouter, ENGINEER);
    await caller.bulkLogAttendance({
      ...input,
      records: [
        { staffId: "s-1", status: "present", hours: 8, overtime: 0 },
        { staffId: "foreign", status: "absent", hours: 0, overtime: 0 },
      ],
    });

    expect(anyDb.staffAttendance.upsert).toHaveBeenCalledTimes(1);
    expect(anyDb.staffAttendance.upsert.mock.calls[0][0].where.staffId_date.staffId).toBe("s-1");
  });

  it("FORBIDDENs read-only roles", async () => {
    member("client");
    const caller = createCaller(hrRouter, ENGINEER);
    await expectTRPCError(caller.bulkLogAttendance(input), "FORBIDDEN");
    expect(anyDb.staffAttendance.upsert).not.toHaveBeenCalled();
  });
});

// ─── getMusterRoll ──────────────────────────────────────────────────────────
describe("hr.getMusterRoll", () => {
  function att(day: number, status: string, overtime = 0) {
    return {
      staffId: "s-1",
      date: new Date(Date.UTC(2025, 0, day)),
      status,
      hours: status === "half_day" ? 4 : 8,
      overtime,
    };
  }

  it("computes effectiveDays, OT at 1.5× hourly, and gross for a daily worker", async () => {
    member("engineer");
    anyDb.staff.findMany.mockResolvedValue([
      {
        id: "s-1", name: "Ram", designation: "Mason", category: "skilled",
        employmentType: "daily", gangName: null, dailyWage: 1000, monthlySalary: 0,
      },
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
    anyDb.staff.findMany.mockResolvedValue([
      {
        id: "s-2", name: "Sita", designation: "Supervisor", category: "supervisor",
        employmentType: "monthly", gangName: null, dailyWage: 0, monthlySalary: 45000,
      },
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
  it("getStaffAdvances sums only UNRECOVERED advances into the pending total", async () => {
    member("engineer");
    anyDb.staffAdvance.findMany.mockResolvedValue([
      { amount: 5000, isRecovered: false },
      { amount: 2000, isRecovered: false },
      { amount: 1000, isRecovered: true },
    ]);

    const caller = createCaller(hrRouter, ENGINEER);
    const res = await caller.getStaffAdvances({ projectId: "p-1" });
    expect(res.totalPendingAdvances).toBe(7000);
    expect(anyDb.staffAdvance.findMany.mock.calls[0][0].where).toEqual({
      projectId: "p-1",
    });
  });

  it("getStaffAdvances passes staffId/isRecovered filters through", async () => {
    member("engineer");
    anyDb.staffAdvance.findMany.mockResolvedValue([]);
    const caller = createCaller(hrRouter, ENGINEER);
    await caller.getStaffAdvances({
      projectId: "p-1",
      staffId: "s-1",
      isRecovered: false,
    });
    expect(anyDb.staffAdvance.findMany.mock.calls[0][0].where).toEqual({
      projectId: "p-1",
      staffId: "s-1",
      isRecovered: false,
    });
  });

  it("createStaffAdvance persists amount, type, creator and default date", async () => {
    member("engineer");
    anyDb.staff.findFirst.mockResolvedValue({ id: "s-1" });
    const caller = createCaller(hrRouter, ENGINEER);
    await caller.createStaffAdvance({
      projectId: "p-1",
      staffId: "s-1",
      amount: 3000,
      type: "cash_advance",
    });

    const data = anyDb.staffAdvance.create.mock.calls[0][0].data;
    expect(data).toMatchObject({
      projectId: "p-1",
      staffId: "s-1",
      amount: 3000,
      type: "cash_advance",
      createdById: ENGINEER.id,
    });
    expect(data.date).toBeInstanceOf(Date); // defaulted to now
  });

  it("createStaffAdvance rejects zero/negative amounts (zod positive)", async () => {
    member("engineer");
    anyDb.staff.findFirst.mockResolvedValue({ id: "s-1" });
    const caller = createCaller(hrRouter, ENGINEER);
    await expectTRPCError(
      caller.createStaffAdvance({ projectId: "p-1", staffId: "s-1", amount: 0 }),
      "BAD_REQUEST",
    );
    await expectTRPCError(
      caller.createStaffAdvance({ projectId: "p-1", staffId: "s-1", amount: -100 }),
      "BAD_REQUEST",
    );
    expect(anyDb.staffAdvance.create).not.toHaveBeenCalled();
  });

  it("createStaffAdvance NOT_FOUNDs staff belonging to ANOTHER project (cross-project guard)", async () => {
    member("engineer");
    // staff "foreign" is not a member of p-1 → findFirst returns null
    anyDb.staff.findFirst.mockResolvedValue(null);
    const caller = createCaller(hrRouter, ENGINEER);
    await expectTRPCError(
      caller.createStaffAdvance({ projectId: "p-1", staffId: "foreign", amount: 5000 }),
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

  it("deleteStaffAdvance refuses to delete recovered advances", async () => {
    member("engineer");
    anyDb.staffAdvance.findFirst.mockResolvedValue({ id: "adv-1", isRecovered: true });
    const caller = createCaller(hrRouter, ENGINEER);
    await expectTRPCError(
      caller.deleteStaffAdvance({ projectId: "p-1", advanceId: "adv-1" }),
      "BAD_REQUEST",
    );
    expect(anyDb.staffAdvance.delete).not.toHaveBeenCalled();
  });

  it("deleteStaffAdvance deletes a pending advance in the authorized project", async () => {
    member("engineer");
    anyDb.staffAdvance.findFirst.mockResolvedValue({ id: "adv-1", isRecovered: false });
    const caller = createCaller(hrRouter, ENGINEER);
    const res = await caller.deleteStaffAdvance({ projectId: "p-1", advanceId: "adv-1" });
    expect(res.success).toBe(true);
    expect(anyDb.staffAdvance.delete).toHaveBeenCalledWith({ where: { id: "adv-1" } });
  });
});
