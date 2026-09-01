"use client";

import Link from "next/link";
import { format } from "date-fns";
import { Eye, FileText, Clock, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MatrixPanel } from "@/components/matrix/matrix-panel";
import { RfiStatusBadge, RfiPriorityBadge } from "@/components/workflow/badges";
import { ConstructionTable, ConstructionTableColumn } from "@/components/ui/construction-table";

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
  const columns: ConstructionTableColumn<any>[] = [
    {
      key: "number",
      header: "RFI #",
      render: (_, rfi) => (
        <button
          onClick={() => setViewRfiId(rfi.id)}
          className="hover:underline text-primary text-left font-mono font-bold text-xs"
        >
          {rfi.number}
        </button>
      ),
    },
    {
      key: "subject",
      header: "Subject & Location",
      render: (_, rfi) => (
        <div className="flex flex-col">
          <span className="font-medium text-foreground leading-snug line-clamp-2 text-xs">
            {rfi.subject}
          </span>
          {rfi.location && (
            <span className="text-[10px] text-muted-foreground flex items-center gap-1 mt-0.5 truncate">
              <MapPin className="h-2.5 w-2.5 shrink-0" />
              {rfi.location}
            </span>
          )}
        </div>
      ),
    },
    {
      key: "discipline",
      header: "Discipline",
      align: "center",
      render: (_, rfi) => (
        <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted/60 text-muted-foreground border border-border/40 font-mono">
          {rfi.discipline || "General"}
        </span>
      ),
    },
    {
      key: "priority",
      header: "Priority",
      align: "center",
      render: (_, rfi) => <RfiPriorityBadge priority={rfi.priority} />,
    },
    {
      key: "linkedTask",
      header: "Linked Task / BOQ",
      render: (_, rfi) => (
        <div className="text-[10px] space-y-0.5 truncate max-w-[140px]">
          {rfi.programTask && (
            <div className="text-muted-foreground truncate font-mono">
              Task: {rfi.programTask.name}
            </div>
          )}
          {rfi.boqItem && (
            <div className="text-muted-foreground/80 truncate font-mono">
              BOQ: {rfi.boqItem.code}
            </div>
          )}
          {!rfi.programTask && !rfi.boqItem && <span className="text-muted-foreground/40">—</span>}
        </div>
      ),
    },
    {
      key: "inspectionWindow",
      header: "Inspection Window",
      render: (_, rfi) => {
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
          <div className="text-[10px] font-mono">
            {inspDate ? (
              <div className="text-foreground font-medium">{inspDate}</div>
            ) : null}
            {inspStart && inspEnd ? (
              <div className="text-muted-foreground flex items-center gap-0.5">
                <Clock className="h-2.5 w-2.5 shrink-0" />
                {inspStart} - {inspEnd}
              </div>
            ) : !inspDate ? (
              <span className="text-muted-foreground/40">—</span>
            ) : null}
          </div>
        );
      },
    },
    {
      key: "status",
      header: "Status",
      align: "center",
      render: (_, rfi) => <RfiStatusBadge status={rfi.status} />,
    },
    {
      key: "actions",
      header: "Actions",
      align: "right",
      render: (_, rfi) => (
        <div className="flex items-center justify-end gap-1">
          <Button
            size="sm"
            variant="ghost"
            className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground"
            onClick={() => setViewRfiId(rfi.id)}
            title="View Details"
          >
            <Eye className="h-3.5 w-3.5" />
          </Button>
          <Link href={`/projects/${id}/workflow/rfi/${rfi.id}/pdf-designer`}>
            <Button
              size="sm"
              variant="ghost"
              className="h-6 w-6 p-0 text-muted-foreground hover:text-primary"
              title="PDF Designer"
            >
              <FileText className="h-3.5 w-3.5" />
            </Button>
          </Link>
        </div>
      ),
    },
  ];

  return (
    <MatrixPanel
      title={`Request for Information (${filteredRfis.length})`}
      className="print-area"
    >
      <ConstructionTable
        data={filteredRfis}
        columns={columns}
        selectable={canWrite}
        onRowClick={(row) => setViewRfiId(row.id)}
        searchPlaceholder="Search RFIs by number, subject, location..."
        searchFilterKeys={["number", "subject", "location", "discipline", "priority", "status"]}
      />
    </MatrixPanel>
  );
}
