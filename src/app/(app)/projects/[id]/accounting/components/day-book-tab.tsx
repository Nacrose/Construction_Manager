"use client";

import { useState } from "react";
import * as XLSX from "@e965/xlsx";
import { trpc } from "@/lib/trpc-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  BookOpen,
  Search,
  Download,
  Calendar,
  Filter,
  Eye,
  ArrowDownRight,
  ArrowUpRight,
  Receipt,
  FileSpreadsheet,
  Plus,
  Loader2,
  LayoutList,
  Maximize2,
  Building,
} from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { format } from "date-fns";
import { adToBs, bsToAd } from "@/lib/nepali-calendar";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { RecordPaymentDialog } from "../../payments/components/record-payment-dialog";
import { AddClaimDialog } from "../../payments/components/add-claim-dialog";
import { NepaliDatePicker } from "@/components/ui/nepali-date-picker";

function fmt(n: number) {
  return n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function DayBookTab({ projectId }: { projectId?: string }) {
  const utils = trpc.useUtils();
  const [isCompact, setIsCompact] = useState(true);
  const [voucherType, setVoucherType] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [recordInflowOpen, setRecordInflowOpen] = useState(false);
  const [recordPaymentOpen, setRecordPaymentOpen] = useState(false);
  const [recordHoExpenseOpen, setRecordHoExpenseOpen] = useState(false);

  // Inflow Form State
  const [inflowDate, setInflowDate] = useState(() => format(new Date(), "yyyy-MM-dd"));
  const [inflowMiti, setInflowMiti] = useState(() => {
    try {
      return adToBs(new Date()).formatted;
    } catch {
      return "";
    }
  });
  const [inflowSource, setInflowSource] = useState("");
  const [inflowCategory, setInflowCategory] = useState("Client IPC Running Bill");
  const [inflowAmount, setInflowAmount] = useState("");
  const [inflowMode, setInflowMode] = useState("bank_transfer");
  const [inflowBank, setInflowBank] = useState("Nabil Bank Site A/C");
  const [inflowRefNo, setInflowRefNo] = useState("");
  const [inflowNotes, setInflowNotes] = useState("");
  const [inflowProjectId, setInflowProjectId] = useState(projectId || "");
  const { data: projectsData } = trpc.project.list.useQuery();
  const allProjects = projectsData?.projects || [];

  const [addClaimOpen, setAddClaimOpen] = useState(false);
  const [claimPartyName, setClaimPartyName] = useState("");
  const [claimPan, setClaimPan] = useState("");
  const [claimCategory, setClaimCategory] = useState("site_expense");
  const [claimAmount, setClaimAmount] = useState("");
  const [claimDesc, setClaimDesc] = useState("");
  const [claimBillNo, setClaimBillNo] = useState("");

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

  // Head Office Expense Form State
  const [hoCategory, setHoCategory] = useState("office_rent");
  const [hoParticulars, setHoParticulars] = useState("");
  const [hoAmount, setHoAmount] = useState("");
  const [hoPaymentMode, setHoPaymentMode] = useState<"bank_transfer" | "cheque" | "connectips" | "cash">("bank_transfer");
  const [hoBankAccountId, setHoBankAccountId] = useState<string>("none");
  const [hoChequeNo, setHoChequeNo] = useState("");
  const [hoDate, setHoDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [hoMiti, setHoMiti] = useState(() => {
    try { return adToBs(new Date()).formatted; } catch { return ""; }
  });
  const [hoNotes, setHoNotes] = useState("");

  const { data: bankData } = trpc.finance.orgBankAccounts.useQuery();
  const bankAccounts = bankData?.accounts || [];

  const createHoExpenseMut = trpc.finance.createHeadOfficeExpense.useMutation({
    onSuccess: () => {
      toast.success("Head Office overhead expense recorded in Day Book!");
      setRecordHoExpenseOpen(false);
      setHoParticulars("");
      setHoAmount("");
      setHoChequeNo("");
      setHoNotes("");
      utils.accounting.dayBook.invalidate();
      utils.finance.orgBankAccounts.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const { data, isLoading } = trpc.accounting.dayBook.useQuery({
    projectId: projectId || undefined,
    voucherType: voucherType !== "all" ? voucherType : undefined,
    search: search || undefined,
  });

  const { data: stats } = trpc.projectOps.payment.stats.useQuery(
    { projectId: projectId! },
    { enabled: !!projectId }
  );

  const entries = data?.entries || [];
  const summary = data?.summary || { totalDebit: 0, totalCredit: 0, count: 0 };

  // Calculate live running balances for Cashbook
  let runningBal = 0;
  const entriesWithRunning = [...entries].reverse().map((e) => {
    runningBal += (e.debit - e.credit);
    return { ...e, runningBalance: runningBal };
  }).reverse();

  // Inflow creation mutation
  const createInflowMut = trpc.accounting.logJournalEntry.useMutation({
    onSuccess: () => {
      toast.success("Inflow receipt recorded successfully in Day Book!");
      setRecordInflowOpen(false);
      setInflowSource("");
      setInflowAmount("");
      setInflowRefNo("");
      setInflowNotes("");
      utils.accounting.dayBook.invalidate();
      utils.accounting.ledgerAccounts.invalidate();
      utils.accounting.trialBalance.invalidate();
    },
    onError: (err) => {
      toast.error(err.message || "Failed to record inflow");
    },
  });

  const handleExportExcel = () => {
    try {
      const rows = entriesWithRunning.map((e, idx) => [
        idx + 1,
        e.date ? format(new Date(e.date), "yyyy-MM-dd") : "—",
        e.miti || "—",
        e.voucherNo,
        e.voucherType,
        e.accountHead,
        e.particulars,
        e.partyPan || "—",
        e.paymentMode || "—",
        e.debit,
        e.credit,
        e.runningBalance,
      ]);

      const wsData = [
        ["DAY BOOK / DAILY CASHBOOK (दैनिक रोजकट्टी)"],
        [`As of: ${format(new Date(), "yyyy-MM-dd")}`],
        ["S.N.", "Date (AD)", "Miti (BS)", "Voucher No", "Voucher Type", "Account Head", "Particulars", "PAN", "Mode", "Inflow / Debit (NPR)", "Outflow / Credit (NPR)", "Closing Balance (NPR)"],
        ...rows,
        ["", "", "", "", "", "", "TOTAL", "", "", summary.totalDebit, summary.totalCredit, ""],
      ];

      const ws = XLSX.utils.aoa_to_sheet(wsData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "DayBook");
      XLSX.writeFile(wb, `DayBook_${format(new Date(), "yyyy-MM-dd")}.xlsx`);
    } catch (e) {
      console.error(e);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-24 w-full rounded-2xl" />
        <Skeleton className="h-64 w-full rounded-2xl" />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Ultra-Compact Single-Line Financial Summary Strip */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 rounded-xl border border-white/10 bg-[#0c1015] text-xs font-mono">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <span className="text-gray-400">Total Inflow:</span>
            <span className="font-bold text-emerald-400">NPR {fmt(summary.totalDebit)}</span>
          </div>
          <div className="h-3 w-[1px] bg-white/10" />
          <div className="flex items-center gap-2">
            <span className="text-gray-400">Total Outflow:</span>
            <span className="font-bold text-red-400">NPR {fmt(summary.totalCredit)}</span>
          </div>
          <div className="h-3 w-[1px] bg-white/10" />
          <div className="flex items-center gap-2">
            <span className="text-gray-400">Net Site Balance:</span>
            <span className={cn("font-bold", (summary.totalDebit - summary.totalCredit) >= 0 ? "text-emerald-400" : "text-red-400")}>
              NPR {fmt(summary.totalDebit - summary.totalCredit)}
            </span>
          </div>
        </div>

        <div className="text-[11px] text-gray-500 font-mono">
          {entries.length} Transactions
        </div>
      </div>

      {/* Action Bar & Quick Filter Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 rounded-2xl border border-white/10 bg-[#0c1015]">
        <div className="flex flex-wrap items-center gap-2">
          {/* Voucher Type Filter */}
          <Select value={voucherType} onValueChange={setVoucherType}>
            <SelectTrigger className="h-9 text-xs font-mono w-44 bg-[#121820] border-white/10 text-white rounded-xl">
              <SelectValue placeholder="All Transactions" />
            </SelectTrigger>
            <SelectContent className="bg-[#0f141c] border-emerald-500/30 text-xs">
              <SelectItem value="all">All Transactions</SelectItem>
              <SelectItem value="payment">Disbursements / Outflows</SelectItem>
              <SelectItem value="billing">Client Receipts / Inflows</SelectItem>
              <SelectItem value="purchase">Vendor Bills</SelectItem>
              <SelectItem value="work_done">Subcontractor Bills</SelectItem>
            </SelectContent>
          </Select>

          {/* Search Box */}
          <div className="relative w-64">
            <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-gray-400" />
            <Input
              placeholder="Search party, PAN, particulars..."
              className="pl-8 h-9 text-xs bg-[#121820] text-white rounded-xl border-white/10 focus:border-emerald-400"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            size="sm"
            onClick={() => setRecordHoExpenseOpen(true)}
            className="h-9 px-3.5 text-xs font-bold bg-[#141a23] hover:bg-[#1a2330] text-amber-400 border border-amber-500/30 rounded-xl transition gap-1.5 shadow-[0_0_15px_rgba(245,158,11,0.1)]"
          >
            <Building className="h-3.5 w-3.5" /> + HQ Overhead (कार्यालय खर्च)
          </Button>

          <Button
            size="sm"
            onClick={() => setAddClaimOpen(true)}
            className="h-9 px-3.5 text-xs font-bold bg-[#141a23] hover:bg-[#1a2330] text-emerald-400 border border-emerald-500/30 rounded-xl transition gap-1.5 shadow-[0_0_15px_rgba(0,255,102,0.1)]"
          >
            <Plus className="h-3.5 w-3.5" /> + Bill / Claim (दाबी दर्ता)
          </Button>

          <Button
            size="sm"
            onClick={() => setRecordInflowOpen(true)}
            className="h-9 px-3.5 text-xs font-bold bg-[#141a23] hover:bg-[#1a2330] text-emerald-400 border border-emerald-500/30 rounded-xl transition gap-1.5 shadow-[0_0_15px_rgba(0,255,102,0.1)]"
          >
            <Plus className="h-3.5 w-3.5" /> + Money In (आम्दानी)
          </Button>

          <Button
            size="sm"
            onClick={() => setRecordPaymentOpen(true)}
            className="h-9 px-4 text-xs font-bold bg-[#00ff66] text-black hover:bg-[#00e65c] rounded-xl shadow-[0_0_20px_rgba(0,255,102,0.3)] transition gap-1.5"
          >
            <Plus className="h-3.5 w-3.5" /> + Record Payment (भुक्तानी)
          </Button>

          <Button
            size="sm"
            variant="outline"
            onClick={() => setIsCompact(!isCompact)}
            className="h-9 px-2.5 text-xs gap-1.5 font-mono bg-[#121820] text-gray-300 border-white/10 hover:text-white rounded-xl"
            title={isCompact ? "Switch to Comfortable View" : "Switch to Compact View"}
          >
            <LayoutList className="h-3.5 w-3.5 text-emerald-400" />
            {isCompact ? "Compact" : "Comfortable"}
          </Button>

          <Button
            size="sm"
            variant="outline"
            onClick={handleExportExcel}
            className="h-9 text-xs gap-1.5 font-mono bg-[#121820] text-gray-300 border-white/10 hover:text-white rounded-xl"
          >
            <Download className="h-3.5 w-3.5 text-emerald-400" /> Export Excel
          </Button>
        </div>
      </div>

      {/* Day Book Table */}
      {entries.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-white/10 p-16 text-center bg-[#0c1015]">
          <BookOpen className="mx-auto h-8 w-8 text-gray-500 mb-2" />
          <p className="text-sm font-semibold text-white">No Journal Entries Recorded</p>
          <p className="text-xs text-gray-400 mt-1">
            Day Book entries appear automatically when you record payments, client receipts, or bills.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-white/10 bg-[#0c1015]">
          <table className="w-full text-left text-xs font-mono">
            <thead className="border-b border-white/10 bg-[#121820] uppercase text-[10px] text-gray-400">
              <tr>
                <th className={cn(isCompact ? "px-3 py-1.5" : "px-4 py-3")}>Date (Miti / AD)</th>
                <th className={cn(isCompact ? "px-2.5 py-1.5" : "px-3 py-3")}>Project</th>
                <th className={cn(isCompact ? "px-2.5 py-1.5" : "px-3 py-3")}>Voucher #</th>
                <th className={cn(isCompact ? "px-2.5 py-1.5" : "px-3 py-3")}>Type</th>
                <th className={cn("font-sans", isCompact ? "px-3 py-1.5" : "px-4 py-3")}>Particulars &amp; Account Head</th>
                <th className={cn(isCompact ? "px-2.5 py-1.5" : "px-3 py-3")}>Mode</th>
                <th className={cn("text-right", isCompact ? "px-2.5 py-1.5" : "px-3 py-3")}>Inflow (Dr)</th>
                <th className={cn("text-right", isCompact ? "px-2.5 py-1.5" : "px-3 py-3")}>Outflow (Cr)</th>
                <th className={cn("text-right", isCompact ? "px-2.5 py-1.5" : "px-3 py-3")}>Balance</th>
                <th className={cn("text-center", isCompact ? "px-2.5 py-1.5" : "px-3 py-3")}>Scan</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {entriesWithRunning.map((e) => (
                <tr key={e.id} className="hover:bg-white/[0.02] transition-colors">
                  <td className={cn(isCompact ? "px-3 py-1.5" : "px-4 py-3")}>
                    <div className="font-bold text-white leading-tight">{e.miti}</div>
                    <div className="text-[10px] text-gray-400 leading-tight">
                      {format(new Date(e.date), "yyyy-MM-dd")}
                    </div>
                  </td>
                  <td className={cn(isCompact ? "px-2.5 py-1.5" : "px-3 py-3")}>
                    <Badge variant="outline" className="text-[10px] font-bold bg-white/5 border-white/10 text-emerald-400">
                      {e.projectCode || "SITE"}
                    </Badge>
                  </td>
                  <td className={cn("font-bold text-emerald-400", isCompact ? "px-2.5 py-1.5 text-xs" : "px-3 py-3")}>
                    {e.voucherNo}
                  </td>
                  <td className={cn(isCompact ? "px-2.5 py-1.5" : "px-3 py-3")}>
                    <Badge variant="outline" className="text-[10px] uppercase font-mono bg-white/5 border-white/10 text-gray-300 py-0 px-1.5 h-5">
                      {e.voucherType}
                    </Badge>
                  </td>
                  <td className={cn("font-sans", isCompact ? "px-3 py-1.5" : "px-4 py-3")}>
                    <div className={cn("font-semibold text-white truncate max-w-md", isCompact ? "text-xs" : "text-sm")}>
                      {e.particulars}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5 text-[10px] text-gray-400 font-mono">
                      <span className="bg-[#121820] px-1.5 py-0.2 rounded text-emerald-400 border border-white/5 font-semibold">
                        {e.accountHead}
                      </span>
                      {e.partyPan && <span>PAN: {e.partyPan}</span>}
                    </div>
                  </td>
                  <td className={cn("capitalize text-gray-300", isCompact ? "px-2.5 py-1.5" : "px-3 py-3")}>
                    {e.paymentMode?.replace(/_/g, " ") || "—"}
                  </td>
                  <td className={cn("text-right font-bold text-emerald-400", isCompact ? "px-2.5 py-1.5" : "px-3 py-3")}>
                    {e.debit > 0 ? fmt(e.debit) : "—"}
                  </td>
                  <td className={cn("text-right font-bold text-red-400", isCompact ? "px-2.5 py-1.5" : "px-3 py-3")}>
                    {e.credit > 0 ? fmt(e.credit) : "—"}
                  </td>
                  <td className={cn("text-right font-bold font-mono text-white", isCompact ? "px-2.5 py-1.5" : "px-3 py-3")}>
                    {fmt(e.runningBalance)}
                  </td>
                  <td className={cn("text-center", isCompact ? "px-2.5 py-1.5" : "px-3 py-3")}>
                    {e.scannedBillUrl ? (
                      <a
                        href={e.scannedBillUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center justify-center p-1 rounded hover:bg-emerald-500/20 text-emerald-400"
                        title="View Scanned Attachment"
                      >
                        <Eye className="h-3.5 w-3.5" />
                      </a>
                    ) : (
                      <span className="text-gray-600">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
            {/* Summary Footer */}
            <tfoot className="border-t-2 border-white/10 bg-[#121820] font-bold text-white">
              <tr>
                <td colSpan={6} className="px-4 py-3.5 uppercase tracking-wider font-sans text-xs">
                  Day Book Summary ({entries.length} Transactions)
                </td>
                <td className="px-3 py-3.5 text-right text-emerald-400">
                  NPR {fmt(summary.totalDebit)}
                </td>
                <td className="px-3 py-3.5 text-right text-red-400">
                  NPR {fmt(summary.totalCredit)}
                </td>
                <td className="px-3 py-3.5 text-right text-white">
                  NPR {fmt(summary.totalDebit - summary.totalCredit)}
                </td>
                <td></td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {/* Modal: Record Inflow (Money In) */}
      <Dialog open={recordInflowOpen} onOpenChange={setRecordInflowOpen}>
        <DialogContent className="sm:max-w-[560px] max-h-[85vh] flex flex-col p-0 gap-0 bg-[#0c1015] border border-emerald-500/20 shadow-[0_0_60px_rgba(0,255,102,0.08)] rounded-3xl font-sans overflow-hidden">
          <div className="px-6 pt-6 pb-4 shrink-0 border-b border-white/5 text-center relative">
            <DialogTitle className="text-xl font-bold text-white tracking-tight">
              Record Money In (आम्दानी दर्ता)
            </DialogTitle>
            <DialogDescription className="text-xs text-gray-400 mt-0.5">
              Log client IPC payment receipts, mobilization advance, or capital deposits.
            </DialogDescription>
            {inflowMiti && (
              <span className="absolute right-6 top-6 text-xs font-mono font-medium text-emerald-400 px-2.5 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 shadow-[0_0_10px_rgba(0,255,102,0.2)]">
                {inflowMiti} BS
              </span>
            )}
          </div>

          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4 text-xs custom-scrollbar">
            {/* Row 0: Project Selector */}
            <div className="space-y-1.5 min-w-0">
              <Label className="text-xs font-medium text-gray-300">Target Project (प्रोजेक्ट)</Label>
              <Select value={inflowProjectId} onValueChange={setInflowProjectId}>
                <SelectTrigger className="w-full min-w-0 h-11 text-xs bg-[#121820] text-white rounded-xl border-emerald-500/30">
                  <SelectValue placeholder="Select Project" />
                </SelectTrigger>
                <SelectContent className="bg-[#0f141c] border-emerald-500/30 text-xs text-white">
                  {allProjects.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name} ({p.code})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Row 1: Date & Received From */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5 min-w-0">
                <Label className="text-xs font-medium text-gray-300">Date (मिति)</Label>
                <NepaliDatePicker
                  value={inflowDate}
                  onChange={(d, dateStr) => {
                    if (dateStr) {
                      setInflowDate(dateStr);
                      try {
                        setInflowMiti(adToBs(dateStr).formatted);
                      } catch {}
                    }
                  }}
                  placeholder="Select Nepali date (BS)"
                  className="w-full h-11 text-xs font-mono rounded-xl border-emerald-500/30 focus:border-emerald-400 focus:ring-2 focus:ring-emerald-400/20 bg-[#121820] text-white transition-all shadow-[0_0_15px_rgba(0,255,102,0.03)]"
                />
              </div>

              <div className="space-y-1.5 min-w-0">
                <Label className="text-xs font-medium text-gray-300">Received From (कसबाट प्राप्त?)</Label>
                <Input
                  value={inflowSource}
                  onChange={(e) => setInflowSource(e.target.value)}
                  placeholder="e.g. DoR, Employer, Partner"
                  className="h-11 text-xs bg-[#121820] text-white rounded-xl border-emerald-500/30 focus:border-emerald-400"
                />
              </div>
            </div>

            {/* Row 2: Amount & Inflow Nature */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5 min-w-0">
                <Label className="text-xs font-medium text-gray-300">Inflow Amount (NPR)</Label>
                <Input
                  type="number"
                  value={inflowAmount}
                  onChange={(e) => setInflowAmount(e.target.value)}
                  placeholder="e.g. 5000000"
                  className="w-full h-11 text-xs font-mono font-bold bg-[#121820] text-white rounded-xl border-emerald-500/30 focus:border-emerald-400"
                />
              </div>
              <div className="space-y-1.5 min-w-0">
                <Label className="text-xs font-medium text-gray-300">Inflow Nature</Label>
                <Select value={inflowCategory} onValueChange={setInflowCategory}>
                  <SelectTrigger className="w-full min-w-0 h-11 text-xs bg-[#121820] text-white rounded-xl border-emerald-500/30">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-[#0f141c] border-emerald-500/30 text-xs">
                    <SelectItem value="Client IPC Running Bill">Client IPC Running Bill (रनिङ बिल भुक्तानी)</SelectItem>
                    <SelectItem value="Mobilization Advance">Mobilization Advance (पेश्की रकम)</SelectItem>
                    <SelectItem value="Partner Capital Deposit">Partner Capital / Deposit (लगानी)</SelectItem>
                    <SelectItem value="Security Deposit Refund">Security Deposit Refund (धरौटी फिर्ता)</SelectItem>
                    <SelectItem value="Other Site Inflow">Other Site Inflow</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-gray-300">Payment Channel</Label>
                <Select value={inflowMode} onValueChange={setInflowMode}>
                  <SelectTrigger className="w-full min-w-0 h-11 text-xs bg-[#121820] text-white rounded-xl border-emerald-500/30">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-[#0f141c] border-emerald-500/30 text-xs">
                    <SelectItem value="bank_transfer">Bank Transfer / connectIPS</SelectItem>
                    <SelectItem value="cheque">Bank Cheque</SelectItem>
                    <SelectItem value="cash">Cash Deposit</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-gray-300">Deposited Bank Account</Label>
                <Select value={inflowBank} onValueChange={setInflowBank}>
                  <SelectTrigger className="w-full min-w-0 h-11 text-xs bg-[#121820] text-white rounded-xl border-emerald-500/30">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-[#0f141c] border-emerald-500/30 text-xs">
                    <SelectItem value="Nabil Bank Site A/C">Nabil Bank Site A/C</SelectItem>
                    <SelectItem value="Global IME Bank Ltd">Global IME Bank Ltd</SelectItem>
                    <SelectItem value="NIC Asia Bank Ltd">NIC Asia Bank Ltd</SelectItem>
                    <SelectItem value="Rastriya Banijya Bank (RBB)">Rastriya Banijya Bank (RBB)</SelectItem>
                    <SelectItem value="Site Petty Cash">Site Petty Cash (नगद)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-gray-300">Bank Txn Ref / Cheque #</Label>
              <Input
                value={inflowRefNo}
                onChange={(e) => setInflowRefNo(e.target.value)}
                placeholder="e.g. NCHL-881923 or CHQ-99104"
                className="h-11 text-xs font-mono bg-[#121820] text-white rounded-xl border-emerald-500/30 focus:border-emerald-400"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-gray-300">Narration / Notes</Label>
              <Input
                value={inflowNotes}
                onChange={(e) => setInflowNotes(e.target.value)}
                placeholder="e.g. Received for IPC #02 after 1.5% TDS & 5% retention deductions"
                className="h-11 text-xs bg-[#121820] text-white rounded-xl border-emerald-500/30 focus:border-emerald-400"
              />
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-white/5 bg-[#0c1015] shrink-0">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setRecordInflowOpen(false)}
              className="h-10 text-xs rounded-xl px-5 text-gray-400 hover:text-white"
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={() => {
                if (!inflowSource.trim() || !inflowAmount) {
                  toast.error("Please enter payer source and amount");
                  return;
                }
                const effectiveProjId = inflowProjectId || projectId || allProjects[0]?.id;
                if (!effectiveProjId) {
                  toast.error("Please create or select a project to record site inflow.");
                  return;
                }
                const amt = parseFloat(inflowAmount) || 0;
                createInflowMut.mutate({
                  projectId: effectiveProjId,
                  date: new Date(inflowDate).toISOString(),
                  debitAccountId: inflowBank.includes("Cash") ? "cash_petty" : "bank_nabil",
                  creditAccountId: "revenue_client",
                  amount: amt,
                  narration: `${inflowCategory}: Received from ${inflowSource} ${inflowRefNo ? `(Ref: ${inflowRefNo})` : ""} - ${inflowNotes}`,
                  source: "manual",
                });
              }}
              disabled={createInflowMut.isPending || !inflowSource.trim() || !inflowAmount}
              className="h-10 text-xs px-6 font-bold bg-[#00ff66] text-black hover:bg-[#00e65c] shadow-[0_0_25px_rgba(0,255,102,0.4)] rounded-xl transition-all"
            >
              {createInflowMut.isPending && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />} Save Inflow
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Modal: Record Payment (Outflow) */}
      {(projectId || allProjects[0]?.id) && (
        <RecordPaymentDialog
          projectId={projectId || allProjects[0]?.id || ""}
          open={recordPaymentOpen}
          onOpenChange={setRecordPaymentOpen}
        />
      )}

      {/* Modal: Add Bill / Staff Expense Claim */}
      {(projectId || allProjects[0]?.id) && (
        <AddClaimDialog
          projectId={projectId || allProjects[0]?.id || ""}
          open={addClaimOpen}
          onOpenChange={setAddClaimOpen}
        />
      )}

      {/* 16:10 Modal: Record Head Office Overhead Expense */}
      <Dialog open={recordHoExpenseOpen} onOpenChange={setRecordHoExpenseOpen}>
        <DialogContent className="sm:max-w-[560px] bg-[#0c1015] border-white/10 text-white backdrop-blur-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base font-bold text-white">
              <Building className="h-5 w-5 text-amber-400" /> Log Head Office Overhead Expense
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Record central company costs (Office rent, audit fees, utilities, e-GP tender fees).
            </DialogDescription>
          </DialogHeader>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!hoParticulars || !hoAmount || parseFloat(hoAmount) <= 0) {
                toast.error("Please fill in valid expense particulars and amount");
                return;
              }
              createHoExpenseMut.mutate({
                category: hoCategory,
                particulars: hoParticulars,
                amount: parseFloat(hoAmount),
                date: hoDate,
                miti: hoMiti || undefined,
                paymentMode: hoPaymentMode,
                bankAccountId: hoBankAccountId !== "none" ? hoBankAccountId : undefined,
                chequeNo: hoChequeNo || undefined,
                notes: hoNotes || undefined,
              });
            }}
            className="space-y-4 pt-2"
          >
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs font-semibold">Expense Category *</Label>
                <Select value={hoCategory} onValueChange={setHoCategory}>
                  <SelectTrigger className="h-9 text-xs bg-[#161d26] border-white/10 text-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-[#0f141c] border-white/10 text-white text-xs">
                    <SelectItem value="office_rent">Head Office Rent (कार्यालय भाडा)</SelectItem>
                    <SelectItem value="audit_tax">Audit &amp; Tax Fees (लेखापरीक्षण / कर)</SelectItem>
                    <SelectItem value="legal_compliance">Legal &amp; Registration Renewals</SelectItem>
                    <SelectItem value="utilities_internet">Electricity, Water &amp; Internet</SelectItem>
                    <SelectItem value="ho_salary">HQ Admin Salaries</SelectItem>
                    <SelectItem value="director_draw">Director Drawing / Advance</SelectItem>
                    <SelectItem value="tender_fees">e-GP Tender Document Fees</SelectItem>
                    <SelectItem value="bank_charges">Bank Charges &amp; Interest</SelectItem>
                    <SelectItem value="vehicle_fuel">HQ Vehicle Fuel &amp; Maintenance</SelectItem>
                    <SelectItem value="other_overhead">Miscellaneous Overhead</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label className="text-xs font-semibold">Expense Date (Miti)</Label>
                <Input
                  value={hoMiti}
                  onChange={(e) => {
                    setHoMiti(e.target.value);
                    try {
                      const parts = e.target.value.split("-").map(Number);
                      if (parts.length === 3 && parts[0] && parts[1] && parts[2]) {
                        const ad = bsToAd(parts[0], parts[1], parts[2]);
                        if (ad) setHoDate(format(ad, "yyyy-MM-dd"));
                      }
                    } catch {}
                  }}
                  className="h-9 text-xs font-mono bg-[#161d26] border-white/10 text-white"
                />
              </div>
            </div>

            <div className="space-y-1">
              <Label className="text-xs font-semibold">Particulars / Description *</Label>
              <Input
                required
                placeholder="e.g. Head office monthly rent for Shrawan 2081 / Tax audit fee"
                value={hoParticulars}
                onChange={(e) => setHoParticulars(e.target.value)}
                className="h-9 text-xs bg-[#161d26] border-white/10 text-white"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs font-semibold">Amount (Rs.) *</Label>
                <Input
                  required
                  type="number"
                  step="any"
                  placeholder="0.00"
                  value={hoAmount}
                  onChange={(e) => setHoAmount(e.target.value)}
                  className="h-9 text-xs font-mono font-bold bg-[#161d26] border-white/10 text-white"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs font-semibold">Payment Mode</Label>
                <Select value={hoPaymentMode} onValueChange={(v: any) => setHoPaymentMode(v)}>
                  <SelectTrigger className="h-9 text-xs bg-[#161d26] border-white/10 text-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-[#0f141c] border-white/10 text-white text-xs">
                    <SelectItem value="bank_transfer">Bank Transfer (A/C Payee)</SelectItem>
                    <SelectItem value="cheque">Cheque</SelectItem>
                    <SelectItem value="connectips">ConnectIPS / Digital</SelectItem>
                    <SelectItem value="cash">HQ Petty Cash</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs font-semibold">Deduct From Company Account</Label>
                <Select value={hoBankAccountId} onValueChange={setHoBankAccountId}>
                  <SelectTrigger className="h-9 text-xs bg-[#161d26] border-white/10 text-white">
                    <SelectValue placeholder="Select Bank" />
                  </SelectTrigger>
                  <SelectContent className="bg-[#0f141c] border-white/10 text-white text-xs">
                    <SelectItem value="none">Do Not Deduct (Cash/Manual)</SelectItem>
                    {bankAccounts.map((b) => (
                      <SelectItem key={b.id} value={b.id}>
                        {b.bankName} ({b.accountNumber})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Cheque / Voucher Ref No</Label>
                <Input
                  placeholder="e.g. CHQ-10492"
                  value={hoChequeNo}
                  onChange={(e) => setHoChequeNo(e.target.value)}
                  className="h-9 text-xs font-mono bg-[#161d26] border-white/10 text-white"
                />
              </div>
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Notes / Remarks</Label>
              <Input
                placeholder="e.g. Paid to Landlord Mr. Sharma with TDS deducted"
                value={hoNotes}
                onChange={(e) => setHoNotes(e.target.value)}
                className="h-9 text-xs bg-[#161d26] border-white/10 text-white"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-4 border-t border-white/10">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setRecordHoExpenseOpen(false)}
                className="text-xs text-muted-foreground"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={createHoExpenseMut.isPending}
                className="bg-primary hover:bg-primary/90 text-primary-foreground font-bold text-xs px-5"
              >
                {createHoExpenseMut.isPending ? "Recording..." : "Record Expense"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
