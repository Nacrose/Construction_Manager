"use client";

import { useParams } from "next/navigation";
import { trpc } from "@/lib/trpc-client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AnimatedPage } from "@/components/ui/animated-page";
import { Printer, FileText, Users, BarChart3 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { formatNpr } from "@/lib/currency";
import { ConstructionTable, ConstructionTableColumn } from "@/components/ui/construction-table";

export default function FormsPage() {
  const params = useParams();
  const projectId = params.id as string;

  const { data: boqData } = trpc.boq.list.useQuery({ projectId });
  const { data: ipcData, isLoading: ipcLoading } = trpc.ipc.list.useQuery({ projectId });
  const { data: requirements, isLoading: reqLoading } = trpc.material.getRequirements.useQuery({ projectId });

  const boqTotal = boqData?.items.reduce((s, i) => s + i.amount, 0) ?? 0;
  const certifiedIpcs = ipcData?.ipcs.filter((ipc) => ipc.status === "approved" || ipc.status === "paid") ?? [];
  const certifiedTotal = certifiedIpcs.reduce((s, ipc) => s + ipc.netPayable, 0);
  const progressPct = boqTotal > 0 ? (certifiedTotal / boqTotal) * 100 : 0;

  const ipcColumns: ConstructionTableColumn<any>[] = [
    {
      key: "number",
      header: "IPC #",
      render: (_, r) => <span className="font-mono text-xs font-bold text-foreground">{r.number}</span>,
    },
    {
      key: "period",
      header: "Period",
      render: (_, r) => <span className="text-xs text-muted-foreground font-mono">{r.period ?? "—"}</span>,
    },
    {
      key: "status",
      header: "Status",
      render: (_, r) => (
        <Badge variant="outline" className="text-[10px] font-mono capitalize">
          {r.status}
        </Badge>
      ),
    },
    {
      key: "grossAmount",
      header: "Gross",
      align: "right",
      render: (_, r) => <span className="font-mono text-xs">{formatNpr(r.grossAmount)}</span>,
    },
    {
      key: "retentionAmount",
      header: "Retention",
      align: "right",
      render: (_, r) => <span className="font-mono text-xs">{formatNpr(r.retentionAmount)}</span>,
    },
    {
      key: "netPayable",
      header: "Net Payable",
      align: "right",
      render: (_, r) => (
        <span className="font-mono text-xs font-bold text-emerald-600 dark:text-emerald-400">
          {formatNpr(r.netPayable)}
        </span>
      ),
    },
  ];

  const materialColumns: ConstructionTableColumn<any>[] = [
    {
      key: "materialName",
      header: "Material",
      render: (_, r) => <span className="font-medium text-xs font-sans text-foreground">{r.materialName}</span>,
    },
    {
      key: "unit",
      header: "Unit",
      render: (_, r) => <span className="text-xs text-muted-foreground font-mono">{r.unit}</span>,
    },
    {
      key: "plannedQty",
      header: "Planned Qty",
      align: "right",
      render: (_, r) => <span className="font-mono text-xs">{r.plannedQty.toLocaleString("en-IN")}</span>,
    },
    {
      key: "issuedQty",
      header: "Issued to Date",
      align: "right",
      render: (_, r) => <span className="font-mono text-xs">{r.issuedQty.toLocaleString("en-IN")}</span>,
    },
    {
      key: "currentStock",
      header: "Current Stock",
      align: "right",
      render: (_, r) => <span className="font-mono text-xs">{r.currentStock.toLocaleString("en-IN")}</span>,
    },
    {
      key: "remainingToProcure",
      header: "Remaining",
      align: "right",
      render: (_, r) => (
        <span className="font-mono text-xs font-bold text-foreground">
          {r.remainingToProcure.toLocaleString("en-IN")}
        </span>
      ),
    },
  ];

  return (
    <AnimatedPage className="space-y-4 pb-8">
      <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-2xl border border-border bg-card">
        <Tabs defaultValue="p" className="w-full">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <TabsList className="p-1 rounded-xl">
              <TabsTrigger value="p" className="text-xs font-semibold">
                <BarChart3 className="mr-1.5 h-3.5 w-3.5" /> Form P (Progress)
              </TabsTrigger>
              <TabsTrigger value="m" className="text-xs font-semibold">
                <FileText className="mr-1.5 h-3.5 w-3.5" /> Form M (Materials)
              </TabsTrigger>
              <TabsTrigger value="l" className="text-xs font-semibold">
                <Users className="mr-1.5 h-3.5 w-3.5" /> Form L (Labor)
              </TabsTrigger>
            </TabsList>
            <Button
              variant="outline"
              size="sm"
              className="h-9 px-3 text-xs rounded-xl font-mono"
              onClick={() => window.print()}
            >
              <Printer className="mr-1.5 h-3.5 w-3.5" /> Print Ma Le Pa
            </Button>
          </div>

          <TabsContent value="p" className="mt-4 space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-bold">Form P — Physical &amp; Financial Progress</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="rounded-xl border bg-card p-3 space-y-1">
                    <p className="text-[10px] text-muted-foreground uppercase font-mono">Contract Amount</p>
                    <p className="text-xl font-bold font-mono text-foreground">{formatNpr(boqTotal)}</p>
                  </div>
                  <div className="rounded-xl border bg-card p-3 space-y-1">
                    <p className="text-[10px] text-muted-foreground uppercase font-mono">Certified to Date</p>
                    <p className="text-xl font-bold font-mono text-emerald-600 dark:text-emerald-400">
                      {formatNpr(certifiedTotal)}
                    </p>
                  </div>
                  <div className="rounded-xl border bg-card p-3 space-y-1">
                    <p className="text-[10px] text-muted-foreground uppercase font-mono">Progress</p>
                    <p className="text-xl font-bold font-mono text-foreground">{progressPct.toFixed(1)}%</p>
                  </div>
                </div>

                <ConstructionTable
                  data={ipcData?.ipcs ?? []}
                  columns={ipcColumns}
                  isLoading={ipcLoading}
                  searchPlaceholder="Search IPC..."
                  searchFilterKeys={["number", "period", "status"]}
                />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="m" className="mt-4 space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-bold">Form M — Material Summary</CardTitle>
              </CardHeader>
              <CardContent>
                <ConstructionTable
                  data={requirements?.requirements ?? []}
                  columns={materialColumns}
                  isLoading={reqLoading}
                  searchPlaceholder="Search materials..."
                  searchFilterKeys={["materialName", "unit"]}
                />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="l" className="mt-4 space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-bold">Form L — Labor &amp; Equipment Deployment</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Labor and equipment deployment tracked via daily reports. This form summarizes workforce
                  and equipment usage over the reporting period.
                </p>

                <div className="rounded-xl border bg-amber-500/10 border-amber-500/30 p-3 text-amber-900 dark:text-amber-200 text-xs">
                  <p className="font-bold font-mono">Data Source:</p>
                  <p className="mt-0.5 text-[11px] opacity-90">
                    Form L data is populated from Daily Report workforce/equipment entries and rate analysis
                    labor/equipment ingredients. Ensure daily reports are completed for the reporting period.
                  </p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </AnimatedPage>
  );
}
