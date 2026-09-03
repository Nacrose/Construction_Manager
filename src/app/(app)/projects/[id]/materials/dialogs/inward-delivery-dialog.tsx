"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2, Plus, Trash2, ShieldAlert, Scale, Building2, FileSpreadsheet, Package, Check, ChevronsUpDown } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc-client";
import { WeighbridgeCalculator } from "@/components/inventory/weighbridge-calculator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

type POItemSelect = {
  poId: string | null;
  poNumber?: string;
  materialId: string;
  materialName: string;
  unit: string;
  rate: number;
  pendingQty?: number;
  challanQty: number;
  damagedQty: number;
  acceptedQty: number;
  checked: boolean;
};

function SearchableMaterialSelect({
  value,
  onSelect,
  materials,
}: {
  value: string;
  onSelect: (materialId: string) => void;
  materials: Array<{ id: string; name: string; unit: string; code?: string | null; currentStock?: number }>;
}) {
  const [open, setOpen] = useState(false);
  const selectedMat = materials.find((m) => m.id === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "flex h-7 w-full items-center justify-between rounded border border-input bg-background px-2 text-xs transition-colors hover:bg-muted/50 focus:outline-none focus:ring-1 focus:ring-ring text-left",
            !selectedMat && "text-muted-foreground"
          )}
        >
          <span className="truncate font-medium">
            {selectedMat ? `${selectedMat.name} (${selectedMat.unit})` : "Search & select material..."}
          </span>
          <ChevronsUpDown className="h-3 w-3 shrink-0 opacity-50 ml-1" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[320px] p-0 shadow-lg" align="start">
        <Command>
          <CommandInput placeholder="Type material name or code..." className="h-8 text-xs" />
          <CommandList className="max-h-[220px]">
            <CommandEmpty className="text-xs py-4 text-center text-muted-foreground">
              No materials found.
            </CommandEmpty>
            <CommandGroup>
              {materials.map((mat) => {
                const isSelected = mat.id === value;
                return (
                  <CommandItem
                    key={mat.id}
                    value={`${mat.name} ${mat.code || ""} ${mat.unit}`}
                    onSelect={() => {
                      onSelect(mat.id);
                      setOpen(false);
                    }}
                    className="text-xs py-1.5 cursor-pointer flex items-center justify-between"
                  >
                    <div className="flex items-center gap-2 truncate">
                      <Check className={cn("h-3.5 w-3.5 text-success shrink-0", isSelected ? "opacity-100" : "opacity-0")} />
                      <div className="truncate">
                        <div className="font-semibold text-foreground truncate">{mat.name}</div>
                        <div className="text-[10px] text-muted-foreground font-mono">
                          {mat.code ? `${mat.code} • ` : ""}Unit: {mat.unit} {mat.currentStock !== undefined ? `• Stock: ${mat.currentStock}` : ""}
                        </div>
                      </div>
                    </div>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

export function InwardDeliveryDialog({
  projectId,
  onDone,
}: {
  projectId: string;
  onDone: () => void;
}) {
  const utils = trpc.useUtils();
  
  // Section 1: Gate Pass State
  const [gatePassNo, setGatePassNo] = useState("");
  const [vehicleNo, setVehicleNo] = useState("");
  const [driverName, setDriverName] = useState("");
  const [challanNo, setChallanNo] = useState("");
  const [description, setDescription] = useState("");
  const [estQty, setEstQty] = useState("");
  const [showWeighbridge, setShowWeighbridge] = useState(false);
  const [selectedStoreLocationId, setSelectedStoreLocationId] = useState("");

  // Section 2: Goods Receipt Note (GRN) State
  const { data: poData, isLoading: isPOsLoading } = trpc.purchaseOrder.list.useQuery({ projectId });
  const { data: materialsData } = trpc.material.list.useQuery({ projectId });
  const { data: storesData } = trpc.storeLocation.list.useQuery({ projectId });
  
  const openPOs = poData?.purchaseOrders.filter(po => po.status === "issued" || po.status === "partially_received") || [];
  const projectMaterials = materialsData?.materials || [];
  const storeLocations = storesData?.locations || [];

  const [deliveryMode, setDeliveryMode] = useState<"po" | "direct">("po");
  const [selectedPOIds, setSelectedPOIds] = useState<string[]>([]);
  const [poGrnItems, setPoGrnItems] = useState<POItemSelect[]>([]);
  const [directGrnItems, setDirectGrnItems] = useState<POItemSelect[]>([
    {
      poId: null,
      materialId: "",
      materialName: "",
      unit: "",
      rate: 0,
      challanQty: 0,
      damagedQty: 0,
      acceptedQty: 0,
      checked: true,
    }
  ]);
  const [remarks, setRemarks] = useState("");

  // Auto-switch to direct mode if there are no open POs
  useEffect(() => {
    if (!isPOsLoading && openPOs.length === 0) {
      setDeliveryMode("direct");
    }
  }, [isPOsLoading, openPOs.length]);

  // Load PO items when PO selection changes
  useEffect(() => {
    if (selectedPOIds.length === 0) {
      setPoGrnItems([]);
      return;
    }

    const items: POItemSelect[] = [];
    selectedPOIds.forEach(poId => {
      const po = openPOs.find(p => p.id === poId);
      if (po) {
        po.items.forEach(item => {
          const pending = Math.max(0, item.quantity - item.receivedQty);
          if (pending > 0) {
            items.push({
              poId: po.id,
              poNumber: po.number,
              materialId: item.materialId,
              materialName: item.material.name,
              unit: item.material.unit,
              rate: item.rate,
              pendingQty: pending,
              challanQty: pending,
              damagedQty: 0,
              acceptedQty: pending,
              checked: true,
            });
          }
        });
      }
    });
    setPoGrnItems(items);
  }, [selectedPOIds]);

  const handlePOToggle = (poId: string) => {
    setSelectedPOIds(prev => 
      prev.includes(poId) ? prev.filter(id => id !== poId) : [...prev, poId]
    );
  };

  const updatePOItemQty = (idx: number, field: "challanQty" | "damagedQty" | "acceptedQty" | "rate", value: number) => {
    setPoGrnItems(prev => {
      const updated = [...prev];
      updated[idx] = { ...updated[idx], [field]: value };
      if (field === "challanQty" || field === "damagedQty") {
        const challan = field === "challanQty" ? value : updated[idx].challanQty;
        const damaged = field === "damagedQty" ? value : updated[idx].damagedQty;
        updated[idx].acceptedQty = Math.max(0, challan - damaged);
      }
      return updated;
    });
  };

  const handlePOItemCheckToggle = (idx: number) => {
    setPoGrnItems(prev => {
      const updated = [...prev];
      updated[idx].checked = !updated[idx].checked;
      return updated;
    });
  };

  // Direct item methods
  const addDirectItem = () => {
    setDirectGrnItems(prev => [
      ...prev,
      {
        poId: null,
        materialId: "",
        materialName: "",
        unit: "",
        rate: 0,
        challanQty: 0,
        damagedQty: 0,
        acceptedQty: 0,
        checked: true,
      }
    ]);
  };

  const removeDirectItem = (idx: number) => {
    setDirectGrnItems(prev => prev.filter((_, i) => i !== idx));
  };

  const updateDirectMaterial = (idx: number, materialId: string) => {
    const mat = projectMaterials.find(m => m.id === materialId);
    setDirectGrnItems(prev => {
      const updated = [...prev];
      updated[idx] = {
        ...updated[idx],
        materialId,
        materialName: mat?.name || "",
        unit: mat?.unit || "",
      };
      return updated;
    });
  };

  const updateDirectQty = (idx: number, field: "challanQty" | "damagedQty" | "acceptedQty" | "rate", value: number) => {
    setDirectGrnItems(prev => {
      const updated = [...prev];
      updated[idx] = { ...updated[idx], [field]: value };
      if (field === "challanQty" || field === "damagedQty") {
        const challan = field === "challanQty" ? value : updated[idx].challanQty;
        const damaged = field === "damagedQty" ? value : updated[idx].damagedQty;
        updated[idx].acceptedQty = Math.max(0, challan - damaged);
      }
      return updated;
    });
  };

  // Mutations
  const createGateMutation = trpc.material.createGateEntry.useMutation();
  const createTxnMutation = trpc.material.createTransaction.useMutation();

  const [savingGate, setSavingGate] = useState(false);
  const [savingBoth, setSavingBoth] = useState(false);

  const handleSaveGateOnly = async () => {
    if (!vehicleNo) {
      toast.error("Vehicle registration number is required");
      return;
    }
    setSavingGate(true);
    try {
      await createGateMutation.mutateAsync({
        projectId,
        number: gatePassNo || undefined,
        vehicleNo,
        driverName: driverName || undefined,
        challanNo: challanNo || undefined,
        description: description || undefined,
        estQty: estQty ? parseFloat(estQty) : undefined,
      });
      utils.material.listGateEntries.invalidate({ projectId });
      toast.success("Gate Pass logged successfully");
      onDone();
    } catch (err: any) {
      toast.error(err.message || "Failed to save Gate Pass");
    } finally {
      setSavingGate(false);
    }
  };

  const handleSaveBoth = async () => {
    if (!vehicleNo) {
      toast.error("Vehicle registration number is required");
      return;
    }

    const itemsToProcess = deliveryMode === "po"
      ? poGrnItems.filter(item => item.checked && item.acceptedQty > 0)
      : directGrnItems.filter(item => item.materialId && item.acceptedQty > 0);

    if (itemsToProcess.length === 0) {
      toast.error(
        deliveryMode === "po"
          ? "Please select and input accepted quantities for at least one item from PO."
          : "Please select a material and enter accepted quantity under Direct / Non-PO receipt."
      );
      return;
    }

    setSavingBoth(true);
    try {
      // 1. Create the Gate Pass
      const gateRes = await createGateMutation.mutateAsync({
        projectId,
        number: gatePassNo || undefined,
        vehicleNo,
        driverName: driverName || undefined,
        challanNo: challanNo || undefined,
        description: description || undefined,
        estQty: estQty ? parseFloat(estQty) : undefined,
      });

      // 2. Generate GRN Transaction for each item
      const gateEntryId = gateRes.gateEntry.id;
      const refNo = challanNo || gateRes.gateEntry.number;

      await Promise.all(
        itemsToProcess.map(item =>
          createTxnMutation.mutateAsync({
            projectId,
            materialId: item.materialId,
            type: "receive",
            quantity: item.acceptedQty,
            rate: item.rate || 0,
            reference: refNo,
            remarks: remarks || (item.poId ? `GRN received via Gate Pass ${gateRes.gateEntry.number}` : `Direct Spot Inward via Gate Pass ${gateRes.gateEntry.number}`),
            gateEntryId,
            purchaseOrderId: item.poId || undefined,
            storeLocationId: selectedStoreLocationId || null,
          })
        )
      );

      utils.material.list.invalidate({ projectId });
      utils.material.listTransactions.invalidate({ projectId });
      utils.material.listGateEntries.invalidate({ projectId });
      
      toast.success("Gate Pass & Goods Receipt Note (GRN) generated successfully");
      onDone();
    } catch (err: any) {
      toast.error(err.message || "Error logging entry");
    } finally {
      setSavingBoth(false);
    }
  };

  return (
    <DialogContent className="max-w-5xl lg:max-w-6xl w-full max-h-[92vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle className="text-base font-bold">Unified Inward Delivery Registry</DialogTitle>
      </DialogHeader>

      <div className="space-y-4 py-1">
        {/* SECTION 1: Gate Pass */}
        <div className="space-y-3 border rounded-xl p-3.5 bg-muted/5 relative">
          <div className="absolute top-3 right-4 bg-amber-500/10 text-amber-600 dark:text-amber-400 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border border-amber-500/20">
            Section 1: Gate Pass
          </div>
          <h3 className="text-xs font-semibold text-foreground flex items-center gap-1.5">
            🚛 Gate Pass Registry
          </h3>
          
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Gate Pass Number (Optional)</Label>
              <Input
                value={gatePassNo}
                onChange={(e) => setGatePassNo(e.target.value)}
                placeholder="Auto-generated if empty"
                className="h-8 text-xs"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Vehicle Registration No *</Label>
              <Input
                value={vehicleNo}
                onChange={(e) => setVehicleNo(e.target.value)}
                required
                placeholder="e.g. BA 2 KHA 4421"
                className="h-8 text-xs"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Driver Name & Contact</Label>
              <Input
                value={driverName}
                onChange={(e) => setDriverName(e.target.value)}
                placeholder="e.g. Ram Shrestha - 98XXXXXXXX"
                className="h-8 text-xs"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Delivery Challan No</Label>
              <Input
                value={challanNo}
                onChange={(e) => setChallanNo(e.target.value)}
                placeholder="Supplier delivery note #"
                className="h-8 text-xs"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Carrier / Cargo Description</Label>
              <Input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="e.g. TMT Steel 16mm & 20mm"
                className="h-8 text-xs"
              />
            </div>
            <div className="space-y-1">
              <div className="flex justify-between items-center">
                <Label className="text-xs">Estimated Quantity / Load</Label>
                <button
                  type="button"
                  onClick={() => setShowWeighbridge(!showWeighbridge)}
                  className="text-[10px] text-info hover:text-info dark:text-info/80 flex items-center gap-1 font-medium"
                >
                  <Scale className="h-3 w-3" />
                  {showWeighbridge ? "Hide Weighbridge" : "Weighbridge Calc"}
                </button>
              </div>
              <Input
                type="number"
                step="any"
                value={estQty}
                onChange={(e) => setEstQty(e.target.value)}
                placeholder="Total metric tons / units"
                className="h-8 text-xs"
              />
            </div>
          </div>

          {/* Weighbridge Tool */}
          {showWeighbridge && (
            <div className="mt-2 pt-2 border-t">
              <WeighbridgeCalculator
                onApply={(wbData) => {
                  setEstQty(wbData.computedQty.toString());
                  setDescription((prev) =>
                    prev ? `${prev} (Net: ${wbData.netWeight} kg, ${wbData.computedQty} ${wbData.computedUnit})`
                         : `Net: ${wbData.netWeight} kg (${wbData.computedQty} ${wbData.computedUnit})`
                  );
                  setShowWeighbridge(false);
                }}
              />
            </div>
          )}
        </div>

        {/* SECTION 2: Goods Receipt Note (GRN) */}
        <div className="space-y-3 border rounded-xl p-3.5 bg-muted/5 relative">
          <div className="absolute top-3 right-4 bg-success/10 text-success dark:text-success/80 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border border-success/20">
            Section 2: Goods Receipt Note (GRN)
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <h3 className="text-xs font-semibold text-foreground flex items-center gap-1.5">
              📦 Goods Receipt Note (GRN)
            </h3>
            {storeLocations.length > 0 && (
              <div className="flex items-center gap-2">
                <Label className="text-xs text-muted-foreground whitespace-nowrap">Receiving Store:</Label>
                <Select value={selectedStoreLocationId} onValueChange={setSelectedStoreLocationId}>
                  <SelectTrigger className="h-7 text-xs w-44">
                    <SelectValue placeholder="Select site store" />
                  </SelectTrigger>
                  <SelectContent>
                    {storeLocations.map((loc) => (
                      <SelectItem key={loc.id} value={loc.id} className="text-xs">
                        {loc.name} {loc.code ? `(${loc.code})` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          {/* Mode Switcher: Against PO vs Direct Non-PO */}
          <div className="flex items-center gap-1 bg-muted/40 p-0.5 rounded-lg text-xs w-fit">
            <button
              type="button"
              onClick={() => setDeliveryMode("po")}
              className={cn(
                "px-3 py-1 rounded-md text-[11px] font-medium transition-colors flex items-center gap-1.5",
                deliveryMode === "po" ? "bg-card text-foreground shadow-2xs font-semibold" : "text-muted-foreground hover:text-foreground"
              )}
            >
              <FileSpreadsheet className="h-3 w-3" />
              <span>Against Purchase Order ({openPOs.length})</span>
            </button>
            <button
              type="button"
              onClick={() => setDeliveryMode("direct")}
              className={cn(
                "px-3 py-1 rounded-md text-[11px] font-medium transition-colors flex items-center gap-1.5",
                deliveryMode === "direct" ? "bg-card text-success dark:text-success/80 shadow-2xs font-semibold" : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Package className="h-3 w-3 text-success" />
              <span>Direct / Spot Receipt (No PO)</span>
            </button>
          </div>

          {/* MODE 1: AGAINST PURCHASE ORDER */}
          {deliveryMode === "po" && (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Select active Purchase Order(s) to verify delivery contents:</Label>
                {isPOsLoading ? (
                  <div className="text-xs text-muted-foreground animate-pulse">Loading open Purchase Orders...</div>
                ) : openPOs.length === 0 ? (
                  <div className="text-xs text-amber-600 dark:text-amber-400 p-2.5 rounded-lg border border-amber-500/20 bg-amber-50/50 dark:bg-amber-950/20">
                    No active open purchase orders found. Switch to <strong>Direct / Spot Receipt (No PO)</strong> above to record incoming goods without a PO.
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-1.5 p-2 border rounded-lg bg-card max-h-[85px] overflow-y-auto font-sans">
                    {openPOs.map(po => {
                      const isChecked = selectedPOIds.includes(po.id);
                      return (
                        <button
                          key={po.id}
                          type="button"
                          onClick={() => handlePOToggle(po.id)}
                          className={cn(
                            "inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border transition-all",
                            isChecked 
                              ? "bg-success/10 border-success/40 text-success dark:bg-success/20 dark:text-success/80"
                              : "bg-background border-border hover:bg-muted text-muted-foreground"
                          )}
                        >
                          {isChecked && <span className="h-1.5 w-1.5 rounded-full bg-success" />}
                          {po.number} ({po.partner?.name || po.supplier?.name || "Supplier"})
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Dynamic PO GRN Line Items Table */}
              {poGrnItems.length > 0 && (
                <div className="space-y-2 border rounded-lg bg-card overflow-hidden">
                  <table className="w-full table-fixed text-xs border-collapse">
                    <thead>
                      <tr className="bg-muted/50 border-b text-left text-muted-foreground font-semibold">
                        <th className="p-2 w-8 text-center"></th>
                        <th className="p-2 w-auto">PO # / Material</th>
                        <th className="p-2 text-right w-24">PO Pending</th>
                        <th className="p-2 text-right w-20">Challan</th>
                        <th className="p-2 text-right w-20">Damaged</th>
                        <th className="p-2 text-right w-20">Accepted</th>
                        <th className="p-2 text-right w-20">Rate</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {poGrnItems.map((item, idx) => (
                        <tr key={idx} className={item.checked ? "bg-success/5" : "opacity-60 bg-muted/5"}>
                          <td className="p-1.5 text-center">
                            <Checkbox
                              checked={item.checked}
                              onCheckedChange={() => handlePOItemCheckToggle(idx)}
                            />
                          </td>
                          <td className="p-1.5 truncate">
                            <div className="font-semibold text-foreground truncate">{item.materialName}</div>
                            <div className="text-[10px] text-muted-foreground">Order: {item.poNumber}</div>
                          </td>
                          <td className="p-1.5 text-right font-mono text-xs">
                            {item.pendingQty} {item.unit}
                          </td>
                          <td className="p-1.5">
                            <Input
                              type="number"
                              step="any"
                              value={item.challanQty}
                              onChange={(e) => updatePOItemQty(idx, "challanQty", parseFloat(e.target.value) || 0)}
                              disabled={!item.checked}
                              className="h-7 text-xs text-right font-mono px-1"
                            />
                          </td>
                          <td className="p-1.5">
                            <Input
                              type="number"
                              step="any"
                              value={item.damagedQty}
                              onChange={(e) => updatePOItemQty(idx, "damagedQty", parseFloat(e.target.value) || 0)}
                              disabled={!item.checked}
                              className="h-7 text-xs text-right font-mono px-1 text-red-500 focus-visible:ring-red-400"
                            />
                          </td>
                          <td className="p-1.5">
                            <Input
                              type="number"
                              step="any"
                              value={item.acceptedQty}
                              onChange={(e) => updatePOItemQty(idx, "acceptedQty", parseFloat(e.target.value) || 0)}
                              disabled={!item.checked}
                              className="h-7 text-xs text-right font-mono px-1 text-success font-semibold"
                            />
                          </td>
                          <td className="p-1.5">
                            <Input
                              type="number"
                              value={item.rate}
                              onChange={(e) => updatePOItemQty(idx, "rate", parseFloat(e.target.value) || 0)}
                              disabled={!item.checked}
                              className="h-7 text-xs text-right font-mono px-1"
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* MODE 2: DIRECT / NON-PO RECEIPT */}
          {deliveryMode === "direct" && (
            <div className="space-y-2.5">
              <div className="border rounded-lg bg-card overflow-hidden">
                <table className="w-full table-fixed text-xs border-collapse">
                  <thead>
                    <tr className="bg-muted/50 border-b text-left text-muted-foreground font-semibold">
                      <th className="p-2 w-auto">Material *</th>
                      <th className="p-2 text-right w-24">Challan Qty *</th>
                      <th className="p-2 text-right w-20">Damaged</th>
                      <th className="p-2 text-right w-20">Accepted</th>
                      <th className="p-2 text-right w-24">Rate (NPR)</th>
                      <th className="p-2 w-8 text-center"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {directGrnItems.map((item, idx) => (
                      <tr key={idx}>
                        <td className="p-1.5">
                          <SearchableMaterialSelect
                            value={item.materialId}
                            onSelect={(val) => updateDirectMaterial(idx, val)}
                            materials={projectMaterials}
                          />
                        </td>
                        <td className="p-1.5">
                          <Input
                            type="number"
                            step="any"
                            value={item.challanQty || ""}
                            onChange={(e) => updateDirectQty(idx, "challanQty", parseFloat(e.target.value) || 0)}
                            placeholder="0"
                            className="h-7 text-xs text-right font-mono px-1"
                          />
                        </td>
                        <td className="p-1.5">
                          <Input
                            type="number"
                            step="any"
                            value={item.damagedQty || ""}
                            onChange={(e) => updateDirectQty(idx, "damagedQty", parseFloat(e.target.value) || 0)}
                            placeholder="0"
                            className="h-7 text-xs text-right font-mono px-1 text-red-500"
                          />
                        </td>
                        <td className="p-1.5">
                          <Input
                            type="number"
                            step="any"
                            value={item.acceptedQty || ""}
                            onChange={(e) => updateDirectQty(idx, "acceptedQty", parseFloat(e.target.value) || 0)}
                            placeholder="0"
                            className="h-7 text-xs text-right font-mono px-1 text-success font-semibold"
                          />
                        </td>
                        <td className="p-1.5">
                          <Input
                            type="number"
                            step="any"
                            value={item.rate || ""}
                            onChange={(e) => updateDirectQty(idx, "rate", parseFloat(e.target.value) || 0)}
                            placeholder="0"
                            className="h-7 text-xs text-right font-mono px-1"
                          />
                        </td>
                        <td className="p-1.5 text-center">
                          {directGrnItems.length > 1 && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              onClick={() => removeDirectItem(idx)}
                              className="h-6 w-6 text-muted-foreground hover:text-red-600"
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={addDirectItem}
                className="h-7 text-xs gap-1 rounded-md"
              >
                <Plus className="h-3 w-3" /> Add Material Line
              </Button>
            </div>
          )}

          {/* Inspection remarks */}
          <div className="p-2.5 bg-muted/10 border rounded-lg">
            <Label className="text-xs">Inspection Remarks / Comments</Label>
            <Input
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              placeholder="e.g. Inspected delivery; quality checked by site engineer"
              className="h-8 text-xs mt-1"
            />
          </div>
        </div>
      </div>

      <DialogFooter className="flex justify-between items-center sm:justify-between w-full border-t pt-3">
        <Button variant="outline" size="sm" onClick={onDone} className="h-8.5 text-xs">
          Cancel
        </Button>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={savingGate || savingBoth}
            onClick={handleSaveGateOnly}
            className="h-8.5 text-xs gap-1"
          >
            {savingGate && <Loader2 className="h-3 w-3 animate-spin" />}
            Save Gate Pass Only
          </Button>
          <Button
            type="button"
            variant="default"
            size="sm"
            disabled={savingGate || savingBoth}
            onClick={handleSaveBoth}
            className="h-8.5 text-xs bg-success hover:bg-success text-white gap-1"
          >
            {savingBoth && <Loader2 className="h-3 w-3 animate-spin" />}
            Save Gate Pass & Generate GRN
          </Button>
        </div>
      </DialogFooter>
    </DialogContent>
  );
}
