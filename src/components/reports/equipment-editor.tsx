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

export function EquipmentEditor({ value, onChange, tasks }: { value: string; onChange: (v: string) => void; tasks?: any[] }) {
  const items = parseJsonArray(value);
  const setItems = (newItems: any[]) => onChange(JSON.stringify(newItems));
  const add = () => setItems([...items, { name: "", totalHours: 0, status: "operational", operator: "", taskAllocations: [] }]);
  const update = (idx: number, field: string, val: any) => {
    const copy = [...items];
    copy[idx] = { ...copy[idx], [field]: val };
    setItems(copy);
  };
  const remove = (idx: number) => setItems(items.filter((_, i) => i !== idx));
  const addAlloc = (idx: number, taskName: string) => {
    const copy = [...items];
    if (!copy[idx].taskAllocations) copy[idx].taskAllocations = [];
    copy[idx].taskAllocations.push({ taskName, hours: 0 });
    setItems(copy);
  };
  const updateAlloc = (idx: number, ai: number, field: string, val: any) => {
    const copy = [...items];
    copy[idx].taskAllocations[ai] = { ...copy[idx].taskAllocations[ai], [field]: val };
    setItems(copy);
  };
  const removeAlloc = (idx: number, ai: number) => {
    const copy = [...items];
    copy[idx].taskAllocations = copy[idx].taskAllocations.filter((_: any, i: number) => i !== ai);
    setItems(copy);
  };
  return (
    <div className="space-y-3">
      {items.map((item: any, i: number) => (
        <div key={i} className="border rounded p-3 space-y-2">
          <div className="flex gap-2 items-center">
            <input className="w-28 rounded border px-2 py-1 text-xs" placeholder="Name" value={item.name} onChange={(e) => update(i, "name", e.target.value)} />
            <input className="w-16 rounded border px-2 py-1 text-xs text-right" type="number" placeholder="Hours" value={item.totalHours} onChange={(e) => update(i, "totalHours", parseFloat(e.target.value) || 0)} />
            <select className="w-24 rounded border px-1 py-1 text-xs" value={item.status} onChange={(e) => update(i, "status", e.target.value)}>
              {["operational", "idle", "breakdown", "maintenance"].map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <input className="w-24 rounded border px-2 py-1 text-xs" placeholder="Operator" value={item.operator} onChange={(e) => update(i, "operator", e.target.value)} />
            <button type="button" onClick={() => remove(i)} className="text-red-500 text-xs shrink-0">✕</button>
          </div>
          {/* Task allocations sub-editor */}
          <div className="ml-4 pl-3 border-l-2 border-emerald-200 space-y-1">
            <p className="text-[10px] text-muted-foreground uppercase font-semibold">Task Hour Allocations</p>
            {(item.taskAllocations || []).map((a: any, ai: number) => (
              <div key={ai} className="flex gap-2 items-center">
                <input className="w-36 rounded border px-2 py-0.5 text-xs" placeholder="Task name" value={a.taskName} onChange={(e) => updateAlloc(i, ai, "taskName", e.target.value)} />
                <input className="w-14 rounded border px-2 py-0.5 text-xs text-right" type="number" placeholder="Hrs" value={a.hours} onChange={(e) => updateAlloc(i, ai, "hours", parseFloat(e.target.value) || 0)} />
                <button type="button" onClick={() => removeAlloc(i, ai)} className="text-red-400 text-xs">✕</button>
              </div>
            ))}
            <div className="flex items-center gap-2 text-[10px]">
              {(item.taskAllocations || []).length > 0 && (
                <span className="text-muted-foreground">
                  Total allocated: {(item.taskAllocations || []).reduce((s: number, a: any) => s + (a.hours || 0), 0)}h
                  {item.totalHours > 0 && (
                    <> of {item.totalHours}h</>
                  )}
                  {(item.taskAllocations || []).reduce((s: number, a: any) => s + (a.hours || 0), 0) > item.totalHours && (
                    <span className="text-red-500 font-medium ml-1">⚠ exceeds total</span>
                  )}
                </span>
              )}
            </div>
            <div className="flex gap-1">
              {tasks && tasks.length > 0 ? (
                <select className="rounded border px-1 py-0.5 text-xs" defaultValue="" onChange={(e) => { if (e.target.value) { addAlloc(i, e.target.value); e.target.value = ""; } }}>
                  <option value="" disabled>+ Add from tasks...</option>
                  {tasks.map((t: any) => <option key={t.id} value={t.taskName}>{t.taskName}</option>)}
                </select>
              ) : (
                <button type="button" onClick={() => addAlloc(i, "")} className="text-xs text-emerald-600 hover:underline">+ Add task allocation</button>
              )}
            </div>
          </div>
        </div>
      ))}
      <button type="button" onClick={add} className="text-xs text-emerald-600 hover:underline">+ Add equipment</button>
    </div>
  );
}

/** Visitors view */