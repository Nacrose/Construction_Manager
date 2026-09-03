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
import { formatNpr } from "@/lib/currency";
import { ConstructionTable, ConstructionTableColumn } from "@/components/ui/construction-table";

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

  const rows = data?.rows ?? [];
  const totals = data?.totals;

  const columns: ConstructionTableColumn<any>[] = [
    {
      key: "subcontractorName",
      header: "Subcontractor",
      render: (_, r) => <span className="font-medium text-xs font-sans text-foreground">{r.subcontractorName}</span>,
    },
    {
      key: "contractValue",
      header: "Contract Value",
      align: "right",
      render: (_, r) => <span className="font-mono text-xs">{formatNpr(r.contractValue)}</span>,
    },
    {
      key: "ipcRetention",
      header: "IPC Retention",
      align: "right",
      render: (_, r) => <span className="font-mono text-xs text-info dark:text-info/80 font-medium">{formatNpr(r.ipcRetention)}</span>,
    },
    {
      key: "released",
      header: "Released",
      align: "right",
      render: (_, r) => <span className="font-mono text-xs text-success dark:text-success/80">{formatNpr(r.released)}</span>,
    },
    {
      key: "held",
      header: "Held",
      align: "right",
      render: (_, r) => (
        <span className={cn("font-mono text-xs font-bold", r.held > 0 ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground")}>
          {formatNpr(r.held)}
        </span>
      ),
    },
    {
      key: "action",
      header: "Action",
      align: "center",
      render: (_, r) =>
        r.held > 0 ? (
          <Button
            size="sm"
            variant="outline"
            className="h-6 text-[10px] gap-1 font-mono"
            onClick={() => {
              setReleaseFor(r.subcontractorId);
              setReleaseAmount(r.held.toString());
            }}
          >
            <Unlock className="h-3 w-3 text-amber-500" /> Release
          </Button>
        ) : (
          <span className="text-[10px] text-muted-foreground font-mono">Fully released</span>
        ),
    },
  ];

  return (
    <div className="space-y-4">
      {totals && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <Card className="p-3 text-center bg-card">
            <div className="text-lg font-bold font-mono text-amber-600 dark:text-amber-400">{formatNpr(totals.totalHeld)}</div>
            <div className="text-[9px] text-muted-foreground uppercase font-mono">Currently Held</div>
          </Card>
          <Card className="p-3 text-center bg-card">
            <div className="text-lg font-bold font-mono text-success dark:text-success/80">{formatNpr(totals.totalReleased)}</div>
            <div className="text-[9px] text-muted-foreground uppercase font-mono">Released to Date</div>
          </Card>
          <Card className="p-3 text-center bg-card">
            <div className="text-lg font-bold font-mono text-info dark:text-info/80">{formatNpr(totals.totalIpcRetention)}</div>
            <div className="text-[9px] text-muted-foreground uppercase font-mono">Total IPC Retention</div>
          </Card>
          <Card className="p-3 text-center bg-card">
            <div className="text-lg font-bold font-mono text-foreground">{totals.subcontractorCount}</div>
            <div className="text-[9px] text-muted-foreground uppercase font-mono">Subcontractors</div>
          </Card>
        </div>
      )}

      <ConstructionTable
        data={rows}
        columns={columns}
        isLoading={isLoading}
        searchPlaceholder="Search subcontractor..."
        searchFilterKeys={["subcontractorName"]}
      />

      {/* Release Dialog */}
      <Dialog open={!!releaseFor} onOpenChange={(open) => !open && setReleaseFor(null)}>
        <DialogContent className="sm:max-w-md backdrop-blur-md bg-black/85 border-white/10 text-white">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Unlock className="h-5 w-5 text-amber-500" />
              Release Retention Money
            </DialogTitle>
            <DialogDescription className="text-white/60">
              Release held retention back to subcontractor. This creates a payment ledger entry.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Release Amount (NPR) *</Label>
              <Input
                type="number"
                value={releaseAmount}
                onChange={(e) => setReleaseAmount(e.target.value)}
                className="h-8 text-xs font-mono"
                placeholder="0.00"
              />
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setReleaseFor(null)}
              disabled={releaseMut.isPending}
              className="font-mono text-xs"
            >
              Cancel
            </Button>
            <Button
              size="sm"
              className="bg-success hover:bg-success text-white font-mono text-xs"
              onClick={() => {
                if (!releaseFor || !releaseAmount) return;
                releaseMut.mutate({
                  projectId,
                  subcontractorId: releaseFor,
                  amount: parseFloat(releaseAmount),
                });
              }}
              disabled={releaseMut.isPending || !releaseAmount}
            >
              {releaseMut.isPending && <Loader2 className="h-3 w-3 animate-spin mr-1" />}
              Confirm Release
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
