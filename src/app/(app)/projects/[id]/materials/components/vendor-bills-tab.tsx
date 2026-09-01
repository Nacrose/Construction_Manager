"use client";

import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc-client";
import { format } from "date-fns";
import { getLocalDateString } from "@/lib/nepali-calendar";
import {
  FileText,
  Plus,
  CreditCard,
  Building2,
  Loader2,
  Receipt,
  Scale,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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
import { toast } from "sonner";
import { formatNpr } from "@/lib/construction-finance";
import { ConstructionTable, type ConstructionTableColumn } from "@/components/ui/construction-table";
import { StatusBadge } from "@/components/ui/status-badge";

interface VendorBillsTabProps {
  projectId: string;
}

export function VendorBillsTab({ projectId }: VendorBillsTabProps) {
  const utils = trpc.useUtils();
  const [statusFilter, setStatusFilter] = useState<"all" | "unpaid" | "partially_paid" | "paid">("all");
  const { data: projectInfo } = trpc.project.get.useQuery({ id: projectId });
  const isFinancialAdmin = projectInfo?.myRole === "project_manager" || projectInfo?.myRole === "coordinator";

  const { data, isLoading } = trpc.vendorBill.list.useQuery({
    projectId,
    status: statusFilter,
  });

  const { data: partnersData } = trpc.partner.listPartners.useQuery({ projectId, type: "material_supplier" });
  const { data: posData } = trpc.purchaseOrder.list.useQuery({ projectId });

  const [createBillOpen, setCreateBillOpen] = useState(false);
  const [recordPaymentOpen, setRecordPaymentOpen] = useState(false);
  const [selectedBillForPayment, setSelectedBillForPayment] = useState<any | null>(null);

  // New bill state
  const [selectedPartnerId, setSelectedPartnerId] = useState("");
  const [selectedPOId, setSelectedPOId] = useState("");
  const [billNumber, setBillNumber] = useState("");
  const [billDate, setBillDate] = useState(() => getLocalDateString());
  const [dueDate, setDueDate] = useState("");
  const [grossAmount, setGrossAmount] = useState<number | "">("");
  const [vatPercent, setVatPercent] = useState<number>(13);
  const [tdsPercent, setTdsPercent] = useState<number>(1.5);
  const [billRemarks, setBillRemarks] = useState("");

  // Payment state
  const [paymentAmount, setPaymentAmount] = useState<number | "">("");
  const [paymentMethod, setPaymentMethod] = useState<"bank_transfer" | "cheque" | "cash">("bank_transfer");
  const [paymentRef, setPaymentRef] = useState("");
  const [paymentDate, setPaymentDate] = useState(() => getLocalDateString());
  const [paymentRemarks, setPaymentRemarks] = useState("");

  // 3-Way Match Data
  const { data: matchData } = trpc.vendorBill.getThreeWayMatchData.useQuery(
    { projectId, purchaseOrderId: selectedPOId },
    { enabled: !!selectedPOId }
  );

  const createBillMutation = trpc.vendorBill.create.useMutation({
    onSuccess: () => {
      toast.success("Vendor Bill registered successfully");
      utils.vendorBill.list.invalidate({ projectId });
      setCreateBillOpen(false);
      setSelectedPartnerId("");
      setSelectedPOId("");
      setBillNumber("");
      setGrossAmount("");
      setBillRemarks("");
    },
    onError: (err) => {
      toast.error(err.message || "Failed to register bill");
    },
  });

  const recordPaymentMutation = trpc.vendorBill.recordPayment.useMutation({
    onSuccess: () => {
      toast.success("Payment recorded successfully");
      utils.vendorBill.list.invalidate({ projectId });
      setRecordPaymentOpen(false);
      setSelectedBillForPayment(null);
      setPaymentAmount("");
      setPaymentRef("");
      setPaymentRemarks("");
    },
    onError: (err) => {
      toast.error(err.message || "Failed to record payment");
    },
  });

  const handleCreateBill = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPartnerId || !billNumber || !grossAmount || Number(grossAmount) <= 0) {
      toast.error("Please fill required fields with valid amounts");
      return;
    }

    createBillMutation.mutate({
      projectId,
      partnerId: selectedPartnerId,
      purchaseOrderId: selectedPOId || undefined,
      billNumber,
      billDate: new Date(billDate).toISOString(),
      dueDate: dueDate ? new Date(dueDate).toISOString() : undefined,
      grossAmount: Number(grossAmount),
      vatPercent,
      tdsPercent,
      remarks: billRemarks || undefined,
    });
  };

  const handleRecordPayment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedBillForPayment || !paymentAmount || Number(paymentAmount) <= 0) {
      toast.error("Please enter a valid payment amount");
      return;
    }

    recordPaymentMutation.mutate({
      projectId,
      vendorBillId: selectedBillForPayment.id,
      amount: Number(paymentAmount),
      paymentMethod,
      referenceNumber: paymentRef || undefined,
      paymentDate: new Date(paymentDate).toISOString(),
      remarks: paymentRemarks || undefined,
    });
  };

  const openPaymentModal = (bill: any) => {
    setSelectedBillForPayment(bill);
    const remaining = Math.max(0, bill.netPayable - bill.paidAmount);
    setPaymentAmount(remaining);
    setRecordPaymentOpen(true);
  };

  const bills = data?.bills || [];
  const summary = data?.summary || { totalBilled: 0, totalPaid: 0, pendingPayable: 0, overdueCount: 0 };

  const columns: ConstructionTableColumn<any>[] = useMemo(
    () => [
      {
        key: "billNumber",
        header: "Bill No / Date",
        render: (val, row) => (
          <div>
            <p className="font-bold text-foreground font-mono">{val}</p>
            <p className="text-[11px] text-muted-foreground">{format(new Date(row.billDate), "dd MMM yyyy")}</p>
          </div>
        ),
      },
      {
        key: "partner",
        header: "Vendor / Supplier",
        render: (val) => (
          <div>
            <p className="font-medium text-foreground">{val.name}</p>
            {val.pan && <p className="text-[10px] font-mono text-muted-foreground">PAN: {val.pan}</p>}
          </div>
        ),
      },
      {
        key: "purchaseOrder",
        header: "Matched PO",
        render: (val) =>
          val ? (
            <Badge variant="outline" className="font-mono text-[10px]">
              {val.number}
            </Badge>
          ) : (
            <span className="text-muted-foreground italic text-[11px]">Direct Bill</span>
          ),
      },
      {
        key: "grossAmount",
        header: "Gross (NPR)",
        align: "right",
        summary: "sum",
        className: "font-mono font-medium",
        render: (val) => formatNpr(val),
      },
      {
        key: "vatAmount",
        header: "VAT & TDS",
        align: "right",
        render: (_val, row) => (
          <div className="text-[11px] font-mono">
            <p className="text-emerald-600 dark:text-[#0284c7]">+13% VAT: {formatNpr(row.vatAmount)}</p>
            <p className="text-amber-600 dark:text-amber-400">-1.5% TDS: {formatNpr(row.tdsAmount)}</p>
          </div>
        ),
      },
      {
        key: "netPayable",
        header: "Net Payable",
        align: "right",
        summary: "sum",
        className: "font-mono font-bold text-foreground",
        render: (val) => formatNpr(val),
      },
      {
        key: "paidAmount",
        header: "Paid Amount",
        align: "right",
        summary: "sum",
        className: "font-mono font-semibold text-emerald-600 dark:text-[#0284c7]",
        render: (val) => formatNpr(val),
      },
      {
        key: "status",
        header: "Status",
        align: "center",
        render: (val) => (
          <StatusBadge
            status={val === "paid" ? "approved" : val === "partially_paid" ? "in_progress" : "pending"}
            label={val === "paid" ? "Paid" : val === "partially_paid" ? "Partial" : "Unpaid"}
            size="xs"
          />
        ),
      },
      {
        key: "id",
        header: "Actions",
        align: "right",
        render: (_idVal, row) =>
          row.status !== "paid" ? (
            <Button
              size="sm"
              variant="outline"
              onClick={() => openPaymentModal(row)}
              className="h-7 text-xs gap-1 border-primary/40 hover:bg-primary/10 text-primary font-medium"
            >
              <CreditCard className="h-3 w-3" />
              Pay
            </Button>
          ) : null,
      },
    ],
    []
  );

  return (
    <div className="space-y-4">
      {/* 3 Summary Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="border border-border/80 shadow-sm bg-gradient-to-br from-card to-muted/20">
          <CardHeader className="p-4 pb-1">
            <CardDescription className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Total Invoiced Bills
            </CardDescription>
            <CardTitle className="text-xl font-bold font-mono text-foreground">
              NPR {formatNpr(summary.totalBilled)}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-1">
            <p className="text-xs text-muted-foreground">{bills.length} total vendor bills recorded</p>
          </CardContent>
        </Card>

        <Card className="border border-border/80 shadow-sm bg-gradient-to-br from-emerald-50/50 to-background dark:from-emerald-950/20 dark:to-card">
          <CardHeader className="p-4 pb-1">
            <CardDescription className="text-xs font-semibold text-emerald-600 dark:text-[#0284c7] uppercase tracking-wider">
              Total Settled / Paid
            </CardDescription>
            <CardTitle className="text-xl font-bold font-mono text-emerald-700 dark:text-emerald-300">
              NPR {formatNpr(summary.totalPaid)}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-1">
            <p className="text-xs text-muted-foreground">Confirmed payments & bank disbursements</p>
          </CardContent>
        </Card>

        <Card className="border border-border/80 shadow-sm bg-gradient-to-br from-amber-50/50 to-background dark:from-amber-950/20 dark:to-card">
          <CardHeader className="p-4 pb-1">
            <CardDescription className="text-xs font-semibold text-amber-600 dark:text-amber-400 uppercase tracking-wider">
              Pending Accounts Payable
            </CardDescription>
            <CardTitle className="text-xl font-bold font-mono text-amber-700 dark:text-amber-300">
              NPR {formatNpr(summary.pendingPayable)}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-1">
            <p className="text-xs text-muted-foreground">{summary.overdueCount} bills currently outstanding</p>
          </CardContent>
        </Card>
      </div>

      {/* Vendor Bills Construction Table */}
      <ConstructionTable
        title="3-Way Matching & Vendor Invoices"
        data={bills}
        columns={columns}
        searchPlaceholder="Search bill number, vendor name, PAN..."
        exportExcel={{
          filename: `VendorBills_${projectId}_${format(new Date(), "yyyy-MM-dd")}`,
          sheetName: "VendorBills",
        }}
        emptyState={{
          icon: FileText,
          title: "No Vendor Bills Recorded",
          description: "Register vendor invoices to track 3-way procurement matching and accounts payable.",
        }}
        headerActions={
          <div className="flex items-center gap-2">
            <div className="w-32">
              <Select value={statusFilter} onValueChange={(val: any) => setStatusFilter(val)}>
                <SelectTrigger className="h-8 text-xs font-mono bg-[#f8fbfe] border-[#c7d8e8] text-slate-900 rounded-lg">
                  <SelectValue placeholder="All Statuses" />
                </SelectTrigger>
                <SelectContent className="bg-white border-emerald-500/30 text-xs">
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="unpaid">Unpaid</SelectItem>
                  <SelectItem value="partially_paid">Partially Paid</SelectItem>
                  <SelectItem value="paid">Fully Settled</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Button
              size="sm"
              onClick={() => setCreateBillOpen(true)}
              className="h-8 px-3 text-xs font-semibold amber-cta-btn rounded-lg shadow-[0_0_15px_rgba(0,255,102,0.25)] gap-1"
            >
              <Plus className="h-3 w-3" /> Register Bill
            </Button>
          </div>
        }
      />

      {/* Register Vendor Bill Modal */}
      <Dialog open={createBillOpen} onOpenChange={setCreateBillOpen}>
        <DialogContent className="max-w-xl bg-card border-border font-sans">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <Receipt className="h-5 w-5 text-primary" />
              <span>Register Vendor Invoice (3-Way Matching)</span>
            </DialogTitle>
            <DialogDescription className="text-xs">
              Record a supplier material bill. System automatically applies Nepal 13% VAT &amp; 1.5% TDS rules.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleCreateBill} className="space-y-4 pt-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Vendor / Supplier *</Label>
                <Select value={selectedPartnerId} onValueChange={setSelectedPartnerId} required>
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue placeholder="Select supplier" />
                  </SelectTrigger>
                  <SelectContent>
                    {partnersData?.partners?.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name} {p.pan ? `(PAN: ${p.pan})` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Matched Purchase Order (Optional)</Label>
                <Select value={selectedPOId} onValueChange={setSelectedPOId}>
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue placeholder="Link to approved PO" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None (Direct Site Purchase)</SelectItem>
                    {posData?.purchaseOrders?.map((po) => (
                      <SelectItem key={po.id} value={po.id}>
                        PO #{po.number} ({formatNpr(po.totalAmount)})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* 3-Way Match Verification Card */}
            {matchData && selectedPOId && selectedPOId !== "none" && (
              <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 space-y-2 text-xs">
                <div className="flex items-center justify-between font-semibold text-primary">
                  <div className="flex items-center gap-1.5">
                    <Scale className="h-4 w-4" />
                    <span>3-Way PO &amp; GRN Verification</span>
                  </div>
                  <Badge variant="outline" className="text-[10px] text-[#0284c7] border-emerald-500/30">
                    Linked PO #{matchData.po.number}
                  </Badge>
                </div>
                <div className="grid grid-cols-2 gap-2 text-[11px] pt-1">
                  <div>
                    <span className="text-muted-foreground block">PO Contract Amount:</span>
                    <span className="font-mono font-medium">{formatNpr(matchData.po.totalAmount)}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground block">Delivered Items:</span>
                    <span className="font-mono font-medium">{matchData.items.length} materials tracked</span>
                  </div>
                </div>
              </div>
            )}

            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Bill / Invoice No. *</Label>
                <Input
                  placeholder="e.g. INV-8821"
                  value={billNumber}
                  onChange={(e) => setBillNumber(e.target.value)}
                  className="h-9 text-xs font-mono"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Bill Date *</Label>
                <Input
                  type="date"
                  value={billDate}
                  onChange={(e) => setBillDate(e.target.value)}
                  className="h-9 text-xs"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Payment Due Date</Label>
                <Input
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className="h-9 text-xs"
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Taxable Amount (NPR) *</Label>
                <Input
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  value={grossAmount}
                  onChange={(e) => setGrossAmount(e.target.value ? parseFloat(e.target.value) : "")}
                  className="h-9 text-xs font-mono font-bold"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">VAT %</Label>
                <Input
                  type="number"
                  step="0.1"
                  value={vatPercent}
                  onChange={(e) => setVatPercent(parseFloat(e.target.value) || 0)}
                  className="h-9 text-xs font-mono"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">TDS %</Label>
                <Input
                  type="number"
                  step="0.1"
                  value={tdsPercent}
                  onChange={(e) => setTdsPercent(parseFloat(e.target.value) || 0)}
                  className="h-9 text-xs font-mono"
                />
              </div>
            </div>

            {/* Live Calculation Preview */}
            {typeof grossAmount === "number" && grossAmount > 0 && (
              <div className="rounded-lg border bg-muted/40 p-3 space-y-1 text-xs font-mono">
                <div className="flex justify-between text-muted-foreground">
                  <span>Taxable Base:</span>
                  <span>{formatNpr(grossAmount)}</span>
                </div>
                <div className="flex justify-between text-emerald-600 dark:text-[#0284c7]">
                  <span>+ {vatPercent}% VAT:</span>
                  <span>+{formatNpr((grossAmount * vatPercent) / 100)}</span>
                </div>
                <div className="flex justify-between text-amber-600 dark:text-amber-400">
                  <span>- {tdsPercent}% TDS Deduction:</span>
                  <span>-{formatNpr((grossAmount * tdsPercent) / 100)}</span>
                </div>
                <div className="flex justify-between border-t border-border pt-1 font-bold text-sm text-foreground">
                  <span>Net Payable to Supplier:</span>
                  <span>
                    {formatNpr(
                      grossAmount + (grossAmount * vatPercent) / 100 - (grossAmount * tdsPercent) / 100
                    )}
                  </span>
                </div>
              </div>
            )}

            <div className="space-y-1.5">
              <Label className="text-xs">Remarks / Item Details</Label>
              <Input
                placeholder="e.g. 500 bags OPC Cement delivered via Challan #4421"
                value={billRemarks}
                onChange={(e) => setBillRemarks(e.target.value)}
                className="h-9 text-xs"
              />
            </div>

            <DialogFooter className="gap-2 pt-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setCreateBillOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" size="sm" disabled={createBillMutation.isPending}>
                {createBillMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-1.5" />}
                Register Vendor Bill
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Record Payment Modal */}
      <Dialog open={recordPaymentOpen} onOpenChange={setRecordPaymentOpen}>
        <DialogContent className="max-w-md bg-card border-border font-sans">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <CreditCard className="h-5 w-5 text-emerald-600" />
              <span>Record Vendor Bill Payment</span>
            </DialogTitle>
            <DialogDescription className="text-xs">
              Bill #{selectedBillForPayment?.billNumber} &middot; {selectedBillForPayment?.partner?.name}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleRecordPayment} className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Payment Amount (NPR) *</Label>
              <Input
                type="number"
                step="0.01"
                placeholder="0.00"
                value={paymentAmount}
                onChange={(e) => setPaymentAmount(e.target.value ? parseFloat(e.target.value) : "")}
                className="h-9 text-xs font-mono font-bold"
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Payment Method *</Label>
                <Select value={paymentMethod} onValueChange={(v: any) => setPaymentMethod(v)}>
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="bank_transfer">Bank Transfer / connectIPS</SelectItem>
                    <SelectItem value="cheque">Bank Cheque</SelectItem>
                    <SelectItem value="cash">Cash</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Payment Date *</Label>
                <Input
                  type="date"
                  value={paymentDate}
                  onChange={(e) => setPaymentDate(e.target.value)}
                  className="h-9 text-xs"
                  required
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Reference No / Cheque No.</Label>
              <Input
                placeholder="e.g. Cheque #88129 or connectIPS TXN ID"
                value={paymentRef}
                onChange={(e) => setPaymentRef(e.target.value)}
                className="h-9 text-xs font-mono"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Remarks</Label>
              <Input
                placeholder="Optional remarks..."
                value={paymentRemarks}
                onChange={(e) => setPaymentRemarks(e.target.value)}
                className="h-9 text-xs"
              />
            </div>

            <DialogFooter className="gap-2 pt-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setRecordPaymentOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" size="sm" disabled={recordPaymentMutation.isPending}>
                {recordPaymentMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-1.5" />}
                Confirm Payment
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
