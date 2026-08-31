"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2, Check, ChevronsUpDown, Calculator, Fuel, Gauge, Sparkles, Boxes, Link2 } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc-client";
import { getLocalDateString } from "@/lib/nepali-calendar";
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

type Equipment = {
  id: string;
  name: string;
  code: string | null;
  type?: string | null;
  model?: string | null;
  unit?: string;
  fuelRate?: number;
  factoryFuelRate?: number;
};

export function AddLogDialog({
  projectId,
  equipmentList,
  onDone,
}: {
  projectId: string;
  equipmentList: Equipment[];
  onDone: () => void;
}) {
  const utils = trpc.useUtils();
  const [equipmentId, setEquipmentId] = useState("");
  const [comboboxOpen, setComboboxOpen] = useState(false);
  const [taskComboboxOpen, setTaskComboboxOpen] = useState(false);

  const [date, setDate] = useState(() => getLocalDateString());
  const [logMode, setLogMode] = useState<"meter" | "odometer" | "direct">("meter");
  const [startHours, setStartHours] = useState("");
  const [endHours, setEndHours] = useState("");
  const [directHours, setDirectHours] = useState("");
  const [fuelFilled, setFuelFilled] = useState("0");
  const [workDescription, setWorkDescription] = useState("");
  const [operator, setOperator] = useState("");

  // Activity & BOQ Linkage
  const [ganttTaskId, setGanttTaskId] = useState("");
  const [boqItemId, setBoqItemId] = useState("");
  const [outputQty, setOutputQty] = useState("");
  const [outputUnit, setOutputUnit] = useState("cum");
  const [tripCount, setTripCount] = useState("");

  // Fetch Gantt Tasks and BOQ items
  const { data: ganttData } = trpc.gantt.list.useQuery({ projectId });
  const { data: boqData } = trpc.boq.list.useQuery({ projectId });

  const tasks = ganttData?.tasks || [];
  const boqItems = boqData?.items || [];

  const selectedTask = tasks.find((t) => t.id === ganttTaskId);
  const selectedBoq = boqItems.find((b) => b.id === boqItemId);

  const selectedEquip = equipmentList.find((e) => e.id === equipmentId);
  const isKmUnit = selectedEquip?.unit === "km";

  // Handle machine selection & auto-select unit mode
  const handleSelectMachine = (equip: Equipment) => {
    setEquipmentId(equip.id);
    if (equip.unit === "km") {
      setLogMode("odometer");
    } else {
      setLogMode("meter");
    }
    setComboboxOpen(false);
  };

  // Handle task selection & auto-populate linked BOQ item and unit
  const handleSelectTask = (task: any) => {
    setGanttTaskId(task.id);
    // If the task has linked BOQ items, auto-populate the first one!
    const linkedBoq = task.boqLinks?.[0]?.boqItem;
    if (linkedBoq) {
      setBoqItemId(linkedBoq.id);
      if (linkedBoq.unit) {
        setOutputUnit(linkedBoq.unit);
      }
    }
    setTaskComboboxOpen(false);
  };

  // Real-time calculations
  const sHours = parseFloat(startHours) || 0;
  const eHours = parseFloat(endHours) || 0;
  const dHours = parseFloat(directHours) || 0;
  const fFilled = parseFloat(fuelFilled) || 0;
  const outVal = parseFloat(outputQty) || 0;

  const computedDuration = logMode === "direct"
    ? dHours
    : (eHours > sHours ? eHours - sHours : 0);

  const standardRate = selectedEquip?.fuelRate || selectedEquip?.factoryFuelRate || 0;
  const expectedFuel = !isKmUnit && standardRate > 0 && computedDuration > 0
    ? (computedDuration * standardRate)
    : null;

  const computedMileage = isKmUnit && fFilled > 0 && computedDuration > 0
    ? (computedDuration / fFilled)
    : null;

  const computedProductivity = computedDuration > 0 && outVal > 0
    ? (outVal / computedDuration)
    : null;

  const mutation = trpc.equipment.createLog.useMutation({
    onSuccess: () => {
      utils.equipment.listLogs.invalidate({ projectId });
      utils.equipment.list.invalidate({ projectId });
      utils.equipment.getEfficiencyStats.invalidate({ projectId });
      utils.equipment.getTaskEquipmentStats.invalidate({ projectId });
      toast.success("Run log saved successfully");
      onDone();
    },
    onError: (e) => toast.error(e.message),
  });

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!equipmentId) {
      toast.error("Please select a machine");
      return;
    }
    if (logMode !== "direct" && eHours < sHours) {
      toast.error("End reading must be greater than or equal to Start reading");
      return;
    }
    if (logMode === "direct" && dHours <= 0) {
      toast.error("Please enter the worked hours/distance");
      return;
    }

    mutation.mutate({
      projectId,
      equipmentId,
      date: date ? new Date(date).toISOString() : undefined,
      logMode,
      startHours: logMode === "direct" ? 0 : sHours,
      endHours: logMode === "direct" ? 0 : eHours,
      workedHours: computedDuration,
      fuelFilled: fFilled,
      workDescription: workDescription || undefined,
      operator: operator || undefined,
      ganttTaskId: ganttTaskId || undefined,
      boqItemId: boqItemId || undefined,
      outputQty: outVal > 0 ? outVal : undefined,
      outputUnit: outVal > 0 ? outputUnit : undefined,
      tripCount: tripCount ? parseInt(tripCount) : undefined,
    });
  };

  return (
    <DialogContent className="max-w-xl">
      <DialogHeader>
        <DialogTitle className="text-base font-bold flex items-center justify-between">
          <span>Log Run Hours & Activity Output</span>
          {isKmUnit && (
            <span className="text-[10.5px] font-normal px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300">
              Kilometer (km) Vehicle
            </span>
          )}
        </DialogTitle>
      </DialogHeader>

      <form onSubmit={onSubmit} className="space-y-3 py-1">
        {/* Searchable Machine Picker */}
        <div className="space-y-1">
          <Label className="text-xs font-semibold">Select Machine / Fleet Vehicle *</Label>
          <Popover open={comboboxOpen} onOpenChange={setComboboxOpen}>
            <PopoverTrigger asChild>
              <button
                type="button"
                className={cn(
                  "flex h-8 w-full items-center justify-between rounded-md border border-input bg-background px-2.5 text-xs transition-colors hover:bg-muted/50 text-left",
                  !selectedEquip && "text-muted-foreground"
                )}
              >
                <span className="truncate font-medium">
                  {selectedEquip
                    ? `${selectedEquip.name} ${selectedEquip.code ? `(${selectedEquip.code})` : ""} ${selectedEquip.model ? `• ${selectedEquip.model}` : ""}`
                    : "-- Search Machine / Vehicle --"}
                </span>
                <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 opacity-50 ml-1" />
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-[380px] p-0 shadow-lg" align="start">
              <Command>
                <CommandInput placeholder="Search machine name, code, model..." className="h-8 text-xs" />
                <CommandList className="max-h-[220px]">
                  <CommandEmpty className="text-xs py-4 text-center text-muted-foreground">
                    No machine found.
                  </CommandEmpty>
                  <CommandGroup>
                    {equipmentList.map((e) => {
                      const isSelected = e.id === equipmentId;
                      return (
                        <CommandItem
                          key={e.id}
                          value={`${e.name} ${e.code || ""} ${e.type || ""} ${e.model || ""}`}
                          onSelect={() => handleSelectMachine(e)}
                          className="text-xs py-1.5 cursor-pointer flex items-center justify-between"
                        >
                          <div className="flex items-center gap-2 truncate">
                            <Check className={cn("h-3.5 w-3.5 text-emerald-600 shrink-0", isSelected ? "opacity-100" : "opacity-0")} />
                            <div className="truncate">
                              <div className="font-semibold text-foreground truncate">{e.name}</div>
                              <div className="text-[10px] text-muted-foreground">
                                {e.code ? `${e.code} • ` : ""}{e.type || "Equipment"} • Tracking: {e.unit || "hrs"}
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
        </div>

        {/* Logging Mode Toggle */}
        <div className="flex items-center gap-1.5 p-1 rounded-lg border bg-muted/20">
          <button
            type="button"
            onClick={() => setLogMode(isKmUnit ? "odometer" : "meter")}
            className={cn(
              "flex-1 py-1 text-xs font-medium rounded-md transition-all text-center",
              logMode !== "direct"
                ? "bg-background text-foreground shadow-2xs font-semibold"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {isKmUnit ? "🛣️ Odometer (Start → End km)" : "⏱️ Continuous Meter (Start → End)"}
          </button>
          <button
            type="button"
            onClick={() => setLogMode("direct")}
            className={cn(
              "flex-1 py-1 text-xs font-medium rounded-md transition-all text-center",
              logMode === "direct"
                ? "bg-background text-foreground shadow-2xs font-semibold"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            ⚡ Direct Shift / Faulty Meter
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label className="text-xs">Date</Label>
            <Input
              value={date}
              onChange={(e) => setDate(e.target.value)}
              type="date"
              className="h-8 text-xs"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Fuel Refilled (Liters)</Label>
            <Input
              value={fuelFilled}
              onChange={(e) => setFuelFilled(e.target.value)}
              type="number"
              step="any"
              placeholder="0"
              className="h-8 text-xs font-mono"
            />
          </div>
        </div>

        {/* Continuous vs Direct Reading Container */}
        {logMode !== "direct" ? (
          <div className="grid grid-cols-2 gap-3 p-2.5 rounded-lg border bg-muted/10">
            <div className="space-y-1">
              <Label className="text-xs font-medium">
                {isKmUnit ? "Start Odometer (km) *" : "Start Hour Meter *"}
              </Label>
              <Input
                value={startHours}
                onChange={(e) => setStartHours(e.target.value)}
                type="number"
                step="0.1"
                required
                placeholder={isKmUnit ? "e.g. 45210" : "e.g. 1420.5"}
                className="h-8 text-xs font-mono"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-medium">
                {isKmUnit ? "End Odometer (km) *" : "End Hour Meter *"}
              </Label>
              <Input
                value={endHours}
                onChange={(e) => setEndHours(e.target.value)}
                type="number"
                step="0.1"
                required
                placeholder={isKmUnit ? "e.g. 45390" : "e.g. 1429.0"}
                className="h-8 text-xs font-mono"
              />
            </div>

            {/* Calculations Banner */}
            <div className="col-span-2 flex items-center justify-between text-xs pt-1 border-t border-border/40 text-muted-foreground">
              <div className="flex items-center gap-1.5">
                <Calculator className="h-3.5 w-3.5 text-blue-600" />
                <span>Computed Run:</span>
                <strong className="text-foreground font-mono">
                  {computedDuration.toFixed(1)} {isKmUnit ? "km" : "hrs"}
                </strong>
              </div>
              {isKmUnit && computedMileage !== null && (
                <div className="flex items-center gap-1 text-[11px] text-emerald-700 dark:text-emerald-300 font-mono">
                  <Gauge className="h-3 w-3" />
                  <span>Mileage: {computedMileage.toFixed(2)} km/L</span>
                </div>
              )}
              {!isKmUnit && expectedFuel !== null && (
                <div className="flex items-center gap-1 text-[11px] text-emerald-700 dark:text-emerald-300">
                  <Fuel className="h-3 w-3" />
                  <span>Exp. Fuel: ~{expectedFuel.toFixed(1)} L</span>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 p-2.5 rounded-lg border bg-muted/10">
            <div className="space-y-1">
              <Label className="text-xs font-medium">
                Direct Shift {isKmUnit ? "Distance (km)" : "Hours (hrs)"} *
              </Label>
              <Input
                value={directHours}
                onChange={(e) => setDirectHours(e.target.value)}
                type="number"
                step="0.1"
                required
                placeholder={isKmUnit ? "e.g. 150 km" : "e.g. 8.0 hrs"}
                className="h-8 text-xs font-mono"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Trip Count (For Tippers/Dumpers)</Label>
              <Input
                value={tripCount}
                onChange={(e) => setTripCount(e.target.value)}
                type="number"
                placeholder="e.g. 14 trips"
                className="h-8 text-xs font-mono"
              />
            </div>
          </div>
        )}

        {/* Activity & BOQ Linkage (Auto-Populates BOQ & Unit) */}
        <div className="p-2.5 rounded-lg border border-border/70 bg-card space-y-2">
          <div className="flex items-center justify-between text-xs font-semibold text-foreground">
            <span className="flex items-center gap-1.5">
              <Sparkles className="h-3.5 w-3.5 text-violet-600" />
              Activity & BOQ Linkage (Auto-Populated)
            </span>
            {computedProductivity !== null && (
              <span className="text-[11px] font-mono text-violet-700 dark:text-violet-300 font-bold">
                Rate: {computedProductivity.toFixed(1)} {outputUnit}/{isKmUnit ? "km" : "hr"}
              </span>
            )}
          </div>

          <div className="space-y-1">
            <Popover open={taskComboboxOpen} onOpenChange={setTaskComboboxOpen}>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className={cn(
                    "flex h-7.5 w-full items-center justify-between rounded-md border border-input bg-background px-2.5 text-xs transition-colors hover:bg-muted/50 text-left",
                    !selectedTask && "text-muted-foreground"
                  )}
                >
                  <span className="truncate">
                    {selectedTask
                      ? `${selectedTask.code ? `[${selectedTask.code}] ` : ""}${selectedTask.name}`
                      : "-- Select Gantt Task / Milestone --"}
                  </span>
                  <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 opacity-50 ml-1" />
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-[440px] p-0 shadow-lg" align="start">
                <Command>
                  <CommandInput placeholder="Search milestone or activity..." className="h-8 text-xs" />
                  <CommandList className="max-h-[220px]">
                    <CommandEmpty className="text-xs py-3 text-center text-muted-foreground">
                      No task found.
                    </CommandEmpty>
                    <CommandGroup>
                      {tasks.map((t: any) => {
                        const linkedBoqCode = t.boqLinks?.[0]?.boqItem?.code;
                        return (
                          <CommandItem
                            key={t.id}
                            value={`${t.name} ${t.code || ""} ${linkedBoqCode || ""}`}
                            onSelect={() => handleSelectTask(t)}
                            className="text-xs py-1.5 cursor-pointer flex items-center justify-between"
                          >
                            <div className="truncate">
                              <span className="font-medium text-foreground">{t.name}</span>
                              {t.code && <span className="text-[10px] text-muted-foreground ml-1.5 font-mono">({t.code})</span>}
                              {linkedBoqCode && (
                                <span className="text-[10px] text-violet-600 dark:text-violet-400 ml-1.5 font-semibold">
                                  • BOQ: {linkedBoqCode}
                                </span>
                              )}
                            </div>
                            {ganttTaskId === t.id && <Check className="h-3.5 w-3.5 text-primary shrink-0 ml-2" />}
                          </CommandItem>
                        );
                      })}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>

          {/* Auto-Populated Linked BOQ Item Badge */}
          {selectedBoq && (
            <div className="flex items-center gap-1.5 p-1.5 rounded-md bg-violet-500/10 border border-violet-500/20 text-xs">
              <Boxes className="h-3.5 w-3.5 text-violet-600 shrink-0" />
              <div className="truncate text-[11px]">
                <span className="font-semibold text-violet-900 dark:text-violet-200">
                  Auto-Linked BOQ [{selectedBoq.code}]:
                </span>{" "}
                <span className="text-muted-foreground truncate">{selectedBoq.description}</span>
                <span className="ml-1 font-mono font-bold text-violet-700 dark:text-violet-300">
                  ({selectedBoq.unit})
                </span>
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3 pt-0.5">
            <div className="space-y-1">
              <Label className="text-[11px]">Today's Physical Work Output</Label>
              <Input
                value={outputQty}
                onChange={(e) => setOutputQty(e.target.value)}
                type="number"
                step="0.1"
                placeholder={selectedBoq ? `e.g. 340 ${selectedBoq.unit}` : "e.g. 340"}
                className="h-7 text-xs font-mono"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-[11px]">Measurement Unit</Label>
              <Input
                value={outputUnit}
                onChange={(e) => setOutputUnit(e.target.value)}
                placeholder="e.g. cum"
                className="h-7 text-xs font-mono"
              />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label className="text-xs">Operator Name</Label>
            <Input
              value={operator}
              onChange={(e) => setOperator(e.target.value)}
              placeholder="e.g. Shyam Thapa"
              className="h-8 text-xs"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Work Location / Chainage</Label>
            <Input
              value={workDescription}
              onChange={(e) => setWorkDescription(e.target.value)}
              placeholder="e.g. Ch 12+400 Cutting"
              className="h-8 text-xs"
            />
          </div>
        </div>

        <DialogFooter className="pt-2">
          <Button type="submit" disabled={mutation.isPending} className="h-8.5 text-xs bg-blue-600 hover:bg-blue-700 text-white gap-1">
            {mutation.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Save Run Log
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
