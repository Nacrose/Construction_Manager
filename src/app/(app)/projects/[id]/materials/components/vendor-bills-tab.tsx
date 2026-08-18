"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc-client";
import { format } from "date-fns";
import {
  FileText,
  Plus,
  CreditCard,
  Building2,
  CheckCircle2,
  AlertCircle,
  Clock,
  Loader2,
  Filter,
  DollarSign,
  Receipt,
  Scale,
  Paperclip
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
  const [billDate, setBillDate] = useState(new Date().toISOString().split("T")[0]);
  const [dueDate, setDueDate] = useState("");
  const [grossAmount, setGrossAmount] = useState<number | "">("");
  const [vatPercent, setVatPercent] = useState<number>(13);
  const [tdsPercent, setTdsPercent] = useState<number>(1.5);
  const [billRemarks, setBillRemarks] = useState("");

  // Payment state
  const [paymentAmount, setPaymentAmount] = useState<number | "">("");
  const [paymentMethod, setPaymentMethod] = useState<"bank_transfer" | "cheque" | "cash">("bank_transfer");
  const [paymentRef, setPaymentRef] = useState("");
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split("T")[0]);
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

  const bills = data?.bills || [];
  const summary = data?.summary || { totalBilled: 0, totalPaid: 0, pendingPayable: 0, overdueCount: 0 };
  const partners = partnersData?.partners || [];
  const purchaseOrders = posData?.purchaseOrders || [];

  // When PO is picked in create dialog, auto-populate partner & estimated amount
  const handlePOChange = (poId: string) => {
    setSelectedPOId(poId);
    const po = purchaseOrders.find((p) => p.id === poId);
    if (po) {
      if (po.partner?.id) setSelectedPartnerId(po.partner.id);
      if (po.totalAmount) setGrossAmount(po.totalAmount);
    }
  };

  const handleCreateBill = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPartnerId || !billNumber.trim() || !grossAmount || Number(grossAmount) <= 0) {
      toast.error("Please fill in all required fields");
      return;
    }

    createBillMutation.mutate({
      projectId,
      partnerId: selectedPartnerId,
      purchaseOrderId: selectedPOId || null,
      billNumber: billNumber.trim(),
      billDate,
      dueDate: dueDate || null,
      grossAmount: Number(grossAmount),
      vatPercent,
      tdsPercent,
      remarks: billRemarks || null,
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
      paymentDate,
      paymentMethod,
      referenceNumber: paymentRef || null,
      remarks: paymentRemarks || null,
    });
  };

  const gross = Number(grossAmount) || 0;
  const computedVat = (gross * vatPercent) / 100;
  const computedTds = (gross * tdsPercent) / 100;
  const computedNet = gross + computedVat - computedTds;

  return (
    <div className="space-y-6">
      {/* Top Metrics Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="border border-border/80 shadow-sm bg-gradient-to-br from-card to-muted/20">
          <CardHeader className="p-4 pb-1">
            <CardDescription className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Total Invoiced (Net)
            </CardDescription>
            <CardTitle className="text-xl font-bold font-mono text-foreground">
              NPR {summary.totalBilled.toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-1">
            <p className="text-xs text-muted-foreground">Cumulative bills recorded across all suppliers</p>
          </CardContent>
        </Card>

        <Card className="border border-border/80 shadow-sm bg-gradient-to-br from-emerald-50/50 to-background dark:from-emerald-950/20 dark:to-card">
          <CardHeader className="p-4 pb-1">
            <CardDescription className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider">
              Total Settled / Paid
            </CardDescription>
            <CardTitle className="text-xl font-bold font-mono text-emerald-700 dark:text-emerald-300">
              NPR {summary.totalPaid.toLocaleString(undefined, { minimumFractionDigits: 2 })}
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
              NPR {summary.pendingPayable.toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-1">
            <p className="text-xs text-muted-foreground">{summary.overdueCount} bills currently outstanding</p>
          </CardContent>
        </Card>
      </div>

      {/* Header & Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b pb-4">
        <div>
          <h3 className="text-lg font-bold text-foreground flex items-center gap-2">
            <Receipt className="h-5 w-5 text-primary" />
            <span>3-Way Matching & Vendor Invoices</span>
          </h3>
          <p className="text-xs text-muted-foreground">
            Verify PO orders, GRN store receipts, and supplier bills with automated VAT and TDS calculations
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Select value={statusFilter} onValueChange={(val: any) => setStatusFilter(val)}>
            <SelectTrigger className="h-9 w-36 text-xs">
              <SelectValue placeholder="Filter Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="unpaid">Unpaid</SelectItem>
              <SelectItem value="partially_paid">Partially Paid</SelectItem>
              <SelectItem value="paid">Fully Settled</SelectItem>
            </SelectContent>
          </Select>

          <Button size="sm" onClick={() => setCreateBillOpen(true)} className="gap-1.5 h-9 text-xs shadow-sm">
            <Plus className="h-4 w-4" />
            Register Vendor Bill
          </Button>
        </div>
      </div>

      {/* Bills Table */}
      {isLoading ? (
        <div className="p-12 text-center text-muted-foreground flex items-center justify-center gap-2">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span>Loading vendor bills...</span>
        </div>
      ) : bills.length === 0 ? (
        <Card className="text-center p-8">
          <CardContent className="space-y-3">
            <FileText className="h-10 w-10 text-muted-foreground mx-auto" />
            <p className="text-sm font-medium">No vendor bills recorded</p>
            <Button size="sm" onClick={() => setCreateBillOpen(true)}>Register First Vendor Bill</Button>
          </CardContent>
        </Card>
      ) : (
        <div className="rounded-xl border border-border/80 bg-card overflow-hidden shadow-sm">
          <table className="w-full text-xs">
            <thead className="bg-muted/40 border-b">
              <tr>
                <th className="py-3 px-3 text-left font-semibold text-muted-foreground">Bill No / Date</th>
                <th className="py-3 px-3 text-left font-semibold text-muted-foreground">Vendor / Supplier</th>
                <th className="py-3 px-3 text-left font-semibold text-muted-foreground">Matched PO</th>
                <th className="py-3 px-3 text-right font-semibold text-muted-foreground">Gross (NPR)</th>
                <th className="py-3 px-3 text-right font-semibold text-muted-foreground">VAT & TDS</th>
                <th className="py-3 px-3 text-right font-semibold text-muted-foreground">Net Payable</th>
                <th className="py-3 px-3 text-right font-semibold text-muted-foreground">Paid Amount</th>
                <th className="py-3 px-3 text-center font-semibold text-muted-foreground">Status</th>
                <th className="py-3 px-3 text-right font-semibold text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {bills.map((bill) => {
                const remaining = Math.max(0, bill.netPayable - bill.paidAmount);

                return (
                  <tr key={bill.id} className="hover:bg-muted/10">
                    <td className="py-3 px-3">
                      <p className="font-bold text-foreground font-mono">{bill.billNumber}</p>
                      <p className="text-[11px] text-muted-foreground">{format(new Date(bill.billDate), "dd MMM yyyy")}</p>
                    </td>

                    <td className="py-3 px-3">
                      <p className="font-medium text-foreground">{bill.partner.name}</p>
                      {bill.partner.pan && (
                        <p className="text-[10px] font-mono text-muted-foreground">PAN: {bill.partner.pan}</p>
                      )}
                    </td>

                    <td className="py-3 px-3">
                      {bill.purchaseOrder ? (
                        <Badge variant="outline" className="font-mono text-[10px]">
                          {bill.purchaseOrder.number}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground italic text-[11px]">Direct Bill</span>
                      )}
                    </td>

                    <td className="py-3 px-3 text-right font-mono font-medium">
                      {bill.grossAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </td>

                    <td className="py-3 px-3 text-right font-mono text-[11px] text-muted-foreground">
                      <p className="text-emerald-600 dark:text-emerald-400">+13% VAT: {bill.vatAmount.toLocaleString()}</p>
                      <p className="text-amber-600 dark:text-amber-400">-1.5% TDS: {bill.tdsAmount.toLocaleString()}</p>
                    </td>

                    <td className="py-3 px-3 text-right font-mono font-bold text-foreground">
                      {bill.netPayable.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </td>

                    <td className="py-3 px-3 text-right font-mono font-semibold text-emerald-600 dark:text-emerald-400">
                      {bill.paidAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </td>

                    <td className="py-3 px-3 text-center">
                      {bill.status === "paid" ? (
                        <Badge className="bg-emerald-600 text-white text-[10px] py-0 px-2 font-mono">Paid</Badge>
                      ) : bill.status === "partially_paid" ? (
                        <Badge variant="secondary" className="bg-amber-100 text-amber-800 dark:bg-amber-900/60 dark:text-amber-300 text-[10px] py-0 px-2 font-mono">
                          Partially Paid
                        </Badge>
                      ) : (
                        <Badge variant="destructive" className="text-[10px] py-0 px-2 font-mono">
                          Unpaid
                        </Badge>
                      )}
                    </td>

                    <td className="py-3 px-3 text-right">
                      {bill.status !== "paid" && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setSelectedBillForPayment(bill);
                            setPaymentAmount(remaining);
                            setRecordPaymentOpen(true);
                          }}
                          className="h-7 text-[11px] gap-1 px-2 font-medium"
                        >
                          <CreditCard className="h-3 w-3 text-primary" />
                          Pay
                        </Button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Register Vendor Bill Dialog */}
      <Dialog open={createBillOpen} onOpenChange={setCreateBillOpen}>
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Receipt className="h-5 w-5 text-primary" />
              <span>Register Vendor Invoice (3-Way Match)</span>
            </DialogTitle>
            <DialogDescription>
              Record supplier bill with 3-way matching against Purchase Orders and GRNs.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleCreateBill} className="space-y-4 pt-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label className="text-xs font-semibold">Match Purchase Order (Optional)</Label>
                <Select value={selectedPOId} onValueChange={handlePOChange}>
                  <SelectTrigger className="mt-1 text-xs">
                    <SelectValue placeholder="Select PO to match" />
                  </SelectTrigger>
                  <SelectContent>
                    {purchaseOrders.map((po) => (
                      <SelectItem key={po.id} value={po.id} className="text-xs">
                        {po.number} ({po.partner?.name || po.supplier?.name}) - NPR {po.totalAmount.toLocaleString()}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="text-xs font-semibold">Vendor / Supplier *</Label>
                <Select value={selectedPartnerId} onValueChange={setSelectedPartnerId}>
                  <SelectTrigger className="mt-1 text-xs">
                    <SelectValue placeholder="Select vendor" />
                  </SelectTrigger>
                  <SelectContent>
                    {partners.map((p) => (
                      <SelectItem key={p.id} value={p.id} className="text-xs">
                        {p.name} {p.pan ? `(PAN: ${p.pan})` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* 3-Way Match Summary if PO picked */}
            {matchData && (
              <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 space-y-2 text-xs">
                <div className="flex justify-between items-center">
                  <span className="font-semibold text-primary">PO & GRN Matching Summary:</span>
                  <Badge variant="outline" className="font-mono text-[10px]">
                    {matchData.grnTransactions.length} GRN Receipts
                  </Badge>
                </div>
                <div className="space-y-1">
                  {matchData.items.map((it) => (
                    <div key={it.materialId} className="flex justify-between text-muted-foreground text-[11px]">
                      <span>{it.materialName}:</span>
                      <span className="font-mono">
                        Received {it.receivedQty} / Ordered {it.orderedQty} {it.unit} ({it.deliveredPercent.toFixed(0)}%)
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <Label className="text-xs font-semibold">Supplier Bill No *</Label>
                <Input
                  placeholder="e.g. INV-2024-884"
                  value={billNumber}
                  onChange={(e) => setBillNumber(e.target.value)}
                  required
                  className="mt-1 text-sm font-mono"
                />
              </div>

              <div>
                <Label className="text-xs font-semibold">Bill Date *</Label>
                <Input
                  type="date"
                  value={billDate}
                  onChange={(e) => setBillDate(e.target.value)}
                  required
                  className="mt-1 text-sm"
                />
              </div>

              <div>
                <Label className="text-xs font-semibold">Due Date</Label>
                <Input
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className="mt-1 text-sm"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <Label className="text-xs font-semibold">Gross Amount (NPR) *</Label>
                <Input
                  type="number"
                  placeholder="0.00"
                  value={grossAmount}
                  onChange={(e) => setGrossAmount(e.target.value === "" ? "" : Number(e.target.value))}
                  required
                  min="0.01"
                  step="any"
                  className="mt-1 text-sm font-mono"
                />
              </div>

              <div>
                <Label className="text-xs font-semibold">VAT %</Label>
                <Input
                  type="number"
                  value={vatPercent}
                  onChange={(e) => setVatPercent(Number(e.target.value))}
                  className="mt-1 text-sm font-mono"
                />
              </div>

              <div>
                <Label className="text-xs font-semibold">TDS % Withheld</Label>
                <Input
                  type="number"
                  value={tdsPercent}
                  onChange={(e) => setTdsPercent(Number(e.target.value))}
                  step="0.1"
                  className="mt-1 text-sm font-mono"
                />
              </div>
            </div>

            {/* Computation Summary */}
            <div className="rounded-lg border p-3 bg-muted/20 space-y-1.5 text-xs font-mono">
              <div className="flex justify-between text-muted-foreground">
                <span>Gross Amount:</span>
                <span>NPR {gross.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
              </div>
              <div className="flex justify-between text-emerald-600 dark:text-emerald-400">
                <span>+ 13% VAT:</span>
                <span>NPR {computedVat.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
              </div>
              <div className="flex justify-between text-amber-600 dark:text-amber-400">
                <span>- {tdsPercent}% TDS:</span>
                <span>NPR {computedTds.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
              </div>
              <div className="border-t pt-1 flex justify-between font-bold text-sm text-foreground">
                <span>Net Payable:</span>
                <span className="text-primary">NPR {computedNet.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
              </div>
            </div>

            <div>
              <Label className="text-xs font-semibold">Remarks / Notes</Label>
              <Input
                placeholder="e.g. Cement 53 Grade consignment delivery bill"
                value={billRemarks}
                onChange={(e) => setBillRemarks(e.target.value)}
                className="mt-1 text-sm"
              />
            </div>

            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" onClick={() => setCreateBillOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={createBillMutation.isPending}>
                {createBillMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-1.5" />}
                Save Vendor Bill
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Record Payment Dialog */}
      <Dialog open={recordPaymentOpen} onOpenChange={setRecordPaymentOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CreditCard className="h-5 w-5 text-emerald-600" />
              <span>Record Vendor Payment</span>
            </DialogTitle>
            <DialogDescription>
              Disburse payment against Bill #{selectedBillForPayment?.billNumber} ({selectedBillForPayment?.partner?.name})
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleRecordPayment} className="space-y-4 pt-2">
            <div>
              <Label className="text-xs font-semibold">Payment Amount (NPR) *</Label>
              <Input
                type="number"
                value={paymentAmount}
                onChange={(e) => setPaymentAmount(e.target.value === "" ? "" : Number(e.target.value))}
                required
                min="0.01"
                step="any"
                className="mt-1 text-sm font-mono"
              />
              {selectedBillForPayment && (
                <p className="text-[11px] text-muted-foreground mt-1 font-mono">
                  Remaining Due: NPR {(selectedBillForPayment.netPayable - selectedBillForPayment.paidAmount).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs font-semibold">Payment Method</Label>
                <Select value={paymentMethod} onValueChange={(val: any) => setPaymentMethod(val)}>
                  <SelectTrigger className="mt-1 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="bank_transfer">Bank Transfer (IPS)</SelectItem>
                    <SelectItem value="cheque">Cheque</SelectItem>
                    <SelectItem value="cash">Cash Voucher</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="text-xs font-semibold">Payment Date</Label>
                <Input
                  type="date"
                  value={paymentDate}
                  onChange={(e) => setPaymentDate(e.target.value)}
                  required
                  className="mt-1 text-sm"
                />
              </div>
            </div>

            <div>
              <Label className="text-xs font-semibold">Bank / Cheque Reference No</Label>
              <Input
                placeholder="e.g. Nabil Bank Trx #8849201"
                value={paymentRef}
                onChange={(e) => setPaymentRef(e.target.value)}
                className="mt-1 text-sm font-mono"
              />
            </div>

            <div>
              <Label className="text-xs font-semibold">Payment Remarks</Label>
              <Input
                placeholder="e.g. Settled after store verification"
                value={paymentRemarks}
                onChange={(e) => setPaymentRemarks(e.target.value)}
                className="mt-1 text-sm"
              />
            </div>

            {!isFinancialAdmin && (
              <div className="rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/50 p-2.5 text-[11px] text-amber-800 dark:text-amber-300 flex items-center gap-2">
                <AlertCircle className="h-4 w-4 shrink-0 text-amber-600" />
                <span>Financial Clearance: Recording payments requires Project Manager or Coordinator role.</span>
              </div>
            )}

            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" onClick={() => setRecordPaymentOpen(false)}>
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={recordPaymentMutation.isPending || !isFinancialAdmin}
                className="bg-emerald-600 hover:bg-emerald-700 text-white"
              >
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
