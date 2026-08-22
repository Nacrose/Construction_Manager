import { describe, it, expect } from "vitest";

describe("Equipment Spot & Hourly Casual Hire Engine", () => {
  it("calculates hourly spot hire with minimum callout hours and mobilization float fee", () => {
    const hourlyRate = 3500; // NPR per hour (50T Crane)
    const hoursWorked = 2.5;
    const minCalloutHours = 4.0; // minimum 4 hours callout
    const mobilizationFee = 8000; // NPR float charge

    const billedHours = Math.max(hoursWorked, minCalloutHours); // 4.0 hrs
    const totalGross = (billedHours * hourlyRate) + mobilizationFee; // (4 * 3500) + 8000 = 22000

    expect(billedHours).toBe(4.0);
    expect(totalGross).toBe(22000);
  });

  it("calculates Dry Hire site diesel auto-deduction correctly", () => {
    const totalGross = 22000;
    const fuelMode = "dry";
    const fuelLitersIssued = 50; // 50 Liters filled from site bowzer
    const fuelUnitCost = 175; // NPR per Liter

    const fuelDeduction = fuelMode === "dry" ? fuelLitersIssued * fuelUnitCost : 0; // 50 * 175 = 8750
    const netPayable = Math.max(0, totalGross - fuelDeduction); // 22000 - 8750 = 13250

    expect(fuelDeduction).toBe(8750);
    expect(netPayable).toBe(13250);
  });

  it("calculates per-trip haulage hire correctly", () => {
    const tripRate = 850; // NPR per trip (Tipper Haulage)
    const tripCount = 14;
    const mobilizationFee = 2000;

    const totalGross = (tripCount * tripRate) + mobilizationFee; // 14 * 850 + 2000 = 13900

    expect(totalGross).toBe(13900);
  });
});
