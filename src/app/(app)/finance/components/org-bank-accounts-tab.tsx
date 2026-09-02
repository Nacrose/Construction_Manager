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
      <div className="flex flex-wrap items-center justify-between gap-2 p-2 rounded-lg border border-[var(--border)] bg-card level-2-surface shadow-xs">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Building2 className="h-4 w-4 text-[var(--primary)]" />
            <span className="text-xs font-bold text-foreground/90">Treasury & Bank Facilities</span>
          </div>
          <div className="h-4 w-[1px] bg-secondary" />
          <div className="flex items-center gap-1.5 text-xs font-matrix">
            <span className="text-[11px] text-muted-foreground font-sans">Total Balance:</span>
            <span className="font-bold text-emerald-700">NPR {formatNpr(totalBalance)}</span>
          </div>
        </div>

        <Button
          size="sm"
          onClick={() => setCreateDialogOpen(true)}
          className="amber-cta-btn text-foreground font-bold text-xs h-7 px-2.5 shadow-sm inline-flex items-center gap-1.5"
        >
          <Plus className="h-3.5 w-3.5" />
          <span>Add Bank / Wallet</span>
        </Button>
      </div>

      {/* Account Grid */}
      {accounts.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 px-4 text-center bg-card rounded-lg border border-dashed border-[var(--border)] space-y-2 shadow-xs">
          <div className="h-10 w-10 rounded-xl bg-emerald-50 flex items-center justify-center text-emerald-600 border border-emerald-200">
            <Wallet className="h-5 w-5" />
          </div>
          <h3 className="text-xs font-bold text-foreground">No Bank Accounts or Wallets Added</h3>
          <p className="text-[11px] text-muted-foreground max-w-sm font-sans">
            Add company bank accounts (Nabil, Global IME, NIC Asia) or wallets (eSewa, Khalti, ConnectIPS) to track treasury balances and link to vouchers.
          </p>
          <div className="pt-2">
            <Button
              size="sm"
              onClick={() => setCreateDialogOpen(true)}
              className="amber-cta-btn text-foreground font-bold text-xs h-7 px-2.5 shadow-sm inline-flex items-center gap-1.5"
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
                className="bg-card rounded-lg border border-[var(--border)] p-3 relative overflow-hidden transition-all hover:border-[var(--primary)]/50 shadow-xs flex flex-col justify-between"
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="h-8 w-8 rounded-lg bg-info/10 border border-info/30 flex items-center justify-center text-[var(--primary)]">
                      {isWallet ? <Smartphone className="h-4 w-4" /> : <Landmark className="h-4 w-4" />}
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-foreground flex items-center gap-1.5">
                        {acc.bankName}
                        {acc.isDefault && (
                          <Badge className="bg-emerald-100 text-emerald-800 border-emerald-300 text-[9px] font-mono px-1 py-0">
                            Default
                          </Badge>
                        )}
                      </h4>
                      <p className="text-[11px] text-muted-foreground font-sans">{acc.accountName}</p>
                    </div>
                  </div>

                  <Badge variant="outline" className="text-[9px] uppercase font-mono text-muted-foreground border-[#c5d7e8] bg-[#f0f6fc]">
                    {acc.accountType}
                  </Badge>
                </div>

                <div className="mt-3 pt-2.5 border-t border-border space-y-1">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-muted-foreground font-sans">Account #:</span>
                    <span className="font-mono font-bold text-foreground/90">{acc.accountNumber}</span>
                  </div>

                  {acc.branch && (
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-muted-foreground font-sans">Branch:</span>
                      <span className="text-foreground/80 font-sans">{acc.branch}</span>
                    </div>
                  )}

                  <div className="flex items-center justify-between text-xs pt-1 border-t border-border/60 font-matrix">
                    <span className="text-muted-foreground text-[11px] font-sans">Current Balance:</span>
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

      {/* Add Bank Account Dialog */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="sm:max-w-[650px] w-full p-0 gap-0 bg-card border border-[var(--border)] text-foreground rounded-2xl shadow-2xl overflow-hidden font-sans">
          <div className="px-6 py-4 border-b border-[var(--input)] bg-[#f8fbfe] flex items-center justify-between">
            <div>
              <DialogTitle className="flex items-center gap-2 text-base font-bold text-foreground">
                <Building2 className="h-4 w-4 text-[var(--primary)]" /> Add Bank Account / Digital Wallet
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground font-mono mt-0.5">
                Register commercial bank accounts, overdraft facilities, or wallets for central payments.
              </DialogDescription>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="p-6 space-y-3.5 text-xs bg-card">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-[11px] font-semibold text-foreground/80">Account Category *</Label>
                <Select value={accountType} onValueChange={(v: any) => setAccountType(v)}>
                  <SelectTrigger className="h-9 text-xs bg-card border-[var(--border)] text-foreground font-mono focus:border-[var(--primary)]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-card border-[var(--border)] text-foreground text-xs font-mono shadow-xl rounded-xl">
                    <SelectItem value="current">Current Account (चालु खाता)</SelectItem>
                    <SelectItem value="overdraft">Overdraft Facility (OD Loan)</SelectItem>
                    <SelectItem value="saving">Savings Account (बचत खाता)</SelectItem>
                    <SelectItem value="petty_cash">Digital Wallet / Site Imprest</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label className="text-[11px] font-semibold text-foreground/80">Bank / Provider *</Label>
                <Input
                  required
                  placeholder="e.g. Nabil Bank, eSewa, ConnectIPS"
                  value={bankName}
                  onChange={(e) => setBankName(e.target.value)}
                  className="h-9 text-xs bg-card border-[var(--border)] text-foreground font-mono focus:border-[var(--primary)]"
                />
              </div>
            </div>

            <div className="space-y-1">
              <Label className="text-[11px] font-semibold text-foreground/80">Account Holder Name *</Label>
              <Input
                required
                placeholder="e.g. Nacrose Construction Pvt. Ltd."
                value={accountName}
                onChange={(e) => setAccountName(e.target.value)}
                className="h-9 text-xs bg-card border-[var(--border)] text-foreground focus:border-[var(--primary)]"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-[11px] font-semibold text-foreground/80">Account Number / Wallet ID *</Label>
                <Input
                  required
                  placeholder="e.g. 01201017500123 / 9801234567"
                  value={accountNumber}
                  onChange={(e) => setAccountNumber(e.target.value)}
                  className="h-9 text-xs font-mono bg-card border-[var(--border)] text-foreground focus:border-[var(--primary)]"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-[11px] font-semibold text-foreground/80">Branch Name (Optional)</Label>
                <Input
                  placeholder="e.g. New Road / Hetauda Branch"
                  value={branch}
                  onChange={(e) => setBranch(e.target.value)}
                  className="h-9 text-xs bg-card border-[var(--border)] text-foreground font-mono focus:border-[var(--primary)]"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 items-end">
              <div className="space-y-1">
                <Label className="text-[11px] font-semibold text-foreground/80">Opening Balance (NPR)</Label>
                <Input
                  type="number"
                  step="any"
                  placeholder="0.00"
                  value={openingBalance}
                  onChange={(e) => setOpeningBalance(e.target.value)}
                  className="h-9 text-xs font-mono font-bold bg-card border-[var(--border)] text-foreground focus:border-[var(--primary)]"
                />
              </div>

              <div className="flex items-center gap-2 pb-1.5">
                <input
                  type="checkbox"
                  id="isDefault"
                  checked={isDefault}
                  onChange={(e) => setIsDefault(e.target.checked)}
                  className="rounded border-[var(--border)] accent-amber-500 h-4 w-4"
                />
                <Label htmlFor="isDefault" className="text-xs cursor-pointer font-mono text-foreground/80">
                  Default primary account
                </Label>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-[var(--input)]">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setCreateDialogOpen(false)}
                className="text-xs h-8 border-[var(--border)] text-muted-foreground hover:bg-muted"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={createMutation.isPending}
                className="amber-cta-btn text-white font-bold text-xs h-8 px-4 shadow-sm"
              >
                {createMutation.isPending ? "Saving..." : "Save Account (खाता सुरक्षित)"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
