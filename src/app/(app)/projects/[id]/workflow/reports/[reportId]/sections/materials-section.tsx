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
import { Package } from "lucide-react";
import { jsonArrayString } from "./types";

export function MaterialsSection({
  materials,
  setMaterials,
  canEdit,
  saveField,
}: {
  materials: any[];
  setMaterials: (val: any[]) => void;
  canEdit: boolean;
  saveField: (field: string, val: any) => void | Promise<void>;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <Package className="h-4 w-4 text-emerald-600" /> Materials Received On Site
        </h3>
        {canEdit && (
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs"
            onClick={() => {
              const updated = [
                ...materials,
                {
                  name: "",
                  qty: 0,
                  unit: "cum",
                  supplier: "",
                  vehicle: "",
                  testStatus: "pending",
                },
              ];
              setMaterials(updated);
              saveField("materialReceived", jsonArrayString(updated));
            }}
          >
            + Add Material Inward
          </Button>
        )}
      </div>

      <div className="rounded-md border bg-card overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="h-7 text-[10px]">Material Description</TableHead>
              <TableHead className="h-7 text-[10px] w-20 text-right">Quantity</TableHead>
              <TableHead className="h-7 text-[10px] w-14">Unit</TableHead>
              <TableHead className="h-7 text-[10px] w-28">Supplier</TableHead>
              <TableHead className="h-7 text-[10px] w-24">Vehicle / Challan</TableHead>
              <TableHead className="h-7 text-[10px] w-24">QA Test Status</TableHead>
              {canEdit && <TableHead className="h-7 w-6"></TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {materials.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={canEdit ? 7 : 6}
                  className="py-6 text-center text-xs text-muted-foreground"
                >
                  No materials received logged today.
                </TableCell>
              </TableRow>
            ) : (
              materials.map((r, i) => (
                <TableRow key={i}>
                  <TableCell className="py-1 px-1">
                    <input
                      disabled={!canEdit}
                      className="w-full rounded border px-1 py-0.5 text-xs"
                      placeholder="Cement / 20mm Aggregate / Rebar"
                      value={r.name || ""}
                      onChange={(e) => {
                        const c = [...materials];
                        c[i] = { ...c[i], name: e.target.value };
                        setMaterials(c);
                      }}
                      onBlur={() => saveField("materialReceived", jsonArrayString(materials))}
                    />
                  </TableCell>
                  <TableCell className="py-1 px-1">
                    <input
                      disabled={!canEdit}
                      type="number"
                      step="any"
                      className="w-full rounded border px-1 py-0.5 text-xs text-right font-medium"
                      placeholder="0"
                      value={r.qty || 0}
                      onChange={(e) => {
                        const c = [...materials];
                        c[i] = { ...c[i], qty: parseFloat(e.target.value) || 0 };
                        setMaterials(c);
                      }}
                      onBlur={() => saveField("materialReceived", jsonArrayString(materials))}
                    />
                  </TableCell>
                  <TableCell className="py-1 px-1">
                    <input
                      disabled={!canEdit}
                      className="w-full rounded border px-1 py-0.5 text-xs"
                      placeholder="bag / cum / MT"
                      value={r.unit || ""}
                      onChange={(e) => {
                        const c = [...materials];
                        c[i] = { ...c[i], unit: e.target.value };
                        setMaterials(c);
                      }}
                      onBlur={() => saveField("materialReceived", jsonArrayString(materials))}
                    />
                  </TableCell>
                  <TableCell className="py-1 px-1">
                    <input
                      disabled={!canEdit}
                      className="w-full rounded border px-1 py-0.5 text-xs"
                      placeholder="Supplier name"
                      value={r.supplier || ""}
                      onChange={(e) => {
                        const c = [...materials];
                        c[i] = { ...c[i], supplier: e.target.value };
                        setMaterials(c);
                      }}
                      onBlur={() => saveField("materialReceived", jsonArrayString(materials))}
                    />
                  </TableCell>
                  <TableCell className="py-1 px-1">
                    <input
                      disabled={!canEdit}
                      className="w-full rounded border px-1 py-0.5 text-xs"
                      placeholder="Ba 2 Kha 1234"
                      value={r.vehicle || ""}
                      onChange={(e) => {
                        const c = [...materials];
                        c[i] = { ...c[i], vehicle: e.target.value };
                        setMaterials(c);
                      }}
                      onBlur={() => saveField("materialReceived", jsonArrayString(materials))}
                    />
                  </TableCell>
                  <TableCell className="py-1 px-1">
                    <select
                      disabled={!canEdit}
                      className="w-full rounded border px-1 py-0.5 text-xs"
                      value={r.testStatus || "pending"}
                      onChange={(e) => {
                        const c = [...materials];
                        c[i] = { ...c[i], testStatus: e.target.value };
                        setMaterials(c);
                        saveField("materialReceived", jsonArrayString(c));
                      }}
                    >
                      <option value="none">None</option>
                      <option value="pending">Pending Test</option>
                      <option value="passed">Passed</option>
                      <option value="failed">Failed</option>
                    </select>
                  </TableCell>
                  {canEdit && (
                    <TableCell className="py-1 px-1">
                      <button
                        onClick={() => {
                          const updated = materials.filter((_, j) => j !== i);
                          setMaterials(updated);
                          saveField("materialReceived", jsonArrayString(updated));
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
