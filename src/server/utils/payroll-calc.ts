/**
 * Nepal payroll calculation utilities.
 *
 * Extracted from payroll.ts so both `calculate` (preview) and
 * `createPayrollRun` (commit) use the SAME server-side calculation.
 * Previously `createPayrollRun` trusted client-supplied values for
 * regularPay, overtimePay, tdsAmount, and netPayable — a malicious
 * or buggy client could submit wrong numbers and the server would
 * persist them.
 *
 * Nepal tax rules implemented here:
 *   - TDS on wages/remuneration: 1% for PAN-holders, 1.5% for non-PAN
 *     (per Inland Revenue Department guidelines).
 *   - Overtime: 1.5x normal rate on working days, 2x on public holidays
 *     and rest days (Labour Act 2017 §24).
 *   - Monthly salary: deductions only for absent days (not leave days).
 *   - Daily wage: leave days are unpaid (not counted as effective days).
 */

export type AttendanceRecord = {
  date: Date;
  status: string; // present | absent | half_day | leave | overtime
  hours: number;
  overtime: number;
  isRestDay?: boolean; // weekend or public holiday
};

export type StaffForPayroll = {
  id: string;
  name: string;
  designation: string | null;
  category: string | null;
  employmentType: string; // daily | monthly | piece_rate
  gangName: string | null;
  dailyWage: number;
  monthlySalary: number;
  bankAccountNo: string | null;
  bankName: string | null;
  pan: string | null;
};

export type AdvancesByStaff = {
  cashAdvances: number;
  messDeductions: number;
  otherDeductions: number;
};

export type PayrollLine = {
  personId: string; // ADR-0005: payroll lines are person-grain
  staffName: string;
  designation: string | null;
  category: string | null;
  employmentType: string;
  gangName: string | null;
  baseRate: number;
  dailyWage: number;
  monthlySalary: number;
  presentDays: number;
  halfDays: number;
  absentDays: number;
  leaveDays: number;
  effectiveDays: number;
  overtimeHours: number;
  regularPay: number;
  overtimePay: number;
  allowances: number;
  advanceDeduction: number;
  messDeduction: number;
  otherDeductions: number;
  tdsAmount: number;
  gross: number;
  totalDeductions: number;
  netPayable: number;
  bankAccountNo: string | null;
  bankName: string | null;
  pan: string | null;
};

/**
 * Compute the Nepal TDS rate for a worker based on whether they have
 * a PAN. Workers with a PAN get 1% TDS; those without get 1.5%.
 *
 * This replaces the previous flat `0.01` (1%) that was applied to all
 * workers regardless of PAN status.
 */
export function getNepalTdsRate(hasPan: boolean): number {
  return hasPan ? 0.01 : 0.015;
}

/**
 * Compute the overtime multiplier for a given attendance record.
 *
 * Per Nepal Labour Act 2017 §24:
 *   - Normal overtime (working day): 1.5x the normal hourly rate
 *   - Rest day / public holiday overtime: 2x the normal hourly rate
 *
 * The caller must mark `isRestDay` on the attendance record if the
 * date is a weekend or recognized public holiday.
 */
export function getOvertimeMultiplier(isRestDay: boolean): number {
  return isRestDay ? 2.0 : 1.5;
}

/**
 * Check if a date falls on a Nepal rest day (Saturday) — the standard
 * weekly rest day per Nepal Labour Act. The caller should also check
 * against a public-holiday calendar for full accuracy.
 */
export function isNepalRestDay(date: Date): boolean {
  // Saturday is the standard rest day in Nepal (weekday 6 in JS Date).
  return date.getDay() === 6;
}

/**
 * Compute a single worker's payroll line from attendance + staff data.
 *
 * This is the single source of truth for payroll calculation. Both
 * `calculate` (preview) and `createPayrollRun` (commit) MUST use this
 * function to ensure the numbers match. Previously `createPayrollRun`
 * accepted client-supplied regularPay/overtimePay/tdsAmount/netPayable
 * and persisted them as-is — a client could submit a netPayable of 0
 * for a worker who should receive NPR 50,000.
 */
