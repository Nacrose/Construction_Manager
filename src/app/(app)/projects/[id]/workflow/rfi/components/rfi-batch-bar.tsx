"use client";

import { Button } from "@/components/ui/button";

export function RfiBatchBar({
  selectedCount,
  deselectAll,
  onBatchStatus,
}: {
  selectedCount: number;
  deselectAll: () => void;
  onBatchStatus: (status: string) => void;
}) {
  if (selectedCount === 0) return null;

  return (
    <div className="sticky bottom-4 z-50 flex items-center justify-between rounded border border-primary/40 bg-card p-3 shadow-lg">
      <span className="text-xs font-mono font-bold text-primary">
        {selectedCount} RFI{selectedCount > 1 ? "s" : ""} selected
      </span>
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="sm"
          className="h-7 text-xs font-mono"
          onClick={deselectAll}
        >
          Deselect
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="h-7 text-xs font-mono text-success/80 border-success/40 hover:bg-success/10"
          onClick={() => onBatchStatus("approved")}
        >
          Approve
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="h-7 text-xs font-mono text-destructive border-destructive/40 hover:bg-destructive/10"
          onClick={() => onBatchStatus("rejected")}
        >
          Reject
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="h-7 text-xs font-mono text-amber-400 border-amber-500/40 hover:bg-amber-500/10"
          onClick={() => onBatchStatus("closed")}
        >
          Close
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="h-7 text-xs font-mono text-destructive border-destructive/40 hover:bg-destructive/10"
          onClick={() => onBatchStatus("delete")}
        >
          Delete
        </Button>
      </div>
    </div>
  );
}
