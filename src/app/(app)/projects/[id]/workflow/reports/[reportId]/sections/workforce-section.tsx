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
import { Users, Copy } from "lucide-react";
import { jsonArrayString } from "./types";

export function WorkforceSection({
  workforce,
  setWorkforce,
  canEdit,
  copying,
  onCopyFromPrevious,
  saveField,
}: {
  workforce: any[];
  setWorkforce: (val: any[]) => void;
  canEdit: boolean;
  copying: boolean;
  onCopyFromPrevious: (section: "workforce") => void;
  saveField: (field: string, val: any) => void | Promise<void>;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <Users className="h-4 w-4 text-success" /> Workforce & Manpower Log
        </h3>
        <div className="flex items-center gap-2">
          {canEdit && (
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs gap-1"
              onClick={() => onCopyFromPrevious("workforce")}
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
                  ...workforce,
                  {
                    company: "",
                    trade: "",
                    skill: "skilled",
                    headcount: 0,
                    regHours: 8,
                    otHours: 0,
                  },
                ];
                setWorkforce(updated);
                saveField("workforce", jsonArrayString(updated));
              }}
            >
              + Add Row
            </Button>
          )}
        </div>
      </div>

      <div className="rounded-md border bg-card overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="h-7 text-[10px]">Company / Subcontractor</TableHead>
              <TableHead className="h-7 text-[10px]">Trade / Role</TableHead>
              <TableHead className="h-7 text-[10px] w-20">Skill Level</TableHead>
              <TableHead className="h-7 text-[10px] w-14 text-right">Headcount</TableHead>
              <TableHead className="h-7 text-[10px] w-14 text-right">Reg Hrs</TableHead>
              <TableHead className="h-7 text-[10px] w-14 text-right">OT Hrs</TableHead>
              {canEdit && <TableHead className="h-7 w-6"></TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {workforce.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={canEdit ? 7 : 6}
                  className="py-6 text-center text-xs text-muted-foreground"
                >
                  No workforce entries. Click &quot;Copy Previous&quot; or &quot;+ Add
                  Row&quot;.
                </TableCell>
              </TableRow>
            ) : (
              workforce.map((r, i) => (
                <TableRow key={i}>
                  <TableCell className="py-1 px-1">
                    <input
                      disabled={!canEdit}
                      className="w-full rounded border px-1 py-0.5 text-xs"
                      placeholder="Contractor Team / Subcontractor"
                      value={r.company || ""}
                      onChange={(e) => {
                        const c = [...workforce];
                        c[i] = { ...c[i], company: e.target.value };
                        setWorkforce(c);
                      }}
                      onBlur={() => saveField("workforce", jsonArrayString(workforce))}
                    />
                  </TableCell>
                  <TableCell className="py-1 px-1">
                    <input
                      disabled={!canEdit}
                      className="w-full rounded border px-1 py-0.5 text-xs"
                      placeholder="Mason / Carpenter / Driver"
                      value={r.trade || ""}
                      onChange={(e) => {
                        const c = [...workforce];
                        c[i] = { ...c[i], trade: e.target.value };
                        setWorkforce(c);
                      }}
                      onBlur={() => saveField("workforce", jsonArrayString(workforce))}
                    />
                  </TableCell>
                  <TableCell className="py-1 px-1">
                    <select
                      disabled={!canEdit}
                      className="w-full rounded border px-1 py-0.5 text-xs"
                      value={r.skill || "skilled"}
                      onChange={(e) => {
                        const c = [...workforce];
                        c[i] = { ...c[i], skill: e.target.value };
                        setWorkforce(c);
                        saveField("workforce", jsonArrayString(c));
                      }}
                    >
                      <option value="unskilled">Unskilled</option>
                      <option value="semi-skilled">Semi-skilled</option>
                      <option value="skilled">Skilled</option>
                      <option value="supervisory">Supervisory</option>
                    </select>
                  </TableCell>
                  <TableCell className="py-1 px-1">
                    <input
                      disabled={!canEdit}
                      type="number"
                      className="w-full rounded border px-1 py-0.5 text-xs text-right font-medium"
                      placeholder="0"
                      value={r.headcount || 0}
                      onChange={(e) => {
                        const c = [...workforce];
                        c[i] = { ...c[i], headcount: parseInt(e.target.value) || 0 };
                        setWorkforce(c);
                      }}
                      onBlur={() => saveField("workforce", jsonArrayString(workforce))}
                    />
                  </TableCell>
                  <TableCell className="py-1 px-1">
                    <input
                      disabled={!canEdit}
                      type="number"
                      step="0.5"
                      className="w-full rounded border px-1 py-0.5 text-xs text-right"
                      placeholder="8"
                      value={r.regHours || 8}
                      onChange={(e) => {
                        const c = [...workforce];
                        c[i] = { ...c[i], regHours: parseFloat(e.target.value) || 0 };
                        setWorkforce(c);
                      }}
                      onBlur={() => saveField("workforce", jsonArrayString(workforce))}
                    />
                  </TableCell>
                  <TableCell className="py-1 px-1">
                    <input
                      disabled={!canEdit}
                      type="number"
                      step="0.5"
                      className="w-full rounded border px-1 py-0.5 text-xs text-right"
                      placeholder="0"
                      value={r.otHours || 0}
                      onChange={(e) => {
                        const c = [...workforce];
                        c[i] = { ...c[i], otHours: parseFloat(e.target.value) || 0 };
                        setWorkforce(c);
                      }}
                      onBlur={() => saveField("workforce", jsonArrayString(workforce))}
                    />
                  </TableCell>
                  {canEdit && (
                    <TableCell className="py-1 px-1">
                      <button
                        onClick={() => {
                          const updated = workforce.filter((_, j) => j !== i);
                          setWorkforce(updated);
                          saveField("workforce", jsonArrayString(updated));
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
