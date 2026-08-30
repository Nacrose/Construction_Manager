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
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ArrowRightLeft, Loader2, Truck, Package, ShieldCheck, AlertCircle } from "lucide-react";

interface InterSiteTransferDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentProjectId?: string;
  onSuccess?: () => void;
}

export function InterSiteTransferDialog({
  open,
  onOpenChange,
  currentProjectId,
  onSuccess,
}: InterSiteTransferDialogProps) {
  const utils = trpc.useUtils();

  const [originProjectId, setOriginProjectId] = useState(currentProjectId || "");
  const [destinationProjectId, setDestinationProjectId] = useState("");
  const [materialId, setMaterialId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [transferRate, setTransferRate] = useState("");
  const [isInstantTransfer, setIsInstantTransfer] = useState(true);
  const [vehicleNo, setVehicleNo] = useState("");
  const [driverName, setDriverName] = useState("");
  const [chalanNo, setChalanNo] = useState("");
  const [remarks, setRemarks] = useState("");

  // Queries
  const { data: projectsData, isLoading: loadingProjects } = trpc.project.list.useQuery();
  const { data: originMaterialsData, isLoading: loadingMaterials } = trpc.material.list.useQuery(
    { projectId: originProjectId },
    { enabled: Boolean(originProjectId) }
  );

  const selectedMaterial = originMaterialsData?.materials?.find((m: any) => m.id === materialId);
  const projects = projectsData?.projects || [];
  const materials = originMaterialsData?.materials || [];

  const transferMutation = trpc.interSiteTransfer.transferMaterial.useMutation({
    onSuccess: (data: any) => {
      const tNo = data?.transferNo || "Transfer Completed";
      toast.success(
        isInstantTransfer
          ? `Transferred and received successfully (${tNo})`
          : `Dispatch Chalan issued successfully (${tNo})`
      );
      utils.interSiteTransfer.list.invalidate();
      utils.material.list.invalidate();
      onOpenChange(false);
      resetForm();
      onSuccess?.();
    },
    onError: (e) => toast.error(e.message),
  });

  function resetForm() {
    setDestinationProjectId("");
    setMaterialId("");
    setQuantity("");
    setTransferRate("");
    setVehicleNo("");
    setDriverName("");
    setChalanNo("");
    setRemarks("");
    setIsInstantTransfer(true);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!originProjectId || !destinationProjectId || !materialId || !quantity) {
      toast.error("Please fill in all required fields.");
      return;
    }

    const qty = parseFloat(quantity);
    if (isNaN(qty) || qty <= 0) {
      toast.error("Quantity must be a positive number.");
      return;
    }

    const rate = transferRate ? parseFloat(transferRate) : 0;

    transferMutation.mutate({
      originProjectId,
      destinationProjectId,
      materialId,
      quantity: qty,
      transferRate: isNaN(rate) ? 0 : rate,
      isInstantTransfer,
      vehicleNo: vehicleNo || null,
      driverName: driverName || null,
      chalanNo: chalanNo || null,
      remarks: remarks || null,
    });
  }

  const estTotal = (parseFloat(quantity) || 0) * (parseFloat(transferRate) || 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[700px] bg-[#0c1015] border-white/10 text-white backdrop-blur-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base font-bold text-white">
            <ArrowRightLeft className="h-5 w-5 text-emerald-400" />
            Inter-Site Material Transfer (आन्तरिक सामाग्री स्थानान्तरण)
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            Move surplus materials between contractor site locations with automated stock adjustments and internal project cost balancing.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 pt-2">
          {/* Mode Banner */}
          <div className="flex items-center justify-between p-3 rounded-xl border border-white/10 bg-[#121822]">
            <div className="flex items-center gap-2.5">
              <ShieldCheck className="h-4 w-4 text-emerald-400 shrink-0" />
              <div>
                <div className="text-xs font-semibold text-white">
                  {isInstantTransfer ? "⚡ Direct Transfer (Instant Receive)" : "🚚 2-Step In-Transit Dispatch"}
                </div>
                <div className="text-[11px] text-gray-400">
                  {isInstantTransfer
                    ? "Deducts Origin stock, increments Destination stock & settles cost in 1 click."
                    : "Issues dispatch chalan; destination storekeeper confirms upon truck arrival."}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Label htmlFor="instant-toggle" className="text-xs font-medium text-gray-300">
                Instant Move
              </Label>
              <Switch
                id="instant-toggle"
                checked={isInstantTransfer}
                onCheckedChange={setIsInstantTransfer}
              />
            </div>
          </div>

          {/* Site Origin & Destination Selection */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs font-semibold text-gray-200">Origin Site (From) *</Label>
              <Select value={originProjectId} onValueChange={(v) => { setOriginProjectId(v); setMaterialId(""); }}>
                <SelectTrigger className="h-9 text-xs bg-[#161d26] border-white/10 text-white">
                  <SelectValue placeholder="Select origin site…" />
                </SelectTrigger>
                <SelectContent className="bg-[#0f141c] border-white/10 text-white text-xs">
                  {projects.map((p: any) => (
                    <SelectItem key={p.id} value={p.id} disabled={p.id === destinationProjectId}>
                      {p.name} ({p.code})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label className="text-xs font-semibold text-gray-200">Destination Site (To) *</Label>
              <Select value={destinationProjectId} onValueChange={setDestinationProjectId}>
                <SelectTrigger className="h-9 text-xs bg-[#161d26] border-white/10 text-white">
                  <SelectValue placeholder="Select destination site…" />
                </SelectTrigger>
                <SelectContent className="bg-[#0f141c] border-white/10 text-white text-xs">
                  {projects.map((p: any) => (
                    <SelectItem key={p.id} value={p.id} disabled={p.id === originProjectId}>
                      {p.name} ({p.code})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Material & Quantity */}
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-1 space-y-1">
              <Label className="text-xs font-semibold text-gray-200">Select Material *</Label>
              <Select value={materialId} onValueChange={setMaterialId} disabled={!originProjectId || loadingMaterials}>
                <SelectTrigger className="h-9 text-xs bg-[#161d26] border-white/10 text-white">
                  <SelectValue placeholder={loadingMaterials ? "Loading materials…" : "Choose material…"} />
                </SelectTrigger>
                <SelectContent className="bg-[#0f141c] border-white/10 text-white text-xs">
                  {materials.map((m: any) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.name} ({m.currentStock} {m.unit})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label className="text-xs font-semibold text-gray-200">
                Quantity to Transfer {selectedMaterial?.unit ? `(${selectedMaterial.unit})` : ""} *
              </Label>
              <Input
                type="number"
                step="any"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                placeholder="e.g. 50"
                required
                className="h-9 text-xs bg-[#161d26] border-white/10 text-white"
              />
              {selectedMaterial && (
                <div className="text-[10px] text-gray-400">
                  Current Stock: <span className="font-mono text-emerald-400 font-bold">{selectedMaterial.currentStock} {selectedMaterial.unit}</span>
                </div>
              )}
            </div>

            <div className="space-y-1">
              <Label className="text-xs font-semibold text-gray-200">Internal Rate (NPR / unit)</Label>
              <Input
                type="number"
                step="any"
                value={transferRate}
                onChange={(e) => setTransferRate(e.target.value)}
                placeholder="Optional transfer rate"
                className="h-9 text-xs bg-[#161d26] border-white/10 text-white"
              />
              {estTotal > 0 && (
                <div className="text-[10px] text-emerald-400 font-mono">
                  Val: {formatNpr(estTotal)}
                </div>
              )}
            </div>
          </div>

          {/* Transport Details */}
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1">
              <Label className="text-xs text-gray-300">Vehicle / Truck No</Label>
              <Input
                value={vehicleNo}
                onChange={(e) => setVehicleNo(e.target.value)}
                placeholder="e.g. Ba 2 Ka 4589"
                className="h-9 text-xs bg-[#161d26] border-white/10 text-white font-mono"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-gray-300">Driver Name / Phone</Label>
              <Input
                value={driverName}
                onChange={(e) => setDriverName(e.target.value)}
                placeholder="e.g. Ram Bahadur (9841...)"
                className="h-9 text-xs bg-[#161d26] border-white/10 text-white"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-gray-300">Dispatch Chalan No</Label>
              <Input
                value={chalanNo}
                onChange={(e) => setChalanNo(e.target.value)}
                placeholder="e.g. CH-2081-12"
                className="h-9 text-xs bg-[#161d26] border-white/10 text-white font-mono"
              />
            </div>
          </div>

          {/* Remarks */}
          <div className="space-y-1">
            <Label className="text-xs text-gray-300">Notes & Purpose</Label>
            <Textarea
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              rows={2}
              placeholder="e.g. Surplus cement transferred for retaining wall urgent casting."
              className="text-xs bg-[#161d26] border-white/10 text-white resize-none"
            />
          </div>

          {/* Footer Actions */}
          <div className="flex items-center justify-between pt-3 border-t border-white/10">
            <div className="text-xs text-muted-foreground flex items-center gap-1.5">
              <Package className="h-3.5 w-3.5 text-emerald-400" />
              <span>Zero external VAT invoice required.</span>
            </div>
            <div className="flex items-center gap-2">
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
                disabled={transferMutation.isPending || loadingProjects}
                className="h-9 px-5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-md"
              >
                {transferMutation.isPending && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
                {isInstantTransfer ? "Transfer & Settle Instantly" : "Issue Dispatch Chalan"}
              </Button>
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
