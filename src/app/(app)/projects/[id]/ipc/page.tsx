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
      <AnimatedPage className="space-y-6 pb-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Link href={`/projects/${id}`} className="hover:text-foreground">Project</Link><span>/</span><span>IPC</span>
            </div>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">Interim Payment Certificates</h1>
          <p className="text-sm text-muted-foreground">Payment certificates with retention and advance recovery.</p>
        </div>
        {canWrite && (
          <Dialog open={addOpen} onOpenChange={setAddOpen}>
            <DialogTrigger asChild><Button><Plus className="mr-2 h-4 w-4" /> New IPC</Button></DialogTrigger>
            <AddIpcDialog projectId={id} onDone={() => setAddOpen(false)} />
          </Dialog>
        )}
      </div>

      {isLoading ? <Skeleton className="h-64" /> : !allIpcs.length ? (
        <Card className="flex flex-col items-center gap-3 p-12 text-center">
          <Inbox className="h-12 w-12 text-muted-foreground" /><p className="text-sm text-muted-foreground">No IPCs yet.</p>
        </Card>
      ) : (
        <div className="space-y-3">
          {allIpcs.map((ipc) => (
            <Link key={ipc.id} href={`/projects/${id}/ipc/${ipc.id}`}>
              <Card className="transition-shadow hover:shadow-md">
                <CardContent className="flex items-center gap-4 p-4">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-emerald-50 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400">
                    <ReceiptText className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs text-muted-foreground">{ipc.number}</span>
                      <Badge variant="secondary" className={`capitalize ${STATUS_STYLES[ipc.status] ?? STATUS_STYLES.draft}`}>{ipc.status}</Badge>
                      {ipc.period && <span className="text-xs text-muted-foreground">{ipc.period}</span>}
                      {ipc.subcontractor && (
                        <Badge variant="outline" className="bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300 gap-1 text-[11px] font-normal py-0.5">
                          <Users className="h-3 w-3" /> Subcontractor: {ipc.subcontractor.name}
                        </Badge>
                      )}
                    </div>
                    <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs sm:text-sm">
                      <span>Gross: <span className="font-medium">NPR {ipc.grossAmount.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span></span>
                      {(ipc.vatAmount ?? 0) > 0 && (
                        <span className="text-amber-700 dark:text-amber-400">
                          +VAT ({ipc.vatPercent ?? 0}%): NPR {(ipc.vatAmount ?? 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                        </span>
                      )}
                      <span className="text-muted-foreground">Retention: NPR {ipc.retentionAmount.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span>
                      <span className="text-muted-foreground">Advance: NPR {ipc.advanceRecovery.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span>
                      {(ipc.tdsAmount ?? 0) > 0 && (
                        <span className="text-red-600">
                          −TDS ({ipc.tdsPercent ?? 0}%): NPR {(ipc.tdsAmount ?? 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                        </span>
                      )}
                      <span className="text-emerald-700 dark:text-emerald-400 font-medium">
                        Final: NPR {(ipc.finalPayable ?? ipc.netPayable).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <Badge variant="outline">{ipc._count.items} items</Badge>
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
