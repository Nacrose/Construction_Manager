"use client";

import { useState, Fragment } from "react";
import Link from "next/link";
import { ChevronDown, ChevronRight, MapPin, Layers } from "lucide-react";
import { cn } from "@/lib/utils";

export type ProgramTask = {
  id: string;
  taskName: string;
  boqCode?: string | null;
  boqDesc?: string | null;
  location?: string | null;
  assignedTo?: string | null;
  plannedQty: number;
  actualQty?: number | null;
  unit?: string | null;
  paymentType: string;
  executionStatus: string;
  rfi?: { id: string; number: string } | null;
  ganttTask?: { id: string; code?: string | null; name: string } | null;
  boqItem?: {
    ingredients: Array<{
      name: string;
      type: string;
      quantity: number;
      unit: string;
      amount: number;
    }>;
  } | null;
};

export function TaskTable({ tasks, projectId }: { tasks: ProgramTask[]; projectId: string }) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const execStatusColors: Record<string, string> = {
    planned: "bg-muted/40 text-muted-foreground border-border/80",
    done: "bg-primary/10 text-primary border-primary/40",
    partially_completed: "bg-amber-500/10 text-amber-400 border-amber-500/40",
    uncompleted: "bg-destructive/10 text-destructive border-destructive/40",
    postponed: "bg-purple-500/10 text-purple-400 border-purple-500/40",
    cancelled: "bg-muted/30 text-muted-foreground/60 border-border/40",
  };

  const paymentColors: Record<string, string> = {
    payable: "bg-primary/10 text-primary border-primary/30",
    unpayable: "bg-destructive/10 text-destructive border-destructive/30",
    temporary: "bg-amber-500/10 text-amber-400 border-amber-500/30",
  };

  return (
    <div className="overflow-x-auto no-scrollbar font-mono text-xs">
      <table className="w-full table-auto tabular-nums">
        <thead className="sticky top-0 z-20 bg-muted/90 backdrop-blur-md border-b border-border/80">
          <tr className="text-left uppercase font-bold text-[10px] tracking-wide text-primary">
            <th className="w-7 py-2 px-1 text-center">#</th>
            <th className="w-28 py-2 px-2">RFI / Task</th>
            <th className="py-2 px-3 min-w-[200px]">Description & BOQ</th>
            <th className="w-28 py-2 px-2">Location</th>
            <th className="w-20 py-2 px-2 text-right">Planned</th>
            <th className="w-20 py-2 px-2 text-right">Actual</th>
            <th className="w-12 py-2 px-1 text-center">Unit</th>
            <th className="w-20 py-2 px-2 text-center">Payment</th>
            <th className="w-24 py-2 px-2 text-center">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border/40">
          {tasks.map((t, i) => {
            const hasIngredients = !!(t.boqItem?.ingredients && t.boqItem.ingredients.length > 0);
            const isExpanded = expandedId === t.id;

            return (
              <Fragment key={t.id}>
                <tr
                  className={cn(
                    "hover:bg-primary/5 transition-colors cursor-pointer",
                    i % 2 === 1 ? "bg-muted/15" : "bg-card",
                    isExpanded && "bg-primary/10"
                  )}
                  onClick={() => hasIngredients && setExpandedId(isExpanded ? null : t.id)}
                >
                  {/* Row Number & Expand Arrow */}
                  <td className="py-1.5 px-1 text-center text-muted-foreground">
                    {hasIngredients ? (
                      <button
                        type="button"
                        className="inline-flex items-center justify-center h-4 w-4 rounded hover:bg-muted text-primary"
                        onClick={(e) => {
                          e.stopPropagation();
                          setExpandedId(isExpanded ? null : t.id);
                        }}
                      >
                        {isExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                      </button>
                    ) : (
                      <span className="text-[10px]">{i + 1}</span>
                    )}
                  </td>

                  {/* RFI / Task Code */}
                  <td className="py-1.5 px-2">
                    <div className="flex flex-col gap-0.5">
                      {t.rfi ? (
                        <Link
                          href={`/projects/${projectId}/workflow/rfi`}
                          className="font-bold text-primary hover:underline truncate"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {t.rfi.number}
                        </Link>
                      ) : (
                        <span className="text-muted-foreground/60">—</span>
                      )}
                      {t.ganttTask && (
                        <span className="text-[9px] text-muted-foreground truncate" title={t.ganttTask.name}>
                          [{t.ganttTask.code ?? "T"}] {t.ganttTask.name}
                        </span>
                      )}
                    </div>
                  </td>

                  {/* Description & BOQ */}
                  <td className="py-1.5 px-3">
                    <div className="flex flex-col">
                      <span className="font-medium text-foreground leading-snug">{t.taskName}</span>
                      {t.boqCode && (
                        <span className="text-[10px] text-muted-foreground truncate" title={t.boqDesc ?? ""}>
                          BOQ: {t.boqCode} {t.boqDesc ? `· ${t.boqDesc}` : ""}
                        </span>
                      )}
                    </div>
                  </td>

                  {/* Location */}
                  <td className="py-1.5 px-2 text-muted-foreground">
                    {t.location ? (
                      <span className="flex items-center gap-1 text-[11px] truncate">
                        <MapPin className="h-2.5 w-2.5 shrink-0 text-muted-foreground/60" />
                        {t.location}
                      </span>
                    ) : (
                      <span className="text-muted-foreground/40">—</span>
                    )}
                  </td>

                  {/* Planned Qty */}
                  <td className="py-1.5 px-2 text-right font-bold text-foreground tabular-nums">
                    {t.plannedQty}
                  </td>

                  {/* Actual Qty */}
                  <td className="py-1.5 px-2 text-right font-bold text-primary tabular-nums">
                    {t.actualQty !== null && t.actualQty !== undefined ? t.actualQty : "—"}
                  </td>

                  {/* Unit */}
                  <td className="py-1.5 px-1 text-center text-muted-foreground text-[10px]">
                    {t.unit || "—"}
                  </td>

                  {/* Payment */}
                  <td className="py-1.5 px-2 text-center">
                    <span className={cn("px-1.5 py-0.5 rounded border text-[9px] uppercase font-bold", paymentColors[t.paymentType] || paymentColors.payable)}>
                      {t.paymentType}
                    </span>
                  </td>

                  {/* Status */}
                  <td className="py-1.5 px-2 text-center">
                    <span className={cn("px-1.5 py-0.5 rounded border text-[9px] uppercase font-bold", execStatusColors[t.executionStatus] || execStatusColors.planned)}>
                      {t.executionStatus?.replace(/_/g, " ")}
                    </span>
                  </td>
                </tr>

                {/* Expanded BOQ Rate Analysis Ingredients Breakdown */}
                {isExpanded && hasIngredients && (
                  <tr className="bg-muted/30">
                    <td colSpan={9} className="p-3 pl-8">
                      <div className="rounded border border-border/80 bg-card p-2.5 space-y-2">
                        <div className="flex items-center justify-between text-[11px] font-bold text-primary">
                          <span className="flex items-center gap-1.5 uppercase tracking-wide">
                            <Layers className="h-3.5 w-3.5" />
                            Rate Analysis Ingredients Breakdown
                          </span>
                          <span className="text-muted-foreground font-normal text-[10px]">
                            Calculated for Planned Qty: {t.plannedQty} {t.unit}
                          </span>
                        </div>
                        <table className="w-full text-[11px] tabular-nums">
                          <thead>
                            <tr className="border-b border-border/60 text-left text-muted-foreground text-[9px] uppercase">
                              <th className="py-1 px-1">Type</th>
                              <th className="py-1 px-2">Resource Name</th>
                              <th className="py-1 px-2 text-right">Coefficient</th>
                              <th className="py-1 px-2 text-right">Total Requirement</th>
                              <th className="py-1 px-1 text-center">Unit</th>
                              <th className="py-1 px-2 text-right">Estimated Cost (NPR)</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-border/30">
                            {t.boqItem!.ingredients.map((ing, j) => {
                              const totalQty = ing.quantity * t.plannedQty;
                              const totalCost = ing.amount * t.plannedQty;
                              return (
                                <tr key={j} className="hover:bg-muted/20">
                                  <td className="py-1 px-1">
                                    <span className="px-1 py-0.5 rounded border border-border/60 text-[9px] uppercase text-muted-foreground bg-muted/40">
                                      {ing.type?.slice(0, 3) || "res"}
                                    </span>
                                  </td>
                                  <td className="py-1 px-2 font-medium text-foreground">{ing.name}</td>
                                  <td className="py-1 px-2 text-right text-muted-foreground">{ing.quantity}</td>
                                  <td className="py-1 px-2 text-right font-bold text-foreground">{totalQty.toFixed(2)}</td>
                                  <td className="py-1 px-1 text-center text-muted-foreground">{ing.unit}</td>
                                  <td className="py-1 px-2 text-right font-bold text-primary">
                                    {totalCost.toLocaleString("en-IN", { maximumFractionDigits: 0 })}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
