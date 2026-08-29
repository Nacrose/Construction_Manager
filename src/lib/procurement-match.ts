/**
 * Central 3-Way Procurement Matching & Variance Engine
 *
 * Reconciles Purchase Orders (PO), Goods Received Notes (GRN), and Vendor Invoices
 * to prevent over-billing, unauthorized price hikes, and paying for rejected goods.
 */

export type MatchStatus =
  | "MATCHED"
  | "QTY_OVERBILLED"
  | "QTY_UNDERBILLED"
  | "RATE_HIGHER_THAN_PO"
  | "RATE_LOWER_THAN_PO"
  | "UNORDERED_ITEM"
  | "UNDELIVERED_ITEM";

export type OverallInvoiceMatchStatus = "PASSED" | "WARNING" | "BLOCKED";

export interface PoItem {
  materialId: string;
  name: string;
  unit: string;
  orderedQty: number;
  unitRate: number;
}

export interface GrnItem {
  materialId: string;
  receivedQty: number;
  acceptedQty: number;
  rejectedQty: number;
}

export interface InvoiceItem {
  materialId: string;
  billedQty: number;
  billedRate: number;
}

export interface LineMatchResult {
  materialId: string;
  name: string;
  unit: string;
  orderedQty: number;
  acceptedQty: number;
  rejectedQty: number;
  billedQty: number;
  poRate: number;
  billedRate: number;
  qtyVariance: number; // billedQty - acceptedQty (positive means overbilled)
  rateVariance: number; // billedRate - poRate
  priceVarianceAmount: number; // (billedRate - poRate) * billedQty
  status: MatchStatus;
  isBlocked: boolean;
  notes: string[];
}

export interface Procurement3WayMatchResult {
  overallStatus: OverallInvoiceMatchStatus;
  isPayable: boolean;
  totalPoAmount: number;
  totalDeliveredAmount: number;
  totalBilledAmount: number;
  totalApprovedPayableAmount: number;
  netVarianceAmount: number;
  lineResults: LineMatchResult[];
  blockingReasons: string[];
  warnings: string[];
}

/**
 * Execute 3-Way Matching between PO, Site GRN Deliveries, and Vendor Invoice
 */
