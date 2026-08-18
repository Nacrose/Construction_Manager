"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc-client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Lock, Unlock, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

function npr(n: number) { return "NPR " + n.toLocaleString("en-IN", { maximumFractionDigits: 0 }); }

export function RetentionTab({ projectId }: { projectId: string }) {
  const utils = trpc.useUtils();
  const { data, isLoading } = trpc.projectOps.payment.retentionSummary.useQuery({ projectId });
  const [releaseFor, setReleaseFor] = useState<string | null>(null);
  const [releaseAmount, setReleaseAmount] = useState("");

  const releaseMut = trpc.projectOps.payment.releaseRetention.useMutation({
    onSuccess: () => {
      utils.projectOps.payment.retentionSummary.invalidate({ projectId });
      utils.projectOps.payment.list.invalidate({ projectId });
      utils.projectOps.payment.stats.invalidate({ projectId });
      setReleaseFor(null);
      setReleaseAmount("");
      toast.success("Retention released");
    },
    onError: (e) => toast.error(e.message),
  });

  if (isLoading) return <Skeleton className="h-64" />;

  const rows = data?.rows ?? [];
  const totals = data?.totals;

  if (rows.length === 0) {
    return (
      <Card><CardContent className="flex flex-col items-center justify-center py-16 text-center">
        <Lock className="h-12 w-12 text-muted-foreground/40 mb-3" />
        <p className="text-sm text-muted-foreground">No subcontractors with retention data.</p>
        <p className="text-xs text-muted-foreground mt-1">Retention is automatically tracked when IPCs are created for subcontractors.</p>
      </CardContent></Card>
    );
  }

  return (
    <>
      {totals && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <Card className="p-3 text-center">
            <div className="text-lg font-bold text-amber-600">{npr(totals.totalHeld)}</div>
            <div className="text-[9px] text-muted-foreground uppercase">Currently Held</div>
          </Card>
          <Card className="p-3 text-center">
            <div className="text-lg font-bold text-emerald-600">{npr(totals.totalReleased)}</div>
            <div className="text-[9px] text-muted-foreground uppercase">Released to Date</div>
          </Card>
          <Card className="p-3 text-center">
            <div className="text-lg font-bold text-blue-600">{npr(totals.totalIpcRetention)}</div>
            <div className="text-[9px] text-muted-foreground uppercase">Total IPC Retention</div>
          </Card>
          <Card className="p-3 text-center">
            <div className="text-lg font-bold text-slate-600">{totals.subcontractorCount}</div>
            <div className="text-[9px] text-muted-foreground uppercase">Subcontractors</div>
          </Card>
        </div>
      )}

      <div className="rounded-md border overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-muted/30">
            <tr>
              <th className="p-2 text-left font-medium text-muted-foreground">Subcontractor</th>
              <th className="p-2 text-right font-medium text-muted-foreground">Contract Value</th>
              <th className="p-2 text-right font-medium text-muted-foreground">IPC Retention</th>
              <th className="p-2 text-right font-medium text-muted-foreground">Released</th>
              <th className="p-2 text-right font-medium text-muted-foreground">Held</th>
              <th className="p-2 text-center font-medium text-muted-foreground">Action</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.subcontractorId} className="border-t hover:bg-muted/20">
                <td className="p-2 font-medium">{r.subcontractorName}</td>
                <td className="p-2 text-right tabular-nums">{npr(r.contractValue)}</td>
                <td className="p-2 text-right tabular-nums text-blue-600">{npr(r.ipcRetention)}</td>
                <td className="p-2 text-right tabular-nums text-emerald-600">{npr(r.released)}</td>
                <td className={cn("p-2 text-right tabular-nums font-bold", r.held > 0 ? "text-amber-600" : "text-muted-foreground")}>
                  {npr(r.held)}
                </td>
                <td className="p-2 text-center">
                  {r.held > 0 ? (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-6 text-[10px]"
                      onClick={() => { setReleaseFor(r.subcontractorId); setReleaseAmount(r.held.toFixed(2)); }}
                    >
                      <Unlock className="h-3 w-3 mr-1" /> Release
                    </Button>
                  ) : (
                    <span className="text-[10px] text-muted-foreground">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Dialog open={!!releaseFor} onOpenChange={(o) => !o && setReleaseFor(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Release Retention</DialogTitle>
            <DialogDescription>Record a payment that releases held retention back to the subcontractor.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Amount to Release (NPR)</Label>
              <Input
                type="number"
                value={releaseAmount}
                onChange={(e) => setReleaseAmount(e.target.value)}
                className="h-9 text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Payment Mode</Label>
              <Select defaultValue="bank_transfer">
                <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">Cash</SelectItem>
                  <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                  <SelectItem value="cheque">Cheque</SelectItem>
                  <SelectItem value="mobile_pay">Mobile Pay</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReleaseFor(null)}>Cancel</Button>
            <Button
              onClick={() => {
                if (!releaseFor || !releaseAmount) return;
                releaseMut.mutate({
                  projectId,
                  subcontractorId: releaseFor,
                  amount: parseFloat(releaseAmount) || 0,
                });
              }}
              disabled={releaseMut.isPending || !releaseAmount}
            >
              {releaseMut.isPending && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
              Release Retention
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