export function computePayrollLine(
  staff: StaffForPayroll,
  attendance: AttendanceRecord[],
  advances: AdvancesByStaff,
  daysInMonth: number,
): PayrollLine {
  const presentDays = attendance.filter(
    (r) => r.status === "present" || r.status === "overtime",
  ).length;
  const halfDays = attendance.filter((r) => r.status === "half_day").length;
  const absentDays = attendance.filter((r) => r.status === "absent").length;
  const leaveDays = attendance.filter((r) => r.status === "leave").length;
  const overtimeHours = attendance.reduce((sum, r) => sum + (r.overtime || 0), 0);

  // Effective working days: present (full) + half-day (0.5).
  // Leave days are NOT counted as effective days for daily-wage workers
  // (unpaid leave) — previously they were counted, overpaying daily
  // workers who took leave.
  const effectiveDays = presentDays + halfDays * 0.5;

  let regularPay = 0;
  let overtimePay = 0;
  const baseRate = staff.employmentType === "monthly" ? staff.monthlySalary : staff.dailyWage;

  if (staff.employmentType === "monthly") {
    // Monthly salary: deduct only for absent days (not leave days).
    // Previously: same. Leave days are paid for monthly workers.
    const perDaySalary = staff.monthlySalary / daysInMonth;
    const deductedSalary = Math.max(0, staff.monthlySalary - absentDays * perDaySalary);
    regularPay = Math.round(deductedSalary);

    // Overtime: split into normal OT (1.5x) and rest-day OT (2x).
    // Previously: all OT was 1.5x, underpaying workers for holiday OT.
    const hourlyRate = perDaySalary / 8; // 8-hour workday
    let normalOT = 0;
    let restDayOT = 0;
    for (const r of attendance) {
      if (r.overtime > 0) {
        if (r.isRestDay ?? isNepalRestDay(r.date)) {
          restDayOT += r.overtime;
        } else {
          normalOT += r.overtime;
        }
      }
    }
    overtimePay = Math.round(
      normalOT * hourlyRate * getOvertimeMultiplier(false) +
      restDayOT * hourlyRate * getOvertimeMultiplier(true),
    );
  } else {
    // Daily / Piece rate.
    regularPay = Math.round(effectiveDays * staff.dailyWage);
    const hourlyRate = staff.dailyWage > 0 ? staff.dailyWage / 8 : 0;

    // Same OT split as monthly workers.
    let normalOT = 0;
    let restDayOT = 0;
    for (const r of attendance) {
      if (r.overtime > 0) {
        if (r.isRestDay ?? isNepalRestDay(r.date)) {
          restDayOT += r.overtime;
        } else {
          normalOT += r.overtime;
        }
      }
    }
    overtimePay = Math.round(
      normalOT * hourlyRate * getOvertimeMultiplier(false) +
      restDayOT * hourlyRate * getOvertimeMultiplier(true),
    );
  }

  const advanceDeduction = advances.cashAdvances;
  const messDeduction = advances.messDeductions;
  const otherDeductions = advances.otherDeductions;
  const allowances = 0;

  // TDS: use Nepal TDS rate based on PAN status.
  // Previously: hardcoded flat 1% for all workers — under-deducting TDS
  // for workers without a PAN (should be 1.5%).
  const tdsRate = getNepalTdsRate(!!staff.pan);
  const tdsAmount = Math.round((regularPay + overtimePay) * tdsRate);

  const gross = regularPay + overtimePay + allowances;
  const totalDeductions = advanceDeduction + messDeduction + otherDeductions + tdsAmount;
  const netPayable = Math.max(0, gross - totalDeductions);

  return {
    personId: staff.id,
    staffName: staff.name,
    designation: staff.designation,
    category: staff.category,
    employmentType: staff.employmentType,
    gangName: staff.gangName,
    baseRate,
    dailyWage: staff.dailyWage,
    monthlySalary: staff.monthlySalary,
    presentDays,
    halfDays,
    absentDays,
    leaveDays,
    effectiveDays,
    overtimeHours,
    regularPay,
    overtimePay,
    allowances,
    advanceDeduction,
    messDeduction,
    otherDeductions,
    tdsAmount,
    gross,
    totalDeductions,
    netPayable,
    bankAccountNo: staff.bankAccountNo,
    bankName: staff.bankName,
    pan: staff.pan,
  };
}
