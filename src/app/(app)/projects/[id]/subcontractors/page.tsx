"use client";

import { use, useState } from "react";
import { cn } from "@/lib/utils";
import { trpc } from "@/lib/trpc-client";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogTrigger } from "@/components/ui/dialog";
import {Plus, Users, Inbox, ReceiptText, Phone, Mail, ArrowUpDown, ClipboardList} from "lucide-react";
import { format } from "date-fns";
import { AnimatedPage } from "@/components/ui/animated-page";
import { ModuleTabs } from "@/components/module-tabs";
import { AddSubcontractorDialog } from "./dialogs/add-subcontractor-dialog";
import { DeleteDebitButton } from "./components/delete-debit-button";


export default function SubcontractorsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const _utils = trpc.useUtils();
  const [addOpen, setAddOpen] = useState(false);
  const [selectedSubId, setSelectedSubId] = useState<string | null>(null);

  const { data: projectInfo } = trpc.project.get.useQuery({ id }, { staleTime: 300_000 });

  const { data: subsData, isLoading } = trpc.partner.listSubcontractors.useQuery({ projectId: id });

  const { data: ledgerData, isLoading: isLedgerLoading } = trpc.partner.getSubcontractor.useQuery(
    { projectId: id, subId: selectedSubId || "" },
    { enabled: !!selectedSubId }
  );

  const { data: worksData, isLoading: isWorksLoading } = trpc.partner.getSubcontractorWorks.useQuery(
    { projectId: id, subId: selectedSubId || "" },
    { enabled: !!selectedSubId }
  );

  const canWrite = projectInfo?.myRole && projectInfo.myRole !== "client" && projectInfo.myRole !== "inspector";

  return (
    <>
    <ModuleTabs projectId={id} cluster="resources" />
    <AnimatedPage className="space-y-5 pb-8">

      {/* ── Page Actions ────────────────────────────────────── */}
      <div className="flex justify-end gap-2 mb-5">
        {canWrite && (
          <Dialog open={addOpen} onOpenChange={setAddOpen}>
            <DialogTrigger asChild>
              <Button size="sm"><Plus className="mr-1.5 h-3.5 w-3.5" />Add Subcontractor</Button>
            </DialogTrigger>
            <AddSubcontractorDialog projectId={id} onDone={() => setAddOpen(false)} />
          </Dialog>
        )}
      </div>

      {/* ── Master–Detail Layout ──────────────────────────────── */}
      <div className="grid gap-5 md:grid-cols-3">

        {/* Directory */}
        <div className="md:col-span-1">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Directory</CardTitle>
              <CardDescription className="text-xs">Select a contractor to view their statement.</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {isLoading ? (
                <div className="p-4 space-y-2"><Skeleton className="h-14 w-full" /><Skeleton className="h-14 w-full" /></div>
              ) : !subsData?.subcontractors.length ? (
                <div className="flex flex-col items-center gap-2 p-8 text-center text-muted-foreground">
                  <Users className="h-10 w-10 opacity-40" />
                  <p className="text-sm">No subcontractors added yet.</p>
                </div>
              ) : (
                <ul className="divide-y max-h-[60vh] overflow-y-auto">
                  {subsData.subcontractors.map((sub) => {
                    const active = selectedSubId === sub.id;
                    const initials = sub.name.split(" ").map((w: string) => w[0]).slice(0, 2).join("").toUpperCase();
                    return (
                      <li
                        key={sub.id}
                        onClick={() => setSelectedSubId(sub.id)}
                        className={cn(
                          "flex items-center gap-3 p-3 cursor-pointer transition-colors hover:bg-muted/30",
                          active && "bg-muted/60 border-l-4 border-violet-500 pl-2"
                        )}
                      >
                        <div className={cn(
                          "flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                          active ? "bg-violet-500 text-white" : "bg-muted text-muted-foreground"
                        )}>
                          {initials}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{sub.name}</p>
                          {sub.contact && <p className="text-xs text-muted-foreground truncate">{sub.contact}</p>}
                        </div>
                        <Badge variant="secondary" className={cn(
                          "shrink-0 text-[10px] font-normal",
                          sub.status === "active" ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300" : "bg-slate-100 text-slate-600"
                        )}>
                          {sub.status}
                        </Badge>
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Detail Panel */}
        <div className="md:col-span-2 space-y-4">
          {!selectedSubId ? (
            <div className="flex h-full min-h-[300px] flex-col items-center justify-center gap-3 rounded-lg border border-dashed p-12 text-center text-muted-foreground">
              <ReceiptText className="h-10 w-10 opacity-40" />
              <div>
                <p className="font-medium text-sm">No Subcontractor Selected</p>
                <p className="text-xs mt-0.5">Select from the directory to view their debit statement.</p>
              </div>
            </div>
          ) : isLedgerLoading ? (
            <Skeleton className="h-96" />
          ) : !ledgerData ? (
            <div className="p-4 text-center text-sm text-muted-foreground">Failed to load ledger data.</div>
          ) : (
            <Card>
              {/* Sub header */}
              <CardHeader className="border-b pb-4">
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                  <div>
                    <CardTitle className="text-lg">{ledgerData.subcontractor.name}</CardTitle>
                    {ledgerData.subcontractor.pan && (
                      <CardDescription className="font-mono text-xs mt-0.5">PAN: {ledgerData.subcontractor.pan}</CardDescription>
                    )}
                    <div className="flex flex-wrap gap-3 mt-2 text-xs text-muted-foreground">
                      {ledgerData.subcontractor.phone && (
                        <span className="flex items-center gap-1.5"><Phone className="h-3 w-3" />{ledgerData.subcontractor.phone}</span>
                      )}
                      {ledgerData.subcontractor.email && (
                        <span className="flex items-center gap-1.5"><Mail className="h-3 w-3" />{ledgerData.subcontractor.email}</span>
                      )}
                    </div>
                  </div>
                  {/* Debit callout */}
                  <div className="rounded-lg border border-red-200 bg-red-50/60 dark:border-red-900 dark:bg-red-950/20 px-4 py-3 text-right shrink-0">
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Total Recoverable Debits</p>
                    <p className="text-2xl font-bold text-red-600 tabular-nums">NPR {ledgerData.totalDebitAmount.toLocaleString()}</p>
                  </div>
                </div>
              </CardHeader>

              {/* Debits table */}
              <CardContent className="p-0">
                <div className="px-4 py-3">
                  <h3 className="text-sm font-semibold flex items-center gap-1.5">
                    <ArrowUpDown className="h-4 w-4 text-violet-600" />Material Issue Recovery Logs
                  </h3>
                </div>
                {!ledgerData.debits.length ? (
                  <div className="flex flex-col items-center gap-2 p-12 text-center text-muted-foreground border-t">
                    <Inbox className="h-10 w-10 opacity-40" />
                    <p className="text-sm">No debitable material issues logged for this subcontractor.</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto border-t">
                    <table className="w-full text-sm">
                      <thead className="border-b bg-muted/30 text-left text-xs text-muted-foreground">
                        <tr>
                          <th className="p-3 font-medium">Date</th>
                          <th className="p-3 font-medium">Material</th>
                          <th className="p-3 text-right font-medium">Quantity</th>
                          <th className="p-3 text-right font-medium">Rate</th>
                          <th className="p-3 text-right font-medium">Total Charge</th>
                          <th className="p-3 font-medium">Ref</th>
                          {canWrite && <th className="w-10 p-3" />}
                        </tr>
                      </thead>
                      <tbody>
                        {ledgerData.debits.map((item) => {
                          const chargeRate = item.recoveryRate ?? item.rate;
                          const totalCost = item.quantity * chargeRate;
                          return (
                            <tr key={item.id} className="border-b hover:bg-muted/10 transition-colors">
                              <td className="p-3 text-muted-foreground whitespace-nowrap">{format(new Date(item.date), "dd MMM yyyy")}</td>
                              <td className="p-3 font-medium">
                                {item.material.name}
                                {item.material.code && <span className="ml-1 text-xs text-muted-foreground font-mono">({item.material.code})</span>}
                              </td>
                              <td className="p-3 text-right font-semibold">{item.quantity.toLocaleString()} {item.unit}</td>
                              <td className="p-3 text-right text-muted-foreground">NPR {chargeRate.toLocaleString()}</td>
                              <td className="p-3 text-right font-semibold text-red-600">NPR {totalCost.toLocaleString()}</td>
                              <td className="p-3 font-mono text-xs text-muted-foreground">{item.reference || "—"}</td>
                              {canWrite && (
                                <td className="p-3 text-center">
                                  <DeleteDebitButton transactionId={item.id} projectId={id} subcontractorId={ledgerData.subcontractor.id} />
                                </td>
                              )}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Works-on Tracking */}
          {selectedSubId && (
            <Card>
              <CardHeader className="pb-3 border-b">
                <CardTitle className="text-base flex items-center gap-2">
                  <ClipboardList className="h-4 w-4" />Works-on Tracking
                </CardTitle>
                <CardDescription className="text-xs">
                  Tasks assigned via RFIs and daily programs. Actual quantities flow from daily reports automatically.
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-4">
                {isWorksLoading ? (
                  <Skeleton className="h-32" />
                ) : !worksData || worksData.tasks.length === 0 ? (
                  <div className="text-center py-8 text-sm text-muted-foreground">
                    <ClipboardList className="h-8 w-8 mx-auto mb-2 opacity-40" />
                    No tasks linked to this subcontractor yet.
                    <p className="text-xs mt-1">Assign a subcontractor to an RFI — when approved, daily program tasks appear here.</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="grid grid-cols-4 gap-3">
                      <div className="rounded-md border p-3 text-center">
                        <div className="text-2xl font-bold text-emerald-600">{worksData.stats.totalTasks}</div>
                        <div className="text-[10px] text-muted-foreground uppercase tracking-wide">Total Tasks</div>
                      </div>
                      <div className="rounded-md border p-3 text-center">
                        <div className="text-2xl font-bold text-blue-600">{worksData.stats.tasksDone}</div>
                        <div className="text-[10px] text-muted-foreground uppercase tracking-wide">Done</div>
                      </div>
                      <div className="rounded-md border p-3 text-center">
                        <div className="text-2xl font-bold text-amber-600">{worksData.stats.tasksPartial}</div>
                        <div className="text-[10px] text-muted-foreground uppercase tracking-wide">Partial</div>
                      </div>
                      <div className="rounded-md border p-3 text-center">
                        <div className="text-2xl font-bold">{worksData.stats.completionPct}%</div>
                        <div className="text-[10px] text-muted-foreground uppercase tracking-wide">Completion</div>
                      </div>
                    </div>
                    <div className="rounded-md border overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead className="bg-muted/30">
                          <tr>
                            <th className="p-2 text-left font-medium text-muted-foreground">Date</th>
                            <th className="p-2 text-left font-medium text-muted-foreground">Task</th>
                            <th className="p-2 text-left font-medium text-muted-foreground">Source</th>
                            <th className="p-2 text-right font-medium text-muted-foreground">Planned</th>
                            <th className="p-2 text-right font-medium text-muted-foreground">Actual</th>
                            <th className="p-2 text-center font-medium text-muted-foreground">Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {worksData.tasks.slice(0, 20).map((t: any) => (
                            <tr key={t.id} className="border-t hover:bg-muted/20">
                              <td className="p-2 whitespace-nowrap">{t.program?.programDate ? format(new Date(t.program.programDate), "dd MMM yy") : "—"}</td>
                              <td className="p-2">
                                <div className="font-medium">{t.taskName}</div>
                                {t.location && <div className="text-[10px] text-muted-foreground">{t.location}</div>}
                              </td>
                              <td className="p-2">
                                {t.rfi ? <span className="text-[10px] font-mono text-blue-600">{t.rfi.number}</span>
                                : t.ganttTask ? <span className="text-[10px] font-mono">{t.ganttTask.code}</span>
                                : <span className="text-[10px] text-muted-foreground">—</span>}
                              </td>
                              <td className="p-2 text-right tabular-nums">{t.plannedQty} {t.unit}</td>
                              <td className="p-2 text-right tabular-nums font-medium">{t.actualQty ?? 0} {t.unit}</td>
                              <td className="p-2 text-center">
                                <span className={cn(
                                  "inline-block rounded px-1.5 py-0.5 text-[9px] font-medium uppercase",
                                  t.executionStatus === "done" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400" :
                                  t.executionStatus === "partially_completed" ? "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400" :
                                  t.executionStatus === "uncompleted" ? "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400" :
                                  "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400"
                                )}>
                                  {t.executionStatus?.replace("_", " ")}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {worksData.tasks.length > 20 && (
                      <p className="text-[10px] text-muted-foreground text-center">Showing 20 of {worksData.tasks.length} tasks</p>
                    )}
                    {worksData.rfis.length > 0 && (
                      <div>
                        <p className="text-xs font-medium text-muted-foreground mb-1.5">Linked RFIs ({worksData.rfis.length})</p>
                        <div className="flex flex-wrap gap-1.5">
                          {worksData.rfis.map((rfi: any) => (
                            <a key={rfi.id} href={`/projects/${id}/workflow/rfi`}
                              className="inline-flex items-center gap-1 rounded border bg-card px-2 py-0.5 text-[11px] font-mono hover:bg-muted"
                              title={rfi.subject}>
                              {rfi.number}
                              <span className={cn("rounded px-1 text-[8px] uppercase",
                                rfi.status === "approved" ? "bg-emerald-100 text-emerald-700" :
                                rfi.status === "submitted" ? "bg-amber-100 text-amber-700" :
                                "bg-slate-100 text-slate-600"
                              )}>{rfi.status}</span>
                            </a>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </AnimatedPage>
    </>
  );
}
