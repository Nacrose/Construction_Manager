/**
 * Payroll allocation planner (ADR-0007 §2) — the pure, deterministic
 * core of splitting one person's payroll cost to projects.
 *
 * HARD INVARIANT: Σ allocation.net ≡ person record.netPayable EXACTLY
 * (2-decimal arithmetic; the residual lands on the last allocation so
 * rounding can never drift). The ledger's balance tolerance is eq(0)
 * (ADR-0001) — drift would fail the JE loudly, so it is never allowed
 * to exist here.
 *
 * Basis ladder (per person, per period):
 *   1. `manual`        — caller-supplied split, requires an
 *                        overrideReason per row (audited); all five
 *                        amount columns must sum to the record's
 *                        amounts EXACTLY.
 *   2. `actual_days`   — effective attendance days per assignment
 *                        (present=1, overtime=1, half_day=0.5), the
 *                        actual-approved-days rule.
 *   3. `allocation_percent` — the assignments' allocationPercent as
 *                        the fallback share of monthly capacity
 *                        (normalized over the sum of percents).
 *   4. `residual`      — no attendance and no percents: the whole cost
 *                        rides the primary (earliest) assignment.
 *
 * Only assignments carrying a share receive allocation rows — zero-share
 * rows are noise in the ledger.
 */

export type AllocationAssignment = {
  id: string;
  projectId: string;
  fromDate: Date;
  allocationPercent: number | null; // 0..100
};

export type PersonCost = {
  netPayable: number;
  gross: number;
  allowances: number;
  advanceDeduction: number;
  tdsAmount: number;
};

export type ManualSplitRow = {
  assignmentId: string;
  gross: number;
  allowances: number;
  advanceDeduction: number;
  tdsAmount: number;
  net: number;
  overrideReason: string;
};

export type PlannedAllocation = {
  assignmentId: string;
  projectId: string;
  basis: "actual_days" | "allocation_percent" | "manual" | "residual";
  presentDays: number;
  allocationPercent: number | null;
  gross: number;
  allowances: number;
  advanceDeduction: number;
  tdsAmount: number;
  net: number;
  overrideReason: string | null;
};

/** Round to 2 decimal places without float drift beyond cents. */
function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

const CENT = 0.005; // half-cent tolerance for "exact" 2dp comparisons

function costOf(amount: number, weight: number): number {
  return round2(amount * weight);
}

export function planPersonAllocations(args: {
  /** ALL the person's active assignments org-wide, ordered by fromDate ascending. */
  assignments: AllocationAssignment[];
  /** Effective attendance days per assignment id for the period. */
  effectiveDays: Map<string, number>;
  cost: PersonCost;
  manual?: ManualSplitRow[] | null;
}): PlannedAllocation[] {
  const { assignments, effectiveDays, cost } = args;

  if (assignments.length === 0) {
    throw new Error("planPersonAllocations requires at least one active assignment");
  }

  // ── 1. Manual (audited override) ──────────────────────────────────
  if (args.manual && args.manual.length > 0) {
    return planManual(assignments, cost, args.manual);
  }

  // ── 2. Actual attendance days ─────────────────────────────────────
  const dayBearing = assignments.filter((a) => (effectiveDays.get(a.id) ?? 0) > 0);
  const totalDays = dayBearing.reduce((s, a) => s + (effectiveDays.get(a.id) ?? 0), 0);
  if (dayBearing.length > 0 && totalDays > 0) {
    return shareBy(dayBearing, cost, totalDays, (a) => effectiveDays.get(a.id) ?? 0, {
      basis: "actual_days",
      presentDays: (a) => effectiveDays.get(a.id) ?? 0,
      allocationPercent: () => null,
    });
  }

  // ── 3. allocationPercent fallback ─────────────────────────────────
  const pctBearing = assignments.filter((a) => (a.allocationPercent ?? 0) > 0);
  const totalPct = pctBearing.reduce((s, a) => s + (a.allocationPercent ?? 0), 0);
  if (pctBearing.length > 0 && totalPct > 0) {
    return shareBy(pctBearing, cost, totalPct, (a) => a.allocationPercent ?? 0, {
      basis: "allocation_percent",
      presentDays: () => 0,
      allocationPercent: (a) => a.allocationPercent ?? 0,
    });
  }

  // ── 4. Residual on the primary (earliest) assignment ──────────────
  const primary = assignments[0];
  return [
    {
      assignmentId: primary.id,
      projectId: primary.projectId,
      basis: "residual",
      presentDays: 0,
      allocationPercent: null,
      gross: round2(cost.gross),
      allowances: round2(cost.allowances),
      advanceDeduction: round2(cost.advanceDeduction),
      tdsAmount: round2(cost.tdsAmount),
      net: round2(cost.netPayable),
      overrideReason: null,
    },
  ];
}

