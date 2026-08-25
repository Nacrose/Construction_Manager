"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Download,
  CheckCircle2,
  Lock,
  Award,
  Banknote,
  FileText,
  Printer,
  Loader2,
  RefreshCw,
} from "lucide-react";
import { cn } from "@/lib/utils";
import * as XLSX from "@e965/xlsx";
import { toast } from "sonner";
import { format } from "date-fns";

export function PayrollManagementTab({
  projectId,
  isAdmin = false,
}: {
  projectId: string;
  isAdmin?: boolean;
}) {
  const [selectedMonth, setSelectedMonth] = useState<string>(() => {
    return format(new Date(), "yyyy-MM");
  });
  const [selectedPayslip, setSelectedPayslip] = useState<any | null>(null);

  const utils = trpc.useUtils();

  const { data, isLoading, refetch, isFetching } = trpc.payroll.calculate.useQuery({
    projectId,
    month: selectedMonth,
  });

  const payrollItems = data?.payrollItems || [];
  const summary = data?.summary;
  const existingRun = data?.existingRun;

  const createRunMut = trpc.payroll.createPayrollRun.useMutation({
    onSuccess: () => {
      toast.success("Payroll run created & advances locked");
      utils.payroll.calculate.invalidate({ projectId, month: selectedMonth });
    },
    onError: (e) => toast.error(e.message),
  });

  const updateStatusMut = trpc.payroll.updateRunStatus.useMutation({
    onSuccess: (_res, vars) => {
      toast.success(
        vars.action === "approve"
          ? "Payroll approved"
          : vars.action === "disburse"
          ? "Payroll marked as disbursed"
          : "Payroll reopened"
      );
      utils.payroll.calculate.invalidate({ projectId, month: selectedMonth });
    },
    onError: (e) => toast.error(e.message),
  });

  const handleGenerateRun = () => {
    if (!payrollItems.length) return;

    createRunMut.mutate({
      projectId,
      month: selectedMonth,
      records: payrollItems.map((item) => ({
        staffId: item.staffId,
        employmentType: item.employmentType,
        presentDays: item.presentDays,
        halfDays: item.halfDays,
        absentDays: item.absentDays,
        leaveDays: item.leaveDays,
        overtimeHours: item.overtimeHours,
        baseRate: item.baseRate,
        regularPay: item.regularPay,
        overtimePay: item.overtimePay,
        allowances: item.allowances,
        advanceDeduction: item.advanceDeduction,
        messDeduction: item.messDeduction,
        otherDeductions: item.otherDeductions,
        tdsAmount: item.tdsAmount,
        netPayable: item.netPayable,
      })),
    });
  };

  const handleExportExcel = () => {
    if (!payrollItems.length) {
      toast.info("No payroll data to export");
      return;
    }

    try {
      const headers = [
        "Staff Name",
        "Designation",
        "Category",
        "Gang / Team",
        "Employment Type",
        "Base Rate / Salary (NPR)",
        "Present Days",
        "Half Days",
        "Absent Days",
        "OT Hours",
        "Regular Pay (NPR)",
        "Overtime Pay (NPR)",
        "Allowances (NPR)",
        "Total Gross (NPR)",
        "Advance Recovery (NPR)",
        "Mess Deduction (NPR)",
        "TDS (1%) (NPR)",
        "Net Payable (NPR)",
        "Bank Account",
        "Bank Name",
        "PAN",
      ];

      const exportRows = payrollItems.map((item) => ({
        "Staff Name": item.staffName,
        Designation: item.designation || "",
        Category: item.category || "",
        "Gang / Team": item.gangName || "",
        "Employment Type": item.employmentType,
        "Base Rate / Salary (NPR)": item.baseRate,
        "Present Days": item.presentDays,
        "Half Days": item.halfDays,
        "Absent Days": item.absentDays,
        "OT Hours": item.overtimeHours,
        "Regular Pay (NPR)": item.regularPay,
        "Overtime Pay (NPR)": item.overtimePay,
        "Allowances (NPR)": item.allowances,
        "Total Gross (NPR)": item.gross,
        "Advance Recovery (NPR)": item.advanceDeduction,
        "Mess Deduction (NPR)": item.messDeduction,
        "TDS (1%) (NPR)": item.tdsAmount,
        "Net Payable (NPR)": item.netPayable,
        "Bank Account": item.bankAccountNo || "",
        "Bank Name": item.bankName || "",
        PAN: item.pan || "",
      }));

      const ws = XLSX.utils.json_to_sheet(exportRows, { header: headers });
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, `Payroll ${selectedMonth}`);

      const colWidths = headers.map((h) => ({ wch: Math.max(h.length + 2, 12) }));
      ws["!cols"] = colWidths;

      XLSX.writeFile(wb, `payroll-wage-sheet-${selectedMonth}.xlsx`);
      toast.success("Payroll sheet exported successfully");
    } catch {
      toast.error("Failed to export Excel");
    }
  };

  return (
    <div className="space-y-2.5">
      {/* Dense Controls & Lifecycle Ribbon */}
      <div className="flex flex-wrap items-center justify-between gap-2 p-2 bg-muted/30 rounded-md border text-xs">
        <div className="flex items-center gap-2.5">
          <div className="flex items-center gap-1.5">
            <span className="font-semibold text-muted-foreground">Month:</span>
            <Input
              type="month"
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="h-7 text-xs font-mono font-bold w-36"
            />
          </div>

          {existingRun ? (
            <Badge
              variant="secondary"
              className={cn("text-[9px] px-1.5 py-0 font-bold uppercase gap-1", {
                "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300": existingRun.status === "draft",
                "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300": existingRun.status === "approved",
                "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300": existingRun.status === "disbursed",
              })}
            >
              {existingRun.status === "disbursed" ? <CheckCircle2 className="h-2.5 w-2.5" /> : <Lock className="h-2.5 w-2.5" />}
              {existingRun.status} Run
            </Badge>
          ) : (
            <Badge variant="outline" className="text-[9px] px-1.5 py-0 text-muted-foreground">
              Live Preview
            </Badge>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center gap-1.5">
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
            <Download className="h-3 w-3" />
            Export Excel
          </Button>

          {(!existingRun || existingRun.status === "draft") && (
            <Button
              size="sm"
              onClick={handleGenerateRun}
              disabled={createRunMut.isPending || !payrollItems.length}
              className="h-7 text-xs bg-primary hover:bg-primary/90 text-primary-foreground font-semibold gap-1 px-3 shadow-xs"
            >
              {createRunMut.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Lock className="h-3 w-3" />}
              {existingRun ? "Update Run" : "Lock & Save Run"}
            </Button>
          )}

          {existingRun?.status === "draft" && isAdmin && (
            <Button
              size="sm"
              onClick={() => updateStatusMut.mutate({ projectId, runId: existingRun.id, action: "approve" })}
              disabled={updateStatusMut.isPending}
              className="h-7 text-xs bg-blue-600 hover:bg-blue-700 text-white font-semibold gap-1 px-2.5"
            >
              <Award className="h-3 w-3" /> PM Approve
            </Button>
          )}

          {existingRun?.status === "approved" && isAdmin && (
            <Button
              size="sm"
              onClick={() => updateStatusMut.mutate({ projectId, runId: existingRun.id, action: "disburse" })}
              disabled={updateStatusMut.isPending}
              className="h-7 text-xs bg-emerald-600 hover:bg-emerald-700 text-white font-semibold gap-1 px-2.5"
            >
              <Banknote className="h-3 w-3" /> Mark Disbursed
            </Button>
          )}
        </div>
      </div>

      {/* Slim 28px High-Density Inline Financial Summary Ribbon */}
      {summary && (
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-3 py-1.5 bg-muted/40 rounded border text-[11px] font-mono tabular-nums">
          <div className="flex items-center gap-3">
            <span>
              <strong className="text-foreground">Workforce:</strong> {summary.totalStaff}
            </span>
            <span className="text-muted-foreground/40">│</span>
            <span className="text-blue-600 dark:text-blue-400 font-semibold">
              Gross: NPR {summary.totalGross.toLocaleString("en-IN", { maximumFractionDigits: 0 })}
            </span>
            <span className="text-muted-foreground/40">│</span>
            <span className="text-amber-600 dark:text-amber-400">
              Advances: -{summary.totalAdvanceRecoveries.toLocaleString("en-IN", { maximumFractionDigits: 0 })}
            </span>
            <span className="text-muted-foreground/40">│</span>
            <span className="text-slate-600 dark:text-slate-400">
              Mess/TDS: -{(summary.totalMessDeductions + summary.totalTds).toLocaleString("en-IN", { maximumFractionDigits: 0 })}
            </span>
          </div>

          <div>
            <span className="text-emerald-700 dark:text-emerald-300 font-extrabold text-xs">
              💰 Total Net Payable: NPR {summary.grandTotal.toLocaleString("en-IN", { maximumFractionDigits: 0 })}
            </span>
          </div>
        </div>
      )}

      {/* Full-Bleed Payroll Line Items Table */}
      <div className="overflow-x-auto rounded border border-border/80 max-h-[calc(100vh-210px)]">
        <table className="w-full text-xs font-mono tabular-nums border-collapse">
          <thead className="sticky top-0 z-10 bg-muted/90 backdrop-blur-xs border-b text-[10px] text-muted-foreground uppercase">
            <tr>
              <th className="py-2 px-3 text-left min-w-[160px] font-semibold text-foreground">Worker Name</th>
              <th className="py-2 px-2 text-left w-16">Track</th>
              <th className="py-2 px-2 text-right w-14">Days</th>
              <th className="py-2 px-2 text-right w-14">OT(h)</th>
              <th className="py-2 px-2 text-right w-20">Base Rate</th>
              <th className="py-2 px-2 text-right w-20">Regular</th>
              <th className="py-2 px-2 text-right w-16">OT Pay</th>
              <th className="py-2 px-2 text-right w-20 text-amber-600">Advance</th>
              <th className="py-2 px-2 text-right w-16 text-muted-foreground">Mess</th>
              <th className="py-2 px-3 text-right w-28 font-bold text-foreground bg-emerald-50/30 dark:bg-emerald-950/10">
                Net Payable
              </th>
              <th className="py-2 px-2 text-center w-20">Payslip</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/40">
            {isLoading ? (
              <tr>
                <td colSpan={11} className="p-8 text-center text-muted-foreground">
                  <Loader2 className="h-5 w-5 animate-spin mx-auto mb-1.5 text-primary" />
                  Calculating monthly payroll...
                </td>
              </tr>
            ) : payrollItems.length === 0 ? (
              <tr>
                <td colSpan={11} className="p-8 text-center text-muted-foreground">
                  No active staff found for this project.
                </td>
              </tr>
            ) : (
              payrollItems.map((item) => (
                <tr key={item.staffId} className="hover:bg-muted/20 transition-colors">
                  <td className="py-1.5 px-3 font-sans font-medium text-foreground">
                    {item.staffName}
                    <span className="block text-[10px] text-muted-foreground font-normal">
                      {item.designation || item.category || "Labor"} {item.gangName ? `• ${item.gangName}` : ""}
                    </span>
                  </td>

                  <td className="py-1.5 px-2 text-[10px] capitalize text-muted-foreground">
                    {item.employmentType === "monthly" ? "Monthly" : "Daily"}
                  </td>

                  <td className="py-1.5 px-2 text-right font-bold text-emerald-600">
                    {item.effectiveDays}
                  </td>

                  <td className="py-1.5 px-2 text-right font-mono text-blue-600">
                    {item.overtimeHours > 0 ? `${item.overtimeHours}h` : "—"}
                  </td>

                  <td className="py-1.5 px-2 text-right text-muted-foreground font-mono">
                    {item.baseRate.toLocaleString()}
                  </td>

                  <td className="py-1.5 px-2 text-right font-mono">
                    {item.regularPay.toLocaleString()}
                  </td>

                  <td className="py-1.5 px-2 text-right font-mono text-blue-600">
                    {item.overtimePay > 0 ? item.overtimePay.toLocaleString() : "—"}
                  </td>

                  <td className={cn("py-1.5 px-2 text-right font-mono", item.advanceDeduction > 0 ? "text-amber-600 font-bold" : "text-muted-foreground")}>
                    {item.advanceDeduction > 0 ? `-${item.advanceDeduction.toLocaleString()}` : "—"}
                  </td>

                  <td className="py-1.5 px-2 text-right font-mono text-muted-foreground">
                    {item.messDeduction > 0 ? `-${item.messDeduction.toLocaleString()}` : "—"}
                  </td>

                  <td className="py-1.5 px-3 text-right font-bold font-mono text-emerald-700 dark:text-emerald-300 text-sm bg-emerald-50/20 dark:bg-emerald-950/10">
                    NPR {item.netPayable.toLocaleString("en-IN", { maximumFractionDigits: 0 })}
                  </td>

                  <td className="py-1.5 px-2 text-center">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setSelectedPayslip(item)}
                      className="h-5 text-[9px] gap-1 px-1.5 text-primary hover:bg-primary/10"
                    >
                      <FileText className="h-2.5 w-2.5" /> View
                    </Button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
          {payrollItems.length > 0 && summary && (
            <tfoot>
              <tr className="border-t-2 bg-muted/40 font-bold text-xs">
                <td colSpan={5} className="py-2 px-3 text-right">Total Net Payroll:</td>
                <td className="py-2 px-2 text-right font-mono">{summary.totalRegularPay.toLocaleString()}</td>
                <td className="py-2 px-2 text-right font-mono text-blue-600">{summary.totalOvertimePay.toLocaleString()}</td>
                <td className="py-2 px-2 text-right font-mono text-amber-600">-{summary.totalAdvanceRecoveries.toLocaleString()}</td>
                <td className="py-2 px-2 text-right font-mono text-muted-foreground">-{summary.totalMessDeductions.toLocaleString()}</td>
                <td className="py-2 px-3 text-right font-mono text-emerald-700 dark:text-emerald-300 font-extrabold text-sm bg-emerald-100/40 dark:bg-emerald-950/30">
                  NPR {summary.grandTotal.toLocaleString("en-IN", { maximumFractionDigits: 0 })}
                </td>
                <td />
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {/* Printable Worker Payslip Dialog */}
      {selectedPayslip && (
        <Dialog open={!!selectedPayslip} onOpenChange={(open) => !open && setSelectedPayslip(null)}>
          <DialogContent className="max-w-md print:p-0 print:border-none">
            <DialogHeader className="border-b pb-3">
              <DialogTitle className="flex items-center justify-between text-base">
                <span>Site Wage Slip / Payslip</span>
                <span className="font-mono text-xs font-normal text-muted-foreground">{selectedMonth}</span>
              </DialogTitle>
              <DialogDescription className="text-xs">
                Construction Project Labor &amp; Staff Wage Receipt
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-2 text-xs">
              <div className="grid grid-cols-2 gap-2 bg-muted/30 p-2.5 rounded-lg border">
                <div>
                  <span className="text-[10px] text-muted-foreground">Name:</span>
                  <p className="font-bold text-foreground text-sm">{selectedPayslip.staffName}</p>
                </div>
                <div>
                  <span className="text-[10px] text-muted-foreground">Trade / Designation:</span>
                  <p className="font-medium text-foreground">{selectedPayslip.designation || selectedPayslip.category || "Labor"}</p>
                </div>
                <div>
                  <span className="text-[10px] text-muted-foreground">Gang / Team:</span>
                  <p className="font-medium text-foreground">{selectedPayslip.gangName || "General Site"}</p>
                </div>
                <div>
                  <span className="text-[10px] text-muted-foreground">Employment Track:</span>
                  <p className="font-medium capitalize">{selectedPayslip.employmentType}</p>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="p-2 border rounded bg-card">
                  <p className="text-[10px] text-muted-foreground">Days Worked</p>
                  <p className="font-bold font-mono text-sm text-emerald-600">{selectedPayslip.effectiveDays} Days</p>
                </div>
                <div className="p-2 border rounded bg-card">
                  <p className="text-[10px] text-muted-foreground">Overtime</p>
                  <p className="font-bold font-mono text-sm text-blue-600">{selectedPayslip.overtimeHours} Hours</p>
                </div>
                <div className="p-2 border rounded bg-card">
                  <p className="text-[10px] text-muted-foreground">Base Rate</p>
                  <p className="font-bold font-mono text-sm">NPR {selectedPayslip.baseRate.toLocaleString()}</p>
                </div>
              </div>

              <div className="rounded border overflow-hidden">
                <table className="w-full text-xs font-mono">
                  <thead className="bg-muted/50 border-b text-[10px] text-muted-foreground">
                    <tr>
                      <th className="p-2 text-left">Description</th>
                      <th className="p-2 text-right">Amount (NPR)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/30">
                    <tr>
                      <td className="p-2">Regular Pay</td>
                      <td className="p-2 text-right">{selectedPayslip.regularPay.toLocaleString()}</td>
                    </tr>
                    {selectedPayslip.overtimePay > 0 && (
                      <tr>
                        <td className="p-2">Overtime Pay (1.5x)</td>
                        <td className="p-2 text-right text-blue-600">+{selectedPayslip.overtimePay.toLocaleString()}</td>
                      </tr>
                    )}
                    <tr className="bg-muted/20 font-bold">
                      <td className="p-2">Total Gross Earnings</td>
                      <td className="p-2 text-right">{selectedPayslip.gross.toLocaleString()}</td>
                    </tr>
                    {selectedPayslip.advanceDeduction > 0 && (
                      <tr>
                        <td className="p-2 text-amber-600">Cash Advance Recovery</td>
                        <td className="p-2 text-right text-amber-600">-{selectedPayslip.advanceDeduction.toLocaleString()}</td>
                      </tr>
                    )}
                    {selectedPayslip.messDeduction > 0 && (
                      <tr>
                        <td className="p-2">Canteen / Mess Deduction</td>
                        <td className="p-2 text-right">-{selectedPayslip.messDeduction.toLocaleString()}</td>
                      </tr>
                    )}
                    {selectedPayslip.tdsAmount > 0 && (
                      <tr>
                        <td className="p-2">TDS Deducted (1%)</td>
                        <td className="p-2 text-right">-{selectedPayslip.tdsAmount.toLocaleString()}</td>
                      </tr>
                    )}
                  </tbody>
                  <tfoot>
                    <tr className="bg-emerald-50 dark:bg-emerald-950/30 border-t-2 font-bold text-sm">
                      <td className="p-2 text-emerald-800 dark:text-emerald-300">NET PAYABLE:</td>
                      <td className="p-2 text-right font-extrabold text-emerald-700 dark:text-emerald-300 font-mono">
                        NPR {selectedPayslip.netPayable.toLocaleString()}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              <div className="grid grid-cols-2 gap-4 pt-4 border-t text-[10px] text-muted-foreground text-center">
                <div className="border-t border-dashed pt-1">
                  Worker Signature / Thumbprint
                </div>
                <div className="border-t border-dashed pt-1">
                  Site In-Charge / Project Manager
                </div>
              </div>
            </div>

            <DialogFooter className="border-t pt-3 flex justify-between">
              <Button
                variant="outline"
                size="sm"
                onClick={() => window.print()}
                className="gap-1.5"
              >
                <Printer className="h-3.5 w-3.5" /> Print Payslip
              </Button>
              <Button size="sm" onClick={() => setSelectedPayslip(null)}>
                Close
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
