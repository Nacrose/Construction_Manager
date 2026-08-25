/**
 * Project-level cost configuration.
 *
 * Default rates are defined here. Projects can override any subset of these
 * rates via the Project model fields (skilledWageRate, unskilledWageRate,
 * supervisorWageRate, ownedEquipRate, hiredEquipRate, fuelPricePerLiter).
 *
 * All amounts in NPR (Nepalese Rupees).
 */
export const DEFAULT_COST_RATES = {
  labor: {
    skilledDailyWage: 1200,     // NPR/day for skilled workers (mason, carpenter, etc.)
    unskilledDailyWage: 800,    // NPR/day for unskilled workers (laborer, helper)
    supervisorDailyWage: 3500,  // NPR/day for supervisors/engineers
    otMultiplier: 1.5,          // overtime = hourly rate × this multiplier
    hoursPerDay: 8,             // standard working hours per day
  },
  equipment: {
    ownedHourlyRate: 500,       // NPR/hr for owned equipment
    hiredHourlyRate: 800,       // NPR/hr for hired equipment
    fuelPricePerLiter: 168,     // NPR per liter of diesel (update as market changes)
  },
};

/**
 * Project-specific rate overrides (all optional — null/undefined means use default).
 * Matches the fields on the Project model.
 */
export interface ProjectRateOverrides {
  skilledWageRate?: number | null;
  unskilledWageRate?: number | null;
  supervisorWageRate?: number | null;
  ownedEquipRate?: number | null;
  hiredEquipRate?: number | null;
  fuelPricePerLiter?: number | null;
}

/**
 * Resolve the effective rates for a project, merging defaults with any
 * project-level overrides.
 */
export function resolveProjectRates(overrides?: ProjectRateOverrides | null) {
  const o = overrides ?? {};
  return {
    labor: {
      skilledDailyWage: o.skilledWageRate ?? DEFAULT_COST_RATES.labor.skilledDailyWage,
      unskilledDailyWage: o.unskilledWageRate ?? DEFAULT_COST_RATES.labor.unskilledDailyWage,
      supervisorDailyWage: o.supervisorWageRate ?? DEFAULT_COST_RATES.labor.supervisorDailyWage,
      otMultiplier: DEFAULT_COST_RATES.labor.otMultiplier,
      hoursPerDay: DEFAULT_COST_RATES.labor.hoursPerDay,
    },
    equipment: {
      ownedHourlyRate: o.ownedEquipRate ?? DEFAULT_COST_RATES.equipment.ownedHourlyRate,
      hiredHourlyRate: o.hiredEquipRate ?? DEFAULT_COST_RATES.equipment.hiredHourlyRate,
      fuelPricePerLiter: o.fuelPricePerLiter ?? DEFAULT_COST_RATES.equipment.fuelPricePerLiter,
    },
  };
}

/**
 * Get the daily wage for a workforce entry based on skill level and linked staff.
 * Priority: staff.dailyWage (from DB) > project override > category-based default > skill-based default
 *
 * Pass `projectRates` to use project-specific rates instead of the global defaults.
 */
export function getLaborWage(
  staffDailyWage: number | null | undefined,
  skill: string | undefined,
  category: string | null | undefined,
  projectRates?: ReturnType<typeof resolveProjectRates> | null,
): number {
  if (staffDailyWage && staffDailyWage > 0) return staffDailyWage;
  const r = projectRates ?? resolveProjectRates();
  if (category === "supervisor" || category === "staff") return r.labor.supervisorDailyWage;
  if (skill === "unskilled") return r.labor.unskilledDailyWage;
  return r.labor.skilledDailyWage;
}

/**
 * Get the hourly rate for equipment based on ownership.
 * Pass `projectRates` to use project-specific rates instead of the global defaults.
 */
export function getEquipmentRate(
  ownership: string | undefined,
  projectRates?: ReturnType<typeof resolveProjectRates> | null,
): number {
  const r = projectRates ?? resolveProjectRates();
  return ownership === "hired"
    ? r.equipment.hiredHourlyRate
    : r.equipment.ownedHourlyRate;
}
