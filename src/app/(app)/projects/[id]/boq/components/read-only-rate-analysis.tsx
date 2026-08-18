"use client";

import { useState } from "react";
import Link from "next/link";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { ChevronDown, ChevronRight } from "lucide-react";
import { trpc } from "@/lib/trpc-client";

/**
 * ReadOnlyRateAnalysis — compact expandable view of an item's rate analyses.
 *
 * Shows 3 library-based analyses (Client's Estimate, Contractor Bid,
 * Contractor's Actual). Orphan analyses without a library (e.g. the
 * legacy "Standard" created by the seed) are filtered out by the
 * rateAnalysis.list query.
 *
 * Each analysis defaults to collapsed (just name + total). Click to
 * expand and see the full ingredient breakdown.
 *
 * Font sizes match the BOQ table (text-xs body, text-sm header) for
 * visual consistency.
 */
export function ReadOnlyRateAnalysis({ itemId, projectId }: { itemId: string; projectId: string }) {
  const { data, isLoading } = trpc.rateAnalysis.list.useQuery({ itemId });
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  function toggle(id: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  if (isLoading) return <Skeleton className="h-24" />;
  if (!data || data.analyses.length === 0) {
    return <p className="py-4 text-center text-xs text-muted-foreground">No rate analysis yet. Create one in the Analysis tab.</p>;
  }

  const fmt = (n: number) => n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const PCT_BASES: Record<string, string> = { material: "Materials", labor: "Labor", equipment: "Equipment", material_labor: "M+L", labor_equipment: "L+E", all: "All", all_including_pct: "All+%" };

  return (
    <div className="space-y-1.5">
      {data.analyses.map((analysis) => {
        const isExpanded = expandedIds.has(analysis.id);
        const fixed = analysis.ingredients.filter((i) => i.calcMode !== "percentage");
        const pct = analysis.ingredients.filter((i) => i.calcMode === "percentage");
        const matT = fixed.filter((i) => i.type === "material").reduce((s, i) => s + i.amount, 0);
        const labT = fixed.filter((i) => i.type === "labor").reduce((s, i) => s + i.amount, 0);
        const eqpT = fixed.filter((i) => i.type === "equipment").reduce((s, i) => s + i.amount, 0);
        const ovhT = fixed.filter((i) => i.type === "overhead").reduce((s, i) => s + i.amount, 0);
        const total = analysis.ingredients.reduce((s, i) => s + i.amount, 0);
        return (
          <div key={analysis.id} className="rounded-md border border-border/40 overflow-hidden">
            {/* Collapsed header — click to expand */}
            <button
              onClick={() => toggle(analysis.id)}
              className="flex w-full items-center gap-2 px-2 py-1.5 hover:bg-muted/30 transition-colors"
            >
              {isExpanded ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
              <span className="text-sm font-semibold">{analysis.name}</span>
              {analysis.isDefault && <Badge variant="secondary" className="text-[9px]">default</Badge>}
              <span className="ml-auto text-xs text-primary font-mono font-medium">NPR {fmt(total)}</span>
              <span className="text-[10px] text-muted-foreground">{analysis.ingredients.length} items</span>
            </button>

            {/* Expanded content — ingredient table */}
            {isExpanded && (
              <div className="border-t border-border/40">
                {analysis.ingredients.length > 0 ? (
                  <table className="w-full text-xs">
                    <thead className="bg-muted/20 text-left text-sm text-foreground">
                      <tr>
                        <th className="px-2 py-1.5 font-semibold">Name</th>
                        <th className="px-2 py-1.5 font-semibold">Type</th>
                        <th className="px-2 py-1.5 text-right font-semibold">Qty</th>
                        <th className="px-2 py-1.5 font-semibold">Unit</th>
                        <th className="px-2 py-1.5 text-right font-semibold">Rate</th>
                        <th className="px-2 py-1.5 text-right font-semibold">Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {fixed.map((ing) => {
                        const qwp = ing.quantity + (ing.quantity * (ing.percentage || 0)) / 100;
                        return (
                          <tr key={ing.id} className="border-b border-border/30 last:border-0">
                            <td className="px-2 py-1">{ing.name}</td>
                            <td className="px-2 py-1 capitalize text-muted-foreground">{ing.type}</td>
                            <td className="px-2 py-1 text-right font-mono">{ing.quantity}{ing.percentage > 0 && <span className="text-[9px] text-muted-foreground"> →{qwp.toFixed(3)}</span>}</td>
                            <td className="px-2 py-1 text-muted-foreground">{ing.unit}</td>
                            <td className="px-2 py-1 text-right font-mono">{fmt(ing.rate)}</td>
                            <td className="px-2 py-1 text-right font-mono font-medium">{fmt(ing.amount)}</td>
                          </tr>
                        );
                      })}
                      {matT > 0 && <tr className="bg-muted/5"><td colSpan={5} className="px-2 py-0.5 text-right text-muted-foreground">Materials:</td><td className="px-2 py-0.5 text-right font-mono font-medium">{fmt(matT)}</td></tr>}
                      {labT > 0 && <tr className="bg-muted/5"><td colSpan={5} className="px-2 py-0.5 text-right text-muted-foreground">Labor:</td><td className="px-2 py-0.5 text-right font-mono font-medium">{fmt(labT)}</td></tr>}
                      {eqpT > 0 && <tr className="bg-muted/5"><td colSpan={5} className="px-2 py-0.5 text-right text-muted-foreground">Equipment:</td><td className="px-2 py-0.5 text-right font-mono font-medium">{fmt(eqpT)}</td></tr>}
                      {ovhT > 0 && <tr className="bg-muted/5"><td colSpan={5} className="px-2 py-0.5 text-right text-muted-foreground">Overhead:</td><td className="px-2 py-0.5 text-right font-mono font-medium">{fmt(ovhT)}</td></tr>}
                      {pct.map((ing) => (
                        <tr key={ing.id} className="bg-amber-50/30 dark:bg-amber-950/10">
                          <td className="px-2 py-1">{ing.name}</td>
                          <td className="px-2 py-1 text-amber-700">% prov</td>
                          <td className="px-2 py-1"></td>
                          <td className="px-2 py-1 text-right">{ing.percentage}%</td>
                          <td className="px-2 py-1 text-muted-foreground" colSpan={1}>{PCT_BASES[ing.pctBase] ?? "all"}</td>
                          <td className="px-2 py-1 text-right font-mono font-medium text-amber-700">{fmt(ing.amount)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t font-bold bg-muted/20">
                        <td colSpan={5} className="px-2 py-1 text-right">Total:</td>
                        <td className="px-2 py-1 text-right font-mono text-primary">NPR {fmt(total)}</td>
                      </tr>
                    </tfoot>
                  </table>
                ) : (
                  <p className="px-2 py-2 text-xs text-muted-foreground italic">No ingredients yet.</p>
                )}
              </div>
            )}
          </div>
        );
      })}
      <Link href={`/projects/${projectId}/boq?tab=analysis`} className="block pt-1 text-center text-xs text-primary hover:underline">
        Edit in Analysis tab →
      </Link>
    </div>
  );
}
