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
  ShieldCheck,
  Layers,
  Package,
} from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { formatNpr } from "@/lib/currency";
import { StatusBadge } from "@/components/ui/status-badge";
import { ConstructionTable, ConstructionTableColumn } from "@/components/ui/construction-table";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ReconciliationMatrixTab } from "./components/reconciliation-matrix-tab";
import { MaterialReconciliationTab } from "./components/material-reconciliation-tab";
import { VerifyBillDialog } from "./dialogs/verify-bill-dialog";

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

  const { data: projectInfo } = trpc.project.get.useQuery({ id }, { staleTime: 300_000 });
  const { data: subsData } = trpc.partner.listSubcontractors.useQuery({
    projectId: id,
    // Deliberate max page: feeds ledger tabs and billing pickers, not a scrolled list.
    limit: 500,
  });
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

  const canWrite = Boolean(projectInfo?.myRole);
  const isAdmin = Boolean(projectInfo?.myRole === "project_manager" || projectInfo?.myRole === "engineer");


  const submitMut = trpc.subcontractorBill.submit.useMutation({
    onSuccess: () => {
      toast.success("Bill submitted for certification");
      utils.subcontractorBill.list.invalidate({ projectId: id });
    },
    onError: (e) => toast.error(e.message),
  });

  const deleteMut = trpc.subcontractorBill.delete.useMutation({
    onSuccess: () => {
      toast.success("Bill deleted");
      utils.subcontractorBill.list.invalidate({ projectId: id });
    },
    onError: (e) => toast.error(e.message),
  });

  const markPaidMut = trpc.subcontractorBill.markPaid.useMutation({
    onSuccess: (res) => {
      toast.success(`Marked as paid. Remaining due: ${formatNpr(res.remaining)}`);
      utils.subcontractorBill.list.invalidate({ projectId: id });
    },
    onError: (e) => toast.error(e.message),
  });

  const bills = billsData?.bills || [];
  const breakdown = billsData?.subcontractorBreakdown || [];

  const billColumns: ConstructionTableColumn<any>[] = [
    {
      key: "number",
      header: "#",
      render: (_, bill) => <span className="font-mono text-xs font-bold text-primary">{bill.number}</span>,
    },
    {
      key: "subcontractor",
      header: "Subcontractor",
      render: (_, bill) => <span className="font-medium text-xs font-sans text-foreground">{bill.subcontractor.name}</span>,
    },
    {
      key: "period",
      header: "Period",
      render: (_, bill) => <span className="text-muted-foreground font-mono text-xs">{bill.period || "—"}</span>,
    },
    {
      key: "grossAmount",
      header: "Gross",
      align: "right",
      render: (_, bill) => <span className="font-mono text-xs">{formatNpr(bill.grossAmount)}</span>,
    },
    {
      key: "retentionAmount",
      header: "Retention",
      align: "right",
      render: (_, bill) => <span className="font-mono text-xs text-amber-600 dark:text-amber-400">{formatNpr(bill.retentionAmount)}</span>,
    },
    {
      key: "vatAmount",
      header: "VAT",
      align: "right",
      render: (_, bill) => <span className="font-mono text-xs">{formatNpr(bill.vatAmount)}</span>,
    },
    {
      key: "netPayable",
      header: "Net Payable",
      align: "right",
      render: (_, bill) => <span className="font-bold font-mono text-xs text-foreground">{formatNpr(bill.netPayable)}</span>,
    },
    {
      key: "paidAmount",
      header: "Paid",
      align: "right",
      render: (_, bill) => <span className="font-mono text-xs text-emerald-600 dark:text-emerald-400">{formatNpr(bill.paidAmount)}</span>,
    },
    {
      key: "status",
      header: "Status",
      align: "center",
      render: (_, bill) => <StatusBadge status={bill.status} size="xs" />,
    },
    {
      key: "actions",
      header: "Actions",
      align: "right",
      render: (_, bill) => (
        <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
          {bill.status === "draft" && canWrite && (
            <>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 text-[10px] text-info"
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
              className="h-6 text-[10px] text-emerald-700 dark:text-emerald-300 border-emerald-300 gap-1 bg-emerald-50/50 dark:bg-emerald-950/20"
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
      ),
    },
  ];

  const breakdownColumns: ConstructionTableColumn<any>[] = [
    {
      key: "name",
      header: "Subcontractor",
      render: (_, sub) => <span className="font-medium text-xs font-sans text-foreground">{sub.name}</span>,
    },
    {
      key: "billCount",
      header: "Bills",
      align: "right",
      render: (_, sub) => <span className="font-mono text-xs">{sub.billCount}</span>,
    },
    {
      key: "billed",
      header: "Billed",
      align: "right",
      render: (_, sub) => <span className="font-mono text-xs">{formatNpr(sub.billed)}</span>,
    },
    {
      key: "paid",
      header: "Paid",
      align: "right",
      render: (_, sub) => <span className="font-mono text-xs text-emerald-600 dark:text-emerald-400">{formatNpr(sub.paid)}</span>,
    },
    {
      key: "outstanding",
      header: "Outstanding",
      align: "right",
      render: (_, sub) => <span className="font-mono text-xs text-amber-600 dark:text-amber-400 font-bold">{formatNpr(sub.outstanding)}</span>,
    },
  ];

  return (
    <>
      <ModuleTabs projectId={id} tabs={RES_TABS} />
      <AnimatedPage className="space-y-5 pb-8 p-4">
        {/* Navigation & Tab Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Tabs
            value={activeMainTab}
            onValueChange={(v) => setActiveMainTab(v as any)}
            className="w-full"
          >
            <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-3 mb-4">
              <TabsList className="bg-muted/60 p-1 rounded-xl">
                <TabsTrigger value="bills" className="text-xs gap-1.5 font-mono">
                  <ReceiptText className="h-3.5 w-3.5" />
                  Bills &amp; Running Claims
                </TabsTrigger>
                <TabsTrigger value="matrix" className="text-xs gap-1.5 font-mono">
                  <Layers className="h-3.5 w-3.5" />
                  Cross-Package Reconciliation
                </TabsTrigger>
                <TabsTrigger value="materials" className="text-xs gap-1.5 font-mono">
                  <Package className="h-3.5 w-3.5" />
                  Material Issued/Consumed
                </TabsTrigger>
              </TabsList>

              {activeMainTab === "bills" && canWrite && (
                <Button size="sm" onClick={() => setCreateOpen(true)} className="gap-1.5 font-mono text-xs">
                  <Plus className="h-3.5 w-3.5" />
                  New Subcontractor Bill
                </Button>
              )}
            </div>

            {/* TAB 1: RUNNING BILLS */}
            <TabsContent value="bills" className="space-y-4 m-0">
              {/* Financial KPIs */}
              {billsData?.summary && (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="rounded-xl border bg-card p-3 space-y-1">
                    <p className="text-[10px] text-muted-foreground uppercase font-mono">Total Billed</p>
                    <p className="text-xl font-bold font-mono text-foreground">{formatNpr(billsData.summary.totalBilled)}</p>
                    <p className="text-[11px] text-muted-foreground font-mono">{bills.length} bills recorded</p>
                  </div>
                  <div className="rounded-xl border bg-card p-3 space-y-1">
                    <p className="text-[10px] text-muted-foreground uppercase font-mono">Total Paid</p>
                    <p className="text-xl font-bold font-mono text-emerald-600 dark:text-emerald-400">{formatNpr(billsData.summary.totalPaid)}</p>
                    <p className="text-[11px] text-muted-foreground font-mono">Disbursed to subcontractors</p>
                  </div>
                  <div className="rounded-xl border bg-card p-3 space-y-1">
                    <p className="text-[10px] text-muted-foreground uppercase font-mono">Outstanding Due</p>
                    <p className="text-xl font-bold font-mono text-amber-600 dark:text-amber-400">{formatNpr(billsData.summary.outstanding)}</p>
                    <p className="text-[11px] text-muted-foreground font-mono">Pending settlement</p>
                  </div>
                </div>
              )}


              {/* Filters */}
              <div className="flex flex-wrap items-center gap-3 p-3 bg-muted/40 rounded-lg border">
                <Select value={subFilter} onValueChange={setSubFilter}>
                  <SelectTrigger className="w-[180px] h-8 text-xs font-mono">
                    <SelectValue placeholder="All Subcontractors" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Subcontractors</SelectItem>
                    {subsData?.subcontractors.map((sub: any) => (
                      <SelectItem key={sub.id} value={sub.id}>{sub.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-[150px] h-8 text-xs font-mono">
                    <SelectValue placeholder="All Statuses" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Statuses</SelectItem>
                    <SelectItem value="draft">Draft</SelectItem>
                    <SelectItem value="submitted">Submitted</SelectItem>
                    <SelectItem value="verified">Verified</SelectItem>
                    <SelectItem value="certified">Certified</SelectItem>
                    <SelectItem value="paid">Paid</SelectItem>
                    <SelectItem value="disputed">Disputed</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Bills Central ConstructionTable */}
              <ConstructionTable
                data={bills}
                columns={billColumns}
                isLoading={isLoading}
                searchPlaceholder="Search bills by number, subcontractor, period..."
                searchFilterKeys={["number", "period"]}
                onRowClick={(bill) => setSelectedBillId(bill.id)}
                renderRowPreview={(bill) => (
                  <div className="p-3 bg-muted/20 rounded-lg space-y-2 font-mono text-xs">
                    <div className="font-semibold text-foreground font-sans">Line Items Preview for Bill #{bill.number}:</div>
                    {bill.items?.length > 0 ? (
                      <div className="space-y-1">
                        {bill.items.map((item: any) => (
                          <div key={item.id} className="flex justify-between py-1 border-b border-border/40 text-[11px]">
                            <span>{item.boqCode ? `[${item.boqCode}] ` : ""}{item.description}</span>
                            <span>{item.thisQty} {item.unit} @ {formatNpr(item.rate)} = <strong>{formatNpr(item.amount)}</strong></span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-muted-foreground text-xs">No line items detailed.</p>
                    )}
                  </div>
                )}
              />

              {/* Subcontractor Breakdown */}
              {breakdown.length > 0 && (
                <div className="space-y-2 pt-4">
                  <h3 className="text-sm font-bold font-sans text-foreground">Summary By Subcontractor</h3>
                  <ConstructionTable
                    data={breakdown}
                    columns={breakdownColumns}
                    isLoading={false}
                    searchPlaceholder="Filter subcontractors..."
                    searchFilterKeys={["name"]}
                  />
                </div>
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
            <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto backdrop-blur-md bg-black/85 border-white/10 text-white">
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
  const submitMut = trpc.subcontractorBill.submit.useMutation({
    onSuccess: () => { toast.success("Bill submitted"); onRefresh(); },
    onError: (e) => toast.error(e.message),
  });
  const markPaidMut = trpc.subcontractorBill.markPaid.useMutation({
    onSuccess: (res) => { toast.success(`Paid. Remaining: ${formatNpr(res.remaining)}`); onRefresh(); },
    onError: (e) => toast.error(e.message),
  });

  return (
    <div className="space-y-5">
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <ReceiptText className="h-5 w-5 text-violet-500" />
          {bill.number}
          <Badge variant="secondary" className={cn("capitalize text-[10px] ml-2", {
            "bg-muted text-foreground/80": bill.status === "draft",
            "bg-amber-100 text-amber-700": bill.status === "submitted",
            "bg-teal-100 text-teal-800": bill.status === "verified",
            "bg-info/15 text-info": bill.status === "certified",
            "bg-emerald-100 text-emerald-700": bill.status === "paid",
            "bg-red-100 text-red-700": bill.status === "disputed",
          })}>
            {bill.status}
          </Badge>
        </DialogTitle>
        <DialogDescription className="text-white/60">
          {bill.subcontractor.name} &middot; {bill.period || "No period"} &middot; Created {format(new Date(bill.createdAt), "dd MMM yyyy")}
        </DialogDescription>
      </DialogHeader>

      {/* Financial Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="rounded-lg border border-white/10 p-3 text-center bg-white/5">
          <p className="text-[10px] text-white/60 uppercase font-mono">Gross Amount</p>
          <p className="text-lg font-bold font-mono">{formatNpr(bill.grossAmount)}</p>
        </div>
        <div className="rounded-lg border border-white/10 p-3 text-center bg-white/5">
          <p className="text-[10px] text-white/60 uppercase font-mono">Retention ({bill.retentionPercent}%)</p>
          <p className="text-lg font-bold font-mono text-amber-400">-{formatNpr(bill.retentionAmount)}</p>
        </div>
        <div className="rounded-lg border border-white/10 p-3 text-center bg-white/5">
          <p className="text-[10px] text-white/60 uppercase font-mono">VAT ({bill.vatPercent}%)</p>
          <p className="text-lg font-bold font-mono">+{formatNpr(bill.vatAmount)}</p>
        </div>
        <div className="rounded-lg border border-primary/40 p-3 text-center bg-primary/10">
          <p className="text-[10px] text-white/60 uppercase font-mono">Net Payable</p>
          <p className="text-lg font-bold font-mono text-primary">{formatNpr(bill.netPayable)}</p>
        </div>
      </div>

      {/* Deductions */}
      {(bill.materialDeduction > 0 || bill.advanceRecovery > 0) && (
        <div className="flex gap-3 text-xs">
          {bill.materialDeduction > 0 && (
            <span className="rounded-md bg-red-950/40 border border-red-800 px-3 py-1.5 font-mono text-red-300">
              Material Deduction: <strong>{formatNpr(bill.materialDeduction)}</strong>
            </span>
          )}
          {bill.advanceRecovery > 0 && (
            <span className="rounded-md bg-red-950/40 border border-red-800 px-3 py-1.5 font-mono text-red-300">
              Advance Recovery: <strong>{formatNpr(bill.advanceRecovery)}</strong>
            </span>
          )}
        </div>
      )}

      {/* Payment Progress */}
      <div className="rounded-lg border border-white/10 p-3 bg-white/5">
        <div className="flex justify-between text-xs mb-1.5 font-mono">
          <span className="text-white/60">Payment Progress</span>
          <span className="font-semibold">{bill.netPayable > 0 ? Math.round((bill.paidAmount / bill.netPayable) * 100) : 0}%</span>
        </div>
        <div className="w-full bg-white/10 rounded-full h-2">
          <div
            className="bg-emerald-500 h-2 rounded-full transition-all"
            style={{ width: `${Math.min(100, bill.netPayable > 0 ? (bill.paidAmount / bill.netPayable) * 100 : 0)}%` }}
          />
        </div>
        <div className="flex justify-between text-[10px] text-white/60 mt-1 font-mono">
          <span>Paid: {formatNpr(bill.paidAmount)}</span>
          <span>Remaining: {formatNpr(Math.max(0, bill.netPayable - bill.paidAmount))}</span>
        </div>
      </div>

      {/* Line Items */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold font-sans">Line Items &amp; Measurement Breakdown</h3>
          {onVerify && (bill.status === "submitted" || bill.status === "verified" || bill.status === "draft") && isAdmin && (
            <Button size="sm" variant="outline" onClick={onVerify} className="h-7 text-xs gap-1 text-emerald-300 border-emerald-500 font-mono">
              <ShieldCheck className="h-3.5 w-3.5" /> Engineer Line-Item Verification
            </Button>
          )}
        </div>
        {bill.items?.length > 0 ? (
          <div className="rounded-lg border border-white/10 overflow-hidden bg-white/5">
            <table className="w-full text-xs font-mono">
              <thead className="bg-white/10">
                <tr className="text-white/60">
                  <th className="text-left p-2 font-medium">BOQ Code</th>
                  <th className="text-left p-2 font-medium font-sans">Description</th>
                  <th className="text-right p-2 font-medium">Claimed Qty</th>
                  <th className="text-right p-2 font-medium text-emerald-400">Verified Qty</th>
                  <th className="text-right p-2 font-medium text-red-400">Disallowed</th>
                  <th className="text-right p-2 font-medium">Rate</th>
                  <th className="text-right p-2 font-medium">Amount</th>
                </tr>
              </thead>
              <tbody>
                {bill.items.map((item: any) => {
                  const verifiedQty = item.verifiedQty !== null && item.verifiedQty !== undefined ? item.verifiedQty : item.thisQty;
                  const disallowed = item.disallowedQty || Math.max(0, item.thisQty - verifiedQty);

                  return (
                    <tr key={item.id} className="border-t border-white/10 hover:bg-white/5">
                      <td className="p-2 text-white/60">{item.boqCode || "—"}</td>
                      <td className="p-2 font-medium font-sans">
                        {item.description}
                        {item.disallowedReason && (
                          <span className="block text-[9px] text-red-400 italic">
                            Deduction: {item.disallowedReason}
                          </span>
                        )}
                      </td>
                      <td className="p-2 text-right text-white/60">{item.thisQty} {item.unit}</td>
                      <td className="p-2 text-right font-bold text-emerald-400">{verifiedQty} {item.unit}</td>
                      <td className={cn("p-2 text-right", disallowed > 0 ? "text-red-400 font-bold" : "text-white/60")}>
                        {disallowed > 0 ? `-${disallowed}` : "0"}
                      </td>
                      <td className="p-2 text-right">{formatNpr(item.rate)}</td>
                      <td className="p-2 text-right font-bold">{formatNpr(verifiedQty * item.rate)}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-white/20 bg-white/10 font-semibold">
                  <td colSpan={6} className="p-2 text-right font-sans">Gross Certified Amount</td>
                  <td className="p-2 text-right font-bold">{formatNpr(bill.grossAmount)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        ) : (
          <p className="text-xs text-white/60 text-center py-4 font-mono">No line items</p>
        )}
      </div>

      {bill.notes && (
        <div className="rounded-lg border border-white/10 p-3 bg-white/5 text-xs">
          <span className="text-white/60">Notes: </span>
          <span className="italic">{bill.notes}</span>
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex justify-end gap-2 border-t border-white/10 pt-3">
        {bill.status === "draft" && canWrite && (
          <Button
            size="sm"
            className="bg-info hover:bg-info text-white font-mono text-xs"
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
            className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5 font-semibold font-mono text-xs"
            onClick={onVerify}
          >
            <ShieldCheck className="h-3.5 w-3.5" />
            Verify &amp; Certify Measurements
          </Button>
        )}
        {bill.status === "certified" && isAdmin && (
          <Button
            size="sm"
            className="bg-emerald-600 hover:bg-emerald-700 text-white font-mono text-xs"
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
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto backdrop-blur-md bg-black/85 border-white/10 text-white">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ReceiptText className="h-5 w-5 text-violet-500" />
            New Subcontractor Bill
          </DialogTitle>
          <DialogDescription className="text-white/60">Create a new bill with line items. Bill number auto-generated.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Basic Info */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Subcontractor *</Label>
              <Select value={subcontractorId} onValueChange={setSubcontractorId}>
                <SelectTrigger className="h-8 text-xs font-mono">
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
              <Input value={period} onChange={(e) => setPeriod(e.target.value)} placeholder="e.g. Aug 2026" className="h-8 text-xs font-mono" />
            </div>
          </div>

          {/* Tax Config */}
          <div className="grid grid-cols-4 gap-2">
            <div className="space-y-1">
              <Label className="text-[10px]">Retention %</Label>
              <Input type="number" value={retentionPercent} onChange={(e) => setRetentionPercent(e.target.value)} className="h-7 text-xs font-mono" />
            </div>
            <div className="space-y-1">
              <Label className="text-[10px]">VAT %</Label>
              <Input type="number" value={vatPercent} onChange={(e) => setVatPercent(e.target.value)} className="h-7 text-xs font-mono" />
            </div>
            <div className="space-y-1">
              <Label className="text-[10px]">TDS %</Label>
              <Input type="number" value={tdsPercent} onChange={(e) => setTdsPercent(e.target.value)} className="h-7 text-xs font-mono" />
            </div>
            <div className="space-y-1">
              <Label className="text-[10px]">Mat. Deduction</Label>
              <Input type="number" value={materialDeduction} onChange={(e) => setMaterialDeduction(e.target.value)} className="h-7 text-xs font-mono" />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-[10px]">Advance Recovery</Label>
            <Input type="number" value={advanceRecovery} onChange={(e) => setAdvanceRecovery(e.target.value)} className="h-7 text-xs max-w-[160px] font-mono" />
          </div>

          {/* Line Items */}
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <Label className="text-xs font-semibold">Line Items *</Label>
              <Button variant="outline" size="sm" className="h-6 text-[10px] font-mono" onClick={addItem}>
                <Plus className="h-3 w-3 mr-1" /> Add Item
              </Button>
            </div>
            <div className="space-y-2">
              {items.map((item, idx) => (
                <div key={idx} className="grid grid-cols-12 gap-1.5 items-end border border-white/10 rounded-lg p-2 bg-white/5">
                  <div className="col-span-2">
                    <Label className="text-[9px]">BOQ Code</Label>
                    <Input value={item.boqCode} onChange={(e) => updateItem(idx, "boqCode", e.target.value)} className="h-7 text-[10px] font-mono" placeholder="1.1.1" />
                  </div>
                  <div className="col-span-3">
                    <Label className="text-[9px]">Description *</Label>
                    <Input value={item.description} onChange={(e) => updateItem(idx, "description", e.target.value)} className="h-7 text-[10px]" placeholder="Item description" />
                  </div>
                  <div className="col-span-1">
                    <Label className="text-[9px]">Unit</Label>
                    <Input value={item.unit} onChange={(e) => updateItem(idx, "unit", e.target.value)} className="h-7 text-[10px] font-mono" placeholder="cum" />
                  </div>
                  <div className="col-span-1">
                    <Label className="text-[9px]">Prev</Label>
                    <Input type="number" value={item.previousQty || ""} onChange={(e) => updateItem(idx, "previousQty", parseFloat(e.target.value) || 0)} className="h-7 text-[10px] font-mono" />
                  </div>
                  <div className="col-span-2">
                    <Label className="text-[9px]">This Qty *</Label>
                    <Input type="number" value={item.thisQty || ""} onChange={(e) => updateItem(idx, "thisQty", parseFloat(e.target.value) || 0)} className="h-7 text-[10px] font-mono" />
                  </div>
                  <div className="col-span-2">
                    <Label className="text-[9px]">Rate (NPR) *</Label>
                    <Input type="number" value={item.rate || ""} onChange={(e) => updateItem(idx, "rate", parseFloat(e.target.value) || 0)} className="h-7 text-[10px] font-mono" />
                  </div>
                  <div className="col-span-1 flex justify-center">
                    {items.length > 1 && (
                      <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-red-400 hover:text-red-300" onClick={() => removeItem(idx)}>
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
          <div className="rounded-lg border border-white/10 bg-white/5 p-3 space-y-1 text-xs font-mono">
            <div className="flex justify-between"><span className="text-white/60">Gross Amount</span><span className="font-bold">{formatNpr(grossTotal)}</span></div>
            <div className="flex justify-between"><span className="text-white/60">Retention ({retentionPercent}%)</span><span className="text-amber-400">-{formatNpr(retentionAmt)}</span></div>
            <div className="flex justify-between"><span className="text-white/60">VAT ({vatPercent}%)</span><span>+{formatNpr(vatAmt)}</span></div>
            <div className="flex justify-between"><span className="text-white/60">TDS ({tdsPercent}%)</span><span>-{formatNpr(tdsAmt)}</span></div>
            {parseFloat(materialDeduction || "0") > 0 && <div className="flex justify-between"><span className="text-white/60">Material Deduction</span><span className="text-red-400">-{formatNpr(parseFloat(materialDeduction))}</span></div>}
            {parseFloat(advanceRecovery || "0") > 0 && <div className="flex justify-between"><span className="text-white/60">Advance Recovery</span><span className="text-red-400">-{formatNpr(parseFloat(advanceRecovery))}</span></div>}
            <div className="flex justify-between border-t border-white/10 pt-1 font-bold"><span>Net Payable</span><span className="text-primary">{formatNpr(netPayable)}</span></div>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} disabled={createMut.isPending} className="font-mono text-xs">Cancel</Button>
          <Button size="sm" className="bg-primary text-primary-foreground font-mono text-xs" onClick={handleSubmit} disabled={createMut.isPending}>
            {createMut.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <Plus className="h-3.5 w-3.5 mr-1.5" />}
            Create Bill
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
