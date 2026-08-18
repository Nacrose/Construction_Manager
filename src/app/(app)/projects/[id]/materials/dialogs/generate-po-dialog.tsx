"use client";

import { useState, useMemo, useEffect } from "react";
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
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Building2,
  FileSpreadsheet,
  Zap,
  Sliders,
  CheckCircle2,
  AlertCircle,
  Loader2,
  PackageCheck,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export interface PendingItemForPO {
  id: string; // requisitionItemId
  requisitionId: string;
  requisitionNumber: string;
  materialId: string;
  materialName: string;
  unit: string;
  requiredQty: number;
  orderedQty: number;
  remainingQty: number;
  partnerId: string;
  partnerName: string;
  rate: number;
}

interface GeneratePODialogProps {
  projectId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  items: PendingItemForPO[];
  title?: string;
  description?: string;
  onSuccess?: () => void;
}

export function GeneratePODialog({
  projectId,
  open,
  onOpenChange,
  items,
  title = "Generate Purchase Orders",
  description = "Review items and choose how Purchase Orders will be created for awarded vendors.",
  onSuccess,
}: GeneratePODialogProps) {
  const utils = trpc.useUtils();
  const [mode, setMode] = useState<"auto" | "manual">("auto");
  const [remarks, setRemarks] = useState("");

  // State for manual selection and custom quantity per item
  const [selectedItemIds, setSelectedItemIds] = useState<Record<string, boolean>>({});
  const [customQuantities, setCustomQuantities] = useState<Record<string, number>>({});

  // Initialize selected items and quantities when dialog opens or items change
  useEffect(() => {
    if (open && items.length > 0) {
      const initialSelected: Record<string, boolean> = {};
      const initialQtys: Record<string, number> = {};

      items.forEach((item) => {
        initialSelected[item.id] = true; // Default all selected
        initialQtys[item.id] = item.remainingQty; // Default to max remaining qty
      });

      setSelectedItemIds(initialSelected);
      setCustomQuantities(initialQtys);
    }
  }, [open, items]);

  const generateMut = trpc.requisition.generatePOs.useMutation({
    onSuccess: (res) => {
      toast.success(`Successfully generated ${res.count} Purchase Order(s)!`);
      utils.requisition.invalidate();
      utils.material.invalidate();
      onSuccess?.();
      onOpenChange(false);
    },
    onError: (e) => toast.error(e.message),
  });

  // Automatic grouping by vendor
  const vendorGroups = useMemo(() => {
    const groups: Record<
      string,
      {
        partnerId: string;
        partnerName: string;
        items: Array<PendingItemForPO & { qtyToOrder: number; subtotal: number }>;
        totalAmount: number;
      }
    > = {};

    items.forEach((item) => {
      if (!groups[item.partnerId]) {
        groups[item.partnerId] = {
          partnerId: item.partnerId,
          partnerName: item.partnerName,
          items: [],
          totalAmount: 0,
        };
      }
      const qtyToOrder = item.remainingQty;
      const subtotal = qtyToOrder * item.rate;
      groups[item.partnerId].items.push({ ...item, qtyToOrder, subtotal });
      groups[item.partnerId].totalAmount += subtotal;
    });

    return Object.values(groups);
  }, [items]);

  // Selected items in manual mode
  const selectedManualItems = useMemo(() => {
    return items
      .filter((item) => selectedItemIds[item.id])
      .map((item) => {
        const qtyToOrder = customQuantities[item.id] ?? item.remainingQty;
        return {
          ...item,
          qtyToOrder,
          subtotal: qtyToOrder * item.rate,
        };
      });
  }, [items, selectedItemIds, customQuantities]);

  const manualVendorCount = useMemo(() => {
    const uniqueVendors = new Set(selectedManualItems.map((i) => i.partnerId));
    return uniqueVendors.size;
  }, [selectedManualItems]);

  const manualTotalAmount = useMemo(() => {
    return selectedManualItems.reduce((sum, i) => sum + i.subtotal, 0);
  }, [selectedManualItems]);

  const handleToggleSelectAll = (checked: boolean) => {
    const newSelected: Record<string, boolean> = {};
    items.forEach((item) => {
      newSelected[item.id] = checked;
    });
    setSelectedItemIds(newSelected);
  };

  const handleQtyChange = (itemId: string, val: string, maxQty: number) => {
    const num = parseFloat(val);
    if (isNaN(num) || num <= 0) {
      setCustomQuantities((prev) => ({ ...prev, [itemId]: 0 }));
    } else {
      const validQty = Math.min(num, maxQty);
      setCustomQuantities((prev) => ({ ...prev, [itemId]: validQty }));
    }
  };

  const handleSubmit = () => {
    if (mode === "auto") {
      const payloadItems = items.map((item) => ({
        requisitionItemId: item.id,
        quantityToOrder: item.remainingQty,
      }));
      generateMut.mutate({
        projectId,
        items: payloadItems,
        remarks: remarks.trim() || undefined,
      });
    } else {
      const payloadItems = selectedManualItems
        .filter((i) => i.qtyToOrder > 0)
        .map((i) => ({
          requisitionItemId: i.id,
          quantityToOrder: i.qtyToOrder,
        }));

      if (payloadItems.length === 0) {
        toast.error("Please select at least 1 item with a valid quantity.");
        return;
      }

      generateMut.mutate({
        projectId,
        items: payloadItems,
        remarks: remarks.trim() || undefined,
      });
    }
  };

  const isAllSelected = items.length > 0 && items.every((i) => selectedItemIds[i.id]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col p-0 gap-0 overflow-hidden">
        <DialogHeader className="p-6 pb-4 border-b">
          <DialogTitle className="text-lg font-bold flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5 text-blue-600" />
            {title}
          </DialogTitle>
          <DialogDescription className="text-xs">{description}</DialogDescription>
        </DialogHeader>

        {/* Main Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          <Tabs value={mode} onValueChange={(v) => setMode(v as "auto" | "manual")}>
            <TabsList className="grid grid-cols-2 w-full max-w-md mx-auto mb-4">
              <TabsTrigger value="auto" className="flex items-center gap-1.5 text-xs">
                <Zap className="h-3.5 w-3.5 text-amber-500" />
                ⚡ Automatic (Vendor Grouped)
              </TabsTrigger>
              <TabsTrigger value="manual" className="flex items-center gap-1.5 text-xs">
                <Sliders className="h-3.5 w-3.5 text-blue-500" />
                🛠️ Selective / Phased Order
              </TabsTrigger>
            </TabsList>

            {/* MODE A: AUTOMATIC */}
            <TabsContent value="auto" className="space-y-4 m-0">
              <div className="bg-blue-50/50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900 rounded-xl p-3.5 text-xs text-blue-900 dark:text-blue-200 flex items-start gap-2.5">
                <Zap className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold">Automatic Vendor Breakdown</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    Items will be automatically grouped by vendor. The system will create{" "}
                    <span className="font-bold text-foreground">{vendorGroups.length} distinct Purchase Order(s)</span> containing only the items awarded to each vendor.
                  </p>
                </div>
              </div>

              {/* Vendor PO Previews */}
              <div className="space-y-3.5">
                {vendorGroups.map((group, idx) => (
                  <div
                    key={group.partnerId}
                    className="border rounded-xl p-4 bg-card shadow-sm space-y-3"
                  >
                    <div className="flex items-center justify-between border-b pb-2">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300 border-blue-200">
                          PO #{idx + 1}
                        </Badge>
                        <span className="font-bold text-sm flex items-center gap-1.5">
                          <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
                          {group.partnerName}
                        </span>
                      </div>
                      <span className="text-xs font-bold text-foreground">
                        Total: NPR {group.totalAmount.toLocaleString()}
                      </span>
                    </div>

                    <div className="space-y-1.5">
                      {group.items.map((item) => (
                        <div
                          key={item.id}
                          className="flex items-center justify-between text-xs py-1 px-2 rounded bg-muted/20"
                        >
                          <div>
                            <span className="font-medium text-foreground">{item.materialName}</span>
                            <span className="text-[10px] text-muted-foreground ml-2">
                              (PR: {item.requisitionNumber})
                            </span>
                          </div>
                          <div className="text-right">
                            <span className="font-semibold text-foreground">
                              {item.qtyToOrder} {item.unit}
                            </span>
                            <span className="text-[10px] text-muted-foreground ml-2">
                              @ NPR {item.rate.toLocaleString()} = NPR {item.subtotal.toLocaleString()}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </TabsContent>

            {/* MODE B: MANUAL SELECTIVE */}
            <TabsContent value="manual" className="space-y-4 m-0">
              <div className="bg-amber-50/50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900 rounded-xl p-3 text-xs text-amber-900 dark:text-amber-200 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Sliders className="h-4 w-4 text-amber-600 shrink-0" />
                  <span>Select items & adjust quantities to order now. Remaining quantities will stay in PR status.</span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Checkbox
                    id="select-all"
                    checked={isAllSelected}
                    onCheckedChange={(c) => handleToggleSelectAll(!!c)}
                  />
                  <Label htmlFor="select-all" className="text-xs font-medium cursor-pointer">
                    Select All
                  </Label>
                </div>
              </div>

              {/* Items Selection Table */}
              <div className="border rounded-xl overflow-hidden bg-card text-xs">
                <div className="grid grid-cols-12 bg-muted/50 p-2.5 font-semibold text-muted-foreground border-b text-[11px]">
                  <div className="col-span-1 text-center">Select</div>
                  <div className="col-span-4">Material & PR</div>
                  <div className="col-span-3">Awarded Vendor</div>
                  <div className="col-span-2">Order Quantity</div>
                  <div className="col-span-2 text-right">Subtotal</div>
                </div>

                <div className="divide-y max-h-60 overflow-y-auto">
                  {items.map((item) => {
                    const isSelected = !!selectedItemIds[item.id];
                    const currentQty = customQuantities[item.id] ?? item.remainingQty;
                    const subtotal = currentQty * item.rate;

                    return (
                      <div
                        key={item.id}
                        className={cn(
                          "grid grid-cols-12 p-2.5 items-center transition-colors",
                          isSelected ? "bg-card" : "bg-muted/10 opacity-60"
                        )}
                      >
                        <div className="col-span-1 flex justify-center">
                          <Checkbox
                            checked={isSelected}
                            onCheckedChange={(checked) =>
                              setSelectedItemIds((prev) => ({ ...prev, [item.id]: !!checked }))
                            }
                          />
                        </div>
                        <div className="col-span-4 pr-2">
                          <p className="font-semibold text-foreground">{item.materialName}</p>
                          <p className="text-[10px] text-muted-foreground">
                            {item.requisitionNumber} • Req: {item.requiredQty} {item.unit} | Rem: {item.remainingQty} {item.unit}
                          </p>
                        </div>
                        <div className="col-span-3 pr-2">
                          <span className="font-medium text-foreground flex items-center gap-1 text-[11px]">
                            <Building2 className="h-3 w-3 text-muted-foreground shrink-0" />
                            {item.partnerName}
                          </span>
                          <span className="text-[10px] text-muted-foreground block">
                            NPR {item.rate.toLocaleString()} / {item.unit}
                          </span>
                        </div>
                        <div className="col-span-2 pr-2">
                          <Input
                            type="number"
                            step="any"
                            disabled={!isSelected}
                            value={currentQty}
                            onChange={(e) => handleQtyChange(item.id, e.target.value, item.remainingQty)}
                            className="h-8 text-xs font-semibold"
                          />
                        </div>
                        <div className="col-span-2 text-right font-bold text-foreground">
                          NPR {subtotal.toLocaleString()}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Manual Selection Summary */}
              <div className="flex justify-between items-center bg-muted/20 p-3 rounded-xl border text-xs">
                <span className="text-muted-foreground">
                  Selected: <strong className="text-foreground">{selectedManualItems.length} items</strong> across{" "}
                  <strong className="text-foreground">{manualVendorCount} vendor(s)</strong>
                </span>
                <span className="text-sm font-bold text-foreground">
                  Batch Total: NPR {manualTotalAmount.toLocaleString()}
                </span>
              </div>
            </TabsContent>
          </Tabs>

          {/* Remarks Section */}
          <div className="space-y-1.5 pt-2 border-t">
            <Label htmlFor="po-remarks" className="text-xs font-semibold">
              PO Remarks / Notes (Optional)
            </Label>
            <Input
              id="po-remarks"
              placeholder="e.g. Standard terms apply, urgent delivery requested"
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              className="text-xs"
            />
          </div>
        </div>

        <DialogFooter className="p-4 border-t bg-muted/10 flex items-center justify-between">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} disabled={generateMut.isPending}>
            Cancel
          </Button>

          <Button
            size="sm"
            onClick={handleSubmit}
            disabled={generateMut.isPending || items.length === 0}
            className="bg-blue-600 hover:bg-blue-700 text-white min-w-[140px]"
          >
            {generateMut.isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
                Generating...
              </>
            ) : mode === "auto" ? (
              <>
                <Zap className="h-4 w-4 mr-1.5" />
                Generate {vendorGroups.length} PO(s)
              </>
            ) : (
              <>
                <PackageCheck className="h-4 w-4 mr-1.5" />
                Generate {manualVendorCount} PO(s)
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
