"use client";

import { cn } from "@/lib/utils";
import { toast } from "sonner";

export function BoqFilterChips({
  items,
  availableSections,
  activeCategoryFilter,
  setActiveCategoryFilter,
  selectedItems,
  clearSelection,
  canWrite,
  isLocked,
  selSections,
  bulkMoveSectionMutation,
}: {
  items: any[];
  availableSections: string[];
  activeCategoryFilter: string | null;
  setActiveCategoryFilter: (val: string | null) => void;
  selectedItems: Set<string>;
  clearSelection: () => void;
  canWrite: boolean;
  isLocked: boolean;
  selSections: string[];
  bulkMoveSectionMutation: any;
}) {
  const executingCount = items.filter((i) => ((i as any).executedQty ?? 0) > 0).length;

  return (
    <>
      {/* Quick Section Filter Chips */}
      <div className="flex items-center gap-1.5 overflow-x-auto py-2 px-1 border-b border-border/40 bg-card/40 no-scrollbar">
        <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground mr-1 shrink-0">
          WBS:
        </span>
        <button
          onClick={() => setActiveCategoryFilter(null)}
          className={cn(
            "px-2.5 py-1 rounded text-xs font-mono transition-all shrink-0 flex items-center gap-1.5 border",
            activeCategoryFilter === null
              ? "bg-primary text-primary-foreground font-bold border-primary shadow-sm"
              : "bg-muted/40 text-muted-foreground hover:text-foreground border-border/50 hover:border-primary/40"
          )}
        >
          <span>All</span>
          <span
            className={cn(
              "text-[10px] px-1 rounded",
              activeCategoryFilter === null
                ? "bg-black/20 text-primary-foreground font-bold"
                : "bg-muted text-muted-foreground"
            )}
          >
            {items.length}
          </span>
        </button>

        {availableSections.map((sec) => {
          const count = items.filter(
            (i) => (i.section || i.category || "Uncategorized") === sec
          ).length;
          const isSelected = activeCategoryFilter === sec;
          return (
            <button
              key={sec}
              onClick={() => setActiveCategoryFilter(isSelected ? null : sec)}
              className={cn(
                "px-2.5 py-1 rounded text-xs font-mono transition-all shrink-0 flex items-center gap-1.5 border",
                isSelected
                  ? "bg-primary text-primary-foreground font-bold border-primary shadow-sm"
                  : "bg-muted/40 text-muted-foreground hover:text-foreground border-border/50 hover:border-primary/40"
              )}
            >
              <span className="truncate max-w-[200px]">{sec}</span>
              <span
                className={cn(
                  "text-[10px] px-1 rounded",
                  isSelected
                    ? "bg-black/20 text-primary-foreground font-bold"
                    : "bg-muted text-muted-foreground"
                )}
              >
                {count}
              </span>
            </button>
          );
        })}

        {executingCount > 0 && (
          <button
            onClick={() =>
              setActiveCategoryFilter(
                activeCategoryFilter === "__in_progress__" ? null : "__in_progress__"
              )
            }
            className={cn(
              "px-2.5 py-1 rounded text-xs font-mono transition-all shrink-0 flex items-center gap-1.5 border",
              activeCategoryFilter === "__in_progress__"
                ? "bg-amber-500 text-black font-bold border-amber-500 shadow-sm"
                : "bg-muted/40 text-amber-400 hover:text-amber-300 border-amber-500/40 hover:border-amber-500/70"
            )}
          >
            <span>⚡ Executing</span>
            <span className="text-[10px] px-1 rounded bg-muted/60 text-foreground font-bold">
              {executingCount}
            </span>
          </button>
        )}
      </div>

      {/* Bulk actions bar — shown when items are selected */}
      {canWrite && selectedItems.size > 0 && (
        <div className="flex items-center gap-2 border-b bg-primary/5 px-3 py-1.5">
          <span className="text-xs font-medium">{selectedItems.size} selected</span>
          <span className="text-muted-foreground">·</span>
          {/* Bulk move to section */}
          <select
            value=""
            onChange={(e) => {
              if (e.target.value) {
                if (isLocked) {
                  toast.error("BOQ is locked.");
                  return;
                }
                const section = e.target.value === "__none__" ? undefined : e.target.value;
                bulkMoveSectionMutation.mutate({
                  itemIds: Array.from(selectedItems),
                  section,
                });
              }
            }}
            disabled={bulkMoveSectionMutation.isPending}
            className="h-7 rounded border bg-background px-2 text-xs"
            title="Move selected items to a section"
          >
            <option value="">Move to section…</option>
            <option value="__none__">— No section —</option>
            {selSections.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <button
            onClick={clearSelection}
            className="ml-auto text-xs text-muted-foreground hover:text-foreground"
          >
            Clear selection
          </button>
        </div>
      )}
    </>
  );
}
