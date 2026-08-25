"use client";

import { useState, useEffect, useMemo } from "react";
import { format, addDays, differenceInDays, min, max } from "date-fns";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Users, BarChart3, Package, Check } from "lucide-react";
import type { Task } from "../types";

export function ResourceLoading({
  tasks,
  isLoading,
  projectId: _projectId,
}: {
  tasks: Task[];
  isLoading: boolean;
  projectId: string;
}) {
  const [period, setPeriod] = useState<"daily" | "weekly" | "monthly">("weekly");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [selectedPeriodIndex, setSelectedPeriodIndex] = useState(0);

  useEffect(() => {
    if (tasks.length === 0 || fromDate) return;
    const starts = tasks.map((t) => new Date(t.startDate));
    const ends = tasks.map((t) => new Date(t.endDate));
    setFromDate(format(min(starts), "yyyy-MM-dd"));
    setToDate(format(addDays(max(ends), 1), "yyyy-MM-dd"));
  }, [tasks, fromDate]);

  const selectedTasks = selected.size === 0 ? tasks : tasks.filter((t) => selected.has(t.id));

  const buckets = useMemo(() => {
    if (!fromDate || !toDate) return [];
    const start = new Date(fromDate);
    const end = new Date(toDate);
    if (end <= start) return [];

    const list: { label: string; start: Date; end: Date; labor: number; value: number; taskNames: string[]; materials: Map<string, { name: string; type: string; unit: string; qty: number; cost: number }> }[] = [];
    let cur = new Date(start);
    while (cur < end) {
      let bEnd: Date;
      let label: string;
      if (period === "daily") {
        bEnd = addDays(cur, 1);
        label = format(cur, "dd MMM");
      } else if (period === "weekly") {
        bEnd = addDays(cur, 7);
        label = `${format(cur, "dd MMM")} – ${format(addDays(bEnd, -1), "dd MMM")}`;
      } else {
        bEnd = new Date(cur.getFullYear(), cur.getMonth() + 1, 1);
        label = format(cur, "MMM yyyy");
      }

      let labor = 0;
      let value = 0;
      const taskNames: string[] = [];
      const materials = new Map<string, { name: string; type: string; unit: string; qty: number; cost: number }>();
      for (const t of selectedTasks) {
        const ts = new Date(t.startDate);
        const te = new Date(t.endDate);
        if (ts < bEnd && te >= cur) {
          const overlapStart = ts > cur ? ts : cur;
          const overlapEnd = te < bEnd ? te : bEnd;
          const overlapDays = Math.max(1, differenceInDays(overlapEnd, overlapStart) + 1);
          const taskDays = Math.max(1, differenceInDays(te, ts) + 1);
          const fraction = overlapDays / taskDays;

          const taskValue = t.boqLinks.reduce((s, link) => s + link.boqItem.rate * link.quantity, 0);
          const taskLabor = t.boqLinks.reduce(
            (s, link) => s + link.boqItem.ingredients.filter((i) => i.type === "labor").reduce((s2, i) => s2 + i.quantity * link.quantity, 0),
            0,
          );
          labor += taskLabor * fraction;
          value += taskValue * fraction;
          taskNames.push(t.name);

          for (const link of t.boqLinks) {
            for (const ing of link.boqItem.ingredients) {
              const neededQty = ing.quantity * link.quantity * fraction;
              const neededCost = ing.amount * link.quantity * fraction;
              const key = `${ing.name}|${ing.unit}`;
              const existing = materials.get(key);
              if (existing) {
                existing.qty += neededQty;
                existing.cost += neededCost;
              } else {
                materials.set(key, { name: ing.name, type: ing.type, unit: ing.unit, qty: neededQty, cost: neededCost });
              }
            }
          }
        }
      }
      list.push({ label, start: new Date(cur), end: new Date(bEnd), labor, value, taskNames, materials });
      cur = bEnd;
    }
    return list;
  }, [fromDate, toDate, period, selectedTasks]);

  if (isLoading) {
    return <Skeleton className="h-96" />;
  }

  if (tasks.length === 0) {
    return (
      <Card className="flex flex-col items-center gap-3 p-12 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
          <BarChart3 className="h-6 w-6 text-muted-foreground" />
        </div>
        <div>
          <p className="font-medium">No tasks to analyze</p>
          <p className="text-sm text-muted-foreground">
            Add tasks with labor and planned values on the Schedule tab first.
          </p>
        </div>
      </Card>
    );
  }

  function toggleTask(taskId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (prev.size === 0) {
        next.clear();
        for (const t of tasks) {
          if (t.id !== taskId) next.add(t.id);
        }
      } else if (next.has(taskId)) {
        next.delete(taskId);
      } else {
        next.add(taskId);
      }
      return next;
    });
  }

  function selectAll() {
    setSelected(new Set());
  }

  return (
    <div className="space-y-4">
      <Card className="p-4 space-y-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <Label className="text-xs">From</Label>
            <Input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="h-8 w-[150px]"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">To</Label>
            <Input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="h-8 w-[150px]"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Period</Label>
            <div className="flex rounded-md border bg-muted/30 p-0.5">
              {(["daily", "weekly", "monthly"] as const).map((p) => (
                <button
                  key={p}
                  onClick={() => setPeriod(p)}
                  className={cn(
                    "rounded px-3 py-1 text-xs capitalize transition-colors",
                    period === p ? "bg-background font-medium shadow-sm" : "text-muted-foreground",
                  )}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
          <div className="ml-auto flex items-center gap-2 text-xs">
            <Users className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-muted-foreground">
              {selected.size === 0 ? "All tasks" : `${selected.size} of ${tasks.length} selected`}
            </span>
            {selected.size > 0 && (
              <button onClick={selectAll} className="text-emerald-600 hover:underline">
                Show all
              </button>
            )}
          </div>
        </div>

        <div className="flex flex-wrap gap-2 rounded-md border bg-muted/20 p-2">
          {tasks.map((t) => {
            const checked = selected.size === 0 || selected.has(t.id);
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => toggleTask(t.id)}
                className={cn(
                  "flex cursor-pointer items-center gap-1.5 rounded-md border px-2 py-1 text-xs transition-colors",
                  checked ? "border-emerald-300 bg-emerald-50 dark:bg-emerald-950/30" : "border-transparent bg-background hover:bg-muted opacity-50",
                )}
              >
                <span
                  className={cn(
                    "flex h-3.5 w-3.5 items-center justify-center rounded border",
                    checked ? "border-emerald-500 bg-emerald-500 text-white" : "border-muted-foreground",
                  )}
                >
                  {checked && <Check className="h-2.5 w-2.5" />}
                </span>
                {t.code && <span className="font-mono text-[10px] text-muted-foreground">{t.code}</span>}
                <span className="max-w-[160px] truncate">{t.name}</span>
              </button>
            );
          })}
        </div>
      </Card>

      {buckets.length > 0 && buckets.some((b) => b.materials.size > 0) && (
        <Card>
          <div className="border-b p-3 space-y-2">
            <h3 className="flex items-center gap-2 text-sm font-medium">
              <Package className="h-4 w-4 text-blue-600 dark:text-blue-400" />
              Material Requirements
            </h3>
            <div className="flex items-center gap-2">
              <Label className="text-xs text-muted-foreground whitespace-nowrap">Select period:</Label>
              <select
                value={selectedPeriodIndex}
                onChange={(e) => setSelectedPeriodIndex(parseInt(e.target.value))}
                className="h-8 flex-1 rounded-md border bg-background px-2 text-sm max-w-xs"
              >
                {buckets.map((b, i) => (
                  <option key={i} value={i}>
                    {b.label} {b.materials.size > 0 && `(${b.materials.size} materials)`}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/30 text-xs text-muted-foreground">
                <tr>
                  <th className="p-2 text-center w-12">SN</th>
                  <th className="p-2 text-left">Material</th>
                  <th className="p-2 text-left w-20">Unit</th>
                  <th className="p-2 text-right w-24">Quantity</th>
                </tr>
              </thead>
              <tbody>
                {(() => {
                  const b = buckets[selectedPeriodIndex];
                  if (!b || b.materials.size === 0) {
                    return (
                      <tr>
                        <td colSpan={4} className="p-4 text-center text-muted-foreground">
                          No materials needed in this period.
                        </td>
                      </tr>
                    );
                  }
                  const periodMaterials = Array.from(b.materials.values()).sort((a, c) => c.cost - a.cost);
                  return periodMaterials.map((m, i) => (
                    <tr key={i} className="border-b hover:bg-muted/20">
                      <td className="p-2 text-center text-muted-foreground">{i + 1}</td>
                      <td className="p-2 font-medium">{m.name}</td>
                      <td className="p-2 text-muted-foreground">{m.unit}</td>
                      <td className="p-2 text-right font-mono">{m.qty.toFixed(3)}</td>
                    </tr>
                  ));
                })()}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
