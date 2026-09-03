"use client";

import { useMemo, useState } from "react";
import { trpc } from "@/lib/trpc-client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Eraser, Loader2, Scale, Split, Undo2 } from "lucide-react";
import { formatNpr } from "@/lib/construction-finance";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { format } from "date-fns";

/**
 * Manual allocation split editor (ADR-0007 §2): pins one person's payroll
 * cost to projects by hand instead of the automatic basis ladder
 * (attendance days → allocation % → residual).
 *
 * The server enforces the hard invariant — the five amount columns must
 * sum to the person record EXACTLY (to the cent) and every row carries an
 * overrideReason. This editor mirrors those rules client-side so the user
 * sees the balance state live, then submits through createPayrollRun
 * (additive: other persons in the run are never touched).
 */

const COLUMNS = [
  { key: "gross", label: "Gross" },
  { key: "allowances", label: "Allow." },
  { key: "advanceDeduction", label: "Advance" },
  { key: "tdsAmount", label: "TDS" },
  { key: "net", label: "Net" },
] as const;

type ColKey = (typeof COLUMNS)[number]["key"];
type RowAmts = Record<ColKey, number>;

/** ManualSplitRow shape expected by payroll.createPayrollRun. */
type ManualRow = {
  assignmentId: string;
  gross: number;
  allowances: number;
  advanceDeduction: number;
  tdsAmount: number;
  net: number;
  overrideReason: string;
};

/** Stored allocation row from the draft run (payroll.getRun). */
export type StoredAllocation = {
  assignmentId: string;
  basis: string;
  gross: number;
  allowances: number;
  advanceDeduction: number;
  tdsAmount: number;
  net: number;
  overrideReason: string | null;
  project?: { name?: string | null } | null;
};

const CENT = 0.005; // half-cent tolerance — mirrors payroll-allocation.ts

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

const ZERO_ROW: RowAmts = {
  gross: 0,
  allowances: 0,
  advanceDeduction: 0,
  tdsAmount: 0,
  net: 0,
};

