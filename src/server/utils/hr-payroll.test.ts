import { describe, it, expect } from "vitest";

describe("Construction HR & Payroll Calculations", () => {
  describe("Daily Wage & Overtime Engine", () => {
    it("calculates daily wage with 1.5x overtime multiplier correctly", () => {
      const dailyWage = 950; // NPR per 8-hour day
      const presentDays = 24;
      const halfDays = 2;
      const overtimeHours = 16; // 16 hours OT

      const effectiveDays = presentDays + halfDays * 0.5; // 25 man-days
      const regularPay = effectiveDays * dailyWage; // 25 * 950 = 23750

      const hourlyRate = dailyWage / 8; // 118.75
      const overtimePay = overtimeHours * hourlyRate * 1.5; // 16 * 118.75 * 1.5 = 2850
      const totalGross = regularPay + overtimePay; // 23750 + 2850 = 26600

      expect(effectiveDays).toBe(25);
      expect(regularPay).toBe(23750);
      expect(overtimePay).toBe(2850);
      expect(totalGross).toBe(26600);
    });

    it("applies site cash advances, mess deductions, and 1% TDS to compute net payable wage", () => {
      const grossWages = 26600;
      const cashAdvance = 5000;
      const messDeduction = 2500;
      const tdsAmount = Math.round(grossWages * 0.01); // 266

      const totalDeductions = cashAdvance + messDeduction + tdsAmount; // 7766
      const netPayable = grossWages - totalDeductions; // 18834

      expect(tdsAmount).toBe(266);
      expect(totalDeductions).toBe(7766);
      expect(netPayable).toBe(18834);
    });
  });

  describe("Monthly Salaried Staff Calculation", () => {
    it("calculates monthly salaried staff with absent day prorated deductions", () => {
      const monthlySalary = 60000;
      const daysInMonth = 30;
      const absentDays = 3;
      const overtimeHours = 8;

      const perDaySalary = monthlySalary / daysInMonth; // 2000
      const deductedSalary = monthlySalary - absentDays * perDaySalary; // 60000 - 6000 = 54000

      const hourlyRate = perDaySalary / 8; // 250
      const overtimePay = overtimeHours * hourlyRate * 1.5; // 8 * 250 * 1.5 = 3000
      const totalGross = deductedSalary + overtimePay; // 57000

      expect(perDaySalary).toBe(2000);
      expect(deductedSalary).toBe(54000);
      expect(overtimePay).toBe(3000);
      expect(totalGross).toBe(57000);
    });
  });

  describe("Muster Roll Matrix Aggregations", () => {
    it("aggregates individual day statuses into accurate man-days summary", () => {
      const monthDays = [
        "present", "present", "present", "present", "present", "absent", "leave",
        "present", "present", "half_day", "present", "present", "absent", "leave",
        "present", "overtime", "present", "present", "present", "absent", "leave",
        "present", "present", "present", "half_day", "present", "absent", "leave",
        "present", "present"
      ];

      const presentDays = monthDays.filter((s) => s === "present" || s === "overtime").length;
      const halfDays = monthDays.filter((s) => s === "half_day").length;
      const absentDays = monthDays.filter((s) => s === "absent").length;
      const leaveDays = monthDays.filter((s) => s === "leave").length;

      const effectiveDays = presentDays + halfDays * 0.5;

      expect(presentDays).toBe(20);
      expect(halfDays).toBe(2);
      expect(absentDays).toBe(4);
      expect(leaveDays).toBe(4);
      expect(effectiveDays).toBe(21);
    });
  });

  describe("Advance Recovery FIFO Simulation", () => {
    it("deducts advances in FIFO order and leaves unconsumed balances unrecovered", () => {
      const advances = [
        { id: "adv-1", amount: 2000, isRecovered: false },
        { id: "adv-2", amount: 3000, isRecovered: false },
        { id: "adv-3", amount: 5000, isRecovered: false },
      ];

      const totalDeduction = 4000;
      let remainingDeduction = totalDeduction;
      const updatedAdvances: Array<{ id: string; amount: number; isRecovered: boolean }> = [];

      for (const adv of advances) {
        if (remainingDeduction <= 0) {
          updatedAdvances.push(adv);
          continue;
        }
        if (adv.amount <= remainingDeduction + 0.01) {
          updatedAdvances.push({ ...adv, isRecovered: true, amount: adv.amount });
          remainingDeduction -= adv.amount;
        } else {
          updatedAdvances.push({
            ...adv,
            amount: adv.amount - remainingDeduction,
            isRecovered: false,
          });
          remainingDeduction = 0;
        }
      }

      expect(updatedAdvances[0].isRecovered).toBe(true); // adv-1 fully consumed
      expect(updatedAdvances[1].isRecovered).toBe(false); // adv-2 partially consumed (3000 - 2000 = 1000 remaining)
      expect(updatedAdvances[1].amount).toBe(1000);
      expect(updatedAdvances[2].isRecovered).toBe(false); // adv-3 untouched
      expect(updatedAdvances[2].amount).toBe(5000);
      expect(remainingDeduction).toBe(0);
    });
  });
});
