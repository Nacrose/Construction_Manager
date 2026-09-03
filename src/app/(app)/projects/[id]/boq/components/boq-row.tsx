"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc-client";
import { cn } from "@/lib/utils";
import {
  ChevronDown,
  ChevronUp,
  Lock,
  Eye,
  Pencil,
  Copy,
  MoveRight,
  FolderInput,
  Trash2,
  Tags,
  Plus,
} from "lucide-react";
import { toast } from "sonner";
import type { BoqItem } from "../types";
import { InlineEdit } from "./inline-edit";
import { UnitSelect } from "./unit-select";
import { TagsDropdown } from "./tags-dropdown";
import { parseNumericInput } from "@/lib/currency";
import { deriveBoqKeyline, segmentDescription } from "@/lib/boq-keyline";
import { ContextMenu, ContextMenuTrigger, ContextMenuContent, ContextMenuItem, ContextMenuSeparator, ContextMenuSub, ContextMenuSubTrigger, ContextMenuSubContent } from "@/components/ui/context-menu";
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
  selectable = false,
  sn = "",
  wbsDepth = 0,
  isInspected = false,
  onOpenAnalysis,
  onAddItem,
  sections = [],
  onMoveSection,
  onCopyToSection,
  onCopyRateAnalysis,
  onDeleteItem,
  onChangeKeyword,
  onRemoveKeyword,
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
  selectable?: boolean;
  sn?: string;
  wbsDepth?: number;
  isInspected?: boolean;
  onOpenAnalysis?: (item: BoqItem) => void;
  onAddItem?: (section: string | undefined) => void;
  sections?: string[];
  onMoveSection?: (item: BoqItem, section: string) => void;
  onCopyToSection?: (item: BoqItem, section: string) => void;
  onCopyRateAnalysis?: (item: BoqItem) => void;
  onDeleteItem?: (item: BoqItem) => void;
  onChangeKeyword?: (item: BoqItem) => void;
  onRemoveKeyword?: (item: BoqItem) => void;
  descWidth?: number;
}) {
  const utils = trpc.useUtils() as any;
  const [descExpanded, setDescExpanded] = useState(false);
  const [rowEdit, setRowEdit] = useState(false);
  const editable = canWrite && rowEdit;

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

  // Selected/active rows stand out with a saturated primary band + a left
  // accent "depth" bar; the sticky S.N. column shares the EXACT row background
  // so it never reads as a different color band.
  const selectedRow = isSelected || isInspected;
  const rowBg = selectedRow
    ? "bg-primary/20 font-medium"
    : rowIndex % 2 === 1
      ? "bg-muted/30"
      : "bg-card";
  const cellBg = selectedRow
    ? "bg-primary/20 border-l-2 border-primary"
    : rowIndex % 2 === 1
      ? "bg-muted/30"
      : "bg-card";

  return (
    <>
      <ContextMenu>
        <ContextMenuTrigger asChild>
      <tr
        className={`cursor-default border-b border-border/40 transition-colors duration-150 hover:bg-primary/5 ${rowBg} ${
          item.locked || isLocked ? "opacity-70" : ""
        }`}
      >
        {selectable && canWrite && onToggleSelect && (
          <td className={cn("text-center", isCompact ? "py-0.5 px-1" : "p-1")}>
            <input
              type="checkbox"
              checked={isSelected}
              onChange={onToggleSelect}
              className="h-3.5 w-3.5 rounded border-border"
              title="Select item"
            />
          </td>
        )}
        <td
          className={cn(
            "relative font-mono whitespace-nowrap sticky left-0 z-10 hover:bg-primary/5",
            cellBg,
            isCompact ? "py-0.5 px-1 text-[10px]" : "p-1 text-[11px]"
          )}
        >
          <div className="flex items-stretch relative" style={{ paddingLeft: wbsDepth > 0 ? 20 : 0 }}>
            {wbsDepth > 0 && (
              /* vertical trunk — full row height, continuous across siblings */
              <span className="w-[2px] self-stretch bg-foreground/30" />
            )}
            {wbsDepth > 0 && (
              /* horizontal branch to this item */
              <span className="self-center h-[2px] w-3 bg-foreground/30" />
            )}
            <span style={{ marginLeft: wbsDepth > 0 ? 2 : 0 }} className="flex items-center gap-1">
              {(item.locked || isLocked) && (
                <Lock className="h-3 w-3 text-amber-500 shrink-0" />
              )}
              {editable ? (
                <InlineEdit
                  value={sn}
                  onSave={(v) => guardedUpdate({ itemId: item.id, code: v })}
                  disabled={updateMutation.isPending || item.locked || isLocked}
                  className="w-10"
                />
              ) : (
                <span className="font-semibold text-primary">{sn}</span>
              )}
            </span>
          </div>
        </td>
        <td
          style={{ width: `${descWidth}px`, maxWidth: `${descWidth}px` }}
          className={cn(isCompact ? "py-0.5 px-2" : "p-1.5", "overflow-hidden align-top")}
        >
          <div className="flex items-start gap-1">
            {descExpanded ? (
              <div
                className={`flex-1 min-w-0 leading-snug break-words whitespace-normal ${
                  isCompact ? "text-[10px]" : "text-[11px]"
                }`}
              >
                {editable ? (
                  <InlineEdit
                    value={item.description}
                    onSave={(v) => guardedUpdate({ itemId: item.id, description: v })}
                    disabled={updateMutation.isPending || item.locked || isLocked}
                    wrap={true}
                  />
                ) : (
                  <span className="block px-0.5 py-0.5 whitespace-normal break-words">
                    {segmentDescription(item.description, item.keyTerms).map((s, i) =>
                      s.highlighted ? (
                        <span key={i} className="amber-mark rounded-sm font-semibold text-foreground">
                          {s.text}
                        </span>
                      ) : (
                        <span key={i}>{s.text}</span>
                      )
                    )}
                  </span>
                )}
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setDescExpanded(true)}
                title="Expand description"
                className="flex-1 min-w-0 text-left leading-snug text-[11px] whitespace-nowrap overflow-hidden text-ellipsis"
              >
                {deriveBoqKeyline(item.keyTerms, item.description)}
              </button>
            )}
            {descExpanded && (
              <button
                type="button"
                onClick={() => setDescExpanded(false)}
                className="shrink-0 p-0.5 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                title="Collapse description"
              >
                <ChevronUp className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </td>
        <td
          className={cn(
            "text-muted-foreground whitespace-nowrap",
            isCompact ? "py-0.5 px-2 text-[10px]" : "p-1 text-[11px]"
          )}
        >
          {editable ? (
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
                isCompact ? "py-0.5 px-2 text-[10px]" : "p-1 text-[11px]"
              )}
            >
              {item.baselineQty !== null ? item.baselineQty.toLocaleString() : "-"}
            </td>
            <td
              className={cn(
                "text-right text-muted-foreground bg-muted/10 font-mono whitespace-nowrap",
                isCompact ? "py-0.5 px-2 text-[10px]" : "p-1 text-[11px]"
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
            isCompact ? "py-0.5 px-2 text-[10px]" : "p-1 text-[11px]"
          )}
        >
          {editable ? (
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
            isCompact ? "py-0.5 px-2 text-[10px]" : "p-1 text-[11px]"
          )}
        >
          {editable ? (
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
            isCompact ? "py-0.5 px-2 text-[10px]" : "p-1 text-[11px]"
          )}
        >
          NPR{" "}
          {item.amount.toLocaleString("en-IN", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })}
        </td>
        <td className={cn(isCompact ? "py-0.5 px-1" : "p-1")}>
          {editable ? (
            <TagsDropdown
              tags={item.tags}
              canWrite={canWrite}
              onSave={(tags) => guardedUpdate({ itemId: item.id, tags })}
            />
          ) : (
            <span className="text-[10px] text-muted-foreground">
              {(() => {
                try {
                  const t = item.tags ? JSON.parse(item.tags) : [];
                  return Array.isArray(t) ? t.join(", ") : item.tags || "";
                } catch {
                  return item.tags || "";
                }
              })()}
            </span>
          )}
        </td>
      </tr>
        </ContextMenuTrigger>
        <ContextMenuContent className="w-60">
          {canWrite && onAddItem && (
            <ContextMenuItem onClick={() => onAddItem(item.section ?? undefined)}>
              <Plus className="h-3.5 w-3.5" /> Add item
            </ContextMenuItem>
          )}
          <ContextMenuItem onClick={() => onOpenAnalysis?.(item)}>
            <Eye className="h-3.5 w-3.5" /> Open analysis
          </ContextMenuItem>
          {canWrite && (
            <ContextMenuItem onClick={() => { setRowEdit(!rowEdit); if (!rowEdit) setDescExpanded(true); }}>
              <Pencil className="h-3.5 w-3.5" /> {rowEdit ? "Done editing" : "Edit"}
            </ContextMenuItem>
          )}
          {canWrite && onToggleSelect && (
            <ContextMenuItem onClick={onToggleSelect}>
              {isSelected ? "Deselect item" : "Select item"}
            </ContextMenuItem>
          )}
          {sections.length > 0 && onMoveSection && (
            <ContextMenuSub>
              <ContextMenuSubTrigger><MoveRight className="h-3.5 w-3.5" /> Move to category</ContextMenuSubTrigger>
              <ContextMenuSubContent>
                {sections.map((sec) => (
                  <ContextMenuItem key={sec} disabled={sec === item.section} onClick={() => onMoveSection?.(item, sec)}>
                    {sec}
                  </ContextMenuItem>
                ))}
              </ContextMenuSubContent>
            </ContextMenuSub>
          )}
          {sections.length > 0 && onCopyToSection && (
            <ContextMenuSub>
              <ContextMenuSubTrigger><Copy className="h-3.5 w-3.5" /> Copy to category</ContextMenuSubTrigger>
              <ContextMenuSubContent>
                {sections.map((sec) => (
                  <ContextMenuItem key={sec} onClick={() => onCopyToSection?.(item, sec)}>
                    {sec}
                  </ContextMenuItem>
                ))}
              </ContextMenuSubContent>
            </ContextMenuSub>
          )}
          <ContextMenuItem onClick={() => onCopyRateAnalysis?.(item)}>
            <Copy className="h-3.5 w-3.5" /> Copy rate analysis
          </ContextMenuItem>
          {canWrite && onChangeKeyword && (
            <ContextMenuItem onClick={() => onChangeKeyword(item)}>
              <FolderInput className="h-3.5 w-3.5" /> Change keyword
            </ContextMenuItem>
          )}
          {canWrite && onRemoveKeyword && (
            <ContextMenuItem onClick={() => onRemoveKeyword(item)}>
              <Tags className="h-3.5 w-3.5" /> Remove keyword
            </ContextMenuItem>
          )}
          <ContextMenuSeparator />
          {canWrite && (
            <ContextMenuItem className="text-destructive" onClick={() => onDeleteItem?.(item)}>
              <Trash2 className="h-3.5 w-3.5" /> Delete
            </ContextMenuItem>
          )}
        </ContextMenuContent>
      </ContextMenu>
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
