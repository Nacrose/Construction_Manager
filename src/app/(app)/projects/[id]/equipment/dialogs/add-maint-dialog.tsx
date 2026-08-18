"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2, Check, ChevronsUpDown, Wrench } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc-client";
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
};

export function AddMaintDialog({
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
  const [type, setType] = useState<"routine" | "repair" | "inspection">("routine");
  const [description, setDescription] = useState("");
  const [cost, setCost] = useState("0");
  const [nextDueHours, setNextDueHours] = useState("");
  const [isResolved, setIsResolved] = useState(false);

  const selectedEquip = equipmentList.find((e) => e.id === equipmentId);

  const mutation = trpc.equipment.createMaintenance.useMutation({
    onSuccess: () => {
      utils.equipment.listMaintenance.invalidate({ projectId });
      utils.equipment.list.invalidate({ projectId });
      toast.success("Maintenance ticket logged successfully");
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
    mutation.mutate({
      projectId,
      equipmentId,
      type,
      description,
      cost: parseFloat(cost) || 0,
      nextDueHours: nextDueHours ? parseFloat(nextDueHours) : null,
      status: isResolved ? "resolved" : "pending",
    });
  };

  return (
    <DialogContent className="max-w-lg">
      <DialogHeader>
        <DialogTitle className="text-base font-bold">Log Maintenance / Breakdown</DialogTitle>
      </DialogHeader>
      <form onSubmit={onSubmit} className="space-y-3.5 py-1">
        {/* Searchable Machine Picker */}
        <div className="space-y-1">
          <Label className="text-xs font-semibold">Select Machine *</Label>
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
                    : "-- Search & Select Machine --"}
                </span>
                <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 opacity-50 ml-1" />
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-[340px] p-0 shadow-lg" align="start">
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
                          onSelect={() => {
                            setEquipmentId(e.id);
                            setComboboxOpen(false);
                          }}
                          className="text-xs py-1.5 cursor-pointer flex items-center justify-between"
                        >
                          <div className="flex items-center gap-2 truncate">
                            <Check className={cn("h-3.5 w-3.5 text-emerald-600 shrink-0", isSelected ? "opacity-100" : "opacity-0")} />
                            <div className="truncate">
                              <div className="font-semibold text-foreground truncate">{e.name}</div>
                              <div className="text-[10px] text-muted-foreground">
                                {e.code ? `${e.code} • ` : ""}{e.type || "Equipment"}
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

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label className="text-xs font-semibold">Service Type *</Label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value as any)}
              className="w-full h-8 rounded-md border border-input bg-background px-2.5 text-xs shadow-xs"
            >
              <option value="routine">Routine / Periodic Service (250hr/500hr)</option>
              <option value="repair">Breakdown / Emergency Repair</option>
              <option value="inspection">Safety & Fitness Inspection</option>
            </select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Estimated Cost (NPR)</Label>
            <Input
              value={cost}
              onChange={(e) => setCost(e.target.value)}
              type="number"
              className="h-8 text-xs font-mono"
            />
          </div>
        </div>

        <div className="space-y-1">
          <Label className="text-xs">Next Due Hours Meter Reading (Optional)</Label>
          <Input
            value={nextDueHours}
            onChange={(e) => setNextDueHours(e.target.value)}
            type="number"
            placeholder="e.g. 5250 (Trigger next service)"
            className="h-8 text-xs font-mono"
          />
        </div>

        <div className="space-y-1">
          <Label className="text-xs font-semibold">Work / Breakdown Description *</Label>
          <Input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            required
            placeholder="e.g. 250hr Engine oil & fuel filter replacement + track tightening"
            className="h-8 text-xs"
          />
        </div>

        {type === "repair" && (
          <div className="flex items-center gap-2 pt-1 border-t border-border/40">
            <input
              type="checkbox"
              id="maintResolved"
              checked={isResolved}
              onChange={(e) => setIsResolved(e.target.checked)}
              className="rounded border-input text-blue-600 focus:ring-blue-500 h-3.5 w-3.5 cursor-pointer"
            />
            <Label htmlFor="maintResolved" className="cursor-pointer text-xs font-medium">
              Mark as Resolved Immediately (Machine Remains Active)
            </Label>
          </div>
        )}

        <DialogFooter className="pt-2">
          <Button type="submit" disabled={mutation.isPending} className="h-8.5 text-xs bg-amber-600 hover:bg-amber-700 text-white gap-1">
            {mutation.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Save Maintenance Ticket
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
