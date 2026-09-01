"use client";

import { use, useState } from "react";
import { trpc } from "@/lib/trpc-client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
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


export default function TaxSummaryPage({
  params,
  embedded = false,
}: {
  params: Promise<{ id: string }>;
  /** When embedded in /finance, the host owns the tab bar — do not render ModuleTabs. */
  embedded?: boolean;
}) {
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
    <AnimatedPage className="space-y-2.5 font-sans">
      {!embedded && <ModuleTabs projectId={id} cluster="finance-compact" />}

      {/* Ultra-Clean Single-Line Sub-Tab Switcher & Action Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#c7d8e8] pb-1">
        <div className="flex items-center gap-1 text-xs font-semibold overflow-x-auto">
          <button
            type="button"
            onClick={() => setActiveTab("purchase")}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-colors",
              activeTab === "purchase"
                ? "bg-[#f8fbfe] text-[#0284c7] border border-emerald-500/30 font-bold"
                : "text-slate-500 hover:text-slate-900"
            )}
          >
            <Layers className="h-3.5 w-3.5" />
            खरिद खाता (Purchase Sch-8)
            {pData?.rows.length ? (
              <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-emerald-500/20 text-[#0284c7] font-mono">
                {pData.rows.length}
              </span>
            ) : null}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("sales")}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-colors",
              activeTab === "sales"
                ? "bg-[#f8fbfe] text-[#0284c7] border border-emerald-500/30 font-bold"
                : "text-slate-500 hover:text-slate-900"
            )}
          >
            <Receipt className="h-3.5 w-3.5" />
            बिक्री खाता (Sales Sch-9)
            {sData?.rows.length ? (
              <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-emerald-500/20 text-[#0284c7] font-mono">
                {sData.rows.length}
              </span>
            ) : null}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("vat_return")}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-colors",
              activeTab === "vat_return"
                ? "bg-[#f8fbfe] text-[#0284c7] border border-emerald-500/30 font-bold"
                : "text-slate-500 hover:text-slate-900"
            )}
          >
            <Scale className="h-3.5 w-3.5" />
            अनुसूची १० (VAT Return)
          </button>

          {missingCount > 0 && (
            <button
              type="button"
              onClick={() => setActiveTab("missing_scans")}
              className={cn(
                "flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg transition-colors text-amber-400 hover:bg-amber-500/10",
                activeTab === "missing_scans" && "bg-amber-500/20 font-bold"
              )}
            >
              <AlertTriangle className="h-3.5 w-3.5" />
              Missing Scans ({missingCount})
            </button>
          )}
        </div>

        {canWrite && (
          <Button
            size="sm"
            onClick={() => setLogDialogOpen(true)}
            className="h-8 px-3.5 text-xs font-bold amber-cta-btn rounded-xl shadow-[0_0_15px_rgba(0,255,102,0.3)] transition gap-1.5"
          >
            <Plus className="h-3.5 w-3.5" /> + Log Direct VAT Bill
          </Button>
        )}
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
