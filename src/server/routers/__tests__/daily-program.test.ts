/**
 * Router-layer tests for daily-program.ts.
 *
 * Pins:
 *   - getApprovedDailyProgramByDate: only APPROVED programs are returned
 *     (draft → null); carried-over tasks are merged with isCarriedOver +
 *     carriedFromDate; read-only roles FORBIDDEN
 *   - getProgramResources: workforce aggregation math (staff qty → headcount
 *     with 8h reg hours, role qty × headcount, min-1 clamp), equipment
 *     dedupe, ended-assignment exclusion, assignment query scoping,
 *     project-scoped master lists
 *   - fetchWeather: authz + NOT_FOUND + no-location BAD_REQUEST (all
 *     pre-network paths)
 *   - approveProgram: PM-only (coordinator FORBIDDEN), project mismatch
 *     FORBIDDEN, idempotent when already approved (no update)
 *   - createProgram: duplicate programDate per project → CONFLICT; nested
 *     task creation with zod defaults; negative quantities rejected
 *     (regression: planned/actual/batched/payable quantities had no min(0) —
 *     same class as the phase-4 negative-amount bugs; payableQty feeds
 *     certification + yield-reconciliation math)
 *   - updateTaskExecution: explicit payableQty = 0 is RESPECTED, not
 *     re-rated to actualQty (phase-5 material-reconciliation fix depends on
 *     this semantics); batched/payable default to actualQty; carry-over
 *     "tomorrow" finds-or-creates the next program and copies the REMAINING
 *     qty (clamped ≥ 0); cross-project task IDOR (FORBIDDEN/NOT_FOUND)
 *   - updateProgram: approved programs are immutable (FORBIDDEN); tx deletes
 *     + recreates tasks; program IDOR guard
 *   - deleteProgram: happy path + IDOR guard
 *   - addBacklogToProgram: carry-over plannedQty = max(0, planned − actual),
 *     actualQty reset to 0, foreign source task rejected, foreign target
 *     program rejected
 *   - resyncProgram: removes stale/orphaned tasks, updates existing,
 *     creates tasks from newly approved RFI items
 *   - cancellation workflow: request (pending only), review (PM/coordinator
 *     only, approve → executionStatus "cancelled", notify requester),
 *     pending list PM/coordinator-only
 *   - list scoping: listPrograms / listBacklog / listBacklogTasks /
 *     listAvailableRfis where clauses (project + status filters +
 *     default-library ingredient filter)
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { buildUser, createCaller, expectTRPCError } from "./test-utils";

vi.mock("@/lib/db", async () => {
  const { buildDbMock } = await import("./test-utils");
  const db = buildDbMock();
  return { db, getFreshDb: () => db };
});

import { db } from "@/lib/db";
import { dailyProgramRouter } from "../daily-program";

const anyDb = db as any;
const USER = buildUser();

function member(role: string | null) {
  anyDb.projectMember.findUnique.mockResolvedValue(role ? { role } : null);
}

function program(overrides: Record<string, unknown> = {}) {
  return {
    id: "prog-1",
    projectId: "p-1",
    programDate: new Date("2026-08-15T00:00:00.000Z"),
    status: "draft",
    tasks: [],
    // Engine attribution fields — transitionEntityState writes these only
    // when the entity actually carries the columns.
    approvedById: null,
    approvedAt: null,
    notes: null,
    ...overrides,
  };
}

function task(overrides: Record<string, unknown> = {}) {
  return {
    id: "task-1",
    programId: "prog-1",
    taskName: "Footing concrete",
    plannedQty: 100,
    unit: "cum",
    paymentType: "payable",
    executionStatus: "planned",
    rfiId: null,
    rfiItemId: null,
    ganttTaskId: null,
    boqItemId: null,
    boqCode: null,
    boqDesc: null,
    location: null,
    assignedTo: null,
    remarks: null,
    actualQty: 0,
    batchedQty: 0,
    payableQty: 0,
    carriedOverFromId: null,
    cancellationStatus: "none",
    program: program(),
    ...overrides,
  };
}

beforeEach(() => {
  vi.resetAllMocks();
});

// ─── getApprovedDailyProgramByDate ─────────────────────────────────────────
describe("dailyProgram.getApprovedDailyProgramByDate", () => {
  it("returns null for a program that is still a draft", async () => {
    member("engineer");
    anyDb.dailyProgram.findUnique.mockResolvedValue(program({ status: "draft" }));
    const caller = createCaller(dailyProgramRouter, USER);
    const res = await caller.getApprovedDailyProgramByDate({
      projectId: "p-1",
      programDate: "2026-08-15",
    });
    expect(res).toBeNull();
    expect(anyDb.dailyProgramTask.findMany).not.toHaveBeenCalled();
  });

  it("merges carried-over tasks into an approved program, flagged with their source date", async () => {
    member("engineer");
    anyDb.dailyProgram.findUnique.mockResolvedValue(
      program({ status: "approved", tasks: [{ id: "task-1", taskName: "Footing concrete" }] }),
    );
    anyDb.dailyProgramTask.findMany.mockResolvedValue([
      { id: "task-9", taskName: "Backfill", program: { programDate: new Date("2026-08-14T00:00:00.000Z") } },
    ]);
    const caller = createCaller(dailyProgramRouter, USER);
    const res = await caller.getApprovedDailyProgramByDate({
      projectId: "p-1",
      programDate: "2026-08-15",
    });
    expect(res.tasks).toHaveLength(2);
    expect(res.tasks[1]).toEqual(
      expect.objectContaining({ id: "task-9", isCarriedOver: true, carriedFromDate: new Date("2026-08-14T00:00:00.000Z") }),
    );
  });

  it("FORBIDDENs read-only roles (client)", async () => {
    member("client");
    const caller = createCaller(dailyProgramRouter, USER);
    await expectTRPCError(
      caller.getApprovedDailyProgramByDate({ projectId: "p-1", programDate: "2026-08-15" }),
      "FORBIDDEN",
    );
    expect(anyDb.dailyProgram.findUnique).not.toHaveBeenCalled();
  });
});

// ─── getProgramResources ───────────────────────────────────────────────────
describe("dailyProgram.getProgramResources", () => {
  function setup(tasks: any[], assignments: any[]) {
    anyDb.dailyProgram.findUnique.mockResolvedValue(program({ tasks }));
    anyDb.dailyProgramTask.findMany.mockResolvedValue([]);
    anyDb.resourceAssignment.findMany.mockResolvedValue(assignments);
    anyDb.staff.findMany.mockResolvedValue([]);
    anyDb.equipment.findMany.mockResolvedValue([]);
  }

  it("aggregates staff headcount (qty × 8h) and role headcount (qty × role.headcount, min 1)", async () => {
    member("engineer");
    setup([{ id: "t-1", ganttTaskId: "g-1" }], [
      { staffId: "s-1", staffRoleId: null, staff: { id: "s-1", name: "Ram", designation: "Mason", category: "skilled" }, quantity: 2, endDate: null },
      { staffId: null, staffRoleId: "r-1", staffRole: { id: "r-1", name: "Helper", category: "unskilled", headcount: 3 }, quantity: 2, endDate: null },
      { staffId: null, staffRoleId: "r-2", staffRole: { id: "r-2", name: "Operator", category: "skilled", headcount: 0 }, quantity: 0.4, endDate: null },
    ]);
    const caller = createCaller(dailyProgramRouter, USER);
    const res = await caller.getProgramResources({ projectId: "p-1", programDate: "2026-08-15" });

    const ram = res.workforce.find((w: any) => w.staffId === "s-1");
    expect(ram).toEqual(expect.objectContaining({ headcount: 2, regHours: 16, skill: "skilled" }));

    const helper = res.workforce.find((w: any) => w.staffRoleId === "r-1");
    expect(helper.headcount).toBe(6); // 2 × 3
    expect(helper.regHours).toBe(48);

    // headcount 0 + qty 0.4 → round(0.4) = 0 → clamped to 1
    const operator = res.workforce.find((w: any) => w.staffRoleId === "r-2");
    expect(operator.headcount).toBe(1);
  });

  it("sums the same staff across tasks and dedupes equipment", async () => {
    member("engineer");
    setup(
      [
        { id: "t-1", ganttTaskId: "g-1" },
        { id: "t-2", ganttTaskId: "g-2" },
      ],
      [
        { staffId: "s-1", staffRoleId: null, staff: { id: "s-1", name: "Ram", designation: "Mason", category: null }, quantity: 2, endDate: null },
        { staffId: "s-1", staffRoleId: null, staff: { id: "s-1", name: "Ram", designation: "Mason", category: null }, quantity: 2, endDate: null },
        { staffId: null, staffRoleId: null, equipmentId: "e-1", equipment: { id: "e-1", name: "Excavator", code: "EX-1", type: "Heavy" }, endDate: null },
        { staffId: null, staffRoleId: null, equipmentId: "e-1", equipment: { id: "e-1", name: "Excavator", code: "EX-1", type: "Heavy" }, endDate: null },
      ],
    );
    const caller = createCaller(dailyProgramRouter, USER);
    const res = await caller.getProgramResources({ projectId: "p-1", programDate: "2026-08-15" });

    const ram = res.workforce.find((w: any) => w.staffId === "s-1");
    expect(ram.headcount).toBe(4); // 2 + 2
    expect(res.equipment).toHaveLength(1);
    expect(res.equipment[0]).toEqual(expect.objectContaining({ equipmentId: "e-1", equipmentName: "Excavator", id: "EX-1" }));
    expect(res.programTaskCount).toBe(2);
  });

  it("excludes assignments that ended before the program date", async () => {
    member("engineer");
    setup([{ id: "t-1", ganttTaskId: "g-1" }], [
      { staffId: "s-1", staffRoleId: null, staff: { id: "s-1", name: "Ram", designation: "Mason", category: null }, quantity: 2, endDate: "2026-08-10T00:00:00.000Z" },
      { staffId: "s-2", staffRoleId: null, staff: { id: "s-2", name: "Shyam", designation: "Mason", category: null }, quantity: 2, endDate: "2026-08-20T00:00:00.000Z" },
    ]);
    const caller = createCaller(dailyProgramRouter, USER);
    const res = await caller.getProgramResources({ projectId: "p-1", programDate: "2026-08-15" });
    expect(res.workforce.map((w: any) => w.staffId)).toEqual(["s-2"]);
  });

  it("queries assignments for the program's gantt tasks, active on the date, with project-scoped master lists", async () => {
    member("engineer");
    setup([{ id: "t-1", ganttTaskId: "g-1" }], []);
    const caller = createCaller(dailyProgramRouter, USER);
    await caller.getProgramResources({ projectId: "p-1", programDate: "2026-08-15" });

    const where = anyDb.resourceAssignment.findMany.mock.calls[0][0].where;
    expect(where.taskId).toEqual({ in: ["g-1"] });
    expect(where.OR).toEqual([{ startDate: null }, { startDate: { lte: new Date("2026-08-15T00:00:00.000Z") } }]);
    expect(anyDb.staff.findMany.mock.calls[0][0].where).toEqual({ projectId: "p-1", status: "active" });
    expect(anyDb.equipment.findMany.mock.calls[0][0].where).toEqual({ projectId: "p-1" });
  });

  it("FORBIDDENs read-only roles (inspector)", async () => {
    member("inspector");
    const caller = createCaller(dailyProgramRouter, USER);
    await expectTRPCError(
      caller.getProgramResources({ projectId: "p-1", programDate: "2026-08-15" }),
      "FORBIDDEN",
    );
  });
});

// ─── fetchWeather (pre-network paths) ──────────────────────────────────────
describe("dailyProgram.fetchWeather", () => {
  it("FORBIDDENs non-members", async () => {
    member(null);
    const caller = createCaller(dailyProgramRouter, USER);
    await expectTRPCError(
      caller.fetchWeather({ projectId: "p-1", reportDate: "2026-08-15", latitude: 27, longitude: 85 }),
      "FORBIDDEN",
    );
  });

  it("NOT_FOUNDs when the project does not exist", async () => {
    member("engineer");
    anyDb.project.findUnique.mockResolvedValue(null);
    const caller = createCaller(dailyProgramRouter, USER);
    await expectTRPCError(
      caller.fetchWeather({ projectId: "p-x", reportDate: "2026-08-15" }),
      "NOT_FOUND",
    );
  });

  it("BAD_REQUESTs when the project has neither location nor name to geocode", async () => {
    member("engineer");
    anyDb.project.findUnique.mockResolvedValue({ location: "   ", name: "" });
    const caller = createCaller(dailyProgramRouter, USER);
    await expectTRPCError(
      caller.fetchWeather({ projectId: "p-1", reportDate: "2026-08-15" }),
      "BAD_REQUEST",
    );
  });
});

// ─── approveProgram ────────────────────────────────────────────────────────
describe("dailyProgram.approveProgram", () => {
  it("is PM-only: a coordinator is FORBIDDEN", async () => {
    member("coordinator");
    const caller = createCaller(dailyProgramRouter, USER);
    await expectTRPCError(
      caller.approveProgram({ programId: "prog-1", projectId: "p-1" }),
      "FORBIDDEN",
    );
    expect(anyDb.dailyProgram.updateMany).not.toHaveBeenCalled();
  });

  it("approves a draft program and stamps approver + time (engine CAS)", async () => {
    member("project_manager");
    anyDb.dailyProgram.findUnique.mockResolvedValue(program());
    const caller = createCaller(dailyProgramRouter, USER);
    await caller.approveProgram({ programId: "prog-1", projectId: "p-1" });
    const call = anyDb.dailyProgram.updateMany.mock.calls[0][0];
    expect(call.where).toEqual({ id: "prog-1", status: "draft" });
    expect(call.data).toMatchObject({
      status: "approved",
      approvedById: "user-1",
    });
    expect(call.data.approvedAt).toBeInstanceOf(Date);
  });

  it("FORBIDDENs a program that belongs to another project (IDOR guard)", async () => {
    member("project_manager");
    anyDb.dailyProgram.findUnique.mockResolvedValue(program({ projectId: "p-other" }));
    const caller = createCaller(dailyProgramRouter, USER);
    await expectTRPCError(
      caller.approveProgram({ programId: "prog-1", projectId: "p-1" }),
      "FORBIDDEN",
    );
    expect(anyDb.dailyProgram.updateMany).not.toHaveBeenCalled();
  });

  it("is idempotent: an already-approved program returns without updating", async () => {
    member("project_manager");
    const approved = program({ status: "approved" });
    anyDb.dailyProgram.findUnique.mockResolvedValue(approved);
    const caller = createCaller(dailyProgramRouter, USER);
    const res = await caller.approveProgram({ programId: "prog-1", projectId: "p-1" });
    expect(res.program).toEqual(approved);
    expect(anyDb.dailyProgram.updateMany).not.toHaveBeenCalled();
  });

  it("NOT_FOUNDs a missing program", async () => {
    member("project_manager");
    anyDb.dailyProgram.findUnique.mockResolvedValue(null);
    const caller = createCaller(dailyProgramRouter, USER);
    await expectTRPCError(
      caller.approveProgram({ programId: "missing", projectId: "p-1" }),
      "NOT_FOUND",
    );
  });
});

// ─── createProgram ─────────────────────────────────────────────────────────
describe("dailyProgram.createProgram", () => {
  const baseInput = {
    projectId: "p-1",
    programDate: "2026-08-15",
    tasks: [{ taskName: "Footing concrete", plannedQty: 100, unit: "cum" }],
  };

  it("CONFLICTs when a program already exists for that date", async () => {
    member("engineer");
    anyDb.dailyProgram.findUnique.mockResolvedValue({ id: "existing" });
    const caller = createCaller(dailyProgramRouter, USER);
    await expectTRPCError(caller.createProgram(baseInput), "CONFLICT");
    expect(anyDb.dailyProgram.create).not.toHaveBeenCalled();
  });

  it("creates the program with nested tasks and applies zod defaults (payable/planned)", async () => {
    member("engineer");
    anyDb.dailyProgram.findUnique.mockResolvedValue(null);
    anyDb.dailyProgram.create.mockResolvedValue(program());
    const caller = createCaller(dailyProgramRouter, USER);
    await caller.createProgram(baseInput);

    const arg = anyDb.dailyProgram.create.mock.calls[0][0];
    expect(arg.data.projectId).toBe("p-1");
    expect(arg.data.programDate).toEqual(new Date("2026-08-15T00:00:00.000Z"));
    expect(arg.data.tasks.create[0]).toEqual(
      expect.objectContaining({ taskName: "Footing concrete", plannedQty: 100, paymentType: "payable", executionStatus: "planned" }),
    );
  });

  it("rejects negative planned quantities (zod min(0) — regression)", async () => {
    member("engineer");
    const caller = createCaller(dailyProgramRouter, USER);
    await expectTRPCError(
      caller.createProgram({ ...baseInput, tasks: [{ taskName: "Bad", plannedQty: -10 }] }),
      "BAD_REQUEST",
    );
    expect(anyDb.dailyProgram.create).not.toHaveBeenCalled();
  });

  it("FORBIDDENs read-only roles", async () => {
    member("client");
    const caller = createCaller(dailyProgramRouter, USER);
    await expectTRPCError(caller.createProgram(baseInput), "FORBIDDEN");
    expect(anyDb.dailyProgram.create).not.toHaveBeenCalled();
  });
});

// ─── updateTaskExecution ───────────────────────────────────────────────────
describe("dailyProgram.updateTaskExecution", () => {
  const baseInput = {
    taskId: "task-1",
    projectId: "p-1",
    executionStatus: "done" as const,
  };

  /**
   * REGRESSION / SEMANTICS PIN: an explicit payableQty of 0 means "nothing
   * certified payable" (100% wastage in yield reconciliation). The
   * phase-5 material-reconciliation fix (`payableQty ?? actualQty` fallback)
   * depends on daily-program persisting the explicit 0 — it must never be
   * re-rated to actualQty.
   */
  it("respects an explicit payableQty of 0 instead of re-rating it to actualQty", async () => {
    member("engineer");
    anyDb.dailyProgramTask.findUnique.mockResolvedValue(task());
    const caller = createCaller(dailyProgramRouter, USER);
    await caller.updateTaskExecution({
      ...baseInput,
      actualQty: 100,
      batchedQty: 110,
      payableQty: 0,
    });
    const data = anyDb.dailyProgramTask.update.mock.calls[0][0].data;
    expect(data.actualQty).toBe(100);
    expect(data.batchedQty).toBe(110);
    expect(data.payableQty).toBe(0);
  });

  it("defaults batched and payable to actualQty when omitted", async () => {
    member("engineer");
    anyDb.dailyProgramTask.findUnique.mockResolvedValue(task());
    const caller = createCaller(dailyProgramRouter, USER);
    await caller.updateTaskExecution({ ...baseInput, actualQty: 80 });
    const data = anyDb.dailyProgramTask.update.mock.calls[0][0].data;
    expect(data.actualQty).toBe(80);
    expect(data.batchedQty).toBe(80);
    expect(data.payableQty).toBe(80);
  });

  it("rejects negative actual/batched/payable quantities (zod min(0) — regression)", async () => {
    member("engineer");
    const caller = createCaller(dailyProgramRouter, USER);
    await expectTRPCError(
      caller.updateTaskExecution({ ...baseInput, actualQty: -5 }),
      "BAD_REQUEST",
    );
    await expectTRPCError(
      caller.updateTaskExecution({ ...baseInput, actualQty: 10, payableQty: -1 }),
      "BAD_REQUEST",
    );
    expect(anyDb.dailyProgramTask.update).not.toHaveBeenCalled();
  });

  it("carry-over 'tomorrow' creates the next program and copies the REMAINING quantity", async () => {
    member("engineer");
    anyDb.dailyProgramTask.findUnique.mockResolvedValue(
      task({ plannedQty: 100, program: program() }),
    );
    anyDb.dailyProgram.findUnique.mockResolvedValue(null); // no program tomorrow
    anyDb.dailyProgram.create.mockResolvedValue(program({ id: "prog-2", programDate: new Date("2026-08-16T00:00:00.000Z") }));
    const caller = createCaller(dailyProgramRouter, USER);
    await caller.updateTaskExecution({
      ...baseInput,
      executionStatus: "partially_completed",
      actualQty: 40,
      carryOverAction: "tomorrow",
    });

    // finds-or-creates tomorrow's program
    expect(anyDb.dailyProgram.create.mock.calls[0][0].data).toEqual(
      expect.objectContaining({ projectId: "p-1", programDate: new Date("2026-08-16T00:00:00.000Z"), status: "draft" }),
    );
    const carry = anyDb.dailyProgramTask.create.mock.calls[0][0].data;
    expect(carry.plannedQty).toBe(60); // 100 − 40
    expect(carry.executionStatus).toBe("planned");
    expect(carry.carriedOverFromId).toBe("task-1");
    expect(carry.programId).toBe("prog-2");
  });

  it("reuses an existing program for tomorrow instead of creating a duplicate", async () => {
    member("engineer");
    anyDb.dailyProgramTask.findUnique.mockResolvedValue(task({ plannedQty: 100 }));
    anyDb.dailyProgram.findUnique.mockResolvedValue(program({ id: "prog-2", programDate: new Date("2026-08-16T00:00:00.000Z") }));
    const caller = createCaller(dailyProgramRouter, USER);
    await caller.updateTaskExecution({
      ...baseInput,
      executionStatus: "uncompleted",
      carryOverAction: "tomorrow",
    });
    expect(anyDb.dailyProgram.create).not.toHaveBeenCalled();
    expect(anyDb.dailyProgramTask.create.mock.calls[0][0].data.programId).toBe("prog-2");
  });

  it("does not carry over a 'done' task even when carryOverAction is tomorrow", async () => {
    member("engineer");
    anyDb.dailyProgramTask.findUnique.mockResolvedValue(task());
    const caller = createCaller(dailyProgramRouter, USER);
    await caller.updateTaskExecution({ ...baseInput, carryOverAction: "tomorrow" });
    expect(anyDb.dailyProgramTask.create).not.toHaveBeenCalled();
  });

  it("FORBIDDENs a task from another project (IDOR guard)", async () => {
    member("engineer");
    anyDb.dailyProgramTask.findUnique.mockResolvedValue(
      task({ program: program({ projectId: "p-other" }) }),
    );
    const caller = createCaller(dailyProgramRouter, USER);
    await expectTRPCError(
      caller.updateTaskExecution({ ...baseInput, actualQty: 5 }),
      "FORBIDDEN",
    );
    expect(anyDb.dailyProgramTask.update).not.toHaveBeenCalled();
  });

  it("NOT_FOUNDs a missing task", async () => {
    member("engineer");
    anyDb.dailyProgramTask.findUnique.mockResolvedValue(null);
    const caller = createCaller(dailyProgramRouter, USER);
    await expectTRPCError(
      caller.updateTaskExecution({ ...baseInput, actualQty: 5 }),
      "NOT_FOUND",
    );
  });
});

