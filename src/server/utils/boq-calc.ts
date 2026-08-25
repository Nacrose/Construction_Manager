/**
 * Shared BOQ calculation utilities.
 *
 * Extracted from the API route files so they can be used by both
 * the legacy API routes and the new tRPC procedures.
 */
import { db } from "@/lib/db";

/**
 * Recalculate a BOQ item's rate from its direct ingredients (legacy mode).
 *
 * Convention: ingredients attached directly to a BoqItem (no RateAnalysis)
 * represent the TOTAL ingredient quantities for the ENTIRE BOQ quantity.
 * For example, if a BOQ item is "100 cum of PCC" and the user enters
 * "cement: 400 bags @ 800", they mean 400 bags total for 100 cum.
 *
 * Fixed ingredients: amount = (qty + qty*wastage%/100) * rate
 * Percentage ingredients: amount = subtotal of base type * percentage / 100
 * Percentage ingredients are calculated AFTER fixed ingredients.
 *
 * Rate derivation:
 *   total = sum of all ingredient amounts (total cost for full BOQ quantity)
 *   rate  = total / item.quantity            (per-unit cost)
 *   amount = item.quantity * rate            (= total, denormalized for speed)
 */
export async function recalcItemRate(itemId: string): Promise<void> {
  const item = await db.boqItem.findUnique({
    where: { id: itemId },
    include: { ingredients: { orderBy: { sortOrder: "asc" } } },
  });
  if (!item) return;

  const fixed = item.ingredients.filter((i) => i.calcMode === "fixed" || !i.calcMode);
  const pctBased = item.ingredients.filter((i) => i.calcMode === "percentage");

  // Calculate subtotals from fixed ingredients
  const matTotal = fixed.filter((i) => i.type === "material").reduce((s, i) => s + i.amount, 0);
  const labTotal = fixed.filter((i) => i.type === "labor").reduce((s, i) => s + i.amount, 0);
  const eqpTotal = fixed.filter((i) => i.type === "equipment").reduce((s, i) => s + i.amount, 0);
  const ovhTotal = fixed.filter((i) => i.type === "overhead").reduce((s, i) => s + i.amount, 0);
  const allFixedTotal = matTotal + labTotal + eqpTotal + ovhTotal;

  // Update percentage-based ingredients sequentially (so later ones can include earlier ones)
  let runningPctTotal = 0;
  for (const ing of pctBased) {
    const base = resolvePercentageBase(ing.pctBase, matTotal, labTotal, eqpTotal, ovhTotal, allFixedTotal, runningPctTotal);
    const newAmount = (base * ing.percentage) / 100;
    runningPctTotal += newAmount;
    if (Math.abs(ing.amount - newAmount) > 0.01) {
      await db.boqIngredient.update({ where: { id: ing.id }, data: { amount: newAmount } });
    }
  }

  // Total = fixed + percentage-based
  const total = allFixedTotal + runningPctTotal;
  const rate = item.quantity > 0 ? total / item.quantity : 0;
  await db.boqItem.update({
    where: { id: itemId },
    data: { rate, amount: item.quantity * rate },
  });
}

/**
 * Recalculate all percentage-based ingredients in a rate analysis.
 * If this is the default analysis, also update the parent BOQ item's rate.
 *
 * Convention: ingredients in a RateAnalysis represent the cost for ONE BATCH
 * of size `analysis.batchSize`. For example, if batchSize=1 cum and the user
 * enters "cement: 4 bags @ 800", they mean 4 bags per 1 cum of concrete.
 *
 * Rate derivation:
 *   total = sum of all ingredient amounts (cost per batch)
 *   rate  = total / analysis.batchSize     (per-BOQ-unit cost)
 *   amount = item.quantity * rate          (total cost for the BOQ line)
 */
