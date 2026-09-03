"use client";

import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Wrench, Copy } from "lucide-react";
import { jsonArrayString } from "./types";

export function EquipmentSection({
  equipment,
  setEquipment,
  canEdit,
  copying,
  onCopyFromPrevious,
  saveField,
}: {
  equipment: any[];
  setEquipment: (val: any[]) => void;
  canEdit: boolean;
  copying: boolean;
  onCopyFromPrevious: (section: "equipment") => void;
  saveField: (field: string, val: any) => void | Promise<void>;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <Wrench className="h-4 w-4 text-success" /> Equipment & Machinery Log
          </h3>
          <p className="text-[11px] text-muted-foreground">
            Running hours and fuel automatically sync to the project fleet EquipmentLog.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {canEdit && (
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs gap-1"
              onClick={() => onCopyFromPrevious("equipment")}
              disabled={copying}
            >
              <Copy className="h-3 w-3" /> Copy Previous
            </Button>
          )}
          {canEdit && (
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs"
              onClick={() => {
                const updated = [
                  ...equipment,
                  { name: "", type: "Excavator", workingHours: 0, fuel: 0, ownership: "owned" },
                ];
                setEquipment(updated);
                saveField("equipmentUsed", jsonArrayString(updated));
              }}
            >
              + Add Equipment
            </Button>
          )}
        </div>
      </div>

      <div className="rounded-md border bg-card overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="h-7 text-[10px]">Equipment Name / Reg No.</TableHead>
              <TableHead className="h-7 text-[10px] w-28">Type</TableHead>
              <TableHead className="h-7 text-[10px] w-20">Ownership</TableHead>
              <TableHead className="h-7 text-[10px] w-20 text-right">Run Hours</TableHead>
              <TableHead className="h-7 text-[10px] w-20 text-right">Fuel (Liters)</TableHead>
              {canEdit && <TableHead className="h-7 w-6"></TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {equipment.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={canEdit ? 6 : 5}
                  className="py-6 text-center text-xs text-muted-foreground"
                >
                  No equipment entries. Click &quot;Copy Previous&quot; or &quot;+ Add
                  Equipment&quot;.
                </TableCell>
              </TableRow>
            ) : (
              equipment.map((r, i) => (
                <TableRow key={i}>
                  <TableCell className="py-1 px-1">
                    <input
                      disabled={!canEdit}
                      className="w-full rounded border px-1 py-0.5 text-xs"
                      placeholder="CAT 320D (EX-01)"
                      value={r.name || ""}
                      onChange={(e) => {
                        const c = [...equipment];
                        c[i] = { ...c[i], name: e.target.value };
                        setEquipment(c);
                      }}
                      onBlur={() => saveField("equipmentUsed", jsonArrayString(equipment))}
                    />
                  </TableCell>
                  <TableCell className="py-1 px-1">
                    <input
                      disabled={!canEdit}
                      className="w-full rounded border px-1 py-0.5 text-xs"
                      placeholder="Excavator / Roller / TM"
                      value={r.type || ""}
                      onChange={(e) => {
                        const c = [...equipment];
                        c[i] = { ...c[i], type: e.target.value };
                        setEquipment(c);
                      }}
                      onBlur={() => saveField("equipmentUsed", jsonArrayString(equipment))}
                    />
                  </TableCell>
                  <TableCell className="py-1 px-1">
                    <select
                      disabled={!canEdit}
                      className="w-full rounded border px-1 py-0.5 text-xs"
                      value={r.ownership || "owned"}
                      onChange={(e) => {
                        const c = [...equipment];
                        c[i] = { ...c[i], ownership: e.target.value };
                        setEquipment(c);
                        saveField("equipmentUsed", jsonArrayString(c));
                      }}
                    >
                      <option value="owned">Owned</option>
                      <option value="rented">Rented</option>
                      <option value="subcontractor">Subcontractor</option>
                    </select>
                  </TableCell>
                  <TableCell className="py-1 px-1">
                    <input
                      disabled={!canEdit}
                      type="number"
                      step="0.5"
                      className="w-full rounded border px-1 py-0.5 text-xs text-right font-medium"
                      placeholder="0"
                      value={r.workingHours || 0}
                      onChange={(e) => {
                        const c = [...equipment];
                        c[i] = { ...c[i], workingHours: parseFloat(e.target.value) || 0 };
                        setEquipment(c);
                      }}
                      onBlur={() => saveField("equipmentUsed", jsonArrayString(equipment))}
                    />
                  </TableCell>
                  <TableCell className="py-1 px-1">
                    <input
                      disabled={!canEdit}
                      type="number"
                      step="any"
                      className="w-full rounded border px-1 py-0.5 text-xs text-right"
                      placeholder="0"
                      value={r.fuel || 0}
                      onChange={(e) => {
                        const c = [...equipment];
                        c[i] = { ...c[i], fuel: parseFloat(e.target.value) || 0 };
                        setEquipment(c);
                      }}
                      onBlur={() => saveField("equipmentUsed", jsonArrayString(equipment))}
                    />
                  </TableCell>
                  {canEdit && (
                    <TableCell className="py-1 px-1">
                      <button
                        onClick={() => {
                          const updated = equipment.filter((_, j) => j !== i);
                          setEquipment(updated);
                          saveField("equipmentUsed", jsonArrayString(updated));
                        }}
                        className="text-muted-foreground hover:text-destructive text-xs"
                      >
                        ✕
                      </button>
                    </TableCell>
                  )}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
