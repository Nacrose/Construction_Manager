"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ListChecks, Loader2, RefreshCw, FileQuestion } from "lucide-react";
import { cn } from "@/lib/utils";
import { jsonArrayString } from "./types";
import { CreateRfiFromProgressDialog } from "../dialogs/create-rfi-from-progress-dialog";

export function ProgressSection({
  projectId,
  progress,
  setProgress,
  canEdit,
  syncing,
  onSyncFromProgram,
  saveField,
}: {
  projectId: string;
  progress: any[];
  setProgress: (val: any[]) => void;
  canEdit: boolean;
  syncing: boolean;
  onSyncFromProgram: () => void;
  saveField: (field: string, val: any) => void | Promise<void>;
}) {
  const [rfiDialogRow, setRfiDialogRow] = useState<number | null>(null);
  const [rfiDialogData, setRfiDialogData] = useState<any>(null);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <ListChecks className="h-4 w-4 text-emerald-600" /> Plan vs. Actual Work Progress
          </h3>
          <p className="text-[11px] text-muted-foreground">
            Track Batched / Dispatched volume vs. Payable IPC measured volume with live yield
            variance.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs gap-1"
            onClick={onSyncFromProgram}
            disabled={syncing || !canEdit}
          >
            {syncing ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <RefreshCw className="h-3 w-3" />
            )}
            Sync from Daily Program
          </Button>
          {canEdit && (
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs"
              onClick={() => {
                const updated = [
                  ...progress,
                  {
                    boqCode: "",
                    boqDesc: "",
                    location: "",
                    plannedQty: 0,
                    actualQty: 0,
                    batchedQty: 0,
                    payableQty: 0,
                    unit: "",
                  },
                ];
                setProgress(updated);
                saveField("workProgress", jsonArrayString(updated));
              }}
            >
              + Add Item
            </Button>
          )}
        </div>
      </div>

      <div className="rounded-md border bg-card overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="h-7 text-[10px] w-16">BOQ</TableHead>
              <TableHead className="h-7 text-[10px]">Task Description</TableHead>
              <TableHead className="h-7 text-[10px] w-16">Location</TableHead>
              <TableHead className="h-7 text-[10px] w-14 text-right">Plan</TableHead>
              <TableHead className="h-7 text-[10px] w-16 text-right">Batched / Placed</TableHead>
              <TableHead className="h-7 text-[10px] w-16 text-right text-emerald-700 dark:text-emerald-400">
                Payable (IPC)
              </TableHead>
              <TableHead className="h-7 text-[10px] w-24 text-center">
                Yield / Wastage
              </TableHead>
              <TableHead className="h-7 text-[10px] w-12">Unit</TableHead>
              <TableHead className="h-7 text-[10px] w-20 text-center">RFI</TableHead>
              {canEdit && <TableHead className="h-7 w-6"></TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {progress.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={canEdit ? 10 : 9}
                  className="py-6 text-center text-xs text-muted-foreground"
                >
                  No work progress entries yet. Click &quot;Sync from Daily Program&quot; or
                  &quot;+ Add Item&quot;.
                </TableCell>
              </TableRow>
            ) : (
              progress.map((r, i) => {
                const batched = Number(r.batchedQty) || Number(r.actualQty) || 0;
                const payable =
                  r.payableQty !== undefined && r.payableQty !== null
                    ? Number(r.payableQty)
                    : batched;
                const diff = batched - payable;
                const diffPct = payable > 0 ? (diff / payable) * 100 : 0;

                return (
                  <TableRow key={i}>
                    <TableCell className="py-1 px-1">
                      <input
                        disabled={!canEdit}
                        className="w-full rounded border px-1 py-0.5 text-xs font-mono"
                        placeholder="1.1"
                        value={r.boqCode || ""}
                        onChange={(e) => {
                          const c = [...progress];
                          c[i] = { ...c[i], boqCode: e.target.value };
                          setProgress(c);
                        }}
                        onBlur={() => saveField("workProgress", jsonArrayString(progress))}
                      />
                    </TableCell>
                    <TableCell className="py-1 px-1">
                      <input
                        disabled={!canEdit}
                        className="w-full rounded border px-1 py-0.5 text-xs"
                        placeholder="Excavation / Concrete Pour"
                        value={r.boqDesc || ""}
                        onChange={(e) => {
                          const c = [...progress];
                          c[i] = { ...c[i], boqDesc: e.target.value };
                          setProgress(c);
                        }}
                        onBlur={() => saveField("workProgress", jsonArrayString(progress))}
                      />
                    </TableCell>
                    <TableCell className="py-1 px-1">
                      <input
                        disabled={!canEdit}
                        className="w-full rounded border px-1 py-0.5 text-xs"
                        placeholder="Km 0+500"
                        value={r.location || ""}
                        onChange={(e) => {
                          const c = [...progress];
                          c[i] = { ...c[i], location: e.target.value };
                          setProgress(c);
                        }}
                        onBlur={() => saveField("workProgress", jsonArrayString(progress))}
                      />
                    </TableCell>
                    <TableCell className="py-1 px-1">
                      <input
                        disabled={!canEdit}
                        type="number"
                        step="any"
                        className="w-full rounded border px-1 py-0.5 text-xs text-right"
                        placeholder="0"
                        value={r.plannedQty || 0}
                        onChange={(e) => {
                          const c = [...progress];
                          c[i] = { ...c[i], plannedQty: parseFloat(e.target.value) || 0 };
                          setProgress(c);
                        }}
                        onBlur={() => saveField("workProgress", jsonArrayString(progress))}
                      />
                    </TableCell>
                    <TableCell className="py-1 px-1">
                      <input
                        disabled={!canEdit}
                        type="number"
                        step="any"
                        className="w-full rounded border px-1 py-0.5 text-xs text-right font-medium"
                        placeholder="0"
                        value={r.batchedQty !== undefined ? r.batchedQty : r.actualQty || 0}
                        onChange={(e) => {
                          const val = parseFloat(e.target.value) || 0;
                          const c = [...progress];
                          c[i] = {
                            ...c[i],
                            batchedQty: val,
                            actualQty: val,
                            payableQty:
                              c[i].payableQty !== undefined ? c[i].payableQty : val,
                          };
                          setProgress(c);
                        }}
                        onBlur={() => saveField("workProgress", jsonArrayString(progress))}
                      />
                    </TableCell>
                    <TableCell className="py-1 px-1">
                      <input
                        disabled={!canEdit}
                        type="number"
                        step="any"
                        className="w-full rounded border px-1 py-0.5 text-xs text-right font-medium text-emerald-700 dark:text-emerald-400"
                        placeholder="0"
                        value={r.payableQty !== undefined ? r.payableQty : r.actualQty || 0}
                        onChange={(e) => {
                          const c = [...progress];
                          c[i] = { ...c[i], payableQty: parseFloat(e.target.value) || 0 };
                          setProgress(c);
                        }}
                        onBlur={() => saveField("workProgress", jsonArrayString(progress))}
                      />
                    </TableCell>
                    <TableCell className="py-1 px-1 text-center">
                      {batched > 0 || payable > 0 ? (
                        <span
                          className={cn(
                            "text-[10px] font-mono font-medium px-1.5 py-0.5 rounded",
                            diff > 0
                              ? "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300"
                              : diff < 0
                                ? "bg-info/15 text-info dark:bg-[var(--navy-deep)]/40 dark:text-info/80"
                                : "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
                          )}
                        >
                          {diff > 0
                            ? `+${diff.toFixed(2)} (${diffPct.toFixed(1)}% waste)`
                            : diff < 0
                              ? `${diff.toFixed(2)} (saving)`
                              : "100% (exact)"}
                        </span>
                      ) : (
                        <span className="text-[10px] text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="py-1 px-1">
                      <input
                        disabled={!canEdit}
                        className="w-full rounded border px-1 py-0.5 text-xs"
                        placeholder="cum"
                        value={r.unit || ""}
                        onChange={(e) => {
                          const c = [...progress];
                          c[i] = { ...c[i], unit: e.target.value };
                          setProgress(c);
                        }}
                        onBlur={() => saveField("workProgress", jsonArrayString(progress))}
                      />
                    </TableCell>
                    <TableCell className="py-1 px-1 text-center">
                      {r.rfiId ? (
                        <Link
                          href={`/projects/${projectId}/workflow/rfi`}
                          className="text-[10px] font-mono text-primary underline hover:text-primary/80"
                          title={r.rfiNumber || "View RFI"}
                        >
                          {r.rfiNumber || "RFI"}
                        </Link>
                      ) : canEdit ? (
                        <button
                          onClick={() => {
                            setRfiDialogRow(i);
                            setRfiDialogData({
                              boqCode: r.boqCode,
                              boqDesc: r.boqDesc,
                              location: r.location,
                              taskDescription: r.boqDesc,
                            });
                          }}
                          className="inline-flex items-center gap-0.5 text-[10px] text-muted-foreground hover:text-primary px-1 py-0.5 rounded hover:bg-primary/5"
                          title="Create RFI from this row"
                        >
                          <FileQuestion className="h-3 w-3" />
                          RFI
                        </button>
                      ) : (
                        <span className="text-[10px] text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    {canEdit && (
                      <TableCell className="py-1 px-1">
                        <button
                          onClick={() => {
                            const updated = progress.filter((_, j) => j !== i);
                            setProgress(updated);
                            saveField("workProgress", jsonArrayString(updated));
                          }}
                          className="text-muted-foreground hover:text-destructive text-xs"
                        >
                          ✕
                        </button>
                      </TableCell>
                    )}
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {rfiDialogRow !== null && rfiDialogData && (
        <CreateRfiFromProgressDialog
          projectId={projectId}
          progress={rfiDialogData}
          onClose={() => { setRfiDialogRow(null); setRfiDialogData(null); }}
          onRfiCreated={(rfiId, rfiNumber) => {
            const updated = [...progress];
            updated[rfiDialogRow] = { ...updated[rfiDialogRow], rfiId, rfiNumber };
            setProgress(updated);
            saveField("workProgress", jsonArrayString(updated));
            setRfiDialogRow(null);
            setRfiDialogData(null);
          }}
        />
      )}
    </div>
  );
}
