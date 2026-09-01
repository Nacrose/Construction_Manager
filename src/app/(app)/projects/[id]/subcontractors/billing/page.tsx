"use client";

import { use, useState, useMemo } from "react";
import { trpc } from "@/lib/trpc-client";
import { AnimatedPage } from "@/components/ui/animated-page";
import { ModuleTabs } from "@/components/module-tabs";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Plus,
  ReceiptText,
  FileSpreadsheet,
  Check,
  Loader2,
  Trash2,
  Send,
  Award,
  Banknote,
  ArrowLeft,
  ChevronDown,
  ChevronUp,
  TrendingUp,
  TrendingDown,
} from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { formatNpr } from "@/lib/construction-finance";
import { StatusBadge } from "@/components/ui/status-badge";

import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ReconciliationMatrixTab } from "./components/reconciliation-matrix-tab";
import { MaterialReconciliationTab } from "./components/material-reconciliation-tab";
import { VerifyBillDialog } from "./dialogs/verify-bill-dialog";
import {
  ShieldCheck,
  Layers,
  Package,
} from "lucide-react";

const RES_TABS = [
  { label: "Materials & Procurement", href: "/materials" },
  { label: "Resource & Rate Library", href: "/rate-library" },
  { label: "Equipment & Fleet", href: "/equipment" },
  { label: "Plant & Production", href: "/production" },
  { label: "Subcontractors", href: "/subcontractors" },
  { label: "HR / Staff", href: "/hr" },
  { label: "Vendors Directory", href: "/vendors" },
];

type BillItem = {
  boqCode: string;
  description: string;
  unit: string;
  contractQty: number;
  previousQty: number;
  thisQty: number;
  rate: number;
};

