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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { DialogTrigger } from "@/components/ui/dialog";
function parseJsonArray(val: string | any[] | null): any[] {
  if (!val) return [];
  if (Array.isArray(val)) return val;
  try { const p = JSON.parse(val); return Array.isArray(p) ? p : []; } catch { return []; }
}

export function SimpleTableEditor({
  value, onChange, fields, labels,
}: {
  value: string; onChange: (v: string) => void; fields: string[]; labels: string[];
}) {
  const items = parseJsonArray(value);
  const setItems = (newItems: any[]) => onChange(JSON.stringify(newItems));
  const add = () => setItems([...items, Object.fromEntries(fields.map(f => [f, ""]))]);
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
          {fields.map((f, fi) => (
            <input key={f} className="flex-1 rounded border px-2 py-1 text-xs" placeholder={labels[fi]} value={item[f]} onChange={(e) => update(i, f, e.target.value)} />
          ))}
          <button type="button" onClick={() => remove(i)} className="text-red-500 text-xs shrink-0">✕</button>
        </div>
      ))}
      <button type="button" onClick={add} className="text-xs text-emerald-600 hover:underline">+ Add row</button>
    </div>
  );
}

/** any consumption editor */
function _anyEditor({ value, onChange, materials }: { value: string; onChange: (v: string) => void; materials: any[] }) {
  const items = parseJsonArray(value);
  const setItems = (newItems: any[]) => onChange(JSON.stringify(newItems));
  const add = () => setItems([...items, { materialId: "", name: "", quantity: 0, unit: "" }]);
  const update = (idx: number, field: string, val: any) => {
    const copy = [...items];
    if (field === "materialId") {
      const mat = materials.find(m => m.id === val);
      if (mat) { copy[idx] = { ...copy[idx], materialId: mat.id, name: mat.name, unit: mat.unit }; }
    } else {
      copy[idx] = { ...copy[idx], [field]: val };
    }
    setItems(copy);
  };
  const remove = (idx: number) => setItems(items.filter((_, i) => i !== idx));
  return (
    <div className="space-y-2">
      {items.map((item: any, i: number) => (
        <div key={i} className="flex gap-2 items-center">
          <select className="flex-1 rounded border px-2 py-1 text-xs" value={item.materialId} onChange={(e) => update(i, "materialId", e.target.value)}>
            <option value="">-- Select material --</option>
            {materials.map(m => <option key={m.id} value={m.id}>{m.name} ({m.unit})</option>)}
          </select>
          <input className="w-20 rounded border px-2 py-1 text-xs text-right" type="number" step="0.01" placeholder="Qty" value={item.quantity} onChange={(e) => update(i, "quantity", parseFloat(e.target.value) || 0)} />
          <span className="text-xs text-muted-foreground w-8">{item.unit}</span>
          <button type="button" onClick={() => remove(i)} className="text-red-500 text-xs shrink-0">✕</button>
        </div>
      ))}
      <button type="button" onClick={add} className="text-xs text-emerald-600 hover:underline">+ Add material</button>
    </div>
  );
}
