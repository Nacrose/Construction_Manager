"use client";

import { use, useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Printer, HardHat, Loader2, ClipboardList, Users, ArrowDownRight, Package } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc-client";
import { DocumentTrail } from "@/components/documents/document-trail";
import { fmt, pct, type IpcItem } from "./components/helpers";
import { SectionGroup } from "./components/section-group";
import { IpcVersionDiff } from "./components/ipc-version-diff";
import { IpcPaymentSummarySheet } from "./components/ipc-payment-summary-sheet";

type _DebitItem = {
  id: string;
  date: Date;
  material: { name: string; code: string | null; unit: string };
  quantity: number;
  unit: string;
  rate: number;
  recoveryRate: number | null;
  reference: string | null;
  remarks: string | null;
};

const STATUS_STYLES: Record<string, string> = {
  draft: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  submitted: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
  certified: "bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300",
  approved: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
  paid: "bg-emerald-600 text-white",
};

export default function IpcDetailPage({
  params,
}: {
  params: Promise<{ id: string; ipcId: string }>;
}) {
  const { id, ipcId } = use(params);
  const utils = trpc.useUtils();
  const [viewMode, setViewMode] = useState<"summary" | "measurement">("summary");

  const { data: projectInfo } = trpc.project.get.useQuery({ id }, { staleTime: 300_000 });

  const { data, isLoading, error } = trpc.ipc.listItems.useQuery({ ipcId });

  // Query subcontractor's debit statement details if this is a subcontractor-specific bill
  const { data: subLedger } = trpc.partner.getSubcontractor.useQuery(
    { projectId: id, subId: data?.ipc.subcontractorId || "" },
    { enabled: !!data?.ipc.subcontractorId }
  );

  const canWrite = projectInfo?.myRole && projectInfo.myRole !== "client" && projectInfo.myRole !== "inspector";

  const loadBoqMutation = trpc.ipc.loadBoq.useMutation({
    onSuccess: (d) => {
      utils.ipc.listItems.invalidate({ ipcId });
      utils.ipc.list.invalidate({ projectId: id });
      toast.success(`Loaded ${d.loaded} BOQ items`);
    },
    onError: (e) => toast.error(e.message),
  });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-6 w-32" />
        <Skeleton className="h-10 w-2/3" />
        <Skeleton className="h-96" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <Card className="p-12 text-center">
        <p className="text-destructive">{error?.message ?? "IPC not found."}</p>
        <Link href={`/projects/${id}/ipc`} className="mt-4 inline-block text-sm text-emerald-600 hover:underline">
          Back to IPCs
        </Link>
      </Card>
    );
  }

  const { ipc, items, materialDeductions } = data;
  const isDraft = ipc.status === "draft";

  // Group items by section
  const sections: { name: string; items: IpcItem[] }[] = [];
  const sectionMap = new Map<string, IpcItem[]>();
  items.forEach((item) => {
    const sectionName = item.section ?? "Uncategorized";
    if (!sectionMap.has(sectionName)) sectionMap.set(sectionName, []);
    sectionMap.get(sectionName)!.push(item as IpcItem);
  });
  sectionMap.forEach((items, name) => sections.push({ name, items }));

  // Calculate section subtotals
  function sectionTotal(sectionItems: IpcItem[]) {
    return sectionItems.reduce(
      (acc, i) => ({
        contractAmt: acc.contractAmt + i.contractQty * i.rate,
        cumAmt: acc.cumAmt + i.cumQty * i.rate,
        prevAmt: acc.prevAmt + i.previousQty * i.rate,
        thisAmt: acc.thisAmt + i.amount,
      }),
      { contractAmt: 0, cumAmt: 0, prevAmt: 0, thisAmt: 0 }
    );
  }

  const grandContract = items.reduce((s, i) => s + i.contractQty * i.rate, 0);
  const grandCum = items.reduce((s, i) => s + i.cumQty * i.rate, 0);
  const grandPrev = items.reduce((s, i) => s + i.previousQty * i.rate, 0);
  const grandThis = items.reduce((s, i) => s + i.amount, 0);

  return (
    <div className="space-y-6">
      {/* No-print toolbar */}
      <div className="no-print flex items-center justify-between">
        <Link href={`/projects/${id}/ipc`} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Back to IPCs
        </Link>
        <div className="flex items-center gap-2">
          {/* View Mode Toggle */}
          <div className="inline-flex rounded-md border bg-card p-0.5 text-xs">
            <button
              type="button"
              onClick={() => setViewMode("summary")}
              className={`px-3 py-1 rounded text-xs font-semibold transition-colors ${
                viewMode === "summary"
                  ? "bg-primary text-primary-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Summary of Payment (Anusuchi Sheet)
            </button>
            <button
              type="button"
              onClick={() => setViewMode("measurement")}
              className={`px-3 py-1 rounded text-xs font-semibold transition-colors ${
                viewMode === "measurement"
                  ? "bg-primary text-primary-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Line Item Measurement (BOQ Run Bill)
            </button>
          </div>

          {isDraft && canWrite && items.length === 0 && (
            <Button variant="outline" size="sm" onClick={() => loadBoqMutation.mutate({ ipcId })} disabled={loadBoqMutation.isPending}>
              {loadBoqMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ClipboardList className="mr-2 h-4 w-4" />}
              Load from BOQ
            </Button>
          )}
        </div>
      </div>

      {viewMode === "summary" ? (
        <IpcPaymentSummarySheet projectId={id} ipcId={ipcId} canWrite={canWrite} />
      ) : (
        <>
          {/* Print-only header */}
          <div className="hidden print:block print-area mb-6">
            <div className="flex items-center justify-between border-b-2 border-black pb-3">
              <div className="flex items-center gap-2">
                <div className="flex h-9 w-9 items-center justify-center rounded bg-black text-white">
                  <HardHat className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-lg font-bold">Construction Manager</p>
                  <p className="text-xs">{projectInfo?.project?.code} · {projectInfo?.project?.name}</p>
                </div>
              </div>
              <div className="text-right text-xs">
                <p className="font-semibold text-base">Interim Payment Certificate</p>
                <p>{ipc.number} · {ipc.period ?? ""}</p>
                {ipc.subcontractor && <p className="font-medium text-emerald-700">Subcontractor: {ipc.subcontractor.name}</p>}
              </div>
            </div>
          </div>

          <div className="print-area space-y-6">
            {/* Screen header */}
            <div className="no-print flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-sm text-muted-foreground">{ipc.number}</span>
                  <Badge variant="secondary" className={`capitalize ${STATUS_STYLES[ipc.status] ?? STATUS_STYLES.draft}`}>{ipc.status}</Badge>
                  {ipc.period && <span className="text-sm text-muted-foreground">{ipc.period}</span>}
                  {ipc.subcontractor && (
                    <Badge variant="outline" className="bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300 gap-1 text-xs">
                      <Users className="h-3.5 w-3.5" /> Subcontractor Bill
                    </Badge>
                  )}
                </div>
                <h1 className="mt-2 text-2xl font-semibold tracking-tight">Interim Payment Certificate</h1>
                <p className="text-sm text-muted-foreground">
                  {projectInfo?.project?.code} · {projectInfo?.project?.name}
                </p>
              </div>
              {ipc.subcontractor && (
                <Card className="bg-blue-50/50 border-blue-200 dark:bg-slate-900 dark:border-slate-800 p-3 max-w-xs shrink-0">
                  <div className="flex items-center gap-2">
                    <Users className="h-5 w-5 text-blue-600" />
                    <div>
                      <p className="text-xs text-muted-foreground">Assigned Subcontractor</p>
                      <p className="text-sm font-bold text-blue-950 dark:text-blue-200">{ipc.subcontractor.name}</p>
                    </div>
                  </div>
                </Card>
              )}
            </div>

            {items.length === 0 ? (
              <Card className="p-12 text-center">
                <ClipboardList className="mx-auto h-12 w-12 text-muted-foreground" />
                <p className="mt-3 font-medium">No line items in this IPC yet</p>
                <p className="text-sm text-muted-foreground">
                  {isDraft && canWrite
                    ? "Click \"Load from BOQ\" to populate this IPC with all BOQ items."
                    : "Items will appear here once loaded."}
                </p>
              </Card>
            ) : (
              <Card className="print-card">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    {/* Multi-row header matching the sample format */}
                    <thead className="border-b-2 bg-muted/40">
                      <tr className="text-left">
                        <th rowSpan={2} className="border-r p-2 font-medium">Pay Item No.</th>
                        <th rowSpan={2} className="border-r p-2 font-medium">Description</th>
                        <th rowSpan={2} className="border-r p-2 font-medium">Unit</th>
                        <th colSpan={3} className="border-r p-2 text-center font-medium">Bill of Quantities</th>
                        <th colSpan={2} className="border-r p-2 text-center font-medium">Up to Date of work till now</th>
                        <th colSpan={2} className="border-r p-2 text-center font-medium">Previous Bill</th>
                        <th colSpan={2} className="border-r p-2 text-center font-medium">Currently Accomplished work</th>
                        <th rowSpan={2} className="border-r p-2 font-medium">% Completion</th>
                        <th rowSpan={2} className="p-2 font-medium">Balance %</th>
                      </tr>
                      <tr className="text-left">
                        <th className="border-r border-t p-2 font-normal">Qty (Contract)</th>
                        <th className="border-r border-t p-2 font-normal">Rate</th>
                        <th className="border-r border-t p-2 font-normal">Amount</th>
                        <th className="border-r border-t p-2 font-normal">Qty</th>
                        <th className="border-r border-t p-2 font-normal">Amount</th>
                        <th className="border-r border-t p-2 font-normal">Qty</th>
                        <th className="border-r border-t p-2 font-normal">Amount</th>
                        <th className="border-r border-t p-2 font-normal">Qty</th>
                        <th className="border-r border-t p-2 font-normal">Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sections.map((section, si) => {
                        const sub = sectionTotal(section.items);
                        return (
                          <SectionGroup
                            key={si}
                            name={section.name}
                            items={section.items}
                            canWrite={!!canWrite && isDraft}
                            sub={sub}
                            ipcId={ipcId}
                            projectId={id}
                          />
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr className="border-t-2 bg-muted/40 font-bold">
                        <td colSpan={5} className="p-2 text-right">GRAND TOTAL</td>
                        <td className="border-r p-2 text-right">{fmt(grandContract)}</td>
                        <td className="border-r p-2 text-right">{fmt(grandCum)}</td>
                        <td colSpan={2} className="p-2"></td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </Card>
            )}

            {/* Summary Cards */}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5 no-print">
              <Card className="p-4">
                <p className="text-xs text-muted-foreground">Gross amount (this bill)</p>
                <p className="mt-1 text-lg font-semibold text-emerald-700 dark:text-emerald-400">
                  NPR {fmt(ipc.grossAmount)}
                </p>
              </Card>
              <Card className="p-4 border-amber-200 bg-amber-50/30">
                <p className="text-xs text-muted-foreground">VAT ({ipc.vatPercent ?? 0}%)</p>
                <p className="mt-1 text-lg font-semibold text-amber-600">
                  NPR {fmt(ipc.vatAmount ?? 0)}
                </p>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  Total with VAT: NPR {fmt(ipc.totalWithVat ?? (ipc.grossAmount + (ipc.vatAmount ?? 0)))}
                </p>
              </Card>
              <Card className="p-4">
                <p className="text-xs text-muted-foreground">Retention ({ipc.retention}%)</p>
                <p className="mt-1 text-lg font-semibold text-amber-600">
                  NPR {fmt(ipc.retentionAmount)}
                </p>
              </Card>
              <Card className="p-4">
                <p className="text-xs text-muted-foreground">Advance recovery</p>
                <p className="mt-1 text-lg font-semibold text-amber-600">
                  NPR {fmt(ipc.advanceRecovery)}
                </p>
              </Card>
              <Card className="p-4 border-red-200 bg-red-50/10">
                <p className="text-xs text-muted-foreground">TDS ({ipc.tdsPercent ?? 0}%)</p>
                <p className="mt-1 text-lg font-semibold text-red-600 flex items-center">
                  <ArrowDownRight className="h-4 w-4 mr-0.5" /> NPR {fmt(ipc.tdsAmount ?? 0)}
                </p>
              </Card>
            </div>

            {/* Final payable — prominent display */}
            <Card className="p-5 border-emerald-300 dark:border-emerald-800 bg-emerald-50/20 no-print">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground uppercase">Final Payable to Contractor</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    (Gross + VAT) − Retention − Advance − TDS
                  </p>
                </div>
                <p className="text-2xl font-bold text-emerald-700 dark:text-emerald-400">
                  NPR {fmt(ipc.finalPayable ?? ipc.netPayable)}
                </p>
              </div>
            </Card>

            {/* Material deductions (separate card if any) */}
            {materialDeductions > 0 && (
              <Card className="p-4 border-red-200 bg-red-50/10 no-print">
                <p className="text-xs text-muted-foreground">Material Issue Deductions (subcontractor debits)</p>
                <p className="mt-1 text-lg font-semibold text-red-600">
                  NPR {fmt(materialDeductions)}
                </p>
              </Card>
            )}

            {/* Print-only summary */}
            <div className="hidden print:block">
              <table className="w-full text-sm">
                <tbody>
                  <tr className="border-b"><td className="py-1 pr-4 font-medium">Gross amount (this bill):</td><td className="py-1 text-right">NPR {fmt(ipc.grossAmount)}</td></tr>
                  <tr className="border-b"><td className="py-1 pr-4 font-medium">VAT ({ipc.vatPercent ?? 0}%):</td><td className="py-1 text-right">NPR {fmt(ipc.vatAmount ?? 0)}</td></tr>
                  <tr className="border-b font-semibold"><td className="py-1 pr-4">Total with VAT:</td><td className="py-1 text-right">NPR {fmt(ipc.totalWithVat ?? (ipc.grossAmount + (ipc.vatAmount ?? 0)))}</td></tr>
                  <tr className="border-b"><td className="py-1 pr-4 font-medium">Retention ({ipc.retention}%):</td><td className="py-1 text-right">NPR {fmt(ipc.retentionAmount)}</td></tr>
                  <tr className="border-b"><td className="py-1 pr-4 font-medium">Advance recovery:</td><td className="py-1 text-right">NPR {fmt(ipc.advanceRecovery)}</td></tr>
                  <tr className="border-b text-red-600"><td className="py-1 pr-4 font-medium">TDS ({ipc.tdsPercent ?? 0}%):</td><td className="py-1 text-right">-NPR {fmt(ipc.tdsAmount ?? 0)}</td></tr>
                  {materialDeductions > 0 && (
                    <tr className="border-b text-red-600"><td className="py-1 pr-4 font-medium">Material issue deductions:</td><td className="py-1 text-right">-NPR {fmt(materialDeductions)}</td></tr>
                  )}
                  <tr className="border-t-2 font-bold"><td className="py-2 pr-4">Final payable:</td><td className="py-2 text-right">NPR {fmt(ipc.finalPayable ?? ipc.netPayable)}</td></tr>
                </tbody>
              </table>
            </div>

            {/* BOQ Version Diff */}
            {ipc.boqVersion && (
              <IpcVersionDiff projectId={id} boqVersionId={ipc.boqVersion.id} boqVersionNumber={ipc.boqVersion.versionNumber} />
            )}

            {/* Subcontractor Issued Materials List (Debit Recovery Details) */}
            {ipc.subcontractorId && subLedger && subLedger.debits.length > 0 && (
              <Card className="print-card">
                <CardHeader className="pb-3 border-b">
                  <CardTitle className="text-base flex items-center gap-1.5"><Package className="h-4 w-4 text-emerald-600" /> Issued Materials Recovery Details</CardTitle>
                  <CardDescription>Breakdown of debitable store issues subtracted from this subcontractor's payment.</CardDescription>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead className="bg-muted/30 text-left text-muted-foreground border-b">
                        <tr>
                          <th className="p-3 font-medium">Date</th>
                          <th className="p-3 font-medium">Material Name</th>
                          <th className="p-3 text-right font-medium">Quantity</th>
                          <th className="p-3 text-right font-medium">Recovery Rate</th>
                          <th className="p-3 text-right font-medium">Total Recovered</th>
                          <th className="p-3 font-medium">Store Reference</th>
                        </tr>
                      </thead>
                      <tbody>
                        {subLedger.debits.map((item) => {
                          const chargeRate = item.recoveryRate ?? item.rate;
                          const totalCost = item.quantity * chargeRate;
                          return (
                            <tr key={item.id} className="border-b hover:bg-muted/5 transition-colors">
                              <td className="p-3 text-muted-foreground whitespace-nowrap">{format(new Date(item.date), "dd MMM yyyy")}</td>
                              <td className="p-3 font-medium">{item.material.name} {item.material.code && `(${item.material.code})`}</td>
                              <td className="p-3 text-right font-semibold">{item.quantity.toLocaleString()} {item.unit}</td>
                              <td className="p-3 text-right text-muted-foreground">NPR {chargeRate.toLocaleString()}</td>
                              <td className="p-3 text-right font-semibold text-red-600">NPR {totalCost.toLocaleString()}</td>
                              <td className="p-3 font-mono text-muted-foreground">{item.reference || "—"}</td>
                            </tr>
                          );
                        })}
                        <tr className="font-bold bg-muted/20">
                          <td colSpan={4} className="p-3 text-right">TOTAL MATERIAL RECOVERY DEDUCTION</td>
                          <td className="p-3 text-right text-red-600">NPR {materialDeductions.toLocaleString()}</td>
                          <td></td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Premium secure digital stamps */}
            <div className="mt-8 border-t pt-6 grid grid-cols-3 gap-6 print:gap-4 print:mt-6">
              {/* Stamp 1: Prepared */}
              <div className="border border-blue-200 dark:border-blue-900 rounded-lg p-3 bg-blue-50/20 dark:bg-blue-950/10 flex flex-col items-center text-center">
                <p className="text-[10px] font-bold text-blue-600 dark:text-blue-400 tracking-wider uppercase">Prepared By</p>
                <div className="my-2 border border-dashed border-blue-400 dark:border-blue-700 px-3 py-1 text-xs font-serif font-bold text-blue-800 dark:text-blue-300 select-none bg-white dark:bg-slate-900">
                  CONSTRUCTION MGR
                  <br />
                  <span className="text-[8px] font-mono tracking-tight font-normal">SECURE STAMP</span>
                </div>
                <p className="text-xs font-semibold text-foreground mt-1">Author</p>
                <p className="text-[9px] text-muted-foreground">{ipc.createdAt ? format(new Date(ipc.createdAt), "dd MMM yyyy") : ""}</p>
              </div>

              {/* Stamp 2: Checked */}
              <div className="border border-purple-200 dark:border-purple-900 rounded-lg p-3 bg-purple-50/20 dark:bg-purple-950/10 flex flex-col items-center text-center">
                <p className="text-[10px] font-bold text-purple-600 dark:text-purple-400 tracking-wider uppercase">Checked By</p>
                {ipc.status === "checked" || ipc.status === "approved" || ipc.status === "paid" ? (
                  <>
                    <div className="my-2 border border-dashed border-purple-400 dark:border-purple-700 px-3 py-1 text-xs font-serif font-bold text-purple-800 dark:text-purple-300 select-none bg-white dark:bg-slate-900">
                      VERIFIED OK
                      <br />
                      <span className="text-[8px] font-mono tracking-tight font-normal">SECURE STAMP</span>
                    </div>
                    <p className="text-xs font-semibold text-foreground mt-1">Project Coordinator</p>
                  </>
                ) : (
                  <p className="text-xs text-muted-foreground italic my-auto py-4">Pending checking</p>
                )}
              </div>

              {/* Stamp 3: Approved */}
              <div className="border border-emerald-200 dark:border-emerald-900 rounded-lg p-3 bg-emerald-50/20 dark:bg-emerald-950/10 flex flex-col items-center text-center">
                <p className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 tracking-wider uppercase">Approved By</p>
                {ipc.status === "approved" || ipc.status === "paid" ? (
                  <>
                    <div className="my-2 border border-dashed border-emerald-400 dark:border-emerald-700 px-3 py-1 text-xs font-serif font-bold text-emerald-800 dark:text-emerald-300 select-none bg-white dark:bg-slate-900">
                      APPROVED
                      <br />
                      <span className="text-[8px] font-mono tracking-tight font-normal">SECURE STAMP</span>
                    </div>
                    <p className="text-xs font-semibold text-foreground mt-1">Project Manager</p>
                  </>
                ) : (
                  <p className="text-xs text-muted-foreground italic my-auto py-4">Pending approval</p>
                )}
              </div>
            </div>
          </div>
        </>
      )}

      {/* Document Trail — signed hardcopy archive */}
      <DocumentTrail
        projectId={id}
        entityType="ipc"
        entityId={ipcId}
        defaultSignedBy={projectInfo?.project?.client ?? undefined}
      />
    </div>
  );
}


