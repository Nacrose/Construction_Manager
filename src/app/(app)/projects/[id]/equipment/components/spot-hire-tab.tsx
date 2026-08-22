"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  Search,
  Download,
  Trash2,
  CheckCircle2,
  Clock,
  Fuel,
  Loader2,
  RefreshCw,
  Building,
} from "lucide-react";
import { cn } from "@/lib/utils";
import * as XLSX from "xlsx";
import { toast } from "sonner";
import { format } from "date-fns";
import { LogSpotHireDialog } from "../dialogs/log-spot-hire-dialog";

export function SpotHireTab({
  projectId,
  canWrite = false,
}: {
  projectId: string;
  canWrite?: boolean;
}) {
  const [viewMode, setViewMode] = useState<"slips" | "statements">("slips");
  const [search, setSearch] = useState("");
  const [billedFilter, setBilledFilter] = useState<string>("all");
  const [addOpen, setAddOpen] = useState(false);

  const utils = trpc.useUtils();

  const { data, isLoading, refetch, isFetching } = trpc.equipment.listSpotHires.useQuery({
    projectId,
    vendorName: search || undefined,
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

      const rows = tickets.map((t) => ({
        "Slip #": t.slipNumber || t.id.slice(-6),
        Date: format(new Date(t.date), "yyyy-MM-dd"),
        "Vendor / Supplier": t.vendorName,
        "Machine Name": t.machineName,
        "Plate / Reg No": t.registrationNo || "",
        Type: t.equipmentType,
        Basis: t.hireType,
        "Rate (NPR)": t.rate,
        "Hours Worked": t.hoursWorked,
        "Trip Count": t.tripCount,
        "Mob. Fee (NPR)": t.mobilizationFee,
        "Gross (NPR)": t.totalGross,
        "Fuel Mode": t.fuelMode,
        "Site Diesel (L)": t.fuelLitersIssued,
        "Diesel Debit (NPR)": t.fuelDeduction,
        "Net Due (NPR)": t.netPayable,
        "BOQ Charge Code": t.boqItem?.code || "",
        Remarks: t.remarks || "",
        "Billing Status": t.isBilled ? "Billed" : "Unbilled",
      }));

      const ws = XLSX.utils.json_to_sheet(rows, { header: headers });
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Spot Machine Slips");

      const colWidths = headers.map((h) => ({ wch: Math.max(h.length + 2, 12) }));
      ws["!cols"] = colWidths;

      XLSX.writeFile(wb, `spot-equipment-slips-${format(new Date(), "yyyy-MM-dd")}.xlsx`);
      toast.success("Spot slips exported successfully");
    } catch {
      toast.error("Failed to export Excel");
    }
  };

  return (
    <div className="space-y-2.5">
      {/* Dense Controls & View Mode Ribbon */}
      <div className="flex flex-wrap items-center justify-between gap-2 p-2 bg-muted/30 rounded-md border text-xs">
        <div className="flex flex-wrap items-center gap-2 flex-1">
          {/* View Mode Toggle */}
          <div className="inline-flex rounded-md border bg-card p-0.5 text-xs">
            <button
              type="button"
              onClick={() => setViewMode("slips")}
              className={cn(
                "px-2.5 py-1 rounded text-xs font-semibold transition-colors",
                viewMode === "slips"
                  ? "bg-primary text-primary-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              All Machine Slips ({tickets.length})
            </button>
            <button
              type="button"
              onClick={() => setViewMode("statements")}
              className={cn(
                "px-2.5 py-1 rounded text-xs font-semibold transition-colors",
                viewMode === "statements"
                  ? "bg-primary text-primary-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              Vendor Summary ({statements.length})
            </button>
          </div>

          <div className="relative min-w-[160px] max-w-xs flex-1">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
            <Input
              placeholder="Search vendor or machine..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-7 text-xs pl-7"
            />
          </div>

          <Select value={billedFilter} onValueChange={setBilledFilter}>
            <SelectTrigger className="h-7 w-28 text-xs bg-card">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Slips</SelectItem>
              <SelectItem value="unbilled">Unbilled</SelectItem>
              <SelectItem value="billed">Billed</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-1.5">
          <Button
            size="sm"
            variant="outline"
            onClick={() => refetch()}
            disabled={isFetching}
            className="h-7 text-xs gap-1 px-2"
          >
            <RefreshCw className={cn("h-3 w-3", isFetching && "animate-spin")} />
          </Button>

          <Button
            size="sm"
            variant="outline"
            onClick={handleExportExcel}
            className="h-7 text-xs text-emerald-700 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800 gap-1 px-2.5"
          >
            <Download className="h-3 w-3" /> Export Excel
          </Button>

          {canWrite && (
            <Button
              size="sm"
              onClick={() => setAddOpen(true)}
              className="h-7 text-xs bg-primary hover:bg-primary/90 text-primary-foreground font-semibold gap-1 px-3 shadow-xs"
            >
              <Plus className="h-3 w-3" /> Log Spot Ticket
            </Button>
          )}
        </div>
      </div>

      {/* Slim 28px High-Density Inline Metrics Ribbon */}
      {summary && (
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-3 py-1.5 bg-muted/40 rounded border text-[11px] font-mono tabular-nums">
          <div className="flex items-center gap-3">
            <span>
              <strong className="text-foreground">Total Tickets:</strong> {summary.totalTickets}
            </span>
            <span className="text-muted-foreground/40">│</span>
            <span className="text-blue-600 dark:text-blue-400 font-semibold">
              ⏱ Total Hours: {summary.totalHours.toFixed(1)}h {summary.totalTrips > 0 ? `+ ${summary.totalTrips} trips` : ""}
            </span>
            <span className="text-muted-foreground/40">│</span>
            <span>
              Gross: NPR {summary.totalGross.toLocaleString("en-IN", { maximumFractionDigits: 0 })}
            </span>
            {summary.totalFuelDeductions > 0 && (
              <>
                <span className="text-muted-foreground/40">│</span>
                <span className="text-amber-600 dark:text-amber-400 font-medium">
                  Fuel Debits: -NPR {summary.totalFuelDeductions.toLocaleString("en-IN", { maximumFractionDigits: 0 })}
                </span>
              </>
            )}
          </div>

          <div>
            <span className="text-emerald-700 dark:text-emerald-300 font-bold">
              💰 Unbilled Outstanding: NPR {summary.unbilledAmount.toLocaleString("en-IN", { maximumFractionDigits: 0 })}
            </span>
          </div>
        </div>
      )}

      {/* View Mode: All Individual Slips Table */}
      {viewMode === "slips" && (
        <div className="overflow-x-auto rounded border border-border/80 max-h-[calc(100vh-210px)]">
          <table className="w-full text-xs font-mono tabular-nums border-collapse">
            <thead className="sticky top-0 z-10 bg-muted/90 backdrop-blur-xs border-b text-[10px] text-muted-foreground uppercase">
              <tr>
                <th className="py-2 px-3 text-left w-20">Date</th>
                <th className="py-2 px-3 text-left min-w-[140px] font-semibold text-foreground">Vendor / Supplier</th>
                <th className="py-2 px-3 text-left min-w-[150px]">Machine &amp; Plate</th>
                <th className="py-2 px-2 text-right w-16">Duration</th>
                <th className="py-2 px-2 text-right w-20">Rate</th>
                <th className="py-2 px-2 text-right w-20">Gross (NPR)</th>
                <th className="py-2 px-2 text-right w-20 text-amber-600">Fuel Debit</th>
                <th className="py-2 px-3 text-right w-24 font-bold text-foreground bg-emerald-50/20 dark:bg-emerald-950/10">
                  Net Due
                </th>
                <th className="py-2 px-3 text-left min-w-[120px]">Charge Code</th>
                <th className="py-2 px-2 text-center w-20">Status</th>
                <th className="py-2 px-2 text-right w-14">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40">
              {isLoading ? (
                <tr>
                  <td colSpan={11} className="p-8 text-center text-muted-foreground">
                    <Loader2 className="h-5 w-5 animate-spin mx-auto mb-1.5 text-primary" />
                    Loading spot hire tickets...
                  </td>
                </tr>
              ) : tickets.length === 0 ? (
                <tr>
                  <td colSpan={11} className="p-8 text-center text-muted-foreground">
                    No spot equipment tickets found. Click &quot;Log Spot Ticket&quot; to add on-demand machinery.
                  </td>
                </tr>
              ) : (
                tickets.map((t) => (
                  <tr key={t.id} className="hover:bg-muted/20 transition-colors">
                    <td className="py-1.5 px-3 text-muted-foreground text-[11px]">
                      {format(new Date(t.date), "dd MMM")}
                    </td>

                    <td className="py-1.5 px-3 font-sans font-medium text-foreground">
                      {t.vendorName}
                      {t.vendorPhone && (
                        <span className="block text-[10px] text-muted-foreground font-mono">
                          {t.vendorPhone}
                        </span>
                      )}
                    </td>

                    <td className="py-1.5 px-3 font-sans">
                      <span className="font-semibold text-foreground">{t.machineName}</span>
                      {t.registrationNo && (
                        <span className="block text-[10px] text-muted-foreground font-mono">
                          {t.registrationNo}
                        </span>
                      )}
                    </td>

                    <td className="py-1.5 px-2 text-right font-bold text-blue-600">
                      {t.hireType === "trip" ? `${t.tripCount} tr` : `${t.hoursWorked}h`}
                    </td>

                    <td className="py-1.5 px-2 text-right text-muted-foreground">
                      {t.rate.toLocaleString()}
                    </td>

                    <td className="py-1.5 px-2 text-right font-mono">
                      {t.totalGross.toLocaleString()}
                    </td>

                    <td className={cn("py-1.5 px-2 text-right font-mono", t.fuelDeduction > 0 ? "text-amber-600 font-bold" : "text-muted-foreground")}>
                      {t.fuelDeduction > 0 ? `-${t.fuelDeduction.toLocaleString()}` : "—"}
                    </td>

                    <td className="py-1.5 px-3 text-right font-bold font-mono text-emerald-700 dark:text-emerald-300 bg-emerald-50/20 dark:bg-emerald-950/10">
                      NPR {t.netPayable.toLocaleString()}
                    </td>

                    <td className="py-1.5 px-3 text-muted-foreground text-[10px] truncate max-w-[140px]" title={t.boqItem ? `${t.boqItem.code} - ${t.boqItem.description}` : t.remarks || ""}>
                      {t.boqItem?.code || t.remarks || "—"}
                    </td>

                    <td className="py-1.5 px-2 text-center">
                      <Badge
                        variant="secondary"
                        className={cn("text-[9px] px-1.5 py-0 capitalize", {
                          "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 font-bold": t.isBilled,
                          "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300": !t.isBilled,
                        })}
                      >
                        {t.isBilled ? "Billed" : "Unbilled"}
                      </Badge>
                    </td>

                    <td className="py-1.5 px-2 text-right">
                      {!t.isBilled && canWrite && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => deleteMut.mutate({ ticketId: t.id, projectId })}
                          disabled={deleteMut.isPending}
                          className="h-5 w-5 p-0 text-red-500 hover:bg-red-50 dark:hover:bg-red-950"
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* View Mode: Cumulative Vendor Statements Table */}
      {viewMode === "statements" && (
        <div className="overflow-x-auto rounded border border-border/80 max-h-[calc(100vh-210px)]">
          <table className="w-full text-xs font-mono tabular-nums border-collapse">
            <thead className="sticky top-0 z-10 bg-muted/90 backdrop-blur-xs border-b text-[10px] text-muted-foreground uppercase">
              <tr>
                <th className="py-2 px-3 text-left min-w-[180px] font-semibold text-foreground">Vendor / Supplier</th>
                <th className="py-2 px-2 text-right w-20">Slips Count</th>
                <th className="py-2 px-2 text-right w-24">Total Hours</th>
                <th className="py-2 px-2 text-right w-20">Total Trips</th>
                <th className="py-2 px-3 text-right w-28">Total Gross (NPR)</th>
                <th className="py-2 px-3 text-right w-28 text-amber-600">Site Diesel Debits</th>
                <th className="py-2 px-3 text-right w-28 font-bold text-foreground">Total Incurred</th>
                <th className="py-2 px-3 text-right w-32 font-bold text-emerald-700 dark:text-emerald-300 bg-emerald-50/20 dark:bg-emerald-950/10">
                  Unbilled Payable
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40">
              {isStatementsLoading ? (
                <tr>
                  <td colSpan={8} className="p-8 text-center text-muted-foreground">
                    <Loader2 className="h-5 w-5 animate-spin mx-auto mb-1.5 text-primary" />
                    Calculating cumulative vendor statements...
                  </td>
                </tr>
              ) : statements.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-8 text-center text-muted-foreground">
                    No vendor spot hire statements recorded.
                  </td>
                </tr>
              ) : (
                statements.map((v) => (
                  <tr key={v.vendorName} className="hover:bg-muted/20 transition-colors">
                    <td className="py-2 px-3 font-sans font-semibold text-foreground">
                      {v.vendorName}
                      {v.vendorPhone && (
                        <span className="block text-[10px] text-muted-foreground font-mono font-normal">
                          {v.vendorPhone}
                        </span>
                      )}
                    </td>

                    <td className="py-2 px-2 text-right font-bold text-foreground">
                      {v.ticketCount} slips
                    </td>

                    <td className="py-2 px-2 text-right font-mono text-blue-600 font-semibold">
                      {v.totalHours.toFixed(1)} hrs
                    </td>

                    <td className="py-2 px-2 text-right font-mono text-muted-foreground">
                      {v.totalTrips > 0 ? `${v.totalTrips}` : "—"}
                    </td>

                    <td className="py-2 px-3 text-right font-mono">
                      NPR {v.totalGross.toLocaleString()}
                    </td>

                    <td className="py-2 px-3 text-right font-mono text-amber-600">
                      {v.totalFuelDeductions > 0 ? `-NPR ${v.totalFuelDeductions.toLocaleString()}` : "—"}
                    </td>

                    <td className="py-2 px-3 text-right font-mono font-semibold text-foreground">
                      NPR {v.netPayable.toLocaleString()}
                    </td>

                    <td className="py-2 px-3 text-right font-bold font-mono text-emerald-700 dark:text-emerald-300 text-sm bg-emerald-50/20 dark:bg-emerald-950/10">
                      NPR {v.unbilledAmount.toLocaleString()}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
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
