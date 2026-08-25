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

export function ManpowerView({ data }: { data: string | null }) {
  const items = parseJsonArray(data);
  if (!items.length) return <p className="text-sm text-muted-foreground">No manpower recorded.</p>;
  return (
    <table className="w-full text-sm">
      <thead><tr className="text-xs text-muted-foreground border-b">
        <th className="pb-2 text-left font-medium">Subcontractor</th>
        <th className="pb-2 text-left font-medium">Trade</th>
        <th className="pb-2 text-right font-medium">Headcount</th>
        <th className="pb-2 text-right font-medium">Hours</th>
      </tr></thead>
      <tbody>
        {items.map((item: any, i: number) => (
          <tr key={i} className="border-b last:border-0">
            <td className="py-2 text-xs">{item.subcontractor || "—"}</td>
            <td className="py-2 text-xs">{item.trade || "—"}</td>
            <td className="py-2 text-right text-xs">{item.headcount ?? "—"}</td>
            <td className="py-2 text-right text-xs">{item.hours ?? "—"}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
