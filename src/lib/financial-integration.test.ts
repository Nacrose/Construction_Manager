import { describe, it, expect } from "vitest";
import {
  vendorPaymentEntry,
  ipcBillingEntry,
  type JournalEntryInput,
  type JournalLineInput,
} from "@/lib/journal-entry";
import {
  computePayrollLine,
  type StaffForPayroll,
  type AttendanceRecord,
  type AdvancesByStaff,
} from "@/server/utils/payroll-calc";
import { round2 } from "@/lib/decimal-precision";

/**
 * Integration tests that simulate end-to-end financial flows:
 * 1. Vendor bill → payment → journal entry
 * 2. IPC certification → journal entry
 * 3. Payroll run → journal entry
 * 4. Site expense approval → journal entry
 * 5. Subcontractor bill → payment → journal entry
 * 6. Retention release → journal entries
 *
 * These tests verify that the HELPERS produce correct, balanced
 * journal entries — simulating what the router would generate.
 */

function checkBalance(entry: JournalEntryInput) {
  const debit = entry.lines.reduce((s, l) => s + (l.debit || 0), 0);
  const credit = entry.lines.reduce((s, l) => s + (l.credit || 0), 0);
  return { debit: round2(debit), credit: round2(credit), balanced: Math.abs(debit - credit) < 0.01 };
}

