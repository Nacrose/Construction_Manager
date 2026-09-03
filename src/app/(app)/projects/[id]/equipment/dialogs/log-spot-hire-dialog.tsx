"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc-client";
import { isQueuedMutationResult } from "@/lib/offline-fetch";
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
import { Truck, Fuel, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

export function LogSpotHireDialog({
  projectId,
  open,
  onOpenChange,
  onSuccess,
  existingVendors = [],
  boqItems = [],
}: {
  projectId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  existingVendors?: Array<{ id: string; name: string; phone?: string | null }>;
  boqItems?: Array<{ id: string; code: string; description: string }>;
}) {
  const [vendorName, setVendorName] = useState("");
  const [vendorPhone, setVendorPhone] = useState("");
  const [machineName, setMachineName] = useState("");
  const [registrationNo, setRegistrationNo] = useState("");
  const [equipmentType, setEquipmentType] = useState<"excavator" | "crane" | "pump" | "roller" | "tipper" | "grader" | "loader" | "other">("excavator");
  const [hireType, setHireType] = useState<"hourly" | "trip" | "daily" | "shift" | "lump_sum">("hourly");
  const [rate, setRate] = useState<number>(2500);
  const [minCalloutHours, setMinCalloutHours] = useState<number>(0);
  const [mobilizationFee, setMobilizationFee] = useState<number>(0);
  const [fuelMode, setFuelMode] = useState<"wet" | "dry">("wet");
  const [fuelLitersIssued, setFuelLitersIssued] = useState<number>(0);
  const [fuelUnitCost, setFuelUnitCost] = useState<number>(175);
  const [date, setDate] = useState(() => format(new Date(), "yyyy-MM-dd"));
  const [hoursWorked, setHoursWorked] = useState<number>(3.5);
  const [tripCount, setTripCount] = useState<number>(0);
  const [operatorName, setOperatorName] = useState("");
  const [operatorPhone, setOperatorPhone] = useState("");
  const [slipNumber, setSlipNumber] = useState("");
  const [remarks, setRemarks] = useState("");
  const [boqItemId, setBoqItemId] = useState("");

  const createMut = trpc.equipment.createSpotHire.useMutation({
    onSuccess: (res) => {
      // H-18 (c): offline-queue path — the hook may resolve with the
      // synthetic "_queued" marker instead of a real ticket.
      if (isQueuedMutationResult(res)) {
        toast.success("Spot hire saved offline — it will sync when you're back online");
        onSuccess();
        onOpenChange(false);
        return;
      }
      toast.success(`Spot hire ticket #${res.ticket.slipNumber || res.ticket.id.slice(-4)} logged successfully`);
      onSuccess();
      onOpenChange(false);
    },
    onError: (e) => toast.error(e.message),
  });

  // Calculate live amounts
  const billedHours = hireType === "hourly" ? Math.max(Number(hoursWorked) || 0, Number(minCalloutHours) || 0) : 0;
  const baseGross = hireType === "trip" ? (Number(tripCount) || 0) * Number(rate) : billedHours * Number(rate);
  const totalGross = baseGross + (Number(mobilizationFee) || 0);
  const fuelDeduction = fuelMode === "dry" ? (Number(fuelLitersIssued) || 0) * (Number(fuelUnitCost) || 175) : 0;
  const netPayable = Math.max(0, totalGross - fuelDeduction);

  const handleVendorSelect = (name: string) => {
    setVendorName(name);
    const matched = existingVendors.find((v) => v.name.toLowerCase() === name.toLowerCase());
    if (matched?.phone) {
      setVendorPhone(matched.phone);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!vendorName.trim()) {
      toast.error("Please enter vendor / machine owner name");
      return;
    }
    if (!machineName.trim()) {
      toast.error("Please enter machine name");
      return;
    }

    createMut.mutate({
      projectId,
      vendorName,
      vendorPhone: vendorPhone || undefined,
      machineName,
      registrationNo: registrationNo || undefined,
      equipmentType,
      hireType,
      rate: Number(rate),
      minCalloutHours: Number(minCalloutHours),
      mobilizationFee: Number(mobilizationFee),
      fuelMode,
      fuelLitersIssued: Number(fuelLitersIssued),
      fuelUnitCost: Number(fuelUnitCost),
      date,
      hoursWorked: Number(hoursWorked),
      tripCount: Number(tripCount),
      operatorName: operatorName || undefined,
      operatorPhone: operatorPhone || undefined,
      slipNumber: slipNumber || undefined,
      remarks: remarks || undefined,
      boqItemId: boqItemId || undefined,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Truck className="h-5 w-5 text-primary" />
            Log On-Demand / Spot Equipment Hire Ticket
          </DialogTitle>
          <DialogDescription className="text-xs">
            Fast slip for ad-hoc machine hires. New vendors are auto-registered automatically without leaving this page.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-3.5 py-2">
          {/* Vendor Section (with Auto-Provisioning indicator) */}
          <div className="p-2.5 bg-muted/30 rounded-md border space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-semibold">Vendor / Machine Supplier *</Label>
              <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                <Sparkles className="h-3 w-3 text-amber-500" /> Auto-registers new vendors
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div>
                <Input
                  value={vendorName}
                  onChange={(e) => handleVendorSelect(e.target.value)}
                  placeholder="e.g. Bishal Earthmovers"
                  className="h-8 text-xs"
                  list="existing-vendors"
                  required
                />
                <datalist id="existing-vendors">
                  {existingVendors.map((v) => (
                    <option key={v.id} value={v.name} />
                  ))}
                </datalist>
              </div>
              <div>
                <Input
                  value={vendorPhone}
                  onChange={(e) => setVendorPhone(e.target.value)}
                  placeholder="Vendor Phone (98XXXXXXXX)"
                  className="h-8 text-xs font-mono"
                />
              </div>
            </div>
          </div>

          {/* Machine & Hire Details */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            <div className="space-y-1">
              <Label className="text-xs">Machine Name *</Label>
              <Input
                value={machineName}
                onChange={(e) => setMachineName(e.target.value)}
                placeholder="e.g. 50T Crane, JCB 3DX"
                className="h-8 text-xs"
                required
              />
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Registration / Plate No.</Label>
              <Input
                value={registrationNo}
                onChange={(e) => setRegistrationNo(e.target.value)}
                placeholder="e.g. Ba 2 Ka 4512"
                className="h-8 text-xs font-mono"
              />
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Equipment Type</Label>
              <Select value={equipmentType} onValueChange={(val: any) => setEquipmentType(val)}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="excavator">Excavator / Backhoe</SelectItem>
                  <SelectItem value="crane">Mobile Crane / Hydra</SelectItem>
                  <SelectItem value="pump">Concrete Boom Pump</SelectItem>
                  <SelectItem value="tipper">Tipper / Dumper</SelectItem>
                  <SelectItem value="roller">Compactor Roller</SelectItem>
                  <SelectItem value="grader">Motor Grader</SelectItem>
                  <SelectItem value="loader">Wheel Loader</SelectItem>
                  <SelectItem value="other">Other Machinery</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Rates, Date & Duration */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            <div className="space-y-1">
              <Label className="text-xs">Hire Basis</Label>
              <Select value={hireType} onValueChange={(val: any) => setHireType(val)}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="hourly">Hourly Rate</SelectItem>
                  <SelectItem value="trip">Per Trip / Haul</SelectItem>
                  <SelectItem value="shift">Per Shift (8h)</SelectItem>
                  <SelectItem value="daily">Per Day</SelectItem>
                  <SelectItem value="lump_sum">Lump Sum Task</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Rate (NPR) *</Label>
              <Input
                type="number"
                min="0"
                step="50"
                value={rate}
                onChange={(e) => setRate(parseFloat(e.target.value) || 0)}
                className="h-8 text-xs font-mono font-bold"
                required
              />
            </div>

            {hireType === "trip" ? (
              <div className="space-y-1">
                <Label className="text-xs">Trip Count *</Label>
                <Input
                  type="number"
                  min="1"
                  value={tripCount}
                  onChange={(e) => setTripCount(parseInt(e.target.value, 10) || 0)}
                  className="h-8 text-xs font-mono font-bold"
                  required
                />
              </div>
            ) : (
              <div className="space-y-1">
                <Label className="text-xs">Hours Worked *</Label>
                <Input
                  type="number"
                  min="0.5"
                  step="0.5"
                  value={hoursWorked}
                  onChange={(e) => setHoursWorked(parseFloat(e.target.value) || 0)}
                  className="h-8 text-xs font-mono font-bold text-info"
                  required
                />
              </div>
            )}

            <div className="space-y-1">
              <Label className="text-xs">Mobilization / Float (NPR)</Label>
              <Input
                type="number"
                min="0"
                step="100"
                value={mobilizationFee}
                onChange={(e) => setMobilizationFee(parseFloat(e.target.value) || 0)}
                placeholder="0"
                className="h-8 text-xs font-mono"
              />
            </div>
          </div>

          {/* Fuel Clause & Deductions */}
          <div className="p-2.5 bg-muted/20 rounded-md border space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-semibold flex items-center gap-1.5">
                <Fuel className="h-3.5 w-3.5 text-amber-500" /> Fuel Terms &amp; Site Diesel
              </Label>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <div>
                <Select value={fuelMode} onValueChange={(val: any) => setFuelMode(val)}>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="wet">Wet Hire (Vendor Fuel)</SelectItem>
                    <SelectItem value="dry">Dry Hire (Site Diesel Given)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {fuelMode === "dry" ? (
                <>
                  <div>
                    <Input
                      type="number"
                      min="0"
                      step="5"
                      value={fuelLitersIssued}
                      onChange={(e) => setFuelLitersIssued(parseFloat(e.target.value) || 0)}
                      placeholder="Diesel Liters Filled"
                      className="h-8 text-xs font-mono font-bold"
                    />
                  </div>
                  <div>
                    <Input
                      type="number"
                      min="50"
                      value={fuelUnitCost}
                      onChange={(e) => setFuelUnitCost(parseFloat(e.target.value) || 0)}
                      placeholder="NPR / Liter (175)"
                      className="h-8 text-xs font-mono"
                    />
                  </div>
                </>
              ) : (
                <div className="sm:col-span-2 text-[10px] text-muted-foreground flex items-center">
                  Vendor provides own fuel. No diesel deducted from bill.
                </div>
              )}
            </div>
          </div>

          {/* Date, BOQ Tag & Voucher */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            <div className="space-y-1">
              <Label className="text-xs">Date *</Label>
              <Input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="h-8 text-xs font-mono"
                required
              />
            </div>

            <div className="space-y-1 sm:col-span-2">
              <Label className="text-xs">Charge to BOQ Item / Activity</Label>
              <Select value={boqItemId} onValueChange={setBoqItemId}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="Select BOQ item (Optional)" />
                </SelectTrigger>
                <SelectContent>
                  {boqItems.map((b) => (
                    <SelectItem key={b.id} value={b.id}>
                      {b.code} - {b.description.slice(0, 40)}...
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Physical Slip / Voucher #</Label>
              <Input
                value={slipNumber}
                onChange={(e) => setSlipNumber(e.target.value)}
                placeholder="Slip #1048"
                className="h-8 text-xs font-mono"
              />
            </div>

            <div className="space-y-1 sm:col-span-2">
              <Label className="text-xs">Work Location &amp; Notes</Label>
              <Input
                value={remarks}
                onChange={(e) => setRemarks(e.target.value)}
                placeholder="e.g. Pier 3 girder erection"
                className="h-8 text-xs"
              />
            </div>
          </div>

          {/* Live Cost Summary Banner */}
          <div className="p-2.5 bg-success/10 dark:bg-success/30 rounded border border-success/40 dark:border-success flex items-center justify-between text-xs font-mono">
            <div>
              <span className="text-muted-foreground text-[10px]">Gross Rate Calculation:</span>
              <p className="font-bold text-foreground">
                NPR {totalGross.toLocaleString()} {fuelDeduction > 0 && <span className="text-amber-600 font-normal">(-{fuelDeduction.toLocaleString()} fuel)</span>}
              </p>
            </div>
            <div className="text-right">
              <span className="text-muted-foreground text-[10px]">NET PAYABLE AMOUNT:</span>
              <p className="text-base font-extrabold text-success dark:text-success/80">
                NPR {netPayable.toLocaleString()}
              </p>
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
              Save Spot Ticket (NPR {netPayable.toLocaleString()})
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
