/**
 * Router-layer tests for the Gantt routers (gantt-tasks create +
 * gantt-dependencies addDependency / removeDependency / setDependencies).
 *
 * Pins:
 *   - create: version IDOR guard (version must belong to the authorized
 *     project), non-DRAFT versions are immutable, read-only roles can't
 *     create, sortOrder auto-increments from the sibling max
 *   - addDependency: cross-project predecessor rejected, self-dependency
 *     rejected, circular dependencies rejected (real detectCycle), the
 *     dependency is upserted and the CPM cascade runs
 *   - Version editability: published/locked versions FORBIDDEN everywhere
 *   - removeDependency: NOT_FOUND when no such dependency exists
 *   - setDependencies: missing predecessors fail loud
 *
 * Mocks: the CPM recalculation is stubbed (pure scheduling engine has its
 * own unit tests); detectCycle stays REAL because cycle rejection is the
 * invariant under test.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { buildUser, createCaller, expectTRPCError } from "./test-utils";

vi.mock("@/lib/db", async () => {
  const { buildDbMock } = await import("./test-utils");
  const db = buildDbMock();
  return { db, getFreshDb: () => db };
});

vi.mock("@/server/utils/gantt-cpm-engine", async (importOriginal) => {
  const actual = await importOriginal<any>();
  return {
    ...actual,
    recalculateProjectSchedule: vi.fn(async () => ({ updatedCount: 0 })),
  };
});

vi.mock("@/lib/wbs", () => ({
  recalculateWbsCodes: vi.fn(async () => ({})),
}));

vi.mock("@/lib/default-library", () => ({
  getDefaultLibraryId: vi.fn(async () => null),
}));

import { db } from "@/lib/db";
import { ganttTasksRouter } from "../gantt-tasks";
import { ganttDependenciesRouter } from "../gantt-dependencies";

const anyDb = db as any;
const USER = buildUser();

function member(role: string | null) {
  anyDb.projectMember.findUnique.mockResolvedValue(role ? { role } : null);
}

function task(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    projectId: "p-1",
    versionId: "v-1",
    name: `Task ${id}`,
    duration: 5,
    ...overrides,
  };
}

/** Route ganttTask.findUnique by id so task and predecessor lookups differ. */
function tasksById(map: Record<string, any>) {
  anyDb.ganttTask.findUnique.mockImplementation(async ({ where }: any) =>
    map[where.id] ?? null,
  );
}

beforeEach(() => {
  vi.resetAllMocks();
});

// ─── ganttTasks.create ──────────────────────────────────────────────────────
describe("ganttTasks.create", () => {
  const createInput = {
    projectId: "p-1",
    name: "Excavation",
    startDate: "2026-09-01",
    endDate: "2026-09-10",
  };

  it("NOT_FOUNDs a versionId that belongs to another project (IDOR guard)", async () => {
    member("engineer");
    anyDb.ganttVersion.findFirst.mockResolvedValue(null);
    const caller = createCaller(ganttTasksRouter, USER);
    await expectTRPCError(
      caller.create({ ...createInput, versionId: "foreign-v" }),
      "NOT_FOUND",
    );
    expect(anyDb.ganttTask.create).not.toHaveBeenCalled();
  });

  it("FORBIDDENs adding tasks to a published version", async () => {
    member("engineer");
    anyDb.ganttVersion.findFirst.mockResolvedValue({ id: "v-1", status: "PUBLISHED" });
    const caller = createCaller(ganttTasksRouter, USER);
    await expectTRPCError(
      caller.create({ ...createInput, versionId: "v-1" }),
      "FORBIDDEN",
    );
    expect(anyDb.ganttTask.create).not.toHaveBeenCalled();
  });

  it("FORBIDDENs read-only roles", async () => {
    member("client");
    const caller = createCaller(ganttTasksRouter, USER);
    await expectTRPCError(caller.create(createInput), "FORBIDDEN");
  });

  it("auto-assigns sortOrder = sibling max + 1", async () => {
    member("engineer");
    anyDb.ganttVersion.findFirst.mockResolvedValue(null); // no active version
    anyDb.ganttTask.aggregate.mockResolvedValue({ _max: { sortOrder: 5 } });
    anyDb.ganttTask.create.mockImplementation(async ({ data }: any) => ({ id: "t-1", ...data }));
    anyDb.ganttTask.findUnique.mockResolvedValue(task("t-1"));

    const caller = createCaller(ganttTasksRouter, USER);
    await caller.create(createInput);
    expect(anyDb.ganttTask.create.mock.calls[0][0].data.sortOrder).toBe(6);
  });
});

