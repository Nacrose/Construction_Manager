"use client";

import { useState, useEffect, Fragment } from "react";
import { trpc } from "@/lib/trpc-client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, X, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
function parseJsonArray(val: string | any[] | null): any[] {
  if (!val) return [];
  if (Array.isArray(val)) return val;
  try { const p = JSON.parse(val); return Array.isArray(p) ? p : []; } catch { return []; }
}

export function EquipmentView({ data }: { data: string | null }) {
  const items = parseJsonArray(data);
  if (!items.length) return <p className="text-sm text-muted-foreground">No equipment recorded.</p>;
  return (
    <table className="w-full text-sm">
      <thead><tr className="text-xs text-muted-foreground border-b">
        <th className="pb-2 text-left font-medium">Equipment</th>
        <th className="pb-2 text-left font-medium">Task Allocations</th>
        <th className="pb-2 text-right font-medium">Total Hours</th>
        <th className="pb-2 text-center font-medium">Status</th>
        <th className="pb-2 text-left font-medium">Operator</th>
      </tr></thead>
      <tbody>
        {items.map((item: any, i: number) => {
          const allocations = item.taskAllocations || [];
          const totalFromTasks = allocations.reduce((s: number, a: any) => s + (a.hours || 0), 0);
          const totalHours = item.totalHours ?? totalFromTasks ?? "—";
          const overAllocated = typeof totalHours === "number" && totalFromTasks > totalHours;
          return (
            <tr key={i} className="border-b last:border-0 align-top">
              <td className="py-2 text-xs font-medium">{item.name}</td>
              <td className="py-2">
                {allocations.length > 0 ? (
                  <div className="space-y-0.5">
                    {allocations.map((a: any, ai: number) => (
                      <div key={ai} className="flex items-center gap-2 text-xs">
                        <span className="text-muted-foreground">•</span>
                        <span>{a.taskName}</span>
                        <span className="text-muted-foreground">—</span>
                        <span className="font-medium">{a.hours}h</span>
                      </div>
                    ))}
                    {overAllocated && (
                      <p className="text-[10px] text-red-500 font-medium mt-1">
                        ⚠ {totalFromTasks}h allocated exceeds {totalHours}h total
                      </p>
                    )}
                  </div>
                ) : (
                  <span className="text-xs text-muted-foreground italic">No task breakdown</span>
                )}
              </td>
              <td className={`py-2 text-right text-xs ${overAllocated ? "text-red-500 font-semibold" : ""}`}>{totalHours}</td>
              <td className="py-2 text-center"><Badge variant="secondary" className="text-[10px] font-normal capitalize">{item.status || "operational"}</Badge></td>
              <td className="py-2 text-xs">{item.operator || "—"}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
