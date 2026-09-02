"use client";

import { useState } from "react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc-client";
import { Plus, Loader2, X } from "lucide-react";
import { InlineEdit } from "./InlineEdit";
import type { Task } from "../types";

export function BoqAttachmentPanel({
  task,
  projectId,
  canWrite,
}: {
  task: Task;
  projectId: string;
  canWrite: boolean;
}) {
  const utils = trpc.useUtils();
  const [selectedBoqId, setSelectedBoqId] = useState("");
  const [qty, setQty] = useState("");

  const { data: boqData } = trpc.boq.list.useQuery({ projectId });

  const addLinkMutation = trpc.gantt.linkBoq.useMutation({
    onSuccess: () => {
      utils.gantt.list.invalidate({ projectId });
      toast.success("BOQ item attached");
      setSelectedBoqId("");
      setQty("");
    },
    onError: (e) => toast.error(e.message),
  });

  const removeLinkMutation = trpc.gantt.unlinkBoq.useMutation({
    onSuccess: () => {
      utils.gantt.list.invalidate({ projectId });
      toast.success("BOQ item removed");
    },
    onError: (e) => toast.error(e.message),
  });

  const updateQtyMutation = trpc.gantt.linkBoq.useMutation({
    onSuccess: () => {
      utils.gantt.list.invalidate({ projectId });
    },
    onError: (e) => toast.error(e.message),
  });

  const totalBoqValue = task.boqLinks.reduce((s, l) => s + l.boqItem.rate * l.quantity, 0);

  return (
    <div className="flex border-b bg-info/30 dark:bg-[var(--navy-deep)]/10">
      <div className="flex-1 px-3 py-2 space-y-1.5">
        {task.boqLinks.length > 0 && (
          <div className="space-y-1">
            {task.boqLinks.map((link) => (
              <div key={link.id} className="flex items-center gap-2 rounded bg-background px-2 py-1 text-xs">
                <span className="rounded bg-muted px-1 py-0.5 font-mono text-[10px] font-semibold shrink-0">
                  {link.boqItem.code}
                </span>
                <span className="truncate flex-1 font-medium">{link.boqItem.description}</span>
                {canWrite ? (
                  <InlineEdit
                    value={String(link.quantity)}
                    type="number"
                    onSave={(v) => updateQtyMutation.mutate({ taskId: task.id, boqItemId: link.boqItemId, quantity: parseFloat(v) || 0 })}
                    className="w-16 text-right"
                  />
                ) : (
                  <span className="font-mono">{link.quantity}</span>
                )}
                <span className="text-muted-foreground shrink-0">{link.boqItem.unit}</span>
                <span className="text-emerald-700 dark:text-emerald-400 font-medium shrink-0">
                  NPR {(link.boqItem.rate * link.quantity).toLocaleString("en-IN", { maximumFractionDigits: 0 })}
                </span>
                {canWrite && (
                  <button
                    onClick={() => removeLinkMutation.mutate({ taskId: task.id, linkId: link.id })}
                    className="rounded p-0.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive shrink-0"
                    title="Remove"
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </div>
            ))}
            {totalBoqValue > 0 && (
              <div className="flex justify-end gap-2 px-2 text-[10px] text-muted-foreground">
                <span>Total:</span>
                <span className="font-semibold text-emerald-700 dark:text-emerald-400">
                  NPR {totalBoqValue.toLocaleString("en-IN", { maximumFractionDigits: 0 })}
                </span>
              </div>
            )}
          </div>
        )}

        {canWrite && boqData && boqData.items.length > 0 && (
          <div className="flex items-center gap-1.5">
            <select
              value={selectedBoqId}
              onChange={(e) => setSelectedBoqId(e.target.value)}
              className="h-7 flex-1 rounded border bg-background px-1.5 text-xs"
            >
              <option value="">+ Add BOQ item…</option>
              {boqData.items
                .filter((b) => !task.boqLinks.some((l) => l.boqItemId === b.id))
                .map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.code} · {b.description} ({b.unit})
                  </option>
                ))}
            </select>
            <input
              type="number"
              value={qty}
              onChange={(e) => setQty(e.target.value)}
              placeholder="Qty"
              className="h-7 w-16 rounded border bg-background px-1.5 text-xs"
              disabled={!selectedBoqId}
              onKeyDown={(e) => {
                if (e.key === "Enter" && selectedBoqId) {
                  e.preventDefault();
                  addLinkMutation.mutate({ taskId: task.id, boqItemId: selectedBoqId, quantity: parseFloat(qty) || 0 });
                }
              }}
            />
            <button
              onClick={() => addLinkMutation.mutate({ taskId: task.id, boqItemId: selectedBoqId, quantity: parseFloat(qty) || 0 })}
              disabled={!selectedBoqId || addLinkMutation.isPending}
              className="flex h-7 w-7 items-center justify-center rounded bg-info text-white disabled:opacity-40 hover:bg-info"
              title="Attach BOQ item"
            >
              {addLinkMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
            </button>
          </div>
        )}

        {task.boqLinks.length === 0 && !canWrite && (
          <p className="text-xs text-muted-foreground py-1">No BOQ items attached.</p>
        )}
      </div>
    </div>
  );
}
