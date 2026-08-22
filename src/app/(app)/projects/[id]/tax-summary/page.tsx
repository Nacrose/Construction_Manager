"use client";

import { use, useState } from "react";
import { trpc } from "@/lib/trpc-client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Receipt,
  FileSpreadsheet,
  Layers,
  Plus,
  AlertTriangle,
  FileCheck,
  Scale,
} from "lucide-react";
import { AnimatedPage } from "@/components/ui/animated-page";
import { ModuleTabs } from "@/components/module-tabs";
import { PurchaseRegisterTab } from "./components/purchase-register-tab";
import { SalesRegisterTab } from "./components/sales-register-tab";
import { VatReturnTab } from "./components/vat-return-tab";
import { MissingScansTab } from "./components/missing-scans-tab";
import { LogVatBillDialog } from "./dialogs/log-vat-bill-dialog";

const FIN_TABS = [
  { label: "Payments", href: "/payments" },
  { label: "Accounting & Day Book", href: "/accounting" },
  { label: "IPC Certificates", href: "/ipc" },
  { label: "Tax Summary & VAT Registers", href: "/tax-summary" },
  { label: "Cash Flow", href: "/cash-flow" },
  { label: "Budget vs Actual", href: "/budget-variance" },
];

export default function TaxSummaryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [activeTab, setActiveTab] = useState<"purchase" | "sales" | "vat_return" | "missing_scans">("purchase");
  const [logDialogOpen, setLogDialogOpen] = useState(false);

  const utils = trpc.useUtils();
  const { data: projectInfo } = trpc.project.get.useQuery({ id }, { staleTime: 300_000 });
  const { data: pData } = trpc.vatRegister.getPurchaseRegister.useQuery({ projectId: id });
  const { data: sData } = trpc.vatRegister.getSalesRegister.useQuery({ projectId: id });

  const canWrite = projectInfo?.myRole && projectInfo.myRole !== "client" && projectInfo.myRole !== "inspector";
  const missingCount = (pData?.totals.missingScansCount || 0) + (sData?.totals.missingScansCount || 0);

  return (
    <AnimatedPage className="space-y-3 font-sans">
      {/* Top Breadcrumb & Financial Module Sub-Tabs */}
      <div className="flex flex-col gap-2">
        <ModuleTabs projectId={id} tabs={FIN_TABS} />

        {/* Page Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
          <div>
            <h1 className="text-xl font-bold tracking-tight text-foreground flex items-center gap-2">
              <Receipt className="h-5 w-5 text-primary" />
              Nepal Statutory Tax &amp; VAT Registers
            </h1>
            <p className="text-xs text-muted-foreground">
              Official Anusuchi 8 (Purchase), Anusuchi 9 (Sales), and Anusuchi 10 (Return) ledgers compliant with Nepal IRD.
            </p>
          </div>

          <div className="flex items-center gap-2">
            {canWrite && (
              <Button
                size="sm"
                onClick={() => setLogDialogOpen(true)}
                className="h-8 text-xs font-semibold gap-1.5 shadow-xs"
              >
                <Plus className="h-3.5 w-3.5" /> Log Direct VAT Bill
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Zero-Waste High-Density Sub-Tab Switcher */}
      <div className="flex items-center gap-1 border-b pb-1 text-xs font-semibold overflow-x-auto">
        <button
          type="button"
          onClick={() => setActiveTab("purchase")}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md transition-colors ${
            activeTab === "purchase"
              ? "bg-primary text-primary-foreground font-bold shadow-xs"
              : "text-muted-foreground hover:bg-muted hover:text-foreground"
          }`}
        >
          <Layers className="h-3.5 w-3.5" />
          खरिद खाता (Purchase Register - Sch 8)
          {pData?.rows.length ? (
            <span className={`text-[10px] px-1 py-0.2 rounded-full ${activeTab === "purchase" ? "bg-primary-foreground/20 text-white" : "bg-muted text-muted-foreground"}`}>
              {pData.rows.length}
            </span>
          ) : null}
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("sales")}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md transition-colors ${
            activeTab === "sales"
              ? "bg-primary text-primary-foreground font-bold shadow-xs"
              : "text-muted-foreground hover:bg-muted hover:text-foreground"
          }`}
        >
          <FileCheck className="h-3.5 w-3.5" />
          बिक्री खाता (Sales Register - Sch 9)
          {sData?.rows.length ? (
            <span className={`text-[10px] px-1 py-0.2 rounded-full ${activeTab === "sales" ? "bg-primary-foreground/20 text-white" : "bg-muted text-muted-foreground"}`}>
              {sData.rows.length}
            </span>
          ) : null}
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("vat_return")}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md transition-colors ${
            activeTab === "vat_return"
              ? "bg-primary text-primary-foreground font-bold shadow-xs"
              : "text-muted-foreground hover:bg-muted hover:text-foreground"
          }`}
        >
          <Scale className="h-3.5 w-3.5" />
          अनुसूची १० (VAT Return &amp; Reconciliation)
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("missing_scans")}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md transition-colors ${
            activeTab === "missing_scans"
              ? "bg-amber-600 text-white font-bold shadow-xs"
              : "text-muted-foreground hover:bg-muted hover:text-foreground"
          }`}
        >
          <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
          ⚠️ Missing Scans Audit
          {missingCount > 0 && (
            <Badge variant="outline" className={`text-[10px] px-1.5 py-0 border-amber-300 ${activeTab === "missing_scans" ? "bg-white/20 text-white" : "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200"}`}>
              {missingCount}
            </Badge>
          )}
        </button>
      </div>

      {/* Tab Panels */}
      <div className="pt-1">
        {activeTab === "purchase" && (
          <PurchaseRegisterTab projectId={id} canWrite={canWrite} />
        )}
        {activeTab === "sales" && (
          <SalesRegisterTab projectId={id} canWrite={canWrite} />
        )}
        {activeTab === "vat_return" && (
          <VatReturnTab projectId={id} />
        )}
        {activeTab === "missing_scans" && (
          <MissingScansTab projectId={id} canWrite={canWrite} />
        )}
      </div>

      {/* Log Direct VAT Bill Modal */}
      <LogVatBillDialog
        projectId={id}
        open={logDialogOpen}
        onOpenChange={setLogDialogOpen}
        onSuccess={() => {
          utils.vatRegister.getPurchaseRegister.invalidate({ projectId: id });
          utils.vatRegister.getSalesRegister.invalidate({ projectId: id });
          utils.vatRegister.getVatReturnSchedule10.invalidate({ projectId: id });
        }}
      />
    </AnimatedPage>
  );
}
