"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc-client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { FileText, Printer, Download, Edit3, Check, Loader2, Paperclip, Eye } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import * as XLSX from "@e965/xlsx";
import { formatNpr, amountInWords } from "@/lib/construction-finance";
import { IpcScannedBillCard } from "./ipc-scanned-bill-card";

function fmt(n: number) {
  return formatNpr(n);
}

export function IpcPaymentSummarySheet({
  projectId,
  ipcId,
  canWrite = false,
}: {
  projectId: string;
  ipcId: string;
  canWrite?: boolean;
}) {
  const { data, isLoading } = trpc.ipc.getPaymentSummary.useQuery({ ipcId });

  if (isLoading || !data) {
    return (
      <div className="p-8 text-center text-muted-foreground text-sm font-mono">
        <Loader2 className="h-5 w-5 animate-spin mx-auto mb-2 text-primary" />
        Loading IPC Payment Summary Sheet...
      </div>
    );
  }

  return (
    <IpcPaymentSummaryContent
      projectId={projectId}
      ipcId={ipcId}
      ipc={data.ipc}
      summary={data.summary}
      canWrite={canWrite}
    />
  );
}

function IpcPaymentSummaryContent({
  projectId,
  ipcId,
  ipc,
  summary,
  canWrite,
}: {
  projectId: string;
  ipcId: string;
  ipc: any;
  summary: any;
  canWrite: boolean;
}) {
  const [isEditing, setIsEditing] = useState(false);

  const utils = trpc.useUtils();

  const updateMut = trpc.ipc.update.useMutation({
    onSuccess: () => {
      toast.success("Payment summary metadata saved");
      utils.ipc.getPaymentSummary.invalidate({ ipcId });
      setIsEditing(false);
    },
    onError: (e) => toast.error(e.message),
  });

  const project = (ipc as any).project;

  // Local edit states
  const [submittedBy, setSubmittedBy] = useState(ipc.submittedBy || "A.M. Construction Company (P.) Ltd.");
  const [submittedByLoc, setSubmittedByLoc] = useState(ipc.submittedByLocation || "Gwarkho, Lalitpur");
  const [checkedBy, setCheckedBy] = useState(ipc.checkedBy || "Boddhi Engineering Consultancy");
  const [checkedByLoc, setCheckedByLoc] = useState(ipc.checkedByLocation || "Godawari, Lalitpur");
  const [approvedBy, setApprovedBy] = useState(ipc.approvedBy || project?.client || "Nepal Don Bosco Society");
  const [approvedByLoc, setApprovedByLoc] = useState(ipc.approvedByLocation || project?.location || "Lubhu, Lalitpur");
  const [contractWithoutVat, setContractWithoutVat] = useState(summary.contractWithoutVat);
  const [mobAdvancePaid, setMobAdvancePaid] = useState(summary.mobilizationPaid);
  const [prevGross, setPrevGross] = useState(summary.prev.gross);
  const [prevVat, setPrevVat] = useState(summary.prev.vat);
  const [prevAdvance, setPrevAdvance] = useState(summary.prev.advance);
  const [prevRetention, setPrevRetention] = useState(summary.prev.retention);
  const [prevTds, setPrevTds] = useState(summary.prev.tds);

  const handleSaveMetadata = () => {
    updateMut.mutate({
      ipcId,
      submittedBy,
      submittedByLocation: submittedByLoc,
      checkedBy,
      checkedByLocation: checkedByLoc,
      approvedBy,
      approvedByLocation: approvedByLoc,
      originalContractAmountWithoutVat: Number(contractWithoutVat),
      originalContractAmountWithVat: Number(contractWithoutVat) * 1.13,
      mobilizationAdvanceTotal: Number(mobAdvancePaid),
      previousGrossAmount: Number(prevGross),
      previousVatAmount: Number(prevVat),
      previousAdvanceRecovery: Number(prevAdvance),
      previousRetentionAmount: Number(prevRetention),
      previousTdsAmount: Number(prevTds),
    });
  };

  const handleExportExcel = () => {
    try {
      const wsData = [
        [approvedBy],
        [project?.name || "Construction Project"],
        [approvedByLoc],
        [],
        [`INTERIM PAYMENT CERTIFICATE NO.: IPC -${ipc.number}`],
        ["Summary of Payment"],
        [],
        ["Serial No of Bill:", ipc.number, "", "", "Date:", format(new Date(ipc.issueDate || ipc.createdAt), "d MMMM yyyy")],
        ["Contractor:", submittedBy, "", "", "Original Contract Amount without VAT:", summary.contractWithoutVat],
        ["Period:", ipc.period || "12 Months", "", "", "Original Contract Amount with VAT:", summary.contractWithVat],
        ["", "", "", "", "Mobilization Advance Amount Paid:", summary.mobilizationPaid],
        ["", "", "", "", "Mobilization Advance Amount Deducted:", summary.cumulative.advance],
        ["", "", "", "", "Mobilization Advance Balance:", summary.mobilizationBalance],
        [],
        ["S.No.", "Description", "Upto Previous IPC Amount (NRs.)", "This IPC Amount (NRs.)", "Total Amount (NRs.)", "Progress in %"],
        ["A", "Bill Amount with out VAT", summary.prev.gross, summary.thisPeriod.gross, summary.cumulative.gross, `${summary.progressPct.toFixed(2)}%`],
        ["B", "Vat 13% of A", summary.prev.vat, summary.thisPeriod.vat, summary.cumulative.vat, ""],
        ["C", "Total Bill Amount (A+B):", summary.prev.totalBill, summary.thisPeriod.totalBill, summary.cumulative.totalBill, ""],
        ["D", "Deductions:", "", "", "", ""],
        ["E", "Mobilization Advance", summary.prev.advance, summary.thisPeriod.advance, summary.cumulative.advance, ""],
        ["F", "Retention Amount @ 5% of A", summary.prev.retention, summary.thisPeriod.retention, summary.cumulative.retention, ""],
        ["G", "TDS @1.5% of A", summary.prev.tds, summary.thisPeriod.tds, summary.cumulative.tds, ""],
        ["H", "Total Deduction Amount (E+F+G)", summary.prev.totalDeductions, summary.thisPeriod.totalDeductions, summary.cumulative.totalDeductions, ""],
        ["I", "Net Payable Amount Including VAT (C-H)", summary.prev.netPayable, summary.thisPeriod.netPayable, summary.cumulative.netPayable, ""],
        [],
        ["Submitted by:", "", "Checked by:", "", "Approved by:"],
        [submittedBy, "", checkedBy, "", approvedBy],
        [submittedByLoc, "", checkedByLoc, "", approvedByLoc],
      ];

      const ws = XLSX.utils.aoa_to_sheet(wsData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, `IPC-${ipc.number} Summary`);
      XLSX.writeFile(wb, `IPC-${ipc.number}-Payment-Summary.xlsx`);
      toast.success("Excel exported successfully");
    } catch {
      toast.error("Failed to export Excel");
    }
  };

  return (
    <div className="space-y-4 font-sans">
      {/* Controls Bar */}
      <div className="flex items-center justify-between gap-2 p-2 bg-muted/30 rounded-md border text-xs no-print">
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="font-mono text-[11px] bg-card">
            IPC #{ipc.number} Payment Summary
          </Badge>
          {ipc.isBillAttached ? (
            <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 gap-1 text-[10px]">
              <Paperclip className="h-3 w-3" /> Scanned Bill Attached
            </Badge>
          ) : (
            <Badge variant="outline" className="border-amber-400 bg-amber-50 text-amber-800 dark:bg-amber-950 dark:text-amber-300 text-[10px]">
              ⚠️ Missing Scanned Bill
            </Badge>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          {canWrite && (
            <Button
              size="sm"
              variant={isEditing ? "default" : "outline"}
              onClick={() => (isEditing ? handleSaveMetadata() : setIsEditing(true))}
              disabled={updateMut.isPending}
              className="h-7 text-xs gap-1"
            >
              {isEditing ? (
                <>
                  <Check className="h-3 w-3" /> Save Summary
                </>
              ) : (
                <>
                  <Edit3 className="h-3 w-3" /> Edit Contract &amp; Parties
                </>
              )}
            </Button>
          )}

          <Button
            size="sm"
            variant="outline"
            onClick={handleExportExcel}
            className="h-7 text-xs text-emerald-700 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800 gap-1"
          >
            <Download className="h-3 w-3" /> Export Excel
          </Button>

          <Button
            size="sm"
            variant="outline"
            onClick={() => window.print()}
            className="h-7 text-xs gap-1"
          >
            <Printer className="h-3 w-3" /> Print
          </Button>
        </div>
      </div>

      {/* Scanned Copy Card */}
      <IpcScannedBillCard
        projectId={projectId}
        ipcId={ipcId}
        scannedBillUrl={ipc.scannedBillUrl}
        scannedBillName={ipc.scannedBillName}
        isBillAttached={ipc.isBillAttached}
        taxInvoiceNo={ipc.taxInvoiceNo}
        canWrite={canWrite}
        onUpdate={() => {
          utils.ipc.getPaymentSummary.invalidate({ ipcId });
          utils.vatRegister.getSalesRegister.invalidate({ projectId });
        }}
      />

      {/* Official Nepal Summary of Payment Sheet Container */}
      <Card className="border-2 border-blue-900/30 dark:border-blue-700/50 shadow-md bg-card p-6 overflow-x-auto text-foreground">
        <div className="min-w-[760px] space-y-4">
          {/* Header Title Block */}
          <div className="text-center space-y-1 border-b-2 border-blue-900 pb-3">
            <h1 className="text-lg font-bold text-blue-950 dark:text-blue-200 tracking-wide uppercase">
              {isEditing ? (
                <Input
                  value={approvedBy}
                  onChange={(e) => setApprovedBy(e.target.value)}
                  className="h-7 text-center font-bold"
                />
              ) : (
                approvedBy
              )}
            </h1>
            <h2 className="text-sm font-semibold text-foreground">
              {project?.name || "Construction of Project"}
            </h2>
            <p className="text-xs text-muted-foreground">
              {isEditing ? (
                <Input
                  value={approvedByLoc}
                  onChange={(e) => setApprovedByLoc(e.target.value)}
                  className="h-6 text-xs text-center"
                />
              ) : (
                approvedByLoc
              )}
            </p>
            <div className="pt-2">
              <div className="inline-block border-b-2 border-foreground pb-0.5 font-bold text-sm uppercase tracking-wider">
                INTERIM PAYMENT CERTIFICATE NO.: IPC -{ipc.number}
              </div>
              <p className="text-xs font-bold text-blue-900 dark:text-blue-300 underline mt-0.5">
                Summary of Payment
              </p>
            </div>
          </div>

          {/* Contract Details 2-Column Metadata Grid */}
          <div className="grid grid-cols-2 gap-x-8 gap-y-1 text-xs font-mono pt-1">
            <div className="space-y-1">
              <div className="flex justify-between border-b pb-0.5">
                <span className="font-semibold text-muted-foreground">Serial No of Bill:</span>
                <span className="font-bold text-foreground">{ipc.number}</span>
              </div>
              <div className="flex justify-between border-b pb-0.5">
                <span className="text-muted-foreground">Contractor:</span>
                <span className="font-semibold text-foreground">{submittedBy}</span>
              </div>
              <div className="flex justify-between border-b pb-0.5">
                <span className="text-muted-foreground">Period:</span>
                <span className="text-foreground">{ipc.period || "12 Months"}</span>
              </div>
              <div className="flex justify-between border-b pb-0.5">
                <span className="text-muted-foreground">Client Tax Invoice #:</span>
                <span className="font-bold text-blue-600">{ipc.taxInvoiceNo || `IPC-${ipc.number}`}</span>
              </div>
            </div>

            <div className="space-y-1">
              <div className="flex justify-between border-b pb-0.5">
                <span className="font-semibold text-muted-foreground">Date:</span>
                <span className="font-bold text-foreground">
                  {format(new Date(ipc.issueDate || ipc.createdAt), "d MMMM yyyy")}
                </span>
              </div>
              <div className="flex justify-between border-b pb-0.5">
                <span className="text-muted-foreground">Contract Amount without VAT:</span>
                <span className="font-bold text-foreground">{fmt(summary.contractWithoutVat)}</span>
              </div>
              <div className="flex justify-between border-b pb-0.5">
                <span className="text-muted-foreground">Contract Amount with 13% VAT:</span>
                <span className="font-semibold text-foreground">{fmt(summary.contractWithVat)}</span>
              </div>
              <div className="flex justify-between border-b pb-0.5 bg-yellow-50 dark:bg-yellow-950/30 px-1 rounded">
                <span className="font-semibold text-amber-900 dark:text-amber-300">Mobilization Advance Balance:</span>
                <span className="font-bold text-amber-900 dark:text-amber-300 font-mono">
                  {summary.mobilizationBalance > 0 ? `NRs. ${fmt(summary.mobilizationBalance)}` : "— (Fully Recovered)"}
                </span>
              </div>
            </div>
          </div>

          {/* 3-Column Cumulative Summary of Payment Table */}
          <div className="overflow-x-auto rounded border-2 border-foreground/80 mt-2">
            <table className="w-full text-xs font-mono border-collapse tabular-nums">
              <thead>
                <tr className="bg-muted/80 border-b-2 border-foreground text-[11px] font-bold text-center">
                  <th className="border-r border-foreground p-2 w-12 text-center">S.No.</th>
                  <th className="border-r border-foreground p-2 text-left min-w-[220px]">Description</th>
                  <th className="border-r border-foreground p-2 w-36 text-right">Upto Previous IPC Amount (NRs.)</th>
                  <th className="border-r border-foreground p-2 w-36 text-right bg-blue-50/50 dark:bg-blue-950/20">This IPC Amount (NRs.)</th>
                  <th className="border-r border-foreground p-2 w-36 text-right">Total Amount (NRs.)</th>
                  <th className="p-2 w-24 text-center">Progress %</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {/* Row A: Bill Amount without VAT */}
                <tr className="hover:bg-muted/10 font-bold text-foreground">
                  <td className="border-r border-foreground p-2 text-center font-bold">A</td>
                  <td className="border-r border-foreground p-2 text-left font-bold">Bill Amount with out VAT</td>
                  <td className="border-r border-foreground p-2 text-right">{fmt(summary.prev.gross)}</td>
                  <td className="border-r border-foreground p-2 text-right bg-blue-50/50 dark:bg-blue-950/20 font-extrabold text-blue-700 dark:text-blue-300">
                    {fmt(summary.thisPeriod.gross)}
                  </td>
                  <td className="border-r border-foreground p-2 text-right font-extrabold">{fmt(summary.cumulative.gross)}</td>
                  <td className="p-2 text-center font-bold text-emerald-700 dark:text-emerald-400 bg-emerald-50/40 dark:bg-emerald-950/20">
                    {summary.progressPct.toFixed(2)}%
                  </td>
                </tr>

                {/* Row B: VAT 13% of A */}
                <tr className="hover:bg-muted/10">
                  <td className="border-r border-foreground p-2 text-center font-bold">B</td>
                  <td className="border-r border-foreground p-2 text-left">Vat 13% of A</td>
                  <td className="border-r border-foreground p-2 text-right text-muted-foreground">{fmt(summary.prev.vat)}</td>
                  <td className="border-r border-foreground p-2 text-right bg-blue-50/50 dark:bg-blue-950/20 font-semibold">{fmt(summary.thisPeriod.vat)}</td>
                  <td className="border-r border-foreground p-2 text-right font-semibold">{fmt(summary.cumulative.vat)}</td>
                  <td className="p-2 text-center"></td>
                </tr>

                {/* Row C: Total Bill Amount (A+B) */}
                <tr className="hover:bg-muted/10 font-bold bg-yellow-100/60 dark:bg-yellow-950/40 border-t-2 border-b-2 border-foreground">
                  <td className="border-r border-foreground p-2 text-center">C</td>
                  <td className="border-r border-foreground p-2 text-left uppercase">Total Bill Amount (A+B):</td>
                  <td className="border-r border-foreground p-2 text-right">{fmt(summary.prev.totalBill)}</td>
                  <td className="border-r border-foreground p-2 text-right text-yellow-900 dark:text-yellow-200 font-extrabold">
                    {fmt(summary.thisPeriod.totalBill)}
                  </td>
                  <td className="border-r border-foreground p-2 text-right font-extrabold">{fmt(summary.cumulative.totalBill)}</td>
                  <td className="p-2 text-center"></td>
                </tr>

                {/* Row D: Header Deductions */}
                <tr className="bg-muted/40 font-bold">
                  <td className="border-r border-foreground p-1 text-center">D</td>
                  <td colSpan={5} className="p-1 pl-2 text-left uppercase text-[11px] text-muted-foreground">
                    Deductions:
                  </td>
                </tr>

                {/* Row E: Mobilization Advance Recovery */}
                <tr className="hover:bg-muted/10 bg-yellow-50/30 dark:bg-yellow-950/10">
                  <td className="border-r border-foreground p-2 text-center font-bold">E</td>
                  <td className="border-r border-foreground p-2 text-left">Mobilization Advance (@ % of work done)</td>
                  <td className="border-r border-foreground p-2 text-right">{fmt(summary.prev.advance)}</td>
                  <td className="border-r border-foreground p-2 text-right bg-blue-50/50 dark:bg-blue-950/20 font-semibold text-amber-700 dark:text-amber-300">
                    {fmt(summary.thisPeriod.advance)}
                  </td>
                  <td className="border-r border-foreground p-2 text-right font-semibold">{fmt(summary.cumulative.advance)}</td>
                  <td className="p-2 text-center"></td>
                </tr>

                {/* Row F: Retention Amount @ 5% of A */}
                <tr className="hover:bg-muted/10">
                  <td className="border-r border-foreground p-2 text-center font-bold">F</td>
                  <td className="border-r border-foreground p-2 text-left">Retention Amount @ 5% of A</td>
                  <td className="border-r border-foreground p-2 text-right">{fmt(summary.prev.retention)}</td>
                  <td className="border-r border-foreground p-2 text-right bg-blue-50/50 dark:bg-blue-950/20 font-semibold">{fmt(summary.thisPeriod.retention)}</td>
                  <td className="border-r border-foreground p-2 text-right font-semibold">{fmt(summary.cumulative.retention)}</td>
                  <td className="p-2 text-center"></td>
                </tr>

                {/* Row G: TDS @ 1.5% of A */}
                <tr className="hover:bg-muted/10">
                  <td className="border-r border-foreground p-2 text-center font-bold">G</td>
                  <td className="border-r border-foreground p-2 text-left">TDS @ 1.5% of A (Nepal Sec 89)</td>
                  <td className="border-r border-foreground p-2 text-right text-red-600">{fmt(summary.prev.tds)}</td>
                  <td className="border-r border-foreground p-2 text-right bg-blue-50/50 dark:bg-blue-950/20 font-semibold text-red-600">{fmt(summary.thisPeriod.tds)}</td>
                  <td className="border-r border-foreground p-2 text-right font-semibold text-red-600">{fmt(summary.cumulative.tds)}</td>
                  <td className="p-2 text-center"></td>
                </tr>

                {/* Row H: Total Deduction Amount (E+F+G) */}
                <tr className="hover:bg-muted/10 font-bold bg-muted/30 border-t-2 border-foreground">
                  <td className="border-r border-foreground p-2 text-center">H</td>
                  <td className="border-r border-foreground p-2 text-left uppercase">Total Deduction Amount (E+F+G)</td>
                  <td className="border-r border-foreground p-2 text-right text-red-700">{fmt(summary.prev.totalDeductions)}</td>
                  <td className="border-r border-foreground p-2 text-right bg-blue-50/50 dark:bg-blue-950/20 text-red-700 font-bold">
                    {fmt(summary.thisPeriod.totalDeductions)}
                  </td>
                  <td className="border-r border-foreground p-2 text-right font-bold text-red-700">{fmt(summary.cumulative.totalDeductions)}</td>
                  <td className="p-2 text-center"></td>
                </tr>

                {/* Row I: Net Payable Amount Including VAT (C-H) */}
                <tr className="hover:bg-muted/10 font-extrabold bg-yellow-200/90 dark:bg-yellow-900/50 border-t-2 border-foreground text-sm">
                  <td className="border-r border-foreground p-2 text-center">I</td>
                  <td className="border-r border-foreground p-2 text-left uppercase text-yellow-950 dark:text-yellow-100">
                    Net Payable Amount Including VAT (C-H)
                  </td>
                  <td className="border-r border-foreground p-2 text-right">{fmt(summary.prev.netPayable)}</td>
                  <td className="border-r border-foreground p-2 text-right font-black text-blue-950 dark:text-blue-200">
                    NRs. {fmt(summary.thisPeriod.netPayable)}
                  </td>
                  <td className="border-r border-foreground p-2 text-right font-black">
                    NRs. {fmt(summary.cumulative.netPayable)}
                  </td>
                  <td className="p-2 text-center"></td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Legal Amount in Words Box (Standard Nepal Statutory Requirement) */}
          <div className="rounded-lg border bg-muted/20 p-3 space-y-1 text-xs font-mono">
            <div className="flex items-start gap-2">
              <span className="font-bold text-muted-foreground whitespace-nowrap">Net Payable (In Words - EN):</span>
              <span className="font-semibold text-foreground italic">{amountInWords(summary.thisPeriod.netPayable, "en")}</span>
            </div>
            <div className="flex items-start gap-2">
              <span className="font-bold text-muted-foreground whitespace-nowrap">भुक्तानी योग्य रकम (अक्षरूपी):</span>
              <span className="font-semibold text-emerald-700 dark:text-emerald-300 font-sans">{amountInWords(summary.thisPeriod.netPayable, "np")}</span>
            </div>
          </div>

          {/* 3-Party Official Signatures Block */}
          <div className="grid grid-cols-3 gap-6 pt-12 pb-4 text-center text-xs">
            <div className="space-y-1">
              <div className="border-t border-foreground pt-1.5 font-bold uppercase text-[11px]">
                Submitted by:
              </div>
              <p className="font-semibold text-foreground">{submittedBy}</p>
              <p className="text-[10px] text-muted-foreground">{submittedByLoc}</p>
            </div>

            <div className="space-y-1">
              <div className="border-t border-foreground pt-1.5 font-bold uppercase text-[11px]">
                Checked by:
              </div>
              <p className="font-semibold text-foreground">{checkedBy}</p>
              <p className="text-[10px] text-muted-foreground">{checkedByLoc}</p>
            </div>

            <div className="space-y-1">
              <div className="border-t border-foreground pt-1.5 font-bold uppercase text-[11px]">
                Approved by:
              </div>
              <p className="font-semibold text-foreground">{approvedBy}</p>
              <p className="text-[10px] text-muted-foreground">{approvedByLoc}</p>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}
