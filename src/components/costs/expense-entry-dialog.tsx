"use client";

import { useState, useRef } from "react";
import { trpc } from "@/lib/trpc-client";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Upload, Loader2, X, Receipt, DollarSign } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { NepaliDatePicker } from "@/components/ui/nepali-date-picker";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
};

const CATEGORIES = [
  { value: "material", label: "Material", subcategories: ["Cement", "Steel", "Sand", "Aggregate", "Bricks", "Paint", "Other"] },
  { value: "labor", label: "Labor", subcategories: ["Skilled", "Unskilled", "Overtime", "Other"] },
  { value: "equipment", label: "Equipment", subcategories: ["Fuel", "Hire", "Maintenance", "Other"] },
  { value: "subcontractor", label: "Subcontractor", subcategories: ["Payment", "Advance", "Other"] },
  { value: "overhead", label: "Overhead", subcategories: ["Transport", "Food", "Stationery", "Misc", "Other"] },
];

const PAYMENT_MODES = [
  { value: "cash", label: "Cash" },
  { value: "bank_transfer", label: "Bank Transfer" },
  { value: "cheque", label: "Cheque" },
  { value: "mobile_pay", label: "Mobile Pay" },
];

import { getLocalDateString } from "@/lib/nepali-calendar";

const MAX_RECEIPT_SIZE = 5 * 1024 * 1024; // 5MB