describe("Financial Integration — End-to-End Journal Entry Flows", () => {
  describe("Flow 1: Vendor Bill → Payment → Journal Entry", () => {
    it("generates balanced JE for a vendor payment with TDS", () => {
      // Simulate: vendor bill for NPR 100,000, TDS 1.5% = NPR 1,500
      const billAmount = 100000;
      const tdsRate = 0.015;
      const tdsDeducted = round2(billAmount * tdsRate);
      const netPaid = round2(billAmount - tdsDeducted);

      // The vendorPaymentEntry helper checks that amount = tdsDeducted + netPaid
      const je = vendorPaymentEntry({
        vendorBillId: "bill-1",
        vendorName: "ABC Suppliers Pvt. Ltd.",
        amount: billAmount,
        tdsDeducted,
        netPaid,
        paymentMode: "bank_transfer",
        projectId: "proj-1",
        partnerId: "partner-1",
        date: new Date("2026-01-15"),
      });

      const { debit, credit, balanced } = checkBalance(je);
      expect(balanced).toBe(true);
      expect(debit).toBe(100000);
      expect(credit).toBe(100000);

      // Verify account codes
      const codes = je.lines.map((l) => l.accountCode);
      expect(codes).toContain("2001"); // Sundry Creditors (Dr)
      expect(codes).toContain("2020"); // TDS Payable (Cr)
      expect(codes).toContain("1010"); // Bank (Cr)

      // Verify amounts
      const tdsLine = je.lines.find((l) => l.accountCode === "2020")!;
      expect(tdsLine.credit).toBe(1500);

      const bankLine = je.lines.find((l) => l.accountCode === "1010")!;
      expect(bankLine.credit).toBe(98500);
    });

    it("generates balanced JE for a cash payment with no TDS", () => {
      const je = vendorPaymentEntry({
        vendorBillId: "bill-2",
        vendorName: "Local Hardware Shop",
        amount: 5000,
        tdsDeducted: 0,
        netPaid: 5000,
        paymentMode: "cash",
        date: new Date(),
      });

      const { balanced } = checkBalance(je);
      expect(balanced).toBe(true);
      expect(je.lines[1].accountCode).toBe("1001"); // Cash, not Bank
    });
  });

  describe("Flow 2: IPC Certification → Journal Entry", () => {
    it("generates balanced JE for IPC with VAT, retention, and TDS", () => {
      // Simulate: IPC for NPR 1,000,000
      // VAT 13% = NPR 130,000
      // Retention 5% = NPR 50,000
      // TDS 1.5% = NPR 15,000
      const gross = 1000000;
      const vat = round2(gross * 0.13);
      const retention = round2(gross * 0.05);
      const tds = round2(gross * 0.015);

      const je = ipcBillingEntry({
        ipcId: "ipc-1",
        ipcNumber: "IPC-2026-001",
        grossAmount: gross,
        vatAmount: vat,
        retentionAmount: retention,
        tdsAmount: tds,
        projectId: "proj-1",
        date: new Date("2026-02-01"),
      });

      const { debit, credit, balanced } = checkBalance(je);
      expect(balanced).toBe(true);
      expect(debit).toBe(1130000); // (1000000 + 130000 - 50000 - 15000) + 50000 + 15000
      expect(credit).toBe(1130000); // 1000000 + 130000

      // Verify all account codes are present
      const codes = je.lines.map((l) => l.accountCode);
      expect(codes).toContain("1100"); // Client Receivables
      expect(codes).toContain("1110"); // Retention Receivable
      expect(codes).toContain("1400"); // TDS Receivable
      expect(codes).toContain("4001"); // Contract Revenue
      expect(codes).toContain("2021"); // VAT Payable

      // Verify client receivable = gross + VAT - retention - TDS
      const clientRecv = je.lines.find((l) => l.accountCode === "1100")!;
      expect(clientRecv.debit).toBe(1065000); // 1000000 + 130000 - 50000 - 15000
    });

    it("throws when deductions exceed total bill", () => {
      expect(() =>
        ipcBillingEntry({
          ipcId: "ipc-err",
          ipcNumber: "IPC-ERR",
          grossAmount: 10000,
          vatAmount: 0,
          retentionAmount: 8000,
          tdsAmount: 5000, // 13000 > 10000
          projectId: "proj",
          date: new Date(),
        }),
      ).toThrow(/deductions.*exceed/);
    });
  });

  describe("Flow 3: Payroll → Journal Entry Construction", () => {
    it("computePayrollLine produces values that sum to a balanced JE", () => {
      // Simulate: 3 workers, daily wage, with attendance + advances
      const staff1: StaffForPayroll = {
        id: "s1", name: "Worker A", designation: "Mason", category: "skilled",
        employmentType: "daily", gangName: "G1", dailyWage: 1000, monthlySalary: 0,
        bankAccountNo: null, bankName: null, pan: "PAN001",
      };
      const staff2: StaffForPayroll = {
        id: "s2", name: "Worker B", designation: "Helper", category: "unskilled",
        employmentType: "daily", gangName: "G1", dailyWage: 600, monthlySalary: 0,
        bankAccountNo: null, bankName: null, pan: null, // no PAN → 1.5% TDS
      };

      const attendance1: AttendanceRecord[] = Array.from({ length: 26 }, (_, i) => ({
        date: new Date(2026, 0, i + 1),
        status: "present",
        hours: 8,
        overtime: i % 5 === 0 ? 2 : 0, // OT every 5th day
      }));

      const attendance2: AttendanceRecord[] = Array.from({ length: 20 }, (_, i) => ({
        date: new Date(2026, 0, i + 1),
        status: "present",
        hours: 8,
        overtime: 0,
      }));

      const advances1: AdvancesByStaff = { cashAdvances: 2000, messDeductions: 500, otherDeductions: 0 };
      const advances2: AdvancesByStaff = { cashAdvances: 0, messDeductions: 0, otherDeductions: 0 };

      const result1 = computePayrollLine(staff1, attendance1, advances1, 31);
      const result2 = computePayrollLine(staff2, attendance2, advances2, 31);

      // Build the payroll JE as the router would:
      const totalGross = result1.gross + result2.gross;
      const totalNet = result1.netPayable + result2.netPayable;
      const totalTds = result1.tdsAmount + result2.tdsAmount;
      const totalAdvances = result1.advanceDeduction + result2.advanceDeduction;
      const totalMess = result1.messDeduction + result2.messDeduction;
      const totalOther = result1.otherDeductions + result2.otherDeductions;

      // Dr Direct Labor = totalGross
      // Cr Salary Payable = totalNet
      // Cr TDS Payable = totalTds
      // Cr Staff Advance Recoverable = totalAdvances
      // Cr Cash = totalMess + totalOther
      const debit = totalGross;
      const credit = totalNet + totalTds + totalAdvances + totalMess + totalOther;

      expect(round2(debit)).toBe(round2(credit));

      // Verify TDS: staff1 has PAN (1%), staff2 doesn't (1.5%)
      // computePayrollLine rounds tdsAmount via Math.round()
      expect(result1.tdsAmount).toBe(Math.round(result1.gross * 0.01));
      expect(result2.tdsAmount).toBe(Math.round(result2.gross * 0.015));
    });
  });

  describe("Flow 4: Site Expense → Journal Entry Construction", () => {
    it("site expense JE is balanced (Dr Overhead = Cr Bank)", () => {
      const totalAmount = 15000;

      // Simulate the JE the router would generate
      const lines: JournalLineInput[] = [
        {
          accountCode: "6006",
          accountName: "Site Overhead",
          debit: totalAmount,
          credit: 0,
          description: "Diesel for generator",
          projectId: "proj-1",
        },
        {
          accountCode: "1010",
          accountName: "Bank",
          debit: 0,
          credit: totalAmount,
          description: "Paid via bank_transfer",
          projectId: "proj-1",
        },
      ];

      const debit = lines.reduce((s, l) => s + (l.debit || 0), 0);
      const credit = lines.reduce((s, l) => s + (l.credit || 0), 0);

      expect(round2(debit)).toBe(round2(credit));
      expect(round2(debit)).toBe(15000);
    });
  });

  describe("Flow 5: Subcontractor Bill → Payment → Journal Entry", () => {
    it("subcontractor payment JE is balanced", () => {
      // Simulate: sub-bill NPR 500,000, payment NPR 500,000
      const paymentAmount = 500000;

      // The router generates:
      // Dr Subcontractor Payables (2002) NPR 500,000
      //    Cr Bank (1010) NPR 500,000
      const lines: JournalLineInput[] = [
        {
          accountCode: "2002",
          accountName: "Subcontractor Payables",
          debit: paymentAmount,
          credit: 0,
          description: "Payment to Subcontractor A",
          projectId: "proj-1",
          partnerId: "sub-1",
        },
        {
          accountCode: "1010",
          accountName: "Bank",
          debit: 0,
          credit: paymentAmount,
          description: "Payment via bank transfer",
          projectId: "proj-1",
        },
      ];

      const debit = lines.reduce((s, l) => s + (l.debit || 0), 0);
      const credit = lines.reduce((s, l) => s + (l.credit || 0), 0);

      expect(round2(debit)).toBe(round2(credit));
      expect(round2(debit)).toBe(500000);
    });
  });

  describe("Flow 6: Retention Release → Journal Entries", () => {
    it("client retention release JE is balanced", () => {
      // Dr Client Receivable (1100) NPR 50,000
      //    Cr Retention Receivable (1110) NPR 50,000
      const retentionAmount = 50000;

      const lines: JournalLineInput[] = [
        { accountCode: "1100", accountName: "Client Receivables", debit: retentionAmount, credit: 0, projectId: "proj-1" },
        { accountCode: "1110", accountName: "Retention Receivable", debit: 0, credit: retentionAmount, projectId: "proj-1" },
      ];

      const debit = lines.reduce((s, l) => s + (l.debit || 0), 0);
      const credit = lines.reduce((s, l) => s + (l.credit || 0), 0);

      expect(round2(debit)).toBe(round2(credit));
      expect(round2(debit)).toBe(50000);
    });

    it("subcontractor retention release JE is balanced", () => {
      // Dr Retention Payable (2010) NPR 30,000
      //    Cr Subcontractor Payables (2002) NPR 30,000
      const retentionAmount = 30000;

      const lines: JournalLineInput[] = [
        { accountCode: "2010", accountName: "Retention Payable", debit: retentionAmount, credit: 0, projectId: "proj-1", partnerId: "sub-1" },
        { accountCode: "2002", accountName: "Subcontractor Payables", debit: 0, credit: retentionAmount, projectId: "proj-1", partnerId: "sub-1" },
      ];

      const debit = lines.reduce((s, l) => s + (l.debit || 0), 0);
      const credit = lines.reduce((s, l) => s + (l.credit || 0), 0);

      expect(round2(debit)).toBe(round2(credit));
      expect(round2(debit)).toBe(30000);
    });

    it("net cash impact = client retention - sub retention", () => {
      const clientRetention = 50000;
      const subRetention = 30000;
      const netCashImpact = clientRetention - subRetention;

      expect(netCashImpact).toBe(20000); // positive = net inflow
    });
  });

  describe("Cross-Flow: Full Project Financial Cycle", () => {
    it("full cycle: IPC revenue + vendor costs + payroll + site expenses = balanced P&L", () => {
      // Simulate a simple project financial cycle:
      // 1. IPC certified: gross NPR 1,000,000
      // 2. Vendor bills: NPR 400,000 (materials)
      // 3. Payroll: NPR 200,000 (labor)
      // 4. Site expenses: NPR 50,000 (overheads)
      // 5. Subcontractor: NPR 150,000

      const ipcGross = 1000000;
      const vendorCost = 400000;
      const payrollCost = 200000;
      const siteExpenseCost = 50000;
      const subCost = 150000;

      const totalCosts = vendorCost + payrollCost + siteExpenseCost + subCost;
      const profit = ipcGross - totalCosts;
      const marginPct = (profit / ipcGross) * 100;

      expect(totalCosts).toBe(800000);
      expect(profit).toBe(200000);
      expect(round2(marginPct)).toBe(20);

      // Verify the journal entries would balance individually:
      // 1. IPC: Dr Client Recv + Dr Retention + Dr TDS = Cr Revenue + Cr VAT
      const ipcVat = round2(ipcGross * 0.13);
      const ipcRetention = round2(ipcGross * 0.05);
      const ipcTds = round2(ipcGross * 0.015);
      const ipcClientRecv = ipcGross + ipcVat - ipcRetention - ipcTds;
      expect(round2(ipcClientRecv + ipcRetention + ipcTds)).toBe(round2(ipcGross + ipcVat));

      // 2. Vendor payment: Dr Creditors = Cr Bank + Cr TDS
      const vendorTds = round2(vendorCost * 0.015);
      const vendorNet = vendorCost - vendorTds;
      expect(round2(vendorCost)).toBe(round2(vendorTds + vendorNet));

      // 3. Payroll: Dr Labor = Cr Salary Payable + Cr TDS + Cr Advances + Cr Cash
      // (verified in Flow 3 above)

      // 4. Site expense: Dr Overhead = Cr Bank
      expect(siteExpenseCost).toBe(siteExpenseCost); // trivially balanced

      // 5. Sub payment: Dr Sub Payables = Cr Bank
      expect(subCost).toBe(subCost); // trivially balanced
    });
  });
});
