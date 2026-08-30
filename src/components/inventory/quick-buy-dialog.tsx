"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc-client";
import { toast } from "sonner";
import { formatNpr } from "@/lib/currency";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ShoppingBag, Loader2, CreditCard, ReceiptText, Building2 } from "lucide-react";

interface QuickBuyDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  onSuccess?: () => void;
}

export function QuickBuyDialog({
  open,
  onOpenChange,
  projectId,
  onSuccess,
}: QuickBuyDialogProps) {
  const utils = trpc.useUtils();

  const [supplierName, setSupplierName] = useState("");
  const [supplierPan, setSupplierPan] = useState("");
  const [materialName, setMaterialName] = useState("");
  const [category, setCategory] = useState("Cement & Concrete");
  const [quantity, setQuantity] = useState("");
  const [unit, setUnit] = useState("bag");
  const [rate, setRate] = useState("");
  const [paymentStatus, setPaymentStatus] = useState<"paid_now" | "credit">("credit");
  const [bankAccountId, setBankAccountId] = useState("");
  const [isVatBill, setIsVatBill] = useState(false);
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [billedToEntity, setBilledToEntity] = useState<"primary_org" | "dedicated_jv" | "lead_partner">("primary_org");

  // Query company bank accounts for paid now
  const { data: accountsData } = trpc.accounting.ledgerAccounts.useQuery(
    { projectId },
    { enabled: paymentStatus === "paid_now" }
  );
  const bankAccounts = (accountsData?.accounts || []).filter(
    (a: any) => a.type === "bank" || a.type === "cash"
  );

  const buyMutation = trpc.material.logDirectDelivery.useMutation({
    onSuccess: () => {
      toast.success("Direct material purchase recorded successfully!");
      utils.material.list.invalidate();
      utils.accounting.dayBook.invalidate();
      utils.vatRegister.getPurchaseRegister.invalidate();
      onOpenChange(false);
      resetForm();
      onSuccess?.();
    },
    onError: (e) => toast.error(e.message),
  });

  function resetForm() {
    setSupplierName("");
    setSupplierPan("");
    setMaterialName("");
    setQuantity("");
    setRate("");
    setInvoiceNumber("");
    setPaymentStatus("credit");
    setBankAccountId("");
    setIsVatBill(false);
    setBilledToEntity("primary_org");
  }

  const numQty = parseFloat(quantity) || 0;
  const numRate = parseFloat(rate) || 0;
  const baseAmount = numQty * numRate;
  const vatAmount = isVatBill ? baseAmount * 0.13 : 0;
  const totalAmount = baseAmount + vatAmount;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!supplierName || !materialName || numQty <= 0 || numRate <= 0) {
      toast.error("Please provide supplier name, material, quantity, and rate.");
      return;
    }

    if (paymentStatus === "paid_now" && !bankAccountId) {
      toast.error("Please select the payment bank/cash account.");
      return;
    }

    buyMutation.mutate({
      projectId,
      materialName: materialName.trim(),
      category,
      unit,
      quantity: numQty,
      rate: numRate,
      totalAmount,
      date: new Date().toISOString(),
      supplierName: supplierName.trim(),
      supplierPan: supplierPan.trim() || null,
      isVatBill,
      vatPercent: isVatBill ? 13 : 0,
      vatAmount,
      invoiceNumber: invoiceNumber.trim() || null,
      paymentStatus,
      bankAccountId: paymentStatus === "paid_now" ? bankAccountId : undefined,
      billedToEntity,
      remarks: `Direct Buy from ${supplierName.trim()} (${paymentStatus === "credit" ? "On Credit / Bahi Khata" : "Paid Now"})`,
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[650px] bg-[#0c1015] border-white/10 text-white backdrop-blur-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base font-bold text-white">
            <ShoppingBag className="h-5 w-5 text-emerald-400" />
            Quick Direct Material Buy (सामाग्री खरिद)
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            Directly update store stock, Day Book cash outflow (or Party Bahi Khata ledger), and VAT records with zero PO/GRN paperwork.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 pt-2">
          {/* Supplier / Party Info */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs font-semibold text-gray-200">Supplier / Store Name *</Label>
              <Input
                value={supplierName}
                onChange={(e) => setSupplierName(e.target.value)}
                placeholder="e.g. Pashupati Hardware & Suppliers"
                required
                className="h-9 text-xs bg-[#161d26] border-white/10 text-white"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-gray-300">Supplier PAN / Tax ID</Label>
              <Input
                value={supplierPan}
                onChange={(e) => setSupplierPan(e.target.value)}
                placeholder="e.g. 601234567"
                maxLength={9}
                className="h-9 text-xs bg-[#161d26] border-white/10 text-white font-mono"
              />
            </div>
          </div>

          {/* Material Name & Category */}
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2 space-y-1">
              <Label className="text-xs font-semibold text-gray-200">Material Name & Spec *</Label>
              <Input
                value={materialName}
                onChange={(e) => setMaterialName(e.target.value)}
                placeholder="e.g. Shivam OPC Cement 53 Grade"
                required
                className="h-9 text-xs bg-[#161d26] border-white/10 text-white"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-gray-300">Category</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger className="h-9 text-xs bg-[#161d26] border-white/10 text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-[#0f141c] border-white/10 text-white text-xs">
                  <SelectItem value="Cement & Concrete">Cement & Concrete</SelectItem>
                  <SelectItem value="Rebar & Steel">Rebar & Steel</SelectItem>
                  <SelectItem value="Aggregates & Sand">Aggregates & Sand</SelectItem>
                  <SelectItem value="Bricks & Blocks">Bricks & Blocks</SelectItem>
                  <SelectItem value="Plumbing & Sanitary">Plumbing & Sanitary</SelectItem>
                  <SelectItem value="Electrical">Electrical</SelectItem>
                  <SelectItem value="Fuel & Lubricants">Fuel & Lubricants</SelectItem>
                  <SelectItem value="Finishing & Paint">Finishing & Paint</SelectItem>
                  <SelectItem value="Hardware & Tools">Hardware & Tools</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Quantity, Unit & Rate */}
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1">
              <Label className="text-xs font-semibold text-gray-200">Quantity *</Label>
              <Input
                type="number"
                step="any"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                placeholder="e.g. 50"
                required
                className="h-9 text-xs bg-[#161d26] border-white/10 text-white"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-gray-300">Unit</Label>
              <Select value={unit} onValueChange={setUnit}>
                <SelectTrigger className="h-9 text-xs bg-[#161d26] border-white/10 text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-[#0f141c] border-white/10 text-white text-xs">
                  <SelectItem value="bag">bag (बोरा)</SelectItem>
                  <SelectItem value="kg">kg (किलो)</SelectItem>
                  <SelectItem value="MT">MT (टन)</SelectItem>
                  <SelectItem value="cu.m">cu.m (घन मिटर)</SelectItem>
                  <SelectItem value="cu.ft">cu.ft (घन फिट / CFT)</SelectItem>
                  <SelectItem value="trip">trip (ट्रिप)</SelectItem>
                  <SelectItem value="nos">nos (थान / गोटा)</SelectItem>
                  <SelectItem value="ltr">ltr (लिटर)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-semibold text-gray-200">Unit Rate (NPR) *</Label>
              <Input
                type="number"
                step="any"
                value={rate}
                onChange={(e) => setRate(e.target.value)}
                placeholder="e.g. 750"
                required
                className="h-9 text-xs bg-[#161d26] border-white/10 text-white"
              />
            </div>
          </div>

          {/* Payment Mode & VAT Options */}
          <div className="p-3 rounded-xl border border-white/10 bg-[#121822] space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CreditCard className="h-4 w-4 text-emerald-400" />
                <span className="text-xs font-semibold text-white">Payment Method</span>
              </div>
              <div className="flex items-center gap-2 bg-[#161d26] p-1 rounded-lg border border-white/10">
                <button
                  type="button"
                  onClick={() => setPaymentStatus("credit")}
                  className={`px-3 py-1 text-xs rounded-md font-semibold transition ${
                    paymentStatus === "credit" ? "bg-amber-500 text-black font-bold" : "text-gray-400 hover:text-white"
                  }`}
                >
                  On Credit (खातामा)
                </button>
                <button
                  type="button"
                  onClick={() => setPaymentStatus("paid_now")}
                  className={`px-3 py-1 text-xs rounded-md font-semibold transition ${
                    paymentStatus === "paid_now" ? "bg-emerald-500 text-black font-bold" : "text-gray-400 hover:text-white"
                  }`}
                >
                  Paid Now (नगद/बैंक)
                </button>
              </div>
            </div>

            {paymentStatus === "paid_now" && (
              <div className="space-y-1 pt-1">
                <Label className="text-xs text-gray-300">Paid From Bank / Cash Account *</Label>
                <Select value={bankAccountId} onValueChange={setBankAccountId}>
                  <SelectTrigger className="h-9 text-xs bg-[#161d26] border-white/10 text-white">
                    <SelectValue placeholder="Select paying bank/cash account…" />
                  </SelectTrigger>
                  <SelectContent className="bg-[#0f141c] border-white/10 text-white text-xs">
                    {bankAccounts.map((b: any) => (
                      <SelectItem key={b.id} value={b.id}>
                        {b.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* VAT Toggle & Bill No */}
            <div className="flex items-center justify-between pt-2 border-t border-white/10">
              <div className="flex items-center gap-2">
                <ReceiptText className="h-4 w-4 text-emerald-400" />
                <Label htmlFor="vat-toggle" className="text-xs text-gray-300 cursor-pointer">
                  VAT Bill (13% कर बीजक)
                </Label>
                <Switch id="vat-toggle" checked={isVatBill} onCheckedChange={setIsVatBill} />
              </div>

              {isVatBill && (
                <div className="flex items-center gap-2">
                  <Input
                    value={invoiceNumber}
                    onChange={(e) => setInvoiceNumber(e.target.value)}
                    placeholder="Bill / Invoice #"
                    className="h-8 w-36 text-xs bg-[#161d26] border-white/10 text-white font-mono"
                  />
                </div>
              )}
            </div>

            {/* Joint Venture PAN Entity Router */}
            <div className="flex items-center justify-between pt-2 border-t border-white/10">
              <div className="flex items-center gap-1.5 text-xs text-gray-300">
                <Building2 className="h-3.5 w-3.5 text-emerald-400" />
                <span>Invoice Issued To:</span>
              </div>
              <Select value={billedToEntity} onValueChange={(v: any) => setBilledToEntity(v)}>
                <SelectTrigger className="h-8 w-52 text-xs bg-[#161d26] border-white/10 text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-[#0f141c] border-white/10 text-white text-xs">
                  <SelectItem value="primary_org">Company Primary Org</SelectItem>
                  <SelectItem value="dedicated_jv">Dedicated JV PAN</SelectItem>
                  <SelectItem value="lead_partner">Lead Partner PAN</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Amount Summary */}
          <div className="flex items-center justify-between px-3 py-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-xs">
            <span className="text-gray-300">Total Purchase Value:</span>
            <span className="font-mono text-sm font-bold text-emerald-400">
              {formatNpr(totalAmount)} {isVatBill && "(incl. 13% VAT)"}
            </span>
          </div>

          {/* Footer Actions */}
          <div className="flex items-center justify-end gap-2 pt-2 border-t border-white/10">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="h-9 px-4 text-xs border-white/10 bg-[#161d26] text-gray-300 hover:text-white"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={buyMutation.isPending}
              className="h-9 px-5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-md"
            >
              {buyMutation.isPending && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
              Save Material Purchase
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