export function matchProcurementInvoice(input: {
  poItems: PoItem[];
  grnItems: GrnItem[];
  invoiceItems: InvoiceItem[];
  tolerancePercent?: number; // Allowed % tolerance for weight/bulk (e.g. 1%)
}): Procurement3WayMatchResult {
  const tolerance = input.tolerancePercent ?? 0.5; // default 0.5% tolerance

  const poMap = new Map<string, PoItem>();
  input.poItems.forEach((item) => poMap.set(item.materialId, item));

  // Aggregate GRN receipts by material
  const grnMap = new Map<string, { receivedQty: number; acceptedQty: number; rejectedQty: number }>();
  input.grnItems.forEach((item) => {
    const existing = grnMap.get(item.materialId) || { receivedQty: 0, acceptedQty: 0, rejectedQty: 0 };
    existing.receivedQty += item.receivedQty || 0;
    existing.acceptedQty += item.acceptedQty || 0;
    existing.rejectedQty += item.rejectedQty || 0;
    grnMap.set(item.materialId, existing);
  });

  const lineResults: LineMatchResult[] = [];
  const blockingReasons: string[] = [];
  const warnings: string[] = [];

  let totalPoAmount = 0;
  let totalDeliveredAmount = 0;
  let totalBilledAmount = 0;
  let totalApprovedPayableAmount = 0;

  // Process all billed invoice items
  for (const invItem of input.invoiceItems) {
    const po = poMap.get(invItem.materialId);
    const grn = grnMap.get(invItem.materialId) || { receivedQty: 0, acceptedQty: 0, rejectedQty: 0 };

    const billedQty = Math.max(0, invItem.billedQty || 0);
    const billedRate = Math.max(0, invItem.billedRate || 0);
    const poRate = po?.unitRate ?? 0;
    const orderedQty = po?.orderedQty ?? 0;
    const acceptedQty = grn.acceptedQty;
    const rejectedQty = grn.rejectedQty;

    const qtyVariance = billedQty - acceptedQty;
    const rateVariance = billedRate - poRate;
    const priceVarianceAmount = rateVariance * billedQty;
    const notes: string[] = [];

    let status: MatchStatus = "MATCHED";
    let isBlocked = false;

    if (!po) {
      status = "UNORDERED_ITEM";
      isBlocked = true;
      notes.push("Item was not found in the original Purchase Order.");
      blockingReasons.push(`Unordered item billed (Material ID: ${invItem.materialId})`);
    } else if (acceptedQty === 0 && billedQty > 0) {
      status = "UNDELIVERED_ITEM";
      isBlocked = true;
      notes.push("No accepted site delivery / GRN found for this item.");
      blockingReasons.push(`No delivery found for ${po.name} (Billed: ${billedQty} ${po.unit})`);
    } else if (qtyVariance > 0) {
      const overPercent = (qtyVariance / (acceptedQty || 1)) * 100;
      if (overPercent > tolerance) {
        status = "QTY_OVERBILLED";
        isBlocked = true;
        notes.push(`Billed quantity (${billedQty}) exceeds accepted delivery (${acceptedQty}) by ${qtyVariance.toFixed(2)} ${po.unit}.`);
        blockingReasons.push(`${po.name}: Over-billed by ${qtyVariance.toFixed(2)} ${po.unit}`);
      } else {
        notes.push(`Minor quantity variance within ${tolerance}% tolerance.`);
      }
    } else if (qtyVariance < 0) {
      status = "QTY_UNDERBILLED";
      notes.push(`Billed quantity is less than accepted delivery (Partial billing).`);
    }

    if (po && rateVariance > 0.01) {
      status = "RATE_HIGHER_THAN_PO";
      isBlocked = true;
      notes.push(`Billed unit rate (${billedRate}) is higher than agreed PO rate (${poRate}).`);
      blockingReasons.push(`${po.name}: Invoiced rate NPR ${billedRate} exceeds PO rate NPR ${poRate}`);
    } else if (po && rateVariance < -0.01) {
      notes.push(`Vendor invoiced at a discount (below PO rate).`);
    }

    if (rejectedQty > 0) {
      warnings.push(`${po?.name || invItem.materialId}: ${rejectedQty} ${po?.unit || "units"} rejected at site inspection.`);
    }

    const itemBilledTotal = billedQty * billedRate;
    const payableQty = Math.min(billedQty, acceptedQty);
    const approvedRate = Math.min(billedRate, poRate || billedRate);
    const itemPayableTotal = payableQty * approvedRate;

    totalBilledAmount += itemBilledTotal;
    totalApprovedPayableAmount += itemPayableTotal;
    totalPoAmount += orderedQty * poRate;
    totalDeliveredAmount += acceptedQty * poRate;

    lineResults.push({
      materialId: invItem.materialId,
      name: po?.name || "Unknown Item",
      unit: po?.unit || "unit",
      orderedQty,
      acceptedQty,
      rejectedQty,
      billedQty,
      poRate,
      billedRate,
      qtyVariance,
      rateVariance,
      priceVarianceAmount,
      status,
      isBlocked,
      notes,
    });
  }

  const overallStatus: OverallInvoiceMatchStatus =
    blockingReasons.length > 0 ? "BLOCKED" : warnings.length > 0 ? "WARNING" : "PASSED";

  return {
    overallStatus,
    isPayable: overallStatus !== "BLOCKED",
    totalPoAmount,
    totalDeliveredAmount,
    totalBilledAmount,
    totalApprovedPayableAmount,
    netVarianceAmount: totalBilledAmount - totalDeliveredAmount,
    lineResults,
    blockingReasons,
    warnings,
  };
}
