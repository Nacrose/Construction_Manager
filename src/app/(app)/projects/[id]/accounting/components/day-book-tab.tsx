"use client";

import { useState, useMemo, useEffect } from "react";
import { trpc } from "@/lib/trpc-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  BookOpen,
  Eye,
  Plus,
  Loader2,
  List,
  ArrowDownLeft,
  ArrowUpRight,
  Receipt,
} from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { format } from "date-fns";
import { adToBs } from "@/lib/nepali-calendar";
import { sanitizeUrl } from "@/lib/safe-url";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { formatNpr } from "@/lib/construction-finance";
import { ConstructionTable, type ConstructionTableColumn } from "@/components/ui/construction-table";
import { RecordPaymentDialog } from "../../payments/components/record-payment-dialog";
import { AddClaimDialog } from "../../payments/components/add-claim-dialog";
import { NepaliDatePicker } from "@/components/ui/nepali-date-picker";

export function DayBookTab({ projectId }: { projectId?: string }) {
  const utils = trpc.useUtils();
  const [viewMode, setViewMode] = useState<"table" | "timeline">("table");
  const [voucherType, setVoucherType] = useState<string>("all");
  const [recordInflowOpen, setRecordInflowOpen] = useState(false);
  const [recordPaymentOpen, setRecordPaymentOpen] = useState(false);
  const [addClaimOpen, setAddClaimOpen] = useState(false);

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
  const [inflowBank, setInflowBank] = useState("");
  const [inflowRefNo, setInflowRefNo] = useState("");
  const [inflowNotes, setInflowNotes] = useState("");
  const [inflowProjectId, setInflowProjectId] = useState(projectId || "");
  const { data: projectsData } = trpc.project.list.useQuery();
  const allProjects = projectsData?.projects || [];

  const effectiveProjectId = inflowProjectId || projectId || allProjects[0]?.id || "";
  const { data: accountsData } = trpc.accounting.ledgerAccounts.useQuery(
    { projectId: effectiveProjectId },
    { enabled: Boolean(effectiveProjectId) && recordInflowOpen }
  );
  const bankAndCashAccounts = useMemo(() => {
    return (accountsData?.accounts || []).filter((a: any) => a.type === "bank" || a.type === "cash");
  }, [accountsData]);

  // Set default account when accounts data loads
  useEffect(() => {
    if (!inflowBank && bankAndCashAccounts.length > 0) {
      setInflowBank(bankAndCashAccounts[0].id);
    }
  }, [bankAndCashAccounts, inflowBank]);

  const { data, isLoading, isError, error, refetch } = trpc.accounting.dayBook.useQuery({
    projectId: projectId || undefined,
  });

  const createInflowMut = trpc.accounting.logJournalEntry.useMutation({
    onSuccess: () => {
      toast.success("Money In (Inflow) recorded successfully!");
      setRecordInflowOpen(false);
      setInflowSource("");
      setInflowAmount("");
      setInflowRefNo("");
      setInflowNotes("");
      utils.accounting.dayBook.invalidate();
      utils.accounting.ledgerAccounts.invalidate();
      utils.accounting.ledgerStatement.invalidate();
    },
    onError: (err) => {
      toast.error(err.message || "Failed to record money in");
    },
  });

  const rawEntries = data?.entries || [];
  const summary = data?.summary || { totalDebit: 0, totalCredit: 0, count: 0 };

  // Filter by voucher type if selected
  const entries = useMemo(() => {
    if (voucherType === "all") return rawEntries;
    return rawEntries.filter((e) => e.voucherType.toLowerCase() === voucherType.toLowerCase());
  }, [rawEntries, voucherType]);

  // Compute running balance chronologically
  const entriesWithRunning = useMemo(() => {
    let acc = 0;
    const result = new Array(entries.length);
    for (let i = 0; i < entries.length; i++) {
      const e = entries[i];
      acc += (e.debit || 0) - (e.credit || 0);
      result[i] = { ...e, runningBalance: acc };
    }
    return result;
  }, [entries]);

  const columns: ConstructionTableColumn<any>[] = useMemo(
    () => [
      {
        key: "date",
        header: "Date (Miti / AD)",
        render: (_val, row) => (
          <div>
            <div className="font-bold text-foreground leading-tight">{row.miti || "—"}</div>
            <div className="text-[10px] text-muted-foreground leading-tight">
              {format(new Date(row.date), "yyyy-MM-dd")}
            </div>
          </div>
        ),
      },
      {
        key: "projectCode",
        header: "Project",
        render: (val) => (
          <Badge variant="outline" className="text-[10px] font-bold bg-card border-border text-primary">
            {val || "SITE"}
          </Badge>
        ),
      },
      {
        key: "voucherNo",
        header: "Voucher #",
        className: "font-bold text-primary",
      },
      {
        key: "voucherType",
        header: "Type",
        format: "badge",
      },
      {
        key: "particulars",
        header: "Particulars & Account Head",
        className: "font-sans",
        render: (val, row) => (
          <div>
            <div className="font-semibold text-foreground truncate max-w-md text-xs">{val}</div>
            <div className="flex items-center gap-2 mt-0.5 text-[10px] text-slate-500 font-mono">
              <span className="bg-card px-1.5 py-0.2 rounded text-primary border border-border font-semibold">
                {row.accountHead}
              </span>
              {row.partyPan && <span>PAN: {row.partyPan}</span>}
            </div>
          </div>
        ),
      },
      {
        key: "paymentMode",
        header: "Mode",
        render: (val) => <span className="capitalize text-muted-foreground">{val?.replace(/_/g, " ") || "—"}</span>,
      },
      {
        key: "debit",
        header: "Inflow (Dr)",
        align: "right",
        summary: "sum",
        className: "text-emerald-600 font-bold font-matrix",
        render: (val) => (val > 0 ? formatNpr(val) : "—"),
      },
      {
        key: "credit",
        header: "Outflow (Cr)",
        align: "right",
        summary: "sum",
        className: "text-rose-600 font-bold font-matrix",
        render: (val) => (val > 0 ? formatNpr(val) : "—"),
      },
      {
        key: "runningBalance",
        header: "Balance",
        align: "right",
        className: "font-bold font-matrix text-slate-900",
        render: (val) => formatNpr(val),
      },
      {
        key: "scannedBillUrl",
        header: "Scan",
        align: "center",
        render: (val) =>
          val ? (
            <a
              href={sanitizeUrl(val) ?? "#"}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center justify-center p-1 rounded hover:bg-primary/20 text-primary"
              title="View Scanned Attachment"
            >
              <Eye className="h-3.5 w-3.5" />
            </a>
          ) : (
            <span className="text-muted-foreground">—</span>
          ),
      },
    ],
    []
  );

  if (isLoading) {
    return (
      <div className="space-y-4 font-mono">
        <div className="h-14 w-full rounded-xl bg-card/60 border border-border/40 animate-pulse flex items-center justify-between px-4">
          <div className="flex gap-4 items-center">
            <div className="h-4 w-32 bg-muted/60 rounded" />
            <div className="h-4 w-32 bg-muted/60 rounded" />
            <div className="h-4 w-32 bg-muted/60 rounded" />
          </div>
          <div className="h-4 w-20 bg-muted/60 rounded" />
        </div>
        <div className="h-96 w-full rounded-xl bg-card/60 border border-border/40 animate-pulse p-4 space-y-3">
          <div className="h-8 w-full bg-muted/40 rounded" />
          <div className="h-8 w-full bg-muted/30 rounded" />
          <div className="h-8 w-full bg-muted/30 rounded" />
          <div className="h-8 w-full bg-muted/30 rounded" />
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="p-8 text-center bg-card/85 border border-destructive/40 rounded-xl space-y-3 font-mono">
        <div className="text-destructive font-bold text-sm">Failed to load Day Book</div>
        <p className="text-xs text-muted-foreground">{error?.message || "An unexpected error occurred while fetching accounting entries."}</p>
        <Button size="sm" variant="outline" onClick={() => refetch()} className="text-xs">
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Single-Line Summary Strip (Khatabook Style) */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-3 py-1.5 rounded-lg border border-[#c7d8e8] bg-white level-2-surface text-xs font-mono">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <span className="text-slate-500 text-[11px]">Total Inflow (Dr):</span>
            <span className="font-bold text-emerald-600 font-matrix">NPR {formatNpr(summary.totalDebit)}</span>
          </div>
          <div className="h-3 w-[1px] bg-slate-300" />
          <div className="flex items-center gap-2">
            <span className="text-slate-500 text-[11px]">Total Disbursements (Cr):</span>
            <span className="font-bold text-rose-600 font-matrix">NPR {formatNpr(summary.totalCredit)}</span>
          </div>
          <div className="h-3 w-[1px] bg-slate-300" />
          <div className="flex items-center gap-2">
            <span className="text-slate-500 text-[11px]">Net Flow:</span>
            <span
              className={cn(
                "font-bold",
                summary.totalDebit - summary.totalCredit >= 0 ? "text-emerald-400" : "text-red-400"
              )}
            >
              NPR {formatNpr(summary.totalDebit - summary.totalCredit)}
            </span>
          </div>
        </div>

        <div className="text-[11px] text-slate-500 font-mono">
          {entries.length} Day Book Records
        </div>
      </div>

      {/* View Mode & Table / Timeline Rendering */}
      {viewMode === "table" ? (
        <ConstructionTable
          title="Project Day Book & Cashbook (दैनिक रोजकट्टी)"
          data={entriesWithRunning}
          columns={columns}
          searchPlaceholder="Search party, PAN, particulars, voucher..."
          exportExcel={{
            filename: `DayBook_${projectId || "Master"}_${format(new Date(), "yyyy-MM-dd")}`,
            sheetName: "DayBook",
          }}
          rowPreviewTitle={(row) => `Voucher #${row.voucherNo || "—"} (${row.party || "Direct Entry"})`}
          renderRowPreview={(row) => (
            <div className="space-y-4 text-xs font-mono">
              <div className="grid grid-cols-2 gap-3 p-3 rounded-xl bg-white/[0.03] border border-white/10">
                <div>
                  <span className="text-gray-400 block text-[10px]">Date (Miti):</span>
                  <span className="font-semibold text-white">{row.miti || "—"} ({row.date})</span>
                </div>
                <div>
                  <span className="text-gray-400 block text-[10px]">Voucher No:</span>
                  <span className="font-semibold text-emerald-400">#{row.voucherNo || "—"}</span>
                </div>
                <div>
                  <span className="text-gray-400 block text-[10px]">Voucher Type:</span>
                  <Badge variant="outline" className="capitalize text-[10px] bg-white/5 border-white/10 text-gray-300">
                    {row.voucherType || "Journal"}
                  </Badge>
                </div>
                <div>
                  <span className="text-gray-400 block text-[10px]">Payment Mode:</span>
                  <span className="font-semibold text-white capitalize">{row.paymentMode || "Bank"}</span>
                </div>
              </div>

              <div className="p-3 rounded-xl bg-white/[0.03] border border-white/10 space-y-2">
                <div>
                  <span className="text-gray-400 block text-[10px]">Party Name / Entity:</span>
                  <span className="font-semibold text-white text-sm">{row.party || "—"}</span>
                </div>
                {row.pan && (
                  <div>
                    <span className="text-gray-400 block text-[10px]">PAN / VAT No:</span>
                    <span className="text-gray-300">{row.pan}</span>
                  </div>
                )}
                <div>
                  <span className="text-gray-400 block text-[10px]">Particulars / Narration:</span>
                  <p className="text-gray-300 text-xs font-sans mt-0.5">{row.particulars || "—"}</p>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2 p-3 rounded-xl bg-white/[0.03] border border-white/10 text-center">
                <div className="p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                  <span className="text-[10px] text-gray-400 block">Inflow (Dr)</span>
                  <span className="font-bold text-emerald-400">
                    {row.debit > 0 ? `NPR ${formatNpr(row.debit)}` : "—"}
                  </span>
                </div>
                <div className="p-2 rounded-lg bg-red-500/10 border border-red-500/20">
                  <span className="text-[10px] text-gray-400 block">Outflow (Cr)</span>
                  <span className="font-bold text-red-400">
                    {row.credit > 0 ? `NPR ${formatNpr(row.credit)}` : "—"}
                  </span>
                </div>
                <div className="p-2 rounded-lg bg-white/5 border border-white/10">
                  <span className="text-[10px] text-gray-400 block">Running Bal</span>
                  <span className={cn("font-bold", row.runningBalance >= 0 ? "text-emerald-400" : "text-red-400")}>
                    NPR {formatNpr(row.runningBalance)}
                  </span>
                </div>
              </div>

              {row.attachmentUrl && (
                <a
                  href={sanitizeUrl(row.attachmentUrl) ?? "#"}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center justify-center gap-2 p-2.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 text-xs transition-colors"
                >
                  <Eye className="h-4 w-4" /> View Supporting Bill / Scanned Voucher
                </a>
              )}
            </div>
          )}
          emptyState={{
            icon: BookOpen,
            title: "No Journal Entries Recorded",
            description: "Day Book entries appear automatically when you record payments, client receipts, or bills.",
            action: (
              <Button
                size="sm"
                onClick={() => setRecordPaymentOpen(true)}
                className="amber-cta-btn text-slate-950 font-bold text-xs h-7 px-2.5 shadow-sm inline-flex items-center gap-1.5"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Record Voucher</span>
              </Button>
            ),
          }}
          headerActions={
            <div className="flex items-center gap-1.5">
              {/* View Mode Toggle */}
              <div className="flex items-center bg-[#f0f6fc] border border-[#c5d7e8] rounded-md p-0.5">
                <button
                  type="button"
                  onClick={() => setViewMode("table")}
                  className="px-1.5 py-0.5 rounded text-xs font-mono transition-all bg-white text-[#0369a1] font-bold shadow-xs border border-[#0284c7]/40"
                  title="Table View"
                >
                  <List className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode("timeline")}
                  className="px-1.5 py-0.5 rounded text-xs font-mono transition-all text-slate-500 hover:text-slate-900"
                  title="Timeline View"
                >
                  <Receipt className="h-3.5 w-3.5" />
                </button>
              </div>

              {/* Voucher Type Filter */}
              <div className="w-32">
                <Select value={voucherType} onValueChange={setVoucherType}>
                  <SelectTrigger className="h-7 text-xs font-mono bg-[#f0f6fc] border-[#c5d7e8] text-slate-800 rounded-md">
                    <SelectValue placeholder="All Vouchers" />
                  </SelectTrigger>
                  <SelectContent className="bg-white border-[#c7d8e8] text-xs text-slate-900">
                    <SelectItem value="all">⚡ All Types</SelectItem>
                    <SelectItem value="payment">Disbursements</SelectItem>
                    <SelectItem value="billing">Inflows (आम्दानी)</SelectItem>
                    <SelectItem value="purchase">Vendor Bills</SelectItem>
                    <SelectItem value="work_done">Subcontractor Bills</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <Button
                size="sm"
                onClick={() => setRecordInflowOpen(true)}
                className="h-7 px-2 text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white rounded-md gap-1 snappy-btn shadow-xs"
                title="Record Money In (Client Receipt / Running Bill)"
              >
                <Plus className="h-3 w-3" /> Inflow
              </Button>

              {/* Primary 3D Warm Amber / Topaz Jewel Button */}
              <Button
                size="sm"
                onClick={() => setRecordPaymentOpen(true)}
                className="amber-cta-btn h-7 px-2.5 text-xs font-bold text-white rounded-md gap-1 shadow-sm snappy-btn"
                title="Record Payment Voucher"
              >
                <Plus className="h-3 w-3" /> Voucher
              </Button>
            </div>
          }
        />
      ) : (
        /* Timeline Feed View (Khatabook-style chronological cards) */
        <div className="space-y-3">
          <div className="flex items-center justify-between px-1">
            <span className="text-xs font-mono text-gray-400 uppercase font-bold tracking-wider">
              Chronological Ledger Feed (खाताबही टाइमलाइन)
            </span>
            <div className="flex items-center gap-2">
              <div className="flex items-center bg-[#121820] border border-white/10 rounded-lg p-0.5">
                <button
                  type="button"
                  onClick={() => setViewMode("table")}
                  className="px-2 py-1 rounded text-xs font-mono text-gray-400 hover:text-white"
                >
                  <List className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode("timeline")}
                  className="px-2 py-1 rounded text-xs font-mono bg-emerald-500/20 text-emerald-400 font-bold"
                >
                  <Receipt className="h-3.5 w-3.5" />
                </button>
              </div>
              <Button
                size="sm"
                onClick={() => setRecordInflowOpen(true)}
                className="h-7 text-xs font-semibold bg-[#141a23] text-emerald-400 border border-emerald-500/30 rounded-lg gap-1"
              >
                <Plus className="h-3 w-3" /> Money In
              </Button>
              <Button
                size="sm"
                onClick={() => setRecordPaymentOpen(true)}
                className="h-7 text-xs font-semibold bg-[#00ff66] text-black rounded-lg"
              >
                <Plus className="h-3 w-3" /> Payment
              </Button>
            </div>
          </div>

          {entriesWithRunning.length === 0 ? (
            <div className="p-12 text-center rounded-2xl border border-white/10 bg-[#0c1015] text-gray-400 text-xs font-mono">
              <BookOpen className="mx-auto h-8 w-8 mb-2 opacity-50" />
              No entries found.
            </div>
          ) : (
            <div className="space-y-2">
              {entriesWithRunning.map((entry) => {
                const isInflow = entry.debit > 0;
                return (
                  <div
                    key={entry.id}
                    className={cn(
                      "p-3.5 rounded-xl border bg-[#0c1015] transition-all hover:bg-white/[0.02] flex items-center justify-between gap-4 font-mono text-xs",
                      isInflow
                        ? "border-l-4 border-l-emerald-500 border-white/10"
                        : "border-l-4 border-l-rose-500 border-white/10"
                    )}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className={cn(
                          "h-8 w-8 rounded-lg flex items-center justify-center shrink-0",
                          isInflow ? "bg-emerald-500/10 text-emerald-400" : "bg-rose-500/10 text-rose-400"
                        )}
                      >
                        {isInflow ? <ArrowDownLeft className="h-4 w-4" /> : <ArrowUpRight className="h-4 w-4" />}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-white text-sm truncate">{entry.party || "Direct Entry"}</span>
                          {entry.voucherNo && (
                            <span className="text-[10px] text-gray-500">#{entry.voucherNo}</span>
                          )}
                          <Badge variant="outline" className="text-[9px] uppercase bg-white/5 border-white/10 text-gray-400">
                            {entry.voucherType}
                          </Badge>
                        </div>
                        <p className="text-[11px] text-gray-400 truncate font-sans">{entry.particulars || "—"}</p>
                      </div>
                    </div>

                    <div className="text-right shrink-0 flex items-center gap-4">
                      <div>
                        <div
                          className={cn(
                            "font-bold text-sm",
                            isInflow ? "text-emerald-400" : "text-rose-400"
                          )}
                        >
                          {isInflow ? `+ NPR ${formatNpr(entry.debit)}` : `- NPR ${formatNpr(entry.credit)}`}
                        </div>
                        <div className="text-[10px] text-gray-500">
                          Bal: NPR {formatNpr(entry.runningBalance)}
                        </div>
                      </div>
                      <div className="text-right text-[10px] text-gray-400 border-l border-white/10 pl-3">
                        <div className="text-white font-bold">{entry.miti || "—"}</div>
                        <div className="text-gray-500">{entry.date}</div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
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
                <SelectTrigger className="w-full min-w-0 h-10 text-xs bg-[#121820] text-white rounded-xl border-emerald-500/30">
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
                  onChange={(_d, dateStr) => {
                    if (dateStr) {
                      setInflowDate(dateStr);
                      try {
                        setInflowMiti(adToBs(dateStr).formatted);
                      } catch {}
                    }
                  }}
                  placeholder="Select Nepali date (BS)"
                  className="w-full h-10 text-xs font-mono rounded-xl border-emerald-500/30 bg-[#121820] text-white"
                />
              </div>

              <div className="space-y-1.5 min-w-0">
                <Label className="text-xs font-medium text-gray-300">Received From (कसबाट प्राप्त?)</Label>
                <Input
                  value={inflowSource}
                  onChange={(e) => setInflowSource(e.target.value)}
                  placeholder="e.g. DoR, Employer, Partner"
                  className="h-10 text-xs bg-[#121820] text-white rounded-xl border-emerald-500/30 focus:border-emerald-400"
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
                  className="w-full h-10 text-xs font-mono font-bold bg-[#121820] text-white rounded-xl border-emerald-500/30 focus:border-emerald-400"
                />
              </div>
              <div className="space-y-1.5 min-w-0">
                <Label className="text-xs font-medium text-gray-300">Inflow Nature</Label>
                <Select value={inflowCategory} onValueChange={setInflowCategory}>
                  <SelectTrigger className="w-full min-w-0 h-10 text-xs bg-[#121820] text-white rounded-xl border-emerald-500/30">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-[#0f141c] border-emerald-500/30 text-xs">
                    <SelectItem value="Client IPC Running Bill">Client IPC Running Bill</SelectItem>
                    <SelectItem value="Mobilization Advance">Mobilization Advance</SelectItem>
                    <SelectItem value="Partner Capital Deposit">Partner Capital Deposit</SelectItem>
                    <SelectItem value="Security Deposit Refund">Security Deposit Refund</SelectItem>
                    <SelectItem value="Other Site Inflow">Other Site Inflow</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-gray-300">Payment Channel</Label>
                <Select value={inflowMode} onValueChange={setInflowMode}>
                  <SelectTrigger className="w-full min-w-0 h-10 text-xs bg-[#121820] text-white rounded-xl border-emerald-500/30">
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
                  <SelectTrigger className="w-full min-w-0 h-10 text-xs bg-[#121820] text-white rounded-xl border-emerald-500/30">
                    <SelectValue placeholder="Select bank/cash account" />
                  </SelectTrigger>
                  <SelectContent className="bg-[#0f141c] border-emerald-500/30 text-xs">
                    {bankAndCashAccounts.length > 0 ? (
                      bankAndCashAccounts.map((acc: any) => (
                        <SelectItem key={acc.id} value={acc.id}>
                          {acc.name}
                        </SelectItem>
                      ))
                    ) : (
                      <SelectItem value="cash_petty">Site Petty Cash (नगद)</SelectItem>
                    )}
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
                className="h-10 text-xs font-mono bg-[#121820] text-white rounded-xl border-emerald-500/30 focus:border-emerald-400"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-gray-300">Narration / Notes</Label>
              <Input
                value={inflowNotes}
                onChange={(e) => setInflowNotes(e.target.value)}
                placeholder="e.g. Received for IPC #02 after 1.5% TDS & 5% retention deductions"
                className="h-10 text-xs bg-[#121820] text-white rounded-xl border-emerald-500/30 focus:border-emerald-400"
              />
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-white/5 bg-[#0c1015] shrink-0">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setRecordInflowOpen(false)}
              className="h-9 text-xs rounded-xl px-4 text-gray-400 hover:text-white"
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
                  debitAccountId: inflowBank || "cash_petty",
                  creditAccountId: "revenue_client",
                  inflowType: inflowCategory as
                    | "Client IPC Running Bill"
                    | "Mobilization Advance"
                    | "Partner Capital Deposit"
                    | "Security Deposit Refund"
                    | "Other Site Inflow",
                  receivedFrom: inflowSource.trim(),
                  amount: amt,
                  narration: `${inflowCategory}: Received from ${inflowSource} ${inflowRefNo ? `(Ref: ${inflowRefNo})` : ""} - ${inflowNotes}`,
                  source: "manual",
                });
              }}
              disabled={createInflowMut.isPending || !inflowSource.trim() || !inflowAmount}
              className="h-9 text-xs px-5 font-bold bg-[#00ff66] text-black hover:bg-[#00e65c] shadow-[0_0_20px_rgba(0,255,102,0.3)] rounded-xl transition-all"
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
    </div>
  );
}
