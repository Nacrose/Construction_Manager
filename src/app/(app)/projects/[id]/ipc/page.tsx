"use client";

import { use, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogTrigger } from "@/components/ui/dialog";
import { Plus, Inbox, ReceiptText, Users } from "lucide-react";
import { trpc } from "@/lib/trpc-client";
import { AddIpcDialog } from "./dialogs/add-ipc-dialog";
import { formatNpr } from "@/lib/currency";
import { useRouter } from "next/navigation";

type Ipc = {
  id: string; number: string; period: string | null; status: string;
  grossAmount: number; retentionAmount: number; advanceRecovery: number; netPayable: number;
  vatPercent?: number | null; vatAmount?: number | null;
  tdsPercent?: number | null; tdsAmount?: number | null;
  totalWithVat?: number | null; finalPayable?: number | null;
  _count: { items: number };
  subcontractor?: { name: string } | null;
};

type _Subcontractor = {
  id: string; name: string;
};

const STATUS_STYLES: Record<string, string> = {
  draft: "bg-muted text-foreground/80 dark:bg-[var(--navy-mid)] dark:text-foreground/80",
  submitted: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
  certified: "bg-info/15 text-info dark:bg-[var(--navy-deep)] dark:text-info",
  approved: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
  paid: "bg-emerald-600 text-white",
};

import { AnimatedPage } from "@/components/ui/animated-page";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export default function IpcPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [addOpen, setAddOpen] = useState(false);

  const { data: projectInfo } = trpc.project.get.useQuery({ id }, { staleTime: 300_000 });
  const { data, isLoading } = trpc.ipc.list.useQuery({ projectId: id });

  const canWrite = !!projectInfo?.myRole;

  const allIpcs = (data?.ipcs ?? []) as Ipc[];

  return (
    <>
      <AnimatedPage className="space-y-3 pb-8">
        <header className="flex min-h-10 items-center justify-between gap-3 border-b border-border/75 pb-2">
          <div>
            <h1 className="text-sm font-semibold text-foreground">IPC certificates</h1>
            <p className="text-[9px] font-mono uppercase tracking-[0.1em] text-muted-foreground">Approved bill register · {allIpcs.length} recorded</p>
          </div>

          {canWrite && (
            <Dialog open={addOpen} onOpenChange={setAddOpen}>
              <DialogTrigger asChild>
                <Button size="sm" className="h-7 gap-1.5 text-[10px]">
                  <Plus className="h-3.5 w-3.5" /> Record IPC
                </Button>
              </DialogTrigger>
              <AddIpcDialog projectId={id} onDone={() => setAddOpen(false)} />
            </Dialog>
          )}
        </header>

        {isLoading ? <Skeleton className="h-64 rounded-xl bg-muted" /> : !allIpcs.length ? (
          <Card className="flex flex-col items-center gap-3 p-12 text-center bg-card border-[var(--border)] shadow-xs rounded-xl">
            <Inbox className="h-10 w-10 text-muted-foreground/80" />
            <p className="text-xs text-muted-foreground">No Interim Payment Certificates recorded yet.</p>
          </Card>
        ) : (
        <Table><TableHeader><TableRow><TableHead>Certificate</TableHead><TableHead>Period / party</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Gross</TableHead><TableHead className="text-right">Deductions</TableHead><TableHead className="text-right">Payable</TableHead><TableHead className="text-right">Items</TableHead></TableRow></TableHeader><TableBody>{allIpcs.map((ipc) => <TableRow key={ipc.id} className="cursor-pointer" onClick={() => router.push(`/projects/${id}/ipc/${ipc.id}`)}><TableCell><span className="flex items-center gap-2 font-semibold"><ReceiptText className="h-3.5 w-3.5 text-primary" />{ipc.number}</span></TableCell><TableCell><span className="block text-muted-foreground">{ipc.period || "—"}</span>{ipc.subcontractor && <span className="mt-0.5 flex items-center gap-1 text-[10px] text-muted-foreground"><Users className="h-3 w-3" />{ipc.subcontractor.name}</span>}</TableCell><TableCell><Badge variant="secondary" className={`capitalize ${STATUS_STYLES[ipc.status] ?? STATUS_STYLES.draft}`}>{ipc.status}</Badge></TableCell><TableCell className="text-right">{formatNpr(ipc.grossAmount)}</TableCell><TableCell className="text-right text-muted-foreground">{formatNpr(ipc.retentionAmount + ipc.advanceRecovery + (ipc.tdsAmount ?? 0))}</TableCell><TableCell className="text-right font-semibold text-primary">{formatNpr(ipc.finalPayable ?? ipc.netPayable)}</TableCell><TableCell className="text-right text-muted-foreground">{ipc._count.items}</TableCell></TableRow>)}</TableBody></Table>
        )}
      </AnimatedPage>
    </>
  );
}
