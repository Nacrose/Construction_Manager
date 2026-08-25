"use client";
import { use, useState } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { ModuleTabs } from "@/components/module-tabs";
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
  ArrowDownRight,
  ArrowUpRight,
  Receipt,
  Eye,
  Loader2,
  LayoutList,
} from "lucide-react";
import { trpc } from "@/lib/trpc-client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { format } from "date-fns";
import { adToBs } from "@/lib/nepali-calendar";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { RecordPaymentDialog } from "./components/record-payment-dialog";
import { AddClaimDialog } from "./components/add-claim-dialog";
import * as XLSX from "@e965/xlsx";

export const FIN_TABS = [
  { label: "Day Book & Cashbook", href: "/accounting" },
  { label: "Parties & Payables", href: "/payments" },
  { label: "Reports & Compliance", href: "/tax-summary" },
];

function fmt(n: number) {
  return n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function PaymentsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [isCompact, setIsCompact] = useState(true);
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

  // Form states for Add Bill / Claim Modal
  const [claimPartyName, setClaimPartyName] = useState("");
  const [claimPan, setClaimPan] = useState("");
  const [claimCategory, setClaimCategory] = useState("site_expense");
  const [claimAmount, setClaimAmount] = useState("");
  const [claimDesc, setClaimDesc] = useState("");
  const [claimBillNo, setClaimBillNo] = useState("");

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
    { enabled: Boolean(activeParty) }
  );

  const transactions = statementData?.transactions || [];
  const closingBalance = statementData?.closingBalance || 0;
  const totalDebit = statementData?.totalDebit || 0;
  const totalCredit = statementData?.totalCredit || 0;

  const filteredParties = partiesList.filter((p) => {
    if (!searchParty.trim()) return true;
    const q = searchParty.toLowerCase();
    return p.name.toLowerCase().includes(q) || (p.pan && p.pan.includes(q));
  });

  // Mutation for adding a bill / claim
  const logVatBillMut = trpc.vatRegister.createDirectVatBill.useMutation({
    onSuccess: () => {
      toast.success("Bill / Expense Claim registered successfully!");
      setAddClaimOpen(false);
      setClaimPartyName("");
      setClaimAmount("");
      setClaimDesc("");
      setClaimBillNo("");
      utils.projectOps.payment.outstandingPayables.invalidate();
      utils.accounting.ledgerAccounts.invalidate();
      utils.accounting.ledgerStatement.invalidate();
      utils.accounting.dayBook.invalidate();
    },
    onError: (err) => {
      toast.error(err.message || "Failed to log bill / claim");
    },
  });

  const handleExportStatement = () => {
    if (!activeParty) return;
    try {
      const rows = transactions.map((t, idx) => [
        idx + 1,
        t.date ? format(new Date(t.date), "yyyy-MM-dd") : "—",
        t.miti || "—",
        t.voucherNo,
        t.voucherType,
        t.particulars,
        t.debit,
        t.credit,
        t.runningBalance,
      ]);

      const wsData = [
        [`STATEMENT OF ACCOUNT: ${activeParty.name.toUpperCase()}`],
        [`Party Type: ${activeParty.type.toUpperCase()}`, `PAN: ${activeParty.pan || "N/A"}`],
        ["S.N.", "Date (AD)", "Miti (BS)", "Voucher No", "Type", "Particulars", "Debit (NPR)", "Credit (NPR)", "Balance (NPR)"],
        ...rows,
        ["", "", "", "", "", "TOTAL", totalDebit, totalCredit, closingBalance],
      ];

      const ws = XLSX.utils.aoa_to_sheet(wsData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Statement");
      XLSX.writeFile(wb, `${activeParty.name}_Statement_${format(new Date(), "yyyy-MM-dd")}.xlsx`);
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <>
      <ModuleTabs projectId={id} tabs={FIN_TABS} />
      <div className="space-y-3 pb-8">
        {/* Compact Top Summary Strip */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2 rounded-xl border border-white/10 bg-[#000000] text-xs font-mono">
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2">
              <span className="text-gray-400">Total Payables:</span>
              <span className="font-bold text-red-400">NPR {fmt(summary.totalDue)}</span>
            </div>
            <div className="h-3 w-[1px] bg-white/10" />
            <div className="flex items-center gap-2">
              <span className="text-gray-400">Vendors Due:</span>
              <span className="font-bold text-amber-400">NPR {fmt(summary.totalVendorDue)}</span>
            </div>
            <div className="h-3 w-[1px] bg-white/10" />
            <div className="flex items-center gap-2">
              <span className="text-gray-400">Subs & Staff Due:</span>
              <span className="font-bold text-blue-400">NPR {fmt(summary.totalSubcontractorDue + summary.totalStaffDue)}</span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-[11px] text-gray-500 font-mono">
              {filteredParties.length} Parties
            </span>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setIsCompact(!isCompact)}
              className="h-7 px-2 text-[11px] gap-1 font-mono bg-[#121820] text-gray-300 border-white/10 hover:text-white rounded-lg"
              title={isCompact ? "Switch to Comfortable View" : "Switch to Compact View"}
            >
              <LayoutList className="h-3 w-3 text-emerald-400" />
              {isCompact ? "Compact" : "Comfortable"}
            </Button>
          </div>
        </div>

        {/* 2-Column Khatabook Split Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          {/* Left Column: Parties Directory (4 cols) */}
          <div className="lg:col-span-4 space-y-3 rounded-2xl border border-white/10 bg-[#0c1015] p-3.5">
            <div className="flex items-center justify-between pb-2 border-b border-white/5">
              <span className="text-xs font-bold text-white uppercase tracking-wider">
                Suppliers & Contractors ({filteredParties.length})
              </span>
            </div>

            <div className="relative">
              <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-gray-400" />
              <Input
                placeholder="Search party by name or PAN..."
                className="pl-8 h-9 text-xs bg-[#121820] text-white rounded-xl border-white/10 focus:border-emerald-400"
                value={searchParty}
                onChange={(e) => setSearchParty(e.target.value)}
              />
            </div>

            <div className="space-y-1.5 max-h-[620px] overflow-y-auto pr-1 custom-scrollbar">
              {filteredParties.length === 0 ? (
                <div className="py-12 text-center text-xs text-gray-400">
                  No parties found matching "{searchParty}"
                </div>
              ) : (
                filteredParties.map((p) => {
                  const isSelected = activeParty?.id === p.id;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setSelectedParty(p as any)}
                      className={cn(
                        "w-full text-left p-3 rounded-xl border transition-all text-xs flex items-center justify-between group",
                        isSelected
                          ? "bg-emerald-500/10 border-emerald-500/40 text-white shadow-[0_0_15px_rgba(0,255,102,0.06)]"
                          : "border-white/5 bg-[#121820]/60 hover:bg-[#121820] text-gray-300 hover:text-white"
                      )}
                    >
                      <div className="space-y-1 min-w-0 pr-2">
                        <div className="font-semibold truncate text-white flex items-center gap-1.5">
                          {p.name}
                        </div>
                        <div className="text-[10px] text-gray-400 truncate font-mono">
                          {p.type === "vendor"
                            ? "Material Supplier"
                            : p.type === "subcontractor"
                            ? "Subcontractor"
                            : "Staff Member"}
                          {p.pan ? ` • PAN: ${p.pan}` : ""}
                        </div>
                      </div>

                      <div className="text-right shrink-0">
                        <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-mono font-semibold bg-white/5 border border-white/10 text-gray-300">
                          View खाता →
                        </span>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>

          {/* Right Column: Statement of Account / Bahi Khata (8 cols) */}
          <div className="lg:col-span-8 rounded-2xl border border-white/10 bg-[#0c1015] p-5 flex flex-col min-h-[620px]">
            {activeParty ? (
              <div className="space-y-4 flex-1 flex flex-col">
                {/* Party Header Bar */}
                <div className="flex flex-wrap items-center justify-between gap-3 p-4 rounded-xl border border-emerald-500/20 bg-[#121820]">
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2">
                      <h2 className="text-lg font-bold text-white tracking-tight">{activeParty.name}</h2>
                      <Badge variant="outline" className="text-[10px] font-mono border-emerald-500/30 text-emerald-400 bg-emerald-500/10">
                        {activeParty.type.toUpperCase()}
                      </Badge>
                    </div>
                    <p className="text-xs text-gray-400 font-mono">
                      {activeParty.pan ? `PAN: ${activeParty.pan}` : "Statement of Account (बही खाता)"}
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={handleExportStatement}
                      className="h-8 text-xs bg-[#0c1015] text-gray-300 border-white/10 hover:text-white rounded-lg gap-1.5"
                    >
                      <Download className="h-3 w-3 text-emerald-400" /> Export Excel
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
                      className="h-8 text-xs font-bold bg-[#00ff66] text-black hover:bg-[#00e65c] rounded-lg shadow-[0_0_15px_rgba(0,255,102,0.3)] transition gap-1"
                    >
                      Pay Now (भुक्तानी)
                    </Button>
                  </div>
                </div>

                {/* Live Running Statement Table */}
                <div className="flex-1 overflow-x-auto rounded-xl border border-white/10 bg-[#121820]">
                  {statementLoading ? (
                    <div className="p-16 text-center text-xs text-gray-400">
                      <Loader2 className="h-5 w-5 animate-spin mx-auto mb-2 text-emerald-400" />
                      Loading statement...
                    </div>
                  ) : transactions.length === 0 ? (
                    <div className="p-16 text-center text-xs text-gray-400">
                      <FileText className="h-8 w-8 mx-auto text-gray-600 mb-2" />
                      No bills or payment transactions recorded yet for this party.
                    </div>
                  ) : (
                    <table className="w-full text-left text-xs font-mono">
                      <thead className="border-b border-white/10 bg-[#0c1015] uppercase text-[10px] text-gray-400">
                        <tr>
                          <th className={cn(isCompact ? "px-3 py-1.5" : "px-3 py-3")}>Date (BS/AD)</th>
                          <th className={cn(isCompact ? "px-2.5 py-1.5" : "px-3 py-3")}>Voucher #</th>
                          <th className={cn(isCompact ? "px-2.5 py-1.5" : "px-3 py-3")}>Type</th>
                          <th className={cn("font-sans", isCompact ? "px-3 py-1.5" : "px-4 py-3")}>Particulars</th>
                          <th className={cn("text-right", isCompact ? "px-2.5 py-1.5" : "px-3 py-3")}>Debit (Dr - Paid)</th>
                          <th className={cn("text-right", isCompact ? "px-2.5 py-1.5" : "px-3 py-3")}>Credit (Cr - Billed)</th>
                          <th className={cn("text-right", isCompact ? "px-2.5 py-1.5" : "px-3 py-3")}>Balance</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/5">
                        {transactions.map((t, idx) => (
                          <tr key={idx} className="hover:bg-white/[0.02] transition-colors">
                            <td className={cn(isCompact ? "px-3 py-1.5" : "px-3 py-2.5")}>
                              <div className="font-bold text-white leading-tight">{t.miti || "—"}</div>
                              <div className="text-[10px] text-gray-400 leading-tight">{t.date ? format(new Date(t.date), "yyyy-MM-dd") : "—"}</div>
                            </td>
                            <td className={cn("font-bold text-emerald-400", isCompact ? "px-2.5 py-1.5 text-xs" : "px-3 py-2.5")}>{t.voucherNo}</td>
                            <td className={cn(isCompact ? "px-2.5 py-1.5" : "px-3 py-2.5")}>
                              <Badge variant="outline" className="text-[10px] bg-white/5 border-white/10 text-gray-300 font-mono py-0 px-1.5 h-5">
                                {t.voucherType}
                              </Badge>
                            </td>
                            <td className={cn("font-sans font-medium text-white truncate max-w-sm", isCompact ? "px-3 py-1.5 text-xs" : "px-4 py-2.5")}>{t.particulars}</td>
                            <td className={cn("text-right font-bold text-emerald-400", isCompact ? "px-2.5 py-1.5" : "px-3 py-2.5")}>
                              {t.debit > 0 ? fmt(t.debit) : "—"}
                            </td>
                            <td className={cn("text-right font-bold text-red-400", isCompact ? "px-2.5 py-1.5" : "px-3 py-2.5")}>
                              {t.credit > 0 ? fmt(t.credit) : "—"}
                            </td>
                            <td className={cn("text-right font-bold font-mono text-white", isCompact ? "px-2.5 py-1.5" : "px-3 py-2.5")}>
                              {fmt(t.runningBalance)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot className="border-t-2 border-white/10 bg-[#0c1015] font-bold text-white">
                        <tr>
                          <td colSpan={4} className={cn("text-right uppercase", isCompact ? "px-3 py-1.5 text-xs" : "px-4 py-3")}>
                            Total / Net Balance (जम्मा):
                          </td>
                          <td className={cn("text-right text-emerald-400", isCompact ? "px-2.5 py-1.5" : "px-3 py-3")}>
                            NPR {fmt(totalDebit)}
                          </td>
                          <td className={cn("text-right text-red-400", isCompact ? "px-2.5 py-1.5" : "px-3 py-3")}>
                            NPR {fmt(totalCredit)}
                          </td>
                          <td className={cn("text-right font-bold", closingBalance >= 0 ? "text-red-400" : "text-emerald-400", isCompact ? "px-2.5 py-1.5" : "px-3 py-3")}>
                            NPR {fmt(Math.abs(closingBalance))} {closingBalance >= 0 ? "(Dr Due)" : "(Cr Adv)"}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center p-12 text-center text-xs text-gray-400">
                <Users className="h-10 w-10 text-gray-600 mb-2" />
                Select a party from the left directory to view their live statement of account.
              </div>
            )}
          </div>
        </div>

        {/* Modal 1: Record Payment / Disbursement (Outflow) */}
        <RecordPaymentDialog
          projectId={id}
          open={recordPaymentOpen}
          onOpenChange={setRecordPaymentOpen}
          initialPayable={payableToSettle}
          onSuccess={() => setPayableToSettle(null)}
        />

        {/* Modal 2: Add Bill / Staff Expense Claim */}
        <AddClaimDialog
          projectId={id}
          open={addClaimOpen}
          onOpenChange={setAddClaimOpen}
        />
      </div>
    </>
  );
}

