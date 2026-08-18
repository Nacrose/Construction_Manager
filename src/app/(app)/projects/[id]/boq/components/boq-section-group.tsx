"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc-client";
import { useMutation } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  ChevronRight,
  ChevronDown,
  Folder,
  FolderOpen,
} from "lucide-react";
import { toast } from "sonner";
import type { BoqItem } from "../types";
import { BoqRow } from "./boq-row";

export function BoqSectionGroup({
  section,
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
  density = "comfortable",
  actionBarItem,
  onRowClick,
  inspectedItemId,
  onOpenAnalysis,
  descWidth = 260,
}: {
  section: string;
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
  actionBarItem: { item: BoqItem; el: HTMLElement } | null;
  onRowClick: (item: BoqItem, el: HTMLElement) => void;
  inspectedItemId?: string | null;
  onOpenAnalysis?: (item: BoqItem) => void;
  descWidth?: number;
}) {
  const utils = trpc.useUtils() as any;
  const [editingSection, setEditingSection] = useState(false);
  const [sectionName, setSectionName] = useState(section);

  const updateSectionMutation = useMutation({
    mutationFn: async (newSection: string) => {
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

  const totalCols = (showBaseline ? 2 : 0) + (canWrite ? 1 : 0) + 9;

  return (
    <>
      <tr className="bg-muted/70 hover:bg-muted/90 border-y border-border/60 transition-colors">
        <td
          colSpan={totalCols}
          className={cn("px-3", density === "compact" ? "py-1" : "py-1.5")}
        >
          <div className="flex items-center gap-2">
            {/* Collapse/expand chevron */}
            <button
              onClick={onToggleCollapse}
              className="flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
              title={isCollapsed ? "Expand section" : "Collapse section"}
            >
              {isCollapsed ? (
                <ChevronRight className="h-3.5 w-3.5" />
              ) : (
                <ChevronDown className="h-3.5 w-3.5 text-primary" />
              )}
            </button>

            {isCollapsed ? (
              <Folder className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            ) : (
              <FolderOpen className="h-3.5 w-3.5 text-primary shrink-0" />
            )}

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
                className={`text-xs font-mono font-bold uppercase tracking-wider text-foreground transition-colors ${
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

            {/* Always show section subtotal on the right */}
            <div className="ml-auto flex items-center gap-2">
              <span className="text-[10px] font-mono text-muted-foreground uppercase">
                Subtotal:
              </span>
              <span className="text-xs font-mono font-bold text-primary tabular-nums">
                NPR{" "}
                {sectionTotal.toLocaleString("en-IN", {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </span>
            </div>
          </div>
        </td>
      </tr>
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
              isActionBarOpen={actionBarItem?.item.id === item.id}
              onActionClick={(el) => onRowClick(item, el)}
              isInspected={inspectedItemId === item.id}
              onOpenAnalysis={onOpenAnalysis}
              descWidth={descWidth}
            />
          ))}
          <tr className="bg-muted/30 font-mono text-xs border-t border-border/40">
            <td
              colSpan={showBaseline ? 9 : 7}
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
