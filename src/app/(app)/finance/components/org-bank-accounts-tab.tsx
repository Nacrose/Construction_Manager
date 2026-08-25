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
  CreditCard,
  CheckCircle2,
  Layers,
  ArrowUpRight,
  ArrowDownRight,
  QrCode,
  Smartphone,
  Landmark,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

function fmt(n: number) {
  return n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

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

  const totalBalance = accounts.reduce((sum, acc) => sum + (acc.currentBalance || 0), 0);

  return (
    <div className="space-y-6">
      {/* Header & KPI Summary */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-[#121820]/60 p-4 rounded-2xl border border-white/10">
        <div>
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <Building2 className="h-5 w-5 text-emerald-400" /> Company Bank Accounts &amp; Digital Wallets
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Central treasury accounts, overdraft facilities, eSewa/Khalti wallets &amp; site imprest funds.
          </p>
        </div>

        <div className="flex items-center gap-4">
          <div className="text-right">
            <span className="text-[10px] uppercase font-mono text-muted-foreground tracking-wider">Total Treasury Balance</span>
            <div className="text-lg font-bold font-mono text-emerald-400">
              Rs. {fmt(totalBalance)}
            </div>
          </div>

          <Button
            onClick={() => setCreateDialogOpen(true)}
            className="bg-primary hover:bg-primary/90 text-primary-foreground font-bold text-xs gap-1.5 shadow-[0_0_12px_rgba(0,255,102,0.2)]"
          >
            <Plus className="h-4 w-4" /> Add Account / Wallet
          </Button>
        </div>
      </div>

      {/* Account Grid */}
      {accounts.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 px-4 text-center bg-[#121820]/30 rounded-2xl border border-dashed border-white/10 space-y-3">
          <div className="h-12 w-12 rounded-2xl bg-emerald-500/10 flex items-center justify-center text-emerald-400 border border-emerald-500/20">
            <Wallet className="h-6 w-6" />
          </div>
          <h3 className="text-sm font-bold text-white">No Bank Accounts or Wallets Added</h3>
          <p className="text-xs text-muted-foreground max-w-sm">
            Add company bank accounts (Nabil, Global IME, NIC Asia) or wallets (eSewa, Khalti, ConnectIPS) to track treasury balances and link to vouchers.
          </p>
          <Button
            onClick={() => setCreateDialogOpen(true)}
            variant="outline"
            className="text-xs font-bold border-primary/40 text-primary"
          >
            + Add First Account
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {accounts.map((acc) => {
            const isWallet = acc.accountType === "petty_cash" || acc.bankName.toLowerCase().includes("esewa") || acc.bankName.toLowerCase().includes("khalti") || acc.bankName.toLowerCase().includes("connectips");

            return (
              <div
                key={acc.id}
                className="bg-[#121820]/80 rounded-2xl border border-white/10 p-5 relative overflow-hidden transition-all hover:border-emerald-500/40 shadow-sm"
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
                      {isWallet ? <Smartphone className="h-5 w-5" /> : <Landmark className="h-5 w-5" />}
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-white flex items-center gap-2">
                        {acc.bankName}
                        {acc.isDefault && (
                          <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30 text-[9px]">
                            Primary
                          </Badge>
                        )}
                      </h4>
                      <p className="text-xs text-muted-foreground font-mono">{acc.accountName}</p>
                    </div>
                  </div>

                  <Badge variant="outline" className="text-[10px] capitalize font-mono text-white/70 border-white/10">
                    {acc.accountType}
                  </Badge>
                </div>

                <div className="mt-4 pt-4 border-t border-white/5 space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground font-mono">Account / ID:</span>
                    <span className="font-mono font-bold text-white">{acc.accountNumber}</span>
                  </div>

                  {acc.branch && (
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground font-mono">Branch:</span>
                      <span className="text-white/80">{acc.branch}</span>
                    </div>
                  )}

                  <div className="flex items-center justify-between text-xs pt-1">
                    <span className="text-muted-foreground font-mono">Current Balance:</span>
                    <span className="font-mono font-bold text-emerald-400 text-sm">
                      Rs. {fmt(acc.currentBalance || 0)}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add Bank Account Dialog */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="sm:max-w-[500px] bg-[#0c1015] border-white/10 text-white backdrop-blur-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base font-bold text-white">
              <Building2 className="h-5 w-5 text-emerald-400" /> Add Bank Account / Digital Wallet
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Register commercial bank accounts, overdraft facilities, or wallets for central payments.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4 pt-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs font-semibold">Account Category *</Label>
                <Select value={accountType} onValueChange={(v: any) => setAccountType(v)}>
                  <SelectTrigger className="h-9 text-xs bg-[#161d26] border-white/10 text-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-[#0f141c] border-white/10 text-white text-xs">
                    <SelectItem value="current">Current Account (चालु खाता)</SelectItem>
                    <SelectItem value="overdraft">Overdraft Facility (OD Loan)</SelectItem>
                    <SelectItem value="saving">Savings Account (बचत खाता)</SelectItem>
                    <SelectItem value="petty_cash">Digital Wallet / Site Imprest</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label className="text-xs font-semibold">Bank / Provider *</Label>
                <Input
                  required
                  placeholder="e.g. Nabil Bank, eSewa, ConnectIPS"
                  value={bankName}
                  onChange={(e) => setBankName(e.target.value)}
                  className="h-9 text-xs bg-[#161d26] border-white/10 text-white"
                />
              </div>
            </div>

            <div className="space-y-1">
              <Label className="text-xs font-semibold">Account Holder Name *</Label>
              <Input
                required
                placeholder="e.g. Nacrose Construction Pvt. Ltd."
                value={accountName}
                onChange={(e) => setAccountName(e.target.value)}
                className="h-9 text-xs bg-[#161d26] border-white/10 text-white"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs font-semibold">Account Number / Wallet ID *</Label>
                <Input
                  required
                  placeholder="e.g. 01201017500123 / 9801234567"
                  value={accountNumber}
                  onChange={(e) => setAccountNumber(e.target.value)}
                  className="h-9 text-xs font-mono bg-[#161d26] border-white/10 text-white"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Branch Name (Optional)</Label>
                <Input
                  placeholder="e.g. New Road / Hetauda Branch"
                  value={branch}
                  onChange={(e) => setBranch(e.target.value)}
                  className="h-9 text-xs bg-[#161d26] border-white/10 text-white"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs font-semibold">Opening Balance (Rs.)</Label>
                <Input
                  type="number"
                  step="any"
                  placeholder="0.00"
                  value={openingBalance}
                  onChange={(e) => setOpeningBalance(e.target.value)}
                  className="h-9 text-xs font-mono font-bold bg-[#161d26] border-white/10 text-white"
                />
              </div>

              <div className="flex items-center gap-2 pt-6">
                <input
                  type="checkbox"
                  id="isDefault"
                  checked={isDefault}
                  onChange={(e) => setIsDefault(e.target.checked)}
                  className="rounded border-white/20 bg-muted accent-primary h-4 w-4"
                />
                <Label htmlFor="isDefault" className="text-xs cursor-pointer">
                  Default primary account
                </Label>
              </div>
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
                {createMutation.isPending ? "Saving..." : "Save Account"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
