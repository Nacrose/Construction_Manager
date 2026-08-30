/**
 * Earned Value Management (EVM) calculations.
 *
 * EVM is the gold standard for measuring project performance. It
 * integrates scope, schedule, and cost to answer:
 * - Are we ahead or behind schedule? (SPI)
 * - Are we over or under budget? (CPI)
 * - What will the total cost be? (EAC)
 *
 * Key metrics:
 * - BAC  (Budget at Completion) = total planned cost of all tasks
 * - PV   (Planned Value) = cost of work that SHOULD be done by today
 * - EV   (Earned Value) = cost of work that IS done (BAC × progress%)
 * - AC   (Actual Cost) = actual money spent (from IPCs, materials, etc.)
 * - CPI  (Cost Performance Index) = EV / AC  (<1 = over budget)
 * - SPI  (Schedule Performance Index) = EV / PV  (<1 = behind schedule)
 * - EAC  (Estimate at Completion) = BAC / CPI  (forecasted total cost)
 * - VAC  (Variance at Completion) = BAC - EAC  (projected savings/overrun)
 * - ETC  (Estimate to Complete) = EAC - AC  (remaining cost to finish)
 *
 * Calendar awareness: with `{ useCalendar: true }`, PV accrues over WORKING
 * days only (Nepal Saturdays + holidays via nepal-calendar). Without it,
 * PV interpolates linearly over calendar days (legacy behavior, kept for
 * backward compatibility with existing tests/callers).
 */
import { countWorkingDays, isWorkingDay } from "./nepal-calendar";

export type EVMTask = {
  id: string;
  name: string;
  code: string | null;
  startDate: Date;
  endDate: Date;
  progress: number; // 0..100
  plannedCost: number; // total planned cost (NPR) for this task
  actualCost: number; // actual cost incurred so far (NPR)
};

export type EVMResult = {
  bac: number;       // Budget at Completion — total planned budget
  pv: number;        // Planned Value — what should be done by today
  ev: number;        // Earned Value — what is done (budgeted)
  ac: number;        // Actual Cost — what we actually spent
  cpi: number;       // Cost Performance Index (EV/AC, <1 = over budget)
  spi: number;       // Schedule Performance Index (EV/PV, <1 = behind)
  eac: number;       // Estimate at Completion (BAC/CPI)
  vac: number;       // Variance at Completion (BAC - EAC, negative = overrun)
  etc: number;       // Estimate to Complete (EAC - AC)
  cv: number;        // Cost Variance (EV - AC, negative = over budget)
  sv: number;        // Schedule Variance (EV - PV, negative = behind schedule)
  percentComplete: number;   // EV / BAC × 100
  percentSpent: number;      // AC / BAC × 100
  percentScheduled: number;  // PV / BAC × 100
  status: "on_track" | "over_budget" | "behind_schedule" | "critical";
  statusLabel: string;
  tasks: Array<{
    id: string;
    name: string;
    code: string | null;
    progress: number;
    plannedCost: number;
    actualCost: number;
    ev: number;
    pv: number;
  }>;
};

export type EVMOptions = {
  /**
   * When true, PV accrues over working days only (Nepal calendar) — a
   * task's planned value does NOT burn during Saturdays/Dashain, so
   * legitimate site closures stop registering as phantom schedule slip.
   * Default: false (legacy calendar-day interpolation).
   */
  useCalendar?: boolean;
};

/**
 * Calculate EVM metrics for a set of tasks.
 *
 * @param tasks Array of tasks with dates, progress, planned/actual costs
 * @param asOfDate The date to calculate PV against (default: today)
 * @param options `{ useCalendar }` — working-day PV accrual (default off)
 */
export function calculateEVM(
  tasks: EVMTask[],
  asOfDate: Date = new Date(),
  options: EVMOptions = {}
): EVMResult {
  const useCalendar = options.useCalendar === true;
  const today = asOfDate.getTime();

  let bac = 0;
  let pv = 0;
  let ev = 0;
  let ac = 0;

  const taskDetails: EVMResult["tasks"] = [];

  for (const task of tasks) {
    const taskStart = new Date(task.startDate).getTime();
    const taskEnd = new Date(task.endDate).getTime();
    const taskPlannedCost = task.plannedCost || 0;
    const taskActualCost = task.actualCost || 0;
    const progress = task.progress / 100;

    bac += taskPlannedCost;

    // PV: Planned Value
    // How much of this task's cost should be earned by today?
    // If task hasn't started yet → PV = 0
    // If task is fully in the past → PV = full planned cost
    // If task is in progress → interpolation based on time elapsed:
    //   - calendar mode: fraction of WORKING days elapsed (site closures
    //     don't burn planned value — no phantom schedule slip over
    //     Saturdays/Dashain)
    //   - legacy mode: linear fraction of calendar days
    let taskPV = 0;
    if (today >= taskEnd) {
      taskPV = taskPlannedCost; // Task should be 100% done
    } else if (today >= taskStart) {
      if (useCalendar) {
        const startD = new Date(taskStart);
        const endD = new Date(taskEnd);
        const asOfD = new Date(Math.min(today, taskEnd));
        const totalWorking = countWorkingDays(startD, endD);
        if (totalWorking <= 1) {
          // Zero/one-working-day task (or a span that is all closure):
          // earned once work has (or had) a chance to happen.
          taskPV = isWorkingDay(asOfD) ? taskPlannedCost : 0;
        } else {
          const elapsedWorking = countWorkingDays(startD, asOfD);
          taskPV = taskPlannedCost * Math.min(elapsedWorking / totalWorking, 1);
        }
      } else {
        // Linear: fraction of time elapsed × planned cost
        const elapsed = today - taskStart;
        const total = taskEnd - taskStart || 1;
        taskPV = taskPlannedCost * Math.min(elapsed / total, 1);
      }
    }
    pv += taskPV;

    // EV: Earned Value = planned cost × actual progress
    const taskEV = taskPlannedCost * progress;
    ev += taskEV;

    // AC: Actual Cost
    ac += taskActualCost;

    taskDetails.push({
      id: task.id,
      name: task.name,
      code: task.code,
      progress: task.progress,
      plannedCost: taskPlannedCost,
      actualCost: taskActualCost,
      ev: taskEV,
      pv: taskPV,
    });
  }

  // Derived metrics
  // When no cost has been incurred (AC=0) or no work scheduled yet (PV=0), default to neutral 1.0
  const cpi = ac > 0 ? ev / ac : 1.0;
  const spi = pv > 0 ? ev / pv : 1.0;
  const eac = cpi > 0 ? bac / cpi : bac;
  const vac = bac - eac;
  const etc = eac - ac;
  const cv = ev - ac;
  const sv = ev - pv;

  const percentComplete = bac > 0 ? (ev / bac) * 100 : 0;
  const percentSpent = bac > 0 ? (ac / bac) * 100 : 0;
  const percentScheduled = bac > 0 ? (pv / bac) * 100 : 0;

  // Overall status
  let status: EVMResult["status"] = "on_track";
  let statusLabel = "On Track";
  if (cpi < 0.9 && spi < 0.9) {
    status = "critical";
    statusLabel = "Critical — Over Budget & Behind Schedule";
  } else if (cpi < 0.9) {
    status = "over_budget";
    statusLabel = "Over Budget";
  } else if (spi < 0.9) {
    status = "behind_schedule";
    statusLabel = "Behind Schedule";
  }

  return {
    bac, pv, ev, ac, cpi, spi, eac, vac, etc, cv, sv,
    percentComplete, percentSpent, percentScheduled,
    status, statusLabel, tasks: taskDetails,
  };
}
