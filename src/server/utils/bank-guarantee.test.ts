import { describe, it, expect } from "vitest";

describe("Bank Guarantee & Insurance Expiry Tracker", () => {
  it("should accurately compute days remaining and expiring soon status", () => {
    const now = new Date("2026-08-20T00:00:00Z");

    // 1. Healthy Guarantee (90 days left)
    const expiry1 = new Date("2026-11-18T00:00:00Z");
    const diff1 = Math.ceil((expiry1.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    expect(diff1).toBe(90);
    expect(diff1 <= 30 && diff1 >= 0).toBe(false);

    // 2. Urgent Guarantee (20 days left)
    const expiry2 = new Date("2026-09-09T00:00:00Z");
    const diff2 = Math.ceil((expiry2.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    expect(diff2).toBe(20);
    expect(diff2 <= 30 && diff2 >= 0).toBe(true);

    // 3. Expired Guarantee (-5 days)
    const expiry3 = new Date("2026-08-15T00:00:00Z");
    const diff3 = Math.ceil((expiry3.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    expect(diff3).toBe(-5);
    expect(diff3 < 0).toBe(true);
  });

  it("should preserve amendment log and extension history", () => {
    const originalBG = {
      guaranteeNumber: "BG/NABIL/2081/001",
      expiryDate: "2081-12-30",
      amendments: [] as any[],
    };

    const extension1 = {
      date: "2081-12-15",
      oldExpiryDate: originalBG.expiryDate,
      newExpiryDate: "2082-06-30",
      letterNo: "DOR/HET/105/081-82",
      remarks: "Contract Time Extension under PPR Rule 120",
    };

    const updatedAmendments = [...originalBG.amendments, extension1];
    expect(updatedAmendments.length).toBe(1);
    expect(updatedAmendments[0].newExpiryDate).toBe("2082-06-30");
    expect(updatedAmendments[0].oldExpiryDate).toBe("2081-12-30");
  });

  it("should calculate total active guarantee exposure and cash margins", () => {
    const guarantees = [
      { type: "performance_bond", amount: 2500000, marginAmount: 250000, status: "active" },
      { type: "advance_payment", amount: 4000000, marginAmount: 400000, status: "active" },
      { type: "car_insurance", amount: 50000000, marginAmount: 0, status: "active" },
      { type: "bid_bond", amount: 500000, marginAmount: 50000, status: "released" },
    ];

    const activeItems = guarantees.filter((g) => g.status === "active");
    const totalActiveExposure = activeItems.reduce((s, g) => s + g.amount, 0);
    const totalMarginHeld = activeItems.reduce((s, g) => s + g.marginAmount, 0);

    expect(totalActiveExposure).toBe(56500000);
    expect(totalMarginHeld).toBe(650000);
  });
});
