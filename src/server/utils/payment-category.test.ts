import { describe, it, expect } from "vitest";
import { DEFAULT_NEPAL_PAYMENT_CATEGORIES } from "@/server/routers/payment-category";

describe("Payment Category Hierarchy & Nepal Construction Presets", () => {
  it("should contain standard construction cost heads", () => {
    const headNames = DEFAULT_NEPAL_PAYMENT_CATEGORIES.map((c) => c.name);
    expect(headNames).toContain("Site Overheads");
    expect(headNames).toContain("Materials");
    expect(headNames).toContain("Subcontractors & Piece-rate");
    expect(headNames).toContain("Plant & Machinery");
    expect(headNames).toContain("Direct Site Labor");
    expect(headNames).toContain("Statutory Taxes & Financial");
    expect(headNames).toContain("Advances & Security Deposits");
  });

  it("Site Overheads should include Food/Mess, Transport, Rent, Utilities, Safety, and Lab testing", () => {
    const ovh = DEFAULT_NEPAL_PAYMENT_CATEGORIES.find((c) => c.name === "Site Overheads");
    expect(ovh).toBeDefined();
    const subNames = ovh!.subcategories.map((s) => s.name);
    expect(subNames).toContain("Food & Mess / Khaja");
    expect(subNames).toContain("Transport, Fuel & Vehicle Travel");
    expect(subNames).toContain("Site Office & Camp Rent");
    expect(subNames).toContain("Electricity, Water & Utilities");
    expect(subNames).toContain("Safety Gear & PPE");
    expect(subNames).toContain("Lab & Quality Testing");
  });

  it("Plant & Machinery should include Spot Hire, Diesel, and Maintenance", () => {
    const eqp = DEFAULT_NEPAL_PAYMENT_CATEGORIES.find((c) => c.name === "Plant & Machinery");
    expect(eqp).toBeDefined();
    const subNames = eqp!.subcategories.map((s) => s.name);
    expect(subNames).toContain("Equipment Spot Hire / Hourly");
    expect(subNames).toContain("Heavy Equipment Diesel / Fuel");
    expect(subNames).toContain("Servicing & Routine Maintenance");
  });

  it("computes net disbursement with TDS withholding accurately", () => {
    const gross = 150000;
    const tdsRate = 0.015; // 1.5% under Nepal Sec 89
    const tds = gross * tdsRate;
    const net = gross - tds;
    expect(tds).toBe(2250);
    expect(net).toBe(147750);
  });
});
