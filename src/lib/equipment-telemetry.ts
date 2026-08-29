/**
 * Central Equipment Fleet, Telemetry & Fuel Efficiency Engine
 *
 * Implements construction machinery operating telemetry:
 * - Meter hour calculations (Start / End, Idle, Breakdown, Net Working)
 * - Diesel / Fuel efficiency index (L/hr, L/km) and anomaly detection
 * - Spot-hire & third-party equipment rental billing with overtime & TDS
 */

export interface EquipmentLogInput {
  startMeter: number;
  endMeter: number;
  idleHours?: number;
  breakdownHours?: number;
  fuelLiters?: number;
  benchmarkLitersPerHour?: number; // Expected consumption baseline
}

export interface EquipmentLogSummary {
  totalMeterHours: number;
  idleHours: number;
  breakdownHours: number;
  netWorkingHours: number;
  utilizationRate: number; // % of total meter hours that were productive
  fuelLiters: number;
  fuelConsumptionPerHour: number; // Liters / Working Hour
  isFuelAnomalous: boolean; // True if fuel exceeds benchmark by >20%
  variancePercentFromBenchmark?: number;
}

export interface SpotHireBillingInput {
  workingHours: number;
  shiftHours?: number; // Standard shift (e.g. 8 hrs)
  hourlyRate: number;
  otHourlyRate?: number; // Overtime rate (defaults to 1.5x)
  mobDemobFee?: number;
  fuelLitersSupplied?: number;
  fuelRatePerLiter?: number;
  fuelPaidByContractor?: boolean;
  tdsPercent?: number; // Nepal standard: 1.5% for corporate equipment rental
}

export interface SpotHireBillingResult {
  regularHours: number;
  otHours: number;
  regularAmount: number;
  otAmount: number;
  mobDemobFee: number;
  fuelAmount: number;
  grossAmount: number;
  tdsPercent: number;
  tdsAmount: number;
  netPayable: number;
}

/**
 * Compute Equipment Daily Logsheet Metrics & Fuel Telemetry
 */
export function calculateEquipmentLogSummary(input: EquipmentLogInput): EquipmentLogSummary {
  const start = Math.max(0, input.startMeter);
  const end = Math.max(start, input.endMeter);
  const totalMeterHours = Math.round((end - start) * 100) / 100;

  const idleHours = Math.min(totalMeterHours, Math.max(0, input.idleHours ?? 0));
  const breakdownHours = Math.min(totalMeterHours - idleHours, Math.max(0, input.breakdownHours ?? 0));
  const netWorkingHours = Math.max(0, Math.round((totalMeterHours - idleHours - breakdownHours) * 100) / 100);

  const utilizationRate = totalMeterHours > 0 ? Math.round((netWorkingHours / totalMeterHours) * 1000) / 10 : 0;

  const fuelLiters = Math.max(0, input.fuelLiters ?? 0);
  const fuelConsumptionPerHour = netWorkingHours > 0 ? Math.round((fuelLiters / netWorkingHours) * 100) / 100 : 0;

  let isFuelAnomalous = false;
  let variancePercentFromBenchmark: number | undefined;

  if (input.benchmarkLitersPerHour && input.benchmarkLitersPerHour > 0 && netWorkingHours > 0) {
    const variance = ((fuelConsumptionPerHour - input.benchmarkLitersPerHour) / input.benchmarkLitersPerHour) * 100;
    variancePercentFromBenchmark = Math.round(variance * 10) / 10;
    // Anomaly triggered if consumption is >20% above benchmark
    isFuelAnomalous = variance > 20;
  }

  return {
    totalMeterHours,
    idleHours,
    breakdownHours,
    netWorkingHours,
    utilizationRate,
    fuelLiters,
    fuelConsumptionPerHour,
    isFuelAnomalous,
    variancePercentFromBenchmark,
  };
}

/**
 * Compute Spot-Hire / Third-Party Equipment Rental Billing
 */
export function calculateSpotHireCost(input: SpotHireBillingInput): SpotHireBillingResult {
  const shiftHours = input.shiftHours ?? 8;
  const regularHours = Math.min(input.workingHours, shiftHours);
  const otHours = Math.max(0, input.workingHours - shiftHours);

  const regularAmount = regularHours * input.hourlyRate;
  const otRate = input.otHourlyRate ?? input.hourlyRate * 1.5;
  const otAmount = otHours * otRate;

  const mobDemobFee = Math.max(0, input.mobDemobFee ?? 0);
  const fuelAmount = input.fuelPaidByContractor
    ? Math.max(0, (input.fuelLitersSupplied ?? 0) * (input.fuelRatePerLiter ?? 0))
    : 0;

  const grossAmount = regularAmount + otAmount + mobDemobFee + fuelAmount;
  const tdsPercent = input.tdsPercent ?? 1.5;
  const tdsAmount = Math.round(((grossAmount * tdsPercent) / 100) * 100) / 100;
  const netPayable = Math.round((grossAmount - tdsAmount) * 100) / 100;

  return {
    regularHours,
    otHours,
    regularAmount: Math.round(regularAmount * 100) / 100,
    otAmount: Math.round(otAmount * 100) / 100,
    mobDemobFee,
    fuelAmount,
    grossAmount: Math.round(grossAmount * 100) / 100,
    tdsPercent,
    tdsAmount,
    netPayable,
  };
}
