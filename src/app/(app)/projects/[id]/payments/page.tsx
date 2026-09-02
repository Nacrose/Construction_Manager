"use client";
import { use, useState } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { ModuleTabs } from "@/components/module-tabs";
import { RetentionTab } from "./components/retention-tab";
import {
  Users,
  Building2,
  AlertCircle,
  Plus,
  Search,
  Download,
  Phone,
  FileText,
  CheckCircle2,
  Receipt,
  Eye,
  Loader2,
} from "lucide-react";
import { trpc } from "@/lib/trpc-client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { format } from "date-fns";
import { formatNpr } from "@/lib/currency";
import { StatusBadge } from "@/components/ui/status-badge";
import { RecordPaymentDialog } from "./components/record-payment-dialog";
import { AddClaimDialog } from "./components/add-claim-dialog";
import { ConstructionTable, ConstructionTableColumn } from "@/components/ui/construction-table";
import * as XLSX from "@e965/xlsx";
import { toast } from "sonner";

export const FIN_TABS = [
  { label: "Day Book & Cashbook", href: "/accounting" },
  { label: "Parties & Payables", href: "/payments" },
  { label: "Reports & Compliance", href: "/tax-summary" },
];

export default function PaymentsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [searchParty, setSearchParty] = useState("");
  const [selectedParty, setSelectedParty] = useState<{
    id: string;
    name: string;
    type: "vendor" | "subcontractor" | "staff";
    pan?: string | null;
    phone?: string | null;
  } | null>(null);

  const [recordPaymentOpen, setRecordPaymentOpen] = useState(false);
  const [addClaimOpen, setAddClaimOpen] = useState(false);
  const [payableToSettle, setPayableToSettle] = useState<any | null>(null);

  const utils = trpc.useUtils();

  // Queries
  const { data: payablesData, isLoading: payablesLoading } = trpc.projectOps.payment.outstandingPayables.useQuery({ projectId: id });
  const { data: accountsData } = trpc.accounting.ledgerAccounts.useQuery({ projectId: id });

  const summary = payablesData?.summary || {
    totalVendorDue: 0,
    totalSubcontractorDue: 0,
    totalStaffDue: 0,
    totalDue: 0,
    vendorBillsCount: 0,
    subBillsCount: 0,
    staffBillsCount: 0,
    totalCount: 0,
  };

  const rawAccounts = accountsData?.accounts || [];
  const partiesList = rawAccounts.filter((a) => a.type === "vendor" || a.type === "subcontractor" || a.type === "staff");

  // Default to first party
  const activeParty = selectedParty || (partiesList.length > 0 ? (partiesList[0] as any) : null);

  // Statement query for active party
  const { data: statementData, isLoading: statementLoading } = trpc.accounting.ledgerStatement.useQuery(
    {
      projectId: id,
      accountId: activeParty?.id || "",
      accountType: activeParty?.type || "vendor",
      accountName: activeParty?.name,
    },
    { enabled: !!activeParty }
  );

  const transactions = statementData?.transactions || [];
  const closingBalance = statementData?.closingBalance || 0;
  const totalDebit = statementData?.totalDebit || 0;
  const totalCredit = statementData?.totalCredit || 0;


  const filteredParties = partiesList.filter((p) => {
    if (!searchParty) return true;
    const q = searchParty.toLowerCase();
    return p.name.toLowerCase().includes(q) || (p.pan && p.pan.includes(q)) || (p.phone && p.phone.includes(q));
  });

  const handleExportStatement = () => {
    if (!transactions.length || !activeParty) {
      toast.info("No statement entries to export");
      return;
    }
    const headers = ["Miti", "Date", "Voucher #", "Type", "Particulars", "Debit (Paid)", "Credit (Billed)", "Balance"];
    const exportRows = transactions.map((t) => ({
      Miti: t.miti || "",
      Date: t.date ? format(new Date(t.date), "yyyy-MM-dd") : "",
      "Voucher #": t.voucherNo,
      Type: t.voucherType,
      Particulars: t.particulars,
      "Debit (Paid)": t.debit,
      "Credit (Billed)": t.credit,
      Balance: t.runningBalance,
    }));
    const ws = XLSX.utils.json_to_sheet(exportRows, { header: headers });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Statement");
    XLSX.writeFile(wb, `${activeParty.name}_Statement.xlsx`);
    toast.success("Statement exported successfully");
  };

  const columns: ConstructionTableColumn<any>[] = [
    {
      key: "date",
      header: "Date (BS/AD)",
      render: (_, t) => (
        <div className="font-mono text-xs">
          <div className="font-bold text-foreground leading-tight">{t.miti || "—"}</div>
          <div className="text-[10px] text-muted-foreground leading-tight">
            {t.date ? format(new Date(t.date), "yyyy-MM-dd") : "—"}
          </div>
        </div>
      ),
    },
    {
      key: "voucherNo",
      header: "Voucher #",
      render: (_, t) => <span className="font-bold text-primary font-mono text-xs">{t.voucherNo}</span>,
    },
    {
      key: "voucherType",
      header: "Type",
      render: (_, t) => (
        <Badge variant="outline" className="text-[10px] font-mono py-0 px-1.5 h-5">
          {t.voucherType}
        </Badge>
      ),
    },
    {
      key: "particulars",
      header: "Particulars",
      render: (_, t) => (
        <span className="font-sans font-medium text-foreground truncate max-w-sm block text-xs" title={t.particulars}>
          {t.particulars}
        </span>
      ),
    },
    {
      key: "debit",
      header: "Debit (Dr - Paid)",
      align: "right",
      render: (_, t) => (
        <span className="font-bold font-mono text-xs text-primary">
          {t.debit > 0 ? formatNpr(t.debit) : "—"}
        </span>
      ),
    },
    {
      key: "credit",
      header: "Credit (Cr - Billed)",
      align: "right",
      render: (_, t) => (
        <span className="font-bold font-mono text-xs text-amber-600 dark:text-amber-400">
          {t.credit > 0 ? formatNpr(t.credit) : "—"}
        </span>
      ),
    },
    {
      key: "runningBalance",
      header: "Balance",
      align: "right",
      render: (_, t) => (
        <span className="font-bold font-mono text-xs text-foreground">
          {formatNpr(t.runningBalance)}
        </span>
      ),
    },
  ];

  return (
    <>
      <ModuleTabs projectId={id} tabs={FIN_TABS} />
      <div className="space-y-4 p-4 pb-12">
        {/* KPI Strip */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
          <div className="rounded-xl border border-border/80 bg-card p-3.5 space-y-1">
            <div className="text-[10px] font-mono text-muted-foreground uppercase">
              Total Outstanding Payables (कुल तिर्न बाँकी)
            </div>
            <div className="text-xl font-bold font-mono text-amber-600 dark:text-amber-400">
              {formatNpr(summary.totalDue)}
            </div>
            <div className="text-[11px] text-muted-foreground font-mono">
              {summary.totalCount} total unsettled claims
            </div>
          </div>

          <div className="rounded-xl border border-border/80 bg-card p-3.5 space-y-1">
            <div className="text-[10px] font-mono text-muted-foreground uppercase">
              Supplier Payables (सामग्री आपूर्तिकर्ता)
            </div>
            <div className="text-xl font-bold font-mono text-foreground">
              {formatNpr(summary.totalVendorDue)}
            </div>
            <div className="text-[11px] text-muted-foreground font-mono">
              {summary.vendorBillsCount} vendor invoices
            </div>
          </div>

          <div className="rounded-xl border border-border/80 bg-card p-3.5 space-y-1">
            <div className="text-[10px] font-mono text-muted-foreground uppercase">
              Subcontractor Payables (पेटी ठेकेदार)
            </div>
            <div className="text-xl font-bold font-mono text-foreground">
              {formatNpr(summary.totalSubcontractorDue)}
            </div>
            <div className="text-[11px] text-muted-foreground font-mono">
              {summary.subBillsCount} verified bills
            </div>
          </div>

          <div className="rounded-xl border border-border/80 bg-card p-3.5 space-y-1">
            <div className="text-[10px] font-mono text-muted-foreground uppercase">
              Staff / Petty Cash Payables (स्टाफ / खर्च)
            </div>
            <div className="text-xl font-bold font-mono text-foreground">
              {formatNpr(summary.totalStaffDue)}
            </div>
            <div className="text-[11px] text-muted-foreground font-mono">
              {summary.staffBillsCount} expense claims
            </div>
          </div>
        </div>

        {/* Master-Detail Split Ledger */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-start min-h-[580px]">
          {/* Left Column: Parties Directory */}
          <div className="md:col-span-4 rounded-xl border bg-card p-3 space-y-3 flex flex-col h-full max-h-[640px]">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                <Users className="h-4 w-4 text-primary" />
                <span className="text-xs font-bold uppercase font-mono tracking-wide text-foreground">
                  Parties & Creditors ({partiesList.length})
                </span>
              </div>
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs font-mono gap-1"
                onClick={() => setAddClaimOpen(true)}
              >
                <Plus className="h-3 w-3" /> Add Bill
              </Button>
            </div>

            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                value={searchParty}
                onChange={(e) => setSearchParty(e.target.value)}
                placeholder="Search vendor, sub, PAN..."
                className="h-8 text-xs pl-8 font-mono"
              />
            </div>

            <div className="flex-1 overflow-y-auto space-y-1 pr-1">
              {filteredParties.map((p) => {
                const isSelected = activeParty?.id === p.id && activeParty?.type === p.type;
                const isSupplier = p.type === "vendor";
                const isSub = p.type === "subcontractor";

                return (
                  <div
                    key={`${p.type}-${p.id}`}
                    onClick={() => setSelectedParty(p as any)}
                    className={cn(
                      "p-2.5 rounded-lg border cursor-pointer transition select-none flex items-center justify-between gap-2",
                      isSelected
                        ? "bg-primary/10 border-primary/40 shadow-xs"
                        : "bg-muted/20 border-transparent hover:bg-muted/50"
                    )}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="font-semibold text-xs text-foreground truncate">{p.name}</span>
                        <Badge
                          variant="secondary"
                          className={cn(
                            "text-[9px] px-1 py-0 uppercase font-mono shrink-0",
                            isSupplier
                              ? "bg-info/15 text-info dark:bg-[var(--navy-deep)] dark:text-info/80"
                              : isSub
                              ? "bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300"
                              : "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                          )}
                        >
                          {p.type}
                        </Badge>
                      </div>
                      <div className="text-[10px] text-muted-foreground font-mono flex items-center gap-2 mt-0.5">
                        {p.pan && <span>PAN: {p.pan}</span>}
                        {p.phone && <span>Ph: {p.phone}</span>}
                      </div>
                    </div>

                    <div className="text-right font-mono text-xs">
                      <span
                        className={cn(
                          "font-bold",
                          ((p as any).balance || 0) > 0 ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground"
                        )}
                      >
                        {formatNpr((p as any).balance || 0)}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Right Column: Live Statement & Settlement Ledger */}
          <div className="md:col-span-8 space-y-3">
            {activeParty ? (
              <div className="rounded-xl border bg-card p-4 space-y-3">
                {/* Active Party Header */}
                <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b">
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-base font-bold text-foreground">{activeParty.name}</h2>
                      <Badge variant="outline" className="text-[10px] font-mono capitalize">
                        {activeParty.type}
                      </Badge>
                    </div>
                    <div className="text-xs text-muted-foreground font-mono mt-0.5 flex items-center gap-3">
                      {activeParty.pan && <span>PAN: {activeParty.pan}</span>}
                      {activeParty.phone && <span>Ph: {activeParty.phone}</span>}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <div className="text-right font-mono px-3 py-1 bg-muted/40 rounded-lg border">
                      <div className="text-[10px] text-muted-foreground uppercase">Closing Balance</div>
                      <div
                        className={cn(
                          "text-sm font-bold",
                          closingBalance > 0 ? "text-amber-600 dark:text-amber-400" : "text-foreground"
                        )}
                      >
                        {formatNpr(closingBalance)}
                      </div>
                    </div>

                    <Button
                      size="sm"
                      variant="outline"
                      onClick={handleExportStatement}
                      disabled={transactions.length === 0}
                      className="h-8 text-xs font-mono gap-1"
                    >
                      <Download className="h-3 w-3" /> Export
                    </Button>

                    <Button
                      size="sm"
                      onClick={() => {
                        setPayableToSettle({
                          entityType: activeParty.type === "subcontractor" ? "subcontractor" : "vendor",
                          entityId: activeParty.id,
                          entityName: activeParty.name,
                          entityPan: activeParty.pan,
                          billNumber: `ACC-${activeParty.id.slice(-4)}`,
                          balanceDue: Math.abs(closingBalance),
                          tdsAmount: 0,
                          category: "General",
                        });
                        setRecordPaymentOpen(true);
                      }}
                      className="h-8 text-xs font-bold font-mono bg-emerald-600 hover:bg-emerald-700 text-white"
                    >
                      Pay Now (भुक्तानी)
                    </Button>
                  </div>
                </div>

                {/* Live Running Statement Table with ConstructionTable */}
                <ConstructionTable
                  data={transactions}
                  columns={columns}
                  isLoading={statementLoading}
                  searchPlaceholder="Search transactions in statement..."
                  searchFilterKeys={["voucherNo", "voucherType", "particulars"]}
                />
              </div>
            ) : (
              <div className="rounded-xl border border-dashed p-16 text-center text-muted-foreground">
                <Users className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm font-medium">Select a party on the left to view statement</p>
              </div>
            )}
          </div>
        </div>

        {/* Retention Money — held vs released per subcontractor, with the
            release-payment flow. Previously this component existed but was
            never mounted anywhere, leaving retention management unreachable
            from the UI. */}
        <div className="rounded-xl border border-border/80 bg-card p-4 space-y-3">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold uppercase font-mono tracking-wide text-foreground">
              Retention Money (धरौटी)
            </span>
          </div>
          <RetentionTab projectId={id} />
        </div>
      </div>
      {recordPaymentOpen && (
        <RecordPaymentDialog
          projectId={id}
          open={recordPaymentOpen}
          onOpenChange={setRecordPaymentOpen}
          initialPayable={payableToSettle}
          onSuccess={() => {
            utils.projectOps.payment.outstandingPayables.invalidate({ projectId: id });
            utils.accounting.ledgerStatement.invalidate();
            setRecordPaymentOpen(false);
          }}
        />
      )}


      {/* Add Claim Dialog */}
      {addClaimOpen && (
        <AddClaimDialog
          projectId={id}
          open={addClaimOpen}
          onOpenChange={setAddClaimOpen}
          onSuccess={() => {
            utils.projectOps.payment.outstandingPayables.invalidate({ projectId: id });
            utils.accounting.ledgerAccounts.invalidate();
            setAddClaimOpen(false);
          }}
        />
      )}
    </>
  );
}
