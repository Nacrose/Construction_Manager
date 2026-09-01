import { describe, it, expect } from "vitest";
import {
  vendorPaymentEntry,
  ipcBillingEntry,
  clientReceiptEntry,
  type JournalEntryInput,
} from "@/lib/journal-entry";

// We can't call createJournalEntry without a DB, but we CAN test
// the helper functions that build the JournalEntryInput objects.
// Each helper must produce a BALANCED entry (totalDebit === totalCredit).

function checkBalance(input: JournalEntryInput): { debit: number; credit: number; balanced: boolean } {
  const debit = input.lines.reduce((s, l) => s + (l.debit || 0), 0);
  const credit = input.lines.reduce((s, l) => s + (l.credit || 0), 0);
  return { debit, credit, balanced: Math.abs(debit - credit) < 0.01 };
}

describe("Journal Entry Helpers — Balance Validation", () => {
  describe("vendorPaymentEntry", () => {
    it("produces balanced entry for cash payment with no TDS", () => {
      const entry = vendorPaymentEntry({
        vendorBillId: "test-1",
        vendorName: "Test Vendor",
        amount: 1000,
        tdsDeducted: 0,
        netPaid: 1000,
        paymentMode: "cash",
        date: new Date(),
      });
      const { debit, credit, balanced } = checkBalance(entry);
      expect(balanced).toBe(true);
      expect(debit).toBe(1000);
      expect(credit).toBe(1000);
    });

    it("produces balanced entry for bank payment with TDS", () => {
      const entry = vendorPaymentEntry({
        vendorBillId: "test-2",
        vendorName: "Test Vendor",
        amount: 10000,
        tdsDeducted: 150,
        netPaid: 9850,
        paymentMode: "bank_transfer",
        date: new Date(),
      });
      const { debit, credit, balanced } = checkBalance(entry);
      expect(balanced).toBe(true);
      expect(debit).toBe(10000);
      expect(credit).toBe(150 + 9850);
    });

    it("throws on inconsistent amount/tds/netPaid", () => {
      expect(() =>
        vendorPaymentEntry({
          vendorBillId: "test-3",
          vendorName: "Test Vendor",
          amount: 1000,
          tdsDeducted: 100,
          netPaid: 1000, // should be 900
          paymentMode: "cash",
          date: new Date(),
        }),
      ).toThrow(/must equal/);
    });

    it("produces balanced entry with zero TDS and zero netPaid (edge case)", () => {
      const entry = vendorPaymentEntry({
        vendorBillId: "test-4",
        vendorName: "Test Vendor",
        amount: 0,
        tdsDeducted: 0,
        netPaid: 0,
        paymentMode: "cash",
        date: new Date(),
      });
      const { balanced } = checkBalance(entry);
      expect(balanced).toBe(true);
    });
  });

  describe("ipcBillingEntry", () => {
    it("produces balanced entry with no retention, no TDS, no VAT", () => {
      const entry = ipcBillingEntry({
        ipcId: "ipc-1",
        ipcNumber: "IPC-001",
        grossAmount: 100000,
        vatAmount: 0,
        retentionAmount: 0,
        tdsAmount: 0,
        projectId: "proj-1",
        date: new Date(),
      });
      const { debit, credit, balanced } = checkBalance(entry);
      expect(balanced).toBe(true);
      expect(debit).toBe(100000);
      expect(credit).toBe(100000);
    });

    it("produces balanced entry with VAT only", () => {
      const entry = ipcBillingEntry({
        ipcId: "ipc-2",
        ipcNumber: "IPC-002",
        grossAmount: 100000,
        vatAmount: 13000,
        retentionAmount: 0,
        tdsAmount: 0,
        projectId: "proj-1",
        date: new Date(),
      });
      const { debit, credit, balanced } = checkBalance(entry);
      expect(balanced).toBe(true);
      expect(debit).toBe(113000);
      expect(credit).toBe(100000 + 13000);
    });

    it("produces balanced entry with retention only", () => {
      const entry = ipcBillingEntry({
        ipcId: "ipc-3",
        ipcNumber: "IPC-003",
        grossAmount: 100000,
        vatAmount: 0,
        retentionAmount: 5000,
        tdsAmount: 0,
        projectId: "proj-1",
        date: new Date(),
      });
      const { debit, credit, balanced } = checkBalance(entry);
      expect(balanced).toBe(true);
      expect(debit).toBe(95000 + 5000);
      expect(credit).toBe(100000);
    });

    it("produces balanced entry with TDS only", () => {
      const entry = ipcBillingEntry({
        ipcId: "ipc-4",
        ipcNumber: "IPC-004",
        grossAmount: 100000,
        vatAmount: 0,
        retentionAmount: 0,
        tdsAmount: 1500,
        projectId: "proj-1",
        date: new Date(),
      });
      const { debit, credit, balanced } = checkBalance(entry);
      expect(balanced).toBe(true);
      expect(debit).toBe(98500 + 1500);
      expect(credit).toBe(100000);
    });

    it("produces balanced entry with VAT + retention + TDS (the full case)", () => {
      const entry = ipcBillingEntry({
        ipcId: "ipc-5",
        ipcNumber: "IPC-005",
        grossAmount: 100000,
        vatAmount: 13000,
        retentionAmount: 5000,
        tdsAmount: 1500,
        projectId: "proj-1",
        date: new Date(),
      });
      const { debit, credit, balanced } = checkBalance(entry);
      expect(balanced).toBe(true);
      // Dr: (100000 + 13000 - 5000 - 1500) + 5000 + 1500 = 113000
      expect(debit).toBe(113000);
      // Cr: 100000 + 13000 = 113000
      expect(credit).toBe(113000);
    });

    it("throws when retention + TDS exceeds gross + VAT (data error)", () => {
      expect(() =>
        ipcBillingEntry({
          ipcId: "ipc-6",
          ipcNumber: "IPC-006",
          grossAmount: 10000,
          vatAmount: 0,
          retentionAmount: 8000,
          tdsAmount: 5000, // 8000 + 5000 = 13000 > 10000
          projectId: "proj-1",
          date: new Date(),
        }),
      ).toThrow(/deductions.*exceed total bill/);
    });

    it("produces balanced entry with zero amounts (edge case)", () => {
      const entry = ipcBillingEntry({
        ipcId: "ipc-7",
        ipcNumber: "IPC-007",
        grossAmount: 0,
        vatAmount: 0,
        retentionAmount: 0,
        tdsAmount: 0,
        projectId: "proj-1",
        date: new Date(),
      });
      const { balanced } = checkBalance(entry);
      expect(balanced).toBe(true);
    });
  });

  describe("Entry structure", () => {
    it("vendorPaymentEntry uses correct account codes", () => {
      const entry = vendorPaymentEntry({
        vendorBillId: "test",
        vendorName: "Vendor",
        amount: 1000,
        tdsDeducted: 0,
        netPaid: 1000,
        paymentMode: "bank_transfer",
        date: new Date(),
      });
      expect(entry.lines[0].accountCode).toBe("2001"); // Sundry Creditors
      expect(entry.lines[1].accountCode).toBe("1010"); // Bank
    });

    it("vendorPaymentEntry uses cash account code for cash payments", () => {
      const entry = vendorPaymentEntry({
        vendorBillId: "test",
        vendorName: "Vendor",
        amount: 1000,
        tdsDeducted: 0,
        netPaid: 1000,
        paymentMode: "cash",
        date: new Date(),
      });
      expect(entry.lines[1].accountCode).toBe("1001"); // Cash
    });

    it("ipcBillingEntry uses correct account codes", () => {
      const entry = ipcBillingEntry({
        ipcId: "ipc",
        ipcNumber: "IPC-001",
        grossAmount: 100000,
        vatAmount: 13000,
        retentionAmount: 5000,
        tdsAmount: 1500,
        projectId: "proj",
        date: new Date(),
      });
      const codes = entry.lines.map((l) => l.accountCode);
      expect(codes).toContain("1100"); // Client Receivables
      expect(codes).toContain("1110"); // Retention Receivable
      expect(codes).toContain("1400"); // TDS Receivable
      expect(codes).toContain("4001"); // Contract Revenue
      expect(codes).toContain("2021"); // VAT Payable
    });

    it("ipcBillingEntry omits retention line when retentionAmount is 0", () => {
      const entry = ipcBillingEntry({
        ipcId: "ipc",
        ipcNumber: "IPC-001",
        grossAmount: 100000,
        vatAmount: 0,
        retentionAmount: 0,
        tdsAmount: 0,
        projectId: "proj",
        date: new Date(),
      });
      const codes = entry.lines.map((l) => l.accountCode);
      expect(codes).not.toContain("1110");
    });

    it("ipcBillingEntry omits TDS line when tdsAmount is 0", () => {
      const entry = ipcBillingEntry({
        ipcId: "ipc",
        ipcNumber: "IPC-001",
        grossAmount: 100000,
        vatAmount: 0,
        retentionAmount: 0,
        tdsAmount: 0,
        projectId: "proj",
        date: new Date(),
      });
      const codes = entry.lines.map((l) => l.accountCode);
      expect(codes).not.toContain("1400");
    });
  });

  // ── clientReceiptEntry — the cash-in side of the GL ──────────────
  describe("clientReceiptEntry", () => {
    const base = {
      receiptId: "pay-1",
      receivedFrom: "Department of Roads",
      amount: 500000,
      projectId: "proj-1",
      date: new Date("2026-03-01"),
    };

    it.each([
      ["Client IPC Running Bill", "1100"],
      ["Mobilization Advance", "2050"],
      ["Partner Capital Deposit", "3000"],
      ["Security Deposit Refund", "1110"],
      ["Other Site Inflow", "4100"],
    ] as const)("credits the correct account for %s", (inflowType, expectedCreditCode) => {
      const je = clientReceiptEntry({ ...base, inflowType, paymentMode: "bank_transfer" });
      expect(je.lines).toHaveLength(2);
      const credit = je.lines.find((l) => (l.credit ?? 0) > 0)!;
      expect(credit.accountCode).toBe(expectedCreditCode);
      expect(credit.credit).toBe(500000);
    });

    it("debits Bank (1010) for bank transfers and Cash (1001) for cash", () => {
      const bankJe = clientReceiptEntry({ ...base, inflowType: "Client IPC Running Bill", paymentMode: "bank_transfer" });
      expect(bankJe.lines.find((l) => (l.debit ?? 0) > 0)!.accountCode).toBe("1010");

      const cashJe = clientReceiptEntry({ ...base, inflowType: "Client IPC Running Bill", paymentMode: "cash" });
      expect(cashJe.lines.find((l) => (l.debit ?? 0) > 0)!.accountCode).toBe("1001");
    });

    it("always produces a balanced entry", () => {
      for (const inflowType of [
        "Client IPC Running Bill",
        "Mobilization Advance",
        "Partner Capital Deposit",
        "Security Deposit Refund",
        "Other Site Inflow",
      ] as const) {
        const je = clientReceiptEntry({ ...base, inflowType, paymentMode: "cheque" });
        const { balanced } = checkBalance(je);
        expect(balanced).toBe(true);
      }
    });

    it("client IPC receipt does NOT credit revenue (revenue was recognized at IPC certification)", () => {
      const je = clientReceiptEntry({ ...base, inflowType: "Client IPC Running Bill", paymentMode: "bank_transfer" });
      const codes = je.lines.map((l) => l.accountCode);
      expect(codes).not.toContain("4001");
    });

    it("throws on non-positive amount", () => {
      expect(() =>
        clientReceiptEntry({ ...base, inflowType: "Other Site Inflow", amount: 0, paymentMode: "cash" }),
      ).toThrow(/positive/);
    });

    it("uses source 'receipt' and links the Payment row", () => {
      const je = clientReceiptEntry({ ...base, inflowType: "Other Site Inflow", paymentMode: "bank_transfer" });
      expect(je.source).toBe("receipt");
      expect(je.sourceRefId).toBe("pay-1");
      expect(je.sourceRefType).toBe("Payment");
    });
  });
});
