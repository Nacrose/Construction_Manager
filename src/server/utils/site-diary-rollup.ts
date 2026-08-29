/**
 * Central Site Diary, Weather & Daily Progress Report (DPR) Rollup Engine
 *
 * Consolidates daily site logs into executive metrics:
 * - Manpower trade counts (Skilled vs. Unskilled) and total man-hours
 * - Machinery deployment, active vs. breakdown hours
 * - Weather conditions and rain stoppage delay impacts
 * - Site operational efficiency & productivity index
 */

export interface ManpowerTradeLog {
  trade: string; // e.g. "Mason", "Barbender", "Unskilled Laborer", "Carpenter"
  isSkilled: boolean;
  headcount: number;
  regularHours?: number; // default: 8
  otHours?: number; // Overtime hours
}

export interface MachineryDeploymentLog {
  equipmentName: string;
  count: number;
  workingHours: number;
  idleHours?: number;
  breakdownHours?: number;
}

export interface WeatherStoppageLog {
  condition: "sunny" | "cloudy" | "rain_light" | "rain_heavy" | "storm" | "extreme_cold";
  stoppageHours: number;
  notes?: string;
}

export interface DailyDiaryRollupInput {
  date: Date | string;
  miti?: string;
  manpowerLogs: ManpowerTradeLog[];
  machineryLogs: MachineryDeploymentLog[];
  weatherLogs: WeatherStoppageLog[];
}

export interface DailyDiaryRollupResult {
  date: string;
  miti?: string;
  totalHeadcount: number;
  skilledHeadcount: number;
  unskilledHeadcount: number;
  totalLaborManhours: number;
  totalMachineryDeployed: number;
  totalMachineryWorkingHours: number;
  totalMachineryBreakdownHours: number;
  totalWeatherStoppageHours: number;
  primaryWeatherCondition: string;
  hasWorkDisruption: boolean;
  productivityScore: number; // 0 to 100%
}

/**
 * Consolidate site diary logs into a standardized Daily Progress Report summary
 */
export function rollupDailySiteDiary(input: DailyDiaryRollupInput): DailyDiaryRollupResult {
  let totalHeadcount = 0;
  let skilledHeadcount = 0;
  let unskilledHeadcount = 0;
  let totalLaborManhours = 0;

  // 1. Manpower Rollup
  for (const m of input.manpowerLogs) {
    const count = Math.max(0, m.headcount || 0);
    const reg = m.regularHours ?? 8;
    const ot = m.otHours ?? 0;
    const manhours = count * (reg + ot);

    totalHeadcount += count;
    if (m.isSkilled) {
      skilledHeadcount += count;
    } else {
      unskilledHeadcount += count;
    }
    totalLaborManhours += manhours;
  }

  // 2. Machinery Rollup
  let totalMachineryDeployed = 0;
  let totalMachineryWorkingHours = 0;
  let totalMachineryBreakdownHours = 0;

  for (const mach of input.machineryLogs) {
    const count = Math.max(0, mach.count || 1);
    totalMachineryDeployed += count;
    totalMachineryWorkingHours += Math.max(0, mach.workingHours || 0);
    totalMachineryBreakdownHours += Math.max(0, mach.breakdownHours || 0);
  }

  // 3. Weather Stoppages
  let totalWeatherStoppageHours = 0;
  let primaryWeatherCondition = "sunny";

  for (const w of input.weatherLogs) {
    const stoppage = Math.max(0, w.stoppageHours || 0);
    totalWeatherStoppageHours += stoppage;
    if (stoppage > 0 || w.condition === "rain_heavy" || w.condition === "storm") {
      primaryWeatherCondition = w.condition;
    }
  }

  const hasWorkDisruption = totalWeatherStoppageHours > 0 || totalMachineryBreakdownHours > 4;

  // 4. Productivity Score (assuming standard 8-hour workday)
  // Penalized by stoppage hours and machinery breakdown
  const stoppageDeduction = Math.min(60, (totalWeatherStoppageHours / 8) * 60);
  const breakdownDeduction =
    totalMachineryWorkingHours + totalMachineryBreakdownHours > 0
      ? (totalMachineryBreakdownHours / (totalMachineryWorkingHours + totalMachineryBreakdownHours)) * 30
      : 0;

  const productivityScore = Math.max(
    0,
    Math.round(100 - stoppageDeduction - breakdownDeduction)
  );

  const dateStr = typeof input.date === "string" ? input.date : input.date.toISOString().slice(0, 10);

  return {
    date: dateStr,
    miti: input.miti,
    totalHeadcount,
    skilledHeadcount,
    unskilledHeadcount,
    totalLaborManhours: Math.round(totalLaborManhours * 10) / 10,
    totalMachineryDeployed,
    totalMachineryWorkingHours: Math.round(totalMachineryWorkingHours * 10) / 10,
    totalMachineryBreakdownHours: Math.round(totalMachineryBreakdownHours * 10) / 10,
    totalWeatherStoppageHours: Math.round(totalWeatherStoppageHours * 10) / 10,
    primaryWeatherCondition,
    hasWorkDisruption,
    productivityScore,
  };
}