export async function recalcAnalysis(analysisId: string, itemId: string): Promise<void> {
  const analysis = await db.rateAnalysis.findUnique({
    where: { id: analysisId },
    include: { ingredients: { orderBy: { sortOrder: "asc" } } },
  });
  if (!analysis) return;

  const fixed = analysis.ingredients.filter((i) => i.calcMode !== "percentage");
  const pctBased = analysis.ingredients.filter((i) => i.calcMode === "percentage");

  const matTotal = fixed.filter((i) => i.type === "material").reduce((s, i) => s + i.amount, 0);
  const labTotal = fixed.filter((i) => i.type === "labor").reduce((s, i) => s + i.amount, 0);
  const eqpTotal = fixed.filter((i) => i.type === "equipment").reduce((s, i) => s + i.amount, 0);
  const ovhTotal = fixed.filter((i) => i.type === "overhead").reduce((s, i) => s + i.amount, 0);
  const allFixedTotal = matTotal + labTotal + eqpTotal + ovhTotal;

  let runningPctTotal = 0;
  for (const ing of pctBased) {
    const base = resolvePercentageBase(ing.pctBase, matTotal, labTotal, eqpTotal, ovhTotal, allFixedTotal, runningPctTotal);
    const newAmount = (base * ing.percentage) / 100;
    runningPctTotal += newAmount;
    await db.boqIngredient.update({ where: { id: ing.id }, data: { amount: newAmount } });
  }

  // Update the BOQ item's rate if this is the default analysis.
  // CRITICAL: rate = total / batchSize (per-unit cost), NOT total / item.quantity.
  // The UI's ratePerUnit calculation in analysis-library.ts uses the same formula.
  if (analysis.isDefault) {
    const total = allFixedTotal + runningPctTotal;
    const batch = analysis.batchSize > 0 ? analysis.batchSize : 1;
    const rate = total / batch;
    const item = await db.boqItem.findUnique({ where: { id: itemId }, select: { quantity: true } });
    const qty = item?.quantity ?? 0;
    await db.boqItem.update({
      where: { id: itemId },
      data: { rate, amount: qty * rate },
    });
  }
}

/**
 * Resolve the base amount for a percentage-based ingredient.
 *
 * Exported for unit testing.
 */
export function resolvePercentageBase(
  pctBase: string,
  matTotal: number,
  labTotal: number,
  eqpTotal: number,
  ovhTotal: number,
  allFixedTotal: number,
  runningPctTotal: number
): number {
  switch (pctBase) {
    case "material": return matTotal;
    case "labor": return labTotal;
    case "equipment": return eqpTotal;
    case "overhead": return ovhTotal;
    case "material_labor": return matTotal + labTotal;
    case "labor_equipment": return labTotal + eqpTotal;
    case "all": return allFixedTotal;
    case "all_including_pct": return allFixedTotal + runningPctTotal;
    default: return allFixedTotal;
  }
}

/**
 * Compute the per-unit rate for a rate analysis from its ingredients.
 *
 * Pure function (no DB access) — exported for unit testing and reuse
 * by the analysis-library router. Used as the source of truth for
 * "ratePerUnit" calculations.
 *
 *   ratePerUnit = sum(ingredient.amount) / batchSize
 *
 * @param ingredients  The analysis ingredients (fixed + percentage, post-recalc)
 * @param batchSize    The analysis batch size (defaults to 1 if missing/zero)
 * @returns            Cost per 1 BOQ unit
 */
export function computeRatePerUnit(
  ingredients: { amount: number }[],
  batchSize: number
): number {
  const total = ingredients.reduce((s, i) => s + i.amount, 0);
  const batch = batchSize > 0 ? batchSize : 1;
  return total / batch;
}

/**
 * Compute the total amount for a BOQ line given its quantity and per-unit rate.
 *
 *   amount = quantity * rate
 *
 * Pure function — exported for unit testing and reuse.
 */
export function computeBoqAmount(quantity: number, rate: number): number {
  return quantity * rate;
}