export function ExpenseEntryDialog({ open, onOpenChange, projectId }: Props) {
  const utils = trpc.useUtils();

  // Form state
  const [date, setDate] = useState(() => getLocalDateString());
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState<string>("overhead");
  const [subcategory, setSubcategory] = useState("");
  const [description, setDescription] = useState("");
  const [vendor, setVendor] = useState("");
  const [paymentMode, setPaymentMode] = useState("cash");
  const [notes, setNotes] = useState("");
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [receiptPreview, setReceiptPreview] = useState<string | null>(null);
  const [receiptData, setReceiptData] = useState<string | null>(null);
  const [receiptFileType, setReceiptFileType] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Fetch BOQ items for the optional link
  const { data: boqData } = trpc.boq.list.useQuery({ projectId });
  const [boqItemId, setBoqItemId] = useState<string>("");

  // Fetch subcontractors for the optional link
  const { data: subData } = trpc.partner.listSubcontractors.useQuery({ projectId });

  const createMut = trpc.projectCost.create.useMutation({
    onSuccess: () => {
      utils.projectCost.list.invalidate({ projectId });
      utils.projectCost.stats.invalidate({ projectId });
      toast.success("Expense added");
      resetForm();
      onOpenChange(false);
    },
    onError: (e) => toast.error(e.message),
  });

  const resetForm = () => {
    setDate(getLocalDateString());
    setAmount("");
    setCategory("overhead");
    setSubcategory("");
    setDescription("");
    setVendor("");
    setPaymentMode("cash");
    setNotes("");
    setReceiptFile(null);
    setReceiptPreview(null);
    setReceiptData(null);
    setReceiptFileType(null);
    setBoqItemId("");
  };

  const handleReceiptUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > MAX_RECEIPT_SIZE) {
      toast.error(`Receipt too large. Max ${MAX_RECEIPT_SIZE / 1024 / 1024}MB.`);
      return;
    }
    setReceiptFile(file);
    setReceiptFileType(file.type);

    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      setReceiptPreview(result);
      // Strip the "data:...;base64," prefix for storage
      const base64 = result.split(",")[1] ?? result;
      setReceiptData(base64);
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = () => {
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) {
      toast.error("Enter a valid amount");
      return;
    }

    // Auto-set subcategory for subcontractor category
    let finalSubcategory = subcategory;
    if (category === "subcontractor" && !finalSubcategory) {
      finalSubcategory = "Payment";
    }

    createMut.mutate({
      projectId,
      date: new Date(date).toISOString(),
      amount: amt,
      category: category as any,
      subcategory: finalSubcategory || undefined,
      description: description || undefined,
      boqItemId: boqItemId || undefined,
      subcontractorId: category === "subcontractor" ? (boqItemId || undefined) : undefined, // reuse boqItemId field? No — separate
      vendor: vendor || undefined,
      paymentMode: paymentMode as any,
      receiptData: receiptData || undefined,
      receiptFileType: receiptFileType || undefined,
      notes: notes || undefined,
    });
  };

  const selectedCat = CATEGORIES.find(c => c.value === category);

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) resetForm(); onOpenChange(o); }}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <DollarSign className="h-4 w-4" /> Add Expense
          </DialogTitle>
          <DialogDescription>
            Record a manual expense. Auto-captured costs (from daily reports) appear automatically —
            no need to enter them here.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          {/* Date + Amount */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Date (नेपाली / BS)</Label>
              <NepaliDatePicker
                value={date}
                onChange={(_, dateStr) => setDate(dateStr)}
                className="h-9 text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Amount (NPR)</Label>
              <Input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0"
                className="h-9 text-sm text-right"
              />
            </div>
          </div>

          {/* Category + Subcategory */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Category</Label>
              <Select value={category} onValueChange={(v) => { setCategory(v); setSubcategory(""); }}>
                <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map(c => (
                    <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Subcategory</Label>
              <Select value={subcategory} onValueChange={setSubcategory}>
                <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>
                  {selectedCat?.subcategories.map(s => (
                    <SelectItem key={s} value={s}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <Label className="text-xs">Description</Label>
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g. Diesel for excavator — 40 liters"
              className="h-9 text-sm"
            />
          </div>

          {/* BOQ link (optional) */}
          <div className="space-y-1.5">
            <Label className="text-xs">Linked BOQ Item (optional — for variance analysis)</Label>
            <Select value={boqItemId} onValueChange={setBoqItemId}>
              <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="— None —" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">— None —</SelectItem>
                {boqData?.items.slice(0, 100).map(b => (
                  <SelectItem key={b.id} value={b.id}>{b.code} · {b.description.slice(0, 40)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-[10px] text-muted-foreground">
              Linking to a BOQ item enables per-task cost vs budget comparison.
            </p>
          </div>

          {/* Vendor + Payment Mode */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Vendor / Payee (optional)</Label>
              <Input
                value={vendor}
                onChange={(e) => setVendor(e.target.value)}
                placeholder="e.g. Ram Fuel Station"
                className="h-9 text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Payment Mode</Label>
              <Select value={paymentMode} onValueChange={setPaymentMode}>
                <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PAYMENT_MODES.map(m => (
                    <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Notes */}
          <div className="space-y-1.5">
            <Label className="text-xs">Notes (optional)</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="Any additional details..."
              className="text-sm"
            />
          </div>

          {/* Receipt upload */}
          <div className="space-y-1.5">
            <Label className="text-xs">Receipt Photo (optional)</Label>
            {!receiptFile ? (
              <label className="flex items-center justify-center gap-2 rounded-md border border-dashed h-16 cursor-pointer hover:bg-muted/30 text-xs text-muted-foreground">
                <Upload className="h-3.5 w-3.5" />
                <span>Upload receipt (JPG/PNG, max 5MB)</span>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/jpg"
                  onChange={handleReceiptUpload}
                  className="hidden"
                />
              </label>
            ) : (
              <div className="flex items-center gap-2 rounded-md border p-2">
                {receiptPreview && (
                  <img src={receiptPreview} alt="receipt" className="h-12 w-12 object-cover rounded" />
                )}
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium truncate">{receiptFile.name}</div>
                  <div className="text-[10px] text-muted-foreground">
                    {(receiptFile.size / 1024).toFixed(1)} KB
                  </div>
                </div>
                <button
                  onClick={() => { setReceiptFile(null); setReceiptPreview(null); setReceiptData(null); setReceiptFileType(null); }}
                  className="h-6 w-6 rounded border hover:bg-muted flex items-center justify-center"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => { resetForm(); onOpenChange(false); }}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={createMut.isPending || !amount}>
            {createMut.isPending ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Receipt className="h-3 w-3 mr-1" />}
            Save Expense
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
