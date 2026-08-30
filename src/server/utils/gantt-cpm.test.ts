import { describe, it, expect } from "vitest";
import { detectCycle, computeCpmSchedule } from "./gantt-cpm-engine";

describe("Gantt CPM Engine & Cycle Detection", () => {
  describe("detectCycle", () => {
    it("should detect direct self-dependency", () => {
      const result = detectCycle([], [{ predecessorId: "taskA", successorId: "taskA" }]);
      expect(result.hasCycle).toBe(true);
    });

    it("should detect 2-node cycle (A -> B -> A)", () => {
      const existing = [{ predecessorId: "taskA", successorId: "taskB" }];
      const result = detectCycle(existing, [{ predecessorId: "taskB", successorId: "taskA" }]);
      expect(result.hasCycle).toBe(true);
    });

    it("should detect 4-node cycle (A -> B -> C -> D -> A)", () => {
      const existing = [
        { predecessorId: "A", successorId: "B" },
        { predecessorId: "B", successorId: "C" },
        { predecessorId: "C", successorId: "D" },
      ];
      const result = detectCycle(existing, [{ predecessorId: "D", successorId: "A" }]);
      expect(result.hasCycle).toBe(true);
    });

    it("should allow diamond-shaped DAG without cycle (A -> B, A -> C, B -> D, C -> D)", () => {
      const existing = [
        { predecessorId: "A", successorId: "B" },
        { predecessorId: "A", successorId: "C" },
        { predecessorId: "B", successorId: "D" },
      ];
      const result = detectCycle(existing, [{ predecessorId: "C", successorId: "D" }]);
      expect(result.hasCycle).toBe(false);
    });

    it("should correctly handle replaced successor dependencies", () => {
      // Replaces D's predecessors without forming cycle
      const existing = [
        { predecessorId: "A", successorId: "B" },
        { predecessorId: "B", successorId: "D" }, // old edge
      ];
      // Replace D's predecessor to A instead of B
      const result = detectCycle(
        existing,
        [{ predecessorId: "A", successorId: "D" }],
        "D" // exclude D's old edges
      );
      expect(result.hasCycle).toBe(false);
    });
  });

  describe("computeCpmSchedule & Downstream Date Cascading", () => {
    it("should cascade dates forward through a chain of Finish-to-Start (FS) tasks", () => {
      const baseDate = new Date("2026-09-01T00:00:00Z");

      const tasks = [
        {
          id: "taskA",
          name: "Earthwork",
          startDate: baseDate,
          endDate: new Date(baseDate.getTime() + 5 * 24 * 60 * 60 * 1000), // 5 days (Sept 6)
          duration: 5,
        },
        {
          id: "taskB",
          name: "PCC",
          startDate: new Date("2026-08-01T00:00:00Z"), // stale start date
          endDate: new Date("2026-08-04T00:00:00Z"),
          duration: 3,
        },
        {
          id: "taskC",
          name: "RCC Slab",
          startDate: new Date("2026-08-01T00:00:00Z"), // stale start date
          endDate: new Date("2026-08-08T00:00:00Z"),
          duration: 7,
        },
      ];

      const dependencies = [
        { predecessorId: "taskA", successorId: "taskB", type: "FS" as const, offset: 0 },
        { predecessorId: "taskB", successorId: "taskC", type: "FS" as const, offset: 1 }, // 1 day cure lag
      ];

      const { newDates, changedTasks, cycleDetected } = computeCpmSchedule(tasks, dependencies);

      expect(cycleDetected).toBe(false);

      // Task A should remain at Sept 1 - Sept 6
      const a = newDates.get("taskA")!;
      expect(a.start.toISOString()).toBe(baseDate.toISOString());

      // Task B should start when Task A finishes: Sept 6
      const b = newDates.get("taskB")!;
      expect(b.start.toISOString()).toBe(new Date("2026-09-06T00:00:00Z").toISOString());
      expect(b.end.toISOString()).toBe(new Date("2026-09-09T00:00:00Z").toISOString()); // 3 days

      // Task C should start after Task B finishes (Sept 9) + 1 day offset = Sept 10
      const c = newDates.get("taskC")!;
      expect(c.start.toISOString()).toBe(new Date("2026-09-10T00:00:00Z").toISOString());
      expect(c.end.toISOString()).toBe(new Date("2026-09-17T00:00:00Z").toISOString()); // 7 days

      // Both B and C should be in changedTasks
      expect(changedTasks.length).toBe(2);
      expect(changedTasks.map((t) => t.id)).toEqual(["taskB", "taskC"]);
    });

    it("should handle Start-to-Start (SS) dependency with lag", () => {
      const baseDate = new Date("2026-09-01T00:00:00Z");

      const tasks = [
        {
          id: "A",
          name: "Excavation",
          startDate: baseDate,
          endDate: new Date(baseDate.getTime() + 10 * 24 * 60 * 60 * 1000),
          duration: 10,
        },
        {
          id: "B",
          name: "Dewatering Pump",
          startDate: new Date("2026-08-01T00:00:00Z"),
          endDate: new Date("2026-08-06T00:00:00Z"),
          duration: 5,
        },
      ];

      // B starts 2 days after A starts
      const dependencies = [
        { predecessorId: "A", successorId: "B", type: "SS" as const, offset: 2 },
      ];

      const { newDates } = computeCpmSchedule(tasks, dependencies);
      const b = newDates.get("B")!;
      expect(b.start.toISOString()).toBe(new Date("2026-09-03T00:00:00Z").toISOString());
    });

    it("should identify cyclic task IDs when schedule contains a cycle", () => {
      const tasks = [
        { id: "A", name: "Task A", startDate: new Date(), endDate: new Date(), duration: 2 },
        { id: "B", name: "Task B", startDate: new Date(), endDate: new Date(), duration: 2 },
      ];

      const dependencies = [
        { predecessorId: "A", successorId: "B", type: "FS" as const, offset: 0 },
        { predecessorId: "B", successorId: "A", type: "FS" as const, offset: 0 },
      ];

      const { cycleDetected, cyclicTaskIds } = computeCpmSchedule(tasks, dependencies);
      expect(cycleDetected).toBe(true);
      expect(cyclicTaskIds).toContain("A");
      expect(cyclicTaskIds).toContain("B");
    });
  });

  describe("Calendar-Aware CPM Cascade (Nepal weekends + holidays)", () => {
    /**
     * Calendar fixture notes (verified against nepal-calendar.ts):
     *  - 2026-09-04 (Fri)  → working day
     *  - 2026-09-05 (Sat)  → Nepal weekend
     *  - 2026-09-06 (Sun)  → working day
     *  - 2026-09-07 (Mon)  → working day
     *  - 2026-09-08 (Tue)  → working day
     *  - 2026-09-09 (Wed)  → working day
     *  - Dashain 2026: Oct 11-20 are all festival holidays.
     *  - 2026-10-21 (Wed)  → first working day after Dashain
     *  - 2026-10-26 (Mon)  → working day
     *
     * Conventions used by computeCpmSchedule (calendar mode):
     *  - `addWorkingDays(start, N)` returns the first working day *after* N
     *    working days have elapsed. So a task with start=Mon, duration=4
     *    ends on the next working day after Mon+3 working days = Fri's
     *    successor = next Mon (if Sat/Sun weekend, here only Sat is weekend).
     *  - Task end dates are always working days in calendar mode (when the
     *    task has at least one dependency and does not ignore the calendar).
     *  - Tasks with NO dependencies preserve their input start/end verbatim
     *    (matching legacy behavior — user-authored dates are sacred).
     *  - ignoreResourceCalendar=true forces 24h arithmetic for that task.
     */
    const DAY = 24 * 60 * 60 * 1000;

    it("snaps successor forward when predecessor ends on a Saturday", () => {
      // Task A: no deps, user-supplied end on Saturday Sept 5 2026.
      //   → preserved as-is (no-dep branch).
      // Task B: FS dep on A, offset 0, duration 2.
      //   candidate = a.end (Sept 5 Sat) → snap forward → Sept 6 (Sun).
      //   b.end = addWorkingDays(Sept 6, 2) = Sept 8 (Tue).
      const tasks = [
        {
          id: "A",
          name: "Pre",
          startDate: new Date("2026-08-31T00:00:00Z"),
          endDate: new Date("2026-09-05T00:00:00Z"), // Saturday
          duration: 5,
        },
        {
          id: "B",
          name: "Post",
          startDate: new Date("2026-08-01T00:00:00Z"),
          endDate: new Date("2026-08-02T00:00:00Z"),
          duration: 2,
        },
      ];

      const deps = [
        { predecessorId: "A", successorId: "B", type: "FS" as const, offset: 0 },
      ];

      const { newDates, changedTasks } = computeCpmSchedule(tasks, deps, { useCalendar: true });

      const a = newDates.get("A")!;
      // A has no deps → preserved as-is.
      expect(a.start.toISOString()).toBe(new Date("2026-08-31T00:00:00Z").toISOString());
      expect(a.end.toISOString()).toBe(new Date("2026-09-05T00:00:00Z").toISOString());

      const b = newDates.get("B")!;
      expect(b.start.toISOString()).toBe(new Date("2026-09-06T00:00:00Z").toISOString());
      expect(b.end.toISOString()).toBe(new Date("2026-09-08T00:00:00Z").toISOString());

      // Only B should be in changedTasks (A was preserved).
      expect(changedTasks.map((t) => t.id)).toEqual(["B"]);
    });

    it("FS with positive lag skips Saturday in the lag", () => {
      // Task A: user sets end=Sept 4 (Fri). Task B: FS+1 lag.
      //   candidate = addDaysFn(Sept 4, 1, false) = addWorkingDays(Sept 4, 1)
      //            = Sept 5 (Sat, skip) → Sept 6 (Sun).
      //   b.start = Sept 6 (Sun).
      const tasks = [
        {
          id: "A",
          name: "Pre",
          startDate: new Date("2026-09-01T00:00:00Z"),
          endDate: new Date("2026-09-04T00:00:00Z"), // Fri
          duration: 3,
        },
        {
          id: "B",
          name: "Post",
          startDate: new Date("2026-08-01T00:00:00Z"),
          endDate: new Date("2026-08-02T00:00:00Z"),
          duration: 2,
        },
      ];
      const deps = [
        { predecessorId: "A", successorId: "B", type: "FS" as const, offset: 1 },
      ];
      const { newDates } = computeCpmSchedule(tasks, deps, { useCalendar: true });
      const b = newDates.get("B")!;
      expect(b.start.toISOString()).toBe(new Date("2026-09-06T00:00:00Z").toISOString());
    });

    it("projects task end across the entire Dashain festival block", () => {
      // Task A: FS dep on a base task with end=Sept 28 (Mon).
      //   candidate = Sept 28, snap (Mon, working) → Sept 28.
      //   b.end = addWorkingDays(Sept 28, 15) = the 15th working day *after*
      //   Sept 28. Counting: Sept 29,30,Oct 1,2 (4); Oct 4-9 (6, total 10);
      //   Oct 10 (Sat skip); Oct 11-20 (Dashain skip); Oct 21,22,23 (3, total 13);
      //   Oct 24 (Sat skip); Oct 25 (Sun, working, total 14);
      //   Oct 26 (Mon, working, total 15) → end = Oct 26.
      const tasks = [
        {
          id: "BASE",
          name: "Base",
          startDate: new Date("2026-09-25T00:00:00Z"),
          endDate: new Date("2026-09-28T00:00:00Z"),
          duration: 3,
        },
        {
          id: "A",
          name: "Long Task Across Dashain",
          startDate: new Date("2026-09-20T00:00:00Z"),
          endDate: new Date("2026-10-15T00:00:00Z"),
          duration: 15,
        },
      ];
      const deps = [
        { predecessorId: "BASE", successorId: "A", type: "FS" as const, offset: 0 },
      ];
      const { newDates } = computeCpmSchedule(tasks, deps, { useCalendar: true });
      const a = newDates.get("A")!;
      expect(a.start.toISOString()).toBe(new Date("2026-09-28T00:00:00Z").toISOString());
      expect(a.end.toISOString()).toBe(new Date("2026-10-26T00:00:00Z").toISOString());
    });

    it("respects ignoreResourceCalendar: true (task works through weekend)", () => {
      // Task B has ignoreResourceCalendar=true. Even in calendar mode it
      // uses raw 24h arithmetic: predecessor ends Sept 4 (Fri, user-set),
      // offset 0 → candidate = Sept 4 (no shift, no snap).
      //   b.start = Sept 4 (Fri).
      //   b.end = Sept 4 + 2*DAY = Sept 6 (Sun, NOT a working day — by design,
      //           because ignoreResourceCalendar means we use raw 24h math).
      const tasks = [
        {
          id: "A",
          name: "Pre",
          startDate: new Date("2026-09-01T00:00:00Z"),
          endDate: new Date("2026-09-04T00:00:00Z"), // Fri
          duration: 3,
        },
        {
          id: "B",
          name: "Post (24h calendar)",
          startDate: new Date("2026-08-01T00:00:00Z"),
          endDate: new Date("2026-08-02T00:00:00Z"),
          duration: 2,
          ignoreResourceCalendar: true,
        },
      ];
      const deps = [
        { predecessorId: "A", successorId: "B", type: "FS" as const, offset: 0 },
      ];
      const { newDates } = computeCpmSchedule(tasks, deps, { useCalendar: true });
      const b = newDates.get("B")!;
      expect(b.start.toISOString()).toBe(new Date("2026-09-04T00:00:00Z").toISOString());
      expect(b.end.toISOString()).toBe(new Date("2026-09-06T00:00:00Z").toISOString());
    });

    it("legacy mode (useCalendar=false) still produces raw 24h cascade", () => {
      // Sanity check: explicit useCalendar=false must reproduce the
      // original behavior even though the implementation routes through
      // the same helpers.
      const baseDate = new Date("2026-09-01T00:00:00Z");
      const tasks = [
        {
          id: "A",
          name: "Earthwork",
          startDate: baseDate,
          endDate: new Date(baseDate.getTime() + 5 * DAY), // Sept 6
          duration: 5,
        },
        {
          id: "B",
          name: "PCC",
          startDate: new Date("2026-08-01T00:00:00Z"),
          endDate: new Date("2026-08-04T00:00:00Z"),
          duration: 3,
        },
      ];
      const deps = [
        { predecessorId: "A", successorId: "B", type: "FS" as const, offset: 0 },
      ];
      const { newDates } = computeCpmSchedule(tasks, deps, { useCalendar: false });
      const b = newDates.get("B")!;
      expect(b.start.toISOString()).toBe(new Date("2026-09-06T00:00:00Z").toISOString());
      expect(b.end.toISOString()).toBe(new Date("2026-09-09T00:00:00Z").toISOString());
    });
  });

  describe("Critical Path & Float Map with Lead/Lag Offsets", () => {
    it("correctly calculates critical path and float with FS lag", async () => {
      const { computeCriticalPath, computeFloatMap } = await import("@/app/(app)/projects/[id]/gantt/utils");

      const base = new Date("2026-09-01T00:00:00Z");
      const tasks = [
        {
          id: "A",
          name: "Task A",
          startDate: base.toISOString(),
          endDate: new Date(base.getTime() + 4 * 24 * 60 * 60 * 1000).toISOString(), // 5 days
          duration: 5,
          progress: 0,
          predecessors: [],
          sortOrder: 1,
        },
        {
          id: "B",
          name: "Task B (Parallel non-critical)",
          startDate: base.toISOString(),
          endDate: new Date(base.getTime() + 1 * 24 * 60 * 60 * 1000).toISOString(), // 2 days
          duration: 2,
          progress: 0,
          predecessors: [],
          sortOrder: 2,
        },
        {
          id: "C",
          name: "Task C",
          startDate: new Date(base.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString(), // starts after A + 2 days lag
          endDate: new Date(base.getTime() + 10 * 24 * 60 * 60 * 1000).toISOString(),
          duration: 4,
          progress: 0,
          predecessors: [
            { id: "p1", predecessorId: "A", successorId: "C", type: "FS", offset: 2 },
            { id: "p2", predecessorId: "B", successorId: "C", type: "FS", offset: 0 },
          ],
          sortOrder: 3,
        },
      ];

      const critical = computeCriticalPath(tasks as any);
      const floatMap = computeFloatMap(tasks as any);

      // Task A and Task C are on the critical path
      expect(critical.has("A")).toBe(true);
      expect(critical.has("C")).toBe(true);
      // Task B has slack/float because it only takes 2 days while A + lag takes 7 days
      expect(critical.has("B")).toBe(false);
      expect(floatMap.get("B")).toBeGreaterThanOrEqual(5);
    });
  });

  describe("MS Project XML Lead Offset", () => {
    it("preserves negative offset (lead) in MS Project XML LinkLag", async () => {
      const { generateMSPXML } = await import("./msp-export");

      const base = new Date("2026-09-01T00:00:00Z");
      const tasks = [
        {
          id: "t1",
          name: "Task 1",
          code: "1.0",
          startDate: base,
          endDate: new Date(base.getTime() + 5 * 24 * 60 * 60 * 1000),
          duration: 5,
          progress: 0,
          parentId: null,
          isMilestone: false,
          sortOrder: 1,
          plannedCost: 1000,
          dependencies: [],
        },
        {
          id: "t2",
          name: "Task 2 (Lead 2 days)",
          code: "2.0",
          startDate: new Date(base.getTime() + 3 * 24 * 60 * 60 * 1000),
          endDate: new Date(base.getTime() + 7 * 24 * 60 * 60 * 1000),
          duration: 4,
          progress: 0,
          parentId: null,
          isMilestone: false,
          sortOrder: 2,
          plannedCost: 2000,
          dependencies: [
            { predecessorCode: "1.0", type: "FS", offset: -2 }, // 2 days lead
          ],
        },
      ];

      const xml = generateMSPXML(tasks as any, "Test Project");
      // Must contain LinkLag with negative sign: -9600 (-2 days * 4800)
      expect(xml).toContain("<LinkLag>-9600</LinkLag>");
    });
  });

  describe("Progress Rollup & Root Progress", () => {
    it("computes duration-weighted overall project root progress", async () => {
      const { computeRolledUpProgress } = await import("@/app/(app)/projects/[id]/gantt/utils");

      const tasks = [
        {
          id: "section1",
          name: "Substructure",
          duration: 10,
          progress: 100,
          parentId: null,
        },
        {
          id: "section2",
          name: "Superstructure",
          duration: 10,
          progress: 50,
          parentId: null,
        },
      ];

      const progressMap = computeRolledUpProgress(tasks as any);
      expect(progressMap.get("section1")).toBe(100);
      expect(progressMap.get("section2")).toBe(50);
      // Overall root progress = (100*10 + 50*10) / 20 = 75%
      expect(progressMap.get("root")).toBe(75);
    });
  });

  describe("Multi-Version WBS Tree Calculation Isolation", () => {
    it("assigns independent 1, 1.1, 2 root sequences per schedule version", () => {
      // Tree builder helper simulating recalculateWbsCodes logic
      function buildWbs(tasks: Array<{ id: string; parentId: string | null; sortOrder: number; versionId: string }>) {
        const byVersion = new Map<string, typeof tasks>();
        for (const t of tasks) {
          const arr = byVersion.get(t.versionId) ?? [];
          arr.push(t);
          byVersion.set(t.versionId, arr);
        }

        const codes = new Map<string, string>();
        for (const vTasks of byVersion.values()) {
          const byParent = new Map<string | null, typeof vTasks>();
          for (const t of vTasks) {
            const key = t.parentId ?? null;
            const arr = byParent.get(key) ?? [];
            arr.push(t);
            byParent.set(key, arr);
          }
          for (const arr of byParent.values()) {
            arr.sort((a, b) => a.sortOrder - b.sortOrder);
          }
          function walk(parentId: string | null, prefix: string) {
            const children = byParent.get(parentId) ?? [];
            children.forEach((child, idx) => {
              const code = prefix ? `${prefix}.${idx + 1}` : String(idx + 1);
              codes.set(child.id, code);
              walk(child.id, code);
            });
          }
          walk(null, "");
        }
        return codes;
      }

      const tasks = [
        // Version 1 (Planning)
        { id: "v1_root1", parentId: null, sortOrder: 1, versionId: "ver_plan" },
        { id: "v1_child1", parentId: "v1_root1", sortOrder: 1, versionId: "ver_plan" },
        { id: "v1_root2", parentId: null, sortOrder: 2, versionId: "ver_plan" },

        // Version 2 (Execution)
        { id: "v2_root1", parentId: null, sortOrder: 1, versionId: "ver_exec" },
        { id: "v2_child1", parentId: "v2_root1", sortOrder: 1, versionId: "ver_exec" },
        { id: "v2_root2", parentId: null, sortOrder: 2, versionId: "ver_exec" },
      ];

      const codes = buildWbs(tasks);

      // Both versions must have their own clean 1, 1.1, 2 hierarchy
      expect(codes.get("v1_root1")).toBe("1");
      expect(codes.get("v1_child1")).toBe("1.1");
      expect(codes.get("v1_root2")).toBe("2");

      expect(codes.get("v2_root1")).toBe("1");
      expect(codes.get("v2_child1")).toBe("1.1");
      expect(codes.get("v2_root2")).toBe("2");
    });
  });
});

// ─── Backward pass: late dates, float, critical path ────────────────────────
describe("computeCpmSchedule — backward pass (CPM metrics)", () => {
  it("marks the longest chain critical and gives the short branch float (24h mode)", () => {
    // A ──3d──> B ──3d──> C  (critical chain, 6 days)
    // A ──3d──> D (2d)        (short branch: D has 1 day float)
    const base = new Date("2026-01-05T00:00:00Z"); // Monday
    const tasks = [
      { id: "A", name: "A", startDate: base, endDate: new Date(base.getTime() + 3 * 86400000), duration: 3 },
      { id: "B", name: "B", startDate: base, endDate: base, duration: 3 },
      { id: "C", name: "C", startDate: base, endDate: base, duration: 3 },
      { id: "D", name: "D", startDate: base, endDate: base, duration: 2 },
    ];
    const deps = [
      { predecessorId: "A", successorId: "B", type: "FS" as const, offset: 0 },
      { predecessorId: "B", successorId: "C", type: "FS" as const, offset: 0 },
      { predecessorId: "A", successorId: "D", type: "FS" as const, offset: 0 },
    ];

    const { metrics, criticalPathIds } = computeCpmSchedule(tasks, deps);

    // Forward pass: B starts A+3d, C starts A+6d ends A+9d.
    const b = metrics.get("B")!;
    const c = metrics.get("C")!;
    const d = metrics.get("D")!;
    expect(b.earlyStart.getTime()).toBe(base.getTime() + 3 * 86400000);
    expect(c.earlyFinish.getTime()).toBe(base.getTime() + 9 * 86400000);

    // Project finish = A+9d; every task on the chain has zero float.
    expect(criticalPathIds).toEqual(["A", "B", "C"]);
    expect(c.lateStart.getTime()).toBe(c.earlyStart.getTime());
    expect(c.totalFloatDays).toBe(0);
    expect(c.isCritical).toBe(true);

    // D finishes A+5d but could finish A+9d → 1 working... (24h mode: calendar
    // days) D: ES = A+3d, dur 2 → EF = A+5d; LF = A+9d → LS = A+7d → float 4d.
    expect(d.earlyFinish.getTime()).toBe(base.getTime() + 5 * 86400000);
    expect(d.totalFloatDays).toBe(4);
    expect(d.isCritical).toBe(false);

    // Late dates are internally consistent: LF = LS + duration.
    expect(d.lateFinish.getTime()).toBe(d.lateStart.getTime() + 2 * 86400000);
  });

  it("respects FS lag in the backward pass (lag consumes float)", () => {
    const base = new Date("2026-01-05T00:00:00Z");
    // A(3d) -lag2-> B(2d); C(3d) no deps ending at A+9d drives project finish.
    const tasks = [
      { id: "A", name: "A", startDate: base, endDate: new Date(base.getTime() + 3 * 86400000), duration: 3 },
      { id: "B", name: "B", startDate: base, endDate: base, duration: 2 },
      {
        id: "C", name: "C",
        startDate: new Date(base.getTime() + 9 * 86400000),
        endDate: new Date(base.getTime() + 12 * 86400000),
        duration: 3,
      },
    ];
    const deps = [
      { predecessorId: "A", successorId: "B", type: "FS" as const, offset: 2 },
    ];
    const { metrics } = computeCpmSchedule(tasks, deps);

    // B: ES = EF_A + 2 = A+5d, EF = A+7d. Project finish = A+12d (C).
    // LF_B = LS_C? No — B has no successors → LF_B = project finish = A+12d.
    // Float_B = LS_B(A+10d) - ES_B(A+5d) = 5 days.
    const b = metrics.get("B")!;
    expect(b.earlyStart.getTime()).toBe(base.getTime() + 5 * 86400000);
    expect(b.totalFloatDays).toBe(5);
    expect(b.isCritical).toBe(false);
  });

  it("computes float in WORKING days in calendar mode (Dashain closure ≠ float)", () => {
    // Window: Sept 28 (Mon) → Oct 21+ 2026. Dashain Oct 11-20 all holiday.
    // Chain A(2d) -> B(2d): ES_A = Sep 28, EF_A = Sep 30; ES_B = Sep 30,
    // EF_B = Oct 2. Terminal C (no deps) authored Oct 5..Oct 23 — long span
    // crosses Dashain, so project finish = Oct 23 (Fri, working).
    // LF_B = Oct 23 → LS_B = 2 working days back = Oct 21 (Wed).
    // Float_B = working days Sep 30 → Oct 21 minus 1 = 13 working days
    // (Dashain days inside the window count as ZERO float).
    const tasks = [
      {
        id: "A", name: "A",
        startDate: new Date("2026-09-28T00:00:00Z"),
        endDate: new Date("2026-09-30T00:00:00Z"),
        duration: 2,
      },
      {
        id: "B", name: "B",
        startDate: new Date("2026-09-25T00:00:00Z"),
        endDate: new Date("2026-09-26T00:00:00Z"),
        duration: 2,
      },
      {
        id: "C", name: "C",
        startDate: new Date("2026-10-05T00:00:00Z"),
        endDate: new Date("2026-10-23T00:00:00Z"),
        duration: 15,
      },
    ];
    const deps = [{ predecessorId: "A", successorId: "B", type: "FS" as const, offset: 0 }];
    const { metrics } = computeCpmSchedule(tasks, deps, { useCalendar: true });

    const b = metrics.get("B")!;
    expect(b.earlyStart.toISOString()).toBe(new Date("2026-09-30T00:00:00Z").toISOString());
    expect(b.earlyFinish.toISOString()).toBe(new Date("2026-10-02T00:00:00Z").toISOString());
    // Slip days available: Oct 1, 2, Oct 4 (Sun — working in Nepal),
    // Oct 5-9, then Dashain Oct 11-20 (ZERO float), then Oct 21 = 9 days.
    // The 10-day Dashain closure contributes nothing — that is the point.
    expect(b.totalFloatDays).toBe(9);
    expect(b.isCritical).toBe(false);
  });

  it("flags duration-vs-dates drift only on user-authored (no-dep) tasks", () => {
    const base = new Date("2026-01-05T00:00:00Z");
    const tasks = [
      // No deps, duration says 3 but dates span 5 days → mismatch.
      { id: "X", name: "X", startDate: base, endDate: new Date(base.getTime() + 5 * 86400000), duration: 3 },
      // Dep-driven task whose stored dates are stale → not reported (recomputed anyway).
      { id: "Y", name: "Y", startDate: base, endDate: base, duration: 3 },
    ];
    const deps = [{ predecessorId: "X", successorId: "Y", type: "FS" as const, offset: 0 }];
    const { durationMismatches } = computeCpmSchedule(tasks, deps);
    expect(durationMismatches).toHaveLength(1);
    expect(durationMismatches[0]).toMatchObject({ id: "X", duration: 3, impliedDurationDays: 5 });
  });

  it("excludes cyclic tasks from metrics (they cannot be scheduled)", () => {
    const base = new Date("2026-01-05T00:00:00Z");
    const tasks = [
      { id: "A", name: "A", startDate: base, endDate: new Date(base.getTime() + 86400000), duration: 1 },
      { id: "P", name: "P", startDate: base, endDate: base, duration: 1 },
      { id: "Q", name: "Q", startDate: base, endDate: base, duration: 1 },
    ];
    const deps = [
      { predecessorId: "P", successorId: "Q", type: "FS" as const, offset: 0 },
      { predecessorId: "Q", successorId: "P", type: "FS" as const, offset: 0 },
    ];
    const { metrics, cycleDetected, criticalPathIds } = computeCpmSchedule(tasks, deps);
    expect(cycleDetected).toBe(true);
    expect(metrics.has("A")).toBe(true);
    expect(metrics.has("P")).toBe(false);
    expect(metrics.has("Q")).toBe(false);
    expect(criticalPathIds).toEqual(["A"]);
  });
});
