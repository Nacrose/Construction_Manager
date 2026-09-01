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
  Building2,
  Wallet,
  Plus,
  Smartphone,
  Landmark,
} from "lucide-react";
import { toast } from "sonner";
import { formatNpr } from "@/lib/currency";

import { StatCardSkeleton } from "@/components/ui/matrix-skeleton";

export function OrgBankAccountsTab() {
  const utils = trpc.useUtils();
  const [createDialogOpen, setCreateDialogOpen] = useState(false);

  // Form State
  const [bankName, setBankName] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [accountName, setAccountName] = useState("");
  const [accountType, setAccountType] = useState<"current" | "saving" | "overdraft" | "petty_cash">("current");
  const [branch, setBranch] = useState("");
  const [openingBalance, setOpeningBalance] = useState("");
  const [isDefault, setIsDefault] = useState(false);

  const { data, isLoading } = trpc.finance.orgBankAccounts.useQuery();
  const accounts = data?.accounts || [];
  const totalBalance = accounts.reduce((sum, acc) => sum + (acc.currentBalance || 0), 0);

  const createMutation = trpc.finance.createBankAccount.useMutation({
    onSuccess: () => {
      toast.success("Bank / Wallet Account added successfully");
      utils.finance.orgBankAccounts.invalidate();
      setCreateDialogOpen(false);
      // Reset form
      setBankName("");
      setAccountNumber("");
      setAccountName("");
      setBranch("");
      setOpeningBalance("");
      setIsDefault(false);
    },
    onError: (err) => {
      toast.error(err.message || "Failed to create account");
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!bankName || !accountNumber || !accountName) {
      toast.error("Please fill in all required fields");
      return;
    }
    createMutation.mutate({
      bankName,
      accountNumber,
      accountName,
      accountType,
      branch: branch || undefined,
      openingBalance: parseFloat(openingBalance) || 0,
      isDefault,
    });
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <StatCardSkeleton count={3} />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Action Strip (Single Action Bar) */}
      <div className="flex flex-wrap items-center justify-between gap-2 p-2 rounded-lg border border-[#c7d8e8] bg-white level-2-surface shadow-xs">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Building2 className="h-4 w-4 text-[#0284c7]" />
            <span className="text-xs font-bold text-slate-800">Treasury & Bank Facilities</span>
          </div>
          <div className="h-4 w-[1px] bg-slate-200" />
          <div className="flex items-center gap-1.5 text-xs font-matrix">
            <span className="text-[11px] text-slate-500 font-sans">Total Balance:</span>
            <span className="font-bold text-emerald-700">NPR {formatNpr(totalBalance)}</span>
          </div>
        </div>

        <Button
          size="sm"
          onClick={() => setCreateDialogOpen(true)}
          className="amber-cta-btn text-slate-950 font-bold text-xs h-7 px-2.5 shadow-sm inline-flex items-center gap-1.5"
        >
          <Plus className="h-3.5 w-3.5" />
          <span>Add Bank / Wallet</span>
        </Button>
      </div>

      {/* Account Grid */}
      {accounts.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 px-4 text-center bg-white rounded-lg border border-dashed border-[#c7d8e8] space-y-2 shadow-xs">
          <div className="h-10 w-10 rounded-xl bg-emerald-50 flex items-center justify-center text-emerald-600 border border-emerald-200">
            <Wallet className="h-5 w-5" />
          </div>
          <h3 className="text-xs font-bold text-slate-900">No Bank Accounts or Wallets Added</h3>
          <p className="text-[11px] text-slate-500 max-w-sm font-sans">
            Add company bank accounts (Nabil, Global IME, NIC Asia) or wallets (eSewa, Khalti, ConnectIPS) to track treasury balances and link to vouchers.
          </p>
          <div className="pt-2">
            <Button
              size="sm"
              onClick={() => setCreateDialogOpen(true)}
              className="amber-cta-btn text-slate-950 font-bold text-xs h-7 px-2.5 shadow-sm inline-flex items-center gap-1.5"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Add First Account</span>
            </Button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5">
          {accounts.map((acc) => {
            const isWallet = acc.accountType === "petty_cash" || acc.bankName.toLowerCase().includes("esewa") || acc.bankName.toLowerCase().includes("khalti") || acc.bankName.toLowerCase().includes("connectips");

            return (
              <div
                key={acc.id}
                className="bg-white rounded-lg border border-[#c7d8e8] p-3 relative overflow-hidden transition-all hover:border-[#0284c7]/50 shadow-xs flex flex-col justify-between"
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="h-8 w-8 rounded-lg bg-sky-50 border border-sky-200 flex items-center justify-center text-[#0284c7]">
                      {isWallet ? <Smartphone className="h-4 w-4" /> : <Landmark className="h-4 w-4" />}
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                        {acc.bankName}
                        {acc.isDefault && (
                          <Badge className="bg-emerald-100 text-emerald-800 border-emerald-300 text-[9px] font-mono px-1 py-0">
                            Default
                          </Badge>
                        )}
                      </h4>
                      <p className="text-[11px] text-slate-500 font-sans">{acc.accountName}</p>
                    </div>
                  </div>

                  <Badge variant="outline" className="text-[9px] uppercase font-mono text-slate-600 border-[#c5d7e8] bg-[#f0f6fc]">
                    {acc.accountType}
                  </Badge>
                </div>

                <div className="mt-3 pt-2.5 border-t border-slate-100 space-y-1">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-slate-500 font-sans">Account #:</span>
                    <span className="font-mono font-bold text-slate-800">{acc.accountNumber}</span>
                  </div>

                  {acc.branch && (
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-slate-500 font-sans">Branch:</span>
                      <span className="text-slate-700 font-sans">{acc.branch}</span>
                    </div>
                  )}

                  <div className="flex items-center justify-between text-xs pt-1 border-t border-slate-100/60 font-matrix">
                    <span className="text-slate-500 text-[11px] font-sans">Current Balance:</span>
                    <span className="font-bold text-emerald-700 text-sm">
                      NPR {formatNpr(acc.currentBalance || 0)}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add Bank Account Dialog with 16:10 Widescreen & Dark Glass Blur */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="sm:max-w-[650px] w-full bg-[#0c1015] border-white/10 text-white backdrop-blur-md bg-black/85 p-5">
          <DialogHeader className="pb-2 border-b border-white/10">
            <DialogTitle className="flex items-center gap-2 text-sm font-bold text-white">
              <Building2 className="h-4 w-4 text-[#38bdf8]" /> Add Bank Account / Digital Wallet
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-400 font-mono">
              Register commercial bank accounts, overdraft facilities, or wallets for central payments.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-3 pt-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs font-semibold text-slate-200">Account Category *</Label>
                <Select value={accountType} onValueChange={(v: any) => setAccountType(v)}>
                  <SelectTrigger className="h-8 text-xs bg-[#161d26] border-white/15 text-white font-mono">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-[#0f141c] border-white/20 text-white text-xs font-mono">
                    <SelectItem value="current">Current Account (चालु खाता)</SelectItem>
                    <SelectItem value="overdraft">Overdraft Facility (OD Loan)</SelectItem>
                    <SelectItem value="saving">Savings Account (बचत खाता)</SelectItem>
                    <SelectItem value="petty_cash">Digital Wallet / Site Imprest</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label className="text-xs font-semibold text-slate-200">Bank / Provider *</Label>
                <Input
                  required
                  placeholder="e.g. Nabil Bank, eSewa, ConnectIPS"
                  value={bankName}
                  onChange={(e) => setBankName(e.target.value)}
                  className="h-8 text-xs bg-[#161d26] border-white/15 text-white font-mono placeholder:text-slate-500"
                />
              </div>
            </div>

            <div className="space-y-1">
              <Label className="text-xs font-semibold text-slate-200">Account Holder Name *</Label>
              <Input
                required
                placeholder="e.g. Nacrose Construction Pvt. Ltd."
                value={accountName}
                onChange={(e) => setAccountName(e.target.value)}
                className="h-8 text-xs bg-[#161d26] border-white/15 text-white placeholder:text-slate-500"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs font-semibold text-slate-200">Account Number / Wallet ID *</Label>
                <Input
                  required
                  placeholder="e.g. 01201017500123 / 9801234567"
                  value={accountNumber}
                  onChange={(e) => setAccountNumber(e.target.value)}
                  className="h-8 text-xs font-mono bg-[#161d26] border-white/15 text-white placeholder:text-slate-500"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs text-slate-200">Branch Name (Optional)</Label>
                <Input
                  placeholder="e.g. New Road / Hetauda Branch"
                  value={branch}
                  onChange={(e) => setBranch(e.target.value)}
                  className="h-8 text-xs bg-[#161d26] border-white/15 text-white font-mono placeholder:text-slate-500"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 items-end">
              <div className="space-y-1">
                <Label className="text-xs font-semibold text-slate-200">Opening Balance (NPR)</Label>
                <Input
                  type="number"
                  step="any"
                  placeholder="0.00"
                  value={openingBalance}
                  onChange={(e) => setOpeningBalance(e.target.value)}
                  className="h-8 text-xs font-mono font-bold bg-[#161d26] border-white/15 text-white placeholder:text-slate-500"
                />
              </div>

              <div className="flex items-center gap-2 pb-1.5">
                <input
                  type="checkbox"
                  id="isDefault"
                  checked={isDefault}
                  onChange={(e) => setIsDefault(e.target.checked)}
                  className="rounded border-white/20 bg-muted accent-amber-500 h-4 w-4"
                />
                <Label htmlFor="isDefault" className="text-xs cursor-pointer font-mono text-slate-300">
                  Default primary account
                </Label>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-white/10">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setCreateDialogOpen(false)}
                className="text-xs text-slate-400 font-mono hover:text-white"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={createMutation.isPending}
                className="amber-cta-btn text-slate-950 font-bold text-xs h-7 px-4 shadow-sm"
              >
                {createMutation.isPending ? "Saving..." : "Save Account"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