export default function SubcontractorBillingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const utils = trpc.useUtils();

  const [activeMainTab, setActiveMainTab] = useState<"bills" | "matrix" | "materials">("bills");
  const [subFilter, setSubFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedBillId, setSelectedBillId] = useState<string | null>(null);
  const [verifyBillId, setVerifyBillId] = useState<string | null>(null);
  const [expandedBillId, setExpandedBillId] = useState<string | null>(null);

  const { data: projectInfo } = trpc.project.get.useQuery({ id }, { staleTime: 300_000 });
  const { data: subsData } = trpc.partner.listSubcontractors.useQuery({ projectId: id });
  const { data: billsData, isLoading } = trpc.subcontractorBill.list.useQuery({
    projectId: id,
    subcontractorId: subFilter === "all" ? undefined : subFilter,
    status: statusFilter as any,
  });

  const { data: billDetail, isLoading: isDetailLoading } = trpc.subcontractorBill.get.useQuery(
    { projectId: id, billId: selectedBillId || "" },
    { enabled: !!selectedBillId }
  );

  const { data: verifyBillDetail } = trpc.subcontractorBill.get.useQuery(
    { projectId: id, billId: verifyBillId || "" },
    { enabled: !!verifyBillId }
  );

  const canWrite = Boolean(projectInfo?.myRole && projectInfo.myRole !== "client" && projectInfo.myRole !== "inspector");
  const isAdmin = projectInfo?.myRole === "project_manager" || projectInfo?.myRole === "coordinator";

  const submitMut = trpc.subcontractorBill.submit.useMutation({
    onSuccess: () => {
      toast.success("Bill submitted for certification");
      utils.subcontractorBill.list.invalidate({ projectId: id });
      if (selectedBillId) utils.subcontractorBill.get.invalidate({ projectId: id, billId: selectedBillId });
    },
    onError: (e) => toast.error(e.message),
  });

  const certifyMut = trpc.subcontractorBill.certify.useMutation({
    onSuccess: () => {
      toast.success("Bill certified");
      utils.subcontractorBill.list.invalidate({ projectId: id });
      if (selectedBillId) utils.subcontractorBill.get.invalidate({ projectId: id, billId: selectedBillId });
    },
    onError: (e) => toast.error(e.message),
  });

  const markPaidMut = trpc.subcontractorBill.markPaid.useMutation({
    onSuccess: (res) => {
      toast.success(`Payment recorded. Remaining: NPR ${res.remaining.toLocaleString()}`);
      utils.subcontractorBill.list.invalidate({ projectId: id });
      if (selectedBillId) utils.subcontractorBill.get.invalidate({ projectId: id, billId: selectedBillId });
    },
    onError: (e) => toast.error(e.message),
  });

  const deleteMut = trpc.subcontractorBill.delete.useMutation({
    onSuccess: () => {
      toast.success("Draft bill deleted");
      setSelectedBillId(null);
      utils.subcontractorBill.list.invalidate({ projectId: id });
    },
    onError: (e) => toast.error(e.message),
  });

  const statusColor = (status: string) => {
    switch (status) {
      case "draft": return "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300";
      case "submitted": return "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300";
      case "verified": return "bg-teal-100 text-teal-800 dark:bg-teal-950 dark:text-teal-300";
      case "certified": return "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300";
      case "paid": return "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300";
      case "disputed": return "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300";
      default: return "bg-muted text-muted-foreground";
    }
  };

  return (
    <>
      <ModuleTabs projectId={id} tabs={RES_TABS} />
      <AnimatedPage className="space-y-4 pb-8">
        {/* Primary Subcontractor Tabs & Actions */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Tabs value={activeMainTab} onValueChange={(v) => setActiveMainTab(v as any)} className="w-full">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
              <TabsList className="grid grid-cols-3 w-full sm:w-[540px] bg-[#f8fbfe] border border-[#c7d8e8] p-1 rounded-xl">
                <TabsTrigger value="bills" className="text-xs gap-1.5 data-[state=active]:bg-amber-500 data-[state=active]:text-black">
                  <ReceiptText className="h-3.5 w-3.5" /> Bills Register
                </TabsTrigger>
                <TabsTrigger value="matrix" className="text-xs gap-1.5 data-[state=active]:bg-amber-500 data-[state=active]:text-black">
                  <Layers className="h-3.5 w-3.5" /> Reconciliation Matrix
                </TabsTrigger>
                <TabsTrigger value="materials" className="text-xs gap-1.5 data-[state=active]:bg-amber-500 data-[state=active]:text-black">
                  <Package className="h-3.5 w-3.5" /> Material Recovery
                </TabsTrigger>
              </TabsList>

              {canWrite && (
                <Button size="sm" onClick={() => setCreateOpen(true)} className="h-9 px-4 text-xs font-bold amber-cta-btn rounded-xl shadow-[0_0_20px_rgba(0,255,102,0.3)] transition gap-1.5 shrink-0">
                  <Plus className="h-3.5 w-3.5" /> + New Subcontractor Bill
                </Button>
              )}
            </div>

          {/* TAB 1: BILLS REGISTER */}
          <TabsContent value="bills" className="space-y-4 m-0">
            {/* Stats Cards */}
            {billsData && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <Card className="shadow-xs">
                  <CardContent className="p-3">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Total Bills</p>
                    <p className="text-2xl font-bold">{billsData.bills.length}</p>
                  </CardContent>
                </Card>
                <Card className="shadow-xs">
                  <CardContent className="p-3">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Total Billed</p>
                    <p className="text-2xl font-bold text-foreground">NPR {formatNpr(billsData.summary.totalBilled)}</p>
                  </CardContent>
                </Card>
                <Card className="shadow-xs">
                  <CardContent className="p-3">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Outstanding</p>
                    <p className="text-2xl font-bold text-amber-600">NPR {formatNpr(billsData.summary.outstanding)}</p>
                  </CardContent>
                </Card>
                <Card className="shadow-xs">
                  <CardContent className="p-3">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Paid</p>
                    <p className="text-2xl font-bold text-emerald-600">NPR {formatNpr(billsData.summary.totalPaid)}</p>
                  </CardContent>
                </Card>
              </div>
            )}

            {/* Filters */}
            <div className="flex flex-col sm:flex-row gap-2">
              <Select value={subFilter} onValueChange={setSubFilter}>
                <SelectTrigger className="w-full sm:w-48 h-8 text-xs">
                  <SelectValue placeholder="All Subcontractors" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Subcontractors</SelectItem>
                  {subsData?.subcontractors?.map((sub: any) => (
                    <SelectItem key={sub.id} value={sub.id}>{sub.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="flex items-center gap-1 bg-muted/40 p-0.5 rounded-lg text-xs">
                {["all", "draft", "submitted", "verified", "certified", "paid"].map((st) => (
                  <button
                    key={st}
                    onClick={() => setStatusFilter(st)}
                    className={cn(
                      "px-2.5 py-1 rounded-md capitalize transition-colors font-medium",
                      statusFilter === st
                        ? "bg-card text-foreground shadow-2xs font-semibold"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {st}
                  </button>
                ))}
              </div>
            </div>

        {/* Bills Table */}
        {isLoading ? (
          <Skeleton className="h-64 rounded-xl" />
        ) : !billsData?.bills?.length ? (
          <Card>
            <CardContent className="flex flex-col items-center gap-2 p-12 text-center text-muted-foreground">
              <FileSpreadsheet className="h-10 w-10 opacity-40" />
              <p className="text-sm font-medium">No bills found</p>
              <p className="text-xs">Create a subcontractor bill to get started.</p>
            </CardContent>
          </Card>
        ) : (
          <Card className="overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="border-b bg-muted/30 text-left text-muted-foreground">
                  <tr>
                    <th className="p-3 font-medium w-8" />
                    <th className="p-3 font-medium">#</th>
                    <th className="p-3 font-medium">Subcontractor</th>
                    <th className="p-3 font-medium">Period</th>
                    <th className="p-3 font-medium text-right">Gross</th>
                    <th className="p-3 font-medium text-right">Retention</th>
                    <th className="p-3 font-medium text-right">VAT</th>
                    <th className="p-3 font-medium text-right">Net Payable</th>
                    <th className="p-3 font-medium text-right">Paid</th>
                    <th className="p-3 font-medium text-center">Status</th>
                    <th className="p-3 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {billsData.bills.map((bill: any) => {
                    const isExpanded = expandedBillId === bill.id;
                    return (
                      <>
                        <tr
                          key={bill.id}
                          className={cn(
                            "border-b hover:bg-muted/10 transition-colors cursor-pointer",
                            selectedBillId === bill.id && "bg-violet-50/40 dark:bg-violet-950/10"
                          )}
                          onClick={() => setSelectedBillId(bill.id)}
                        >
                          <td className="p-3">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setExpandedBillId(isExpanded ? null : bill.id);
                              }}
                              className="text-muted-foreground hover:text-foreground"
                            >
                              {isExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                            </button>
                          </td>
                          <td className="p-3 font-mono text-muted-foreground">{bill.number}</td>
                          <td className="p-3 font-medium">{bill.subcontractor.name}</td>
                          <td className="p-3 text-muted-foreground">{bill.period || "—"}</td>
                          <td className="p-3 text-right font-mono">NPR {formatNpr(bill.grossAmount)}</td>
                          <td className="p-3 text-right font-mono text-amber-600">NPR {formatNpr(bill.retentionAmount)}</td>
                          <td className="p-3 text-right font-mono">NPR {formatNpr(bill.vatAmount)}</td>
                          <td className="p-3 text-right font-bold font-mono">NPR {formatNpr(bill.netPayable)}</td>
                          <td className="p-3 text-right font-mono text-emerald-600">NPR {formatNpr(bill.paidAmount)}</td>
                          <td className="p-3 text-center">
                            <StatusBadge status={bill.status} size="xs" />
                          </td>
                          <td className="p-3 text-right">
                            <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                              {bill.status === "draft" && canWrite && (
                                <>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-6 text-[10px] text-blue-600"
                                    onClick={() => submitMut.mutate({ projectId: id, billId: bill.id })}
                                    disabled={submitMut.isPending}
                                  >
                                    <Send className="h-3 w-3 mr-1" /> Submit
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-6 text-[10px] text-red-500"
                                    onClick={() => deleteMut.mutate({ projectId: id, billId: bill.id })}
                                    disabled={deleteMut.isPending}
                                  >
                                    <Trash2 className="h-3 w-3" />
                                  </Button>
                                </>
                              )}
                              {(bill.status === "submitted" || bill.status === "verified") && isAdmin && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-6 text-[10px] text-emerald-700 dark:text-[#0284c7] border-emerald-300 dark:border-emerald-800 gap-1 bg-emerald-50/50 dark:bg-emerald-950/20"
                                  onClick={() => setVerifyBillId(bill.id)}
                                >
                                  <ShieldCheck className="h-3 w-3" /> Verify
                                </Button>
                              )}
                              {bill.status === "certified" && isAdmin && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-6 text-[10px] text-emerald-600"
                                  onClick={() => {
                                    const remaining = bill.netPayable - bill.paidAmount;
                                    markPaidMut.mutate({ projectId: id, billId: bill.id, amount: remaining });
                                  }}
                                  disabled={markPaidMut.isPending}
                                >
                                  <Banknote className="h-3 w-3 mr-1" /> Pay Full
                                </Button>
                              )}
                            </div>
                          </td>
                        </tr>
                        {/* Expanded row: line items preview */}
                        {isExpanded && (
                          <tr key={`${bill.id}-expanded`}>
                            <td colSpan={11} className="bg-muted/20 p-3">
                              <div className="text-[10px] space-y-1">
                                {bill.items?.length > 0 ? (
                                  <table className="w-full">
                                    <thead>
                                      <tr className="text-muted-foreground">
                                        <th className="text-left py-1 font-medium">Description</th>
                                        <th className="text-right py-1 font-medium">Qty</th>
                                        <th className="text-right py-1 font-medium">Rate</th>
                                        <th className="text-right py-1 font-medium">Amount</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {bill.items.map((item: any) => (
                                        <tr key={item.id} className="border-t border-border/30">
                                          <td className="py-1">
                                            {item.boqCode && <span className="font-mono text-muted-foreground mr-1">{item.boqCode}</span>}
                                            {item.description}
                                          </td>
                                          <td className="text-right py-1 font-mono">{item.thisQty} {item.unit}</td>
                                          <td className="text-right py-1 font-mono">NPR {item.rate.toLocaleString()}</td>
                                          <td className="text-right py-1 font-mono font-semibold">NPR {item.amount.toLocaleString()}</td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                ) : (
                                  <p className="text-muted-foreground">No line items</p>
                                )}
                              </div>
                            </td>
                          </tr>
                        )}
                      </>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        )}

        {/* Subcontractor Breakdown */}
        {billsData?.subcontractorBreakdown && billsData.subcontractorBreakdown.length > 0 && (
          <Card className="shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">By Subcontractor</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="border-b bg-muted/30 text-left text-muted-foreground">
                    <tr>
                      <th className="p-3 font-medium">Subcontractor</th>
                      <th className="p-3 font-medium text-right">Bills</th>
                      <th className="p-3 font-medium text-right">Billed</th>
                      <th className="p-3 font-medium text-right">Paid</th>
                      <th className="p-3 font-medium text-right">Outstanding</th>
                    </tr>
                  </thead>
                  <tbody>
                    {billsData.subcontractorBreakdown.map((sub: any) => (
                      <tr key={sub.name} className="border-b hover:bg-muted/10">
                        <td className="p-3 font-medium">{sub.name}</td>
                        <td className="p-3 text-right">{sub.billCount}</td>
                        <td className="p-3 text-right font-mono">NPR {sub.billed.toLocaleString()}</td>
                        <td className="p-3 text-right font-mono text-emerald-600">NPR {sub.paid.toLocaleString()}</td>
                        <td className="p-3 text-right font-mono text-amber-600">NPR {sub.outstanding.toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )}

            </TabsContent>

          {/* TAB 2: RECONCILIATION MATRIX */}
          <TabsContent value="matrix" className="space-y-4 m-0">
            <ReconciliationMatrixTab projectId={id} />
          </TabsContent>

          {/* TAB 3: MATERIAL ISSUE & RETURN RECONCILIATION */}
          <TabsContent value="materials" className="space-y-4 m-0">
            <MaterialReconciliationTab projectId={id} subcontractors={subsData?.subcontractors || []} />
          </TabsContent>
        </Tabs>
      </div>

        {/* Detail View Dialog */}
        {selectedBillId && (
          <Dialog open={!!selectedBillId} onOpenChange={(open) => !open && setSelectedBillId(null)}>
            <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
              {isDetailLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : billDetail?.bill ? (
                <BillDetailView
                  bill={billDetail.bill}
                  canWrite={canWrite}
                  isAdmin={isAdmin}
                  projectId={id}
                  onVerify={() => {
                    setVerifyBillId(selectedBillId);
                    setSelectedBillId(null);
                  }}
                  onRefresh={() => {
                    utils.subcontractorBill.get.invalidate({ projectId: id, billId: selectedBillId });
                    utils.subcontractorBill.list.invalidate({ projectId: id });
                  }}
                />
              ) : (
                <p className="text-center text-sm py-8 text-muted-foreground">Bill not found.</p>
              )}
            </DialogContent>
          </Dialog>
        )}

        {/* Line-Item Verification & Certification Dialog */}
        {verifyBillId && (
          <VerifyBillDialog
            projectId={id}
            bill={verifyBillDetail?.bill}
            open={!!verifyBillId}
            onOpenChange={(open) => !open && setVerifyBillId(null)}
            onSuccess={() => {
              utils.subcontractorBill.list.invalidate({ projectId: id });
              utils.subcontractorBill.getReconciliationMatrix.invalidate({ projectId: id });
              if (verifyBillId) {
                utils.subcontractorBill.get.invalidate({ projectId: id, billId: verifyBillId });
              }
              setVerifyBillId(null);
            }}
          />
        )}

        {/* Create Bill Dialog */}
        <CreateBillDialog
          projectId={id}
          open={createOpen}
          onOpenChange={setCreateOpen}
          subcontractors={subsData?.subcontractors || []}
          onSuccess={() => {
            utils.subcontractorBill.list.invalidate({ projectId: id });
            utils.subcontractorBill.getReconciliationMatrix.invalidate({ projectId: id });
            setCreateOpen(false);
          }}
        />
      </AnimatedPage>
    </>
  );
}

function BillDetailView({
  bill,
  canWrite,
  isAdmin,
  projectId,
  onVerify,
  onRefresh,
}: {
  bill: any;
  canWrite: boolean;
  isAdmin: boolean;
  projectId: string;
  onVerify?: () => void;
  onRefresh: () => void;
}) {
  const utils = trpc.useUtils();

  const submitMut = trpc.subcontractorBill.submit.useMutation({
    onSuccess: () => { toast.success("Bill submitted"); onRefresh(); },
    onError: (e) => toast.error(e.message),
  });
  const markPaidMut = trpc.subcontractorBill.markPaid.useMutation({
    onSuccess: (res) => { toast.success(`Paid. Remaining: NPR ${res.remaining.toLocaleString()}`); onRefresh(); },
    onError: (e) => toast.error(e.message),
  });

  return (
    <div className="space-y-5">
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <ReceiptText className="h-5 w-5 text-violet-500" />
          {bill.number}
          <Badge variant="secondary" className={cn("capitalize text-[10px] ml-2", {
            "bg-slate-100 text-slate-700": bill.status === "draft",
            "bg-amber-100 text-amber-700": bill.status === "submitted",
            "bg-teal-100 text-teal-800": bill.status === "verified",
            "bg-blue-100 text-blue-700": bill.status === "certified",
            "bg-emerald-100 text-emerald-700": bill.status === "paid",
            "bg-red-100 text-red-700": bill.status === "disputed",
          })}>
            {bill.status}
          </Badge>
        </DialogTitle>
        <DialogDescription>
          {bill.subcontractor.name} &middot; {bill.period || "No period"} &middot; Created {format(new Date(bill.createdAt), "dd MMM yyyy")}
        </DialogDescription>
      </DialogHeader>

      {/* Financial Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="rounded-lg border p-3 text-center">
          <p className="text-[10px] text-muted-foreground uppercase">Gross Amount</p>
          <p className="text-lg font-bold font-mono">NPR {formatNpr(bill.grossAmount)}</p>
        </div>
        <div className="rounded-lg border p-3 text-center">
          <p className="text-[10px] text-muted-foreground uppercase">Retention ({bill.retentionPercent}%)</p>
          <p className="text-lg font-bold font-mono text-amber-600">-NPR {formatNpr(bill.retentionAmount)}</p>
        </div>
        <div className="rounded-lg border p-3 text-center">
          <p className="text-[10px] text-muted-foreground uppercase">VAT ({bill.vatPercent}%)</p>
          <p className="text-lg font-bold font-mono">+NPR {formatNpr(bill.vatAmount)}</p>
        </div>
        <div className="rounded-lg border p-3 text-center bg-violet-50/40 dark:bg-violet-950/10">
          <p className="text-[10px] text-muted-foreground uppercase">Net Payable</p>
          <p className="text-lg font-bold font-mono text-violet-700 dark:text-violet-300">NPR {formatNpr(bill.netPayable)}</p>
        </div>
      </div>

      {/* Deductions */}
      {(bill.materialDeduction > 0 || bill.advanceRecovery > 0) && (
        <div className="flex gap-3 text-xs">
          {bill.materialDeduction > 0 && (
            <span className="rounded-md bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900 px-3 py-1.5">
              Material Deduction: <strong>NPR {formatNpr(bill.materialDeduction)}</strong>
            </span>
          )}
          {bill.advanceRecovery > 0 && (
            <span className="rounded-md bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900 px-3 py-1.5">
              Advance Recovery: <strong>NPR {formatNpr(bill.advanceRecovery)}</strong>
            </span>
          )}
        </div>
      )}

      {/* Payment Progress */}
      <div className="rounded-lg border p-3">
        <div className="flex justify-between text-xs mb-1.5">
          <span className="text-muted-foreground">Payment Progress</span>
          <span className="font-semibold">{bill.netPayable > 0 ? Math.round((bill.paidAmount / bill.netPayable) * 100) : 0}%</span>
        </div>
        <div className="w-full bg-muted rounded-full h-2">
          <div
            className="bg-emerald-500 h-2 rounded-full transition-all"
            style={{ width: `${Math.min(100, bill.netPayable > 0 ? (bill.paidAmount / bill.netPayable) * 100 : 0)}%` }}
          />
        </div>
        <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
          <span>Paid: NPR {formatNpr(bill.paidAmount)}</span>
          <span>Remaining: NPR {formatNpr(Math.max(0, bill.netPayable - bill.paidAmount))}</span>
        </div>
      </div>

      {/* Line Items */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold">Line Items &amp; Measurement Breakdown</h3>
          {onVerify && (bill.status === "submitted" || bill.status === "verified" || bill.status === "draft") && isAdmin && (
            <Button size="sm" variant="outline" onClick={onVerify} className="h-7 text-xs gap-1 text-emerald-700 dark:text-emerald-300 border-emerald-300">
              <ShieldCheck className="h-3.5 w-3.5" /> Engineer Line-Item Verification
            </Button>
          )}
        </div>
        {bill.items?.length > 0 ? (
          <div className="rounded-lg border overflow-hidden">
            <table className="w-full text-xs">
              <thead className="bg-muted/30">
                <tr className="text-muted-foreground">
                  <th className="text-left p-2 font-medium">BOQ Code</th>
                  <th className="text-left p-2 font-medium">Description</th>
                  <th className="text-right p-2 font-medium">Claimed Qty</th>
                  <th className="text-right p-2 font-medium text-emerald-600">Verified Qty</th>
                  <th className="text-right p-2 font-medium text-red-600">Disallowed</th>
                  <th className="text-right p-2 font-medium">Rate</th>
                  <th className="text-right p-2 font-medium">Amount</th>
                </tr>
              </thead>
              <tbody>
                {bill.items.map((item: any) => {
                  const verifiedQty = item.verifiedQty !== null && item.verifiedQty !== undefined ? item.verifiedQty : item.thisQty;
                  const disallowed = item.disallowedQty || Math.max(0, item.thisQty - verifiedQty);

                  return (
                    <tr key={item.id} className="border-t hover:bg-muted/10">
                      <td className="p-2 font-mono text-muted-foreground">{item.boqCode || "—"}</td>
                      <td className="p-2 font-medium">
                        {item.description}
                        {item.disallowedReason && (
                          <span className="block text-[9px] text-red-600 italic">
                            Deduction: {item.disallowedReason}
                          </span>
                        )}
                      </td>
                      <td className="p-2 text-right font-mono text-muted-foreground">{item.thisQty} {item.unit}</td>
                      <td className="p-2 text-right font-mono font-bold text-emerald-600">{verifiedQty} {item.unit}</td>
                      <td className={cn("p-2 text-right font-mono", disallowed > 0 ? "text-red-600 font-bold" : "text-muted-foreground")}>
                        {disallowed > 0 ? `-${disallowed}` : "0"}
                      </td>
                      <td className="p-2 text-right font-mono">NPR {item.rate.toLocaleString()}</td>
                      <td className="p-2 text-right font-mono font-bold">NPR {(verifiedQty * item.rate).toLocaleString()}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 bg-muted/20 font-semibold">
                  <td colSpan={6} className="p-2 text-right">Gross Certified Amount</td>
                  <td className="p-2 text-right font-mono">NPR {bill.grossAmount.toLocaleString()}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground text-center py-4">No line items</p>
        )}
      </div>

      {bill.notes && (
        <div className="rounded-lg border p-3 bg-muted/20 text-xs">
          <span className="text-muted-foreground">Notes: </span>
          <span className="italic">{bill.notes}</span>
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex justify-end gap-2 border-t pt-3">
        {bill.status === "draft" && canWrite && (
          <Button
            size="sm"
            className="bg-blue-600 hover:bg-blue-700 text-slate-900"
            onClick={() => submitMut.mutate({ projectId, billId: bill.id })}
            disabled={submitMut.isPending}
          >
            {submitMut.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <Send className="h-3.5 w-3.5 mr-1.5" />}
            Submit for Certification
          </Button>
        )}
        {onVerify && (bill.status === "submitted" || bill.status === "verified") && isAdmin && (
          <Button
            size="sm"
            className="bg-emerald-600 hover:bg-emerald-700 text-slate-900 gap-1.5 font-semibold"
            onClick={onVerify}
          >
            <ShieldCheck className="h-3.5 w-3.5" />
            Verify &amp; Certify Measurements
          </Button>
        )}
        {bill.status === "certified" && isAdmin && (
          <Button
            size="sm"
            className="bg-emerald-600 hover:bg-emerald-700 text-slate-900"
            onClick={() => {
              const remaining = bill.netPayable - bill.paidAmount;
              markPaidMut.mutate({ projectId, billId: bill.id, amount: remaining });
            }}
            disabled={markPaidMut.isPending}
          >
            {markPaidMut.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <Banknote className="h-3.5 w-3.5 mr-1.5" />}
            Mark as Paid
          </Button>
        )}
      </div>
    </div>
  );
}

function CreateBillDialog({
  projectId,
  open,
  onOpenChange,
  subcontractors,
  onSuccess,
}: {
  projectId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  subcontractors: any[];
  onSuccess: () => void;
}) {
  const [subcontractorId, setSubcontractorId] = useState("");
  const [period, setPeriod] = useState("");
  const [retentionPercent, setRetentionPercent] = useState("10");
  const [vatPercent, setVatPercent] = useState("13");
  const [tdsPercent, setTdsPercent] = useState("1.5");
  const [materialDeduction, setMaterialDeduction] = useState("0");
  const [advanceRecovery, setAdvanceRecovery] = useState("0");
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<BillItem[]>([
    { boqCode: "", description: "", unit: "", contractQty: 0, previousQty: 0, thisQty: 0, rate: 0 },
  ]);

  const createMut = trpc.subcontractorBill.create.useMutation({
    onSuccess: () => {
      toast.success("Bill created");
      resetForm();
      onSuccess();
    },
    onError: (e) => toast.error(e.message),
  });

  const resetForm = () => {
    setSubcontractorId("");
    setPeriod("");
    setRetentionPercent("10");
    setVatPercent("13");
    setTdsPercent("1.5");
    setMaterialDeduction("0");
    setAdvanceRecovery("0");
    setNotes("");
    setItems([{ boqCode: "", description: "", unit: "", contractQty: 0, previousQty: 0, thisQty: 0, rate: 0 }]);
  };

  const addItem = () => {
    setItems([...items, { boqCode: "", description: "", unit: "", contractQty: 0, previousQty: 0, thisQty: 0, rate: 0 }]);
  };

  const removeItem = (index: number) => {
    if (items.length === 1) return;
    setItems(items.filter((_, i) => i !== index));
  };

  const updateItem = (index: number, field: keyof BillItem, value: any) => {
    const newItems = [...items];
    (newItems[index] as any)[field] = value;
    setItems(newItems);
  };

  const grossTotal = items.reduce((sum, item) => sum + item.thisQty * item.rate, 0);
  const retentionAmt = (grossTotal * parseFloat(retentionPercent || "0")) / 100;
  const vatAmt = (grossTotal * parseFloat(vatPercent || "0")) / 100;
  const tdsAmt = (grossTotal * parseFloat(tdsPercent || "0")) / 100;
  const netPayable = Math.max(0, grossTotal - retentionAmt + vatAmt - tdsAmt - parseFloat(materialDeduction || "0") - parseFloat(advanceRecovery || "0"));

  const handleSubmit = () => {
    if (!subcontractorId) { toast.error("Select a subcontractor"); return; }
    if (items.some((i) => !i.description || i.thisQty <= 0)) { toast.error("All items need description and positive qty"); return; }

    createMut.mutate({
      projectId,
      subcontractorId,
      period: period || undefined,
      retentionPercent: parseFloat(retentionPercent || "10"),
      vatPercent: parseFloat(vatPercent || "13"),
      tdsPercent: parseFloat(tdsPercent || "1.5"),
      materialDeduction: parseFloat(materialDeduction || "0"),
      advanceRecovery: parseFloat(advanceRecovery || "0"),
      notes: notes || undefined,
      items: items.map((i) => ({
        ...i,
        boqCode: i.boqCode || undefined,
        unit: i.unit || undefined,
      })),
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ReceiptText className="h-5 w-5 text-violet-500" />
            New Subcontractor Bill
          </DialogTitle>
          <DialogDescription>Create a new bill with line items. Bill number auto-generated.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Basic Info */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Subcontractor *</Label>
              <Select value={subcontractorId} onValueChange={setSubcontractorId}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="Select subcontractor" />
                </SelectTrigger>
                <SelectContent>
                  {subcontractors.map((sub: any) => (
                    <SelectItem key={sub.id} value={sub.id}>{sub.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Period</Label>
              <Input value={period} onChange={(e) => setPeriod(e.target.value)} placeholder="e.g. Aug 2026" className="h-8 text-xs" />
            </div>
          </div>

          {/* Tax Config */}
          <div className="grid grid-cols-4 gap-2">
            <div className="space-y-1">
              <Label className="text-[10px]">Retention %</Label>
              <Input type="number" value={retentionPercent} onChange={(e) => setRetentionPercent(e.target.value)} className="h-7 text-xs" />
            </div>
            <div className="space-y-1">
              <Label className="text-[10px]">VAT %</Label>
              <Input type="number" value={vatPercent} onChange={(e) => setVatPercent(e.target.value)} className="h-7 text-xs" />
            </div>
            <div className="space-y-1">
              <Label className="text-[10px]">TDS %</Label>
              <Input type="number" value={tdsPercent} onChange={(e) => setTdsPercent(e.target.value)} className="h-7 text-xs" />
            </div>
            <div className="space-y-1">
              <Label className="text-[10px]">Mat. Deduction</Label>
              <Input type="number" value={materialDeduction} onChange={(e) => setMaterialDeduction(e.target.value)} className="h-7 text-xs" />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-[10px]">Advance Recovery</Label>
            <Input type="number" value={advanceRecovery} onChange={(e) => setAdvanceRecovery(e.target.value)} className="h-7 text-xs max-w-[160px]" />
          </div>

          {/* Line Items */}
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <Label className="text-xs font-semibold">Line Items *</Label>
              <Button variant="outline" size="sm" className="h-6 text-[10px]" onClick={addItem}>
                <Plus className="h-3 w-3 mr-1" /> Add Item
              </Button>
            </div>
            <div className="space-y-2">
              {items.map((item, idx) => (
                <div key={idx} className="grid grid-cols-12 gap-1.5 items-end border rounded-lg p-2 bg-muted/10">
                  <div className="col-span-1">
                    <Label className="text-[9px]">BOQ Code</Label>
                    <Input value={item.boqCode} onChange={(e) => updateItem(idx, "boqCode", e.target.value)} className="h-7 text-[10px]" placeholder="1.1.1" />
                  </div>
                  <div className="col-span-3">
                    <Label className="text-[9px]">Description *</Label>
                    <Input value={item.description} onChange={(e) => updateItem(idx, "description", e.target.value)} className="h-7 text-[10px]" placeholder="Item description" />
                  </div>
                  <div className="col-span-1">
                    <Label className="text-[9px]">Unit</Label>
                    <Input value={item.unit} onChange={(e) => updateItem(idx, "unit", e.target.value)} className="h-7 text-[10px]" placeholder="cum" />
                  </div>
                  <div className="col-span-1">
                    <Label className="text-[9px]">Prev Qty</Label>
                    <Input type="number" value={item.previousQty || ""} onChange={(e) => updateItem(idx, "previousQty", parseFloat(e.target.value) || 0)} className="h-7 text-[10px]" />
                  </div>
                  <div className="col-span-2">
                    <Label className="text-[9px]">This Qty *</Label>
                    <Input type="number" value={item.thisQty || ""} onChange={(e) => updateItem(idx, "thisQty", parseFloat(e.target.value) || 0)} className="h-7 text-[10px]" />
                  </div>
                  <div className="col-span-2">
                    <Label className="text-[9px]">Rate (NPR) *</Label>
                    <Input type="number" value={item.rate || ""} onChange={(e) => updateItem(idx, "rate", parseFloat(e.target.value) || 0)} className="h-7 text-[10px]" />
                  </div>
                  <div className="col-span-1 text-right">
                    <Label className="text-[9px]">Amount</Label>
                    <p className="text-[10px] font-mono font-bold pt-1.5">{formatNpr(item.thisQty * item.rate)}</p>
                  </div>
                  <div className="col-span-1 flex justify-center">
                    {items.length > 1 && (
                      <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-red-500" onClick={() => removeItem(idx)}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Notes</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional notes..." rows={2} className="text-xs" />
          </div>

          {/* Summary */}
          <div className="rounded-lg border bg-muted/20 p-3 space-y-1 text-xs">
            <div className="flex justify-between"><span className="text-muted-foreground">Gross Amount</span><span className="font-mono font-bold">NPR {formatNpr(grossTotal)}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Retention ({retentionPercent}%)</span><span className="font-mono text-amber-600">-NPR {formatNpr(retentionAmt)}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">VAT ({vatPercent}%)</span><span className="font-mono">+NPR {formatNpr(vatAmt)}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">TDS ({tdsPercent}%)</span><span className="font-mono">-NPR {formatNpr(tdsAmt)}</span></div>
            {parseFloat(materialDeduction || "0") > 0 && <div className="flex justify-between"><span className="text-muted-foreground">Material Deduction</span><span className="font-mono text-red-600">-NPR {formatNpr(parseFloat(materialDeduction))}</span></div>}
            {parseFloat(advanceRecovery || "0") > 0 && <div className="flex justify-between"><span className="text-muted-foreground">Advance Recovery</span><span className="font-mono text-red-600">-NPR {formatNpr(parseFloat(advanceRecovery))}</span></div>}
            <div className="flex justify-between border-t pt-1 font-bold"><span>Net Payable</span><span className="font-mono text-violet-700 dark:text-violet-300">NPR {formatNpr(netPayable)}</span></div>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} disabled={createMut.isPending}>Cancel</Button>
          <Button size="sm" className="bg-violet-600 hover:bg-violet-700 text-slate-900" onClick={handleSubmit} disabled={createMut.isPending}>
            {createMut.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <Plus className="h-3.5 w-3.5 mr-1.5" />}
            Create Bill
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
