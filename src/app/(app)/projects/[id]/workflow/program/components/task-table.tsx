"use client";

import Link from "next/link";
import { MapPin, Layers } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatNpr } from "@/lib/currency";
import { StatusBadge } from "@/components/ui/status-badge";
import { ConstructionTable, ConstructionTableColumn } from "@/components/ui/construction-table";

export type ProgramTask = {
  id: string;
  taskName: string;
  boqCode?: string | null;
  boqDesc?: string | null;
  location?: string | null;
  assignedTo?: string | null;
  plannedQty: number;
  actualQty?: number | null;
  unit?: string | null;
  paymentType: string;
  executionStatus: string;
  rfi?: { id: string; number: string } | null;
  ganttTask?: { id: string; code?: string | null; name: string } | null;
  boqItem?: {
    ingredients: Array<{
      name: string;
      type: string;
      quantity: number;
      unit: string;
      amount: number;
    }>;
  } | null;
};

export function TaskTable({ tasks, projectId }: { tasks: ProgramTask[]; projectId: string }) {
  const execStatusColors: Record<string, string> = {
    planned: "bg-muted/40 text-muted-foreground border-border/80",
    done: "bg-primary/10 text-primary border-primary/40",
    partially_completed: "bg-amber-500/10 text-amber-400 border-amber-500/40",
    uncompleted: "bg-destructive/10 text-destructive border-destructive/40",
    postponed: "bg-purple-500/10 text-purple-400 border-purple-500/40",
    cancelled: "bg-muted/30 text-muted-foreground/60 border-border/40",
  };

  const paymentColors: Record<string, string> = {
    payable: "bg-primary/10 text-primary border-primary/30",
    unpayable: "bg-destructive/10 text-destructive border-destructive/30",
    temporary: "bg-amber-500/10 text-amber-400 border-amber-500/30",
  };

  const columns: ConstructionTableColumn<ProgramTask>[] = [
    {
      key: "rfi",
      header: "RFI / Task",
      render: (_, t) => (
        <div className="flex flex-col gap-0.5 font-mono text-xs">
          {t.rfi ? (
            <Link
              href={`/projects/${projectId}/workflow/rfi`}
              className="font-bold text-primary hover:underline truncate"
              onClick={(e) => e.stopPropagation()}
            >
              {t.rfi.number}
            </Link>
          ) : (
            <span className="text-muted-foreground/60">—</span>
          )}
          {t.ganttTask && (
            <span className="text-[9px] text-muted-foreground truncate" title={t.ganttTask.name}>
              [{t.ganttTask.code ?? "T"}] {t.ganttTask.name}
            </span>
          )}
        </div>
      ),
    },
    {
      key: "taskName",
      header: "Description & BOQ",
      render: (_, t) => (
        <div className="flex flex-col">
          <span className="font-medium text-foreground leading-snug text-xs">{t.taskName}</span>
          {t.boqCode && (
            <span className="text-[10px] text-muted-foreground truncate font-mono" title={t.boqDesc ?? ""}>
              BOQ: {t.boqCode} {t.boqDesc ? `· ${t.boqDesc}` : ""}
            </span>
          )}
        </div>
      ),
    },
    {
      key: "location",
      header: "Location",
      render: (_, t) =>
        t.location ? (
          <span className="flex items-center gap-1 text-xs text-muted-foreground truncate">
            <MapPin className="h-3 w-3 shrink-0 text-muted-foreground/60" />
            {t.location}
          </span>
        ) : (
          <span className="text-muted-foreground/40 text-xs">—</span>
        ),
    },
    {
      key: "plannedQty",
      header: "Planned",
      align: "right",
      render: (_, t) => (
        <span className="font-bold font-mono text-foreground text-xs">{t.plannedQty}</span>
      ),
    },
    {
      key: "actualQty",
      header: "Actual",
      align: "right",
      render: (_, t) => (
        <span className="font-bold font-mono text-primary text-xs">
          {t.actualQty !== null && t.actualQty !== undefined ? t.actualQty : "—"}
        </span>
      ),
    },
    {
      key: "unit",
      header: "Unit",
      align: "center",
      render: (_, t) => (
        <span className="text-muted-foreground font-mono text-xs">{t.unit || "—"}</span>
      ),
    },
    {
      key: "paymentType",
      header: "Payment",
      align: "center",
      render: (_, t) => (
        <span
          className={cn(
            "px-1.5 py-0.5 rounded border text-[9px] uppercase font-bold font-mono",
            paymentColors[t.paymentType] || paymentColors.payable
          )}
        >
          {t.paymentType}
        </span>
      ),
    },
    {
      key: "executionStatus",
      header: "Status",
      align: "center",
      render: (_, t) => (
        <span
          className={cn(
            "px-1.5 py-0.5 rounded border text-[9px] uppercase font-bold font-mono",
            execStatusColors[t.executionStatus] || execStatusColors.planned
          )}
        >
          {t.executionStatus?.replace(/_/g, " ")}
        </span>
      ),
    },
  ];

  const renderRowPreview = (task: ProgramTask) => {
    const ingredients = task.boqItem?.ingredients || [];
    if (ingredients.length === 0) {
      return (
        <div className="p-4 text-center text-xs text-muted-foreground font-mono">
          No rate analysis ingredients configured for this task.
        </div>
      );
    }

    return (
      <div className="p-4 space-y-3 font-mono">
        <div className="flex items-center justify-between text-xs font-bold text-primary border-b pb-2">
          <span className="flex items-center gap-1.5 uppercase tracking-wide">
            <Layers className="h-4 w-4" />
            Rate Analysis Ingredients Breakdown
          </span>
          <span className="text-muted-foreground font-normal text-[11px]">
            Calculated for Planned Qty: {task.plannedQty} {task.unit}
          </span>
        </div>

        <div className="rounded border divide-y text-xs">
          <div className="grid grid-cols-6 p-2 bg-muted/40 font-bold text-[10px] text-muted-foreground uppercase">
            <span>Type</span>
            <span className="col-span-2">Resource Name</span>
            <span className="text-right">Coefficient</span>
            <span className="text-right">Total Qty</span>
            <span className="text-right">Estimated Cost</span>
          </div>
          {ingredients.map((ing, j) => {
            const totalQty = ing.quantity * task.plannedQty;
            const totalCost = ing.amount * task.plannedQty;
            return (
              <div key={j} className="grid grid-cols-6 p-2 hover:bg-muted/20 items-center">
                <span>
                  <span className="px-1.5 py-0.5 rounded text-[9px] uppercase bg-muted text-muted-foreground border">
                    {ing.type?.slice(0, 3) || "res"}
                  </span>
                </span>
                <span className="col-span-2 font-medium truncate">{ing.name}</span>
                <span className="text-right text-muted-foreground">{ing.quantity}</span>
                <span className="text-right font-bold text-foreground">
                  {totalQty.toFixed(2)} {ing.unit}
                </span>
                <span className="text-right font-bold text-primary">{formatNpr(totalCost)}</span>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <ConstructionTable
      data={tasks}
      columns={columns}
      renderRowPreview={renderRowPreview}
      rowPreviewTitle={(task) => `Task Details: ${task.taskName}`}
      searchPlaceholder="Search site tasks by name, BOQ, location..."
      searchFilterKeys={["taskName", "boqCode", "boqDesc", "location", "paymentType", "executionStatus"]}
    />
  );
}
