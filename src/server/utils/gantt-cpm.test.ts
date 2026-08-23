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
