import { describe, it, expect } from "vitest";
import { matchProcurementInvoice } from "./procurement-match";

describe("Central 3-Way Procurement Matching Engine", () => {
  const poItems = [
    { materialId: "cement", name: "OPC Cement", unit: "bags", orderedQty: 500, unitRate: 750 },
    { materialId: "sand", name: "River Sand", unit: "cu.m", orderedQty: 50, unitRate: 2800 },
  ];

  it("passes when invoice exactly matches accepted GRN delivery and PO rate", () => {
    const grnItems = [
      { materialId: "cement", receivedQty: 500, acceptedQty: 500, rejectedQty: 0 },
      { materialId: "sand", receivedQty: 50, acceptedQty: 50, rejectedQty: 0 },
    ];
    const invoiceItems = [
      { materialId: "cement", billedQty: 500, billedRate: 750 },
      { materialId: "sand", billedQty: 50, billedRate: 2800 },
    ];

    const res = matchProcurementInvoice({ poItems, grnItems, invoiceItems });

    expect(res.overallStatus).toBe("PASSED");
    expect(res.isPayable).toBe(true);
    expect(res.totalBilledAmount).toBe(515000);
    expect(res.totalApprovedPayableAmount).toBe(515000);
    expect(res.blockingReasons).toHaveLength(0);
  });

  it("blocks payment when vendor bills more than accepted delivery", () => {
    const grnItems = [
      { materialId: "cement", receivedQty: 400, acceptedQty: 380, rejectedQty: 20 },
    ];
    const invoiceItems = [
      { materialId: "cement", billedQty: 500, billedRate: 750 }, // Billed 500, but only 380 accepted
    ];

    const res = matchProcurementInvoice({ poItems, grnItems, invoiceItems });

    expect(res.overallStatus).toBe("BLOCKED");
    expect(res.isPayable).toBe(false);
    expect(res.blockingReasons[0]).toContain("Over-billed by 120.00 bags");
    expect(res.warnings[0]).toContain("20 bags rejected at site inspection");
    expect(res.totalApprovedPayableAmount).toBe(285000); // 380 accepted * 750
  });

  it("blocks payment when vendor increases unit rate above PO contract", () => {
    const grnItems = [
      { materialId: "cement", receivedQty: 500, acceptedQty: 500, rejectedQty: 0 },
    ];
    const invoiceItems = [
      { materialId: "cement", billedQty: 500, billedRate: 820 }, // PO rate was 750
    ];

    const res = matchProcurementInvoice({ poItems, grnItems, invoiceItems });

    expect(res.overallStatus).toBe("BLOCKED");
    expect(res.blockingReasons[0]).toContain("Invoiced rate NPR 820 exceeds PO rate NPR 750");
  });
});
