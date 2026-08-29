import { describe, it, expect } from "vitest";
import { calculateEquipmentLogSummary, calculateSpotHireCost } from "./equipment-telemetry";

describe("Central Equipment Fleet Telemetry & Fuel Engine", () => {
  it("calculates net working hours, utilization rate, and fuel efficiency", () => {
    const res = calculateEquipmentLogSummary({
      startMeter: 1000,
      endMeter: 1010, // 10 total hours
      idleHours: 1.5,
      breakdownHours: 0.5,
      fuelLiters: 112, // 112L for 8 net working hours = 14 L/hr
      benchmarkLitersPerHour: 13.5,
    });

    expect(res.totalMeterHours).toBe(10);
    expect(res.netWorkingHours).toBe(8);
    expect(res.utilizationRate).toBe(80); // 8/10 = 80%
    expect(res.fuelConsumptionPerHour).toBe(14);
    expect(res.isFuelAnomalous).toBe(false); // only 3.7% above benchmark
  });

  it("detects fuel theft / excessive fuel consumption anomaly", () => {
    const res = calculateEquipmentLogSummary({
      startMeter: 500,
      endMeter: 508, // 8 hours
      fuelLiters: 180, // 180 / 8 = 22.5 L/hr
      benchmarkLitersPerHour: 14, // 22.5 is ~60% higher than 14
    });

    expect(res.fuelConsumptionPerHour).toBe(22.5);
    expect(res.isFuelAnomalous).toBe(true);
    expect(res.variancePercentFromBenchmark).toBe(60.7);
  });

  it("calculates spot-hire rental with overtime and 1.5% TDS", () => {
    const res = calculateSpotHireCost({
      workingHours: 10,
      shiftHours: 8,
      hourlyRate: 3000,
      mobDemobFee: 15000,
      tdsPercent: 1.5,
    });

    expect(res.regularHours).toBe(8);
    expect(res.otHours).toBe(2);
    expect(res.regularAmount).toBe(24000); // 8 * 3000
    expect(res.otAmount).toBe(9000); // 2 * 4500 (1.5x)
    expect(res.grossAmount).toBe(48000); // 24000 + 9000 + 15000
    expect(res.tdsAmount).toBe(720); // 1.5% of 48000
    expect(res.netPayable).toBe(47280);
  });
});