// ─── updateProgram ─────────────────────────────────────────────────────────
describe("dailyProgram.updateProgram", () => {
  const baseInput = {
    programId: "prog-1",
    projectId: "p-1",
    programDate: "2026-08-15",
    tasks: [{ taskName: "Footing concrete", plannedQty: 50 }],
  };

  it("FORBIDDENs editing an approved program (immutable after approval)", async () => {
    member("engineer");
    anyDb.dailyProgram.findUnique.mockResolvedValue(program({ status: "approved" }));
    const caller = createCaller(dailyProgramRouter, USER);
    await expectTRPCError(caller.updateProgram(baseInput), "FORBIDDEN");
    expect(anyDb.$transaction).not.toHaveBeenCalled();
  });

  it("replaces all tasks inside a transaction", async () => {
    member("engineer");
    anyDb.dailyProgram.findUnique.mockResolvedValue(program());
    const caller = createCaller(dailyProgramRouter, USER);
    await caller.updateProgram(baseInput);

    expect(anyDb.$transaction).toHaveBeenCalledTimes(1);
    expect(anyDb.dailyProgramTask.deleteMany).toHaveBeenCalledWith({
      where: { programId: "prog-1" },
    });
    const update = anyDb.dailyProgram.update.mock.calls[0][0];
    expect(update.where).toEqual({ id: "prog-1" });
    expect(update.data.tasks.create[0]).toEqual(
      expect.objectContaining({ taskName: "Footing concrete", plannedQty: 50 }),
    );
  });

  it("FORBIDDENs a program from another project (IDOR guard)", async () => {
    member("engineer");
    anyDb.dailyProgram.findUnique.mockResolvedValue(program({ projectId: "p-other" }));
    const caller = createCaller(dailyProgramRouter, USER);
    await expectTRPCError(caller.updateProgram(baseInput), "FORBIDDEN");
    expect(anyDb.dailyProgram.update).not.toHaveBeenCalled();
  });
});

