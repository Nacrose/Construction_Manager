import { describe, it, expect } from "vitest";
import {
  resolvePercentageBase,
  computeRatePerUnit,
  computeBoqAmount,
} from "./boq-calc";

/**
 * resolvePercentageBase determines what subtotal a percentage-based BOQ
 * ingredient is calculated against. Getting this right is critical for
 * rate analysis accuracy — a wrong base means wrong cost estimates.
 *
 * Bases:
 *  - "material"            → materials subtotal
 *  - "labor"               → labor subtotal
 *  - "equipment"           → equipment subtotal
 *  - "overhead"            → overhead subtotal
 *  - "material_labor"      → materials + labor
 *  - "labor_equipment"     → labor + equipment
 *  - "all"                 → all fixed ingredients
 *  - "all_including_pct"   → all fixed + previously-calculated percentage ingredients
 *  - default (unknown)     → all fixed (safe fallback)
 */

describe("resolvePercentageBase", () => {
  // Realistic numbers from a PCC 1:4:8 mix rate analysis
  const mat = 8500;   // cement + sand + aggregate
  const lab = 1200;   // mason + helper
  const eqp = 800;    // mixer
  const ovh = 500;    // sundries
  const allFixed = mat + lab + eqp + ovh; // 11000
  const runningPct = 1100; // 10% already added on previous pct ingredient

  describe("single-category bases", () => {
    it("returns material total for 'material'", () => {
      expect(resolvePercentageBase("material", mat, lab, eqp, ovh, allFixed, runningPct)).toBe(mat);
    });

    it("returns labor total for 'labor'", () => {
      expect(resolvePercentageBase("labor", mat, lab, eqp, ovh, allFixed, runningPct)).toBe(lab);
    });

    it("returns equipment total for 'equipment'", () => {
      expect(resolvePercentageBase("equipment", mat, lab, eqp, ovh, allFixed, runningPct)).toBe(eqp);
    });

    it("returns overhead total for 'overhead'", () => {
      expect(resolvePercentageBase("overhead", mat, lab, eqp, ovh, allFixed, runningPct)).toBe(ovh);
    });
  });

  describe("multi-category bases", () => {
    it("returns material + labor for 'material_labor'", () => {
      expect(resolvePercentageBase("material_labor", mat, lab, eqp, ovh, allFixed, runningPct)).toBe(mat + lab);
    });

    it("returns labor + equipment for 'labor_equipment'", () => {
      expect(resolvePercentageBase("labor_equipment", mat, lab, eqp, ovh, allFixed, runningPct)).toBe(lab + eqp);
    });
  });

  describe("aggregate bases", () => {
    it("returns all fixed total for 'all'", () => {
      expect(resolvePercentageBase("all", mat, lab, eqp, ovh, allFixed, runningPct)).toBe(allFixed);
    });

    it("returns all fixed + running pct for 'all_including_pct' (cascade tax)", () => {
      // E.g. for a 13% VAT applied AFTER a 10% contractor profit:
      // base = 11000 + 1100 = 12100
      expect(resolvePercentageBase("all_including_pct", mat, lab, eqp, ovh, allFixed, runningPct)).toBe(12100);
    });

    it("returns 0 for 'all_including_pct' when no prior pct ingredients", () => {
      expect(resolvePercentageBase("all_including_pct", mat, lab, eqp, ovh, allFixed, 0)).toBe(allFixed);
    });
  });

  describe("fallback behavior", () => {
    it("falls back to allFixedTotal for unknown pctBase", () => {
      expect(resolvePercentageBase("unknown_base", mat, lab, eqp, ovh, allFixed, runningPct)).toBe(allFixed);
    });

    it("falls back to allFixedTotal for empty string", () => {
      expect(resolvePercentageBase("", mat, lab, eqp, ovh, allFixed, runningPct)).toBe(allFixed);
    });
  });

  describe("edge cases", () => {
    it("handles all-zero inputs (returns 0)", () => {
      expect(resolvePercentageBase("all", 0, 0, 0, 0, 0, 0)).toBe(0);
    });

    it("handles negative runningPctTotal (defensive)", () => {
      // Negative running total shouldn't happen in practice, but
      // function should still compute without throwing.
      expect(resolvePercentageBase("all_including_pct", 100, 0, 0, 0, 100, -50)).toBe(50);
    });
  });
});

/**
 * computeRatePerUnit: total ingredient amounts / batchSize
 *
 * This is the core formula that was previously inlined incorrectly in
 * recalcAnalysis (which divided by item.quantity instead of batchSize).
 * Extracted as a pure function so it can be tested in isolation and
 * reused by the analysis-library router for display calculations.
 *
 * Real-world example (PCC 1:4:8, batchSize=1 cum):
 *   - cement: 4 bags × 800 = 3200
 *   - sand:   0.5 cum × 2000 = 1000
 *   - aggregate: 0.8 cum × 1500 = 1200
 *   - labor: 0.5 day × 2500 = 1250
 *   - total = 6650 per 1 cum
 *   - ratePerUnit = 6650 / 1 = 6650 NPR/cum
 */
