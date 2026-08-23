import { describe, it, expect } from "vitest";
import { round2, roundFinancials } from "@/lib/decimal-precision";

describe("decimal-precision — round2", () => {
  it("rounds to 2 decimal places", () => {
    expect(round2(123.456)).toBe(123.46);
    expect(round2(123.454)).toBe(123.45);
    expect(round2(123.4)).toBe(123.4);
    expect(round2(123)).toBe(123);
  });

  it("handles NPR amounts correctly", () => {
    expect(round2(1000.005)).toBe(1000.01); // rounds up at .005
    expect(round2(1000.004)).toBe(1000.0);
    expect(round2(999999999.99)).toBe(999999999.99); // within Decimal(15,2) range
  });

  it("handles negative amounts (refunds/credits)", () => {
    expect(round2(-123.456)).toBe(-123.46);
    expect(round2(-0.004)).toBe(-0.0);
  });

  it("handles zero", () => {
    expect(round2(0)).toBe(0);
    expect(round2(0.001)).toBe(0);
  });

  it("prevents floating-point drift accumulation", () => {
    // Simulate 1000 additions of 0.1 + 0.2 (classic float issue)
    let floatResult = 0;
    for (let i = 0; i < 1000; i++) {
      floatResult = round2(floatResult + round2(0.1 + 0.2));
    }
    // Without round2: floatResult would be 299.99999999999745
    // With round2: should be exactly 300
    expect(floatResult).toBe(300);
  });
});

describe("decimal-precision — roundFinancials", () => {
  it("rounds all numbers in a flat object", () => {
    const result = roundFinancials({
      amount: 123.456,
      rate: 99.999,
      name: "test",
      isActive: true,
    });
    expect(result.amount).toBe(123.46);
    expect(result.rate).toBe(100);
    expect(result.name).toBe("test");
    expect(result.isActive).toBe(true);
  });

  it("rounds numbers in nested objects", () => {
    const result = roundFinancials({
      summary: {
        totalRevenue: 100000.005,
        totalCosts: 87654.321,
      },
      items: [
        { amount: 123.456 },
        { amount: 789.012 },
      ],
    });
    expect(result.summary.totalRevenue).toBe(100000.01);
    expect(result.summary.totalCosts).toBe(87654.32);
    expect(result.items[0].amount).toBe(123.46);
    expect(result.items[1].amount).toBe(789.01);
  });

  it("handles null and undefined", () => {
    const result = roundFinancials({
      amount: 123.456,
      nullValue: null,
      undefinedValue: undefined,
    });
    expect(result.amount).toBe(123.46);
    expect(result.nullValue).toBeNull();
    expect(result.undefinedValue).toBeUndefined();
  });

  it("handles empty objects and arrays", () => {
    expect(roundFinancials({})).toEqual({});
    expect(roundFinancials([])).toEqual([]);
  });
});
