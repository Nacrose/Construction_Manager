"use client";

import Link from "next/link";
import { format } from "date-fns";
import { Eye, FileText, Clock, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MatrixPanel } from "@/components/matrix/matrix-panel";
import { RfiStatusBadge, RfiPriorityBadge } from "@/components/workflow/badges";
import { cn } from "@/lib/utils";

export function RfiTable({
  id,
  filteredRfis,
  selectedIds,
  toggleSelect,
  toggleSelectAll,
  canWrite,
  isCompact,
  setViewRfiId,
}: {
  id: string;
  filteredRfis: any[];
  selectedIds: Set<string>;
  toggleSelect: (id: string) => void;
  toggleSelectAll: () => void;
  canWrite: boolean;
  isCompact: boolean;
  setViewRfiId: (id: string) => void;
}) {
  return (
    <MatrixPanel
      title={`Request for Information (${filteredRfis.length})`}
      className="print-area"
    >
      <div className="overflow-x-auto no-scrollbar">
        <table
          className={cn(
            "w-full table-auto tabular-nums font-mono",
            isCompact ? "text-xs" : "text-sm"
          )}
        >
          <thead className="sticky top-0 z-20 bg-muted/90 backdrop-blur-md border-b border-border/80">
            <tr
              className={cn(
                "text-left uppercase font-mono font-bold tracking-wide border-b border-border/40 text-primary",
                isCompact ? "text-[10px]" : "text-[11px]"
              )}
            >
              <th className={cn("w-9 px-1 text-center", isCompact ? "py-1.5" : "py-2")}>
                {canWrite && (
                  <input
                    type="checkbox"
                    checked={
                      filteredRfis.length > 0 && selectedIds.size === filteredRfis.length
                    }
                    onChange={toggleSelectAll}
                    className="h-3.5 w-3.5 rounded border-border"
                    title="Select all"
                  />
                )}
              </th>
              <th
                className={cn(
                  "w-32 px-2.5 font-semibold text-primary sticky left-0 bg-muted/95 backdrop-blur-md z-20",
                  isCompact ? "py-1.5" : "py-2"
                )}
              >
                RFI #
              </th>
              <th
                className={cn(
                  "px-3 font-semibold text-primary min-w-[220px]",
                  isCompact ? "py-1.5" : "py-2"
                )}
              >
                Subject & Location
              </th>
              <th
                className={cn(
                  "w-24 px-2 font-semibold text-primary text-center",
                  isCompact ? "py-1.5" : "py-2"
                )}
              >
                Discipline
              </th>
              <th
                className={cn(
                  "w-20 px-2 font-semibold text-primary text-center",
                  isCompact ? "py-1.5" : "py-2"
                )}
              >
                Priority
              </th>
              <th
                className={cn(
                  "w-32 px-2 font-semibold text-primary",
                  isCompact ? "py-1.5" : "py-2"
                )}
              >
                Linked Task / BOQ
              </th>
              <th
                className={cn(
                  "w-32 px-2 font-semibold text-primary",
                  isCompact ? "py-1.5" : "py-2"
                )}
              >
                Inspection Window
              </th>
              <th
                className={cn(
                  "w-24 px-2 font-semibold text-primary text-center",
                  isCompact ? "py-1.5" : "py-2"
                )}
              >
                Status
              </th>
              <th
                className={cn(
                  "w-24 px-2 font-semibold text-primary text-right",
                  isCompact ? "py-1.5" : "py-2"
                )}
              >
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/40">
            {filteredRfis.map((rfi, idx) => {
              const isSelected = selectedIds.has(rfi.id);
              const isUrgent = rfi.priority === "urgent";
              const inspStart = rfi.inspectionStartTime
                ? format(new Date(rfi.inspectionStartTime), "HH:mm")
                : null;
              const inspEnd = rfi.inspectionEndTime
                ? format(new Date(rfi.inspectionEndTime), "HH:mm")
                : null;
              const inspDate = rfi.workDate
                ? format(new Date(rfi.workDate), "MMM d, yyyy")
                : null;

              return (
                <tr
                  key={rfi.id}
                  className={cn(
                    "hover:bg-primary/5 transition-colors duration-150 cursor-pointer",
                    idx % 2 === 1 ? "bg-muted/15" : "bg-card",
                    isSelected && "bg-primary/10",
                    isUrgent && "border-l-2 border-l-destructive"
                  )}
                  onClick={(e) => {
                    const target = e.target as HTMLElement;
                    if (target.closest("input, button, a")) return;
                    setViewRfiId(rfi.id);
                  }}
                >
                  {/* Checkbox */}
                  <td className={cn("text-center", isCompact ? "py-1 px-1" : "py-2 px-1")}>
                    {canWrite && (
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleSelect(rfi.id)}
                        className="h-3.5 w-3.5 rounded border-border"
                      />
                    )}
                  </td>

                  {/* RFI # (Sticky Left) */}
                  <td
                    className={cn(
                      "font-mono font-bold whitespace-nowrap sticky left-0 bg-card/95 backdrop-blur-md z-10",
                      isCompact
                        ? "py-1 px-2.5 text-[11px]"
                        : "py-2 px-2.5 text-xs"
                    )}
                  >
                    <button
                      onClick={() => setViewRfiId(rfi.id)}
                      className="hover:underline text-primary text-left font-bold"
                    >
                      {rfi.number}
                    </button>
                  </td>

                  {/* Subject & Location */}
                  <td className={cn(isCompact ? "py-1 px-3" : "py-2 px-3")}>
                    <div className="flex flex-col">
                      <span
                        className={cn(
                          "font-medium text-foreground leading-snug line-clamp-2",
                          isCompact ? "text-[11px]" : "text-xs"
                        )}
                      >
                        {rfi.subject}
                      </span>
                      {rfi.location && (
                        <span className="text-[10px] text-muted-foreground flex items-center gap-1 mt-0.5 truncate">
                          <MapPin className="h-2.5 w-2.5 shrink-0" />
                          {rfi.location}
                        </span>
                      )}
                    </div>
                  </td>

                  {/* Discipline */}
                  <td
                    className={cn(
                      "text-center whitespace-nowrap",
                      isCompact ? "py-1 px-2" : "py-2 px-2"
                    )}
                  >
                    <span className="px-1.5 py-0.5 rounded border border-border/80 text-[10px] uppercase font-mono text-muted-foreground bg-muted/40">
                      {rfi.discipline || "General"}
                    </span>
                  </td>

                  {/* Priority */}
                  <td
                    className={cn(
                      "text-center whitespace-nowrap",
                      isCompact ? "py-1 px-2" : "py-2 px-2"
                    )}
                  >
                    <RfiPriorityBadge priority={rfi.priority} />
                  </td>

                  {/* Linked Task & BOQ */}
                  <td className={cn(isCompact ? "py-1 px-2" : "py-2 px-2")}>
                    <div className="flex flex-col gap-0.5">
                      {rfi.ganttTask ? (
                        <span
                          className="text-[10px] text-primary truncate flex items-center gap-1"
                          title={rfi.ganttTask.name}
                        >
                          <span className="font-bold">[{rfi.ganttTask.code ?? "T"}]</span>
                          <span className="truncate">{rfi.ganttTask.name}</span>
                        </span>
                      ) : (
                        <span className="text-[10px] text-muted-foreground">—</span>
                      )}
                      {rfi.boqItem && (
                        <span
                          className="text-[9px] text-muted-foreground font-mono truncate"
                          title={rfi.boqItem.description}
                        >
                          BOQ: {rfi.boqItem.code}
                        </span>
                      )}
                    </div>
                  </td>

                  {/* Inspection Window */}
                  <td
                    className={cn(
                      "text-xs whitespace-nowrap",
                      isCompact ? "py-1 px-2" : "py-2 px-2"
                    )}
                  >
                    {inspDate ? (
                      <div className="flex flex-col text-[10px]">
                        <span className="font-medium text-foreground">{inspDate}</span>
                        {(inspStart || inspEnd) && (
                          <span className="text-muted-foreground flex items-center gap-0.5">
                            <Clock className="h-2.5 w-2.5" />
                            {inspStart || "—"} - {inspEnd || "—"}
                          </span>
                        )}
                      </div>
                    ) : (
                      <span className="text-muted-foreground text-[10px]">—</span>
                    )}
                  </td>

                  {/* Status */}
                  <td
                    className={cn(
                      "text-center whitespace-nowrap",
                      isCompact ? "py-1 px-2" : "py-2 px-2"
                    )}
                  >
                    <RfiStatusBadge status={rfi.status} />
                  </td>

                  {/* Actions */}
                  <td
                    className={cn(
                      "text-right whitespace-nowrap",
                      isCompact ? "py-1 px-2" : "py-2 px-2"
                    )}
                  >
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 text-muted-foreground hover:text-primary hover:bg-primary/10"
                        onClick={() => setViewRfiId(rfi.id)}
                        title="View RFI"
                      >
                        <Eye className="h-3.5 w-3.5" />
                      </Button>
                      <Link
                        href={`/projects/${id}/workflow/rfi/${rfi.id}/pdf-designer`}
                        className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:text-primary hover:bg-primary/10"
                        title="PDF Designer"
                      >
                        <FileText className="h-3.5 w-3.5" />
                      </Link>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </MatrixPanel>
  );
}
