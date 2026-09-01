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
import { Plus, Users, Inbox, ReceiptText, Phone, Mail, ArrowUpDown, ClipboardList } from "lucide-react";
import { format } from "date-fns";
import { AnimatedPage } from "@/components/ui/animated-page";
import { ModuleTabs } from "@/components/module-tabs";
import { AddSubcontractorDialog } from "./dialogs/add-subcontractor-dialog";
import { DeleteDebitButton } from "./components/delete-debit-button";
import { formatNpr } from "@/lib/currency";
import { ConstructionTable, ConstructionTableColumn } from "@/components/ui/construction-table";

const RES_TABS = [
  { label: "Materials & Procurement", href: "/materials" },
  { label: "Resource & Rate Library", href: "/rate-library" },
  { label: "Equipment & Fleet", href: "/equipment" },
  { label: "Plant & Production", href: "/production" },
  { label: "Subcontractors", href: "/subcontractors" },
  { label: "HR / Staff", href: "/hr" },
  { label: "Vendors Directory", href: "/vendors" },
];

export default function SubcontractorsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
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

  const debitColumns: ConstructionTableColumn<any>[] = [
    {
      key: "date",
      header: "Date",
      render: (_, item) => (
        <span className="text-muted-foreground whitespace-nowrap font-mono text-xs">
          {format(new Date(item.date), "dd MMM yyyy")}
        </span>
      ),
    },
    {
      key: "material",
      header: "Material",
      render: (_, item) => (
        <div className="font-medium text-xs font-sans text-foreground">
          {item.material.name}
          {item.material.code && (
            <span className="ml-1 text-[10px] text-muted-foreground font-mono">({item.material.code})</span>
          )}
        </div>
      ),
    },
    {
      key: "quantity",
      header: "Quantity",
      align: "right",
      render: (_, item) => (
        <span className="font-mono text-xs font-semibold text-foreground">
          {item.quantity.toLocaleString()} {item.unit}
        </span>
      ),
    },
    {
      key: "rate",
      header: "Rate",
      align: "right",
      render: (_, item) => {
        const chargeRate = item.recoveryRate ?? item.rate;
        return <span className="font-mono text-xs text-muted-foreground">{formatNpr(chargeRate)}</span>;
      },
    },
    {
      key: "totalCharge",
      header: "Total Charge",
      align: "right",
      render: (_, item) => {
        const chargeRate = item.recoveryRate ?? item.rate;
        const totalCost = item.quantity * chargeRate;
        return <span className="font-mono text-xs font-bold text-red-600 dark:text-red-400">{formatNpr(totalCost)}</span>;
      },
    },
    {
      key: "reference",
      header: "Ref",
      render: (_, item) => <span className="font-mono text-xs text-muted-foreground">{item.reference || "—"}</span>,
    },
    ...(canWrite
      ? [
          {
            key: "actions",
            header: "",
            align: "center" as const,
            width: "40px",
            render: (_: any, item: any) => (
              <DeleteDebitButton transactionId={item.id} projectId={id} subcontractorId={ledgerData?.subcontractor.id || ""} />
            ),
          },
        ]
      : []),
  ];

  const taskColumns: ConstructionTableColumn<any>[] = [
    {
      key: "programDate",
      header: "Date",
      render: (_, t) => (
        <span className="text-muted-foreground whitespace-nowrap font-mono text-xs">
          {t.program?.programDate ? format(new Date(t.program.programDate), "dd MMM yy") : "—"}
        </span>
      ),
    },
    {
      key: "taskName",
      header: "Task",
      render: (_, t) => (
        <div className="font-sans text-xs">
          <div className="font-medium text-foreground">{t.taskName}</div>
          {t.location && <div className="text-[10px] text-muted-foreground">{t.location}</div>}
        </div>
      ),
    },
    {
      key: "source",
      header: "Source",
      render: (_, t) =>
        t.rfi ? (
          <span className="text-[10px] font-mono text-blue-600 dark:text-blue-400">{t.rfi.number}</span>
        ) : t.ganttTask ? (
          <span className="text-[10px] font-mono">{t.ganttTask.code}</span>
        ) : (
          <span className="text-[10px] text-muted-foreground">—</span>
        ),
    },
    {
      key: "plannedQty",
      header: "Planned",
      align: "right",
      render: (_, t) => (
        <span className="font-mono text-xs">
          {t.plannedQty} {t.unit}
        </span>
      ),
    },
    {
      key: "actualQty",
      header: "Actual",
      align: "right",
      render: (_, t) => (
        <span className="font-mono text-xs font-semibold text-foreground">
          {t.actualQty ?? 0} {t.unit}
        </span>
      ),
    },
    {
      key: "status",
      header: "Status",
      align: "center",
      render: (_, t) => (
        <span
          className={cn(
            "inline-block rounded px-1.5 py-0.5 text-[9px] font-medium uppercase font-mono",
            t.executionStatus === "done"
              ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400"
              : t.executionStatus === "partially_completed"
              ? "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400"
              : t.executionStatus === "uncompleted"
              ? "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400"
              : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400"
          )}
        >
          {t.executionStatus?.replace("_", " ")}
        </span>
      ),
    },
  ];

  return (
    <>
      <ModuleTabs projectId={id} tabs={RES_TABS} />
      <AnimatedPage className="space-y-5 pb-8 p-4">
        {/* Page Actions */}
        <div className="flex justify-end gap-2">
          {canWrite && (
            <Dialog open={addOpen} onOpenChange={setAddOpen}>
              <DialogTrigger asChild>
                <Button size="sm" className="gap-1.5 font-mono text-xs">
                  <Plus className="h-3.5 w-3.5" />
                  Add Subcontractor
                </Button>
              </DialogTrigger>
              <AddSubcontractorDialog projectId={id} onDone={() => setAddOpen(false)} />
            </Dialog>
          )}
        </div>

        {/* Master–Detail Layout */}
        <div className="grid gap-5 md:grid-cols-3">
          {/* Directory */}
          <div className="md:col-span-1">
            <Card className="rounded-xl border bg-card">
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-bold font-sans">Directory</CardTitle>
                <CardDescription className="text-xs">Select a contractor to view their statement.</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                {isLoading ? (
                  <div className="p-4 space-y-2">
                    <Skeleton className="h-14 w-full" />
                    <Skeleton className="h-14 w-full" />
                  </div>
                ) : !subsData?.subcontractors.length ? (
                  <div className="flex flex-col items-center gap-2 p-8 text-center text-muted-foreground">
                    <Users className="h-10 w-10 opacity-40" />
                    <p className="text-sm font-medium">No subcontractors added yet.</p>
                  </div>
                ) : (
                  <ul className="divide-y max-h-[60vh] overflow-y-auto">
                    {subsData.subcontractors.map((sub) => {
                      const active = selectedSubId === sub.id;
                      const initials = sub.name
                        .split(" ")
                        .map((w: string) => w[0])
                        .slice(0, 2)
                        .join("")
                        .toUpperCase();
                      return (
                        <li
                          key={sub.id}
                          onClick={() => setSelectedSubId(sub.id)}
                          className={cn(
                            "flex items-center gap-3 p-3 cursor-pointer transition-colors hover:bg-muted/30",
                            active && "bg-muted/60 border-l-4 border-violet-500 pl-2"
                          )}
                        >
                          <div
                            className={cn(
                              "flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold",
                              active
                                ? "bg-violet-600 text-white"
                                : "bg-muted text-muted-foreground"
                            )}
                          >
                            {initials}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-semibold truncate text-foreground">{sub.name}</p>
                            <p className="text-xs text-muted-foreground font-mono">
                              {sub.contact || sub.pan || "General"}
                            </p>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Details Column */}
          <div className="md:col-span-2 space-y-4">
            {!selectedSubId ? (
              <Card className="flex flex-col items-center justify-center p-12 text-center text-muted-foreground border-dashed">
                <Users className="h-12 w-12 opacity-30 mb-3" />
                <p className="text-sm font-medium">Select a subcontractor from the directory to inspect their debit logs and assigned tasks.</p>
              </Card>
            ) : isLedgerLoading ? (
              <div className="space-y-3">
                <Skeleton className="h-28 w-full" />
                <Skeleton className="h-48 w-full" />
              </div>
            ) : !ledgerData ? null : (
              <Card className="rounded-xl border bg-card">
                <CardHeader className="pb-3 border-b">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <CardTitle className="text-lg font-bold font-sans text-foreground">{ledgerData.subcontractor.name}</CardTitle>
                      <div className="flex flex-wrap gap-4 text-xs text-muted-foreground font-mono mt-1">
                        {ledgerData.subcontractor.pan && (
                          <span>PAN: {ledgerData.subcontractor.pan}</span>
                        )}
                        {ledgerData.subcontractor.phone && (
                          <span className="flex items-center gap-1.5">
                            <Phone className="h-3 w-3" />
                            {ledgerData.subcontractor.phone}
                          </span>
                        )}
                        {ledgerData.subcontractor.email && (
                          <span className="flex items-center gap-1.5">
                            <Mail className="h-3 w-3" />
                            {ledgerData.subcontractor.email}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Debit callout */}
                    <div className="rounded-lg border border-red-200 bg-red-50/60 dark:border-red-900 dark:bg-red-950/20 px-4 py-2.5 text-right shrink-0 font-mono">
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Total Recoverable Debits</p>
                      <p className="text-xl font-bold text-red-600 dark:text-red-400">
                        {formatNpr(ledgerData.totalDebitAmount)}
                      </p>
                    </div>
                  </div>
                </CardHeader>

                {/* Debits table */}
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-center gap-1.5">
                    <ArrowUpDown className="h-4 w-4 text-violet-600" />
                    <h3 className="text-sm font-semibold font-sans text-foreground">Material Issue Recovery Logs</h3>
                  </div>

                  <ConstructionTable
                    data={ledgerData.debits}
                    columns={debitColumns}
                    isLoading={false}
                    searchPlaceholder="Search material debits..."
                    searchFilterKeys={["reference"]}
                  />
                </CardContent>
              </Card>
            )}

            {/* Works-on Tracking */}
            {selectedSubId && (
              <Card className="rounded-xl border bg-card">
                <CardHeader className="pb-3 border-b">
                  <CardTitle className="text-base font-bold font-sans flex items-center gap-2">
                    <ClipboardList className="h-4 w-4 text-primary" />
                    Works-on Tracking
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Tasks assigned via RFIs and daily programs. Actual quantities flow from daily reports automatically.
                  </CardDescription>
                </CardHeader>
                <CardContent className="pt-4 space-y-4">
                  {isWorksLoading ? (
                    <Skeleton className="h-32" />
                  ) : !worksData || worksData.tasks.length === 0 ? (
                    <div className="text-center py-8 text-sm text-muted-foreground font-mono">
                      <ClipboardList className="h-8 w-8 mx-auto mb-2 opacity-40" />
                      No tasks linked to this subcontractor yet.
                      <p className="text-xs mt-1">Assign a subcontractor to an RFI — when approved, daily program tasks appear here.</p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div className="grid grid-cols-4 gap-3">
                        <div className="rounded-md border p-3 text-center bg-muted/20">
                          <div className="text-xl font-bold font-mono text-emerald-600 dark:text-emerald-400">{worksData.stats.totalTasks}</div>
                          <div className="text-[10px] text-muted-foreground uppercase tracking-wide font-mono">Total Tasks</div>
                        </div>
                        <div className="rounded-md border p-3 text-center bg-muted/20">
                          <div className="text-xl font-bold font-mono text-blue-600 dark:text-blue-400">{worksData.stats.tasksDone}</div>
                          <div className="text-[10px] text-muted-foreground uppercase tracking-wide font-mono">Done</div>
                        </div>
                        <div className="rounded-md border p-3 text-center bg-muted/20">
                          <div className="text-xl font-bold font-mono text-amber-600 dark:text-amber-400">{worksData.stats.tasksPartial}</div>
                          <div className="text-[10px] text-muted-foreground uppercase tracking-wide font-mono">Partial</div>
                        </div>
                        <div className="rounded-md border p-3 text-center bg-muted/20">
                          <div className="text-xl font-bold font-mono text-foreground">{worksData.stats.completionPct}%</div>
                          <div className="text-[10px] text-muted-foreground uppercase tracking-wide font-mono">Completion</div>
                        </div>
                      </div>

                      <ConstructionTable
                        data={worksData.tasks}
                        columns={taskColumns}
                        isLoading={false}
                        searchPlaceholder="Search assigned tasks..."
                        searchFilterKeys={["taskName", "location"]}
                      />

                      {worksData.rfis.length > 0 && (
                        <div>
                          <p className="text-xs font-medium text-muted-foreground mb-1.5 font-mono">Linked RFIs ({worksData.rfis.length})</p>
                          <div className="flex flex-wrap gap-1.5">
                            {worksData.rfis.map((rfi: any) => (
                              <a
                                key={rfi.id}
                                href={`/projects/${id}/workflow/rfi`}
                                className="inline-flex items-center gap-1 rounded border bg-card px-2 py-0.5 text-[11px] font-mono hover:bg-muted"
                                title={rfi.subject}
                              >
                                {rfi.number}
                                <span
                                  className={cn(
                                    "rounded px-1 text-[8px] uppercase",
                                    rfi.status === "approved"
                                      ? "bg-emerald-100 text-emerald-700"
                                      : rfi.status === "submitted"
                                      ? "bg-amber-100 text-amber-700"
                                      : "bg-slate-100 text-slate-600"
                                  )}
                                >
                                  {rfi.status}
                                </span>
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
