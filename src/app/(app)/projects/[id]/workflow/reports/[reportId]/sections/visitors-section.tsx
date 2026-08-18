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
import { Users2 } from "lucide-react";
import { jsonArrayString } from "./types";

export function VisitorsSection({
  visitors,
  setVisitors,
  canEdit,
  saveField,
}: {
  visitors: any[];
  setVisitors: (val: any[]) => void;
  canEdit: boolean;
  saveField: (field: string, val: any) => void | Promise<void>;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <Users2 className="h-4 w-4 text-emerald-600" /> Site Visitors & Inspections
        </h3>
        {canEdit && (
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs"
            onClick={() => {
              const updated = [
                ...visitors,
                { visitor: "", organization: "", purpose: "", time: "", notes: "" },
              ];
              setVisitors(updated);
              saveField("siteVisits", jsonArrayString(updated));
            }}
          >
            + Add Visitor
          </Button>
        )}
      </div>

      <div className="rounded-md border bg-card overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="h-7 text-[10px]">Visitor Name</TableHead>
              <TableHead className="h-7 text-[10px] w-32">Organization / Authority</TableHead>
              <TableHead className="h-7 text-[10px]">Purpose of Visit</TableHead>
              <TableHead className="h-7 text-[10px] w-20">Time</TableHead>
              {canEdit && <TableHead className="h-7 w-6"></TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {visitors.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={canEdit ? 5 : 4}
                  className="py-6 text-center text-xs text-muted-foreground"
                >
                  No site visitors recorded today.
                </TableCell>
              </TableRow>
            ) : (
              visitors.map((r, i) => (
                <TableRow key={i}>
                  <TableCell className="py-1 px-1">
                    <input
                      disabled={!canEdit}
                      className="w-full rounded border px-1 py-0.5 text-xs"
                      placeholder="Er. Ramesh Sharma"
                      value={r.visitor || ""}
                      onChange={(e) => {
                        const c = [...visitors];
                        c[i] = { ...c[i], visitor: e.target.value };
                        setVisitors(c);
                      }}
                      onBlur={() => saveField("siteVisits", jsonArrayString(visitors))}
                    />
                  </TableCell>
                  <TableCell className="py-1 px-1">
                    <input
                      disabled={!canEdit}
                      className="w-full rounded border px-1 py-0.5 text-xs"
                      placeholder="Client / DoR / Municipality"
                      value={r.organization || ""}
                      onChange={(e) => {
                        const c = [...visitors];
                        c[i] = { ...c[i], organization: e.target.value };
                        setVisitors(c);
                      }}
                      onBlur={() => saveField("siteVisits", jsonArrayString(visitors))}
                    />
                  </TableCell>
                  <TableCell className="py-1 px-1">
                    <input
                      disabled={!canEdit}
                      className="w-full rounded border px-1 py-0.5 text-xs"
                      placeholder="Site inspection & joint measurement"
                      value={r.purpose || ""}
                      onChange={(e) => {
                        const c = [...visitors];
                        c[i] = { ...c[i], purpose: e.target.value };
                        setVisitors(c);
                      }}
                      onBlur={() => saveField("siteVisits", jsonArrayString(visitors))}
                    />
                  </TableCell>
                  <TableCell className="py-1 px-1">
                    <input
                      disabled={!canEdit}
                      type="time"
                      className="w-full rounded border px-1 py-0.5 text-xs"
                      value={r.time || ""}
                      onChange={(e) => {
                        const c = [...visitors];
                        c[i] = { ...c[i], time: e.target.value };
                        setVisitors(c);
                      }}
                      onBlur={() => saveField("siteVisits", jsonArrayString(visitors))}
                    />
                  </TableCell>
                  {canEdit && (
                    <TableCell className="py-1 px-1">
                      <button
                        onClick={() => {
                          const updated = visitors.filter((_, j) => j !== i);
                          setVisitors(updated);
                          saveField("siteVisits", jsonArrayString(updated));
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
