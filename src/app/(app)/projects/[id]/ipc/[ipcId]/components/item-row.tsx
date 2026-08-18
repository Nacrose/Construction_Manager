"use client";

import { useState, useRef, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc-client";
import { fmt, pct, type IpcItem } from "./helpers";

export function ItemRow({ item, canWrite, ipcId, projectId }: { item: IpcItem; canWrite: boolean; ipcId: string; projectId: string }) {
  const utils = trpc.useUtils();
  const [thisQty, setThisQty] = useState(String(item.thisQty || ""));
  const [prevQty, setPrevQty] = useState(String(item.previousQty || ""));
  const [saving, setSaving] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setThisQty(String(item.thisQty || ""));
    setPrevQty(String(item.previousQty || ""));
  }, [item.thisQty, item.previousQty]);

  const contractAmt = item.contractQty * item.rate;
  const cumQty = (parseFloat(prevQty) || 0) + (parseFloat(thisQty) || 0);
  const cumAmt = cumQty * item.rate;
  const prevAmt = (parseFloat(prevQty) || 0) * item.rate;
  const thisAmt = (parseFloat(thisQty) || 0) * item.rate;

  const updateItemMutation = trpc.ipc.updateItem.useMutation({
    onSuccess: () => {
      utils.ipc.listItems.invalidate({ ipcId });
      utils.ipc.list.invalidate({ projectId });
    },
    onError: (e) => toast.error(e.message),
  });

  function save(field: "thisQty" | "previousQty", value: string) {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setSaving(true);
      try {
        const val = parseFloat(value) || 0;
        await updateItemMutation.mutateAsync({
          ipcId,
          itemId: item.id,
          [field]: val,
        });
      } catch {
        toast.error("Failed to save");
      } finally {
        setSaving(false);
      }
    }, 600);
  }

  return (
    <tr className="border-b hover:bg-muted/10">
      <td className="border-r p-2 font-mono text-xs">{item.boqCode || "—"}</td>
      <td className="border-r p-2">
        <p className="line-clamp-2">{item.description}</p>
        {saving && <span className="text-[10px] text-muted-foreground italic">saving…</span>}
      </td>
      <td className="border-r p-2 text-center">{item.unit}</td>
      <td className="border-r p-2 text-right">{fmt(item.contractQty)}</td>
      <td className="border-r p-2 text-right">{fmt(item.rate)}</td>
      <td className="border-r p-2 text-right">{fmt(contractAmt)}</td>
      <td className="border-r p-2 text-right">{fmt(cumQty)}</td>
      <td className="border-r p-2 text-right">{fmt(cumAmt)}</td>
      <td className="border-r p-2 text-right">
        {canWrite ? (
          <Input
            type="number"
            step="0.01"
            value={prevQty}
            onChange={(e) => { setPrevQty(e.target.value); save("previousQty", e.target.value); }}
            className="h-6 w-16 px-1 text-right text-xs"
          />
        ) : (
          fmt(parseFloat(prevQty) || 0)
        )}
      </td>
      <td className="border-r p-2 text-right">{fmt(prevAmt)}</td>
      <td className="border-r p-2 text-right">
        {canWrite ? (
          <Input
            type="number"
            step="0.01"
            value={thisQty}
            onChange={(e) => { setThisQty(e.target.value); save("thisQty", e.target.value); }}
            className="h-6 w-16 px-1 text-right text-xs"
          />
        ) : (
          fmt(parseFloat(thisQty) || 0)
        )}
      </td>
      <td className="border-r p-2 text-right">{fmt(thisAmt)}</td>
      <td className="border-r p-2 text-right">{pct(cumQty, item.contractQty)}</td>
      <td className="p-2 text-right">{pct(item.contractQty - cumQty, item.contractQty)}</td>
    </tr>
  );
}
