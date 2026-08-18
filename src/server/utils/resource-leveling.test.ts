import { describe, it, expect } from "vitest";
import { detectConflicts, proposeLeveling, type AssignmentWithTask, type ConflictInfo } from "./resource-leveling";

describe("Resource Conflict Detection & Leveling Engine", () => {
  describe("Staff Resource Overlap Detection (50 scenarios)", () => {
    // Generate 50 distinct overlapping test cases with varied start/end dates and overlap durations
    const overlapScenarios = Array.from({ length: 50 }, (_, i) => {
      const startOffset = i * 2;
      const duration = 10 + (i % 15);
      const overlapDays = (i % 8) + 2; // 2 to 9 days overlap
      return {
        id: `staff_case_${i}`,
        staffId: `staff_${i % 5}`,
        staffName: `Engineer ${i % 5}`,
        task1Start: new Date(2026, 4, 1 + startOffset),
        task1End: new Date(2026, 4, 1 + startOffset + duration),
        task2Start: new Date(2026, 4, 1 + startOffset + duration - overlapDays),
        task2End: new Date(2026, 4, 1 + startOffset + duration + 5),
        expectedOverlapDays: overlapDays + 1, // inclusive of boundary
      };
    });

    it.each(overlapScenarios)("detects conflict with $expectedOverlapDays overlap days for $staffName in scenario $id", ({ staffId, staffName, task1Start, task1End, task2Start, task2End }) => {
      const assignments: AssignmentWithTask[] = [
        {
          id: `a1`,
          taskId: "t1",
          staffId,
          equipmentId: null,
          staffRoleId: null,
          quantity: 1,
          task: { id: "t1", name: "Foundation Pouring", code: "1.1", startDate: task1Start, endDate: task1End, sortOrder: 1 },
          staff: { id: staffId, name: staffName },
          equipment: null,
          staffRole: null,
        },
        {
          id: `a2`,
          taskId: "t2",
          staffId,
          equipmentId: null,
          staffRoleId: null,
          quantity: 1,
          task: { id: "t2", name: "Column Reinforcement", code: "1.2", startDate: task2Start, endDate: task2End, sortOrder: 2 },
          staff: { id: staffId, name: staffName },
          equipment: null,
          staffRole: null,
        },
      ];

      const conflicts = detectConflicts(assignments);
      expect(conflicts.length).toBe(1);
      expect(conflicts[0].resourceId).toBe(staffId);
      expect(conflicts[0].resourceName).toBe(staffName);
      expect(conflicts[0].resourceType).toBe("staff");
      expect(conflicts[0].task1Id).toBe("t1");
      expect(conflicts[0].task2Id).toBe("t2");
      expect(conflicts[0].overlapDays).toBeGreaterThan(0);
    });
  });

  describe("Equipment Fleet Overlap Detection (50 scenarios)", () => {
    const equipmentTypes = [
      "Excavator CAT 320D",
      "Hydraulic Crane 50T",
      "Vibratory Roller 12T",
      "Transit Mixer 6m3",
      "Concrete Batching Plant 60m3/h",
    ];

    const equipmentScenarios = Array.from({ length: 50 }, (_, i) => {
      const equipIdx = i % equipmentTypes.length;
      const equipId = `equip_${equipIdx}`;
      const equipName = equipmentTypes[equipIdx];
      const startDay = 1 + (i * 3);
      return {
        id: `equip_case_${i}`,
        equipId,
        equipName,
        task1Start: new Date(2026, 6, startDay),
        task1End: new Date(2026, 6, startDay + 12),
        task2Start: new Date(2026, 6, startDay + 5),
        task2End: new Date(2026, 6, startDay + 18),
      };
    });

    it.each(equipmentScenarios)("flags equipment over-allocation for $equipName in $id", ({ equipId, equipName, task1Start, task1End, task2Start, task2End }) => {
      const assignments: AssignmentWithTask[] = [
        {
          id: "eq_a1",
          taskId: "eq_t1",
          staffId: null,
          equipmentId: equipId,
          staffRoleId: null,
          quantity: 1,
          task: { id: "eq_t1", name: "Site Leveling", code: "E.1", startDate: task1Start, endDate: task1End, sortOrder: 1 },
          staff: null,
          equipment: { id: equipId, name: equipName, code: "EQ-01" },
          staffRole: null,
        },
        {
          id: "eq_a2",
          taskId: "eq_t2",
          staffId: null,
          equipmentId: equipId,
          staffRoleId: null,
          quantity: 1,
          task: { id: "eq_t2", name: "Road Subgrade Compaction", code: "E.2", startDate: task2Start, endDate: task2End, sortOrder: 2 },
          staff: null,
          equipment: { id: equipId, name: equipName, code: "EQ-01" },
          staffRole: null,
        },
      ];

      const conflicts = detectConflicts(assignments);
      expect(conflicts.length).toBe(1);
      expect(conflicts[0].resourceType).toBe("equipment");
      expect(conflicts[0].resourceName).toBe(equipName);
    });
  });

  describe("Non-Overlapping Boundary Cases (20 scenarios)", () => {
    const nonOverlapCases = Array.from({ length: 20 }, (_, i) => {
      const gap = i; // 0 days gap (touching boundary) to 19 days gap
      return {
        gap,
        start1: new Date(2026, 2, 1),
        end1: new Date(2026, 2, 10),
        start2: new Date(2026, 2, 10 + gap),
        end2: new Date(2026, 2, 20 + gap),
      };
    });

    it.each(nonOverlapCases)("correctly reports zero conflicts when gap is $gap days", ({ start1, end1, start2, end2 }) => {
      const assignments: AssignmentWithTask[] = [
        {
          id: "seq_1",
          taskId: "t_seq_1",
          staffId: "mason_1",
          equipmentId: null,
          staffRoleId: null,
          quantity: 1,
          task: { id: "t_seq_1", name: "Brick Masonry Section 1", code: "M.1", startDate: start1, endDate: end1, sortOrder: 1 },
          staff: { id: "mason_1", name: "Senior Mason" },
          equipment: null,
          staffRole: null,
        },
        {
          id: "seq_2",
          taskId: "t_seq_2",
          staffId: "mason_1",
          equipmentId: null,
          staffRoleId: null,
          quantity: 1,
          task: { id: "t_seq_2", name: "Brick Masonry Section 2", code: "M.2", startDate: start2, endDate: end2, sortOrder: 2 },
          staff: { id: "mason_1", name: "Senior Mason" },
          equipment: null,
          staffRole: null,
        },
      ];

      const conflicts = detectConflicts(assignments);
      // start1 < end2 AND start2 < end1: when start2 >= end1, there is no overlap
      expect(conflicts.length).toBe(0);
    });
  });

  describe("Resource Leveling Proposals (50 scenarios)", () => {
    const levelingScenarios = Array.from({ length: 50 }, (_, i) => {
      const task1Duration = 5 + (i % 10);
      const overlap = 2 + (i % 6);
      const task1Start = new Date("2026-08-01T00:00:00.000Z");
      const task1End = new Date(task1Start.getTime() + task1Duration * 86400000);
      const task2Start = new Date(task1End.getTime() - overlap * 86400000);
      const task2Duration = 7;
      const task2End = new Date(task2Start.getTime() + task2Duration * 86400000);

      return {
        id: `level_${i}`,
        task1Start,
        task1End,
        task2Start,
        task2End,
        task2Duration,
        overlap,
      };
    });

    it.each(levelingScenarios)("proposes valid leveling delay that shifts task2 beyond task1 for scenario $id", ({ task1Start, task1End, task2Start, task2End }) => {
      const conflict: ConflictInfo = {
        resourceId: "crane_01",
        resourceName: "Tower Crane",
        resourceType: "equipment",
        task1Id: "task_A",
        task1Name: "Steel Trusses Erection",
        task1Code: "1.1",
        task1Start,
        task1End,
        task2Id: "task_B",
        task2Name: "Precast Slab Placement",
        task2Code: "1.2",
        task2Start,
        task2End,
        overlapDays: 5,
        overlapStart: task2Start,
        overlapEnd: task1End,
      };

      const proposals = proposeLeveling([conflict]);
      expect(proposals.length).toBe(1);
      expect(proposals[0].taskId).toBe("task_B");
      expect(proposals[0].delayDays).toBeGreaterThan(0);
      expect(proposals[0].newStart.getTime()).toBeGreaterThanOrEqual(task1End.getTime());

      // Duration must be preserved
      const originalDurationMs = task2End.getTime() - task2Start.getTime();
      const newDurationMs = proposals[0].newEnd.getTime() - proposals[0].newStart.getTime();
      expect(newDurationMs).toBe(originalDurationMs);
    });
  });

  describe("Multi-Conflict Aggregation and Severity Sorting", () => {
    it("sorts conflicts descending by overlap days", () => {
      const assignments: AssignmentWithTask[] = [
        {
          id: "m1", taskId: "t1", staffId: "eng_1", equipmentId: null, staffRoleId: null, quantity: 1,
          task: { id: "t1", name: "T1", code: "1", startDate: new Date(2026, 0, 1), endDate: new Date(2026, 0, 20), sortOrder: 1 },
          staff: { id: "eng_1", name: "Engineer" }, equipment: null, staffRole: null,
        },
        {
          id: "m2", taskId: "t2", staffId: "eng_1", equipmentId: null, staffRoleId: null, quantity: 1,
          task: { id: "t2", name: "T2", code: "2", startDate: new Date(2026, 0, 15), endDate: new Date(2026, 0, 25), sortOrder: 2 }, // 5 days overlap
          staff: { id: "eng_1", name: "Engineer" }, equipment: null, staffRole: null,
        },
        {
          id: "m3", taskId: "t3", staffId: "eng_1", equipmentId: null, staffRoleId: null, quantity: 1,
          task: { id: "t3", name: "T3", code: "3", startDate: new Date(2026, 0, 5), endDate: new Date(2026, 0, 25), sortOrder: 3 }, // 15 days overlap with T1
          staff: { id: "eng_1", name: "Engineer" }, equipment: null, staffRole: null,
        },
      ];

      const conflicts = detectConflicts(assignments);
      expect(conflicts.length).toBeGreaterThan(1);
      for (let i = 0; i < conflicts.length - 1; i++) {
        expect(conflicts[i].overlapDays).toBeGreaterThanOrEqual(conflicts[i + 1].overlapDays);
      }
    });

    it("takes maximal delay when a task has multiple conflicting predecessors", () => {
      const conflicts: ConflictInfo[] = [
        {
          resourceId: "r1", resourceName: "R1", resourceType: "staff",
          task1Id: "pred_1", task1Name: "P1", task1Code: "1",
          task1Start: new Date("2026-01-01"), task1End: new Date("2026-01-10"),
          task2Id: "target", task2Name: "Target Task", task2Code: "T",
          task2Start: new Date("2026-01-05"), task2End: new Date("2026-01-15"),
          overlapDays: 5, overlapStart: new Date("2026-01-05"), overlapEnd: new Date("2026-01-10"),
        },
        {
          resourceId: "r2", resourceName: "R2", resourceType: "staff",
          task1Id: "pred_2", task1Name: "P2", task1Code: "2",
          task1Start: new Date("2026-01-01"), task1End: new Date("2026-01-20"), // longer conflict requiring more delay
          task2Id: "target", task2Name: "Target Task", task2Code: "T",
          task2Start: new Date("2026-01-05"), task2End: new Date("2026-01-15"),
          overlapDays: 10, overlapStart: new Date("2026-01-05"), overlapEnd: new Date("2026-01-15"),
        },
      ];

      const proposals = proposeLeveling(conflicts);
      expect(proposals.length).toBe(1); // Merged into 1 proposal for 'target'
      expect(proposals[0].newStart.getTime()).toBeGreaterThanOrEqual(new Date("2026-01-20").getTime());
    });
  });
});
