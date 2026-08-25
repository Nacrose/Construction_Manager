"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Layers, Plus, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";

export function RfiLinkedBoqSection({
  items,
  boqData,
  addItem,
  removeItem,
  updateItem,
}: {
  items: {
    boqItemId: string;
    quantity: string;
    paymentType: "payable" | "unpayable" | "temporary";
  }[];
  boqData: any;
  addItem: () => void;
  removeItem: (idx: number) => void;
  updateItem: (
    idx: number,
    field: "boqItemId" | "quantity" | "paymentType",
    value: string
  ) => void;
}) {
  return (
    <div className="space-y-3 rounded border border-border/80 bg-muted/20 p-4">
      <div className="flex items-center justify-between border-b border-border/60 pb-2">
        <div className="text-[11px] font-bold uppercase tracking-wider text-primary flex items-center gap-1.5">
          <Layers className="h-3.5 w-3.5" />
          3. Linked Bill of Quantities (BOQ) Items
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={addItem}
          className="h-7 text-xs border-primary/40 text-primary hover:bg-primary/10 gap-1"
        >
          <Plus className="h-3 w-3" /> Add Item
        </Button>
      </div>

      {items.length === 0 ? (
        <div className="p-4 border border-dashed border-border/80 rounded bg-background/40 text-center text-xs text-muted-foreground">
          No BOQ items linked. Link a Gantt task to auto-populate or click &quot;+ Add Item&quot; above.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left border-collapse">
            <thead>
              <tr className="border-b border-border/60 text-muted-foreground text-[10px] uppercase">
                <th className="py-1.5 px-2">BOQ Item</th>
                <th className="py-1.5 px-2 w-28 text-right">Quantity</th>
                <th className="py-1.5 px-2 w-16 text-center">Unit</th>
                <th className="py-1.5 px-2 w-32">Payment Type</th>
                <th className="py-1.5 px-1 w-8 text-center"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40">
              {items.map((it, idx) => {
                const boq = boqData?.items.find((b: any) => b.id === it.boqItemId);
                return (
                  <tr key={idx} className="hover:bg-muted/30">
                    <td className="py-1.5 px-2">
                      <Select
                        value={it.boqItemId}
                        onValueChange={(v) => updateItem(idx, "boqItemId", v)}
                      >
                        <SelectTrigger className="h-8 text-xs bg-background border-border/80">
                          <SelectValue placeholder="Select BOQ item" />
                        </SelectTrigger>
                        <SelectContent>
                          {boqData?.items.map((b: any) => (
                            <SelectItem key={b.id} value={b.id} className="text-xs">
                              {b.code} · {b.description}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="py-1.5 px-2">
                      <Input
                        type="number"
                        value={it.quantity}
                        onChange={(e) => updateItem(idx, "quantity", e.target.value)}
                        placeholder="0.00"
                        className="h-8 text-xs text-right bg-background border-border/80 font-mono"
                        disabled={!it.boqItemId}
                      />
                    </td>
                    <td className="py-1.5 px-2 text-center text-muted-foreground font-mono">
                      {boq?.unit || "—"}
                    </td>
                    <td className="py-1.5 px-2">
                      <Select
                        value={it.paymentType}
                        onValueChange={(v) => updateItem(idx, "paymentType", v as any)}
                      >
                        <SelectTrigger
                          className={cn(
                            "h-8 text-[11px] font-bold bg-background border-border/80",
                            it.paymentType === "payable" && "text-emerald-400",
                            it.paymentType === "unpayable" && "text-destructive",
                            it.paymentType === "temporary" && "text-amber-400"
                          )}
                        >
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="payable" className="text-xs text-emerald-400">
                            Payable
                          </SelectItem>
                          <SelectItem value="unpayable" className="text-xs text-destructive">
                            Unpayable
                          </SelectItem>
                          <SelectItem value="temporary" className="text-xs text-amber-400">
                            Temporary
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="py-1.5 px-1 text-center">
                      <button
                        type="button"
                        onClick={() => removeItem(idx)}
                        className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
