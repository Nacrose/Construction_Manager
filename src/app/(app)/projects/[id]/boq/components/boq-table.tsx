"use client";

import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { Inbox } from "lucide-react";
import { InlineAddRow } from "./inline-add-row";
import { BoqSectionGroup } from "./boq-section-group";
import type { BoqItem } from "../types";

function MatrixPanel({
  title,
  children,
  className,
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded border border-border bg-card shadow-[0_0_16px_rgba(52,211,153,0.10)] transition-all duration-200",
        className
      )}
    >
      {/* Title bar (Matrix HUD titlebar) */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-border/60 bg-muted/60 select-none shrink-0 relative z-10">
        <span className="font-mono text-xs font-bold text-primary tracking-wide uppercase flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-primary shadow-[0_0_6px_#34d399] animate-pulse" />
          {title}
        </span>
      </div>

      {/* Content */}
      <div className="relative z-10">{children}</div>
    </div>
  );
}

export function BoqTable({
  projectId,
  filtered,
  canWrite,
  isLocked,
  tableDensity,
  showBaseline,
  selectedItems,
  toggleSelectAll,
  toggleSelect,
  expanded,
  toggleExpand,
  collapsedSections,
  toggleSection,
  actionBarItem,
  setActionBarItem,
  totalAmount,
  inspectedItemId,
  onOpenAnalysis,
}: {
  projectId: string;
  filtered: BoqItem[];
  canWrite: boolean;
  isLocked: boolean;
  tableDensity: "comfortable" | "compact";
  showBaseline: boolean;
  selectedItems: Set<string>;
  toggleSelectAll: () => void;
  toggleSelect: (itemId: string) => void;
  expanded: Set<string>;
  toggleExpand: (itemId: string) => void;
  collapsedSections: Set<string>;
  toggleSection: (section: string) => void;
  actionBarItem: { item: BoqItem; el: HTMLElement } | null;
  setActionBarItem: (val: { item: BoqItem; el: HTMLElement } | null) => void;
  totalAmount: number;
  inspectedItemId?: string | null;
  onOpenAnalysis?: (item: BoqItem) => void;
}) {
  if (!filtered.length) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
        className="space-y-4"
      >
        <Card className="flex flex-col items-center gap-3 p-12 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
            <Inbox className="h-6 w-6 text-muted-foreground" />
          </div>
          <div>
            <p className="font-medium">No BOQ items found</p>
            <p className="text-sm text-muted-foreground">
              {canWrite
                ? "Add your first item to start building the bill of quantities."
                : "BOQ items will appear here once they are created."}
            </p>
          </div>
        </Card>
        {canWrite && (
          <Card className="p-3">
            <table className="w-full text-sm">
              <tbody>
                <InlineAddRow projectId={projectId} existingCount={0} isLocked={isLocked} />
              </tbody>
            </table>
          </Card>
        )}
      </motion.div>
    );
  }

  const groups: { section: string; items: BoqItem[] }[] = [];
  const map = new Map<string, BoqItem[]>();
  filtered.forEach((item) => {
    const sec = item.section || item.category || "Uncategorized";
    if (!map.has(sec)) map.set(sec, []);
    map.get(sec)!.push(item);
  });
  map.forEach((items, section) => groups.push({ section, items }));

  return (
    <MatrixPanel title="Bill of Quantities (BOQ)" className="print-area">
      <div className="overflow-x-auto no-scrollbar">
        <table
          className={cn(
            "w-full table-auto tabular-nums font-mono",
            tableDensity === "compact" ? "text-xs" : "text-sm"
          )}
        >
          <thead className="sticky top-0 z-20 bg-muted/90 backdrop-blur-md border-b border-border/80">
            <tr
              className={cn(
                "text-left uppercase font-mono font-bold tracking-wide border-b border-border/40 text-primary",
                tableDensity === "compact" ? "text-[10px]" : "text-[11px]"
              )}
            >
              <th
                className={cn(
                  "w-9 px-1 text-center",
                  tableDensity === "compact" ? "py-1.5" : "py-2"
                )}
              >
                {canWrite && (
                  <input
                    type="checkbox"
                    checked={
                      !!filtered && filtered.length > 0 && selectedItems.size === filtered.length
                    }
                    onChange={toggleSelectAll}
                    className="h-3.5 w-3.5 rounded border-border"
                    title="Select all"
                  />
                )}
              </th>
              <th
                className={cn(
                  "w-8 px-1 text-center",
                  tableDensity === "compact" ? "py-1.5" : "py-2"
                )}
              ></th>
              <th
                className={cn(
                  "w-20 px-2 font-semibold text-primary sticky left-0 bg-muted/95 backdrop-blur-md z-20",
                  tableDensity === "compact" ? "py-1.5" : "py-2"
                )}
              >
                Code
              </th>
              <th
                className={cn(
                  "px-3 font-semibold text-primary min-w-[200px]",
                  tableDensity === "compact" ? "py-1.5" : "py-2"
                )}
              >
                Description
              </th>
              <th
                className={cn(
                  "w-14 px-2 font-semibold text-primary text-center",
                  tableDensity === "compact" ? "py-1.5" : "py-2"
                )}
              >
                Unit
              </th>
              {showBaseline && (
                <>
                  <th
                    className={cn(
                      "w-20 px-2 text-right font-semibold text-muted-foreground bg-muted/30",
                      tableDensity === "compact" ? "py-1.5" : "py-2"
                    )}
                  >
                    Base Qty
                  </th>
                  <th
                    className={cn(
                      "w-20 px-2 text-right font-semibold text-muted-foreground bg-muted/30",
                      tableDensity === "compact" ? "py-1.5" : "py-2"
                    )}
                  >
                    Base Rate
                  </th>
                </>
              )}
              <th
                className={cn(
                  "w-24 px-2 text-right font-semibold text-primary",
                  tableDensity === "compact" ? "py-1.5" : "py-2"
                )}
              >
                Quantity
              </th>
              <th
                className={cn(
                  "w-24 px-2 text-right font-semibold text-primary",
                  tableDensity === "compact" ? "py-1.5" : "py-2"
                )}
              >
                Rate (NPR)
              </th>
              <th
                className={cn(
                  "w-28 px-2 text-right font-semibold text-primary",
                  tableDensity === "compact" ? "py-1.5" : "py-2"
                )}
              >
                Amount (NPR)
              </th>
              <th
                className={cn(
                  "w-24 px-2 font-semibold text-primary",
                  tableDensity === "compact" ? "py-1.5" : "py-2"
                )}
              >
                Tags
              </th>
              {canWrite && (
                <th
                  className={cn(
                    "w-8 px-1",
                    tableDensity === "compact" ? "py-1.5" : "py-2"
                  )}
                ></th>
              )}
            </tr>
          </thead>
          <tbody>
            {groups.map((g) => (
              <BoqSectionGroup
                key={g.section}
                section={g.section}
                items={g.items}
                expanded={expanded}
                onToggle={toggleExpand}
                canWrite={canWrite}
                sectionTotal={g.items.reduce((sum, item) => sum + item.amount, 0)}
                projectId={projectId}
                showBaseline={showBaseline}
                isLocked={isLocked}
                density={tableDensity}
                isCollapsed={collapsedSections.has(g.section)}
                onToggleCollapse={() => toggleSection(g.section)}
                selectedItems={selectedItems}
                onToggleSelect={toggleSelect}
                actionBarItem={actionBarItem}
                onRowClick={(item, el) => {
                  if (onOpenAnalysis) onOpenAnalysis(item);
                  else setActionBarItem({ item, el });
                }}
                inspectedItemId={inspectedItemId}
                onOpenAnalysis={onOpenAnalysis}
              />
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-border/60 bg-muted/60 font-mono font-bold text-xs">
              <td
                colSpan={showBaseline ? 9 : 7}
                className="px-3 py-2.5 text-right text-muted-foreground uppercase tracking-wider text-[11px]"
              >
                Grand Total
              </td>
              <td className="px-3 py-2.5 text-right text-primary font-bold whitespace-nowrap">
                NPR{" "}
                {totalAmount.toLocaleString("en-IN", {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </td>
              <td className="px-3 py-2.5"></td>
              {canWrite && <td className="px-2 py-2.5" />}
            </tr>
          </tfoot>
        </table>
      </div>
    </MatrixPanel>
  );
}
