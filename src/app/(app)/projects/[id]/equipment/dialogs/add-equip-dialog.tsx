"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc-client";

export const EQUIPMENT_TYPES = [
  "Excavator",
  "Backhoe Loader",
  "Motor Grader",
  "Road Roller / Compactor",
  "Dump Truck / Tipper",
  "Transit Mixer",
  "Mobile Crane / Hydra",
  "Diesel Generator / Genset",
  "Water Tanker",
  "Asphalt Paver",
  "Concrete Boom Pump",
  "Tractor / Trailer",
  "Other Machinery",
];

export function AddEquipDialog({ projectId, onDone }: { projectId: string; onDone: () => void }) {
  const utils = trpc.useUtils();
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [type, setType] = useState(EQUIPMENT_TYPES[0]);
  const [unit, setUnit] = useState("hrs");
  const [model, setModel] = useState("");
  const [fuelRate, setFuelRate] = useState("");
  const [factoryFuelRate, setFactoryFuelRate] = useState("");

  const mutation = trpc.equipment.create.useMutation({
    onSuccess: () => {
      utils.equipment.list.invalidate({ projectId });
      toast.success("Equipment added successfully");
      onDone();
    },
    onError: (e) => toast.error(e.message),
  });

  const handleTypeChange = (newType: string) => {
    setType(newType);
    if (newType.includes("Truck") || newType.includes("Tipper") || newType.includes("Tanker")) {
      setUnit("km");
    } else if (unit === "km" && !newType.includes("Truck") && !newType.includes("Tanker")) {
      setUnit("hrs");
    }
  };

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    mutation.mutate({
      projectId,
      name,
      code: code || undefined,
      type: type || undefined,
      unit,
      model: model || undefined,
      fuelRate: parseFloat(fuelRate) || 0,
      factoryFuelRate: parseFloat(factoryFuelRate) || 0,
    });
  };

  return (
    <DialogContent className="max-w-md">
      <DialogHeader>
        <DialogTitle className="text-base font-bold">Register Equipment / Machinery</DialogTitle>
      </DialogHeader>
      <form onSubmit={onSubmit} className="space-y-3 py-1">
        <div className="space-y-1">
          <Label className="text-xs font-semibold">Machine Name *</Label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            placeholder="e.g. Komatsu PC210 Hydraulic Excavator"
            className="h-8 text-xs"
          />
        </div>
        <div className="grid grid-cols-3 gap-2.5">
          <div className="space-y-1">
            <Label className="text-xs">Equipment Code</Label>
            <Input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="e.g. EQ-EXC-01"
              className="h-8 text-xs font-mono"
            />
          </div>
          <div className="space-y-1 col-span-2">
            <Label className="text-xs font-semibold">Category / Type</Label>
            <select
              value={type}
              onChange={(e) => handleTypeChange(e.target.value)}
              className="w-full h-8 rounded-md border border-input bg-background px-2 text-xs shadow-xs"
            >
              {EQUIPMENT_TYPES.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label className="text-xs">Model & Make</Label>
            <Input
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder="e.g. CAT 320D2 GC"
              className="h-8 text-xs"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs font-semibold">Tracking Unit</Label>
            <select
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
              className="w-full h-8 rounded-md border border-input bg-background px-2 text-xs shadow-xs"
            >
              <option value="hrs">Hours (hrs) — Hour-meter</option>
              <option value="km">Kilometers (km) — Odometer</option>
              <option value="trips">Trips — Dump Truck / Haulage</option>
              <option value="days">Days — Shift Rate</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label className="text-xs">Site Fuel Rate ({unit === "km" ? "km/L" : "L/hr"})</Label>
            <Input
              value={fuelRate}
              onChange={(e) => setFuelRate(e.target.value)}
              type="number"
              step="0.1"
              placeholder={unit === "km" ? "e.g. 3.8" : "e.g. 14.5"}
              className="h-8 text-xs font-mono"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Factory Benchmark ({unit === "km" ? "km/L" : "L/hr"})</Label>
            <Input
              value={factoryFuelRate}
              onChange={(e) => setFactoryFuelRate(e.target.value)}
              type="number"
              step="0.1"
              placeholder={unit === "km" ? "e.g. 4.0" : "e.g. 13.5"}
              className="h-8 text-xs font-mono"
            />
          </div>
        </div>
        <DialogFooter className="pt-2">
          <Button type="submit" disabled={mutation.isPending} className="h-8.5 text-xs bg-blue-600 hover:bg-blue-700 text-white gap-1">
            {mutation.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Register Equipment
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
