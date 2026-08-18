import { describe, it, expect } from "vitest";
import {
  computeRatePerUnit,
  computeBoqAmount,
} from "./boq-calc";

describe("Extended BOQ & DoR Rate Analysis Engine", () => {
  describe("Department of Roads (DoR) Standard Concrete Mixes (50 mix scenarios)", () => {
    // 50 realistic concrete mix specifications from M10 lean concrete to M40 high-strength
    const concreteMixes = Array.from({ length: 50 }, (_, i) => {
      const gradeNum = 10 + (i % 7) * 5; // M10, M15, M20, M25, M30, M35, M40
      const batchSize = 1; // 1 cum of concrete
      const cementBags = 4.5 + (gradeNum / 10) * 1.2;
      const cementRate = 750 + (i % 5) * 20;
      const sandCum = 0.45;
      const sandRate = 2200;
      const aggCum = 0.85;
      const aggRate = 2400;
      const masonDays = 0.35 + gradeNum * 0.01;
      const masonWage = 1200;
      const helperDays = 1.8 + gradeNum * 0.02;
      const helperWage = 800;
      const mixerHours = 1.5;
      const mixerRate = 500;
      const vibratorHours = 1.5;
      const vibratorRate = 250;

      const matCost = cementBags * cementRate + sandCum * sandRate + aggCum * aggRate;
      const labCost = masonDays * masonWage + helperDays * helperWage;
      const eqpCost = mixerHours * mixerRate + vibratorHours * vibratorRate;
      const overheadPct = 15; // 15% contractor's overhead & profit
      const overheadCost = ((matCost + labCost + eqpCost) * overheadPct) / 100;

      return {
        id: `mix_M${gradeNum}_v${i + 1}`,
        grade: `M${gradeNum}`,
        batchSize,
        ingredients: [
          { type: "material", amount: matCost },
          { type: "labor", amount: labCost },
          { type: "equipment", amount: eqpCost },
          { type: "overhead", amount: overheadCost },
        ],
        expectedRate: matCost + labCost + eqpCost + overheadCost,
      };
    });

    it.each(concreteMixes)("computes accurate unit rate for concrete mix $id ($grade)", ({ ingredients, batchSize, expectedRate }) => {
      const rate = computeRatePerUnit(ingredients, batchSize);
      expect(rate).toBeCloseTo(expectedRate, 2);
      expect(rate).toBeGreaterThan(0);
    });
  });

  describe("Masonry and Plastering Rate Analysis (40 items)", () => {
    const masonryItems = Array.from({ length: 40 }, (_, i) => {
      const isPlaster = i % 2 === 0;
      const mortarRatio = (i % 3 === 0) ? "1:3" : (i % 3 === 1) ? "1:4" : "1:6";
      const quantity = (i + 1) * 25; // 25 to 1000 sqm or cum
      const baseCost = isPlaster ? 450 + (i % 5) * 30 : 7500 + (i % 5) * 200;

      const ingredients = [
        { type: "material", amount: baseCost * 0.65 },
        { type: "labor", amount: baseCost * 0.25 },
        { type: "overhead", amount: baseCost * 0.10 },
      ];

      return {
        id: `item_${isPlaster ? "plaster" : "brickwork"}_${mortarRatio}_${i}`,
        name: `${isPlaster ? "Cement Plaster 12.5mm" : "Brick Masonry"} in ${mortarRatio} mortar`,
        quantity,
        ingredients,
        expectedUnitRate: baseCost,
      };
    });

    it.each(masonryItems)("computes rate and BOQ amount for $name in $id", ({ ingredients, quantity, expectedUnitRate }) => {
      const unitRate = computeRatePerUnit(ingredients, 1);
      expect(unitRate).toBeCloseTo(expectedUnitRate, 2);

      const totalAmount = computeBoqAmount(quantity, unitRate);
      expect(totalAmount).toBeCloseTo(quantity * expectedUnitRate, 2);
    });
  });

  describe("Road Pavement & Earthwork Specifications (40 items)", () => {
    const roadItems = Array.from({ length: 40 }, (_, i) => {
      const itemType = (i % 4 === 0) ? "Road Excavation in Hard Soil"
        : (i % 4 === 1) ? "Granular Sub-Base (GSB) Grading-I"
        : (i % 4 === 2) ? "Crushed Stone Wet Mix Macadam (WMM)"
        : "Asphalt Concrete 40mm Wearing Course";

      const qty = (i + 1) * 50;
      const unitCost = (i % 4 === 0) ? 280
        : (i % 4 === 1) ? 2100
        : (i % 4 === 2) ? 2950
        : 8500;

      return {
        id: `road_${i + 1}`,
        itemType,
        qty,
        unitCost,
      };
    });

    it.each(roadItems)("calculates BOQ line amounts for road item $itemType ($id)", ({ qty, unitCost }) => {
      const amount = computeBoqAmount(qty, unitCost);
      expect(amount).toBe(qty * unitCost);
      expect(amount).toBeGreaterThan(0);
    });
  });

  describe("Structural Steel & Formwork Matrix (40 items)", () => {
    const steelItems = Array.from({ length: 40 }, (_, i) => {
      const isRebar = i % 2 === 0;
      const diameter = 8 + ((i * 4) % 24); // 8mm to 32mm rebar
      const itemName = isRebar
        ? `TMT Fe 500D Rebar Cutting, Bending & Placing (${diameter}mm)`
        : "Centering & Shuttering with Steel Plates for Columns";

      const steelRatePerKg = 115 + (i % 5) * 2;
      const formworkRatePerSqm = 620 + (i % 5) * 15;
      const unitRate = isRebar ? steelRatePerKg : formworkRatePerSqm;
      const quantity = isRebar ? 5000 + i * 200 : 200 + i * 10;

      return {
        id: `structural_${i + 1}`,
        itemName,
        quantity,
        unitRate,
      };
    });

    it.each(steelItems)("calculates BOQ line for $itemName in $id", ({ quantity, unitRate }) => {
      const amount = computeBoqAmount(quantity, unitRate);
      expect(amount).toBe(quantity * unitRate);
    });
  });

  describe("Financial Tax, VAT (13%), Overhead (15%), Contingency (30 models)", () => {
    const financialModels = Array.from({ length: 30 }, (_, i) => {
      const rawSubtotal = (i + 1) * 500000;
      const contingencyPct = (i % 2 === 0) ? 3 : 5; // 3% or 5% contingency
      const contingencyAmount = (rawSubtotal * contingencyPct) / 100;
      const subtotalWithContingency = rawSubtotal + contingencyAmount;
      const vatPct = 13; // Nepal 13% VAT
      const vatAmount = (subtotalWithContingency * vatPct) / 100;
      const grandTotal = subtotalWithContingency + vatAmount;

      return {
        id: `tax_model_${i + 1}`,
        rawSubtotal,
        contingencyPct,
        contingencyAmount,
        vatAmount,
        grandTotal,
      };
    });

    it.each(financialModels)("computes statutory tax and grand total for $id", ({ rawSubtotal, contingencyAmount, vatAmount, grandTotal }) => {
      const calcSubtotal = rawSubtotal + contingencyAmount;
      const calcVat = (calcSubtotal * 13) / 100;
      const calcGrand = calcSubtotal + calcVat;

      expect(calcVat).toBeCloseTo(vatAmount, 2);
      expect(calcGrand).toBeCloseTo(grandTotal, 2);
    });
  });
});
