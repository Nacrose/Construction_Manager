"use client";

import { use, useState } from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogTrigger } from "@/components/ui/dialog";
import { Plus, Inbox, ReceiptText, Users } from "lucide-react";
import { trpc } from "@/lib/trpc-client";
import { AddIpcDialog } from "./dialogs/add-ipc-dialog";
import { formatNpr } from "@/lib/currency";

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
  draft: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  submitted: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
  certified: "bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300",
  approved: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
  paid: "bg-emerald-600 text-white",
};

import { AnimatedPage } from "@/components/ui/animated-page";
import { ModuleTabs } from "@/components/module-tabs";

const FIN_TABS = [
  { label: "Payments", href: "/payments" },
  { label: "Accounting & Day Book", href: "/accounting" },
  { label: "IPC Certificates", href: "/ipc" },
  { label: "Tax Summary", href: "/tax-summary" },
  { label: "Cash Flow", href: "/cash-flow" },
  { label: "Budget vs Actual", href: "/budget-variance" },
];

export default function IpcPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [addOpen, setAddOpen] = useState(false);

  const { data: projectInfo } = trpc.project.get.useQuery({ id }, { staleTime: 300_000 });
  const { data, isLoading } = trpc.ipc.list.useQuery({ projectId: id });

  const canWrite = projectInfo?.myRole && projectInfo.myRole !== "client" && projectInfo.myRole !== "inspector";

  const allIpcs = (data?.ipcs ?? []) as Ipc[];

  return (
    <>
      <ModuleTabs projectId={id} tabs={FIN_TABS} />
      <AnimatedPage className="space-y-4 pb-8">
        {/* Single-Row Action & Summary Strip */}
        <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-xl border border-[#c7d8e8] bg-[#e5eef7]">
          <div className="flex items-center gap-4 text-xs font-mono">
            <span className="text-slate-600">
              Total Certificates: <span className="font-bold text-slate-900 font-matrix">{allIpcs.length}</span>
            </span>
            {allIpcs.length > 0 && (
              <>
                <div className="h-3 w-[1px] bg-[#c7d8e8]" />
                <span className="text-slate-600">
                  Certified: <span className="font-bold text-emerald-700 font-matrix">{allIpcs.filter(i => i.status === "certified" || i.status === "paid").length}</span>
                </span>
              </>
            )}
          </div>

          {canWrite && (
            <Dialog open={addOpen} onOpenChange={setAddOpen}>
              <DialogTrigger asChild>
                <Button size="sm" className="amber-cta-btn h-8 px-3.5 text-xs font-bold text-white rounded-lg shadow-sm gap-1.5 font-sans">
                  <Plus className="h-3.5 w-3.5" /> + New IPC (नयाँ बिल)
                </Button>
              </DialogTrigger>
              <AddIpcDialog projectId={id} onDone={() => setAddOpen(false)} />
            </Dialog>
          )}
        </div>

        {isLoading ? <Skeleton className="h-64 rounded-xl bg-slate-100" /> : !allIpcs.length ? (
          <Card className="flex flex-col items-center gap-3 p-12 text-center bg-white border-[#c7d8e8] shadow-xs rounded-xl">
            <Inbox className="h-10 w-10 text-slate-400" />
            <p className="text-xs text-slate-500">No Interim Payment Certificates recorded yet.</p>
          </Card>
        ) : (
        <div className="space-y-3">
          {allIpcs.map((ipc) => (
            <Link key={ipc.id} href={`/projects/${id}/ipc/${ipc.id}`}>
              <Card className="bg-white border-[#c7d8e8] shadow-xs hover:border-[#0284c7] transition-all rounded-xl">
                <CardContent className="flex items-center gap-4 p-4">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-sky-50 text-[#0284c7] border border-[#bae6fd]">
                    <ReceiptText className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs font-bold text-slate-500">{ipc.number}</span>
                      <Badge variant="secondary" className={`capitalize ${STATUS_STYLES[ipc.status] ?? STATUS_STYLES.draft}`}>{ipc.status}</Badge>
                      {ipc.period && <span className="text-xs text-slate-500 font-mono">{ipc.period}</span>}
                      {ipc.subcontractor && (
                        <Badge variant="outline" className="bg-sky-50 text-[#0284c7] border-[#bae6fd] gap-1 text-[11px] font-normal py-0.5">
                          <Users className="h-3 w-3" /> Subcontractor: {ipc.subcontractor.name}
                        </Badge>
                      )}
                    </div>
                    <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs font-mono">
                      <span className="text-muted-foreground">Gross: <span className="font-bold text-foreground font-mono">{formatNpr(ipc.grossAmount)}</span></span>
                      {(ipc.vatAmount ?? 0) > 0 && (
                        <span className="text-amber-600 dark:text-amber-400 font-mono">
                          +VAT ({ipc.vatPercent ?? 0}%): {formatNpr(ipc.vatAmount ?? 0)}
                        </span>
                      )}
                      <span className="text-muted-foreground font-mono">Retention: {formatNpr(ipc.retentionAmount)}</span>
                      <span className="text-muted-foreground font-mono">Advance: {formatNpr(ipc.advanceRecovery)}</span>
                      {(ipc.tdsAmount ?? 0) > 0 && (
                        <span className="text-red-600 dark:text-red-400 font-mono">
                          −TDS ({ipc.tdsPercent ?? 0}%): {formatNpr(ipc.tdsAmount ?? 0)}
                        </span>
                      )}
                      <span className="text-emerald-600 dark:text-emerald-400 font-bold font-mono">
                        Final: {formatNpr(ipc.finalPayable ?? ipc.netPayable)}
                      </span>
                    </div>

                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <Badge variant="outline" className="border-[#c7d8e8] text-slate-600 font-mono">{ipc._count.items} items</Badge>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
        )}
      </AnimatedPage>
    </>
  );
}
