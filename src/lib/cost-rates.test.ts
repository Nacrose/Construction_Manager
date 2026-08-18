import { describe, it, expect } from "vitest";
import {
  DEFAULT_COST_RATES,
  resolveProjectRates,
  getLaborWage,
  getEquipmentRate,
  type ProjectRateOverrides,
} from "./cost-rates";

describe("Project Cost Rates & Wage Hierarchy Engine", () => {
  describe("Default Baseline Rates (NPR)", () => {
    it("matches government / standard construction baseline", () => {
      expect(DEFAULT_COST_RATES.labor.skilledDailyWage).toBe(1200);
      expect(DEFAULT_COST_RATES.labor.unskilledDailyWage).toBe(800);
      expect(DEFAULT_COST_RATES.labor.supervisorDailyWage).toBe(3500);
      expect(DEFAULT_COST_RATES.labor.otMultiplier).toBe(1.5);
      expect(DEFAULT_COST_RATES.labor.hoursPerDay).toBe(8);

      expect(DEFAULT_COST_RATES.equipment.ownedHourlyRate).toBe(500);
      expect(DEFAULT_COST_RATES.equipment.hiredHourlyRate).toBe(800);
      expect(DEFAULT_COST_RATES.equipment.fuelPricePerLiter).toBe(168);
    });
  });

  describe("Project Rate Overrides Resolution (30 scenarios)", () => {
    const overrideScenarios: Array<{ id: string; overrides?: ProjectRateOverrides | null; expectedSkilled: number; expectedHired: number; expectedFuel: number }> = [
      { id: "null_overrides", overrides: null, expectedSkilled: 1200, expectedHired: 800, expectedFuel: 168 },
      { id: "empty_overrides", overrides: {}, expectedSkilled: 1200, expectedHired: 800, expectedFuel: 168 },
      { id: "full_overrides", overrides: { skilledWageRate: 1500, unskilledWageRate: 950, supervisorWageRate: 4000, ownedEquipRate: 650, hiredEquipRate: 1100, fuelPricePerLiter: 175 }, expectedSkilled: 1500, expectedHired: 1100, expectedFuel: 175 },
    ];

    // Generate 27 additional partial override permutations
    for (let i = 1; i <= 27; i++) {
      const skilled = i % 2 === 0 ? 1200 + i * 10 : null;
      const hired = i % 3 === 0 ? 800 + i * 15 : null;
      const fuel = i % 4 === 0 ? 160 + i : null;
      overrideScenarios.push({
        id: `partial_override_${i}`,
        overrides: {
          skilledWageRate: skilled,
          hiredEquipRate: hired,
          fuelPricePerLiter: fuel,
        },
        expectedSkilled: skilled ?? 1200,
        expectedHired: hired ?? 800,
        expectedFuel: fuel ?? 168,
      });
    }

    it.each(overrideScenarios)("resolves project rates correctly for $id", ({ overrides, expectedSkilled, expectedHired, expectedFuel }) => {
      const resolved = resolveProjectRates(overrides);
      expect(resolved.labor.skilledDailyWage).toBe(expectedSkilled);
      expect(resolved.equipment.hiredHourlyRate).toBe(expectedHired);
      expect(resolved.equipment.fuelPricePerLiter).toBe(expectedFuel);
    });
  });

  describe("Labor Wage Hierarchy Priority Chain (30 scenarios)", () => {
    const customRates = resolveProjectRates({
      skilledWageRate: 1400,
      unskilledWageRate: 900,
      supervisorWageRate: 4500,
    });

    const wageTests = [
      // Priority 1: Direct staff wage always takes precedence
      { staffWage: 2500, skill: "unskilled", category: "laborer", rates: null, expected: 2500, desc: "direct staff wage wins over skill" },
      { staffWage: 5000, skill: "skilled", category: "supervisor", rates: customRates, expected: 5000, desc: "direct staff wage wins over supervisor default" },
      { staffWage: 1800, skill: undefined, category: undefined, rates: null, expected: 1800, desc: "direct staff wage with undefined category" },

      // Priority 2: Supervisor / Staff category
      { staffWage: null, skill: "unskilled", category: "supervisor", rates: null, expected: 3500, desc: "supervisor default rate" },
      { staffWage: null, skill: "unskilled", category: "staff", rates: null, expected: 3500, desc: "staff default rate" },
      { staffWage: null, skill: "skilled", category: "supervisor", rates: customRates, expected: 4500, desc: "project override supervisor rate" },

      // Priority 3: Skill level (unskilled vs skilled)
      { staffWage: null, skill: "unskilled", category: "helper", rates: null, expected: 800, desc: "unskilled default wage" },
      { staffWage: null, skill: "unskilled", category: null, rates: customRates, expected: 900, desc: "unskilled project wage" },
      { staffWage: null, skill: "skilled", category: "mason", rates: null, expected: 1200, desc: "skilled default wage" },
      { staffWage: null, skill: "skilled", category: null, rates: customRates, expected: 1400, desc: "skilled project wage" },
      { staffWage: null, skill: undefined, category: undefined, rates: null, expected: 1200, desc: "fallback default skilled wage" },
    ];

    // Generate 19 more permutations across skill, category, and staffWage
    for (let i = 1; i <= 19; i++) {
      const hasStaffWage = i % 3 === 0;
      const isSupervisor = i % 4 === 0;
      const isUnskilled = i % 2 === 0;
      const wageVal = 1000 + i * 100;
      const expected = hasStaffWage ? wageVal : isSupervisor ? 3500 : isUnskilled ? 800 : 1200;

      wageTests.push({
        staffWage: hasStaffWage ? wageVal : null,
        skill: isUnskilled ? "unskilled" : "skilled",
        category: isSupervisor ? "supervisor" : "worker",
        rates: null,
        expected,
        desc: `Permutation #${i}`,
      });
    }

    it.each(wageTests)("resolves labor wage to $expected for $desc", ({ staffWage, skill, category, rates, expected }) => {
      expect(getLaborWage(staffWage, skill, category, rates)).toBe(expected);
    });
  });

  describe("Equipment Rate Ownership Resolution (20 scenarios)", () => {
    const equipScenarios = Array.from({ length: 20 }, (_, i) => {
      const isHired = i % 2 === 0;
      const ownedOverride = 500 + i * 20;
      const hiredOverride = 800 + i * 30;
      const rates = resolveProjectRates({
        ownedEquipRate: ownedOverride,
        hiredEquipRate: hiredOverride,
      });

      return {
        id: `equip_scenario_${i}`,
        ownership: isHired ? "hired" : "owned",
        rates,
        expected: isHired ? hiredOverride : ownedOverride,
      };
    });

    it.each(equipScenarios)("resolves rate for $ownership equipment in $id", ({ ownership, rates, expected }) => {
      expect(getEquipmentRate(ownership, rates)).toBe(expected);
    });
  });
});
