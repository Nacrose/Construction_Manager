import { describe, it, expect } from "vitest";
import {
  getNepalTdsRate,
  getOvertimeMultiplier,
  isNepalRestDay,
  computePayrollLine,
  type StaffForPayroll,
  type AttendanceRecord,
  type AdvancesByStaff,
} from "@/server/utils/payroll-calc";

const baseStaff: StaffForPayroll = {
  id: "staff-1",
  name: "Test Worker",
  designation: "Mason",
  category: "skilled",
  employmentType: "daily",
  gangName: "Gang A",
  dailyWage: 1000,
  monthlySalary: 0,
  bankAccountNo: null,
  bankName: null,
  pan: "123456789",
};

const noAdvances: AdvancesByStaff = {
  cashAdvances: 0,
  messDeductions: 0,
  otherDeductions: 0,
};

function makeAttendance(days: Partial<AttendanceRecord>[]): AttendanceRecord[] {
  return days.map((d, i) => ({
    date: d.date ?? new Date(2026, 0, i + 1), // Jan 1-31, 2026
    status: d.status ?? "present",
    hours: d.hours ?? 8,
    overtime: d.overtime ?? 0,
    isRestDay: d.isRestDay,
  }));
}

describe("payroll-calc — Nepal Payroll Engine", () => {
  describe("getNepalTdsRate", () => {
    it("returns 1% for PAN holders", () => {
      expect(getNepalTdsRate(true)).toBe(0.01);
    });
    it("returns 1.5% for non-PAN holders", () => {
      expect(getNepalTdsRate(false)).toBe(0.015);
    });
  });

  describe("getOvertimeMultiplier", () => {
    it("returns 1.5x for normal working days", () => {
      expect(getOvertimeMultiplier(false)).toBe(1.5);
    });
    it("returns 2x for rest days/holidays", () => {
      expect(getOvertimeMultiplier(true)).toBe(2.0);
    });
  });

  describe("isNepalRestDay", () => {
    it("returns true for Saturday (weekday 6)", () => {
      // Jan 3, 2026 is a Saturday
      expect(isNepalRestDay(new Date(2026, 0, 3))).toBe(true);
    });
    it("returns false for Monday (weekday 1)", () => {
      // Jan 5, 2026 is a Monday
      expect(isNepalRestDay(new Date(2026, 0, 5))).toBe(false);
    });
  });

  describe("computePayrollLine — Daily Wage Worker", () => {
    it("calculates regular pay for full attendance (30 present days)", () => {
      const attendance = makeAttendance(
        Array.from({ length: 30 }, () => ({ status: "present" as const })),
      );
      const result = computePayrollLine(baseStaff, attendance, noAdvances, 30);

      expect(result.presentDays).toBe(30);
      expect(result.effectiveDays).toBe(30);
      expect(result.regularPay).toBe(30000); // 30 * 1000
      expect(result.overtimePay).toBe(0);
      expect(result.gross).toBe(30000);
    });

    it("counts half days as 0.5 effective days", () => {
      const attendance = makeAttendance([
        { status: "present" }, { status: "present" }, { status: "half_day" },
        { status: "half_day" }, { status: "present" },
      ]);
      const result = computePayrollLine(baseStaff, attendance, noAdvances, 31);

      expect(result.presentDays).toBe(3);
      expect(result.halfDays).toBe(2);
      expect(result.effectiveDays).toBe(4); // 3 + 2*0.5
      expect(result.regularPay).toBe(4000); // 4 * 1000
    });

    it("does NOT count leave days as effective days (unpaid leave)", () => {
      const attendance = makeAttendance([
        { status: "present" }, { status: "present" }, { status: "leave" },
        { status: "leave" }, { status: "present" },
      ]);
      const result = computePayrollLine(baseStaff, attendance, noAdvances, 31);

      expect(result.presentDays).toBe(3);
      expect(result.leaveDays).toBe(2);
      expect(result.effectiveDays).toBe(3); // leave NOT counted
      expect(result.regularPay).toBe(3000); // 3 * 1000
    });

    it("calculates overtime at 1.5x for normal days", () => {
      // Wednesday Jan 7, 2026 — normal day
      const attendance: AttendanceRecord[] = [{
        date: new Date(2026, 0, 7),
        status: "present",
        hours: 8,
        overtime: 2,
      }];
      const result = computePayrollLine(baseStaff, attendance, noAdvances, 31);

      // hourlyRate = 1000 / 8 = 125
      // OT = 2 * 125 * 1.5 = 375
      expect(result.overtimePay).toBe(375);
      expect(result.gross).toBe(1000 + 375); // regular + OT
    });

    it("calculates overtime at 2x for rest days (Saturday)", () => {
      // Saturday Jan 3, 2026
      const attendance: AttendanceRecord[] = [{
        date: new Date(2026, 0, 3),
        status: "present",
        hours: 8,
        overtime: 2,
      }];
      const result = computePayrollLine(baseStaff, attendance, noAdvances, 31);

      // hourlyRate = 1000 / 8 = 125
      // OT = 2 * 125 * 2.0 = 500 (rest-day rate)
      expect(result.overtimePay).toBe(500);
    });

    it("applies 1% TDS for PAN holders", () => {
      const attendance = makeAttendance([{ status: "present" }]);
      const result = computePayrollLine(baseStaff, attendance, noAdvances, 30);

      // gross = 1000, TDS = 1000 * 0.01 = 10
      expect(result.tdsAmount).toBe(10);
      expect(result.netPayable).toBe(990);
    });

    it("applies 1.5% TDS for non-PAN holders", () => {
      const nonPanStaff = { ...baseStaff, pan: null };
      const attendance = makeAttendance([{ status: "present" }]);
      const result = computePayrollLine(nonPanStaff, attendance, noAdvances, 30);

      // gross = 1000, TDS = 1000 * 0.015 = 15
      expect(result.tdsAmount).toBe(15);
      expect(result.netPayable).toBe(985);
    });

    it("deducts cash advances from net pay", () => {
      const attendance = makeAttendance(Array.from({ length: 10 }, () => ({ status: "present" as const })));
      const advances = { cashAdvances: 3000, messDeductions: 0, otherDeductions: 0 };
      const result = computePayrollLine(baseStaff, attendance, advances, 30);

      // regular = 10 * 1000 = 10000, TDS = 10000 * 0.01 = 100
      // gross = 10000, deductions = 3000 + 100 = 3100
      // net = 10000 - 3100 = 6900
      expect(result.regularPay).toBe(10000);
      expect(result.advanceDeduction).toBe(3000);
      expect(result.tdsAmount).toBe(100);
      expect(result.netPayable).toBe(6900);
    });

    it("clamps netPayable to 0 when deductions exceed gross", () => {
      const attendance = makeAttendance([{ status: "present" }]);
      const advances = { cashAdvances: 5000, messDeductions: 0, otherDeductions: 0 };
      const result = computePayrollLine(baseStaff, attendance, advances, 30);

      // gross = 1000, deductions = 5000 + 10 = 5010 > 1000
      // net = max(0, 1000 - 5010) = 0
      expect(result.netPayable).toBe(0);
    });
  });

  describe("computePayrollLine — Monthly Salaried Worker", () => {
    const monthlyStaff: StaffForPayroll = {
      ...baseStaff,
      employmentType: "monthly",
      dailyWage: 0,
      monthlySalary: 30000,
    };

    it("pays full salary with no absences", () => {
      const attendance = makeAttendance(Array.from({ length: 30 }, () => ({ status: "present" as const })));
      const result = computePayrollLine(monthlyStaff, attendance, noAdvances, 30);

      expect(result.regularPay).toBe(30000);
      expect(result.absentDays).toBe(0);
    });

    it("deducts for absent days but NOT for leave days", () => {
      const attendance = makeAttendance([
        { status: "present" }, { status: "present" },
        { status: "absent" }, { status: "absent" },
        { status: "leave" }, { status: "leave" },
      ]);
      const result = computePayrollLine(monthlyStaff, attendance, noAdvances, 30);

      // perDay = 30000 / 30 = 1000
      // deducted = 30000 - 2 * 1000 = 28000 (leave NOT deducted)
      expect(result.absentDays).toBe(2);
      expect(result.leaveDays).toBe(2);
      expect(result.regularPay).toBe(28000);
    });

    it("calculates overtime using monthly salary hourly rate", () => {
      const attendance: AttendanceRecord[] = [{
        date: new Date(2026, 0, 5), // Monday
        status: "present",
        hours: 8,
        overtime: 4,
      }];
      const result = computePayrollLine(monthlyStaff, attendance, noAdvances, 30);

      // perDay = 30000 / 30 = 1000
      // hourlyRate = 1000 / 8 = 125
      // OT = 4 * 125 * 1.5 = 750
      expect(result.overtimePay).toBe(750);
    });

    it("does not go negative when absent days exceed month days", () => {
      // Edge case: 31 absent days in a 30-day month (impossible but tests the guard)
      const attendance = makeAttendance(
        Array.from({ length: 31 }, () => ({ status: "absent" as const })),
      );
      const result = computePayrollLine(monthlyStaff, attendance, noAdvances, 30);

      // deducted = max(0, 30000 - 31 * 1000) = max(0, -1000) = 0
      expect(result.regularPay).toBe(0);
    });
  });

  describe("computePayrollLine — Edge Cases", () => {
    it("handles zero daily wage without dividing by zero", () => {
      const zeroWageStaff = { ...baseStaff, dailyWage: 0 };
      const attendance = makeAttendance([
        { status: "present", overtime: 2 },
      ]);
      // Should not throw — hourlyRate is guarded by `staff.dailyWage > 0 ? ... : 0`
      const result = computePayrollLine(zeroWageStaff, attendance, noAdvances, 30);
      expect(result.regularPay).toBe(0);
      expect(result.overtimePay).toBe(0); // hourlyRate = 0
    });

    it("handles empty attendance (no records)", () => {
      const result = computePayrollLine(baseStaff, [], noAdvances, 30);
      expect(result.presentDays).toBe(0);
      expect(result.effectiveDays).toBe(0);
      expect(result.regularPay).toBe(0);
      expect(result.netPayable).toBe(0);
    });

    it("handles mixed normal + rest-day overtime in same period", () => {
      const attendance: AttendanceRecord[] = [
        { date: new Date(2026, 0, 5), status: "present", hours: 8, overtime: 2 }, // Monday: 1.5x
        { date: new Date(2026, 0, 3), status: "present", hours: 8, overtime: 2 }, // Saturday: 2x
      ];
      const result = computePayrollLine(baseStaff, attendance, noAdvances, 31);

      // hourlyRate = 1000 / 8 = 125
      // normal OT = 2 * 125 * 1.5 = 375
      // rest-day OT = 2 * 125 * 2.0 = 500
      // total OT = 875
      expect(result.overtimePay).toBe(875);
      expect(result.overtimeHours).toBe(4);
    });
  });
});
