"use client";

import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Loader2, Plus, AlertTriangle, Check, DollarSign } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type PartnerType = {
  id: string;
  name: string;
  supplies?: {
    materialName: string;
    unit: string;
    exFactoryRate: number;
    transportRate: number;
  }[];
};

export function CreateRequisitionDialog({
  projectId,
  materials,
  onDone,
}: {
  projectId: string;
  materials: { id: string; name: string; unit: string }[];
  onDone: () => void;
}) {
  const utils = trpc.useUtils();
  const [materialId, setMaterialId] = useState("");
  const [quantity, setQuantity] = useState<number>(0);
  const [remarks, setRemarks] = useState("");

  // Quotes state (ensure at least 3 quotes)
  const [quotes, setQuotes] = useState<
    { partnerId: string; exFactoryRate: number; transportRate: number; notes: string }[]
  >([
    { partnerId: "", exFactoryRate: 0, transportRate: 0, notes: "" },
    { partnerId: "", exFactoryRate: 0, transportRate: 0, notes: "" },
    { partnerId: "", exFactoryRate: 0, transportRate: 0, notes: "" },
  ]);

  const [selectedPartnerId, setSelectedPartnerId] = useState("");
  const [justification, setJustification] = useState("");

  const { data: partnersData } = trpc.partner.listPartners.useQuery({
    projectId,
    type: "material_supplier",
    limit: 500, // picker dialog: pull the deepest allowed page
  });
  const partners = (partnersData?.partners || []) as PartnerType[];

  const mut = trpc.requisition.create.useMutation({
    onSuccess: () => {
      toast.success("Purchase Requisition created successfully");
      utils.requisition.list.invalidate({ projectId });
      onDone();
    },
    onError: (e) => toast.error(e.message),
  });

  const selectedMaterial = materials.find((m) => m.id === materialId);

  // Auto-populate rates when vendor is selected or material changes
  const handlePartnerChange = (index: number, partnerId: string) => {
    const updatedQuotes = [...quotes];
    updatedQuotes[index].partnerId = partnerId;

    if (selectedMaterial && partnerId) {
      const vendor = partners.find((p) => p.id === partnerId);
      const supply = vendor?.supplies?.find(
        (s) => s.materialName.toLowerCase() === selectedMaterial.name.toLowerCase()
      );
      if (supply) {
        updatedQuotes[index].exFactoryRate = supply.exFactoryRate;
        updatedQuotes[index].transportRate = supply.transportRate;
        toast.info(`Pre-populated rates for ${vendor?.name}`);
      } else {
        updatedQuotes[index].exFactoryRate = 0;
        updatedQuotes[index].transportRate = 0;
      }
    }
    setQuotes(updatedQuotes);
  };

  // Re-check rates when material selection changes
  useEffect(() => {
    if (selectedMaterial) {
      const updatedQuotes = quotes.map((q) => {
        if (!q.partnerId) return q;
        const vendor = partners.find((p) => p.id === q.partnerId);
        const supply = vendor?.supplies?.find(
          (s) => s.materialName.toLowerCase() === selectedMaterial.name.toLowerCase()
        );
        return {
          ...q,
          exFactoryRate: supply?.exFactoryRate ?? 0,
          transportRate: supply?.transportRate ?? 0,
        };
      });
      setQuotes(updatedQuotes);
    }
  }, [materialId]);

  // Derived pricing calculations
  const quoteTotals = quotes.map((q) => q.exFactoryRate + q.transportRate);
  const minTotal = Math.min(...quoteTotals.filter((t, i) => quotes[i].partnerId !== ""));
  const selectedQuote = quotes.find((q) => q.partnerId === selectedPartnerId);
  const selectedTotal = selectedQuote ? selectedQuote.exFactoryRate + selectedQuote.transportRate : 0;
  const isHigherPriceSelected = selectedPartnerId && selectedTotal > minTotal && minTotal !== Infinity;

  const canSubmit =
    materialId &&
    quantity > 0 &&
    quotes.every((q) => q.partnerId !== "") &&
    selectedPartnerId &&
    (!isHigherPriceSelected || (justification && justification.trim() !== ""));

  const { data: budgetData } = trpc.requisition.checkBudgetVariance.useQuery(
    { projectId, items: [{ materialId, quantity }] },
    { enabled: !!materialId && quantity > 0 }
  );
  const budgetInfo = budgetData?.results?.[0];

  return (
    <DialogContent className="sm:max-w-4xl max-h-[90vh] overflow-y-auto">
      <DialogHeader className="pb-4">
        <DialogTitle>Create Purchase Requisition</DialogTitle>
        <DialogDescription>
          Compare rates from at least 3 vendors and submit a purchase request for approval.
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-4 py-2 text-xs">
        {/* Material Selection */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label className="text-xs">Select Material</Label>
            <select
              value={materialId}
              onChange={(e) => setMaterialId(e.target.value)}
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              <option value="">Choose material...</option>
              {materials.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name} ({m.unit})
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Quantity Needed</Label>
            <Input
              type="number"
              value={quantity || ""}
              onChange={(e) => setQuantity(Number(e.target.value))}
              placeholder="e.g. 500"
              className="h-9 text-sm"
            />
          </div>
        </div>

        {/* Budget Ceiling & Variance Check */}
        {budgetInfo && (
          <div className={`p-3 rounded-lg border text-xs flex items-center justify-between gap-3 ${
            budgetInfo.isOverBudget
              ? "bg-amber-50/70 border-amber-300 text-amber-900 dark:bg-amber-950/30 dark:border-amber-800 dark:text-amber-200"
              : "bg-success border-success/30 text-success dark:bg-success/20 dark:border-success dark:text-success/80"
          }`}>
            <div className="flex items-center gap-2">
              {budgetInfo.isOverBudget ? (
                <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
              ) : (
                <Check className="h-4 w-4 text-success shrink-0" />
              )}
              <div>
                <span className="font-bold">
                  {budgetInfo.isOverBudget ? `Budget Variance Alert: +${budgetInfo.variancePercent}% Over Planned BOQ` : "Within BOQ Budget Allowance"}
                </span>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  BOQ Planned: <strong className="font-mono">{budgetInfo.plannedQty}</strong> | Already Procured: <strong className="font-mono">{budgetInfo.alreadyProcured}</strong> | Remaining Allowance: <strong className="font-mono">{budgetInfo.remainingAllowance} {budgetInfo.unit}</strong>
                </p>
              </div>
            </div>
            {budgetInfo.isOverBudget && (
              <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-amber-200 dark:bg-amber-900 text-amber-800 dark:text-amber-200">
                Over-Budget
              </span>
            )}
          </div>
        )}

        {/* 3 Vendor Comparison Grid */}
        <div className="space-y-2 border-t pt-4">
          <p className="font-semibold text-xs text-muted-foreground uppercase tracking-wide">
            Vendor Comparison (Compare 3 Quotes)
          </p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
            {quotes.map((q, idx) => (
              <div
                key={idx}
                className={cn(
                  "p-3 rounded-xl border space-y-2.5 bg-card",
                  q.partnerId && q.partnerId === selectedPartnerId
                    ? "border-info/60 bg-info/10"
                    : "border-border/60"
                )}
              >
                <div className="space-y-1">
                  <Label className="text-[10px]">Vendor {idx + 1}</Label>
                  <select
                    value={q.partnerId}
                    onChange={(e) => handlePartnerChange(idx, e.target.value)}
                    className="flex h-8 w-full rounded border border-input bg-transparent px-2 text-[11px] shadow-sm"
                  >
                    <option value="">Select Vendor...</option>
                    {partners
                      .filter((p) => !quotes.some((uq, uidx) => uidx !== idx && uq.partnerId === p.id))
                      .map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-1.5">
                  <div className="space-y-1">
                    <Label className="text-[10px]">Ex-Factory (NPR)</Label>
                    <Input
                      type="number"
                      value={q.exFactoryRate || ""}
                      onChange={(e) => {
                        const uq = [...quotes];
                        uq[idx].exFactoryRate = Number(e.target.value);
                        setQuotes(uq);
                      }}
                      className="h-7 text-xs px-1.5"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px]">Transport (NPR)</Label>
                    <Input
                      type="number"
                      value={q.transportRate || ""}
                      onChange={(e) => {
                        const uq = [...quotes];
                        uq[idx].transportRate = Number(e.target.value);
                        setQuotes(uq);
                      }}
                      className="h-7 text-xs px-1.5"
                    />
                  </div>
                </div>

                {q.partnerId && (
                  <div className="flex justify-between items-center text-[10px] bg-muted/30 p-1.5 rounded border border-border/40">
                    <span className="font-semibold text-muted-foreground">Total Rate:</span>
                    <span className="font-bold text-foreground">
                      NPR {(q.exFactoryRate + q.transportRate).toLocaleString()}
                    </span>
                  </div>
                )}

                {q.partnerId && (
                  <Button
                    type="button"
                    variant={selectedPartnerId === q.partnerId ? "default" : "outline"}
                    size="sm"
                    className="w-full h-7 text-[10px]"
                    onClick={() => setSelectedPartnerId(q.partnerId)}
                  >
                    {selectedPartnerId === q.partnerId ? (
                      <span className="flex items-center gap-1">
                        <Check className="h-3 w-3" /> Selected Vendor
                      </span>
                    ) : (
                      "Select Vendor"
                    )}
                  </Button>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Remarks */}
        <div className="space-y-1.5">
          <Label className="text-xs">Remarks / Notes</Label>
          <Input
            value={remarks}
            onChange={(e) => setRemarks(e.target.value)}
            placeholder="e.g. Urgent requirement for plinth beam casting."
            className="h-9 text-sm"
          />
        </div>

        {/* Justification Box (Conditional) */}
        {isHigherPriceSelected && (
          <div className="rounded-xl border border-amber-200 bg-amber-50/20 dark:border-amber-950 dark:bg-amber-950/10 p-4 space-y-2">
            <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400 font-semibold">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span>Higher Price Selection Warning</span>
            </div>
            <p className="text-[10px] text-muted-foreground">
              You selected a higher-priced quote than the cheapest option (NPR {minTotal.toLocaleString()} vs Selected NPR {selectedTotal.toLocaleString()}). A justification is required for the approver.
            </p>
            <div className="space-y-1">
              <Label className="text-[10px] font-bold text-amber-900 dark:text-amber-200">
                Reason for selecting this vendor (Required)
              </Label>
              <textarea
                value={justification}
                onChange={(e) => setJustification(e.target.value)}
                placeholder="e.g. Vendor offers 24h delivery, other requires 10 days which will stall the project."
                className="w-full min-h-[60px] rounded-md border border-amber-300 dark:border-amber-800 bg-background px-3 py-2 text-xs"
              />
            </div>
          </div>
        )}
      </div>

      <DialogFooter className="border-t pt-4 mt-2">
        <Button variant="outline" onClick={onDone} size="sm">
          Cancel
        </Button>
        <Button
          onClick={() =>
            mut.mutate({
              projectId,
              remarks: remarks || undefined,
              items: [
                {
                  materialId,
                  quantity,
                  unit: selectedMaterial?.unit || "ton",
                  selectedPartnerId,
                  justification: isHigherPriceSelected ? justification : undefined,
                  quotes: quotes.map((q) => ({
                    partnerId: q.partnerId,
                    exFactoryRate: q.exFactoryRate,
                    transportRate: q.transportRate,
                    notes: q.notes || undefined,
                  })),
                },
              ],
            })
          }
          disabled={mut.isPending || !canSubmit}
          size="sm"
        >
          {mut.isPending ? (
            <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
          ) : (
            <Plus className="h-3.5 w-3.5 mr-1.5" />
          )}
          Submit Requisition
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
