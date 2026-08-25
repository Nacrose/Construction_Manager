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

export function ManpowerEditor({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const items = parseJsonArray(value);
  const setItems = (newItems: any[]) => onChange(JSON.stringify(newItems));
  const add = () => setItems([...items, { subcontractor: "", trade: "", headcount: 0, hours: 0 }]);
  const update = (idx: number, field: string, val: any) => {
    const copy = [...items];
    copy[idx] = { ...copy[idx], [field]: val };
    setItems(copy);
  };
  const remove = (idx: number) => setItems(items.filter((_, i) => i !== idx));
  return (
    <div className="space-y-2">
      {items.map((item: any, i: number) => (
        <div key={i} className="flex gap-2 items-center">
          <input className="w-28 rounded border px-2 py-1 text-xs" placeholder="Subcontractor" value={item.subcontractor} onChange={(e) => update(i, "subcontractor", e.target.value)} />
          <input className="w-24 rounded border px-2 py-1 text-xs" placeholder="Trade" value={item.trade} onChange={(e) => update(i, "trade", e.target.value)} />
          <input className="w-16 rounded border px-2 py-1 text-xs text-right" type="number" placeholder="Count" value={item.headcount} onChange={(e) => update(i, "headcount", parseInt(e.target.value) || 0)} />
          <input className="w-16 rounded border px-2 py-1 text-xs text-right" type="number" placeholder="Hours" value={item.hours} onChange={(e) => update(i, "hours", parseFloat(e.target.value) || 0)} />
          <button type="button" onClick={() => remove(i)} className="text-red-500 text-xs shrink-0">✕</button>
        </div>
      ))}
      <button type="button" onClick={add} className="text-xs text-emerald-600 hover:underline">+ Add row</button>
    </div>
  );
}

/** Equipment view — with per-task hour allocation sub-rows */