export function PayrollAllocationDialog({
  projectId,
  month,
  item,
  storedAllocations,
  onSaved,
  onClose,
}: {
  projectId: string;
  month: string;
  item: {
    personId: string;
    staffName: string;
    gross: number;
    allowances: number;
    advanceDeduction: number;
    tdsAmount: number;
    netPayable: number;
  };
  /** Draft-run allocation rows for this person, if a run exists (prefill). */
  storedAllocations: StoredAllocation[] | null;
  onSaved: (rows: ManualRow[] | null) => void;
  onClose: () => void;
}) {
  const utils = trpc.useUtils();

  // Active org-wide engagements — the exact universe the server allocates
  // over (no period filter; statuses other than active never split).
  // projectId is required by the projectProcedure middleware (raw input).
  const historyInput = { projectId, personId: item.personId };
  const { data: history, isLoading } = trpc.hr.getPersonHistory.useQuery(historyInput);

  const activeAssignments = useMemo(
    () => (history?.assignments ?? []).filter((a) => a.status === "active"),
    [history],
  );

  const [amounts, setAmounts] = useState<Record<string, RowAmts>>(() => {
    const seed: Record<string, RowAmts> = {};
    for (const alloc of storedAllocations ?? []) {
      seed[alloc.assignmentId] = {
        gross: alloc.gross,
        allowances: alloc.allowances,
        advanceDeduction: alloc.advanceDeduction,
        tdsAmount: alloc.tdsAmount,
        net: alloc.net,
      };
    }
    return seed;
  });
  const [reason, setReason] = useState<string>(() => {
    const reasons = (storedAllocations ?? [])
      .map((a) => a.overrideReason)
      .filter((r): r is string => Boolean(r && r.trim()));
    return reasons[0] ?? "";
  });

  const target: RowAmts = useMemo(
    () => ({
      gross: item.gross,
      allowances: item.allowances,
      advanceDeduction: item.advanceDeduction,
      tdsAmount: item.tdsAmount,
      net: item.netPayable,
    }),
    [item],
  );

  const storedBasis = useMemo(() => {
    if (!storedAllocations || storedAllocations.length === 0) return null;
    if (storedAllocations.some((a) => a.basis === "manual")) return "manual";
    return storedAllocations[0].basis;
  }, [storedAllocations]);

  const setRow = (assignmentId: string, key: ColKey, raw: string) => {
    const parsed = raw === "" ? 0 : Number(raw);
    setAmounts((prev) => ({
      ...prev,
      [assignmentId]: {
        ...ZERO_ROW,
        ...(prev[assignmentId] ?? {}),
        [key]: Number.isFinite(parsed) ? parsed : 0,
      },
    }));
  };

  const rowSum = (key: ColKey) =>
    round2(
      activeAssignments.reduce((sum, a) => sum + (amounts[a.id]?.[key] ?? 0), 0),
    );
  const colDiff = (key: ColKey) => round2(rowSum(key) - target[key]);
  const colBalanced = (key: ColKey) => Math.abs(colDiff(key)) <= CENT;

  const balanced = COLUMNS.every((c) => colBalanced(c.key));
  const submittedRows = activeAssignments.filter((a) =>
    COLUMNS.some((c) => (amounts[a.id]?.[c.key] ?? 0) !== 0),
  );
  const reasonOk = reason.trim().length >= 3;
  const nonNegative = activeAssignments.every((a) =>
    COLUMNS.every((c) => (amounts[a.id]?.[c.key] ?? 0) >= 0),
  );

  // ── Quick fills ────────────────────────────────────────────────────
  const distribute = (weights: Array<{ id: string; w: number }>) => {
    const total = weights.reduce((s, x) => s + x.w, 0);
    if (weights.length === 0 || total <= 0) return fillEven();
    const next: Record<string, RowAmts> = {};
    const remaining: RowAmts = { ...target };
    weights.forEach((x, idx) => {
      const last = idx === weights.length - 1;
      const row = last
        ? { ...remaining }
        : {
            gross: round2((target.gross * x.w) / total),
            allowances: round2((target.allowances * x.w) / total),
            advanceDeduction: round2((target.advanceDeduction * x.w) / total),
            tdsAmount: round2((target.tdsAmount * x.w) / total),
            net: round2((target.net * x.w) / total),
          };
      for (const c of COLUMNS) {
        remaining[c.key] = round2(remaining[c.key] - row[c.key]);
      }
      next[x.id] = row;
    });
    setAmounts(next);
  };

  const fillEven = () => distribute(activeAssignments.map((a) => ({ id: a.id, w: 1 })));

  const fillByPercent = () => {
    const percents = activeAssignments.map((a) => a.allocationPercent ?? 0);
    const all = percents.length > 0 && percents.every((p) => p > 0);
    if (!all) {
      toast.info("Not every engagement has an allocation % — splitting evenly instead.");
      fillEven();
      return;
    }
    distribute(activeAssignments.map((a) => ({ id: a.id, w: a.allocationPercent ?? 0 })));
  };

  /** Put the exact remainder of every column on the last engagement row. */
  const balanceLastRow = () => {
    if (activeAssignments.length === 0) return;
    const last = activeAssignments[activeAssignments.length - 1];
    const others = activeAssignments.slice(0, -1);
    const next: Record<string, RowAmts> = {};
    for (const a of activeAssignments) next[a.id] = { ...(amounts[a.id] ?? ZERO_ROW) };
    for (const c of COLUMNS) {
      const othersSum = round2(others.reduce((s, a) => s + (amounts[a.id]?.[c.key] ?? 0), 0));
      next[last.id][c.key] = round2(target[c.key] - othersSum);
    }
    setAmounts(next);
  };

  const clearRows = () => {
    setAmounts({});
    setReason("");
  };

  // ── Mutations ──────────────────────────────────────────────────────
  const saveMut = trpc.payroll.createPayrollRun.useMutation({
    onSuccess: (_res, vars) => {
      const pinned = vars.records[0]?.manualAllocations?.length ?? 0;
      toast.success(
        pinned > 0
          ? `Manual split saved for ${item.staffName} (${pinned} row${pinned === 1 ? "" : "s"}, audited).`
          : `Manual split cleared — ${item.staffName} is back on the automatic basis.`,
      );
      utils.payroll.calculate.invalidate({ projectId, month });
      utils.payroll.getRun.invalidate();
      onSaved(pinned > 0 ? buildRows() : null);
      onClose();
    },
    onError: (e) => toast.error(e.message),
  });

  const buildRows = (): ManualRow[] =>
    submittedRows.map((a) => ({
      assignmentId: a.id,
      gross: amounts[a.id].gross,
      allowances: amounts[a.id].allowances,
      advanceDeduction: amounts[a.id].advanceDeduction,
      tdsAmount: amounts[a.id].tdsAmount,
      net: amounts[a.id].net,
      overrideReason: reason.trim(),
    }));

  const handleSave = () => {
    if (submittedRows.length === 0) {
      toast.error("Enter at least one non-zero allocation row.");
      return;
    }
    if (!nonNegative) {
      toast.error("Amounts cannot be negative.");
      return;
    }
    if (!balanced) {
      toast.error("The split does not balance to the cent — use “Balance last row”.");
      return;
    }
    if (!reasonOk) {
      toast.error("An override reason (min 3 chars) is required — the split is audited.");
      return;
    }
    saveMut.mutate({
      month,
      records: [{ personId: item.personId, manualAllocations: buildRows() }],
    });
  };

  /** Drop the manual split entirely: re-save the person without rows. */
  const handleRevertToAuto = () => {
    saveMut.mutate({
      month,
      records: [{ personId: item.personId }],
    });
  };

  const fmtDate = (d: Date | string | null | undefined) =>
    d ? format(new Date(d), "yyyy-MM-dd") : "—";

  return (
    <Dialog
      open
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Split className="h-5 w-5 text-primary" />
            Allocation Split — {item.staffName}
            <Badge variant="outline" className="font-mono text-[10px]">{month}</Badge>
          </DialogTitle>
          <DialogDescription className="text-xs">
            Pin this person&apos;s cost to projects by hand. All five columns must balance to the
            cent (Σ rows ≡ record) and the split is audited with a reason.
            {storedBasis && (
              <span className="block mt-1 text-[10px] text-muted-foreground">
                Prefilled from the saved {month} run (basis: <span className="font-mono">{storedBasis}</span>) —
                saving pins it as a manual split.
              </span>
            )}
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center gap-2 py-10 text-xs text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading engagements…
          </div>
        ) : activeAssignments.length === 0 ? (
          <p className="text-[11px] text-muted-foreground italic py-4">
            No active engagements found for this person — cannot split.
          </p>
        ) : activeAssignments.length === 1 ? (
          <p className="text-[11px] text-muted-foreground italic py-4">
            Only one active engagement ({activeAssignments[0].project?.name}) — the full cost rides
            that project; no split needed.
          </p>
        ) : (
          <div className="space-y-3 py-1">
            {/* Target strip */}
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-2.5 py-1.5 rounded border bg-muted/40 text-[11px] font-mono tabular-nums">
              <span className="font-sans font-semibold text-muted-foreground uppercase text-[9px]">
                Record totals
              </span>
              {COLUMNS.map((c) => (
                <span key={c.key} className={cn(c.key === "net" && "font-bold text-emerald-700 dark:text-emerald-300")}>
                  {c.label}: {formatNpr(target[c.key])}
                </span>
              ))}
            </div>

            {/* Quick fills */}
            <div className="flex flex-wrap items-center gap-1.5">
              <Button type="button" size="sm" variant="outline" className="h-7 text-[11px] gap-1" onClick={fillEven}>
                Split evenly
              </Button>
              <Button type="button" size="sm" variant="outline" className="h-7 text-[11px] gap-1" onClick={fillByPercent}>
                By allocation %
              </Button>
              <Button type="button" size="sm" variant="outline" className="h-7 text-[11px] gap-1" onClick={balanceLastRow}>
                <Scale className="h-3 w-3" /> Balance last row
              </Button>
              <Button type="button" size="sm" variant="ghost" className="h-7 text-[11px] gap-1 text-muted-foreground" onClick={clearRows}>
                <Eraser className="h-3 w-3" /> Clear
              </Button>
            </div>

            {/* Rows per engagement */}
            <div className="rounded-md border divide-y">
              {activeAssignments.map((a) => (
                <div key={a.id} className="px-2.5 py-2 space-y-1.5">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                    <span className="font-medium text-foreground">
                      {a.project?.name || a.projectId}
                      {a.designation && <span className="text-muted-foreground"> · {a.designation}</span>}
                    </span>
                    <span className="flex items-center gap-1.5">
                      {(a.allocationPercent ?? 0) > 0 && (
                        <Badge variant="secondary" className="text-[9px] px-1.5 py-0 font-mono">
                          {a.allocationPercent}%
                        </Badge>
                      )}
                      <span className="text-[10px] font-mono text-muted-foreground">
                        from {fmtDate(a.fromDate)}
                      </span>
                    </span>
                  </div>
                  <div className="grid grid-cols-5 gap-1.5">
                    {COLUMNS.map((c) => (
                      <label key={c.key} className="space-y-0.5">
                        <span className="block text-[9px] uppercase tracking-wide text-muted-foreground">{c.label}</span>
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          inputMode="decimal"
                          className="h-7 text-[11px] font-mono"
                          value={amounts[a.id]?.[c.key] ?? 0}
                          onChange={(e) => setRow(a.id, c.key, e.target.value)}
                        />
                      </label>
                    ))}
                  </div>
                </div>
              ))}

              {/* Balance footer */}
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-2.5 py-2 bg-muted/30 text-[11px] font-mono tabular-nums">
                <span className="font-sans font-semibold text-muted-foreground uppercase text-[9px]">Balance</span>
                {COLUMNS.map((c) => {
                  const ok = colBalanced(c.key);
                  const diff = colDiff(c.key);
                  return (
                    <span key={c.key} className={cn(ok ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400 font-bold")}>
                      {c.label}: {formatNpr(rowSum(c.key))}
                      {!ok && <span className="ml-1">({diff > 0 ? "+" : ""}{formatNpr(diff)})</span>}
                    </span>
                  );
                })}
              </div>
            </div>

            {/* Audited reason — stamped on every submitted row */}
            <div className="space-y-1">
              <label className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                Override reason <span className="normal-case font-normal">(audited, applied to every row)</span>
              </label>
              <Textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="e.g. Worker split 60/40 between sites by foreman agreement — attendance log lost to rain"
                className="min-h-[56px] text-xs"
              />
            </div>
          </div>
        )}

        <DialogFooter className="gap-2 pt-1">
          {storedBasis === "manual" && (
            <Button
              size="sm"
              variant="ghost"
              onClick={handleRevertToAuto}
              disabled={saveMut.isPending}
              className="h-7 text-xs gap-1 text-muted-foreground"
            >
              {saveMut.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Undo2 className="h-3 w-3" />}
              Revert to Auto
            </Button>
          )}
          <Button size="sm" variant="outline" onClick={onClose} className="h-7 text-xs">
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={handleSave}
            disabled={
              saveMut.isPending ||
              isLoading ||
              activeAssignments.length < 2 ||
              submittedRows.length === 0 ||
              !balanced ||
              !reasonOk ||
              !nonNegative
            }
            className="h-7 text-xs bg-primary hover:bg-primary/90 text-primary-foreground font-semibold gap-1"
          >
            {saveMut.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Split className="h-3 w-3" />}
            Save Manual Split
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
