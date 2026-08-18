"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc-client";

type Material = { id: string; name: string; code: string | null; unit: string; currentStock: number };
type GateEntry = { id: string; number: string; vehicleNo: string; status: string };
type PurchaseOrder = { id: string; number: string; status: string; supplier?: { name: string } | null; partner?: { name: string } | null; items: { materialId: string; quantity: number; rate: number }[] };

export function LogTransactionDialog({
  projectId, materials, pendingGateEntries, activePOs, subcontractors, defaultMaterialId, defaultType, defaultGateId, onDone
}: {
  projectId: string; materials: Material[]; pendingGateEntries: GateEntry[]; activePOs: PurchaseOrder[]; subcontractors: any[];
  defaultMaterialId: string; defaultType: "receive" | "issue"; defaultGateId: string; onDone: () => void;
}) {
  const utils = trpc.useUtils();
  const [materialId, setMaterialId] = useState(defaultMaterialId || "");
  const [type, setType] = useState<"receive" | "issue" | "transfer" | "adjustment">(defaultType || "receive");
  const [quantity, setQuantity] = useState("");
  const [rate, setRate] = useState("");
  const [reference, setReference] = useState("");
  const [remarks, setRemarks] = useState("");

  const [gateEntryId, setGateEntryId] = useState(defaultGateId || "");
  const [purchaseOrderId, setPurchaseOrderId] = useState("");

  const [isDebitable, setIsDebitable] = useState(false);
  const [subcontractorId, setSubcontractorId] = useState("");
  const [recoveryRate, setRecoveryRate] = useState("");
  const [paymentType, setPaymentType] = useState<"payable" | "unpayable" | "temporary">("payable");

  const [isEmergency, setIsEmergency] = useState(false);
  const [emergencyReason, setEmergencyReason] = useState("");

  const [vatPercent, setVatPercent] = useState("13");
  const [tdsPercent, setTdsPercent] = useState("0");
  const [supplierInvoiceNo, setSupplierInvoiceNo] = useState("");
  const [supplierPan, setSupplierPan] = useState("");

  const [override, setOverride] = useState(false);
  const [showOverride, setShowOverride] = useState(false);

  const [materialCatalogId, setMaterialCatalogId] = useState("");
  const { data: catalogData } = trpc.materialCatalog.list.useQuery({ limit: 500 }, { enabled: type === "receive" });
  const catalogItems = catalogData?.items || [];

  const selectedMaterial = materials.find((m) => m.id === materialId);

  const handleGateSelect = (val: string) => {
    setGateEntryId(val);
    const gate = pendingGateEntries.find(g => g.id === val);
    if (gate) {
      setReference(gate.number);
      setRemarks(`Matched Gate Pass ${gate.number} (Vehicle ${gate.vehicleNo}).`);
      if (gate.number) setQuantity(gate.number);
    }
  };

  const handlePOSelect = (val: string) => {
    setPurchaseOrderId(val);
    const po = activePOs.find(p => p.id === val);
    if (po) {
      setReference(po.number);
      setRemarks(`Received against Purchase Order ${po.number}.`);
      if (po.items.length > 0) {
        setMaterialId(po.items[0].materialId);
        setRate(po.items[0].rate.toString());
        setQuantity(po.items[0].quantity.toString());
      }
    }
  };

  const mutation = trpc.material.createTransaction.useMutation({
    onSuccess: (d: any) => {
      utils.material.list.invalidate({ projectId });
      utils.material.listTransactions.invalidate({ projectId });
      utils.material.listGateEntries.invalidate({ projectId });
      if (d.warning) {
        toast.warning(d.warning, { duration: 10000 });
      } else {
        toast.success("Transaction recorded successfully");
      }
      onDone();
    },
    onError: (e) => {
      toast.error(e.message);
      if (e.message.includes("OVER_ISSUE")) {
        setShowOverride(true);
      }
    },
  });

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const emergencyTag = isEmergency ? `[EMERGENCY SUBSTITUTION]: ${emergencyReason || "Unscheduled field brand substitution"}. ` : "";
    const finalRemarks = `${emergencyTag}${remarks}`.trim();

    mutation.mutate({
      materialId,
      projectId,
      type,
      quantity: parseFloat(quantity),
      rate: parseFloat(rate) || 0,
      reference: reference || undefined,
      remarks: finalRemarks || undefined,
      gateEntryId: type === "receive" && gateEntryId ? gateEntryId : undefined,
      purchaseOrderId: type === "receive" && purchaseOrderId ? purchaseOrderId : undefined,
      materialCatalogId: type === "receive" && materialCatalogId ? materialCatalogId : undefined,
      isDebitable: (type === "issue" || type === "transfer") && isDebitable,
      subcontractorId: (type === "issue" || type === "transfer") && isDebitable ? subcontractorId : undefined,
      recoveryRate: (type === "issue" || type === "transfer") && isDebitable && recoveryRate ? parseFloat(recoveryRate) : undefined,
      paymentType: type === "issue" || type === "transfer" ? (paymentType as any) : "payable",
      vatPercent: type === "receive" ? parseFloat(vatPercent) || 0 : 0,
      tdsPercent: type === "receive" ? parseFloat(tdsPercent) || 0 : 0,
      supplierInvoiceNo: type === "receive" ? (supplierInvoiceNo || undefined) : undefined,
      supplierPan: type === "receive" ? (supplierPan || undefined) : undefined,
      override,
    });
  };

  const baseAmount = (parseFloat(quantity) || 0) * (parseFloat(rate) || 0);
  const vatAmt = (baseAmount * (parseFloat(vatPercent) || 0)) / 100;
  const tdsAmt = (baseAmount * (parseFloat(tdsPercent) || 0)) / 100;
  const totalWithVat = baseAmount + vatAmt;
  const netPayable = totalWithVat - tdsAmt;

  return (
    <DialogContent className="max-w-md">
      <DialogHeader><DialogTitle>Record Material Transaction</DialogTitle></DialogHeader>
      <form onSubmit={onSubmit} className="space-y-3">
        {type === "receive" && (
          <div className="grid grid-cols-2 gap-3 border p-2.5 rounded-md bg-muted/20">
            <div className="space-y-1">
              <Label className="text-xs">Link Gate Pass (Optional)</Label>
              <select value={gateEntryId} onChange={(e) => handleGateSelect(e.target.value)} className="w-full rounded border border-input bg-background px-2 py-1 text-xs">
                <option value="">-- None --</option>
                {pendingGateEntries.map((g) => (
                  <option key={g.id} value={g.id}>{g.number} ({g.vehicleNo})</option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Link Purchase Order (Optional)</Label>
              <select value={purchaseOrderId} onChange={(e) => handlePOSelect(e.target.value)} className="w-full rounded border border-input bg-background px-2 py-1 text-xs">
                <option value="">-- None --</option>
                {activePOs.map((p) => (
                  <option key={p.id} value={p.id}>{p.number} ({p.partner?.name || p.supplier?.name || "Supplier"})</option>
                ))}
              </select>
            </div>
          </div>
        )}

        <div className="space-y-1.5">
          <Label>Select Material *</Label>
          <select value={materialId} onChange={(e) => setMaterialId(e.target.value)} required className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm">
            <option value="" disabled>-- Select Material --</option>
            {materials.map((m) => (
              <option key={m.id} value={m.id}>{m.name} {m.code ? `(${m.code})` : ""}</option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Transaction Type *</Label>
            <select value={type} onChange={(e) => setType(e.target.value as any)} required className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm">
              <option value="receive">Receive (GRN)</option>
              <option value="issue">Issue (Out)</option>
              <option value="transfer">Transfer (Out)</option>
              <option value="adjustment">Adjustment (In/Out)</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <Label>Quantity * {selectedMaterial && `(${selectedMaterial.unit})`}</Label>
            <Input value={quantity} onChange={(e) => setQuantity(e.target.value)} type="number" step="0.01" required />
          </div>
        </div>

        {(type === "issue" || type === "transfer") && (
          <div className="border p-2.5 rounded-md bg-muted/20 space-y-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Payment Classification</Label>
                <select value={paymentType} onChange={(e) => setPaymentType(e.target.value as any)} className="w-full rounded border border-input bg-background px-2 py-1 text-xs">
                  <option value="payable">Payable Work</option>
                  <option value="unpayable">Non-Payable (Remedial/Waste)</option>
                  <option value="temporary">Temporary (Reusable Scaffold)</option>
                </select>
              </div>
              <div className="flex items-center gap-1.5 pt-4">
                <input type="checkbox" id="isDebitable" checked={isDebitable} onChange={(e) => setIsDebitable(e.target.checked)} className="rounded border-input" />
                <Label htmlFor="isDebitable" className="text-xs cursor-pointer font-normal">Debitable Recovery</Label>
              </div>
            </div>

            {isDebitable && (
              <div className="grid grid-cols-2 gap-3 border-t pt-2 mt-1">
                <div className="space-y-1">
                  <Label className="text-xs">Select Subcontractor *</Label>
                  <select value={subcontractorId} onChange={(e) => setSubcontractorId(e.target.value)} required className="w-full rounded border border-input bg-background px-2 py-1 text-xs">
                    <option value="" disabled>-- Select Subcontractor --</option>
                    {subcontractors.map((s: any) => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Recovery Rate (NPR/unit)</Label>
                  <Input value={recoveryRate} onChange={(e) => setRecoveryRate(e.target.value)} type="number" step="0.01" className="h-7 text-xs" placeholder={rate || "0.00"} />
                </div>
              </div>
            )}

            {/* Emergency Material Substitution Toggle */}
            <div className="border-t pt-2 mt-2 space-y-1.5">
              <div className="flex items-center gap-1.5">
                <input
                  type="checkbox"
                  id="isEmergency"
                  checked={isEmergency}
                  onChange={(e) => setIsEmergency(e.target.checked)}
                  className="rounded border-input text-red-600 focus:ring-red-500"
                />
                <Label htmlFor="isEmergency" className="text-xs cursor-pointer font-semibold text-red-600 dark:text-red-400 flex items-center gap-1">
                  🚨 Flag as Emergency Substitution
                </Label>
              </div>
              {isEmergency && (
                <div className="space-y-1 bg-red-50/50 dark:bg-red-950/20 p-2 rounded border border-red-200 dark:border-red-900">
                  <Label className="text-[10px] font-semibold text-red-800 dark:text-red-300">
                    Emergency Substitution Reason / Justification *
                  </Label>
                  <Input
                    value={emergencyReason}
                    onChange={(e) => setEmergencyReason(e.target.value)}
                    placeholder="e.g. Primary Shivam 53 Grade ran out mid-slab pour; issued Hetauda 53 Grade emergency stock"
                    required={isEmergency}
                    className="h-7 text-xs bg-background"
                  />
                </div>
              )}
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5"><Label>Rate (NPR per unit)</Label><Input value={rate} onChange={(e) => setRate(e.target.value)} type="number" step="0.01" /></div>
          <div className="space-y-1.5"><Label>Reference (e.g. Invoice #)</Label><Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="INV-001" /></div>
        </div>

        {type === "receive" && (
          <div className="border border-amber-500/30 bg-amber-500/5 p-3 rounded-md space-y-2.5">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold uppercase text-amber-700 dark:text-amber-400">Tax (VAT / TDS)</p>
              <span className="text-[10px] text-muted-foreground">Applies to receive (GRN) only</span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">VAT %</Label>
                <Input value={vatPercent} onChange={(e) => setVatPercent(e.target.value)} type="number" step="0.01" min="0" max="100" className="h-8 text-sm" placeholder="13" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">TDS %</Label>
                <Input value={tdsPercent} onChange={(e) => setTdsPercent(e.target.value)} type="number" step="0.01" min="0" max="100" className="h-8 text-sm" placeholder="0" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Supplier Invoice No.</Label>
                <Input value={supplierInvoiceNo} onChange={(e) => setSupplierInvoiceNo(e.target.value)} className="h-8 text-sm" placeholder="BILL-2024-001" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Supplier PAN</Label>
                <Input value={supplierPan} onChange={(e) => setSupplierPan(e.target.value)} className="h-8 text-sm" placeholder="123456789" />
              </div>
            </div>
            <div className="space-y-1 pt-1 border-t border-amber-500/20">
              <Label className="text-xs font-medium">Link Item Catalog Spec (Optional)</Label>
              <select
                value={materialCatalogId}
                onChange={(e) => setMaterialCatalogId(e.target.value)}
                className="w-full rounded border border-input bg-background px-2.5 py-1.5 text-xs shadow-xs"
              >
                <option value="">-- Optional: Canonical Material Spec --</option>
                {catalogItems.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.name} {cat.category ? `(${cat.category})` : ""}
                  </option>
                ))}
              </select>
            </div>
            {baseAmount > 0 && (
              <div className="border-t border-amber-500/30 pt-2 space-y-1 text-xs">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Base amount:</span>
                  <span className="font-mono">NPR {baseAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">+ VAT ({vatPercent || 0}%):</span>
                  <span className="font-mono text-amber-700 dark:text-amber-400">NPR {vatAmt.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">− TDS ({tdsPercent || 0}%):</span>
                  <span className="font-mono text-red-600">NPR {tdsAmt.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                </div>
                <div className="flex justify-between border-t pt-1 font-semibold">
                  <span>Net payable:</span>
                  <span className="font-mono">NPR {netPayable.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                </div>
              </div>
            )}
          </div>
        )}

        {showOverride && (
          <div className="flex items-center gap-2 p-2 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900 rounded-md">
            <input type="checkbox" id="overrideCeiling" checked={override} onChange={(e) => setOverride(e.target.checked)} className="rounded border-input" />
            <Label htmlFor="overrideCeiling" className="text-xs text-amber-800 dark:text-amber-300 font-semibold cursor-pointer">Bypass Over-Issue limit validation</Label>
          </div>
        )}

        <div className="space-y-1.5"><Label>Remarks</Label><Textarea value={remarks} onChange={(e) => setRemarks(e.target.value)} placeholder="Log any details regarding transaction context..." /></div>
        <DialogFooter><Button type="submit" disabled={mutation.isPending}>{mutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Save Transaction</Button></DialogFooter>
      </form>
    </DialogContent>
  );
}
