"use client";

import { useParams } from "next/navigation";
import { trpc } from "@/lib/trpc-client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AnimatedPage } from "@/components/ui/animated-page";
import {Printer, FileText, Users, BarChart3} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

const fmt = (n: number) => n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function FormsPage() {
  const params = useParams();
  const projectId = params.id as string;

  const { data: boqData } = trpc.boq.list.useQuery({ projectId });
  const { data: ipcData } = trpc.ipc.list.useQuery({ projectId });
  const { data: requirements } = trpc.material.getRequirements.useQuery({ projectId });

  const boqTotal = boqData?.items.reduce((s, i) => s + i.amount, 0) ?? 0;
  const certifiedIpcs = ipcData?.ipcs.filter((ipc) => ipc.status === "approved" || ipc.status === "paid") ?? [];
  const certifiedTotal = certifiedIpcs.reduce((s, ipc) => s + ipc.netPayable, 0);
  const progressPct = boqTotal > 0 ? (certifiedTotal / boqTotal) * 100 : 0;

  return (
    <AnimatedPage className="space-y-4 pb-8">
      <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-2xl border border-white/10 bg-[#0c1015]">
        <Tabs defaultValue="p" className="w-full">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <TabsList className="bg-[#121820] border border-white/10 p-1 rounded-xl">
              <TabsTrigger value="p" className="text-xs font-semibold data-[state=active]:bg-amber-500 data-[state=active]:text-black"><BarChart3 className="mr-1.5 h-3.5 w-3.5" /> Form P (Progress)</TabsTrigger>
              <TabsTrigger value="m" className="text-xs font-semibold data-[state=active]:bg-amber-500 data-[state=active]:text-black"><FileText className="mr-1.5 h-3.5 w-3.5" /> Form M (Materials)</TabsTrigger>
              <TabsTrigger value="l" className="text-xs font-semibold data-[state=active]:bg-amber-500 data-[state=active]:text-black"><Users className="mr-1.5 h-3.5 w-3.5" /> Form L (Labor)</TabsTrigger>
            </TabsList>
            <Button variant="outline" size="sm" className="h-9 px-3 text-xs bg-[#121820] border-white/10 text-gray-300 hover:text-white rounded-xl" onClick={() => window.print()}>
              <Printer className="mr-1.5 h-3.5 w-3.5" /> Print Ma Le Pa
            </Button>
          </div>

        <TabsContent value="p" className="mt-4 space-y-4">
          <Card>
            <CardHeader><CardTitle>Form P — Physical &amp; Financial Progress</CardTitle></CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-4 mb-4">
                <div className="rounded-lg border p-3">
                  <p className="text-xs text-muted-foreground">Contract Amount</p>
                  <p className="text-xl font-bold">NPR {fmt(boqTotal)}</p>
                </div>
                <div className="rounded-lg border p-3">
                  <p className="text-xs text-muted-foreground">Certified to Date</p>
                  <p className="text-xl font-bold text-emerald-600">NPR {fmt(certifiedTotal)}</p>
                </div>
                <div className="rounded-lg border p-3">
                  <p className="text-xs text-muted-foreground">Progress</p>
                  <p className="text-xl font-bold">{progressPct.toFixed(1)}%</p>
                </div>
              </div>

              {ipcData && ipcData.ipcs.length > 0 ? (
                <table className="w-full text-sm">
                  <thead className="border-b bg-muted/30 text-left text-xs text-muted-foreground">
                    <tr>
                      <th className="p-2 font-medium">IPC #</th>
                      <th className="p-2 font-medium">Period</th>
                      <th className="p-2 font-medium">Status</th>
                      <th className="p-2 text-right font-medium">Gross</th>
                      <th className="p-2 text-right font-medium">Retention</th>
                      <th className="p-2 text-right font-medium">Net Payable</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ipcData.ipcs.map((ipc) => (
                      <tr key={ipc.id} className="border-b hover:bg-muted/10">
                        <td className="p-2 font-mono text-xs">{ipc.number}</td>
                        <td className="p-2 text-xs">{ipc.period ?? "—"}</td>
                        <td className="p-2"><Badge variant="outline" className="text-[10px]">{ipc.status}</Badge></td>
                        <td className="p-2 text-right">{fmt(ipc.grossAmount)}</td>
                        <td className="p-2 text-right">{fmt(ipc.retentionAmount)}</td>
                        <td className="p-2 text-right font-medium">{fmt(ipc.netPayable)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p className="text-sm text-muted-foreground">No IPCs recorded yet.</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="m" className="mt-4 space-y-4">
          <Card>
            <CardHeader><CardTitle>Form M — Material Summary</CardTitle></CardHeader>
            <CardContent>
              {requirements ? (
                <table className="w-full text-sm">
                  <thead className="border-b bg-muted/30 text-left text-xs text-muted-foreground">
                    <tr>
                      <th className="p-2 font-medium">Material</th>
                      <th className="p-2 font-medium">Unit</th>
                      <th className="p-2 text-right font-medium">Planned Qty</th>
                      <th className="p-2 text-right font-medium">Issued to Date</th>
                      <th className="p-2 text-right font-medium">Current Stock</th>
                      <th className="p-2 text-right font-medium">Remaining</th>
                    </tr>
                  </thead>
                  <tbody>
                    {requirements.requirements.map((r) => (
                      <tr key={r.materialId} className="border-b hover:bg-muted/10">
                        <td className="p-2 font-medium">{r.materialName}</td>
                        <td className="p-2 text-muted-foreground">{r.unit}</td>
                        <td className="p-2 text-right">{fmt(r.plannedQty)}</td>
                        <td className="p-2 text-right">{fmt(r.issuedQty)}</td>
                        <td className="p-2 text-right">{fmt(r.currentStock)}</td>
                        <td className="p-2 text-right">{fmt(r.remainingToProcure)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <Skeleton className="h-32" />
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="l" className="mt-4 space-y-4">
          <Card>
            <CardHeader><CardTitle>Form L — Labor &amp; Equipment Deployment</CardTitle></CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-4">
                Labor and equipment deployment tracked via daily reports. This form summarizes workforce
                and equipment usage over the reporting period.
              </p>

              <div className="rounded-lg border bg-amber-50/50 p-4 text-amber-800 text-sm dark:bg-amber-950/20 dark:text-amber-300">
                <p className="font-medium">Data source</p>
                <p className="mt-1">
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
