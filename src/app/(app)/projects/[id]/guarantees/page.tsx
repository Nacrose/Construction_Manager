"use client";

import { use, useState } from "react";
import Link from "next/link";
import { trpc } from "@/lib/trpc-client";
import { ModuleTabs } from "@/components/module-tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import {
  ShieldAlert,
  ShieldCheck,
  Plus,
  CalendarClock,
  Building2,
  FileText,
  AlertTriangle,
  CheckCircle2,
  Download,
  Trash2,
  Check,
  Eye,
  AlertCircle,
} from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { AddGuaranteeDialog } from "./dialogs/add-guarantee-dialog";
import { ExtendGuaranteeDialog } from "./dialogs/extend-guarantee-dialog";

const CONTRACT_TABS = [
  { label: "BOQ & Rates", href: "/boq" },
  { label: "Bank Guarantees & Insurance", href: "/guarantees" },
  { label: "IPC Certificates", href: "/ipc" },
  { label: "Variation Orders", href: "/variations" },
  { label: "RFI / Workflow", href: "/workflow/rfi" },
  { label: "Submittals", href: "/submittals" },
];

function fmt(n: number) {
  return n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtShort(n: number) {
  if (Math.abs(n) >= 10000000) return `Rs. ${(n / 10000000).toFixed(2)} Cr`;
  if (Math.abs(n) >= 100000) return `Rs. ${(n / 100000).toFixed(2)} L`;
  return `Rs. ${fmt(n)}`;
}

const TYPE_LABELS: Record<string, { label: string; labelNp: string; color: string }> = {
  performance_bond: {
    label: "Performance Security",
    labelNp: "कार्यसम्पादन जमानत",
    color: "bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300 border-blue-200",
  },
  advance_payment: {
    label: "Mobilization APG",
    labelNp: "पेश्की जमानत",
    color: "bg-purple-50 text-purple-700 dark:bg-purple-950/50 dark:text-purple-300 border-purple-200",
  },
  car_insurance: {
    label: "CAR Insurance",
    labelNp: "निर्माण जोखिम बीमा",
    color: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300 border-emerald-200",
  },
  retention_bond: {
    label: "Retention Guarantee",
    labelNp: "धरौटी जमानत",
    color: "bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300 border-amber-200",
  },
  bid_bond: {
    label: "Bid Bond / EMD",
    labelNp: "बोलपत्र जमानत",
    color: "bg-slate-50 text-slate-700 dark:bg-slate-900 dark:text-slate-300 border-slate-200",
  },
  other: {
    label: "Other Guarantee",
    labelNp: "अन्य जमानत",
    color: "bg-slate-50 text-slate-700 dark:bg-slate-900 dark:text-slate-300 border-slate-200",
  },
};

export default function BankGuaranteesPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: projectId } = use(params);
  const utils = trpc.useUtils();

  const [addOpen, setAddOpen] = useState(false);
  const [extendItem, setExtendItem] = useState<any | null>(null);
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "extended" | "released" | "expired">("all");

  const { data, isLoading } = trpc.bankGuarantee.list.useQuery({
    projectId,
    status: statusFilter,
  });

  const releaseMutation = trpc.bankGuarantee.release.useMutation({
    onSuccess: () => {
      utils.bankGuarantee.list.invalidate({ projectId });
      utils.bankGuarantee.portfolioAlerts.invalidate();
      toast.success("Guarantee marked as Released.");
    },
    onError: (e) => toast.error(e.message),
  });

  const deleteMutation = trpc.bankGuarantee.delete.useMutation({
    onSuccess: () => {
      utils.bankGuarantee.list.invalidate({ projectId });
      utils.bankGuarantee.portfolioAlerts.invalidate();
      toast.success("Guarantee deleted.");
    },
    onError: (e) => toast.error(e.message),
  });

  const items = data?.items || [];
  const kpis = data?.kpis || {
    totalActiveExposure: 0,
    totalMarginHeld: 0,
    totalCommissionPaid: 0,
    expiringWithin30DaysCount: 0,
    expiredCount: 0,
    activeCount: 0,
    totalCount: 0,
  };

  return (
    <>
      <ModuleTabs projectId={projectId} tabs={CONTRACT_TABS} />
      <div className="space-y-4 pb-8">
        {/* Single-Row Action & Filter Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-2xl border border-white/10 bg-[#0c1015]">
          <div className="flex items-center gap-4 text-xs font-mono text-gray-400">
            <span>Active Guarantees: <span className="font-bold text-white">{kpis.activeCount}</span></span>
            {kpis.expiringWithin30DaysCount > 0 && (
              <>
                <div className="h-3 w-[1px] bg-white/10" />
                <span className="text-amber-400 font-bold">⚠️ {kpis.expiringWithin30DaysCount} Expiring Soon</span>
              </>
            )}
          </div>

          <Button
            size="sm"
            onClick={() => setAddOpen(true)}
            className="h-9 px-4 text-xs font-bold bg-[#00ff66] text-black hover:bg-[#00e65c] rounded-xl shadow-[0_0_20px_rgba(0,255,102,0.3)] transition gap-1.5 font-sans"
          >
            <Plus className="h-3.5 w-3.5" /> + Add Guarantee / Insurance
          </Button>
        </div>

        {/* Top KPI Cards */}
        {isLoading ? (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-24 rounded-xl" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {/* Total Exposure */}
            <Card className="shadow-sm border-l-4 border-l-primary">
              <CardContent className="p-4 space-y-1">
                <div className="text-[10px] font-mono text-muted-foreground uppercase">
                  Active Guarantee Value
                </div>
                <div className="text-xl font-bold font-mono text-foreground">
                  {fmtShort(kpis.totalActiveExposure)}
                </div>
                <div className="text-[11px] text-muted-foreground">
                  {kpis.activeCount} active policy/bonds
                </div>
              </CardContent>
            </Card>

            {/* Cash Margin Held */}
            <Card className="shadow-sm border-l-4 border-l-amber-500">
              <CardContent className="p-4 space-y-1">
                <div className="text-[10px] font-mono text-muted-foreground uppercase">
                  Cash Margin Held
                </div>
                <div className="text-xl font-bold font-mono text-amber-600 dark:text-amber-400">
                  {fmtShort(kpis.totalMarginHeld)}
                </div>
                <div className="text-[11px] text-muted-foreground">
                  Held at issuing banks
                </div>
              </CardContent>
            </Card>

            {/* Expiring Soon Alert */}
            <Card
              className={cn(
                "shadow-sm border-l-4 transition-colors",
                kpis.expiringWithin30DaysCount > 0
                  ? "border-l-red-500 bg-red-50/40 dark:bg-red-950/20"
                  : "border-l-emerald-500"
              )}
            >
              <CardContent className="p-4 space-y-1">
                <div className="text-[10px] font-mono text-muted-foreground uppercase">
                  Expiring in ≤30 Days
                </div>
                <div
                  className={cn(
                    "text-xl font-bold font-mono",
                    kpis.expiringWithin30DaysCount > 0
                      ? "text-red-600 dark:text-red-400 animate-pulse"
                      : "text-emerald-600 dark:text-emerald-400"
                  )}
                >
                  {kpis.expiringWithin30DaysCount}
                </div>
                <div className="text-[11px] text-muted-foreground">
                  {kpis.expiringWithin30DaysCount > 0 ? "Requires extension!" : "All dates healthy"}
                </div>
              </CardContent>
            </Card>

            {/* Total Commission Paid */}
            <Card className="shadow-sm border-l-4 border-l-slate-400">
              <CardContent className="p-4 space-y-1">
                <div className="text-[10px] font-mono text-muted-foreground uppercase">
                  Total Commission Paid
                </div>
                <div className="text-xl font-bold font-mono text-foreground">
                  {fmtShort(kpis.totalCommissionPaid)}
                </div>
                <div className="text-[11px] text-muted-foreground">
                  Bank & insurance fees
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Guarantees Table */}
        {isLoading ? (
          <Skeleton className="h-64 rounded-xl" />
        ) : items.length === 0 ? (
          <div className="rounded-xl border border-dashed p-12 text-center bg-card">
            <ShieldCheck className="mx-auto h-10 w-10 text-muted-foreground mb-3" />
            <h3 className="text-base font-bold text-foreground">No Guarantees or Insurance Logged</h3>
            <p className="text-xs text-muted-foreground mt-1 max-w-md mx-auto">
              Register your contract&apos;s Performance Security, Mobilization APG, or CAR Insurance policy to track expiry dates and prevent bank penalties.
            </p>
            <Button
              size="sm"
              onClick={() => setAddOpen(true)}
              className="mt-4 gap-1.5 font-semibold text-xs"
            >
              <Plus className="h-4 w-4" />
              Add First Guarantee
            </Button>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border bg-card shadow-sm">
            <table className="w-full text-left text-xs font-mono">
              <thead className="border-b bg-muted/60 uppercase text-[10px] text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">Type & Details</th>
                  <th className="px-3 py-3">Issuing Bank & Beneficiary</th>
                  <th className="px-3 py-3 text-right">Amount (NPR)</th>
                  <th className="px-3 py-3 text-right">Cash Margin</th>
                  <th className="px-3 py-3">Issue Date (BS)</th>
                  <th className="px-3 py-3">Expiry Date (BS)</th>
                  <th className="px-3 py-3 text-center">Status / Countdown</th>
                  <th className="px-3 py-3 text-center">Doc</th>
                  <th className="px-4 py-3 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {items.map((g) => {
                  const typeMeta = TYPE_LABELS[g.type] || TYPE_LABELS.other;
                  const isReleased = g.status === "released";

                  return (
                    <tr
                      key={g.id}
                      className={cn(
                        "hover:bg-muted/30 transition-colors",
                        g.isExpiringSoon && !isReleased ? "bg-red-50/20 dark:bg-red-950/10" : ""
                      )}
                    >
                      {/* Type & BG Number */}
                      <td className="px-4 py-3 font-sans">
                        <Badge
                          variant="outline"
                          className={cn("text-[10px] font-medium border", typeMeta.color)}
                        >
                          {typeMeta.label}
                        </Badge>
                        <div className="font-mono font-bold text-foreground text-sm mt-1">
                          {g.guaranteeNumber}
                        </div>
                        {g.purpose && (
                          <div className="text-[11px] text-muted-foreground truncate max-w-xs mt-0.5">
                            {g.purpose}
                          </div>
                        )}
                      </td>

                      {/* Bank & Beneficiary */}
                      <td className="px-3 py-3 font-sans">
                        <div className="font-semibold text-foreground flex items-center gap-1">
                          <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
                          {g.issuingBank} {g.branch ? `(${g.branch})` : ""}
                        </div>
                        <div className="text-[11px] text-muted-foreground mt-0.5">
                          To: {g.beneficiary}
                        </div>
                      </td>

                      {/* Amount */}
                      <td className="px-3 py-3 text-right font-bold text-foreground text-sm">
                        {fmt(g.amount)}
                      </td>

                      {/* Cash Margin */}
                      <td className="px-3 py-3 text-right text-muted-foreground">
                        {g.marginAmount > 0 ? fmt(g.marginAmount) : "—"}
                      </td>

                      {/* Issue Date */}
                      <td className="px-3 py-3">
                        <div className="font-bold text-foreground">{g.issuedMiti || "—"}</div>
                        <div className="text-[10px] text-muted-foreground">
                          {format(new Date(g.issuedDate), "yyyy-MM-dd")}
                        </div>
                      </td>

                      {/* Expiry Date */}
                      <td className="px-3 py-3">
                        <div className="font-bold text-foreground">{g.expiryMiti || "—"}</div>
                        <div className="text-[10px] text-muted-foreground">
                          {format(new Date(g.expiryDate), "yyyy-MM-dd")}
                        </div>
                      </td>

                      {/* Status / Countdown */}
                      <td className="px-3 py-3 text-center">
                        {isReleased ? (
                          <Badge variant="outline" className="bg-slate-100 text-slate-700 dark:bg-slate-800 text-[10px]">
                            Released
                          </Badge>
                        ) : g.isExpired ? (
                          <Badge variant="destructive" className="text-[10px]">
                            Expired ({Math.abs(g.daysRemaining)}d ago)
                          </Badge>
                        ) : g.isExpiringSoon ? (
                          <Badge className="bg-red-600 text-white animate-pulse text-[10px]">
                            {g.daysRemaining} Days Left
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="bg-emerald-50 text-emerald-700 dark:bg-emerald-950 text-[10px] border-emerald-300">
                            {g.daysRemaining} Days Left
                          </Badge>
                        )}
                      </td>

                      {/* Document Scanned URL */}
                      <td className="px-3 py-3 text-center">
                        {g.documentUrl ? (
                          <a
                            href={g.documentUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center text-primary hover:underline"
                            title="View Scanned Policy / BG"
                          >
                            <Eye className="h-4 w-4" />
                          </a>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="px-4 py-3 text-center">
                        <div className="flex items-center justify-center gap-1">
                          {!isReleased && (
                            <>
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 px-2 text-xs gap-1 font-mono"
                                onClick={() => setExtendItem(g)}
                              >
                                <CalendarClock className="h-3 w-3 text-amber-500" />
                                Extend
                              </Button>

                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 px-2 text-xs text-muted-foreground hover:text-emerald-600"
                                title="Mark as Released / Returned"
                                onClick={() => {
                                  if (confirm(`Mark guarantee #${g.guaranteeNumber} as released/returned by client?`)) {
                                    releaseMutation.mutate({ id: g.id });
                                  }
                                }}
                              >
                                <Check className="h-3.5 w-3.5" />
                              </Button>
                            </>
                          )}

                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 px-2 text-xs text-muted-foreground hover:text-destructive"
                            onClick={() => {
                              if (confirm(`Delete record #${g.guaranteeNumber}?`)) {
                                deleteMutation.mutate({ id: g.id });
                              }
                            }}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add Dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        {addOpen && <AddGuaranteeDialog projectId={projectId} onDone={() => setAddOpen(false)} />}
      </Dialog>

      {/* Extend Dialog */}
      <Dialog open={Boolean(extendItem)} onOpenChange={(open) => !open && setExtendItem(null)}>
        {extendItem && (
          <ExtendGuaranteeDialog
            guarantee={extendItem}
            onDone={() => setExtendItem(null)}
          />
        )}
      </Dialog>
    </>
  );
}
