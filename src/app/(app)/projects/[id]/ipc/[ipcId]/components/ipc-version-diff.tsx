"use client";

import { useState } from "react";
import { Card } from "@/components/ui/card";
import { GitCompare, Loader2 } from "lucide-react";
import { trpc } from "@/lib/trpc-client";

export function IpcVersionDiff({ projectId, boqVersionId, boqVersionNumber }: { projectId: string; boqVersionId: string; boqVersionNumber: number }) {
  const [open, setOpen] = useState(false);
  const { data: diffData, isLoading } = trpc.boqVersion.diff.useQuery(
    { projectId, versionId: boqVersionId },
    { enabled: open },
  );

  const changedRows = diffData?.diffRows.filter((r) => r.qtyDiff !== 0 || r.rateDiff !== 0) ?? [];

  return (
    <Card className="print-card">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between p-4 text-left hover:bg-muted/20 transition-colors"
      >
        <div className="flex items-center gap-2">
          <GitCompare className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">BOQ Changes since V{boqVersionNumber}</span>
          {!open && changedRows.length > 0 && (
            <span className="text-xs text-amber-600 font-medium">({changedRows.length} items changed)</span>
          )}
        </div>
        <span className="text-xs text-muted-foreground">{open ? "Hide" : "Show"} diff</span>
      </button>
      {open && (
        <div className="border-t overflow-x-auto">
          {isLoading ? (
            <div className="flex items-center justify-center p-6">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : diffData && changedRows.length > 0 ? (
            <table className="w-full text-xs">
              <thead className="bg-muted/30 border-b">
                <tr>
                  <th className="p-2 text-left font-medium">Code</th>
                  <th className="p-2 text-left font-medium">Description</th>
                  <th className="p-2 text-right font-medium">V{boqVersionNumber} Qty</th>
                  <th className="p-2 text-right font-medium">Current Qty</th>
                  <th className="p-2 text-right font-medium">Qty Diff</th>
                  <th className="p-2 text-right font-medium">V{boqVersionNumber} Rate</th>
                  <th className="p-2 text-right font-medium">Current Rate</th>
                  <th className="p-2 text-right font-medium">Rate Diff</th>
                </tr>
              </thead>
              <tbody>
                {changedRows.map((row) => (
                  <tr key={row.code} className="border-b hover:bg-muted/10">
                    <td className="p-2 font-mono">{row.code}</td>
                    <td className="p-2">{row.description}</td>
                    <td className="p-2 text-right">{row.leftQty.toLocaleString()}</td>
                    <td className="p-2 text-right">{row.rightQty.toLocaleString()}</td>
                    <td className={`p-2 text-right font-medium ${row.qtyDiff !== 0 ? (row.qtyDiff > 0 ? "text-emerald-600" : "text-red-600") : ""}`}>
                      {row.qtyDiff > 0 ? "+" : ""}{row.qtyDiff.toLocaleString()}
                    </td>
                    <td className="p-2 text-right">{row.leftRate.toLocaleString()}</td>
                    <td className="p-2 text-right">{row.rightRate.toLocaleString()}</td>
                    <td className={`p-2 text-right font-medium ${row.rateDiff !== 0 ? (row.rateDiff > 0 ? "text-emerald-600" : "text-red-600") : ""}`}>
                      {row.rateDiff > 0 ? "+" : ""}{row.rateDiff.toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="p-4 text-sm text-muted-foreground text-center">No changes since version V{boqVersionNumber}.</p>
          )}
        </div>
      )}
    </Card>
  );
}
