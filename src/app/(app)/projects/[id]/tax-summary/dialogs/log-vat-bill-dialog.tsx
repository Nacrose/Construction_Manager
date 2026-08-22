"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc-client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Receipt, FileText, Upload, Paperclip, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { adToBs, bsToAd } from "@/lib/nepali-calendar";

export function LogVatBillDialog({
  projectId,
  open,
  onOpenChange,
  onSuccess,
}: {
  projectId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}) {
  const [billType, setBillType] = useState<"purchase" | "sales" | "expense" | "capital_goods" | "import">("purchase");
  const [billNumber, setBillNumber] = useState("");
  const [billDate, setBillDate] = useState(() => format(new Date(), "yyyy-MM-dd"));
  const [billMiti, setBillMiti] = useState(() => {
    try {
      return adToBs(new Date()).formatted;
    } catch {
      return "";
    }
  });

  const [partyName, setPartyName] = useState("");
  const [partyPan, setPartyPan] = useState("");
  const [partyAddress, setPartyAddress] = useState("");
  const [taxableAmount, setTaxableAmount] = useState<number>(0);
  const [exemptAmount, setExemptAmount] = useState<number>(0);
  const [vatPercent, setVatPercent] = useState<number>(13);
  const [tdsPercent, setTdsPercent] = useState<number>(0);
  const [category, setCategory] = useState("office_overhead");
  const [description, setDescription] = useState("");

  const [fileData, setFileData] = useState<string | null>(null);
  const [fileName, setFileName] = useState("");

  const createMut = trpc.vatRegister.createDirectVatBill.useMutation({
    onSuccess: () => {
      toast.success("VAT Bill registered successfully into Statutory Ledger");
      onSuccess();
      onOpenChange(false);
      resetForm();
    },
    onError: (e) => toast.error(e.message),
  });

  const resetForm = () => {
    setBillNumber("");
    setPartyName("");
    setPartyPan("");
    setTaxableAmount(0);
    setExemptAmount(0);
    setDescription("");
    setFileData(null);
    setFileName("");
  };

  const handleDateChange = (adDateStr: string) => {
    setBillDate(adDateStr);
    try {
      setBillMiti(adToBs(adDateStr).formatted);
    } catch {
      // ignore
    }
  };

  const handleMitiChange = (bsDateStr: string) => {
    setBillMiti(bsDateStr);
    try {
      const [y, m, d] = bsDateStr.split("-").map(Number);
      const ad = bsToAd(y, m, d);
      if (ad) {
        setBillDate(format(ad, "yyyy-MM-dd"));
      }
    } catch {
      // ignore
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 10 * 1024 * 1024) {
      toast.error("File size exceeds 10MB limit");
      return;
    }

    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (event) => {
      setFileData(event.target?.result as string);
    };
    reader.readAsDataURL(file);
  };

  const vatAmount = (taxableAmount * (vatPercent || 13)) / 100;
  const totalAmount = taxableAmount + exemptAmount + vatAmount;
  const tdsAmount = (taxableAmount * (tdsPercent || 0)) / 100;
  const netPayable = Math.max(0, totalAmount - tdsAmount);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!billNumber.trim()) {
      toast.error("Please enter Bill / Invoice number");
      return;
    }
    if (!partyName.trim()) {
      toast.error("Please enter Party / Supplier Name");
      return;
    }
    if (taxableAmount <= 0 && exemptAmount <= 0) {
      toast.error("Please enter taxable or exempt amount");
      return;
    }

    createMut.mutate({
      projectId,
      billType,
      billNumber,
      billDate,
      billMiti,
      partyName,
      partyPan: partyPan || undefined,
      partyAddress: partyAddress || undefined,
      taxableAmount: Number(taxableAmount),
      exemptAmount: Number(exemptAmount),
      vatPercent: Number(vatPercent),
      tdsPercent: Number(tdsPercent),
      category,
      description: description || undefined,
      scannedBillUrl: fileData || undefined,
      scannedBillName: fileName || undefined,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Receipt className="h-5 w-5 text-primary" />
            Direct VAT Bill Entry (खरिद / बिक्री बीजक प्रविष्टि)
          </DialogTitle>
          <DialogDescription className="text-xs">
            Enter standalone VAT invoices for Schedule 8 (Purchase) or Schedule 9 (Sales). Attaching a scanned copy is soft-mandatory.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-3.5 py-2">
          {/* Bill Type & Dates */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            <div className="space-y-1">
              <Label className="text-xs font-semibold">Register Destination *</Label>
              <Select value={billType} onValueChange={(val: any) => setBillType(val)}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="purchase">खरिद (Purchase Local)</SelectItem>
                  <SelectItem value="capital_goods">पुँजीगत (Capital Asset/Machinery)</SelectItem>
                  <SelectItem value="import">भन्सार पैठारी (Import)</SelectItem>
                  <SelectItem value="sales">बिक्री (Sales / Revenue)</SelectItem>
                  <SelectItem value="expense">Site / Office Overhead</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Date (AD) *</Label>
              <Input
                type="date"
                value={billDate}
                onChange={(e) => handleDateChange(e.target.value)}
                className="h-8 text-xs font-mono"
                required
              />
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Miti (BS) *</Label>
              <Input
                value={billMiti}
                onChange={(e) => handleMitiChange(e.target.value)}
                placeholder="2081-01-20"
                className="h-8 text-xs font-mono"
                required
              />
            </div>
          </div>

          {/* Invoice No. & Party Details */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            <div className="space-y-1">
              <Label className="text-xs font-semibold">Invoice / Bill No. *</Label>
              <Input
                value={billNumber}
                onChange={(e) => setBillNumber(e.target.value)}
                placeholder="BILL-2024-001"
                className="h-8 text-xs font-mono"
                required
              />
            </div>

            <div className="space-y-1">
              <Label className="text-xs font-semibold">Party / Supplier Name *</Label>
              <Input
                value={partyName}
                onChange={(e) => setPartyName(e.target.value)}
                placeholder="e.g. Shree Ganesh Hardware"
                className="h-8 text-xs"
                required
              />
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Party PAN / VAT No. (9 Digits)</Label>
              <Input
                value={partyPan}
                onChange={(e) => setPartyPan(e.target.value)}
                placeholder="301234567"
                maxLength={9}
                className="h-8 text-xs font-mono"
              />
            </div>
          </div>

          {/* Amounts & Taxes */}
          <div className="p-3 bg-muted/20 rounded-md border space-y-2.5">
            <Label className="text-xs font-semibold uppercase text-muted-foreground">
              Taxable Values &amp; Calculations (Nepal 13% VAT)
            </Label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              <div className="space-y-1">
                <Label className="text-xs">Taxable Base (13%)</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={taxableAmount || ""}
                  onChange={(e) => setTaxableAmount(parseFloat(e.target.value) || 0)}
                  placeholder="0.00"
                  className="h-8 text-xs font-mono font-bold"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Exempt / Non-VAT (0%)</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={exemptAmount || ""}
                  onChange={(e) => setExemptAmount(parseFloat(e.target.value) || 0)}
                  placeholder="0.00"
                  className="h-8 text-xs font-mono"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs">VAT % (13%)</Label>
                <Input
                  type="number"
                  value={vatPercent}
                  onChange={(e) => setVatPercent(parseFloat(e.target.value) || 0)}
                  className="h-8 text-xs font-mono"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs">TDS % (Sec 89: 1.5%)</Label>
                <Input
                  type="number"
                  value={tdsPercent}
                  onChange={(e) => setTdsPercent(parseFloat(e.target.value) || 0)}
                  placeholder="0"
                  className="h-8 text-xs font-mono"
                />
              </div>
            </div>

            {/* Live Tax Banner */}
            <div className="p-2.5 bg-muted/50 rounded border text-xs font-mono flex items-center justify-between">
              <div>
                <span className="text-muted-foreground text-[10px]">13% VAT Amount:</span>
                <p className="font-bold text-foreground">NPR {vatAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
              </div>
              <div className="text-center">
                <span className="text-muted-foreground text-[10px]">Total Invoice Gross:</span>
                <p className="font-bold text-foreground">NPR {totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
              </div>
              <div className="text-right">
                <span className="text-muted-foreground text-[10px]">Net Payable (After TDS):</span>
                <p className="font-extrabold text-emerald-700 dark:text-emerald-300">
                  NPR {netPayable.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </p>
              </div>
            </div>
          </div>

          {/* Description & Scanned Copy */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <div className="space-y-1">
              <Label className="text-xs">Expense Category / Remarks</Label>
              <Input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="e.g. Site Generator Diesel, Cement testing fee"
                className="h-8 text-xs"
              />
            </div>

            <div className="space-y-1">
              <Label className="text-xs font-medium">Attach Scanned Bill (PDF/Image)</Label>
              <Input
                type="file"
                accept="application/pdf,image/*"
                onChange={handleFileChange}
                className="h-8 text-xs file:text-xs"
              />
              {fileName && (
                <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                  <Paperclip className="h-3 w-3 text-primary" /> {fileName}
                </p>
              )}
            </div>
          </div>

          <DialogFooter className="border-t pt-3">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
              disabled={createMut.isPending}
            >
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={createMut.isPending} className="font-semibold">
              {createMut.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />}
              Save VAT Bill (NPR {totalAmount.toLocaleString()})
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
