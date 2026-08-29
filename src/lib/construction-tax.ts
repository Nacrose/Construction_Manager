/**
 * Central Construction Tax, TDS & Retention Engine
 *
 * Single Source of Truth for Nepal Public Procurement Monitoring Office (PPMO)
 * and Inland Revenue Department (IRD) statutory calculations.
 */

export const STATUTORY_RATES = {
  VAT_STANDARD: 13.0, // 13% Value Added Tax
  TDS_CONTRACT_WORKS: 1.5, // 1.5% on construction, engineering & supply contracts
  TDS_RENT_CONSULTANCY: 15.0, // 15% on machinery/vehicle rent & technical consultancy
  RETENTION_STANDARD: 5.0, // 5% Standard Defect Liability Period (DLP) retention
  RETENTION_MAX: 10.0, // 10% Subcontractor retention
} as const;

export type BillDeductionInput = {
  grossAmount: number;
  vatApplicable?: boolean;
  vatRate?: number;
  tdsRate?: number;
  retentionRate?: number;
  advanceRecoveryAmount?: number;
  materialDeductionAmount?: number;
  otherDeductions?: number;
};

export type BillDeductionResult = {
  grossAmount: number;
  vatAmount: number;
  totalBillAmount: number;
  tdsAmount: number;
  retentionAmount: number;
  advanceRecoveryAmount: number;
  materialDeductionAmount: number;
  otherDeductions: number;
  totalDeductions: number;
  netPayable: number;
};

/**
 * Standard Vendor / Subcontractor Bill calculation
 */
export function calculateBillDeductions(input: BillDeductionInput): BillDeductionResult {
  const gross = Math.max(0, input.grossAmount);
  const vatRate = input.vatRate ?? STATUTORY_RATES.VAT_STANDARD;
  const vatAmount = input.vatApplicable === false ? 0 : (gross * vatRate) / 100;
  const totalBillAmount = gross + vatAmount;

  const tdsRate = input.tdsRate ?? STATUTORY_RATES.TDS_CONTRACT_WORKS;
  const tdsAmount = (gross * tdsRate) / 100;

  const retentionRate = input.retentionRate ?? 0;
  const retentionAmount = (gross * retentionRate) / 100;

  const advanceRecoveryAmount = Math.max(0, input.advanceRecoveryAmount ?? 0);
  const materialDeductionAmount = Math.max(0, input.materialDeductionAmount ?? 0);
  const otherDeductions = Math.max(0, input.otherDeductions ?? 0);

  const totalDeductions = tdsAmount + retentionAmount + advanceRecoveryAmount + materialDeductionAmount + otherDeductions;
  const netPayable = totalBillAmount - totalDeductions;

  return {
    grossAmount: round2(gross),
    vatAmount: round2(vatAmount),
    totalBillAmount: round2(totalBillAmount),
    tdsAmount: round2(tdsAmount),
    retentionAmount: round2(retentionAmount),
    advanceRecoveryAmount: round2(advanceRecoveryAmount),
    materialDeductionAmount: round2(materialDeductionAmount),
    otherDeductions: round2(otherDeductions),
    totalDeductions: round2(totalDeductions),
    netPayable: round2(netPayable),
  };
}

export type IpcColumnTotals = {
  grossAmount: number; // Row A
  vatAmount: number; // Row B
  totalBillAmount: number; // Row C
  advanceRecovery: number; // Row E
  retentionAmount: number; // Row F
  tdsAmount: number; // Row G
  totalDeductions: number; // Row H
  netPayable: number; // Row I
};

/**
 * Standard 3-Column Cumulative Payment Breakdown (Rows A through I)
 * for Nepal Client Interim Payment Certificates (IPCs).
 */
export function calculateIpcPaymentSummary(params: {
  prevGross: number;
  prevAdvance: number;
  thisGross: number;
  thisAdvance: number;
  vatRate?: number;
  retentionRate?: number;
  tdsRate?: number;
  contractWithoutVat: number;
  mobilizationPaid: number;
}): {
  prev: IpcColumnTotals;
  thisIpc: IpcColumnTotals;
  cumulative: IpcColumnTotals;
  progressPercent: number;
  remainingMobilizationAdvance: number;
} {
  const vatRate = params.vatRate ?? STATUTORY_RATES.VAT_STANDARD;
  const retentionRate = params.retentionRate ?? STATUTORY_RATES.RETENTION_STANDARD;
  const tdsRate = params.tdsRate ?? STATUTORY_RATES.TDS_CONTRACT_WORKS;

  // 1. Previous Column
  const prevVat = (params.prevGross * vatRate) / 100;
  const prevTotalBill = params.prevGross + prevVat;
  const prevRetention = (params.prevGross * retentionRate) / 100;
  const prevTds = (params.prevGross * tdsRate) / 100;
  const prevTotalDeductions = params.prevAdvance + prevRetention + prevTds;
  const prevNet = prevTotalBill - prevTotalDeductions;

  const prev: IpcColumnTotals = {
    grossAmount: round2(params.prevGross),
    vatAmount: round2(prevVat),
    totalBillAmount: round2(prevTotalBill),
    advanceRecovery: round2(params.prevAdvance),
    retentionAmount: round2(prevRetention),
    tdsAmount: round2(prevTds),
    totalDeductions: round2(prevTotalDeductions),
    netPayable: round2(prevNet),
  };

  // 2. This IPC Column
  const thisVat = (params.thisGross * vatRate) / 100;
  const thisTotalBill = params.thisGross + thisVat;
  const thisRetention = (params.thisGross * retentionRate) / 100;
  const thisTds = (params.thisGross * tdsRate) / 100;
  const thisTotalDeductions = params.thisAdvance + thisRetention + thisTds;
  const thisNet = thisTotalBill - thisTotalDeductions;

  const thisIpc: IpcColumnTotals = {
    grossAmount: round2(params.thisGross),
    vatAmount: round2(thisVat),
    totalBillAmount: round2(thisTotalBill),
    advanceRecovery: round2(params.thisAdvance),
    retentionAmount: round2(thisRetention),
    tdsAmount: round2(thisTds),
    totalDeductions: round2(thisTotalDeductions),
    netPayable: round2(thisNet),
  };

  // 3. Cumulative Column
  const cumGross = params.prevGross + params.thisGross;
  const cumVat = prevVat + thisVat;
  const cumTotalBill = prevTotalBill + thisTotalBill;
  const cumAdvance = params.prevAdvance + params.thisAdvance;
  const cumRetention = prevRetention + thisRetention;
  const cumTds = prevTds + thisTds;
  const cumTotalDeductions = prevTotalDeductions + thisTotalDeductions;
  const cumNet = prevNet + thisNet;

  const cumulative: IpcColumnTotals = {
    grossAmount: round2(cumGross),
    vatAmount: round2(cumVat),
    totalBillAmount: round2(cumTotalBill),
    advanceRecovery: round2(cumAdvance),
    retentionAmount: round2(cumRetention),
    tdsAmount: round2(cumTds),
    totalDeductions: round2(cumTotalDeductions),
    netPayable: round2(cumNet),
  };

  const progressPercent = params.contractWithoutVat > 0 ? (cumGross / params.contractWithoutVat) * 100 : 0;
  const remainingMobilizationAdvance = Math.max(0, params.mobilizationPaid - cumAdvance);

  return {
    prev,
    thisIpc,
    cumulative,
    progressPercent: round2(progressPercent),
    remainingMobilizationAdvance: round2(remainingMobilizationAdvance),
  };
}

function round2(num: number): number {
  return Math.round((num + Number.EPSILON) * 100) / 100;
}
