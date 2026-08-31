"use client";

import { useState, useRef } from "react";
import { trpc } from "@/lib/trpc-client";
import { cn } from "@/lib/utils";
import {
  ChevronDown,
  ChevronUp,
  Lock,
} from "lucide-react";
import { toast } from "sonner";
import type { BoqItem } from "../types";
import { InlineEdit } from "./inline-edit";
import { UnitSelect } from "./unit-select";
import { TagsDropdown } from "./tags-dropdown";
import { parseNumericInput } from "@/lib/currency";
import { ReadOnlyRateAnalysis } from "./read-only-rate-analysis";

export function BoqRow({
  item,
  expanded,
  onToggle,
  canWrite,
  projectId,
  showBaseline,
  isLocked,
  density = "comfortable",
  rowIndex = 0,
  isSelected = false,
  onToggleSelect,
  isActionBarOpen,
  onActionClick,
  isInspected = false,
  onOpenAnalysis,
  descWidth = 260,
}: {
  item: BoqItem;
  expanded?: boolean;
  onToggle: () => void;
  canWrite: boolean;
  projectId: string;
  showBaseline?: boolean;
  isLocked?: boolean;
  density?: "comfortable" | "compact";
  rowIndex?: number;
  isSelected?: boolean;
  onToggleSelect?: () => void;
  isActionBarOpen?: boolean;
  onActionClick?: (el: HTMLElement) => void;
  isInspected?: boolean;
  onOpenAnalysis?: (item: BoqItem) => void;
  descWidth?: number;
}) {
  const utils = trpc.useUtils() as any;
  const [descExpanded, setDescExpanded] = useState(false);
  const trRef = useRef<HTMLTableRowElement>(null);

  const updateMutation = trpc.boq.update.useMutation({
    onSuccess: () => {
      utils.boq.list.invalidate({ projectId });
    },
    onError: (e) => toast.error(e.message),
  });

  const lockedToast = () => toast.error("BOQ is locked.");
  const guardedUpdate = (args: Parameters<typeof updateMutation.mutate>[0]) => {
    if (isLocked) {
      lockedToast();
      return;
    }
    updateMutation.mutate(args);
  };

  const executedQty = (item as any).executedQty ?? 0;
  const executedPct = (item as any).executedPct ?? 0;
  const isCompact = density === "compact";

  return (
    <>
      <tr
        ref={trRef}
        onClick={(e) => {
          const target = e.target as HTMLElement;
          if (target.closest("input, button, select, textarea, [contenteditable]")) return;
          if (onOpenAnalysis) {
            onOpenAnalysis(item);
          } else if (onActionClick && trRef.current) {
            onActionClick(trRef.current);
          }
        }}
        className={`cursor-pointer border-b border-border/40 transition-colors duration-150 hover:bg-primary/5 ${
          isInspected ? "bg-primary/15 font-medium" : rowIndex % 2 === 1 ? "bg-muted/20" : ""
        } ${isSelected ? "bg-primary/10" : ""} ${
          isActionBarOpen ? "ring-1 ring-inset ring-primary/30" : ""
        } ${item.locked || isLocked ? "opacity-70" : ""}`}
      >
        <td className={cn("text-center", isCompact ? "py-0.5 px-1" : "p-1")}>
          {canWrite && onToggleSelect && (
            <input
              type="checkbox"
              checked={isSelected}
              onChange={onToggleSelect}
              className="h-3.5 w-3.5 rounded border-border"
              title="Select item"
            />
          )}
        </td>
        <td
          className={cn(
            "font-mono whitespace-nowrap sticky left-0 bg-card/95 backdrop-blur-md z-10",
            isCompact ? "py-0.5 px-2 text-[11px]" : "p-1 text-xs"
          )}
        >
          <div className="flex items-center gap-1">
            {(item.locked || isLocked) && (
              <Lock className="h-3 w-3 text-amber-500 shrink-0" />
            )}
            {canWrite ? (
              <InlineEdit
                value={item.code}
                onSave={(v) => guardedUpdate({ itemId: item.id, code: v })}
                disabled={updateMutation.isPending || item.locked || isLocked}
                className="w-20"
              />
            ) : (
              item.code
            )}
          </div>
        </td>
        <td
          style={{ width: `${descWidth}px`, maxWidth: `${descWidth}px` }}
          className={cn(isCompact ? "py-0.5 px-2" : "p-1.5", "overflow-hidden align-top")}
        >
          <div className="flex items-start gap-1">
            <div
              className={`flex-1 min-w-0 leading-snug break-words ${
                isCompact ? "text-[11px]" : "text-xs"
              } whitespace-normal`}
            >
              {canWrite ? (
                <InlineEdit
                  value={item.description}
                  onSave={(v) => guardedUpdate({ itemId: item.id, description: v })}
                  disabled={updateMutation.isPending || item.locked || isLocked}
                  wrap={true}
                />
              ) : (
                <span className="block px-0.5 py-0.5 whitespace-normal break-words">
                  {item.description}
                </span>
              )}
            </div>
          </div>
          {item.category && item.section && item.category !== item.section && (
            <span className="mt-0.5 inline-block rounded bg-muted px-1.5 py-0.5 text-[9px] text-muted-foreground font-mono">
              {item.category}
            </span>
          )}
        </td>
        <td
          className={cn(
            "text-muted-foreground whitespace-nowrap",
            isCompact ? "py-0.5 px-2 text-[11px]" : "p-1 text-xs"
          )}
        >
          {canWrite ? (
            <UnitSelect
              value={item.unit}
              onSave={(v) => guardedUpdate({ itemId: item.id, unit: v })}
              disabled={updateMutation.isPending || item.locked || isLocked}
            />
          ) : (
            item.unit
          )}
        </td>
        {showBaseline && (
          <>
            <td
              className={cn(
                "text-right text-muted-foreground bg-muted/10 font-mono whitespace-nowrap",
                isCompact ? "py-0.5 px-2 text-[11px]" : "p-1 text-xs"
              )}
            >
              {item.baselineQty !== null ? item.baselineQty.toLocaleString() : "-"}
            </td>
            <td
              className={cn(
                "text-right text-muted-foreground bg-muted/10 font-mono whitespace-nowrap",
                isCompact ? "py-0.5 px-2 text-[11px]" : "p-1 text-xs"
              )}
            >
              {item.baselineRate !== null
                ? item.baselineRate.toLocaleString("en-IN", { minimumFractionDigits: 2 })
                : "-"}
            </td>
          </>
        )}
        <td
          className={cn(
            "text-right font-mono whitespace-nowrap",
            isCompact ? "py-0.5 px-2 text-[11px]" : "p-1 text-xs"
          )}
        >
          {canWrite ? (
            <InlineEdit
              value={String(item.quantity)}
              type="number"
              onSave={(v) =>
                guardedUpdate({ itemId: item.id, quantity: parseNumericInput(v) })
              }
              disabled={updateMutation.isPending || item.locked || isLocked}
              className="w-20 text-right"
            />
          ) : (
            item.quantity.toLocaleString()
          )}
          {/* Execution Progress Mini-Bar */}
          {executedQty > 0 && (
            <div
              className="mt-0.5 flex flex-col items-end gap-0.5"
              title={`Executed: ${executedQty.toLocaleString()} / ${item.quantity.toLocaleString()} (${executedPct}%)`}
            >
              <div className="h-1 w-full max-w-[80px] rounded-full bg-muted overflow-hidden border border-border/40">
                <div
                  className="h-full bg-primary transition-all duration-300"
                  style={{ width: `${executedPct}%` }}
                />
              </div>
              <span className="text-[9px] text-muted-foreground font-mono leading-none">
                {executedPct}% done
              </span>
            </div>
          )}
        </td>
        <td
          className={cn(
            "text-right font-mono whitespace-nowrap",
            isCompact ? "py-0.5 px-2 text-[11px]" : "p-1 text-xs"
          )}
        >
          {canWrite ? (
            <InlineEdit
              value={String(item.rate)}
              type="number"
              onSave={(v) => guardedUpdate({ itemId: item.id, rate: parseNumericInput(v) })}
              disabled={updateMutation.isPending || item.locked || isLocked}
              className="w-24 text-right"
            />
          ) : (
            item.rate.toLocaleString("en-IN", { minimumFractionDigits: 2 })
          )}
        </td>
        <td
          className={cn(
            "text-right font-mono font-medium text-primary whitespace-nowrap",
            isCompact ? "py-0.5 px-2 text-[11px]" : "p-1 text-xs"
          )}
        >
          NPR{" "}
          {item.amount.toLocaleString("en-IN", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })}
        </td>
        <td className={cn(isCompact ? "py-0.5 px-1" : "p-1")}>
          <TagsDropdown
            tags={item.tags}
            canWrite={canWrite}
            onSave={(tags) => guardedUpdate({ itemId: item.id, tags })}
          />
        </td>
      </tr>
      {expanded && !onOpenAnalysis && (
        <tr className="bg-muted/5">
          <td />
          <td
            colSpan={(showBaseline ? 2 : 0) + (canWrite ? 1 : 0) + 8}
            className="p-3"
          >
            <ReadOnlyRateAnalysis itemId={item.id} projectId={projectId} />
          </td>
        </tr>
      )}
    </>
  );
}
