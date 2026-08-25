"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ShieldAlert,
  ShieldCheck,
  Plus,
  CalendarClock,
  Building2,
  FileText,
  AlertTriangle,
  CheckCircle2,
  Trash2,
  Search,
  ExternalLink,
} from "lucide-react";
import { format } from "date-fns";
import { adToBs, bsToAd } from "@/lib/nepali-calendar";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

function fmt(n: number) {
  return n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtShort(n: number) {
  if (Math.abs(n) >= 10000000) return `Rs. ${(n / 10000000).toFixed(2)} Cr`;
  if (Math.abs(n) >= 100000) return `Rs. ${(n / 100000).toFixed(2)} L`;
  return `Rs. ${fmt(n)}`;
}

const TYPE_LABELS: Record<string, { label: string; labelNp: string; color: string }> = {
  bid_bond: {
    label: "Bid Bond / Tender Security",
    labelNp: "बोलपत्र जमानत",
    color: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  },
  performance_bond: {
    label: "Performance Security",
    labelNp: "कार्यसम्पादन जमानत",
    color: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
  },
  advance_payment: {
    label: "Mobilization APG",
    labelNp: "पेश्की जमानत",
    color: "bg-purple-500/20 text-purple-400 border-purple-500/30",
  },
  retention_bond: {
    label: "Retention Guarantee",
    labelNp: "धरौटी जमानत",
    color: "bg-amber-500/20 text-amber-400 border-amber-500/30",
  },
  car_insurance: {
    label: "CAR Insurance Policy",
    labelNp: "निर्माण जोखिम बीमा",
    color: "bg-teal-500/20 text-teal-400 border-teal-500/30",
  },
  other: {
    label: "Other Guarantee",
    labelNp: "अन्य जमानत",
    color: "bg-slate-500/20 text-slate-400 border-slate-500/30",
  },
};

export function OrgGuaranteesTab() {
  const utils = trpc.useUtils();
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "extended" | "released" | "expired">("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");

  // Create Form State
  const [type, setType] = useState<"bid_bond" | "performance_bond" | "advance_payment" | "retention_bond" | "car_insurance" | "other">("bid_bond");
  const [guaranteeNumber, setGuaranteeNumber] = useState("");
  const [issuingBank, setIssuingBank] = useState("");
  const [branch, setBranch] = useState("");
  const [beneficiary, setBeneficiary] = useState("");
  const [amount, setAmount] = useState("");
  const [marginAmount, setMarginAmount] = useState("");
  const [commissionPaid, setCommissionPaid] = useState("");
  const [purpose, setPurpose] = useState("");
  const [selectedProjectId, setSelectedProjectId] = useState<string>("none");

  const [issuedDate, setIssuedDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [issuedMiti, setIssuedMiti] = useState(() => {
    try { return adToBs(new Date()).formatted; } catch { return ""; }
  });

  const [expiryDate, setExpiryDate] = useState(() => {
    const d = new Date();
    d.setFullYear(d.getFullYear() + 1);
    return format(d, "yyyy-MM-dd");
  });
  const [expiryMiti, setExpiryMiti] = useState(() => {
    try {
      const d = new Date();
      d.setFullYear(d.getFullYear() + 1);
      return adToBs(d).formatted;
    } catch { return ""; }
  });

  const { data: projectsData } = trpc.project.list.useQuery();
  const projects = projectsData?.projects || [];

  const { data, isLoading } = trpc.bankGuarantee.list.useQuery({
    status: statusFilter,
    type: typeFilter,
  });

  const createMutation = trpc.bankGuarantee.create.useMutation({
    onSuccess: () => {
      toast.success("Guarantee / Bid Bond registered successfully");
      utils.bankGuarantee.list.invalidate();
      setCreateDialogOpen(false);
      // Reset form
      setGuaranteeNumber("");
      setIssuingBank("");
      setBranch("");
      setBeneficiary("");
      setAmount("");
      setMarginAmount("");
      setCommissionPaid("");
      setPurpose("");
      setSelectedProjectId("none");
    },
    onError: (err) => {
      toast.error(err.message || "Failed to create guarantee");
    },
  });

  const releaseMutation = trpc.bankGuarantee.release.useMutation({
    onSuccess: () => {
      toast.success("Guarantee marked as Released");
      utils.bankGuarantee.list.invalidate();
    },
    onError: (err) => {
      toast.error(err.message);
    },
  });

  const deleteMutation = trpc.bankGuarantee.delete.useMutation({
    onSuccess: () => {
      toast.success("Guarantee deleted");
      utils.bankGuarantee.list.invalidate();
    },
    onError: (err) => {
      toast.error(err.message);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!guaranteeNumber || !issuingBank || !beneficiary || !amount) {
      toast.error("Please fill in all required fields");
      return;
    }
    createMutation.mutate({
      projectId: selectedProjectId !== "none" ? selectedProjectId : undefined,
      type,
      guaranteeNumber,
      issuingBank,
      branch: branch || undefined,
      beneficiary,
      amount: parseFloat(amount),
      marginAmount: parseFloat(marginAmount) || 0,
      commissionPaid: parseFloat(commissionPaid) || 0,
      purpose: purpose || undefined,
      issuedDate,
      issuedMiti,
      expiryDate,
      expiryMiti,
    });
  };

  const items = (data?.items || []).filter((item) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      item.guaranteeNumber.toLowerCase().includes(q) ||
      item.issuingBank.toLowerCase().includes(q) ||
      item.beneficiary.toLowerCase().includes(q) ||
      (item.purpose && item.purpose.toLowerCase().includes(q))
    );
  });

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
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5">
        <div className="bg-[#121820]/80 p-4 rounded-2xl border border-white/10">
          <span className="text-[10px] uppercase font-mono text-muted-foreground tracking-wider">Active Exposure (सक्रिय दायित्व)</span>
          <div className="text-xl font-bold font-mono text-emerald-400 mt-1">
            {fmtShort(kpis.totalActiveExposure)}
          </div>
          <span className="text-[11px] text-muted-foreground">{kpis.activeCount} active bonds</span>
        </div>

        <div className="bg-[#121820]/80 p-4 rounded-2xl border border-white/10">
          <span className="text-[10px] uppercase font-mono text-muted-foreground tracking-wider">Bank Margin Held (रोक्का धरौटी)</span>
          <div className="text-xl font-bold font-mono text-amber-400 mt-1">
            {fmtShort(kpis.totalMarginHeld)}
          </div>
          <span className="text-[11px] text-muted-foreground">Cash frozen at bank</span>
        </div>

        <div className="bg-[#121820]/80 p-4 rounded-2xl border border-white/10">
          <span className="text-[10px] uppercase font-mono text-muted-foreground tracking-wider">Total Commission Paid</span>
          <div className="text-xl font-bold font-mono text-blue-400 mt-1">
            Rs. {fmt(kpis.totalCommissionPaid)}
          </div>
          <span className="text-[11px] text-muted-foreground">Bank issuance expenses</span>
        </div>

        <div className="bg-[#121820]/80 p-4 rounded-2xl border border-white/10">
          <span className="text-[10px] uppercase font-mono text-muted-foreground tracking-wider">Expiring &lt; 30 Days</span>
          <div className={cn("text-xl font-bold font-mono mt-1", kpis.expiringWithin30DaysCount > 0 ? "text-rose-400" : "text-gray-400")}>
            {kpis.expiringWithin30DaysCount} Bonds
          </div>
          <span className="text-[11px] text-muted-foreground">Immediate action / extension</span>
        </div>
      </div>

      {/* Filter and Action Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-[#121820]/50 p-3 rounded-xl border border-white/10">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative w-64">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search BG number, bank, client..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8 h-9 text-xs bg-[#161d26] border-white/10 text-white"
            />
          </div>

          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="h-9 text-xs bg-[#161d26] border-white/10 text-white w-48">
              <SelectValue placeholder="All Guarantee Types" />
            </SelectTrigger>
            <SelectContent className="bg-[#0f141c] border-white/10 text-white text-xs">
              <SelectItem value="all">All Guarantee Types</SelectItem>
              <SelectItem value="bid_bond">Bid Bonds / Tender Security</SelectItem>
              <SelectItem value="performance_bond">Performance Bonds</SelectItem>
              <SelectItem value="advance_payment">Mobilization APG</SelectItem>
              <SelectItem value="retention_bond">Retention Guarantees</SelectItem>
              <SelectItem value="car_insurance">CAR Insurance</SelectItem>
            </SelectContent>
          </Select>

          <Select value={statusFilter} onValueChange={(v: any) => setStatusFilter(v)}>
            <SelectTrigger className="h-9 text-xs bg-[#161d26] border-white/10 text-white w-32">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent className="bg-[#0f141c] border-white/10 text-white text-xs">
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="extended">Extended</SelectItem>
              <SelectItem value="released">Released</SelectItem>
              <SelectItem value="expired">Expired</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <Button
          onClick={() => setCreateDialogOpen(true)}
          className="bg-primary hover:bg-primary/90 text-primary-foreground font-bold text-xs gap-1.5 shadow-[0_0_12px_rgba(0,255,102,0.2)]"
        >
          <Plus className="h-4 w-4" /> Add BG / Bid Bond
        </Button>
      </div>

      {/* Guarantees Table */}
      {items.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 px-4 text-center bg-[#121820]/30 rounded-2xl border border-dashed border-white/10 space-y-3">
          <div className="h-12 w-12 rounded-2xl bg-emerald-500/10 flex items-center justify-center text-emerald-400 border border-emerald-500/20">
            <ShieldCheck className="h-6 w-6" />
          </div>
          <h3 className="text-sm font-bold text-white">No Guarantees or Bid Bonds Found</h3>
          <p className="text-xs text-muted-foreground max-w-sm">
            Track tender bid bonds (before project award), performance securities, APG, and insurances across all commercial banks in Nepal.
          </p>
          <Button
            onClick={() => setCreateDialogOpen(true)}
            variant="outline"
            className="text-xs font-bold border-primary/40 text-primary"
          >
            + Register First Guarantee
          </Button>
        </div>
      ) : (
        <div className="rounded-2xl border border-white/10 bg-[#121820]/80 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-[#161d26] text-muted-foreground uppercase font-mono text-[10px] tracking-wider border-b border-white/10">
                <tr>
                  <th className="p-3.5">Type &amp; Bond No</th>
                  <th className="p-3.5">Issuing Bank &amp; Branch</th>
                  <th className="p-3.5">Beneficiary (Employer)</th>
                  <th className="p-3.5">Linked Project / Tender</th>
                  <th className="p-3.5 text-right">Value (NPR)</th>
                  <th className="p-3.5 text-right">Margin / Comm.</th>
                  <th className="p-3.5">Expiry Miti (Days Left)</th>
                  <th className="p-3.5 text-center">Status</th>
                  <th className="p-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 font-mono">
                {items.map((g) => {
                  const typeInfo = TYPE_LABELS[g.type] || TYPE_LABELS.other;

                  return (
                    <tr key={g.id} className="hover:bg-white/[0.02] transition-colors">
                      <td className="p-3.5 font-sans">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className={cn("text-[9px] px-1.5 py-0.5", typeInfo.color)}>
                            {typeInfo.labelNp}
                          </Badge>
                        </div>
                        <div className="font-mono font-bold text-white mt-1">{g.guaranteeNumber}</div>
                        {g.purpose && <p className="text-[10px] text-muted-foreground line-clamp-1 mt-0.5">{g.purpose}</p>}
                      </td>

                      <td className="p-3.5 font-sans">
                        <div className="font-semibold text-white">{g.issuingBank}</div>
                        <div className="text-[11px] text-muted-foreground font-mono">{g.branch || "Head Office"}</div>
                      </td>

                      <td className="p-3.5 font-sans">
                        <div className="text-white/90 font-medium">{g.beneficiary}</div>
                      </td>

                      <td className="p-3.5 font-sans">
                        {g.project ? (
                          <div>
                            <span className="text-emerald-400 font-bold">{g.project.code}</span>
                            <p className="text-[11px] text-muted-foreground line-clamp-1">{g.project.name}</p>
                          </div>
                        ) : (
                          <Badge variant="outline" className="text-[10px] font-mono text-amber-400 border-amber-500/30 bg-amber-500/10">
                            Pre-Award / Tender
                          </Badge>
                        )}
                      </td>

                      <td className="p-3.5 text-right font-bold text-white">
                        Rs. {fmt(g.amount)}
                      </td>

                      <td className="p-3.5 text-right">
                        <div className="text-amber-400 font-bold">M: Rs. {fmt(g.marginAmount)}</div>
                        <div className="text-blue-400 text-[10px]">C: Rs. {fmt(g.commissionPaid)}</div>
                      </td>

                      <td className="p-3.5 font-sans">
                        <div className="font-mono font-bold text-white">{g.expiryMiti || format(new Date(g.expiryDate), "yyyy-MM-dd")}</div>
                        {g.status === "active" || g.status === "extended" ? (
                          <div className={cn("text-[10px] font-mono mt-0.5", g.daysRemaining <= 30 ? "text-rose-400 font-bold" : "text-muted-foreground")}>
                            {g.daysRemaining >= 0 ? `${g.daysRemaining} days left` : "Expired"}
                          </div>
                        ) : (
                          <div className="text-[10px] text-muted-foreground capitalize font-mono">{g.status}</div>
                        )}
                      </td>

                      <td className="p-3.5 text-center font-sans">
                        <Badge
                          variant="outline"
                          className={cn(
                            "text-[10px] capitalize",
                            g.status === "active" && "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
                            g.status === "extended" && "bg-blue-500/15 text-blue-400 border-blue-500/30",
                            g.status === "released" && "bg-slate-500/15 text-slate-400 border-slate-500/30",
                            g.status === "expired" && "bg-rose-500/15 text-rose-400 border-rose-500/30"
                          )}
                        >
                          {g.status}
                        </Badge>
                      </td>

                      <td className="p-3.5 text-right font-sans">
                        <div className="flex items-center justify-end gap-1.5">
                          {g.status !== "released" && (
                            <Button
                              onClick={() => releaseMutation.mutate({ id: g.id })}
                              variant="ghost"
                              size="sm"
                              className="h-7 px-2 text-[10px] font-bold text-muted-foreground hover:text-emerald-400 hover:bg-emerald-500/10"
                            >
                              Release
                            </Button>
                          )}
                          <Button
                            onClick={() => {
                              if (confirm("Delete this guarantee record?")) {
                                deleteMutation.mutate({ id: g.id });
                              }
                            }}
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0 text-muted-foreground hover:text-rose-400 hover:bg-rose-500/10"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Register BG / Bid Bond Dialog */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="sm:max-w-[560px] bg-[#0c1015] border-white/10 text-white backdrop-blur-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base font-bold text-white">
              <ShieldCheck className="h-5 w-5 text-emerald-400" /> Register Bank Guarantee / Bid Bond
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Add Tender Bid Bonds (Pre-Award), Performance Bonds, or APGs to track margins, expiry &amp; costs.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4 pt-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs font-semibold">Guarantee Type *</Label>
                <Select value={type} onValueChange={(v: any) => setType(v)}>
                  <SelectTrigger className="h-9 text-xs bg-[#161d26] border-white/10 text-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-[#0f141c] border-white/10 text-white text-xs">
                    <SelectItem value="bid_bond">Bid Bond / Tender Security (बोलपत्र जमानत)</SelectItem>
                    <SelectItem value="performance_bond">Performance Bond (कार्यसम्पादन जमानत)</SelectItem>
                    <SelectItem value="advance_payment">Mobilization APG (पेश्की जमानत)</SelectItem>
                    <SelectItem value="retention_bond">Retention Guarantee (धरौटी जमानत)</SelectItem>
                    <SelectItem value="car_insurance">CAR Insurance Policy (बीमा)</SelectItem>
                    <SelectItem value="other">Other Guarantee</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label className="text-xs font-semibold">Linked Project / Tender</Label>
                <Select value={selectedProjectId} onValueChange={setSelectedProjectId}>
                  <SelectTrigger className="h-9 text-xs bg-[#161d26] border-white/10 text-white">
                    <SelectValue placeholder="Pre-Award / Tender (No Project)" />
                  </SelectTrigger>
                  <SelectContent className="bg-[#0f141c] border-white/10 text-white text-xs">
                    <SelectItem value="none">Pre-Award Tender (No Project Yet)</SelectItem>
                    {projects.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.code} - {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs font-semibold">BG / Policy Number *</Label>
                <Input
                  required
                  placeholder="e.g. BG/NABIL/2081/042"
                  value={guaranteeNumber}
                  onChange={(e) => setGuaranteeNumber(e.target.value)}
                  className="h-9 text-xs font-mono bg-[#161d26] border-white/10 text-white"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs font-semibold">Issuing Bank / Insurer *</Label>
                <Input
                  required
                  placeholder="e.g. Nabil Bank / Global IME"
                  value={issuingBank}
                  onChange={(e) => setIssuingBank(e.target.value)}
                  className="h-9 text-xs bg-[#161d26] border-white/10 text-white"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs font-semibold">Beneficiary (Client / Employer) *</Label>
                <Input
                  required
                  placeholder="e.g. Division Road Office, Hetauda"
                  value={beneficiary}
                  onChange={(e) => setBeneficiary(e.target.value)}
                  className="h-9 text-xs bg-[#161d26] border-white/10 text-white"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Bank Branch</Label>
                <Input
                  placeholder="e.g. New Road / Hetauda Branch"
                  value={branch}
                  onChange={(e) => setBranch(e.target.value)}
                  className="h-9 text-xs bg-[#161d26] border-white/10 text-white"
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3 bg-[#121820] p-3 rounded-xl border border-white/5">
              <div className="space-y-1">
                <Label className="text-xs font-semibold">Guarantee Value (Rs.) *</Label>
                <Input
                  required
                  type="number"
                  step="any"
                  placeholder="0.00"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="h-9 text-xs font-mono font-bold bg-[#161d26] border-white/10 text-white"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Margin Held (Rs.)</Label>
                <Input
                  type="number"
                  step="any"
                  placeholder="0.00"
                  value={marginAmount}
                  onChange={(e) => setMarginAmount(e.target.value)}
                  className="h-9 text-xs font-mono bg-[#161d26] border-white/10 text-white"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Commission Paid (Rs.)</Label>
                <Input
                  type="number"
                  step="any"
                  placeholder="0.00"
                  value={commissionPaid}
                  onChange={(e) => setCommissionPaid(e.target.value)}
                  className="h-9 text-xs font-mono bg-[#161d26] border-white/10 text-white"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs font-semibold">Issued Date (Miti)</Label>
                <Input
                  placeholder="2081-02-15"
                  value={issuedMiti}
                  onChange={(e) => {
                    setIssuedMiti(e.target.value);
                    try {
                      const ad = bsToAd(e.target.value);
                      if (ad) setIssuedDate(format(ad, "yyyy-MM-dd"));
                    } catch {}
                  }}
                  className="h-9 text-xs font-mono bg-[#161d26] border-white/10 text-white"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs font-semibold">Expiry Date (Miti) *</Label>
                <Input
                  required
                  placeholder="2082-02-14"
                  value={expiryMiti}
                  onChange={(e) => {
                    setExpiryMiti(e.target.value);
                    try {
                      const ad = bsToAd(e.target.value);
                      if (ad) setExpiryDate(format(ad, "yyyy-MM-dd"));
                    } catch {}
                  }}
                  className="h-9 text-xs font-mono bg-[#161d26] border-white/10 text-white"
                />
              </div>
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Purpose / Package Name (Optional)</Label>
              <Input
                placeholder="e.g. Bid Security for IFB No. 04/2081/82"
                value={purpose}
                onChange={(e) => setPurpose(e.target.value)}
                className="h-9 text-xs bg-[#161d26] border-white/10 text-white"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-4 border-t border-white/10">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setCreateDialogOpen(false)}
                className="text-xs text-muted-foreground"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={createMutation.isPending}
                className="bg-primary hover:bg-primary/90 text-primary-foreground font-bold text-xs px-5"
              >
                {createMutation.isPending ? "Saving..." : "Save Guarantee"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