// ─── deleteProgram ─────────────────────────────────────────────────────────
describe("dailyProgram.deleteProgram", () => {
  it("deletes a draft program", async () => {
    member("engineer");
    anyDb.dailyProgram.findUnique.mockResolvedValue(program());
    const caller = createCaller(dailyProgramRouter, USER);
    const res = await caller.deleteProgram({ programId: "prog-1", projectId: "p-1" });
    expect(res.success).toBe(true);
    expect(anyDb.dailyProgram.delete).toHaveBeenCalledWith({ where: { id: "prog-1" } });
  });

  it("FORBIDDENs deleting another project's program (IDOR guard)", async () => {
    member("engineer");
    anyDb.dailyProgram.findUnique.mockResolvedValue(program({ projectId: "p-other" }));
    const caller = createCaller(dailyProgramRouter, USER);
    await expectTRPCError(
      caller.deleteProgram({ programId: "prog-1", projectId: "p-1" }),
      "FORBIDDEN",
    );
    expect(anyDb.dailyProgram.delete).not.toHaveBeenCalled();
  });
});

// ─── addBacklogToProgram ───────────────────────────────────────────────────
describe("dailyProgram.addBacklogToProgram", () => {
  it("creates carry-over tasks with the REMAINING quantity and reset actuals", async () => {
    member("engineer");
    anyDb.dailyProgram.findUnique.mockResolvedValue(program());
    anyDb.dailyProgramTask.findMany.mockResolvedValue([
      task({ id: "src-1", plannedQty: 100, actualQty: 30, paymentType: "payable" }),
    ]);
    const caller = createCaller(dailyProgramRouter, USER);
    const res = await caller.addBacklogToProgram({
      projectId: "p-1",
      programId: "prog-1",
      taskIds: ["src-1"],
    });
    expect(res).toEqual({ success: true, count: 1 });
    const data = anyDb.dailyProgramTask.createMany.mock.calls[0][0].data[0];
    expect(data.plannedQty).toBe(70); // 100 − 30
    expect(data.actualQty).toBe(0);
    expect(data.executionStatus).toBe("planned");
    expect(data.carriedOverFromId).toBe("src-1");
    expect(data.programId).toBe("prog-1");
  });

  it("clamps a negative remaining quantity to 0", async () => {
    member("engineer");
    anyDb.dailyProgram.findUnique.mockResolvedValue(program());
    anyDb.dailyProgramTask.findMany.mockResolvedValue([
      task({ id: "src-1", plannedQty: 50, actualQty: 80 }),
    ]);
    const caller = createCaller(dailyProgramRouter, USER);
    await caller.addBacklogToProgram({ projectId: "p-1", programId: "prog-1", taskIds: ["src-1"] });
    expect(anyDb.dailyProgramTask.createMany.mock.calls[0][0].data[0].plannedQty).toBe(0);
  });

  it("FORBIDDENs a source task that belongs to another project", async () => {
    member("engineer");
    anyDb.dailyProgram.findUnique.mockResolvedValue(program());
    anyDb.dailyProgramTask.findMany.mockResolvedValue([
      task({ id: "src-foreign", program: program({ projectId: "p-other" }) }),
    ]);
    const caller = createCaller(dailyProgramRouter, USER);
    await expectTRPCError(
      caller.addBacklogToProgram({ projectId: "p-1", programId: "prog-1", taskIds: ["src-foreign"] }),
      "FORBIDDEN",
    );
    expect(anyDb.dailyProgramTask.createMany).not.toHaveBeenCalled();
  });

  it("FORBIDDENs carrying over into another project's program (IDOR guard)", async () => {
    member("engineer");
    anyDb.dailyProgram.findUnique.mockResolvedValue(program({ projectId: "p-other" }));
    const caller = createCaller(dailyProgramRouter, USER);
    await expectTRPCError(
      caller.addBacklogToProgram({ projectId: "p-1", programId: "prog-1", taskIds: ["src-1"] }),
      "FORBIDDEN",
    );
    expect(anyDb.dailyProgramTask.findMany).not.toHaveBeenCalled();
  });

  it("BAD_REQUESTs when none of the task ids exist", async () => {
    member("engineer");
    anyDb.dailyProgram.findUnique.mockResolvedValue(program());
    anyDb.dailyProgramTask.findMany.mockResolvedValue([]);
    const caller = createCaller(dailyProgramRouter, USER);
    await expectTRPCError(
      caller.addBacklogToProgram({ projectId: "p-1", programId: "prog-1", taskIds: ["nope"] }),
      "BAD_REQUEST",
    );
  });
});

