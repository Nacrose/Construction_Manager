"use client";

import { format } from "date-fns";
import { Check, Loader2 } from "lucide-react";

function safeFormat(dateVal: any, formatStr: string, fallback = "—"): string {
  if (!dateVal) return fallback;
  try {
    const d = typeof dateVal === "string" || typeof dateVal === "number" ? new Date(dateVal) : dateVal;
    if (isNaN(d.getTime())) return fallback;
    return format(d, formatStr);
  } catch {
    return fallback;
  }
}

export function GanttAnalysisModals({
  showEVM,
  evmLoading,
  evmData,
  showConflicts,
  conflictsLoading,
  conflictsData,
  isExecution,
  showVariance,
  varianceLoading,
  varianceData,
  id,
  applyLevelingMutation,
}: {
  showEVM: boolean;
  evmLoading: boolean;
  evmData: any;
  showConflicts: boolean;
  conflictsLoading: boolean;
  conflictsData: any;
  isExecution: boolean;
  showVariance: boolean;
  varianceLoading: boolean;
  varianceData: any;
  id: string;
  applyLevelingMutation: any;
}) {
  if (showEVM) {
    return (
      <div className="h-full overflow-y-auto p-4 font-mono">
        {evmLoading ? (
          <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
            Calculating EVM metrics…
          </div>
        ) : evmData && !("error" in evmData) ? (
          <div className="space-y-3">
            {/* Status banner */}
            <div
              className={`rounded-lg border p-3 ${
                evmData.status === "critical"
                  ? "border-red-300 bg-red-50/50"
                  : evmData.status === "over_budget"
                    ? "border-amber-300 bg-amber-50/50"
                    : evmData.status === "behind_schedule"
                      ? "border-amber-300 bg-amber-50/50"
                      : "border-emerald-300 bg-emerald-50/50"
              }`}
            >
              <p
                className={`text-sm font-bold ${
                  evmData.status === "critical"
                    ? "text-red-600"
                    : evmData.status === "over_budget" || evmData.status === "behind_schedule"
                      ? "text-amber-600"
                      : "text-emerald-600"
                }`}
              >
                {evmData.statusLabel}
              </p>
            </div>

            {/* Key metrics grid */}
            <div className="grid grid-cols-3 gap-2">
              <div className="rounded-lg border bg-card p-3">
                <p className="text-[10px] text-muted-foreground uppercase">CPI (Cost)</p>
                <p
                  className={`text-2xl font-bold ${evmData.cpi >= 1 ? "text-emerald-600" : "text-red-600"}`}
                >
                  {evmData.cpi.toFixed(2)}
                </p>
                <p className="text-[9px] text-muted-foreground">
                  {evmData.cpi >= 1 ? "Under budget" : "Over budget"}
                </p>
              </div>
              <div className="rounded-lg border bg-card p-3">
                <p className="text-[10px] text-muted-foreground uppercase">SPI (Schedule)</p>
                <p
                  className={`text-2xl font-bold ${evmData.spi >= 1 ? "text-emerald-600" : "text-red-600"}`}
                >
                  {evmData.spi.toFixed(2)}
                </p>
                <p className="text-[9px] text-muted-foreground">
                  {evmData.spi >= 1 ? "Ahead of schedule" : "Behind schedule"}
                </p>
              </div>
              <div className="rounded-lg border bg-card p-3">
                <p className="text-[10px] text-muted-foreground uppercase">VAC (Forecast)</p>
                <p
                  className={`text-2xl font-bold ${evmData.vac >= 0 ? "text-emerald-600" : "text-red-600"}`}
                >
                  NPR {Math.abs(evmData.vac).toLocaleString("en-IN", { maximumFractionDigits: 0 })}
                </p>
                <p className="text-[9px] text-muted-foreground">
                  {evmData.vac >= 0 ? "Projected savings" : "Projected overrun"}
                </p>
              </div>
            </div>

            {/* Cost breakdown */}
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-lg border bg-card p-3 space-y-1.5">
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">BAC (Total Budget)</span>
                  <span className="font-mono font-medium">
                    NPR {evmData.bac.toLocaleString("en-IN", { maximumFractionDigits: 0 })}
                  </span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">PV (Planned Value)</span>
                  <span className="font-mono font-medium">
                    NPR {evmData.pv.toLocaleString("en-IN", { maximumFractionDigits: 0 })}
                  </span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">EV (Earned Value)</span>
                  <span className="font-mono font-medium text-emerald-600">
                    NPR {evmData.ev.toLocaleString("en-IN", { maximumFractionDigits: 0 })}
                  </span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">AC (Actual Cost)</span>
                  <span className="font-mono font-medium text-red-600">
                    NPR {evmData.ac.toLocaleString("en-IN", { maximumFractionDigits: 0 })}
                  </span>
                </div>
                <div className="border-t pt-1.5 flex justify-between text-xs">
                  <span className="text-muted-foreground">EAC (Est. at Completion)</span>
                  <span className="font-mono font-bold">
                    NPR {evmData.eac.toLocaleString("en-IN", { maximumFractionDigits: 0 })}
                  </span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">ETC (Est. to Complete)</span>
                  <span className="font-mono font-medium">
                    NPR {evmData.etc.toLocaleString("en-IN", { maximumFractionDigits: 0 })}
                  </span>
                </div>
              </div>
              <div className="rounded-lg border bg-card p-3 space-y-1.5">
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">% Complete (EV/BAC)</span>
                  <span className="font-mono font-medium">{evmData.percentComplete.toFixed(1)}%</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">% Spent (AC/BAC)</span>
                  <span className="font-mono font-medium">{evmData.percentSpent.toFixed(1)}%</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">% Scheduled (PV/BAC)</span>
                  <span className="font-mono font-medium">
                    {evmData.percentScheduled.toFixed(1)}%
                  </span>
                </div>
                <div className="border-t pt-1.5 flex justify-between text-xs">
                  <span className="text-muted-foreground">CV (Cost Variance)</span>
                  <span
                    className={`font-mono font-medium ${evmData.cv >= 0 ? "text-emerald-600" : "text-red-600"}`}
                  >
                    NPR {evmData.cv.toLocaleString("en-IN", { maximumFractionDigits: 0 })}
                  </span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">SV (Schedule Variance)</span>
                  <span
                    className={`font-mono font-medium ${evmData.sv >= 0 ? "text-emerald-600" : "text-red-600"}`}
                  >
                    NPR {evmData.sv.toLocaleString("en-IN", { maximumFractionDigits: 0 })}
                  </span>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-full gap-2 text-muted-foreground">
            <p className="text-sm font-medium">No EVM data</p>
            <p className="text-xs">Create tasks with BOQ links to calculate EVM metrics.</p>
          </div>
        )}
      </div>
    );
  }

  if (showConflicts) {
    return (
      <div className="h-full overflow-y-auto p-4 font-mono">
        {conflictsLoading ? (
          <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
            Detecting resource conflicts…
          </div>
        ) : conflictsData && conflictsData.totalConflicts > 0 ? (
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-2">
              <div className="rounded-lg border bg-red-50/50 p-3">
                <p className="text-[10px] text-muted-foreground uppercase">Conflicts</p>
                <p className="text-xl font-bold text-red-600">{conflictsData.totalConflicts}</p>
              </div>
              <div className="rounded-lg border bg-card p-3">
                <p className="text-[10px] text-muted-foreground uppercase">Affected Resources</p>
                <p className="text-xl font-bold text-amber-600">
                  {conflictsData.affectedResources}
                </p>
              </div>
              <div className="rounded-lg border bg-card p-3">
                <p className="text-[10px] text-muted-foreground uppercase">Leveling Proposals</p>
                <p className="text-xl font-bold text-sky-600">{conflictsData.proposals.length}</p>
              </div>
            </div>

            <div className="rounded-lg border overflow-hidden">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-muted text-left text-sm">
                  <tr>
                    <th className="p-1.5 font-semibold">Resource</th>
                    <th className="p-1.5 font-semibold">Type</th>
                    <th className="p-1.5 font-semibold" style={{ width: "150px" }}>
                      Task 1
                    </th>
                    <th className="p-1.5 font-semibold" style={{ width: "150px" }}>
                      Task 2
                    </th>
                    <th className="p-1.5 font-semibold text-right">Overlap</th>
                  </tr>
                </thead>
                <tbody>
                  {conflictsData.conflicts.map((c: any, i: number) => (
                    <tr
                      key={i}
                      className={`border-b border-border/40 ${i % 2 === 1 ? "bg-muted/20" : ""}`}
                    >
                      <td className="p-1 font-medium">
                        <span
                          className={`inline-flex items-center gap-1 ${c.resourceType === "staff" ? "text-emerald-600" : "text-amber-600"}`}
                        >
                          {c.resourceType === "staff" ? "👤" : "🔧"} {c.resourceName}
                        </span>
                      </td>
                      <td className="p-1 text-muted-foreground capitalize">{c.resourceType}</td>
                      <td className="p-1 text-xs">
                        <span className="font-mono text-[10px]">{c.task1Code ?? "—"}</span>
                        <span className="block truncate">{c.task1Name}</span>
                        <span className="text-[9px] text-muted-foreground font-mono">
                          {safeFormat(c.task1Start, "dd MMM")} → {safeFormat(c.task1End, "dd MMM")}
                        </span>
                      </td>
                      <td className="p-1 text-xs">
                        <span className="font-mono text-[10px]">{c.task2Code ?? "—"}</span>
                        <span className="block truncate">{c.task2Name}</span>
                        <span className="text-[9px] text-muted-foreground font-mono">
                          {safeFormat(c.task2Start, "dd MMM")} → {safeFormat(c.task2End, "dd MMM")}
                        </span>
                      </td>
                      <td className="p-1 text-right">
                        <span className="font-mono font-bold text-red-600">{c.overlapDays}d</span>
                        <span className="block text-[9px] text-muted-foreground font-mono">
                          {safeFormat(c.overlapStart, "dd MMM")} → {safeFormat(c.overlapEnd, "dd MMM")}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {conflictsData.proposals.length > 0 && (
              <div className="rounded-lg border border-sky-200 bg-sky-50/30 p-3">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-semibold text-sky-700">
                    💡 Auto-Leveling Proposals
                  </p>
                  <button
                    onClick={() => {
                      applyLevelingMutation.mutate({
                        projectId: id,
                        proposals: conflictsData.proposals.map((p: any) => ({
                          taskId: p.taskId,
                          newStartDate: p.newStart.toISOString(),
                          newEndDate: p.newEnd.toISOString(),
                        })),
                      });
                    }}
                    disabled={applyLevelingMutation.isPending}
                    className="flex items-center gap-1 rounded bg-sky-600 px-2 py-1 text-[10px] font-medium text-white hover:bg-sky-700 disabled:opacity-50"
                    title="Apply all leveling proposals"
                  >
                    {applyLevelingMutation.isPending ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Check className="h-3 w-3" />
                    )}
                    Apply All
                  </button>
                </div>
                <p className="text-[10px] text-muted-foreground mb-2">
                  Delay the later task to start after the earlier task finishes.
                </p>
                <div className="space-y-1">
                  {conflictsData.proposals.map((p: any) => (
                    <div
                      key={p.taskId}
                      className="flex items-center gap-2 rounded border border-border/40 bg-card p-1.5 text-[10px]"
                    >
                      <span className="font-mono text-[9px]">{p.taskCode ?? "—"}</span>
                      <span className="font-medium truncate flex-1">{p.taskName}</span>
                      <span className="text-muted-foreground font-mono">
                        {safeFormat(p.currentStart, "dd MMM")} →
                      </span>
                      <span className="font-mono font-bold text-sky-600">
                        {safeFormat(p.newStart, "dd MMM")}
                      </span>
                      <span className="rounded bg-sky-100 px-1 text-sky-700 font-bold">
                        +{p.delayDays}d
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-full gap-2 text-muted-foreground">
            <p className="text-sm font-medium text-emerald-600">✓ No conflicts detected</p>
            <p className="text-xs">
              All resources are properly allocated with no overlapping tasks.
            </p>
          </div>
        )}
      </div>
    );
  }

  if (isExecution && showVariance) {
    return (
      <div className="h-full overflow-y-auto p-4 font-mono">
        {varianceLoading ? (
          <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
            Loading variance data…
          </div>
        ) : varianceData && varianceData.rows.length > 0 ? (
          <div className="space-y-3">
            <div className="grid grid-cols-4 gap-2">
              <div className="rounded-lg border bg-card p-3">
                <p className="text-[10px] text-muted-foreground uppercase">Total Delay</p>
                <p className="text-xl font-bold text-red-600">
                  {varianceData.summary.totalDelayDays}d
                </p>
              </div>
              <div className="rounded-lg border bg-card p-3">
                <p className="text-[10px] text-muted-foreground uppercase">Tasks Delayed</p>
                <p className="text-xl font-bold text-red-600">
                  {varianceData.summary.tasksDelayed}
                </p>
              </div>
              <div className="rounded-lg border bg-card p-3">
                <p className="text-[10px] text-muted-foreground uppercase">On Time</p>
                <p className="text-xl font-bold text-emerald-600">
                  {varianceData.summary.tasksOnTime}
                </p>
              </div>
              <div className="rounded-lg border bg-card p-3">
                <p className="text-[10px] text-muted-foreground uppercase">Avg Delay</p>
                <p className="text-xl font-bold text-amber-600">
                  {varianceData.summary.avgDelayDays}d
                </p>
              </div>
            </div>
            <div className="rounded-lg border overflow-hidden">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-muted text-left text-sm">
                  <tr>
                    <th className="p-1.5 font-semibold">Code</th>
                    <th className="p-1.5 font-semibold" style={{ width: "200px" }}>
                      Task
                    </th>
                    <th className="p-1.5 font-semibold">Planned</th>
                    <th className="p-1.5 font-semibold">Actual</th>
                    <th className="p-1.5 font-semibold text-right">Start Var</th>
                    <th className="p-1.5 font-semibold text-right">End Var</th>
                    <th className="p-1.5 font-semibold text-right">Progress</th>
                    <th className="p-1.5 font-semibold">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {varianceData.rows.map((row: any, i: number) => (
                    <tr
                      key={row.taskId}
                      className={`border-b border-border/40 ${i % 2 === 1 ? "bg-muted/20" : ""}`}
                    >
                      <td className="p-1 font-mono text-xs">{row.taskCode ?? "—"}</td>
                      <td className="p-1 text-xs truncate">{row.taskName}</td>
                      <td className="p-1 text-xs text-muted-foreground whitespace-nowrap font-mono">
                        {safeFormat(row.plannedStart, "dd MMM")} → {safeFormat(row.plannedEnd, "dd MMM")}
                        <span className="text-[9px]"> ({row.plannedDuration}d)</span>
                      </td>
                      <td className="p-1 text-xs whitespace-nowrap font-mono">
                        {row.actualStart ? safeFormat(row.actualStart, "dd MMM") : "—"} →{" "}
                        {row.actualEnd ? safeFormat(row.actualEnd, "dd MMM") : "—"}
                        <span className="text-[9px]"> ({row.actualDuration}d)</span>
                      </td>
                      <td
                        className={`p-1 text-right font-mono text-xs ${
                          row.startVariance !== null && row.startVariance > 0
                            ? "text-red-600"
                            : row.startVariance !== null && row.startVariance < 0
                              ? "text-emerald-600"
                              : "text-muted-foreground"
                        }`}
                      >
                        {row.startVariance !== null
                          ? `${row.startVariance > 0 ? "+" : ""}${row.startVariance}d`
                          : "—"}
                      </td>
                      <td
                        className={`p-1 text-right font-mono text-xs ${
                          row.endVariance !== null && row.endVariance > 0
                            ? "text-red-600"
                            : row.endVariance !== null && row.endVariance < 0
                              ? "text-emerald-600"
                              : "text-muted-foreground"
                        }`}
                      >
                        {row.endVariance !== null
                          ? `${row.endVariance > 0 ? "+" : ""}${row.endVariance}d`
                          : "—"}
                      </td>
                      <td className="p-1 text-right font-mono text-xs">
                        {row.actualProgress.toFixed(0)}% / {row.plannedProgress.toFixed(0)}%
                        <span
                          className={`ml-1 ${
                            (row.progressVariance ?? 0) > 0
                              ? "text-emerald-600"
                              : (row.progressVariance ?? 0) < 0
                                ? "text-red-600"
                                : "text-muted-foreground"
                          }`}
                        >
                          ({(row.progressVariance ?? 0) > 0 ? "+" : ""}
                          {(row.progressVariance ?? 0).toFixed(0)}%)
                        </span>
                      </td>
                      <td className="p-1">
                        <span
                          className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${
                            row.status === "delayed"
                              ? "bg-red-50 text-red-600 border border-red-200"
                              : row.status === "ahead"
                                ? "bg-emerald-50 text-emerald-600 border border-emerald-200"
                                : row.status === "completed"
                                  ? "bg-sky-50 text-sky-600 border border-sky-200"
                                  : row.status === "not_started"
                                    ? "bg-gray-50 text-gray-500 border border-gray-200"
                                    : "bg-emerald-50 text-emerald-600 border border-emerald-200"
                          }`}
                        >
                          {row.status === "on_time"
                            ? "On Time"
                            : row.status === "delayed"
                              ? "Delayed"
                              : row.status === "ahead"
                                ? "Ahead"
                                : row.status === "completed"
                                  ? "Done"
                                  : "Not Started"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-full gap-2 text-muted-foreground">
            <p className="text-sm font-medium">No variance data</p>
            <p className="text-xs">
              Execution versions track progress differences against approved planning baselines.
            </p>
          </div>
        )}
      </div>
    );
  }

  return null;
}