describe("computeRatePerUnit", () => {
  const ingredients = [
    { amount: 3200 },  // cement
    { amount: 1000 },  // sand
    { amount: 1200 },  // aggregate
    { amount: 1250 },  // labor
  ];
  // total = 6650

  it("returns total / batchSize for batchSize=1 (per-unit convention)", () => {
    expect(computeRatePerUnit(ingredients, 1)).toBe(6650);
  });

  it("returns total / batchSize for batchSize=10 (batch-of-10 convention)", () => {
    // If batch is 10 cum and ingredients total 66500, rate per cum = 6650
    const bigBatch = ingredients.map((i) => ({ amount: i.amount * 10 }));
    expect(computeRatePerUnit(bigBatch, 10)).toBe(6650);
  });

  it("returns 0 for empty ingredients", () => {
    expect(computeRatePerUnit([], 1)).toBe(0);
  });

  it("treats batchSize=0 as 1 (defensive — avoids division by zero)", () => {
    expect(computeRatePerUnit(ingredients, 0)).toBe(6650);
  });

  it("treats negative batchSize as 1 (defensive)", () => {
    expect(computeRatePerUnit(ingredients, -5)).toBe(6650);
  });

  it("handles fractional batchSize (e.g., 0.5 cum)", () => {
    // If batch is 0.5 cum and ingredients total 3325, rate per cum = 6650
    const halfBatch = ingredients.map((i) => ({ amount: i.amount / 2 }));
    expect(computeRatePerUnit(halfBatch, 0.5)).toBe(6650);
  });

  it("handles single-ingredient analysis", () => {
    expect(computeRatePerUnit([{ amount: 1000 }], 1)).toBe(1000);
  });
});

/**
 * computeBoqAmount: quantity * rate
 *
 * Trivial but worth testing because it's the canonical way to compute
 * a BOQ line's total amount. Used after recalcAnalysis updates the rate.
 */
describe("computeBoqAmount", () => {
  it("returns quantity * rate for typical inputs", () => {
    // 100 cum at 6650/cum = 665,000
    expect(computeBoqAmount(100, 6650)).toBe(665000);
  });

  it("returns 0 when quantity is 0", () => {
    expect(computeBoqAmount(0, 6650)).toBe(0);
  });

  it("returns 0 when rate is 0", () => {
    expect(computeBoqAmount(100, 0)).toBe(0);
  });

  it("handles fractional quantities", () => {
    expect(computeBoqAmount(12.5, 800)).toBe(10000);
  });

  it("handles fractional rates", () => {
    expect(computeBoqAmount(100, 12.5)).toBe(1250);
  });

  it("handles both zero", () => {
    expect(computeBoqAmount(0, 0)).toBe(0);
  });
});

/**
 * Integration scenario: a full PCC 1:4:8 rate analysis → BOQ line.
 *
 * Verifies that the pure functions compose correctly to produce the
 * expected BOQ amount for a realistic construction scenario.
 */
describe("integration: PCC 1:4:8 rate analysis", () => {
  it("computes the correct BOQ amount for 100 cum of PCC", () => {
    // Batch of 1 cum of PCC M15:
    //   - cement:   4.5 bags × 800 = 3600
    //   - sand:     0.45 cum × 2000 = 900
    //   - aggregate: 0.9 cum × 1500 = 1350
    //   - labor:    0.5 day × 2500 = 1250
    //   - mixer:    0.3 day × 3000 = 900
    //   total per batch = 8000
    //   ratePerUnit = 8000 / 1 = 8000 NPR/cum
    //   BOQ: 100 cum × 8000 = 800,000 NPR
    const ingredients = [
      { amount: 3600 },
      { amount: 900 },
      { amount: 1350 },
      { amount: 1250 },
      { amount: 900 },
    ];
    const batchSize = 1;
    const boqQuantity = 100;

    const ratePerUnit = computeRatePerUnit(ingredients, batchSize);
    const boqAmount = computeBoqAmount(boqQuantity, ratePerUnit);

    expect(ratePerUnit).toBe(8000);
    expect(boqAmount).toBe(800000);
  });

  it("computes the correct BOQ amount for batch-of-10", () => {
    // Same PCC but batch size = 10 cum (ingredients are 10x larger)
    const ingredients = [
      { amount: 36000 },
      { amount: 9000 },
      { amount: 13500 },
      { amount: 12500 },
      { amount: 9000 },
    ];
    const batchSize = 10;
    const boqQuantity = 100;

    const ratePerUnit = computeRatePerUnit(ingredients, batchSize);
    const boqAmount = computeBoqAmount(boqQuantity, ratePerUnit);

    // Rate per cum should still be 8000, BOQ amount 800,000
    expect(ratePerUnit).toBe(8000);
    expect(boqAmount).toBe(800000);
  });
});