// ─── ganttDependencies.addDependency ────────────────────────────────────────
describe("ganttDependencies.addDependency", () => {
  function setup(taskId = "t-1", predId = "t-2") {
    tasksById({ [taskId]: task(taskId), [predId]: task(predId) });
    anyDb.ganttVersion.findUnique.mockResolvedValue({ status: "DRAFT" });
  }

  it("NOT_FOUNDs an unknown successor task", async () => {
    member("engineer");
    tasksById({});
    const caller = createCaller(ganttDependenciesRouter, USER);
    await expectTRPCError(
      caller.addDependency({ taskId: "ghost", predecessorId: "t-2" }),
      "NOT_FOUND",
    );
  });

  it("rejects a predecessor from a different project", async () => {
    member("engineer");
    tasksById({ "t-1": task("t-1"), "t-2": task("t-2", { projectId: "p-2" }) });
    anyDb.ganttVersion.findUnique.mockResolvedValue({ status: "DRAFT" });
    const caller = createCaller(ganttDependenciesRouter, USER);
    await expectTRPCError(
      caller.addDependency({ taskId: "t-1", predecessorId: "t-2" }),
      "BAD_REQUEST",
    );
    expect(anyDb.taskDependency.upsert).not.toHaveBeenCalled();
  });

  it("rejects a task depending on itself", async () => {
    member("engineer");
    setup("t-1", "t-1");
    const caller = createCaller(ganttDependenciesRouter, USER);
    await expectTRPCError(
      caller.addDependency({ taskId: "t-1", predecessorId: "t-1" }),
      "BAD_REQUEST",
    );
  });

  it("rejects a link that closes a circular loop", async () => {
    member("engineer");
    setup("t-1", "t-2");
    // Existing: t-1 → t-2. Adding t-2 as a predecessor of t-1 closes the loop.
    anyDb.taskDependency.findMany.mockResolvedValue([
      { predecessorId: "t-1", successorId: "t-2" },
    ]);
    const caller = createCaller(ganttDependenciesRouter, USER);
    const err = await expectTRPCError(
      caller.addDependency({ taskId: "t-1", predecessorId: "t-2" }),
      "BAD_REQUEST",
    );
    expect(err.message).toContain("circular");
    expect(anyDb.taskDependency.upsert).not.toHaveBeenCalled();
  });

  it("FORBIDDENs edits to a published version", async () => {
    member("engineer");
    tasksById({ "t-1": task("t-1"), "t-2": task("t-2") });
    anyDb.ganttVersion.findUnique.mockResolvedValue({ status: "PUBLISHED" });
    const caller = createCaller(ganttDependenciesRouter, USER);
    await expectTRPCError(
      caller.addDependency({ taskId: "t-1", predecessorId: "t-2" }),
      "FORBIDDEN",
    );
  });

  it("FORBIDDENs read-only roles on draft versions", async () => {
    member("client");
    setup();
    const caller = createCaller(ganttDependenciesRouter, USER);
    await expectTRPCError(
      caller.addDependency({ taskId: "t-1", predecessorId: "t-2" }),
      "FORBIDDEN",
    );
  });

  it("upserts the dependency on the happy path", async () => {
    member("engineer");
    setup();
    anyDb.taskDependency.findMany.mockResolvedValue([]);
    const caller = createCaller(ganttDependenciesRouter, USER);
    const res = await caller.addDependency({
      taskId: "t-1",
      predecessorId: "t-2",
      type: "FS",
      offset: 2,
    });
    expect(res.ok).toBe(true);
    expect(anyDb.taskDependency.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          predecessorId_successorId: { predecessorId: "t-2", successorId: "t-1" },
        },
        create: { predecessorId: "t-2", successorId: "t-1", type: "FS", offset: 2 },
      }),
    );
  });
});

// ─── ganttDependencies.removeDependency ─────────────────────────────────────
describe("ganttDependencies.removeDependency", () => {
  it("NOT_FOUNDs when no such dependency exists", async () => {
    member("engineer");
    tasksById({ "t-1": task("t-1") });
    anyDb.ganttVersion.findUnique.mockResolvedValue({ status: "DRAFT" });
    anyDb.taskDependency.deleteMany.mockResolvedValue({ count: 0 });
    const caller = createCaller(ganttDependenciesRouter, USER);
    await expectTRPCError(
      caller.removeDependency({ taskId: "t-1", predecessorId: "t-2" }),
      "NOT_FOUND",
    );
  });

  it("removes the dependency and recalculates", async () => {
    member("engineer");
    tasksById({ "t-1": task("t-1") });
    anyDb.ganttVersion.findUnique.mockResolvedValue({ status: "DRAFT" });
    anyDb.taskDependency.deleteMany.mockResolvedValue({ count: 1 });
    const caller = createCaller(ganttDependenciesRouter, USER);
    const res = await caller.removeDependency({ taskId: "t-1", predecessorId: "t-2" });
    expect(res.ok).toBe(true);
    expect(anyDb.taskDependency.deleteMany).toHaveBeenCalledWith({
      where: { successorId: "t-1", predecessorId: "t-2" },
    });
  });
});

// ─── ganttDependencies.setDependencies ──────────────────────────────────────
describe("ganttDependencies.setDependencies", () => {
  it("fails loud when a predecessor does not exist in the project", async () => {
    member("engineer");
    tasksById({ "t-1": task("t-1") });
    anyDb.ganttVersion.findUnique.mockResolvedValue({ status: "DRAFT" });
    anyDb.ganttTask.findMany.mockResolvedValue([]); // predecessor lookup: none found
    const caller = createCaller(ganttDependenciesRouter, USER);
    await expectTRPCError(
      caller.setDependencies({
        taskId: "t-1",
        dependencies: [{ predecessorId: "ghost", type: "FS", offset: 0 }],
      }),
      "BAD_REQUEST",
    );
    expect(anyDb.taskDependency.deleteMany).not.toHaveBeenCalled();
  });

  it("rejects a replacement set that closes a loop", async () => {
    member("engineer");
    tasksById({ "t-1": task("t-1"), "t-2": task("t-2") });
    anyDb.ganttVersion.findUnique.mockResolvedValue({ status: "DRAFT" });
    // predecessors exist…
    anyDb.ganttTask.findMany.mockResolvedValue([
      { id: "t-2", name: "Task t-2", startDate: new Date(), endDate: new Date() },
    ]);
    // …but t-2 already depends on t-1: making t-1 depend on t-2 closes the loop
    anyDb.taskDependency.findMany.mockResolvedValue([
      { predecessorId: "t-1", successorId: "t-2" },
    ]);
    const caller = createCaller(ganttDependenciesRouter, USER);
    await expectTRPCError(
      caller.setDependencies({
        taskId: "t-1",
        dependencies: [{ predecessorId: "t-2", type: "FS", offset: 0 }],
      }),
      "BAD_REQUEST",
    );
  });
});
