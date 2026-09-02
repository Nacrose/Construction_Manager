"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc-client";
import { DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

export function AddIpcDialog({ projectId, onDone }: { projectId: string; onDone: () => void }) {
  const utils = trpc.useUtils();
  const [number, setNumber] = useState("");
  const [period, setPeriod] = useState("");
  const [retention, setRetention] = useState("5");
  const [advanceRecovery, setAdvanceRecovery] = useState("0");
  const [subcontractorId, setSubcontractorId] = useState("");
  const [vatPercent, setVatPercent] = useState("13");
  const [tdsPercent, setTdsPercent] = useState("0");

  const { data: subsData } = trpc.partner.listSubcontractors.useQuery({ projectId, limit: 500 });

  const mutation = trpc.ipc.create.useMutation({
    onSuccess: () => {
      utils.ipc.list.invalidate({ projectId });
      toast.success("IPC created");
      onDone();
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <DialogContent className="max-w-md">
      <DialogHeader><DialogTitle>New IPC</DialogTitle></DialogHeader>
      <form onSubmit={(e) => { e.preventDefault(); mutation.mutate({
        projectId,
        number,
        period: period || null,
        retention: parseFloat(retention) || 0,
        advanceRecovery: parseFloat(advanceRecovery) || 0,
        subcontractorId: subcontractorId || null,
        vatPercent: parseFloat(vatPercent) || 0,
        tdsPercent: parseFloat(tdsPercent) || 0,
      }); }} className="space-y-3">
        <div className="space-y-1.5"><Label>Number *</Label><Input value={number} onChange={(e) => setNumber(e.target.value)} required placeholder="IPC-001" /></div>
        <div className="space-y-1.5"><Label>Period</Label><Input value={period} onChange={(e) => setPeriod(e.target.value)} placeholder="Jul 2026" /></div>

        <div className="space-y-1.5">
          <Label>Select Subcontractor (Optional)</Label>
          <select value={subcontractorId} onChange={(e) => setSubcontractorId(e.target.value)} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm">
            <option value="">-- General Project Bill (None) --</option>
            {subsData?.subcontractors.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5"><Label>Retention %</Label><Input value={retention} onChange={(e) => setRetention(e.target.value)} type="number" step="0.1" /></div>
          <div className="space-y-1.5"><Label>Advance recovery (NPR)</Label><Input value={advanceRecovery} onChange={(e) => setAdvanceRecovery(e.target.value)} type="number" /></div>
        </div>

        <div className="grid grid-cols-2 gap-3 border-t pt-3">
          <div className="space-y-1.5">
            <Label className="text-xs">VAT % (default 13)</Label>
            <Input value={vatPercent} onChange={(e) => setVatPercent(e.target.value)} type="number" step="0.01" min="0" max="100" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">TDS %</Label>
            <Input value={tdsPercent} onChange={(e) => setTdsPercent(e.target.value)} type="number" step="0.01" min="0" max="100" placeholder="0" />
          </div>
        </div>
        <DialogFooter><Button type="submit" disabled={mutation.isPending}>{mutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Create IPC</Button></DialogFooter>
      </form>
    </DialogContent>
  );
}
