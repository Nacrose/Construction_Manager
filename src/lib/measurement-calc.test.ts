import { describe, it, expect } from "vitest";
import { calculateMeasurementSheet, calculateLineQuantity } from "./measurement-calc";

describe("Central Measurement Sheet Takeoff Calculator", () => {
  it("calculates 3D rectangular volume for multiple items", () => {
    const qty = calculateLineQuantity({
      description: "Isolated Footing F1",
      nos: 4,
      length: 2.0,
      breadth: 2.0,
      height: 0.5,
    });
    // 4 * 2 * 2 * 0.5 = 8.0 cu.m
    expect(qty).toBe(8.0);
  });

  it("calculates circular cylinder volume for piles", () => {
    const qty = calculateLineQuantity({
      description: "Bored Cast-in-situ Pile 600mm",
      shape: "circular",
      nos: 2,
      diameter: 0.6,
      height: 10,
    });
    // 2 * (pi * 0.3^2) * 10 = 2 * 0.28274 * 10 = 5.655 cu.m
    expect(qty).toBeCloseTo(5.655, 2);
  });

  it("correctly rolls up sheet with door & window deductions", () => {
    const lines = [
      {
        description: "Brick Masonry External Walls",
        nos: 2,
        length: 10,
        breadth: 0.23,
        height: 3.0,
      }, // 2 * 10 * 0.23 * 3 = 13.8 cu.m
      {
        description: "Deduction for Door D1",
        nos: 1,
        length: 1.0,
        breadth: 0.23,
        height: 2.1,
        isDeduction: true,
      }, // 1 * 1.0 * 0.23 * 2.1 = 0.483 cu.m
    ];

    const res = calculateMeasurementSheet(lines);

    expect(res.grossQuantity).toBe(13.8);
    expect(res.totalDeductions).toBe(0.483);
    expect(res.netQuantity).toBe(13.317);
  });
});
