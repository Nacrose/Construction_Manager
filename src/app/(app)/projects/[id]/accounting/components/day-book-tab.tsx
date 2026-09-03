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
import { CashPositionChart } from "./cash-position-chart";
import { DayBookInspector, type LedgerEntry } from "./day-book-inspector";
import { EditLedgerEntryDialog } from "./edit-ledger-entry-dialog";

export function DayBookTab({ projectId }: { projectId?: string }) {
  const utils = trpc.useUtils();
  const [viewMode, setViewMode] = useState<"table" | "timeline">("table");
  const [voucherType, setVoucherType] = useState<string>("all");
  const [recordInflowOpen, setRecordInflowOpen] = useState(false);
  const [recordPaymentOpen, setRecordPaymentOpen] = useState(false);
  const [addClaimOpen, setAddClaimOpen] = useState(false);
  const [selectedEntry, setSelectedEntry] = useState<LedgerEntry | null>(null);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [showChart, setShowChart] = useState(true);
  const [forecastMode, setForecastMode] = useState<"actual" | "forecast">("actual");
  const [editEntry, setEditEntry] = useState<LedgerEntry | null>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);

  const reverseMut = trpc.accounting.reverseLedgerEntry.useMutation({
    onSuccess: () => {
      toast.success("Entry reversed.");
      setInspectorOpen(false);
      setSelectedEntry(null);
      utils.accounting.dayBook.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });
  const attachMut = trpc.accounting.attachLedgerFile.useMutation({
    onSuccess: () => {
      toast.success("Attachment uploaded.");
      utils.accounting.dayBook.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });
  const confirmReverse = async (entry: LedgerEntry) => {
    if (!entry.id || !entry.source) return;
    if (entry.source !== "payment" && entry.source !== "site_expense" && entry.source !== "head_office_expense") {
      toast.error("Reverse this entry from its source module.");
      return;
    }
    if (window.confirm(`Reverse this ${entry.voucherType || "entry"}? This voids it from the day book.`)) {
      reverseMut.mutate({ source: entry.source, id: entry.id });
    }
  };

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
            <div className="flex items-center gap-2 mt-0.5 text-[10px] text-muted-foreground font-mono">
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
        className: "text-success font-bold font-matrix",
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
        className: "font-bold font-matrix text-foreground",
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
      <div className="flex flex-wrap items-center justify-between gap-3 px-3 py-1.5 rounded-lg border border-[var(--border)] bg-card level-2-surface text-xs font-mono">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground text-[11px]">Total Inflow (Dr):</span>
            <span className="font-bold text-success font-matrix">NPR {formatNpr(summary.totalDebit)}</span>
          </div>
          <div className="h-3 w-[1px] bg-secondary" />
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground text-[11px]">Total Disbursements (Cr):</span>
            <span className="font-bold text-rose-600 font-matrix">NPR {formatNpr(summary.totalCredit)}</span>
          </div>
          <div className="h-3 w-[1px] bg-secondary" />
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground text-[11px]">Net Flow:</span>
            <span
              className={cn(
                "font-bold",
                summary.totalDebit - summary.totalCredit >= 0 ? "text-success/80" : "text-red-400"
              )}
            >
              NPR {formatNpr(summary.totalDebit - summary.totalCredit)}
            </span>
          </div>
        </div>

        <div className="text-[11px] text-muted-foreground font-mono">
          {entries.length} Day Book Records
        </div>
      </div>

      {/* View Mode & 3-Pane Workspace (Ledger | Cash Position | Inspector) */}
      <div className="flex gap-3 h-[calc(100vh-15rem)] min-h-[460px]">
        <div className="flex min-w-0 flex-1 flex-col">
          {/* Pane toolbar */}
          <div className="mb-2 flex items-center justify-between gap-2">
            <div className="flex items-center gap-1">
              <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground/80">Cash Position</span>
              <div className="flex items-center bg-[#f0f6fc] border border-[#c5d7e8] rounded-md p-0.5">
                <button
                  type="button"
                  onClick={() => setForecastMode("actual")}
                  className={cn(
                    "px-2 py-0.5 rounded text-[10px] font-mono transition-all font-bold",
                    forecastMode === "actual" ? "bg-card text-[var(--primary)] border border-[var(--primary)]/40 shadow-xs" : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  Actual
                </button>
                <button
                  type="button"
                  onClick={() => setForecastMode("forecast")}
                  className={cn(
                    "px-2 py-0.5 rounded text-[10px] font-mono transition-all font-bold",
                    forecastMode === "forecast" ? "bg-card text-[var(--primary)] border border-[var(--primary)]/40 shadow-xs" : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  Forecast
                </button>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setShowChart(!showChart)}
                className={cn(
                  "px-2 py-0.5 rounded-md border text-[10px] font-mono font-bold transition-all",
                  showChart ? "bg-card border-[var(--border)] text-foreground" : "bg-muted border-[var(--border)] text-muted-foreground"
                )}
                title={showChart ? "Hide chart pane" : "Show chart pane"}
              >
                Chart
              </button>
              <button
                type="button"
                onClick={() => {
                  if (inspectorOpen) {
                    setInspectorOpen(false);
                  } else {
                    setInspectorOpen(true);
                    if (!selectedEntry && entriesWithRunning.length) setSelectedEntry(entriesWithRunning[0]);
                  }
                }}
                className={cn(
                  "px-2 py-0.5 rounded-md border text-[10px] font-mono font-bold transition-all inline-flex items-center gap-1",
                  inspectorOpen ? "bg-card border-[var(--primary)]/50 text-foreground" : "bg-muted border-[var(--border)] text-muted-foreground"
                )}
                title="Toggle inspector"
              >
                Inspector
              </button>
            </div>
          </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
      {/* Table / Timeline Rendering */}
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
          onRowClick={(row) => {
            setSelectedEntry(row as LedgerEntry);
            setInspectorOpen(true);
          }}
          emptyState={{
            icon: BookOpen,
            title: "No Journal Entries Recorded",
            description: "Day Book entries appear automatically when you record payments, client receipts, or bills.",
            action: (
              <Button
                size="sm"
                onClick={() => setRecordPaymentOpen(true)}
                className="amber-cta-btn text-foreground font-bold text-xs h-7 px-2.5 shadow-sm inline-flex items-center gap-1.5"
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
                  className="px-1.5 py-0.5 rounded text-xs font-mono transition-all bg-card text-[var(--primary)] font-bold shadow-xs border border-[var(--primary)]/40"
                  title="Table View"
                >
                  <List className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode("timeline")}
                  className="px-1.5 py-0.5 rounded text-xs font-mono transition-all text-muted-foreground hover:text-foreground"
                  title="Timeline View"
                >
                  <Receipt className="h-3.5 w-3.5" />
                </button>
              </div>

              {/* Voucher Type Filter */}
              <div className="w-32">
                <Select value={voucherType} onValueChange={setVoucherType}>
                  <SelectTrigger className="h-7 text-xs font-mono bg-[#f0f6fc] border-[#c5d7e8] text-foreground/90 rounded-md">
                    <SelectValue placeholder="All Vouchers" />
                  </SelectTrigger>
                  <SelectContent className="bg-card border-[var(--border)] text-xs text-foreground">
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
                className="h-7 px-2 text-xs font-bold bg-success hover:bg-success text-white rounded-md gap-1 snappy-btn shadow-xs"
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
            <span className="text-xs font-mono text-muted-foreground/80 uppercase font-bold tracking-wider">
              Chronological Ledger Feed (खाताबही टाइमलाइन)
            </span>
            <div className="flex items-center gap-2">
              <div className="flex items-center bg-[var(--background)] border border-[var(--border)] rounded-lg p-0.5">
                <button
                  type="button"
                  onClick={() => setViewMode("table")}
                  className={cn(
                    "px-2 py-1 rounded text-xs font-mono transition",
                    (viewMode as string) === "table" ? "bg-card text-foreground shadow-xs font-bold" : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  <List className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode("timeline")}
                  className={cn(
                    "px-2 py-1 rounded text-xs font-mono transition",
                    (viewMode as string) === "timeline" ? "bg-card text-[var(--primary)] shadow-xs font-bold" : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  <Receipt className="h-3.5 w-3.5" />
                </button>
              </div>
              <Button
                size="sm"
                onClick={() => setRecordInflowOpen(true)}
                className="h-7 text-xs font-bold bg-success hover:bg-success text-white rounded-md gap-1 shadow-xs"
              >
                <Plus className="h-3 w-3" /> Money In
              </Button>
              <Button
                size="sm"
                onClick={() => setRecordPaymentOpen(true)}
                className="amber-cta-btn h-7 text-xs font-bold text-white rounded-md gap-1 shadow-xs"
              >
                <Plus className="h-3 w-3" /> Payment
              </Button>
            </div>
          </div>

          {entriesWithRunning.length === 0 ? (
            <div className="p-12 text-center rounded-2xl border border-[var(--border)] bg-card text-muted-foreground text-xs font-mono">
              <BookOpen className="mx-auto h-8 w-8 mb-2 opacity-40 text-muted-foreground/80" />
              No ledger transactions recorded yet.
            </div>
          ) : (
            <div className="space-y-2">
              {entriesWithRunning.map((entry) => {
                const isInflow = entry.debit > 0;
                return (
                  <div
                    key={entry.id}
                    className={cn(
                      "p-3.5 rounded-xl border bg-card shadow-xs transition-all hover:border-[#94a3b8] flex items-center justify-between gap-4 font-mono text-xs",
                      isInflow
                        ? "border-l-4 border-l-success border-[var(--border)]"
                        : "border-l-4 border-l-rose-500 border-[var(--border)]"
                    )}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className={cn(
                          "h-8 w-8 rounded-lg flex items-center justify-center shrink-0",
                          isInflow ? "bg-success/10 text-success border border-success/30" : "bg-rose-50 text-rose-600 border border-rose-200"
                        )}
                      >
                        {isInflow ? <ArrowDownLeft className="h-4 w-4" /> : <ArrowUpRight className="h-4 w-4" />}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-foreground text-sm truncate">{entry.party || "Direct Entry"}</span>
                          {entry.voucherNo && (
                            <span className="text-[10px] text-muted-foreground/80 font-matrix">#{entry.voucherNo}</span>
                          )}
                          <Badge variant="outline" className="text-[9px] uppercase bg-muted border-[var(--border)] text-foreground/80">
                            {entry.voucherType}
                          </Badge>
                        </div>
                        <p className="text-[11px] text-muted-foreground truncate font-sans">{entry.particulars || "—"}</p>
                      </div>
                    </div>

                    <div className="text-right shrink-0 flex items-center gap-4">
                      <div>
                        <div
                          className={cn(
                            "font-bold text-sm font-matrix",
                            isInflow ? "text-success" : "text-rose-700"
                          )}
                        >
                          {isInflow ? `+ NPR ${formatNpr(entry.debit)}` : `- NPR ${formatNpr(entry.credit)}`}
                        </div>
                        <div className="text-[10px] text-muted-foreground font-matrix">
                          Bal: NPR {formatNpr(entry.runningBalance)}
                        </div>
                      </div>
                      <div className="text-right text-[10px] text-muted-foreground border-l border-[var(--border)] pl-3">
                        <div className="text-foreground/90 font-bold font-matrix">{entry.miti || "—"}</div>
                        <div className="text-muted-foreground/80 font-matrix">{entry.date}</div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
      </div>

        </div>

        {/* Cash Position chart pane */}
        {showChart && (
          <div className="hidden xl:block w-[360px] shrink-0 rounded-xl border border-[var(--border)] bg-card level-2-surface shadow-xs overflow-hidden">
            <CashPositionChart entries={entriesWithRunning} forecastMode={forecastMode} />
          </div>
        )}

        {/* Inspector pane */}
        {inspectorOpen && (
          <div className="hidden lg:block w-[320px] shrink-0 rounded-xl border border-[var(--border)] bg-card level-2-surface shadow-xs overflow-hidden">
            <DayBookInspector
              entry={selectedEntry}
              open={inspectorOpen}
              onClose={() => setInspectorOpen(false)}
              onEdit={(e) => {
                setEditEntry(e);
                setEditDialogOpen(true);
              }}
              onReverse={confirmReverse}
              onAttach={(entry, file) => {
                if (!entry.id || !entry.source) return;
                if (entry.source !== "payment" && entry.source !== "site_expense" && entry.source !== "head_office_expense") {
                  toast.error("Attach this file from the source module.");
                  return;
                }
                attachMut.mutate({ source: entry.source, id: entry.id, fileName: file.fileName, fileType: file.fileType, fileSize: file.fileSize, data: file.data });
              }}
            />
          </div>
        )}
      </div>

      <EditLedgerEntryDialog
        entry={editEntry}
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
        onSaved={() => {
          setInspectorOpen(false);
          setSelectedEntry(null);
          utils.accounting.dayBook.invalidate();
        }}
      />

      {/* Modal: Record Inflow (Money In) - 16:10 Widescreen Aero Modal */}
      <Dialog open={recordInflowOpen} onOpenChange={setRecordInflowOpen}>
        <DialogContent className="sm:max-w-[760px] w-full p-0 gap-0 bg-card border border-[var(--border)] text-foreground rounded-2xl shadow-2xl overflow-hidden font-sans">
          <div className="px-6 py-4 border-b border-[var(--input)] bg-[#f8fbfe] flex items-center justify-between">
            <div>
              <DialogTitle className="text-base font-bold text-foreground tracking-tight font-sans">
                Record Money In (आम्दानी दर्ता)
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                Log client IPC payment receipts, mobilization advance, or capital deposits.
              </DialogDescription>
            </div>
            {inflowMiti && (
              <span className="text-xs font-mono font-bold text-[var(--primary)] px-2.5 py-0.5 rounded-full bg-info/10 border border-[#bae6fd]">
                {inflowMiti} BS
              </span>
            )}
          </div>

          <div className="p-6 space-y-4 text-xs bg-card">
            {/* Row 0: Target Project */}
            <div className="space-y-1.5 min-w-0">
              <Label className="text-[11px] font-semibold text-foreground/80">Target Project (प्रोजेक्ट)</Label>
              <Select value={inflowProjectId} onValueChange={setInflowProjectId}>
                <SelectTrigger className="w-full min-w-0 h-9 text-xs bg-card text-foreground rounded-lg border border-[var(--border)] focus:border-[var(--primary)]">
                  <SelectValue placeholder="Select Project" />
                </SelectTrigger>
                <SelectContent className="bg-card border border-[var(--border)] text-xs text-foreground shadow-xl rounded-xl">
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
                <Label className="text-[11px] font-semibold text-foreground/80">Date (मिति)</Label>
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
                  className="w-full h-9 text-xs font-mono rounded-lg border border-[var(--border)] bg-card text-foreground"
                />
              </div>

              <div className="space-y-1.5 min-w-0">
                <Label className="text-[11px] font-semibold text-foreground/80">Received From (कसबाट प्राप्त?)</Label>
                <Input
                  value={inflowSource}
                  onChange={(e) => setInflowSource(e.target.value)}
                  placeholder="e.g. DoR, Employer, Partner"
                  className="h-9 text-xs bg-card text-foreground rounded-lg border border-[var(--border)] focus:border-[var(--primary)]"
                />
              </div>
            </div>

            {/* Row 2: Amount & Inflow Nature */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5 min-w-0">
                <Label className="text-[11px] font-semibold text-foreground/80">Inflow Amount (NPR)</Label>
                <Input
                  type="number"
                  value={inflowAmount}
                  onChange={(e) => setInflowAmount(e.target.value)}
                  placeholder="e.g. 5000000"
                  className="w-full h-9 text-xs font-mono font-bold bg-card text-foreground rounded-lg border border-[var(--border)] focus:border-[var(--primary)]"
                />
              </div>
              <div className="space-y-1.5 min-w-0">
                <Label className="text-[11px] font-semibold text-foreground/80">Inflow Nature</Label>
                <Select value={inflowCategory} onValueChange={setInflowCategory}>
                  <SelectTrigger className="w-full min-w-0 h-9 text-xs bg-card text-foreground rounded-lg border border-[var(--border)]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-card border border-[var(--border)] text-xs text-foreground shadow-xl rounded-xl">
                    <SelectItem value="Client IPC Running Bill">Client IPC Running Bill</SelectItem>
                    <SelectItem value="Mobilization Advance">Mobilization Advance</SelectItem>
                    <SelectItem value="Partner Capital Deposit">Partner Capital Deposit</SelectItem>
                    <SelectItem value="Security Deposit Refund">Security Deposit Refund</SelectItem>
                    <SelectItem value="Other Site Inflow">Other Site Inflow</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Row 3: Payment Channel & Deposited Bank */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-[11px] font-semibold text-foreground/80">Payment Channel</Label>
                <Select value={inflowMode} onValueChange={setInflowMode}>
                  <SelectTrigger className="w-full min-w-0 h-9 text-xs bg-card text-foreground rounded-lg border border-[var(--border)]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-card border border-[var(--border)] text-xs text-foreground shadow-xl rounded-xl">
                    <SelectItem value="bank_transfer">Bank Transfer / connectIPS</SelectItem>
                    <SelectItem value="cheque">Bank Cheque</SelectItem>
                    <SelectItem value="cash">Cash Deposit</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-[11px] font-semibold text-foreground/80">Deposited Bank Account</Label>
                <Select value={inflowBank} onValueChange={setInflowBank}>
                  <SelectTrigger className="w-full min-w-0 h-9 text-xs bg-card text-foreground rounded-lg border border-[var(--border)]">
                    <SelectValue placeholder="Select bank/cash account" />
                  </SelectTrigger>
                  <SelectContent className="bg-card border border-[var(--border)] text-xs text-foreground shadow-xl rounded-xl">
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

            {/* Row 4: Bank Txn Ref & Narration */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-[11px] font-semibold text-foreground/80">Bank Txn Ref / Cheque #</Label>
                <Input
                  value={inflowRefNo}
                  onChange={(e) => setInflowRefNo(e.target.value)}
                  placeholder="e.g. NCHL-881923 or CHQ-99104"
                  className="h-9 text-xs font-mono bg-card text-foreground rounded-lg border border-[var(--border)] focus:border-[var(--primary)]"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[11px] font-semibold text-foreground/80">Narration / Notes</Label>
                <Input
                  value={inflowNotes}
                  onChange={(e) => setInflowNotes(e.target.value)}
                  placeholder="e.g. Received for IPC #02"
                  className="h-9 text-xs bg-card text-foreground rounded-lg border border-[var(--border)] focus:border-[var(--primary)]"
                />
              </div>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2.5 px-6 py-3.5 border-t border-[var(--input)] bg-[#f8fbfe] shrink-0">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setRecordInflowOpen(false)}
              className="h-8 text-xs rounded-lg px-4 border-[var(--border)] text-muted-foreground hover:bg-muted"
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
              className="bg-success hover:bg-success text-white font-bold h-8 px-4 text-xs rounded-lg shadow-xs transition-all"
            >
              {createInflowMut.isPending && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />} Save Inflow (दाखिला सुरक्षित)
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