// ─── resyncProgram ─────────────────────────────────────────────────────────
describe("dailyProgram.resyncProgram", () => {
  it("removes stale + orphaned tasks, updates existing ones, and creates tasks from new approved RFI items", async () => {
    member("engineer");
    anyDb.dailyProgram.findUnique.mockResolvedValue(
      program({
        tasks: [
          task({ id: "t-live", rfiId: "rfi-1" }), // still approved → updated
          task({ id: "t-stale", rfiId: "rfi-dead", taskName: "Stale" }), // RFI no longer approved → removed
          task({ id: "t-orphan", rfiId: null, boqItemId: "b-1", ganttTaskId: null, carriedOverFromId: null, taskName: "Orphan" }), // orphaned → removed
        ],
      }),
    );
    anyDb.rfi.findMany.mockResolvedValue([
      {
        id: "rfi-1",
        number: "RFI-001",
        subject: "Footing",
        location: "A1",
        ganttTaskId: "g-1",
        subcontractorId: null,
        items: [],
      },
      {
        id: "rfi-2",
        number: "RFI-002",
        subject: "Wall",
        location: "B2",
        ganttTaskId: null,
        subcontractorId: null,
        items: [{ id: "item-1", boqItemId: "b-2", boqCode: "1.2", boqDesc: "M20 wall", quantity: 10, unit: "cum", paymentType: "payable" }],
      },
    ]);
    const caller = createCaller(dailyProgramRouter, USER);
    const res = await caller.resyncProgram({ programId: "prog-1", projectId: "p-1" });

    expect(res.removed).toEqual(["Stale", "Orphan"]);
    expect(res.updated).toEqual(["RFI-001"]);
    expect(res.created).toEqual(["RFI-002"]);
    expect(anyDb.dailyProgramTask.delete).toHaveBeenCalledTimes(2);
    expect(anyDb.dailyProgramTask.update.mock.calls[0][0]).toEqual(
      expect.objectContaining({ where: { id: "t-live" }, data: expect.objectContaining({ taskName: "Footing", location: "A1" }) }),
    );
    const created = anyDb.dailyProgramTask.createMany.mock.calls[0][0].data[0];
    expect(created).toEqual(
      expect.objectContaining({ programId: "prog-1", rfiId: "rfi-2", plannedQty: 10, taskName: "Wall - M20 wall", boqCode: "1.2" }),
    );
  });

  it("FORBIDDENs a program from another project (IDOR guard)", async () => {
    member("engineer");
    anyDb.dailyProgram.findUnique.mockResolvedValue(program({ projectId: "p-other" }));
    const caller = createCaller(dailyProgramRouter, USER);
    await expectTRPCError(
      caller.resyncProgram({ programId: "prog-1", projectId: "p-1" }),
      "FORBIDDEN",
    );
    expect(anyDb.rfi.findMany).not.toHaveBeenCalled();
  });
});

