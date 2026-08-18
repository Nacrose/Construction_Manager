"use client";

import { use, useState } from "react";
import Link from "next/link";
import { trpc } from "@/lib/trpc-client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Receipt, FileText, Package, Download,
} from "lucide-react";
import { AnimatedPage } from "@/components/ui/animated-page";
import { exportIpcTaxToXlsx, exportMaterialTaxToXlsx } from "@/lib/export-excel";
import { toast } from "sonner";
import { ModuleTabs } from "@/components/module-tabs";
import { IpcTaxTab } from "./components/ipc-tax-tab";
import { MaterialTaxTab } from "./components/material-tax-tab";

const FIN_TABS = [
  { label: "Payments", href: "/payments" },
  { label: "IPC Certificates", href: "/ipc" },
  { label: "Tax Summary", href: "/tax-summary" },
  { label: "Cash Flow", href: "/cash-flow" },
  { label: "Budget vs Actual", href: "/budget-variance" },
];

export default function TaxSummaryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [tab, setTab] = useState<"ipc" | "materials">("ipc");
  const [ipcStatus, setIpcStatus] = useState<string>("all");

  // Convert local date inputs to ISO strings for the API
  const fromIso = fromDate ? new Date(fromDate + "T00:00:00").toISOString() : undefined;
  const toIso = toDate ? new Date(toDate + "T23:59:59").toISOString() : undefined;

  const ipcQuery = trpc.ipc.taxSummary.useQuery({
    projectId: id,
    fromDate: fromIso,
    toDate: toIso,
    ...(ipcStatus !== "all" ? { status: ipcStatus as any } : {}),
  });

  const materialQuery = trpc.material.taxSummary.useQuery({
    projectId: id,
    fromDate: fromIso,
    toDate: toIso,
  });

  const { data: projectInfo } = trpc.project.get.useQuery({ id }, { staleTime: 300_000 });
  const projectName = projectInfo?.project?.name ?? "Project";

  async function handleExportIpc() {
    if (!ipcQuery.data) return;
    try {
      await exportIpcTaxToXlsx(
        ipcQuery.data.ipcs,
        ipcQuery.data.byMonth,
        ipcQuery.data.totals,
        projectName
      );
      toast.success("Excel exported");
    } catch (e) {
      toast.error("Export failed");
    }
  }

  async function handleExportMaterial() {
    if (!materialQuery.data) return;
    try {
      await exportMaterialTaxToXlsx(
        materialQuery.data.transactions.map((t: any) => ({
          date: t.date,
          materialName: t.material?.name ?? "",
          quantity: t.quantity,
          unit: t.unit,
          rate: t.rate,
          baseAmount: t.quantity * t.rate,
          vatPercent: t.vatPercent ?? 0,
          vatAmount: t.vatAmount ?? 0,
          tdsPercent: t.tdsPercent ?? 0,
          tdsAmount: t.tdsAmount ?? 0,
          netPayable: t.netPayable ?? 0,
          supplierInvoiceNo: t.supplierInvoiceNo,
          supplierPan: t.supplierPan,
        })),
        materialQuery.data.bySupplier,
        materialQuery.data.byMonth,
        materialQuery.data.totals,
        projectName
      );
      toast.success("Excel exported");
    } catch (e) {
      toast.error("Export failed");
    }
  }

  return (
    <>
      <ModuleTabs projectId={id} tabs={FIN_TABS} />
      <AnimatedPage className="space-y-6 pb-8">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Link href={`/projects/${id}`} className="hover:text-foreground">Project</Link>
              <span>/</span>
              <span>Tax Summary</span>
            </div>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight flex items-center gap-2">
            <Receipt className="h-6 w-6" /> Tax Summary (VAT / TDS)
          </h1>
          <p className="text-sm text-muted-foreground">
            Aggregated VAT collected and TDS deducted across IPCs and material purchases.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => tab === "ipc" ? handleExportIpc() : handleExportMaterial()}
          disabled={tab === "ipc" ? !ipcQuery.data?.ipcs?.length : !materialQuery.data?.transactions?.length}
        >
          <Download className="h-4 w-4 mr-1" />
          Export Excel
        </Button>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-wrap items-end gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs">From date</Label>
              <Input
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                className="w-40"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">To date</Label>
              <Input
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                className="w-40"
              />
            </div>
            {tab === "ipc" && (
              <div className="space-y-1.5">
                <Label className="text-xs">IPC Status</Label>
                <Select value={ipcStatus} onValueChange={setIpcStatus}>
                  <SelectTrigger className="w-36 h-9 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All statuses</SelectItem>
                    <SelectItem value="draft">Draft</SelectItem>
                    <SelectItem value="submitted">Submitted</SelectItem>
                    <SelectItem value="certified">Certified</SelectItem>
                    <SelectItem value="approved">Approved</SelectItem>
                    <SelectItem value="paid">Paid</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
            <Button
              variant="outline"
              size="sm"
              className="ml-auto"
              onClick={() => {
                setFromDate("");
                setToDate("");
                setIpcStatus("all");
              }}
            >
              Clear filters
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Tabs */}
      <div className="flex gap-2 border-b">
        <button
          onClick={() => setTab("ipc")}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition ${
            tab === "ipc"
              ? "border-amber-500 text-amber-700 dark:text-amber-400"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <FileText className="inline h-4 w-4 mr-1.5" />
          IPC Tax
        </button>
        <button
          onClick={() => setTab("materials")}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition ${
            tab === "materials"
              ? "border-amber-500 text-amber-700 dark:text-amber-400"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <Package className="inline h-4 w-4 mr-1.5" />
          Material Tax
        </button>
      </div>

      {/* Content */}
      {tab === "ipc" ? (
        <IpcTaxTab query={ipcQuery} />
      ) : (
        <MaterialTaxTab query={materialQuery} />
        )}
      </AnimatedPage>
    </>
  );
}


