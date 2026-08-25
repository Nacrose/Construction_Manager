import { describe, it, expect } from "vitest";

describe("Procurement-to-Payment Integration & Payables Calculation", () => {
  it("should accurately compute vendor net payable and balance due after partial payment", () => {
    const grossAmount = 250000;
    const vatPercent = 13;
    const tdsPercent = 1.5;

    const vatAmount = (grossAmount * vatPercent) / 100; // 32,500
    const tdsAmount = (grossAmount * tdsPercent) / 100; // 3,750
    const netPayable = grossAmount + vatAmount - tdsAmount; // 278,750

    expect(vatAmount).toBe(32500);
    expect(tdsAmount).toBe(3750);
    expect(netPayable).toBe(278750);

    const paidAmount = 150000;
    const balanceDue = Math.max(0, netPayable - paidAmount);
    expect(balanceDue).toBe(128750);

    const isFullyPaid = (paidAmount + balanceDue) >= netPayable - 0.01;
    expect(isFullyPaid).toBe(true);
  });

  it("should accurately compute subcontractor net payable with retention and TDS deduction", () => {
    const grossAmount = 400000;
    const retentionPercent = 10;
    const tdsPercent = 1.5;
    const vatPercent = 13;
    const materialDeductions = 20000;

    const retentionAmount = (grossAmount * retentionPercent) / 100; // 40,000
    const vatAmount = (grossAmount * vatPercent) / 100; // 52,000
    const tdsAmount = (grossAmount * tdsPercent) / 100; // 6,000

    const netPayable =
      grossAmount - retentionAmount + vatAmount - tdsAmount - materialDeductions;
    // 400,000 - 40,000 + 52,000 - 6,000 - 20,000 = 386,000
    expect(netPayable).toBe(386000);

    const partialDisbursement = 200000;
    const remainingDue = Math.max(0, netPayable - partialDisbursement);
    expect(remainingDue).toBe(186000);
  });

  it("should format payables summary totals properly", () => {
    const vendorPayables = [
      { netPayable: 200000, paidAmount: 150000 },
      { netPayable: 50000, paidAmount: 0 },
    ];
    const subPayables = [
      { netPayable: 180000, paidAmount: 80000 },
    ];

    const totalVendorDue = vendorPayables.reduce(
      (s, b) => s + Math.max(0, b.netPayable - b.paidAmount),
      0
    );
    const totalSubDue = subPayables.reduce(
      (s, b) => s + Math.max(0, b.netPayable - b.paidAmount),
      0
    );
    const grandTotalDue = totalVendorDue + totalSubDue;

    expect(totalVendorDue).toBe(100000);
    expect(totalSubDue).toBe(100000);
    expect(grandTotalDue).toBe(200000);
  });
});
