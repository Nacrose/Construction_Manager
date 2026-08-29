import { describe, it, expect } from "vitest";
import { rollupDailySiteDiary } from "./site-diary-rollup";

describe("Central Site Diary & DPR Rollup Engine", () => {
  it("rolls up manpower headcounts, trades, and machinery hours", () => {
    const res = rollupDailySiteDiary({
      date: "2026-08-29",
      miti: "2083-05-13",
      manpowerLogs: [
        { trade: "Masons", isSkilled: true, headcount: 10, regularHours: 8, otHours: 2 }, // 10 * 10 = 100 hrs
        { trade: "Helpers", isSkilled: false, headcount: 20, regularHours: 8, otHours: 0 }, // 20 * 8 = 160 hrs
      ],
      machineryLogs: [
        { equipmentName: "Excavator 20T", count: 2, workingHours: 14, breakdownHours: 2 },
      ],
      weatherLogs: [
        { condition: "rain_light", stoppageHours: 1, notes: "Drizzle from 2pm to 3pm" },
      ],
    });

    expect(res.totalHeadcount).toBe(30);
    expect(res.skilledHeadcount).toBe(10);
    expect(res.unskilledHeadcount).toBe(20);
    expect(res.totalLaborManhours).toBe(260); // 100 + 160
    expect(res.totalMachineryWorkingHours).toBe(14);
    expect(res.totalMachineryBreakdownHours).toBe(2);
    expect(res.totalWeatherStoppageHours).toBe(1);
    expect(res.hasWorkDisruption).toBe(true);
    expect(res.productivityScore).toBeLessThan(100);
  });
});
