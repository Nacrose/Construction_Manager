"use client";

import {useState, Fragment} from "react";
import {Card} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Plus,
  Loader2,
  Inbox,
  Check,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { trpc } from "@/lib/trpc-client";


export function BoqVersionsTab({ projectId, canWrite }: { projectId: string; canWrite: boolean }) {
  const utils = trpc.useUtils();
  const [selectedVersion, setSelectedVersion] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [diffVersion, setDiffVersion] = useState<string | null>(null);

  const { data, isLoading } = trpc.boqVersion.list.useQuery({ projectId });

  const { data: versionDetail } = trpc.boqVersion.get.useQuery(
    { projectId, versionId: selectedVersion! },
    { enabled: !!selectedVersion }
  );

  const { data: diffData } = trpc.boqVersion.diff.useQuery(
    { projectId, versionId: selectedVersion!, vsVersionId: diffVersion ?? undefined },
    { enabled: !!selectedVersion }
  );

  const createVersion = trpc.boqVersion.create.useMutation({
    onSuccess: () => {
      utils.boqVersion.list.invalidate({ projectId });
      toast.success("Version created");
      setShowCreate(false); setNotes("");
    },
    onError: (e) => toast.error(e.message),
  });

  const approveVersion = trpc.boqVersion.approve.useMutation({
    onSuccess: () => {
      utils.boqVersion.list.invalidate({ projectId });
      utils.boqVersion.get.invalidate({ projectId, versionId: selectedVersion! });
      toast.success("Version approved");
    },
    onError: (e) => toast.error(e.message),
  });

  const fmt = (n: number) => n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold">BOQ Snapshots</h3>
          <p className="text-sm text-muted-foreground">
            Snapshots of the BOQ at different points in time. V1 = original contract. New versions are created when
            Variation Orders are processed or on demand.
          </p>
        </div>
        {canWrite && (
          <div className="flex items-center gap-2">
            {!showCreate ? (
              <Button size="sm" onClick={() => setShowCreate(true)} className="gap-1">
                <Plus className="h-3.5 w-3.5" /> Create Snapshot
              </Button>
            ) : (
              <div className="flex items-center gap-1">
                <input
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Notes for this version..."
                  className="h-8 w-56 rounded border bg-background px-2 text-xs"
                  onKeyDown={(e) => { if (e.key === "Enter") createVersion.mutate({ projectId, notes: notes || undefined }); }}
                />
                <Button size="sm" disabled={createVersion.isPending} onClick={() => createVersion.mutate({ projectId, notes: notes || undefined })}>
                  {createVersion.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => { setShowCreate(false); setNotes(""); }}>
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
            )}
          </div>
        )}
      </div>

      {isLoading ? (
        <Skeleton className="h-20" />
      ) : data && data.versions.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {data.versions.map((v) => (
            <Button
              key={v.id}
              variant={selectedVersion === v.id ? "default" : "outline"}
              size="sm"
              onClick={() => { setSelectedVersion(v.id); setDiffVersion(null); }}
              className="gap-1"
            >
              V{v.versionNumber}
              <Badge variant={v.status === "approved" ? "default" : "secondary"} className="text-[9px]">
                {v.status}
              </Badge>
              <span className="text-[10px] text-muted-foreground">({v._count.items})</span>
            </Button>
          ))}
        </div>
      ) : (
        <Card className="flex flex-col items-center gap-3 p-12 text-center">
          <Inbox className="h-12 w-12 text-muted-foreground" />
          <p className="font-medium">No versions yet</p>
          <p className="text-sm text-muted-foreground">
            Create a snapshot to save the current state of the BOQ.
          </p>
        </Card>
      )}

      {versionDetail && (
        <Card>
          <div className="flex items-center justify-between border-b px-4 py-2">
            <div className="text-sm font-semibold">
              V{versionDetail.versionNumber}
              <span className="ml-2 text-xs font-normal text-muted-foreground">
                {versionDetail.notes && `— ${versionDetail.notes}`}
              </span>
            </div>
            <div className="flex items-center gap-2">
              {versionDetail.status === "draft" && canWrite && (
                <Button size="sm" variant="outline" className="text-xs h-7" onClick={() => { if (confirm("Approve this version?")) approveVersion.mutate({ projectId, versionId: versionDetail.id }); }}>
                  <Check className="mr-1 h-3 w-3" /> Approve
                </Button>
              )}
              <span className="text-[10px] text-muted-foreground">
                {new Date(versionDetail.createdAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
              </span>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs font-mono tabular-nums">
              <thead className="sticky top-0 z-10 bg-muted/90 text-primary border-b border-border/80 font-mono">
                <tr className="border-b border-border/40 text-[11px] font-mono font-bold uppercase tracking-wider text-primary">
                  <th className="px-3 py-2 text-left">Code</th>
                  <th className="px-3 py-2 text-left">Description</th>
                  <th className="px-3 py-2 text-left">Unit</th>
                  <th className="px-3 py-2 text-right">Qty</th>
                  <th className="px-3 py-2 text-right">Rate</th>
                  <th className="px-3 py-2 text-right">Amount</th>
                  {versionDetail.status === "draft" && (
                    <th className="px-3 py-2 text-right text-sky-400">Diff (vs V1)</th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40 font-mono text-xs">
                {versionDetail.items.map((item: any) => (
                  <tr key={item.id} className="border-b border-border/30 hover:bg-primary/5 transition-colors">
                    <td className="px-3 py-1.5 font-bold text-primary">{item.code}</td>
                    <td className="px-3 py-1.5 truncate max-w-xs text-foreground">{item.description}</td>
                    <td className="px-3 py-1.5 text-muted-foreground">{item.unit}</td>
                    <td className="px-3 py-1.5 text-right font-medium text-foreground">{item.quantity}</td>
                    <td className="px-3 py-1.5 text-right font-medium text-foreground">{fmt(item.rate)}</td>
                    <td className="px-3 py-1.5 text-right font-bold text-foreground">{fmt(item.amount)}</td>
                    {versionDetail.status === "draft" && (
                      <td className="px-3 py-1.5 text-right text-xs">
                        {item.baselineQty !== null && item.baselineRate !== null && (
                          <>
                            {item.quantity !== item.baselineQty && (
                              <span className={item.quantity > item.baselineQty ? "text-emerald-400 font-bold" : "text-red-400 font-bold"}>
                                qty: {item.quantity > item.baselineQty ? "+" : ""}{(item.quantity - item.baselineQty).toFixed(3)}
                              </span>
                            )}
                            {item.rate !== item.baselineRate && (
                              <span className={`ml-2 font-bold ${item.rate > item.baselineRate ? "text-emerald-400" : "text-red-400"}`}>
                                rate: {item.rate > item.baselineRate ? "+" : ""}{fmt(item.rate - item.baselineRate)}
                              </span>
                            )}
                            {item.quantity === item.baselineQty && item.rate === item.baselineRate && (
                              <span className="text-muted-foreground italic text-[10px]">unchanged</span>
                            )}
                          </>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
              {versionDetail.items.length > 0 && (
                <tfoot>
                  <tr className="border-t-2 border-border/60 bg-muted/30 font-bold font-mono text-xs">
                    <td colSpan={3} className="px-3 py-2 text-right text-muted-foreground">Total:</td>
                    <td className="px-3 py-2 text-right text-foreground">{versionDetail.items.reduce((s: number, i: any) => s + i.quantity, 0)}</td>
                    <td></td>
                    <td className="px-3 py-2 text-right text-primary font-bold">{fmt(versionDetail.items.reduce((s: number, i: any) => s + i.amount, 0))}</td>
                    {versionDetail.status === "draft" && <td></td>}
                  </tr>
                </tfoot>
              )}
            </table>
          </div>

          {diffData && selectedVersion && (
            <div className="border-t">
              <div className="flex items-center gap-2 bg-muted/40 px-4 py-2 text-xs font-mono">
                <span className="font-bold text-primary">Compare {diffData.leftLabel} vs {diffData.rightLabel}:</span>
                {data && data.versions.length > 1 && (
                  <select
                    value={diffVersion ?? ""}
                    onChange={(e) => setDiffVersion(e.target.value || null)}
                    className="h-6 rounded border bg-background px-1 text-xs font-mono"
                  >
                    <option value="">vs Current BOQ</option>
                    {data.versions.filter((v) => v.id !== selectedVersion).map((v) => (
                      <option key={v.id} value={v.id}>vs V{v.versionNumber}</option>
                    ))}
                  </select>
                )}
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs font-mono tabular-nums">
                  <thead className="sticky top-0 z-10 bg-muted/90 text-primary border-b border-border/80 font-mono">
                    <tr className="border-b border-border/40 text-[11px] font-mono font-bold uppercase tracking-wider text-primary">
                      <th className="px-3 py-2 text-left">Code</th>
                      <th className="px-3 py-2 text-left">Description</th>
                      <th className="px-3 py-2 text-left">Unit</th>
                      <th className="px-3 py-2 text-right">{diffData.leftLabel} Qty</th>
                      <th className="px-3 py-2 text-right">{diffData.rightLabel} Qty</th>
                      <th className="px-3 py-2 text-right">Qty Δ</th>
                      <th className="px-3 py-2 text-right">{diffData.leftLabel} Rate</th>
                      <th className="px-3 py-2 text-right">{diffData.rightLabel} Rate</th>
                      <th className="px-3 py-2 text-right">Rate Δ</th>
                      <th className="px-3 py-2 text-right">Amount Δ</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/40 font-mono text-xs">
                    {diffData.diffRows
                      .filter((r) => r.qtyDiff !== 0 || r.rateDiff !== 0 || r.amountDiff !== 0)
                      .map((r) => (
                        <tr key={r.code} className="border-b hover:bg-muted/10">
                          <td className="p-2 font-mono text-[10px]">{r.code}</td>
                          <td className="p-2 truncate max-w-[200px]">{r.description}</td>
                          <td className="p-2 text-muted-foreground">{r.unit}</td>
                          <td className="p-2 text-right">{r.leftQty.toFixed(3)}</td>
                          <td className="p-2 text-right">{r.rightQty.toFixed(3)}</td>
                          <td className={`p-2 text-right ${r.qtyDiff > 0 ? "text-emerald-600" : r.qtyDiff < 0 ? "text-red-600" : ""}`}>
                            {r.qtyDiff > 0 ? "+" : ""}{r.qtyDiff.toFixed(3) || "—"}
                          </td>
                          <td className="p-2 text-right">{fmt(r.leftRate)}</td>
                          <td className="p-2 text-right">{fmt(r.rightRate)}</td>
                          <td className={`p-2 text-right ${r.rateDiff > 0 ? "text-emerald-600" : r.rateDiff < 0 ? "text-red-600" : ""}`}>
                            {r.rateDiff > 0 ? "+" : ""}{r.rateDiff ? fmt(r.rateDiff) : "—"}
                          </td>
                          <td className={`p-2 text-right font-medium ${r.amountDiff > 0 ? "text-emerald-600" : r.amountDiff < 0 ? "text-red-600" : ""}`}>
                            {r.amountDiff > 0 ? "+" : ""}{r.amountDiff ? fmt(r.amountDiff) : "—"}
                          </td>
                        </tr>
                      ))}
                    {diffData.diffRows.filter((r) => r.qtyDiff !== 0 || r.rateDiff !== 0).length === 0 && (
                      <tr><td colSpan={10} className="p-4 text-center text-muted-foreground">No changes between these versions.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
