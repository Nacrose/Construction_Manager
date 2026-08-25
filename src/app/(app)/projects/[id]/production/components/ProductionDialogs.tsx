"use client";

import { format } from "date-fns";
import { Truck, Layers, Factory, Fuel, Printer, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export function ProductionDialogs({
  id,
  projectName,
  plants,
  mixDesigns,
  addTicketOpen,
  setAddTicketOpen,
  createTicketMutation,
  addMixOpen,
  setAddMixOpen,
  createMixMutation,
  addPlantOpen,
  setAddPlantOpen,
  createPlantMutation,
  editSiloTarget,
  setEditSiloTarget,
  updateSiloMutation,
  printTicket,
  setPrintTicket,
  deleteTicketTarget,
  setDeleteTicketTarget,
  deleteTicketMutation,
}: {
  id: string;
  projectName?: string;
  plants: any[];
  mixDesigns: any[];
  addTicketOpen: boolean;
  setAddTicketOpen: (open: boolean) => void;
  createTicketMutation: any;
  addMixOpen: boolean;
  setAddMixOpen: (open: boolean) => void;
  createMixMutation: any;
  addPlantOpen: boolean;
  setAddPlantOpen: (open: boolean) => void;
  createPlantMutation: any;
  editSiloTarget: any;
  setEditSiloTarget: (silo: any) => void;
  updateSiloMutation: any;
  printTicket: any;
  setPrintTicket: (ticket: any) => void;
  deleteTicketTarget: any;
  setDeleteTicketTarget: (ticket: any) => void;
  deleteTicketMutation: any;
}) {
  return (
    <>
      {/* ───────── MODAL 1: NEW BATCH TICKET (DISPATCH CHALAN) ───────── */}
      <Dialog open={addTicketOpen} onOpenChange={setAddTicketOpen}>
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-base flex items-center gap-2">
              <Truck className="h-4 w-4 text-primary" /> Issue Batch Dispatch Ticket (Chalan)
            </DialogTitle>
            <DialogDescription className="text-xs">
              Record a transit mixer / tipper load dispatched from the plant to the pour site.
            </DialogDescription>
          </DialogHeader>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              createTicketMutation.mutate({
                projectId: id,
                plantId: fd.get("plantId") as string,
                mixDesignId: (fd.get("mixDesignId") as string) || undefined,
                transitVehicleNo: fd.get("transitVehicleNo") as string,
                driverName: (fd.get("driverName") as string) || undefined,
                driverPhone: (fd.get("driverPhone") as string) || undefined,
                dispatchedQty: parseFloat(fd.get("dispatchedQty") as string) || 0,
                unit: fd.get("unit") as string,
                slumpMm: fd.get("slumpMm") ? parseFloat(fd.get("slumpMm") as string) : undefined,
                temperatureC: fd.get("temperatureC")
                  ? parseFloat(fd.get("temperatureC") as string)
                  : undefined,
                siteLocation: (fd.get("siteLocation") as string) || undefined,
                targetStructure: (fd.get("targetStructure") as string) || undefined,
                remarks: (fd.get("remarks") as string) || undefined,
              });
            }}
            className="space-y-3"
          >
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs font-semibold">Select Plant *</Label>
                <select
                  name="plantId"
                  required
                  className="w-full rounded border px-2 py-1.5 text-xs bg-background"
                >
                  {plants.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <Label className="text-xs font-semibold">Mix Recipe (JMF)</Label>
                <select
                  name="mixDesignId"
                  className="w-full rounded border px-2 py-1.5 text-xs bg-background"
                >
                  <option value="">-- Select Mix Grade --</option>
                  {mixDesigns.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.code} ({m.name})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label className="text-xs font-semibold">Vehicle / TM No. *</Label>
                <Input
                  name="transitVehicleNo"
                  required
                  placeholder="Ba 2 Kha 9012"
                  className="h-8 text-xs font-mono"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Driver Name</Label>
                <Input name="driverName" placeholder="Driver Name" className="h-8 text-xs" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Driver Phone</Label>
                <Input name="driverPhone" placeholder="98XXXXXXXX" className="h-8 text-xs" />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label className="text-xs font-semibold">Dispatched Quantity *</Label>
                <Input
                  name="dispatchedQty"
                  type="number"
                  step="0.1"
                  required
                  defaultValue={6.0}
                  className="h-8 text-xs font-mono font-bold"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Unit</Label>
                <select
                  name="unit"
                  className="w-full rounded border px-2 py-1.5 text-xs bg-background"
                >
                  <option value="cum">cum (Concrete)</option>
                  <option value="ton">ton (Asphalt/WMM)</option>
                </select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Slump (mm) / Temp (°C)</Label>
                <Input
                  name="slumpMm"
                  type="number"
                  step="1"
                  placeholder="100"
                  className="h-8 text-xs"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs font-semibold">Site Location / Chainage</Label>
                <Input name="siteLocation" placeholder="KM 4+250" className="h-8 text-xs" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-semibold">Target Structure</Label>
                <Input
                  name="targetStructure"
                  placeholder="Culvert 3 Base Slab"
                  className="h-8 text-xs"
                />
              </div>
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Remarks / Gate Instructions</Label>
              <Textarea
                name="remarks"
                rows={2}
                placeholder="Batch additives, batch time notes..."
                className="text-xs"
              />
            </div>

            <DialogFooter className="pt-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setAddTicketOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" size="sm" disabled={createTicketMutation.isPending}>
                {createTicketMutation.isPending && (
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                )}
                Generate & Dispatch Chalan
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ───────── MODAL 2: NEW MIX RECIPE ───────── */}
      <Dialog open={addMixOpen} onOpenChange={setAddMixOpen}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-base flex items-center gap-2">
              <Layers className="h-4 w-4 text-primary" /> Create Job Mix Formula (JMF)
            </DialogTitle>
            <DialogDescription className="text-xs">
              Define concrete grade or asphalt recipe with standard ingredient dosages.
            </DialogDescription>
          </DialogHeader>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              const plantId = fd.get("plantId") as string;
              const code = fd.get("code") as string;
              const name = fd.get("name") as string;
              const type = fd.get("type") as string;
              const slump = fd.get("targetSlumpMm")
                ? parseFloat(fd.get("targetSlumpMm") as string)
                : undefined;
              const temp = fd.get("targetTempC")
                ? parseFloat(fd.get("targetTempC") as string)
                : undefined;
              const wc = fd.get("waterCementRatio")
                ? parseFloat(fd.get("waterCementRatio") as string)
                : undefined;

              let ingredients = JSON.stringify([
                { name: "OPC 53 Cement", type: "cement", dosagePerUnit: 380, unit: "kg" },
                { name: "River Sand", type: "sand", dosagePerUnit: 710, unit: "kg" },
                {
                  name: "10mm Aggregate",
                  type: "aggregate_10mm",
                  dosagePerUnit: 440,
                  unit: "kg",
                },
                {
                  name: "20mm Aggregate",
                  type: "aggregate_20mm",
                  dosagePerUnit: 670,
                  unit: "kg",
                },
                { name: "Water", type: "water", dosagePerUnit: 160, unit: "liter" },
                { name: "PCE Admixture", type: "admixture", dosagePerUnit: 3.0, unit: "kg" },
              ]);

              if (type === "asphalt") {
                ingredients = JSON.stringify([
                  { name: "VG-30 Bitumen", type: "bitumen", dosagePerUnit: 45, unit: "kg" },
                  { name: "Crushed Stone Dust", type: "sand", dosagePerUnit: 350, unit: "kg" },
                  { name: "10mm Grit", type: "aggregate_10mm", dosagePerUnit: 280, unit: "kg" },
                  {
                    name: "20mm Aggregate",
                    type: "aggregate_20mm",
                    dosagePerUnit: 325,
                    unit: "kg",
                  },
                ]);
              }

              createMixMutation.mutate({
                projectId: id,
                plantId,
                code,
                name,
                type,
                targetSlumpMm: slump,
                targetTempC: temp,
                waterCementRatio: wc,
                unit: type === "asphalt" ? "ton" : "cum",
                ingredients,
              });
            }}
            className="space-y-3"
          >
            <div className="space-y-1">
              <Label className="text-xs font-semibold">Plant *</Label>
              <select
                name="plantId"
                required
                className="w-full rounded border px-2 py-1.5 text-xs bg-background"
              >
                {plants.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs font-semibold">Mix Code *</Label>
                <Input
                  name="code"
                  required
                  placeholder="M25-PCC"
                  className="h-8 text-xs font-mono font-bold"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-semibold">Mix Type</Label>
                <select
                  name="type"
                  className="w-full rounded border px-2 py-1.5 text-xs bg-background"
                >
                  <option value="concrete">Concrete</option>
                  <option value="asphalt">Asphalt Hot Mix</option>
                  <option value="wmm">Wet Mix Macadam</option>
                </select>
              </div>
            </div>

            <div className="space-y-1">
              <Label className="text-xs font-semibold">Mix Description *</Label>
              <Input
                name="name"
                required
                placeholder="M25 Grade Pavement Concrete"
                className="h-8 text-xs"
              />
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div className="space-y-1">
                <Label className="text-xs">Slump (mm)</Label>
                <Input
                  name="targetSlumpMm"
                  type="number"
                  placeholder="100"
                  defaultValue={100}
                  className="h-8 text-xs"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Temp (°C)</Label>
                <Input
                  name="targetTempC"
                  type="number"
                  placeholder="155"
                  className="h-8 text-xs"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">W/C Ratio</Label>
                <Input
                  name="waterCementRatio"
                  type="number"
                  step="0.01"
                  placeholder="0.42"
                  defaultValue={0.42}
                  className="h-8 text-xs"
                />
              </div>
            </div>

            <DialogFooter className="pt-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setAddMixOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" size="sm" disabled={createMixMutation.isPending}>
                {createMixMutation.isPending && (
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                )}
                Save Mix Design
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ───────── MODAL 3: ADD PLANT ───────── */}
      <Dialog open={addPlantOpen} onOpenChange={setAddPlantOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base flex items-center gap-2">
              <Factory className="h-4 w-4 text-primary" /> Register Plant Asset
            </DialogTitle>
            <DialogDescription className="text-xs">
              Set up a stationary or mobile batching plant. Default silos will be auto-generated.
            </DialogDescription>
          </DialogHeader>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              createPlantMutation.mutate({
                projectId: id,
                name: fd.get("name") as string,
                code: (fd.get("code") as string) || undefined,
                type: fd.get("type") as any,
                makeModel: (fd.get("makeModel") as string) || undefined,
                capacityValue: fd.get("capacityValue")
                  ? parseFloat(fd.get("capacityValue") as string)
                  : 30,
                location: (fd.get("location") as string) || undefined,
              });
            }}
            className="space-y-3"
          >
            <div className="space-y-1">
              <Label className="text-xs font-semibold">Plant Name *</Label>
              <Input
                name="name"
                required
                placeholder="Main Batching Plant CP-30"
                className="h-8 text-xs"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs font-semibold">Plant Type *</Label>
                <select
                  name="type"
                  className="w-full rounded border px-2 py-1.5 text-xs bg-background"
                >
                  <option value="concrete_batching">Concrete Batching Plant</option>
                  <option value="asphalt_hot_mix">Asphalt Hot Mix Plant</option>
                  <option value="wmm_wet_mix">Wet Mix Macadam (WMM)</option>
                  <option value="crusher">Crusher Plant</option>
                </select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-semibold">Plant Code</Label>
                <Input
                  name="code"
                  placeholder="CBP-01"
                  className="h-8 text-xs font-mono font-bold"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Make & Model</Label>
                <Input name="makeModel" placeholder="Schwing Stetter CP30" className="h-8 text-xs" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Rated Capacity (Output/hr)</Label>
                <Input
                  name="capacityValue"
                  type="number"
                  defaultValue={30}
                  className="h-8 text-xs font-mono"
                />
              </div>
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Location / Base Yard</Label>
              <Input name="location" placeholder="KM 12+400 Camp" className="h-8 text-xs" />
            </div>

            <DialogFooter className="pt-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setAddPlantOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" size="sm" disabled={createPlantMutation.isPending}>
                {createPlantMutation.isPending && (
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                )}
                Register Plant
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ───────── MODAL 4: EDIT SILO STOCK ───────── */}
      <Dialog open={!!editSiloTarget} onOpenChange={(o) => !o && setEditSiloTarget(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-sm flex items-center gap-2">
              <Fuel className="h-4 w-4 text-primary" /> Adjust Silo / Bin Stock
            </DialogTitle>
            <DialogDescription className="text-xs">{editSiloTarget?.name}</DialogDescription>
          </DialogHeader>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              if (editSiloTarget) {
                updateSiloMutation.mutate({
                  id: editSiloTarget.id,
                  currentStock: parseFloat(fd.get("currentStock") as string) || 0,
                });
              }
            }}
            className="space-y-3"
          >
            <div className="space-y-1">
              <Label className="text-xs font-semibold">
                Current Stock ({editSiloTarget?.unit})
              </Label>
              <Input
                name="currentStock"
                type="number"
                step="any"
                defaultValue={editSiloTarget?.currentStock ?? 0}
                required
                className="h-8 text-xs font-mono font-bold"
              />
              <span className="text-[10px] text-muted-foreground">
                Total Capacity: {editSiloTarget?.capacity} {editSiloTarget?.unit}
              </span>
            </div>

            <DialogFooter className="pt-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setEditSiloTarget(null)}
              >
                Cancel
              </Button>
              <Button type="submit" size="sm" disabled={updateSiloMutation.isPending}>
                {updateSiloMutation.isPending && (
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                )}
                Update Level
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ───────── MODAL 5: PRINT GATE PASS / DISPATCH CHALAN ───────── */}
      <Dialog open={!!printTicket} onOpenChange={(o) => !o && setPrintTicket(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader className="border-b pb-2">
            <div className="flex items-center justify-between">
              <div>
                <DialogTitle className="text-base font-bold">
                  DISPATCH CHALAN / GATE PASS
                </DialogTitle>
                <DialogDescription className="text-xs font-mono">
                  {printTicket?.ticketNumber}
                </DialogDescription>
              </div>
              <Badge variant="outline" className="uppercase text-[10px]">
                {printTicket?.status}
              </Badge>
            </div>
          </DialogHeader>

          {printTicket && (
            <div className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-2 border-b pb-2">
                <div>
                  <span className="text-muted-foreground block text-[10px]">Project:</span>
                  <span className="font-semibold">{projectName}</span>
                </div>
                <div>
                  <span className="text-muted-foreground block text-[10px]">Plant:</span>
                  <span className="font-semibold">{printTicket.plant.name}</span>
                </div>
                <div>
                  <span className="text-muted-foreground block text-[10px]">Dispatch Time:</span>
                  <span className="font-medium">
                    {format(new Date(printTicket.dispatchDate), "dd/MM/yyyy HH:mm")}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground block text-[10px]">Mix Grade:</span>
                  <span className="font-mono font-bold">
                    {printTicket.mixDesign?.code || "Standard"}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 border-b pb-2">
                <div>
                  <span className="text-muted-foreground block text-[10px]">Vehicle / TM No:</span>
                  <span className="font-mono font-bold text-sm">
                    {printTicket.transitVehicleNo}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground block text-[10px]">
                    Dispatched Quantity:
                  </span>
                  <span className="font-mono font-bold text-sm text-primary">
                    {printTicket.dispatchedQty} {printTicket.unit}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground block text-[10px]">Driver:</span>
                  <span>{printTicket.driverName || "—"}</span>
                </div>
                <div>
                  <span className="text-muted-foreground block text-[10px]">Slump / Temp:</span>
                  <span>
                    {printTicket.slumpMm
                      ? `${printTicket.slumpMm} mm`
                      : printTicket.temperatureC
                        ? `${printTicket.temperatureC} °C`
                        : "—"}
                  </span>
                </div>
              </div>

              <div>
                <span className="text-muted-foreground block text-[10px]">
                  Pour Destination / Structure:
                </span>
                <span className="font-semibold">
                  {printTicket.siteLocation} ({printTicket.targetStructure})
                </span>
              </div>

              <div className="pt-6 grid grid-cols-2 gap-4 text-center border-t">
                <div>
                  <div className="h-8 border-b border-dashed"></div>
                  <span className="text-[10px] text-muted-foreground mt-1 block">
                    Plant Operator Sign
                  </span>
                </div>
                <div>
                  <div className="h-8 border-b border-dashed"></div>
                  <span className="text-[10px] text-muted-foreground mt-1 block">
                    Site Receiver Sign
                  </span>
                </div>
              </div>
            </div>
          )}

          <DialogFooter className="pt-2 border-t">
            <Button size="sm" variant="outline" onClick={() => setPrintTicket(null)}>
              Close
            </Button>
            <Button size="sm" onClick={() => window.print()}>
              <Printer className="h-3.5 w-3.5 mr-1.5" /> Print Chalan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ───────── DELETE TICKET ALERT ───────── */}
      <AlertDialog
        open={!!deleteTicketTarget}
        onOpenChange={(o) => !o && setDeleteTicketTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Dispatch Ticket?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete ticket {deleteTicketTarget?.ticketNumber}? This action
              cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (deleteTicketTarget) {
                  deleteTicketMutation.mutate({ id: deleteTicketTarget.id });
                }
              }}
            >
              Delete Ticket
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
