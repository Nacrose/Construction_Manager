"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc-client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Plus,
  Download,
  Trash2,
  RefreshCw,
} from "lucide-react";
import { cn } from "@/lib/utils";
import * as XLSX from "@e965/xlsx";
import { toast } from "sonner";
import { format } from "date-fns";
import { LogSpotHireDialog } from "../dialogs/log-spot-hire-dialog";
import { formatNpr } from "@/lib/currency";
import { ConstructionTable, ConstructionTableColumn } from "@/components/ui/construction-table";

export function SpotHireTab({
  projectId,
  canWrite = false,
}: {
  projectId: string;
  canWrite?: boolean;
}) {
  const [viewMode, setViewMode] = useState<"slips" | "statements">("slips");
  const [billedFilter, setBilledFilter] = useState<string>("all");
  const [addOpen, setAddOpen] = useState(false);

  const utils = trpc.useUtils();

  const { data, isLoading, refetch, isFetching } = trpc.equipment.listSpotHires.useQuery({
    projectId,
    isBilled: billedFilter === "all" ? undefined : billedFilter === "billed",
  });

  const { data: statementsData, isLoading: isStatementsLoading } =
    trpc.equipment.getVendorHireStatement.useQuery({ projectId });

  const { data: vendorList } = trpc.equipment.listVendors.useQuery({ projectId });
  const { data: boqData } = trpc.boq.list.useQuery({ projectId });

  const tickets = data?.tickets || [];
  const summary = data?.summary;
  const statements = statementsData?.statements || [];

  const deleteMut = trpc.equipment.deleteSpotTicket.useMutation({
    onSuccess: () => {
      toast.success("Spot ticket deleted");
      utils.equipment.listSpotHires.invalidate({ projectId });
      utils.equipment.getVendorHireStatement.invalidate({ projectId });
    },
    onError: (e) => toast.error(e.message),
  });

  const handleExportExcel = () => {
    if (!tickets.length) {
      toast.info("No spot tickets to export");
      return;
    }

    try {
      const headers = [
        "Slip #",
        "Date",
        "Vendor / Supplier",
        "Machine Name",
        "Plate / Reg No",
        "Type",
        "Basis",
        "Rate (NPR)",
        "Hours Worked",
        "Trip Count",
        "Mob. Fee (NPR)",
        "Gross (NPR)",
        "Fuel Mode",
        "Site Diesel (L)",
        "Diesel Debit (NPR)",
        "Net Due (NPR)",
        "BOQ Charge Code",
        "Remarks",
        "Billing Status",
      ];

      const exportRows = tickets.map((t) => ({
        "Slip #": t.slipNumber || "—",
        Date: format(new Date(t.date), "yyyy-MM-dd"),
        "Vendor / Supplier": t.vendorName,
        "Machine Name": t.machineName,
        "Plate / Reg No": t.registrationNo || "—",
        Type: t.equipmentType,
        Basis: t.hireType === "trip" ? "Per Trip" : "Hourly",
        "Rate (NPR)": t.rate,
        "Hours Worked": t.hireType === "hourly" ? t.hoursWorked : 0,
        "Trip Count": t.hireType === "trip" ? t.tripCount : 0,
        "Mob. Fee (NPR)": t.mobilizationFee,
        "Gross (NPR)": t.totalGross,
        "Fuel Mode": t.fuelMode === "with_fuel" ? "With Fuel" : "Dry (Site Fuel)",
        "Site Diesel (L)": t.fuelLitersIssued,
        "Diesel Debit (NPR)": t.fuelDeduction,

        "Net Due (NPR)": t.netPayable,
        "BOQ Charge Code": t.boqItem?.code || "—",
        Remarks: t.remarks || "",
        "Billing Status": t.isBilled ? "Billed" : "Unbilled",
      }));

      const ws = XLSX.utils.json_to_sheet(exportRows, { header: headers });
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Spot Machinery Slips");

      XLSX.writeFile(wb, `Spot_Hire_Register_${projectId}.xlsx`);
      toast.success("Spot hire tickets exported to Excel");
    } catch (e: any) {
      toast.error(e.message || "Failed to export spot tickets");
    }
  };

  const slipColumns: ConstructionTableColumn<any>[] = [
    {
      key: "date",
      header: "Date",
      render: (_, t) => (
        <span className="text-muted-foreground font-mono text-xs">
          {format(new Date(t.date), "dd MMM")}
        </span>
      ),
    },
    {
      key: "vendorName",
      header: "Vendor / Supplier",
      render: (_, t) => (
        <div>
          <span className="font-sans font-medium text-foreground">{t.vendorName}</span>
          {t.vendorPhone && (
            <span className="block text-[10px] text-muted-foreground font-mono">
              {t.vendorPhone}
            </span>
          )}
        </div>
      ),
    },
    {
      key: "machineName",
      header: "Machine & Plate",
      render: (_, t) => (
        <div>
          <span className="font-semibold text-foreground">{t.machineName}</span>
          {t.registrationNo && (
            <span className="block text-[10px] text-muted-foreground font-mono">
              {t.registrationNo}
            </span>
          )}
        </div>
      ),
    },
    {
      key: "duration",
      header: "Duration",
      align: "right",
      render: (_, t) => (
        <span className="font-bold text-blue-600 font-mono text-xs">
          {t.hireType === "trip" ? `${t.tripCount} tr` : `${t.hoursWorked}h`}
        </span>
      ),
    },
    {
      key: "rate",
      header: "Rate",
      align: "right",
      render: (_, t) => (
        <span className="text-muted-foreground font-mono text-xs">{formatNpr(t.rate)}</span>
      ),
    },
    {
      key: "totalGross",
      header: "Gross",
      align: "right",
      render: (_, t) => (
        <span className="font-mono text-xs">{formatNpr(t.totalGross)}</span>
      ),
    },
    {
      key: "fuelDeduction",
      header: "Fuel Debit",
      align: "right",
      render: (_, t) => (
        <span
          className={cn(
            "font-mono text-xs",
            t.fuelDeduction > 0 ? "text-amber-600 font-bold" : "text-muted-foreground"
          )}
        >
          {t.fuelDeduction > 0 ? `-${formatNpr(t.fuelDeduction)}` : "—"}
        </span>
      ),
    },
    {
      key: "netPayable",
      header: "Net Due",
      align: "right",
      render: (_, t) => (
        <span className="font-bold font-mono text-emerald-700 dark:text-emerald-300 text-xs">
          {formatNpr(t.netPayable)}
        </span>
      ),
    },
    {
      key: "boqCode",
      header: "Charge Code",
      render: (_, t) => (
        <span
          className="text-muted-foreground text-xs truncate max-w-[140px] block"
          title={t.boqItem ? `${t.boqItem.code} - ${t.boqItem.description}` : t.remarks || ""}
        >
          {t.boqItem?.code || t.remarks || "—"}
        </span>
      ),
    },
    {
      key: "status",
      header: "Status",
      align: "center",
      render: (_, t) => (
        <Badge
          variant="secondary"
          className={cn("text-[9px] px-1.5 py-0 capitalize font-mono", {
            "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 font-bold":
              t.isBilled,
            "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300": !t.isBilled,
          })}
        >
          {t.isBilled ? "Billed" : "Unbilled"}
        </Badge>
      ),
    },
    {
      key: "actions",
      header: "Actions",
      align: "right",
      render: (_, t) => {
        if (t.isBilled || !canWrite) return null;
        return (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => deleteMut.mutate({ ticketId: t.id, projectId })}
            disabled={deleteMut.isPending}
            className="h-5 w-5 p-0 text-red-500 hover:bg-red-50 dark:hover:bg-red-950"
          >
            <Trash2 className="h-3 w-3" />
          </Button>
        );
      },
    },
  ];

  const statementColumns: ConstructionTableColumn<any>[] = [
    {
      key: "vendorName",
      header: "Vendor / Supplier",
      render: (_, v) => (
        <div>
          <span className="font-sans font-semibold text-foreground">{v.vendorName}</span>
          {v.vendorPhone && (
            <span className="block text-[10px] text-muted-foreground font-mono font-normal">
              {v.vendorPhone}
            </span>
          )}
        </div>
      ),
    },
    {
      key: "ticketCount",
      header: "Slips Count",
      align: "right",
      render: (_, v) => (
        <span className="font-bold text-foreground font-mono text-xs">{v.ticketCount} slips</span>
      ),
    },
    {
      key: "totalHours",
      header: "Total Hours",
      align: "right",
      render: (_, v) => (
        <span className="font-mono text-blue-600 font-semibold text-xs">
          {v.totalHours.toFixed(1)} hrs
        </span>
      ),
    },
    {
      key: "totalTrips",
      header: "Total Trips",
      align: "right",
      render: (_, v) => (
        <span className="font-mono text-muted-foreground text-xs">
          {v.totalTrips > 0 ? `${v.totalTrips}` : "—"}
        </span>
      ),
    },
    {
      key: "totalGross",
      header: "Total Gross",
      align: "right",
      render: (_, v) => (
        <span className="font-mono text-xs">{formatNpr(v.totalGross)}</span>
      ),
    },
    {
      key: "totalFuelDeductions",
      header: "Site Diesel Debits",
      align: "right",
      render: (_, v) => (
        <span className="font-mono text-amber-600 text-xs">
          {v.totalFuelDeductions > 0 ? `-${formatNpr(v.totalFuelDeductions)}` : "—"}
        </span>
      ),
    },
    {
      key: "netPayable",
      header: "Total Incurred",
      align: "right",
      render: (_, v) => (
        <span className="font-mono font-semibold text-foreground text-xs">
          {formatNpr(v.netPayable)}
        </span>
      ),
    },
    {
      key: "unbilledAmount",
      header: "Unbilled Payable",
      align: "right",
      render: (_, v) => (
        <span className="font-bold font-mono text-emerald-700 dark:text-emerald-300 text-xs">
          {formatNpr(v.unbilledAmount)}
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-3">
      {/* Controls Ribbon */}
      <div className="flex flex-wrap items-center justify-between gap-2 p-2 bg-muted/30 rounded-md border text-xs">
        <div className="flex flex-1 flex-wrap items-center gap-2">
          {/* Mode Tabs */}
          <div className="flex items-center gap-1 bg-background p-0.5 rounded border font-mono">
            <Button
              size="sm"
              variant={viewMode === "slips" ? "default" : "ghost"}
              onClick={() => setViewMode("slips")}
              className="h-6 text-xs px-2.5"
            >
              Daily Slips ({tickets.length})
            </Button>
            <Button
              size="sm"
              variant={viewMode === "statements" ? "default" : "ghost"}
              onClick={() => setViewMode("statements")}
              className="h-6 text-xs px-2.5"
            >
              Vendor Summary ({statements.length})
            </Button>
          </div>

          {viewMode === "slips" && (
            <Select value={billedFilter} onValueChange={setBilledFilter}>
              <SelectTrigger className="h-7 w-28 text-xs font-mono">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Slips</SelectItem>
                <SelectItem value="unbilled">Unbilled</SelectItem>
                <SelectItem value="billed">Billed</SelectItem>
              </SelectContent>
            </Select>
          )}

          <Button
            size="sm"
            variant="ghost"
            onClick={() => refetch()}
            className="h-7 w-7 p-0"
            title="Refresh"
          >
            <RefreshCw className={cn("h-3 w-3", isFetching && "animate-spin")} />
          </Button>
        </div>

        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={handleExportExcel}
            disabled={tickets.length === 0}
            className="h-7 text-xs gap-1.5 font-mono"
          >
            <Download className="h-3 w-3" />
            Export (.xlsx)
          </Button>

          {canWrite && (
            <Button
              size="sm"
              onClick={() => setAddOpen(true)}
              className="h-7 text-xs gap-1 font-mono bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              <Plus className="h-3 w-3" />
              Log Spot Ticket
            </Button>
          )}
        </div>
      </div>

      {/* Aggregate Stats Summary */}
      {summary && (
        <div className="flex flex-wrap items-center justify-between gap-2 px-2.5 py-1.5 bg-muted/20 rounded border text-[11px] font-mono">
          <div className="flex items-center gap-3">
            <span className="text-muted-foreground font-semibold">
              <strong className="text-foreground">Total Tickets:</strong> {summary.totalTickets}
            </span>
            <span className="text-muted-foreground/40">│</span>
            <span className="text-blue-600 dark:text-blue-400 font-semibold">
              {summary.totalHours.toFixed(1)} hrs
            </span>
            <span className="text-muted-foreground/40">│</span>
            <span>Gross: {formatNpr(summary.totalGross)}</span>
            {summary.totalFuelDeductions > 0 && (
              <>
                <span className="text-muted-foreground/40">│</span>
                <span className="text-amber-600 dark:text-amber-400 font-medium">
                  Fuel Debits: -{formatNpr(summary.totalFuelDeductions)}
                </span>
              </>
            )}
          </div>

          <div>
            <span className="text-emerald-700 dark:text-emerald-300 font-bold">
              💰 Unbilled Outstanding: {formatNpr(summary.unbilledAmount)}
            </span>
          </div>
        </div>
      )}

      {/* Central Table Engine Rendering */}
      {viewMode === "slips" ? (
        <ConstructionTable
          data={tickets}
          columns={slipColumns}
          isLoading={isLoading}
          searchPlaceholder="Search spot tickets by vendor, machine, registration..."
          searchFilterKeys={["vendorName", "machineName", "registrationNo", "equipmentType", "remarks"]}
        />
      ) : (
        <ConstructionTable
          data={statements}
          columns={statementColumns}
          isLoading={isStatementsLoading}
          searchPlaceholder="Search vendor statements..."
          searchFilterKeys={["vendorName", "vendorPhone"]}
        />
      )}

      {/* Log Spot Ticket Modal */}
      <LogSpotHireDialog
        projectId={projectId}
        open={addOpen}
        onOpenChange={setAddOpen}
        existingVendors={vendorList?.vendors || []}
        boqItems={boqData?.items || []}
        onSuccess={() => {
          utils.equipment.listSpotHires.invalidate({ projectId });
          utils.equipment.getVendorHireStatement.invalidate({ projectId });
          utils.equipment.listVendors.invalidate({ projectId });
        }}
      />
    </div>
  );
}
