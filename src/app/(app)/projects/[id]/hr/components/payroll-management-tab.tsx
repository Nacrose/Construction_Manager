"use client";

import { useState, useMemo } from "react";
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
  Lock,
  Award,
  Banknote,
  FileText,
  Printer,
  Loader2,
  RefreshCw,
  Split,
} from "lucide-react";
import {
  PayrollAllocationDialog,
  type StoredAllocation,
} from "../dialogs/payroll-allocation-dialog";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { format } from "date-fns";
import { formatNpr } from "@/lib/construction-finance";
import { ConstructionTable, type ConstructionTableColumn } from "@/components/ui/construction-table";
import { StatusBadge } from "@/components/ui/status-badge";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

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
  const [confirmAction, setConfirmAction] = useState<"approve" | "disburse" | null>(null);
  const [splitItem, setSplitItem] = useState<any | null>(null);
  // Manual splits pinned this session (ADR-0007 §2). Stored draft-run rows
  // are the source of truth — this map only carries in-session saves so a
  // global "Update Run" never silently reverts a person to the auto basis.
  const [localManual, setLocalManual] = useState<Record<string, any[]>>({});

  const utils = trpc.useUtils();

  const { data, isLoading, refetch, isFetching } = trpc.payroll.calculate.useQuery({
    projectId,
    month: selectedMonth,
  });

  const payrollItems = data?.payrollItems || [];
  const summary = data?.summary;
  const existingRun = data?.existingRun;
  const runIsDraft = existingRun?.status === "draft";

  // Draft-run allocations (basis + manual rows) per person — read-only
  // grounding for the split dialog and the Auto/Manual badge.
  const { data: runDetail } = trpc.payroll.getRun.useQuery(
    { runId: existingRun!.id },
    { enabled: !!existingRun?.id },
  );

  const storedManualByPerson = useMemo(() => {
    const map: Record<string, StoredAllocation[]> = {};
    for (const rec of runDetail?.run.records ?? []) {
      const allocs = (rec as any).allocations ?? [];
      if (allocs.some((a: any) => a.basis === "manual")) {
        map[rec.personId] = allocs;
      }
    }
    return map;
  }, [runDetail]);

  const effectiveManualFor = (personId: string): StoredAllocation[] | null =>
    localManual[personId] ?? storedManualByPerson[personId] ?? null;

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
      setConfirmAction(null);
    },
    onError: (e) => toast.error(e.message),
  });

  const handleGenerateRun = () => {
    if (!payrollItems.length) return;

    // Phase E (ADR-0007): the run is ORG-wide — the server recomputes every
    // amount from combined attendance; the client only nominates persons
    // (and optional audited manual splits). Saving is additive: persons
    // already in the run from other projects are never dropped. Pinned
    // manual splits ride along so a re-save never reverts them to auto.
    createRunMut.mutate({
      month: selectedMonth,
      records: payrollItems.map((item) => {
        const manual = effectiveManualFor(item.personId);
        const rows = manual?.map((a) => ({
          assignmentId: a.assignmentId,
          gross: a.gross,
          allowances: a.allowances,
          advanceDeduction: a.advanceDeduction,
          tdsAmount: a.tdsAmount,
          net: a.net,
          overrideReason: a.overrideReason ?? "Manual split carried forward",
        }));
        return rows && rows.length > 0
          ? { personId: item.personId, manualAllocations: rows }
          : { personId: item.personId };
      }),
    });
  };

  const columns: ConstructionTableColumn<any>[] = useMemo(
    () => [
      {
        key: "staffName",
        header: "Worker Name",
        render: (val, row) => (
          <div className="font-sans font-medium text-foreground">
            {val}
            <span className="block text-[10px] text-muted-foreground font-normal">
              {row.designation || row.category || "Labor"} {row.gangName ? `• ${row.gangName}` : ""}
              {!row.onCallingProject && (
                <span className="ml-1 text-[9px] text-amber-600 dark:text-amber-400">• other site</span>
              )}
            </span>
          </div>
        ),
      },
      {
        key: "employmentType",
        header: "Track",
        render: (val) => <span className="capitalize text-muted-foreground text-[10px]">{val}</span>,
      },
      {
        key: "effectiveDays",
        header: "Days",
        align: "right",
        className: "font-bold text-success",
      },
      {
        key: "overtimeHours",
        header: "OT(h)",
        align: "right",
        className: "text-info",
        render: (val) => (val > 0 ? `${val}h` : "—"),
      },
      {
        key: "baseRate",
        header: "Base Rate",
        align: "right",
        render: (val) => formatNpr(val),
      },
      {
        key: "regularPay",
        header: "Regular",
        align: "right",
        summary: "sum",
        render: (val) => formatNpr(val),
      },
      {
        key: "overtimePay",
        header: "OT Pay",
        align: "right",
        summary: "sum",
        render: (val) => (val > 0 ? formatNpr(val) : "—"),
      },
      {
        key: "advanceDeduction",
        header: "Advance",
        align: "right",
        summary: "sum",
        className: "text-amber-600",
        render: (val) => (val > 0 ? `-${formatNpr(val)}` : "—"),
      },
      {
        key: "messDeduction",
        header: "Mess",
        align: "right",
        summary: "sum",
        className: "text-muted-foreground",
        render: (val) => (val > 0 ? `-${formatNpr(val)}` : "—"),
      },
      {
        key: "netPayable",
        header: "Net Payable",
        align: "right",
        summary: "sum",
        className: "font-bold font-mono text-foreground bg-success/20 dark:bg-success/10",
        render: (val) => formatNpr(val),
      },
      {
        key: "split",
        header: "Split",
        align: "center",
        render: (_val: unknown, row: any) => {
          const splittable = (row.projectNames?.length ?? 0) > 1;
          const canEdit = isAdmin && (!existingRun || runIsDraft);
          const manual =
            localManual[row.personId] ?? storedManualByPerson[row.personId] ?? null;
          return (
            <Button
              size="sm"
              variant="ghost"
              disabled={!canEdit || !splittable}
              title={
                !splittable
                  ? "Single engagement — no split possible"
                  : !canEdit
                  ? "Run is locked"
                  : manual
                  ? "Manual split pinned (audited) — click to edit"
                  : "Auto basis (days → % → residual) — click to pin a manual split"
              }
              onClick={() => setSplitItem(row)}
              className="h-6 text-[10px] gap-1 px-1.5 text-primary hover:bg-primary/10 disabled:text-muted-foreground/40"
            >
              <Split className="h-3 w-3" />
              {manual ? "Manual" : "Auto"}
            </Button>
          );
        },
      },
      {
        key: "staffId",
        header: "Payslip",
        align: "center",
        render: (_val, row) => (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setSelectedPayslip(row)}
            className="h-6 text-[10px] gap-1 px-1.5 text-primary hover:bg-primary/10"
          >
            <FileText className="h-3 w-3" /> Slip
          </Button>
        ),
      },
    ],
    [isAdmin, existingRun, runIsDraft, localManual, storedManualByPerson],
  );

  return (
    <div className="space-y-3 font-sans">
      {/* Month & Actions Strip */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-3 py-2 bg-card rounded-xl border border-border/80 text-xs">
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground font-semibold">Month:</span>
          <Input
            type="month"
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            className="h-7 w-36 text-xs font-mono"
          />
          {existingRun ? (
            <StatusBadge
              status={existingRun.status === "disbursed" ? "approved" : existingRun.status === "approved" ? "in_progress" : "pending"}
              label={existingRun.status === "disbursed" ? "Disbursed" : existingRun.status === "approved" ? "Approved" : "Draft Run"}
              size="xs"
            />
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
              onClick={() => setConfirmAction("approve")}
              disabled={updateStatusMut.isPending}
              className="h-7 text-xs bg-info hover:bg-info text-white font-semibold gap-1 px-2.5"
            >
              <Award className="h-3 w-3" /> PM Approve
            </Button>
          )}

          {existingRun?.status === "approved" && isAdmin && (
            <Button
              size="sm"
              onClick={() => setConfirmAction("disburse")}
              disabled={updateStatusMut.isPending}
              className="h-7 text-xs bg-success hover:bg-success text-white font-semibold gap-1 px-2.5"
            >
              <Banknote className="h-3 w-3" /> Mark Disbursed
            </Button>
          )}
        </div>
      </div>

      {/* Slim Inline Financial Summary Ribbon */}
      {summary && (
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-3 py-1.5 bg-muted/40 rounded border text-[11px] font-mono tabular-nums">
          <div className="flex items-center gap-3">
            <span>
              <strong className="text-foreground">Workforce:</strong> {summary.totalStaff}
            </span>
            <span className="text-muted-foreground/40">│</span>
            <span className="text-info dark:text-info/80 font-semibold">
              Gross: NPR {formatNpr(summary.totalGross)}
            </span>
            <span className="text-muted-foreground/40">│</span>
            <span className="text-amber-600 dark:text-amber-400">
              Advances: -{formatNpr(summary.totalAdvanceRecoveries)}
            </span>
            <span className="text-muted-foreground/40">│</span>
            <span className="text-muted-foreground dark:text-muted-foreground/80">
              Mess/TDS: -{formatNpr(summary.totalMessDeductions + summary.totalTds)}
            </span>
          </div>

          <div>
            <span className="text-success dark:text-success/80 font-extrabold text-xs">
              💰 Total Net Payable: NPR {formatNpr(summary.grandTotal)}
            </span>
          </div>
        </div>
      )}

      {/* Payroll Line Items Table */}
      <ConstructionTable
        title={`Payroll Register - ${selectedMonth}`}
        data={payrollItems}
        columns={columns}
        searchPlaceholder="Search worker name, designation, gang..."
        exportExcel={{
          filename: `Payroll_${projectId}_${selectedMonth}`,
          sheetName: "Payroll",
        }}
        emptyState={{
          icon: FileText,
          title: "No Active Staff",
          description: "No workers with active engagements anywhere in the organization for this period.",
        }}
      />

      {/* Printable Payslip Dialog */}
      <Dialog open={Boolean(selectedPayslip)} onOpenChange={() => setSelectedPayslip(null)}>
        <DialogContent className="max-w-md bg-card border-border font-sans p-5">
          <DialogHeader>
            <DialogTitle className="text-sm font-bold flex items-center justify-between">
              <span>Salary Payslip (तलब भरपाई)</span>
              <Badge variant="outline" className="font-mono text-[10px]">{selectedMonth}</Badge>
            </DialogTitle>
            <DialogDescription className="text-xs">
              Official salary voucher and deduction receipt
            </DialogDescription>
          </DialogHeader>

          {selectedPayslip && (
            <div className="space-y-3 pt-2 text-xs font-mono">
              <div className="p-3 bg-muted/40 rounded border space-y-1">
                <p className="font-bold text-foreground font-sans text-sm">{selectedPayslip.staffName}</p>
                <p className="text-muted-foreground text-[11px]">
                  Designation: {selectedPayslip.designation || selectedPayslip.category || "Staff"} &middot;{" "}
                  {selectedPayslip.employmentType === "monthly" ? "Monthly" : "Daily Track"}
                </p>
                {selectedPayslip.bankAccount && (
                  <p className="text-muted-foreground text-[10px]">
                    Bank A/C: {selectedPayslip.bankName ? `${selectedPayslip.bankName} - ` : ""}{selectedPayslip.bankAccount}
                  </p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-2 text-[11px]">
                <div className="border rounded p-2 bg-card space-y-1">
                  <p className="font-semibold text-foreground uppercase text-[9px] border-b pb-0.5">Earnings</p>
                  <div className="flex justify-between"><span>Base Rate:</span><span>{formatNpr(selectedPayslip.baseRate)}</span></div>
                  <div className="flex justify-between"><span>Days ({selectedPayslip.effectiveDays}):</span><span>{formatNpr(selectedPayslip.regularPay)}</span></div>
                  <div className="flex justify-between"><span>OT ({selectedPayslip.overtimeHours}h):</span><span>{formatNpr(selectedPayslip.overtimePay)}</span></div>
                  <div className="flex justify-between"><span>Allowances:</span><span>{formatNpr(selectedPayslip.allowances)}</span></div>
                  <div className="flex justify-between font-bold text-info border-t pt-1">
                    <span>Gross Pay:</span><span>{formatNpr(selectedPayslip.regularPay + selectedPayslip.overtimePay + selectedPayslip.allowances)}</span>
                  </div>
                </div>

                <div className="border rounded p-2 bg-card space-y-1">
                  <p className="font-semibold text-foreground uppercase text-[9px] border-b pb-0.5">Deductions</p>
                  <div className="flex justify-between text-amber-600"><span>Advance:</span><span>-{formatNpr(selectedPayslip.advanceDeduction)}</span></div>
                  <div className="flex justify-between text-muted-foreground"><span>Mess:</span><span>-{formatNpr(selectedPayslip.messDeduction)}</span></div>
                  <div className="flex justify-between text-muted-foreground"><span>TDS / Other:</span><span>-{formatNpr(selectedPayslip.tdsAmount + selectedPayslip.otherDeductions)}</span></div>
                  <div className="flex justify-between font-bold text-rose-600 border-t pt-1">
                    <span>Total Ded.:</span>
                    <span>-{formatNpr(selectedPayslip.advanceDeduction + selectedPayslip.messDeduction + selectedPayslip.tdsAmount + selectedPayslip.otherDeductions)}</span>
                  </div>
                </div>
              </div>

              <div className="p-3 bg-success/10 dark:bg-success/20 border border-success/40 dark:border-success rounded flex justify-between items-center text-sm font-bold text-success dark:text-success/80">
                <span>Net Payable:</span>
                <span>NPR {formatNpr(selectedPayslip.netPayable)}</span>
              </div>
            </div>
          )}

          <DialogFooter className="gap-2 pt-2">
            <Button size="sm" variant="outline" onClick={() => setSelectedPayslip(null)} className="h-7 text-xs">
              Close
            </Button>
            <Button size="sm" onClick={() => window.print()} className="h-7 text-xs gap-1">
              <Printer className="h-3 w-3" /> Print Payslip
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Manual allocation split editor (ADR-0007 §2). Gated on the draft-run
          detail so the prefill has its stored rows before mounting. */}
      {splitItem && (!runIsDraft || !!runDetail) && (
        <PayrollAllocationDialog
          projectId={projectId}
          month={selectedMonth}
          item={{
            personId: splitItem.personId,
            staffName: splitItem.staffName,
            gross: splitItem.gross,
            allowances: splitItem.allowances,
            advanceDeduction: splitItem.advanceDeduction,
            tdsAmount: splitItem.tdsAmount,
            netPayable: splitItem.netPayable,
          }}
          storedAllocations={runIsDraft ? effectiveManualFor(splitItem.personId) : null}
          onSaved={(rows) =>
            setLocalManual((prev) => {
              const next = { ...prev };
              if (rows) next[splitItem.personId] = rows as any[];
              else delete next[splitItem.personId];
              return next;
            })
          }
          onClose={() => setSplitItem(null)}
        />
      )}

      {/* Confirmation Dialog for Payroll Approval / Disbursement */}
      {confirmAction && (
        <ConfirmDialog
          open={Boolean(confirmAction)}
          onOpenChange={(open) => {
            if (!open) setConfirmAction(null);
          }}
          title={
            confirmAction === "approve"
              ? "Approve Payroll Batch?"
              : "Mark Payroll as Disbursed?"
          }
          description={
            confirmAction === "approve"
              ? `Are you sure you want to approve payroll for period ${selectedMonth}? Total Net Payable: NPR ${formatNpr(summary?.grandTotal ?? 0)} across ${payrollItems.length} staff members.`
              : `Marking payroll as disbursed will finalize salary payouts of NPR ${formatNpr(summary?.grandTotal ?? 0)} for period ${selectedMonth}.`
          }
          variant={confirmAction === "approve" ? "warning" : "success"}
          confirmLabel={confirmAction === "approve" ? "Approve Payroll" : "Confirm Disbursement"}
          isLoading={updateStatusMut.isPending}
          onConfirm={async () => {
            if (existingRun) {
              await updateStatusMut.mutateAsync({
                runId: existingRun.id,
                action: confirmAction,
              });
            }
          }}
        />
      )}
    </div>
  );
}
