import { describe, it, expect } from "vitest";
import { calculateEVM, type EVMTask } from "./evm";

describe("Earned Value Management (EVM) Calculation Engine", () => {
  const baseDate = new Date("2026-06-01T00:00:00.000Z");

  describe("Single Task Basic Calculations", () => {
    it("calculates metrics for a task exactly on schedule and on budget", () => {
      const task: EVMTask = {
        id: "t1",
        name: "Earthwork",
        code: "1.1",
        startDate: new Date("2026-05-01T00:00:00.000Z"),
        endDate: new Date("2026-07-01T00:00:00.000Z"), // 61 days total
        progress: 50,
        plannedCost: 100000,
        actualCost: 50000,
      };

      const asOf = new Date("2026-05-31T23:59:59.999Z"); // ~50% elapsed
      const res = calculateEVM([task], asOf);

      expect(res.bac).toBe(100000);
      expect(res.ev).toBe(50000);
      expect(res.ac).toBe(50000);
      expect(res.cpi).toBeCloseTo(1.0, 2);
      expect(res.status).toBe("on_track");
      expect(res.cv).toBe(0);
      expect(res.eac).toBeCloseTo(100000, 2);
      expect(res.vac).toBeCloseTo(0, 2);
      expect(res.etc).toBeCloseTo(50000, 2);
    });

    it("identifies an over-budget task (CPI < 0.9)", () => {
      const task: EVMTask = {
        id: "t1",
        name: "PCC Work",
        code: "1.2",
        startDate: new Date("2026-05-01T00:00:00.000Z"),
        endDate: new Date("2026-07-01T00:00:00.000Z"),
        progress: 50,
        plannedCost: 100000,
        actualCost: 75000, // spent 75k for 50k earned value (CPI = 0.67)
      };

      const asOf = new Date("2026-06-01T00:00:00.000Z");
      const res = calculateEVM([task], asOf);

      expect(res.cpi).toBeCloseTo(50000 / 75000, 2);
      expect(res.status).toBe("over_budget");
      expect(res.cv).toBe(-25000);
      expect(res.eac).toBeGreaterThan(100000);
      expect(res.vac).toBeLessThan(0);
    });

    it("identifies a behind-schedule task (SPI < 0.9)", () => {
      const task: EVMTask = {
        id: "t1",
        name: "RCC Column Casting",
        code: "1.3",
        startDate: new Date("2026-05-01T00:00:00.000Z"),
        endDate: new Date("2026-05-31T00:00:00.000Z"), // Should be 100% completed by June
        progress: 40, // only 40% done
        plannedCost: 200000,
        actualCost: 80000, // CPI = 1.0 (80k earned, 80k spent)
      };

      const asOf = new Date("2026-06-01T00:00:00.000Z"); // As of June 1, PV = 200,000
      const res = calculateEVM([task], asOf);

      expect(res.pv).toBe(200000);
      expect(res.ev).toBe(80000);
      expect(res.spi).toBeCloseTo(80000 / 200000, 2); // 0.40
      expect(res.cpi).toBe(1.0);
      expect(res.status).toBe("behind_schedule");
      expect(res.sv).toBe(-120000);
    });

    it("identifies critical status when both CPI and SPI < 0.9", () => {
      const task: EVMTask = {
        id: "t1",
        name: "Bridge Deck Construction",
        code: "2.1",
        startDate: new Date("2026-05-01T00:00:00.000Z"),
        endDate: new Date("2026-05-31T00:00:00.000Z"),
        progress: 30, // EV = 60k, PV = 200k -> SPI = 0.30
        plannedCost: 200000,
        actualCost: 100000, // CPI = 60k / 100k = 0.60
      };

      const asOf = new Date("2026-06-01T00:00:00.000Z");
      const res = calculateEVM([task], asOf);

      expect(res.status).toBe("critical");
      expect(res.statusLabel).toContain("Critical");
    });
  });

  describe("Planned Value Time-Interpolation Matrix", () => {
    const start = new Date("2026-01-01T00:00:00.000Z");
    const end = new Date("2026-01-11T00:00:00.000Z"); // 10 days duration
    const plannedCost = 100000;

    const days = [
      { dayOffset: -2, expectedFraction: 0, label: "Before start" },
      { dayOffset: 0, expectedFraction: 0, label: "On start day" },
      { dayOffset: 2, expectedFraction: 0.2, label: "20% elapsed" },
      { dayOffset: 5, expectedFraction: 0.5, label: "50% elapsed" },
      { dayOffset: 8, expectedFraction: 0.8, label: "80% elapsed" },
      { dayOffset: 10, expectedFraction: 1.0, label: "On finish day" },
      { dayOffset: 15, expectedFraction: 1.0, label: "After finish day" },
    ];

    it.each(days)("computes PV correctly for $label (day $dayOffset)", ({ dayOffset, expectedFraction }) => {
      const asOf = new Date(start.getTime() + dayOffset * 24 * 60 * 60 * 1000);
      const task: EVMTask = {
        id: "t_pv",
        name: "Time Test",
        code: "T1",
        startDate: start,
        endDate: end,
        progress: 50,
        plannedCost,
        actualCost: 50000,
      };

      const res = calculateEVM([task], asOf);
      expect(res.pv).toBeCloseTo(plannedCost * expectedFraction, 0);
    });
  });

  describe("Progress Steps Matrix (0% to 100% in 5% increments)", () => {
    const progressSteps = Array.from({ length: 21 }, (_, i) => i * 5); // 0, 5, 10, ... 100

    it.each(progressSteps)("calculates EV = plannedCost * %d%%", (progress) => {
      const task: EVMTask = {
        id: `prog_${progress}`,
        name: `Task at ${progress}%`,
        code: `P.${progress}`,
        startDate: new Date("2026-05-01"),
        endDate: new Date("2026-05-30"),
        progress,
        plannedCost: 500000,
        actualCost: (500000 * progress) / 100,
      };

      const res = calculateEVM([task], baseDate);
      expect(res.ev).toBeCloseTo((500000 * progress) / 100, 2);
      expect(res.percentComplete).toBeCloseTo(progress, 2);
    });
  });

  describe("CPI / Actual Cost Parametric Matrix (50 cost variance points)", () => {
    // Generate 50 distinct cost scenarios from heavy under-budget to severe overrun
    const costMultipliers = Array.from({ length: 50 }, (_, i) => 0.5 + (i * 1.5) / 49); // 0.5 to 2.0

    it.each(costMultipliers)("correctly forecasts EAC and VAC for actual cost multiplier %f", (multiplier) => {
      const plannedCost = 1000000;
      const progress = 50; // EV = 500,000
      const actualCost = 500000 * multiplier;

      const task: EVMTask = {
        id: `cost_${multiplier.toFixed(2)}`,
        name: `Cost Test ${multiplier.toFixed(2)}`,
        code: "CT",
        startDate: new Date("2026-05-01"),
        endDate: new Date("2026-07-01"),
        progress,
        plannedCost,
        actualCost,
      };

      const res = calculateEVM([task], baseDate);
      const expectedCpi = 500000 / actualCost;
      expect(res.cpi).toBeCloseTo(expectedCpi, 3);
      expect(res.eac).toBeCloseTo(plannedCost / expectedCpi, 0);
      expect(res.vac).toBeCloseTo(plannedCost - res.eac, 0);
      expect(res.cv).toBeCloseTo(500000 - actualCost, 0);
    });
  });

  describe("Multi-Task Project Simulation Matrix (50 construction project models)", () => {
    const projectTemplates = Array.from({ length: 50 }, (_, idx) => {
      const taskCount = (idx % 10) + 1;
      const baseCost = (idx + 1) * 100000;
      return {
        id: `proj_${idx}`,
        name: `Project Scenario #${idx + 1}`,
        tasks: Array.from({ length: taskCount }, (_, tIdx) => ({
          id: `p${idx}_t${tIdx}`,
          name: `Phase ${tIdx + 1}`,
          code: `${idx}.${tIdx + 1}`,
          startDate: new Date(2026, 0, 1 + tIdx * 10),
          endDate: new Date(2026, 0, 15 + tIdx * 10),
          progress: Math.min(100, Math.max(0, (idx * 7 + tIdx * 15) % 105)),
          plannedCost: baseCost / taskCount,
          actualCost: (baseCost / taskCount) * (0.8 + ((idx + tIdx) % 5) * 0.1),
        })),
      };
    });

    it.each(projectTemplates)("accurately aggregates BAC, EV, AC, and task details for $name", ({ tasks }) => {
      const asOf = new Date(2026, 0, 25);
      const res = calculateEVM(tasks, asOf);

      const expectedBac = tasks.reduce((s, t) => s + t.plannedCost, 0);
      const expectedEv = tasks.reduce((s, t) => s + t.plannedCost * (t.progress / 100), 0);
      const expectedAc = tasks.reduce((s, t) => s + t.actualCost, 0);

      expect(res.bac).toBeCloseTo(expectedBac, 2);
      expect(res.ev).toBeCloseTo(expectedEv, 2);
      expect(res.ac).toBeCloseTo(expectedAc, 2);
      expect(res.tasks.length).toBe(tasks.length);
      expect(res.percentComplete).toBeCloseTo((expectedEv / expectedBac) * 100, 2);
    });
  });

  describe("Edge Cases and Extreme Boundaries (25 cases)", () => {
    it("handles empty task list gracefully without crashing", () => {
      const res = calculateEVM([], baseDate);
      expect(res.bac).toBe(0);
      expect(res.pv).toBe(0);
      expect(res.ev).toBe(0);
      expect(res.ac).toBe(0);
      expect(res.cpi).toBe(1.0);
      expect(res.spi).toBe(1.0);
      expect(res.eac).toBe(0);
      expect(res.status).toBe("on_track");
      expect(res.tasks).toEqual([]);
    });

    it("handles zero planned cost with non-zero actual cost", () => {
      const task: EVMTask = {
        id: "zero_bac",
        name: "Unplanned Task",
        code: "U1",
        startDate: new Date("2026-05-01"),
        endDate: new Date("2026-05-10"),
        progress: 100,
        plannedCost: 0,
        actualCost: 50000,
      };

      const res = calculateEVM([task], baseDate);
      expect(res.bac).toBe(0);
      expect(res.ev).toBe(0);
      expect(res.cpi).toBe(0);
      expect(res.percentComplete).toBe(0);
      expect(res.cv).toBe(-50000);
    });

    it("evaluates a newly created project before start date as neutral on_track", () => {
      const task: EVMTask = {
        id: "future_task",
        name: "Future Work",
        code: "1.0",
        startDate: new Date("2026-09-01"),
        endDate: new Date("2026-09-30"),
        progress: 0,
        plannedCost: 500000,
        actualCost: 0,
      };

      const res = calculateEVM([task], new Date("2026-08-01")); // before start
      expect(res.pv).toBe(0);
      expect(res.ev).toBe(0);
      expect(res.ac).toBe(0);
      expect(res.cpi).toBe(1.0);
      expect(res.spi).toBe(1.0);
      expect(res.status).toBe("on_track");
    });

    const edgeScenarios = Array.from({ length: 23 }, (_, i) => ({
      cost: i === 0 ? 0 : Math.pow(10, i % 7),
      progress: (i * 4) % 100,
      actual: i * 5000,
    }));

    it.each(edgeScenarios)("safely handles numerical extremes: cost=$cost, progress=$progress, actual=$actual", ({ cost, progress, actual }) => {
      const task: EVMTask = {
        id: `extreme_${cost}_${progress}`,
        name: "Boundary Task",
        code: "B1",
        startDate: new Date("2026-01-01"),
        endDate: new Date("2026-01-10"),
        progress,
        plannedCost: cost,
        actualCost: actual,
      };

      const res = calculateEVM([task], new Date("2026-01-05"));
      expect(Number.isFinite(res.bac)).toBe(true);
      expect(Number.isFinite(res.ev)).toBe(true);
      expect(Number.isFinite(res.pv)).toBe(true);
      expect(Number.isFinite(res.cpi)).toBe(true);
      expect(Number.isFinite(res.spi)).toBe(true);
      expect(Number.isFinite(res.eac)).toBe(true);
    });
  });
});
