"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, Loader2, Link2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc-client";

type Material = { id: string; name: string };
type Supplier = { id: string; name: string };

export function CreatePODialog({
  projectId, materials, suppliers, onDone
}: {
  projectId: string; materials: Material[]; suppliers: Supplier[]; onDone: () => void;
}) {
  const utils = trpc.useUtils();
  const [selectedReqId, setSelectedReqId] = useState("");
  const [supplierId, setSupplierId] = useState("");
  const [expectedDate, setExpectedDate] = useState("");
  const [remarks, setRemarks] = useState("");
  const [items, setItems] = useState<{ materialId: string; quantity: number; rate: number; requisitionItemId?: string }[]>([]);

  // Fetch Requisitions for linking
  const { data: reqsData } = trpc.requisition.list.useQuery({ projectId });

  // Filter approved or partially ordered requisitions
  const approvedReqs = (reqsData?.requisitions || []).filter(
    (r) => r.status === "approved" || r.status === "partially_ordered"
  );

  const handleSelectRequisition = (reqId: string) => {
    setSelectedReqId(reqId);
    if (!reqId) return;

    const req = approvedReqs.find((r) => r.id === reqId);
    if (!req) return;

    // Find awarded supplier if any
    const firstItemWithQuote = req.items.find((i) => i.selectedPartnerId);
    if (firstItemWithQuote?.selectedPartnerId) {
      // Find matching supplier id
      const matchedSup = suppliers.find((s) => s.id === firstItemWithQuote.selectedPartnerId);
      if (matchedSup) setSupplierId(matchedSup.id);
    }

    // Auto fill items from requisition
    const reqItems = req.items.map((it) => {
      const selQuote = it.quotes.find((q) => q.partnerId === it.selectedPartnerId);
      const rate = selQuote ? selQuote.exFactoryRate + selQuote.transportRate : 0;
      const remainingQty = Math.max(0, it.quantity - (it.orderedQty || 0));

      return {
        materialId: it.materialId,
        quantity: remainingQty || it.quantity,
        rate,
        requisitionItemId: it.id,
      };
    });

    setItems(reqItems);
    toast.success(`Pre-filled ${reqItems.length} items from Requisition ${req.number}`);
  };

  const addPOItem = () => {
    setItems([...items, { materialId: "", quantity: 1, rate: 0 }]);
  };

  const removePOItem = (index: number) => {
    setItems(items.filter((_, i) => i !== index));
  };

  const updatePOItem = (index: number, key: "materialId" | "quantity" | "rate", value: string) => {
    const updated = [...items];
    if (key === "materialId") {
      updated[index].materialId = value;
    } else {
      updated[index][key] = parseFloat(value) || 0;
    }
    setItems(updated);
  };

  const mutation = trpc.purchaseOrder.create.useMutation({
    onSuccess: () => {
      utils.material.list.invalidate({ projectId });
      utils.requisition.list.invalidate({ projectId });
      toast.success("Purchase Order drafted successfully");
      onDone();
    },
    onError: (e) => toast.error(e.message),
  });

  const [deliveryTerms, setDeliveryTerms] = useState("");
  const [paymentTerms, setPaymentTerms] = useState("");
  const [vatPercent, setVatPercent] = useState<number>(13);

  const subtotal = items.reduce((sum, it) => sum + (it.quantity * it.rate), 0);
  const vatAmount = (subtotal * vatPercent) / 100;
  const netAmount = subtotal + vatAmount;

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    mutation.mutate({
      projectId,
      supplierId,
      partnerId: supplierId, // Sync partner
      expectedDate: expectedDate ? new Date(expectedDate).toISOString() : undefined,
      deliveryTerms: deliveryTerms || undefined,
      paymentTerms: paymentTerms || undefined,
      vatPercent,
      remarks: remarks || undefined,
      items: items.map(it => ({
        materialId: it.materialId,
        quantity: it.quantity,
        rate: it.rate,
        requisitionItemId: it.requisitionItemId || undefined,
      })),
    });
  };

  return (
    <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle className="text-base font-bold flex items-center gap-2">
          <Link2 className="h-5 w-5 text-blue-600" />
          Draft Purchase Order
        </DialogTitle>
        <DialogDescription className="text-xs">
          Draft a PO directly or link to an Approved Requisition to auto-fill items and supplier rates.
        </DialogDescription>
      </DialogHeader>

      <form onSubmit={onSubmit} className="space-y-4">
        {/* Optional Requisition Link Selector */}
        <div className="bg-blue-50/50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900 rounded-xl p-3 space-y-1.5">
          <Label className="text-xs font-semibold text-blue-900 dark:text-blue-200 flex items-center gap-1.5">
            <Sparkles className="h-3.5 w-3.5 text-blue-500" />
            Link to Approved Requisition (PR)
          </Label>
          <select
            value={selectedReqId}
            onChange={(e) => handleSelectRequisition(e.target.value)}
            className="flex h-8 w-full rounded-lg border border-input bg-background px-2.5 text-xs text-foreground shadow-2xs focus:ring-1 focus:ring-blue-500"
          >
            <option value="">-- Optional: Select Approved Requisition to Auto-Fill --</option>
            {approvedReqs.map((r) => (
              <option key={r.id} value={r.id}>
                {r.number} (Req by: {r.createdBy.name} — {r.items.length} items)
              </option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">Select Vendor / Supplier *</Label>
            <select
              value={supplierId}
              onChange={(e) => setSupplierId(e.target.value)}
              required
              className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-xs shadow-2xs"
            >
              <option value="" disabled>-- Select Vendor / Supplier --</option>
              {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">Expected Delivery Date</Label>
            <Input value={expectedDate} onChange={(e) => setExpectedDate(e.target.value)} type="date" className="h-8 text-xs" />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">Delivery Terms</Label>
            <Input
              placeholder="e.g. Delivered at Site / F.O.R Site Store"
              value={deliveryTerms}
              onChange={(e) => setDeliveryTerms(e.target.value)}
              className="h-8 text-xs"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">Payment Terms</Label>
            <Input
              placeholder="e.g. 30 days after store receipt"
              value={paymentTerms}
              onChange={(e) => setPaymentTerms(e.target.value)}
              className="h-8 text-xs"
            />
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex justify-between items-center">
            <Label className="text-xs font-semibold">Order Items *</Label>
            <Button type="button" size="sm" variant="outline" onClick={addPOItem} className="h-7 text-xs">
              <Plus className="mr-1 h-3.5 w-3.5" /> Add Item
            </Button>
          </div>

          {items.length === 0 ? (
            <div className="border border-dashed rounded-lg p-6 text-center text-xs text-muted-foreground">
              No items added yet. Pick a Requisition above or click "Add Item".
            </div>
          ) : (
            <div className="space-y-3">
              {items.map((item, idx) => (
                <div key={idx} className="flex gap-3 items-end">
                  <div className="flex-1 space-y-1">
                    <Label className="text-[10px] text-muted-foreground">Material</Label>
                    <select
                      value={item.materialId}
                      onChange={(e) => updatePOItem(idx, "materialId", e.target.value)}
                      required
                      className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-xs shadow-2xs"
                    >
                      <option value="" disabled>-- Select Material --</option>
                      {materials.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                    </select>
                  </div>
                  <div className="w-24 space-y-1">
                    <Label className="text-[10px] text-muted-foreground">Quantity</Label>
                    <Input value={item.quantity} onChange={(e) => updatePOItem(idx, "quantity", e.target.value)} type="number" step="0.01" required className="h-8 text-xs font-mono" />
                  </div>
                  <div className="w-32 space-y-1">
                    <Label className="text-[10px] text-muted-foreground">Rate (NPR)</Label>
                    <Input value={item.rate} onChange={(e) => updatePOItem(idx, "rate", e.target.value)} type="number" step="0.01" required className="h-8 text-xs font-mono" />
                  </div>
                  <Button type="button" size="icon" variant="ghost" className="h-8 w-8 text-red-500 hover:text-red-600" onClick={() => removePOItem(idx)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>

        {items.length > 0 && (
          <div className="rounded-lg border p-3 bg-muted/20 space-y-1.5 text-xs font-mono">
            <div className="flex justify-between text-muted-foreground">
              <span>Subtotal:</span>
              <span>NPR {subtotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
            </div>
            <div className="flex justify-between text-emerald-600 dark:text-emerald-400">
              <span>+ 13% VAT:</span>
              <span>NPR {vatAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
            </div>
            <div className="border-t pt-1 flex justify-between font-bold text-sm text-foreground">
              <span>Grand Total (Net):</span>
              <span className="text-blue-600 dark:text-blue-400">NPR {netAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
            </div>
          </div>
        )}

        <div className="space-y-1.5">
          <Label className="text-xs font-semibold">Special Instructions / Remarks</Label>
          <Textarea value={remarks} onChange={(e) => setRemarks(e.target.value)} placeholder="Terms of delivery, quality requirements, notes..." className="text-xs" />
        </div>

        <DialogFooter>
          <Button size="sm" type="submit" disabled={mutation.isPending || items.length === 0 || !supplierId} className="bg-blue-600 hover:bg-blue-700 text-white">
            {mutation.isPending && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
            Draft Purchase Order
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