// ─── cancellation workflow ─────────────────────────────────────────────────
describe("dailyProgram cancellation workflow", () => {
  it("requestCancellation marks the task pending with requester + reason", async () => {
    member("engineer");
    anyDb.dailyProgramTask.findUnique.mockResolvedValue(
      task({ cancellationStatus: "none" }),
    );
    const caller = createCaller(dailyProgramRouter, USER);
    await caller.requestCancellation({ taskId: "task-1", projectId: "p-1", reason: "Rain" });
    expect(anyDb.dailyProgramTask.update.mock.calls[0][0].data).toEqual(
      expect.objectContaining({
        cancellationStatus: "pending",
        cancellationRequestedBy: "user-1",
        cancellationReason: "Rain",
        cancellationRequestedAt: expect.any(Date),
      }),
    );
  });

  it("requestCancellation rejects a duplicate pending request", async () => {
    member("engineer");
    anyDb.dailyProgramTask.findUnique.mockResolvedValue(task({ cancellationStatus: "pending" }));
    const caller = createCaller(dailyProgramRouter, USER);
    await expectTRPCError(
      caller.requestCancellation({ taskId: "task-1", projectId: "p-1" }),
      "BAD_REQUEST",
    );
    expect(anyDb.dailyProgramTask.update).not.toHaveBeenCalled();
  });

  it("reviewCancellation is PM/coordinator-only: an engineer is FORBIDDEN", async () => {
    member("engineer");
    const caller = createCaller(dailyProgramRouter, USER);
    await expectTRPCError(
      caller.reviewCancellation({ taskId: "task-1", projectId: "p-1", approved: true }),
      "FORBIDDEN",
    );
    expect(anyDb.dailyProgramTask.update).not.toHaveBeenCalled();
  });

  it("reviewCancellation approve → executionStatus cancelled + requester notified", async () => {
    member("project_manager");
    anyDb.dailyProgramTask.findUnique.mockResolvedValue(
      task({ cancellationStatus: "pending", cancellationRequestedBy: "someone-else" }),
    );
    const caller = createCaller(dailyProgramRouter, USER);
    await caller.reviewCancellation({
      taskId: "task-1",
      projectId: "p-1",
      approved: true,
      response: "OK",
    });
    expect(anyDb.dailyProgramTask.update.mock.calls[0][0].data).toEqual(
      expect.objectContaining({ cancellationStatus: "approved", executionStatus: "cancelled", cancellationApprovedBy: "user-1" }),
    );
    expect(anyDb.notification.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ userId: "someone-else", type: "task_cancellation_approved" }),
      }),
    );
  });

  it("reviewCancellation reject → status rejected, executionStatus untouched, no self-notification", async () => {
    member("coordinator");
    anyDb.dailyProgramTask.findUnique.mockResolvedValue(
      task({ cancellationStatus: "pending", cancellationRequestedBy: "user-1" }), // requester == reviewer
    );
    const caller = createCaller(dailyProgramRouter, USER);
    await caller.reviewCancellation({ taskId: "task-1", projectId: "p-1", approved: false });
    const data = anyDb.dailyProgramTask.update.mock.calls[0][0].data;
    expect(data.cancellationStatus).toBe("rejected");
    expect(data.executionStatus).toBeUndefined();
    expect(anyDb.notification.create).not.toHaveBeenCalled();
  });

  it("reviewCancellation requires a pending request", async () => {
    member("project_manager");
    anyDb.dailyProgramTask.findUnique.mockResolvedValue(task({ cancellationStatus: "none" }));
    const caller = createCaller(dailyProgramRouter, USER);
    await expectTRPCError(
      caller.reviewCancellation({ taskId: "task-1", projectId: "p-1", approved: true }),
      "BAD_REQUEST",
    );
  });

  it("requestCancellation FORBIDDENs a foreign task (IDOR guard)", async () => {
    member("engineer");
    anyDb.dailyProgramTask.findUnique.mockResolvedValue(
      task({ program: program({ projectId: "p-other" }) }),
    );
    const caller = createCaller(dailyProgramRouter, USER);
    await expectTRPCError(
      caller.requestCancellation({ taskId: "task-1", projectId: "p-1" }),
      "FORBIDDEN",
    );
  });

  it("listPendingCancellations is PM/coordinator-only and scoped to pending tasks", async () => {
    member("project_manager");
    anyDb.dailyProgramTask.findMany.mockResolvedValue([]);
    const caller = createCaller(dailyProgramRouter, USER);
    await caller.listPendingCancellations({ projectId: "p-1" });
    expect(anyDb.dailyProgramTask.findMany.mock.calls[0][0].where).toEqual({
      program: { projectId: "p-1" },
      cancellationStatus: "pending",
    });

    member("engineer");
    await expectTRPCError(
      createCaller(dailyProgramRouter, USER).listPendingCancellations({ projectId: "p-1" }),
      "FORBIDDEN",
    );
  });
});

