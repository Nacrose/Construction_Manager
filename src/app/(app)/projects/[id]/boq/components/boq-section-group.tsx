"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc-client";
import { useMutation } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ContextMenu, ContextMenuTrigger, ContextMenuContent, ContextMenuItem } from "@/components/ui/context-menu";
import { computeWbsOutline } from "@/lib/wbs-tree";
import {
  ChevronRight,
  ChevronDown,
  Plus,
} from "lucide-react";
import { toast } from "sonner";
import type { BoqItem } from "../types";
import { BoqRow } from "./boq-row";

export function BoqSectionGroup({
  section,
  sectionNumber = 1,
  items,
  expanded,
  onToggle,
  canWrite,
  sectionTotal,
  projectId,
  showBaseline,
  isLocked,
  isCollapsed,
  onToggleCollapse,
  selectedItems,
  onToggleSelect,
  selectable = false,
  density = "comfortable",
  inspectedItemId,
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
  section: string;
  sectionNumber?: number;
  items: BoqItem[];
  expanded: Set<string>;
  onToggle: (id: string) => void;
  canWrite: boolean;
  sectionTotal: number;
  projectId: string;
  showBaseline?: boolean;
  isLocked?: boolean;
  density?: "comfortable" | "compact";
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  selectedItems: Set<string>;
  onToggleSelect: (id: string) => void;
  selectable?: boolean;
  inspectedItemId?: string | null;
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
  const [editingSection, setEditingSection] = useState(false);
  const [sectionName, setSectionName] = useState(section);

  const updateSectionMutation = useMutation({    mutationFn: async (newSection: string) => {
      await Promise.all(
        items.map((item) =>
          utils.boq.update.mutateAsync({ itemId: item.id, section: newSection })
        )
      );
    },
    onSuccess: () => {
      utils.boq.list.invalidate({ projectId });
      toast.success("Section updated");
      setEditingSection(false);
    },
    onError: () => toast.error("Failed to update section"),
  });

  const preAmountCols = (showBaseline ? 2 : 0) + 5 + (selectable ? 1 : 0);
  // Auto S.N.: category → 1, 2, 3… ; items → <section>.<item> (1.1, 1.2 …).
  // A dotted manual code overrides the auto number; a flat/empty code uses it.
  const itemSns = items.map((i, idx) => {
    const auto = `${sectionNumber}.${idx + 1}`;
    const manual = i.code && i.code.includes(".") && i.code !== auto ? i.code : "";
    return { id: i.id, code: manual || auto };
  });
  const wbsOutline = computeWbsOutline(itemSns);

  return (
    <>
      <ContextMenu>
        <ContextMenuTrigger asChild>
      <tr className="bg-muted/70 hover:bg-muted/90 border-y border-border/60 transition-colors">
        {selectable && <td className="w-9" />}
        <td
          className={cn(
            "w-14 px-2 sticky left-0 bg-muted/70",
            density === "compact" ? "py-1" : "py-1.5"
          )}
        >
          <div className="flex items-center gap-0.5">
            <button
              onClick={onToggleCollapse}
              className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
              title={isCollapsed ? "Expand section" : "Collapse section"}
            >
              {isCollapsed ? (
                <ChevronRight className="h-3.5 w-3.5" />
              ) : (
                <ChevronDown className="h-3.5 w-3.5 text-primary" />
              )}
            </button>
            <span className="text-[11px] font-mono font-bold text-foreground">{sectionNumber}</span>
          </div>
        </td>
        {/* Section name aligns under the Description column */}
        <td className={cn("px-3", density === "compact" ? "py-1" : "py-1.5")}>
          <div className="flex items-center gap-2">
            {editingSection ? (
              <Input
                value={sectionName}
                onChange={(e) => setSectionName(e.target.value)}
                className="h-6 max-w-xs text-xs font-mono font-bold"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    if (isLocked) {
                      toast.error("BOQ is locked.");
                      return;
                    }
                    updateSectionMutation.mutate(sectionName);
                  }
                  if (e.key === "Escape") {
                    setSectionName(section);
                    setEditingSection(false);
                  }
                }}
                onBlur={() => {
                  if (sectionName !== section) {
                    if (isLocked) {
                      toast.error("BOQ is locked.");
                      return;
                    }
                    updateSectionMutation.mutate(sectionName);
                  } else {
                    setEditingSection(false);
                  }
                }}
              />
            ) : (
              <button
                onClick={() => canWrite && setEditingSection(true)}
                className={`text-[11px] font-mono font-bold uppercase tracking-wider text-foreground transition-colors ${
                  canWrite ? "cursor-text hover:text-primary" : "cursor-default"
                }`}
                title={canWrite ? "Click to rename section" : undefined}
              >
                {section}
              </button>
            )}

            <Badge
              variant="outline"
              className="text-[10px] font-mono border-border/60 text-muted-foreground bg-background/40 shadow-none"
            >
              {items.length} {items.length === 1 ? "item" : "items"}
            </Badge>
          </div>
        </td>
        <td className="w-14 text-center" />
        {showBaseline && (
          <>
            <td className="w-20 text-right" />
            <td className="w-20 text-right" />
          </>
        )}
        <td className="w-24 text-right" />
        <td className="w-24 text-right" />
        {/* Subtotal is shown at each section's end row — not repeated in the header */}
        <td className={cn("w-28 px-3 text-right", density === "compact" ? "py-1" : "py-1.5")} />
        <td className={cn("px-3", density === "compact" ? "py-1" : "py-1.5")} />
      </tr>
        </ContextMenuTrigger>
        <ContextMenuContent className="w-52">
          {canWrite && onAddItem && (
            <ContextMenuItem onClick={() => onAddItem(section)}>
              <Plus className="h-3.5 w-3.5" /> Add item
            </ContextMenuItem>
          )}
          {canWrite && (
            <ContextMenuItem
              onClick={() => items.forEach((it) => { if (!selectedItems.has(it.id)) onToggleSelect(it.id); })}
            >
              Select all in “{section}”
            </ContextMenuItem>
          )}
          <ContextMenuItem onClick={onToggleCollapse}>
            {isCollapsed ? "Expand section" : "Collapse section"}
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
      {!isCollapsed && (
        <>
          {items.map((item, idx) => (
            <BoqRow
              key={item.id}
              item={item}
              expanded={expanded.has(item.id)}
              onToggle={() => onToggle(item.id)}
              canWrite={canWrite}
              projectId={projectId}
              showBaseline={showBaseline}
              isLocked={isLocked}
              density={density}
              rowIndex={idx}
              isSelected={selectedItems.has(item.id)}
              onToggleSelect={() => onToggleSelect(item.id)}
              selectable={selectable}
              sn={itemSns[idx].code}
              wbsDepth={wbsOutline.get(item.id)?.depth ?? 0}
              isInspected={inspectedItemId === item.id}
              onOpenAnalysis={onOpenAnalysis}
              onAddItem={onAddItem}
              sections={sections}
              onMoveSection={onMoveSection}
              onCopyToSection={onCopyToSection}
              onCopyRateAnalysis={onCopyRateAnalysis}
              onDeleteItem={onDeleteItem}
              onChangeKeyword={onChangeKeyword}
              onRemoveKeyword={onRemoveKeyword}
              descWidth={descWidth}
              />
          ))}
          <tr className="bg-muted/30 font-mono text-xs border-t border-border/40">
            <td
              colSpan={preAmountCols}
              className="px-3 py-1.5 text-right text-muted-foreground text-[11px]"
            >
              Total of {section} =
            </td>
            <td className="px-3 py-1.5 text-right text-primary font-mono font-bold whitespace-nowrap">
              NPR{" "}
              {sectionTotal.toLocaleString("en-IN", {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </td>
            <td className="px-3 py-1.5"></td>
            {canWrite && <td className="px-2 py-1.5" />}
          </tr>
        </>
      )}
    </>
  );
}