/** Weighted split with the residual landing on the LAST weighted assignment. */
function shareBy(
  weighted: AllocationAssignment[],
  cost: PersonCost,
  totalWeight: number,
  weightOf: (a: AllocationAssignment) => number,
  meta: {
    basis: PlannedAllocation["basis"];
    presentDays: (a: AllocationAssignment) => number;
    allocationPercent: (a: AllocationAssignment) => number | null;
  },
): PlannedAllocation[] {
  const rows: PlannedAllocation[] = [];
  const remaining = { ...cost };

  weighted.forEach((a, idx) => {
    const isLast = idx === weighted.length - 1;
    const w = weightOf(a) / totalWeight;

    const gross = isLast ? round2(remaining.gross) : costOf(cost.gross, w);
    const allowances = isLast ? round2(remaining.allowances) : costOf(cost.allowances, w);
    const advanceDeduction = isLast ? round2(remaining.advanceDeduction) : costOf(cost.advanceDeduction, w);
    const tdsAmount = isLast ? round2(remaining.tdsAmount) : costOf(cost.tdsAmount, w);
    const net = isLast ? round2(remaining.netPayable) : costOf(cost.netPayable, w);

    remaining.gross = round2(remaining.gross - gross);
    remaining.allowances = round2(remaining.allowances - allowances);
    remaining.advanceDeduction = round2(remaining.advanceDeduction - advanceDeduction);
    remaining.tdsAmount = round2(remaining.tdsAmount - tdsAmount);
    remaining.netPayable = round2(remaining.netPayable - net);

    rows.push({
      assignmentId: a.id,
      projectId: a.projectId,
      basis: meta.basis,
      presentDays: meta.presentDays(a),
      allocationPercent: meta.allocationPercent(a),
      gross,
      allowances,
      advanceDeduction,
      tdsAmount,
      net,
      overrideReason: null,
    });
  });

  return rows.filter(
    (r) => r.net !== 0 || r.gross !== 0 || r.advanceDeduction !== 0 || r.tdsAmount !== 0 || r.allowances !== 0,
  );
}

/** Manual split: audited, strict — sums must match the record EXACTLY. */
function planManual(
  assignments: AllocationAssignment[],
  cost: PersonCost,
  manual: ManualSplitRow[],
): PlannedAllocation[] {
  const byId = new Map(assignments.map((a) => [a.id, a]));

  const sum = {
    gross: round2(manual.reduce((s, r) => s + r.gross, 0)),
    allowances: round2(manual.reduce((s, r) => s + r.allowances, 0)),
    advanceDeduction: round2(manual.reduce((s, r) => s + r.advanceDeduction, 0)),
    tdsAmount: round2(manual.reduce((s, r) => s + r.tdsAmount, 0)),
    net: round2(manual.reduce((s, r) => s + r.net, 0)),
  };

  const mismatches: string[] = [];
  if (Math.abs(sum.net - cost.netPayable) > CENT) mismatches.push(`net ${sum.net} ≠ ${cost.netPayable}`);
  if (Math.abs(sum.gross - cost.gross) > CENT) mismatches.push(`gross ${sum.gross} ≠ ${cost.gross}`);
  if (Math.abs(sum.allowances - cost.allowances) > CENT) mismatches.push(`allowances ${sum.allowances} ≠ ${cost.allowances}`);
  if (Math.abs(sum.advanceDeduction - cost.advanceDeduction) > CENT) mismatches.push(`advanceDeduction ${sum.advanceDeduction} ≠ ${cost.advanceDeduction}`);
  if (Math.abs(sum.tdsAmount - cost.tdsAmount) > CENT) mismatches.push(`tdsAmount ${sum.tdsAmount} ≠ ${cost.tdsAmount}`);
  if (mismatches.length > 0) {
    throw new Error(
      `Manual allocation split does not sum to the person record EXACTLY (${mismatches.join("; ")}) — adjust the split so it balances to the cent.`,
    );
  }

  return manual.map((r) => {
    const a = byId.get(r.assignmentId);
    if (!a) {
      throw new Error(
        `Manual allocation references assignment ${r.assignmentId}, which is not one of this person's active assignments.`,
      );
    }
    if (!r.overrideReason || !r.overrideReason.trim()) {
      throw new Error("Every manual allocation row requires an override reason (audited).");
    }
    return {
      assignmentId: a.id,
      projectId: a.projectId,
      basis: "manual" as const,
      presentDays: 0,
      allocationPercent: null,
      gross: round2(r.gross),
      allowances: round2(r.allowances),
      advanceDeduction: round2(r.advanceDeduction),
      tdsAmount: round2(r.tdsAmount),
      net: round2(r.net),
      overrideReason: r.overrideReason,
    };
  });
}