// ─── list queries ──────────────────────────────────────────────────────────
describe("dailyProgram list queries", () => {
  it("listPrograms scopes to the project, newest first", async () => {
    member("engineer");
    anyDb.dailyProgram.findMany.mockResolvedValue([]);
    const caller = createCaller(dailyProgramRouter, USER);
    await caller.listPrograms({ projectId: "p-1" });
    const arg = anyDb.dailyProgram.findMany.mock.calls[0][0];
    expect(arg.where).toEqual({ projectId: "p-1" });
    expect(arg.orderBy).toEqual({ programDate: "desc" });
  });

  it("listBacklog returns past-program, unfinished, not-yet-carried tasks", async () => {
    member("engineer");
    anyDb.dailyProgramTask.findMany.mockResolvedValue([]);
    const caller = createCaller(dailyProgramRouter, USER);
    await caller.listBacklog({ projectId: "p-1" });
    const where = anyDb.dailyProgramTask.findMany.mock.calls[0][0].where;
    expect(where.program.projectId).toBe("p-1");
    expect(where.executionStatus).toEqual({ in: ["partially_completed", "uncompleted", "postponed"] });
    expect(where.carriedOverTo).toEqual({ none: {} });
    expect(where.program.programDate.lt).toBeInstanceOf(Date);
  });

  it("listBacklogTasks returns postponed tasks not yet carried over", async () => {
    member("engineer");
    anyDb.dailyProgramTask.findMany.mockResolvedValue([]);
    const caller = createCaller(dailyProgramRouter, USER);
    await caller.listBacklogTasks({ projectId: "p-1" });
    const where = anyDb.dailyProgramTask.findMany.mock.calls[0][0].where;
    expect(where.program).toEqual({ projectId: "p-1" });
    expect(where.executionStatus).toBe("postponed");
    expect(where.carriedOverTo).toEqual({ none: {} });
  });

  it("listAvailableRfis returns approved RFIs with items, ingredients filtered by the default library", async () => {
    member("engineer");
    anyDb.analysisLibrary.findMany.mockResolvedValue([
      { id: "lib-1", name: "Client's Estimate", purpose: "client_estimate", isDefault: true },
    ]);
    anyDb.rfi.findMany.mockResolvedValue([]);
    const caller = createCaller(dailyProgramRouter, USER);
    await caller.listAvailableRfis({ projectId: "p-1" });

    expect(anyDb.rfi.findMany.mock.calls[0][0].where).toEqual({
      projectId: "p-1",
      status: "approved",
      items: { some: {} },
    });
    expect(anyDb.rfi.findMany.mock.calls[0][0].orderBy).toEqual({ number: "asc" });
    const ingredientWhere = anyDb.rfi.findMany.mock.calls[0][0].select.items.include.boqItem.select.ingredients.where;
    expect(ingredientWhere).toEqual({ rateAnalysis: { libraryId: "lib-1" } });
  });

  it("listAvailableRfis falls back to client_estimate purpose when the project has no library", async () => {
    member("engineer");
    anyDb.analysisLibrary.findMany.mockResolvedValue([]);
    anyDb.rfi.findMany.mockResolvedValue([]);
    const caller = createCaller(dailyProgramRouter, USER);
    await caller.listAvailableRfis({ projectId: "p-1" });
    const ingredientWhere = anyDb.rfi.findMany.mock.calls[0][0].select.items.include.boqItem.select.ingredients.where;
    expect(ingredientWhere).toEqual({ rateAnalysis: { library: { purpose: "client_estimate" } } });
  });
});
