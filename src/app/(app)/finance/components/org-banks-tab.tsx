"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
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
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { formatNpr } from "@/lib/currency";

export function OrgBanksTab() {
  const utils = trpc.useUtils();
  const [addOpen, setAddOpen] = useState(false);

  // Add form fields
  const [bankName, setBankName] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [accountName, setAccountName] = useState("Nacrose Construction Pvt. Ltd.");
  const [accountType, setAccountType] = useState<"current" | "saving" | "overdraft" | "petty_cash">("current");
  const [branch, setBranch] = useState("");
  const [openingBalance, setOpeningBalance] = useState("0");
  const [isDefault, setIsDefault] = useState(false);

  const { data, isLoading } = trpc.finance.orgBankAccounts.useQuery();
  const accounts = data?.accounts || [];

  const createMutation = trpc.finance.createBankAccount.useMutation({
    onSuccess: () => {
      utils.finance.orgBankAccounts.invalidate();
      utils.finance.orgSummary.invalidate();
      toast.success("Bank account created successfully!");
      setAddOpen(false);
      setBankName("");
      setAccountNumber("");
      setBranch("");
      setOpeningBalance("0");
    },
    onError: (e) => toast.error(e.message),
  });

  const totalBankBalance = accounts.reduce((s, a) => s + (a.currentBalance || 0), 0);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!bankName.trim() || !accountNumber.trim() || !accountName.trim()) {
      toast.error("Please fill in required fields.");
      return;
    }

    createMutation.mutate({
      bankName: bankName.trim(),
      accountNumber: accountNumber.trim(),
      accountName: accountName.trim(),
      accountType,
      branch: branch.trim() || undefined,
      openingBalance: parseFloat(openingBalance) || 0,
      isDefault,
    });
  };

  return (
    <div className="space-y-4">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-card p-4 rounded-xl border shadow-sm">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-lg bg-primary/10 text-primary">
            <Wallet className="h-6 w-6" />
          </div>
          <div>
            <div className="text-xs text-muted-foreground uppercase font-mono">
              Total Company Liquid Balances (कुल नगद तथा बैंक मौज्दात)
            </div>
            <div className="text-2xl font-bold font-mono text-foreground">
              {formatNpr(totalBankBalance)}
            </div>
          </div>
        </div>

        <Button
          size="sm"
          onClick={() => setAddOpen(true)}
          className="gap-1.5 font-semibold text-xs h-9 shadow-sm font-mono"
        >
          <Plus className="h-4 w-4" />
          Add Company Bank Account
        </Button>
      </div>

      {/* Bank Accounts Grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-36 rounded-xl" />
          ))}
        </div>
      ) : accounts.length === 0 ? (
        <div className="rounded-xl border border-dashed p-12 text-center bg-card">
          <Building2 className="mx-auto h-10 w-10 text-muted-foreground mb-3" />
          <h3 className="text-base font-bold text-foreground">No Company Bank Accounts Registered</h3>
          <p className="text-xs text-muted-foreground mt-1 max-w-sm mx-auto font-mono">
            Add your central company bank accounts (e.g. Nabil Bank, Global IME Bank, Head Office Cash) to issue payments and track live balances.
          </p>
          <Button size="sm" onClick={() => setAddOpen(true)} className="mt-4 gap-1.5 text-xs font-mono">
            <Plus className="h-4 w-4" />
            Add First Bank Account
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {accounts.map((acc) => (
            <Card key={acc.id} className="shadow-sm border-l-4 border-l-primary bg-card">
              <CardContent className="p-4 space-y-3">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-foreground text-sm">{acc.bankName}</span>
                      {acc.isDefault && (
                        <Badge className="text-[9px] bg-primary text-primary-foreground font-mono">
                          Primary
                        </Badge>
                      )}
                    </div>
                    <div className="text-[11px] text-muted-foreground mt-0.5 font-mono">
                      {acc.branch ? `${acc.branch} • ` : ""}
                      {acc.accountType.toUpperCase()} A/C
                    </div>
                  </div>

                  <Badge variant="outline" className="text-[10px] font-mono">
                    {acc.accountType}
                  </Badge>
                </div>

                <div className="pt-2 border-t font-mono space-y-1">
                  <div className="text-[11px] text-muted-foreground flex justify-between">
                    <span>A/C No:</span>
                    <span className="font-bold text-foreground">{acc.accountNumber}</span>
                  </div>
                  <div className="text-xs flex justify-between items-baseline pt-1">
                    <span className="text-[10px] text-muted-foreground uppercase">Current Balance:</span>
                    <span className="text-base font-bold text-primary">{formatNpr(acc.currentBalance || 0)}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Add Bank Account Dialog with Backdrop Blur */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-md backdrop-blur-md bg-black/85 border-white/10 text-white">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base text-white">
              <Building2 className="h-5 w-5 text-emerald-400" />
              Add Company Bank Account
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-3 mt-2">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Bank / Cash Name *</Label>
              <Input
                required
                placeholder="e.g. Nabil Bank Ltd / Head Office Petty Cash"
                className="h-8 text-xs bg-white/5 border-white/10 text-white font-mono"
                value={bankName}
                onChange={(e) => setBankName(e.target.value)}
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Account Number *</Label>
                <Input
                  required
                  placeholder="01201017500..."
                  className="h-8 text-xs font-mono bg-white/5 border-white/10 text-white"
                  value={accountNumber}
                  onChange={(e) => setAccountNumber(e.target.value)}
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Account Type</Label>
                <Select value={accountType} onValueChange={(v: any) => setAccountType(v)}>
                  <SelectTrigger className="h-8 text-xs bg-white/5 border-white/10 text-white font-mono">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-[#0c1015] border-white/10 text-white text-xs font-mono">
                    <SelectItem value="current">Current Account (चालु)</SelectItem>
                    <SelectItem value="saving">Saving Account (बचत)</SelectItem>
                    <SelectItem value="overdraft">Overdraft / OD</SelectItem>
                    <SelectItem value="petty_cash">Petty Cash (नगद)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Account Name / Title *</Label>
              <Input
                required
                placeholder="Company legal title"
                className="h-8 text-xs bg-white/5 border-white/10 text-white"
                value={accountName}
                onChange={(e) => setAccountName(e.target.value)}
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Label className="text-xs">Branch (Optional)</Label>
                <Input
                  placeholder="e.g. Hetauda / New Road"
                  className="h-8 text-xs bg-white/5 border-white/10 text-white font-mono"
                  value={branch}
                  onChange={(e) => setBranch(e.target.value)}
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">Opening Balance (NPR)</Label>
                <Input
                  type="number"
                  step="any"
                  className="h-8 text-xs font-mono bg-white/5 border-white/10 text-white"
                  value={openingBalance}
                  onChange={(e) => setOpeningBalance(e.target.value)}
                />
              </div>
            </div>

            <DialogFooter className="gap-2 pt-2 border-t border-white/10">
              <Button type="button" variant="outline" size="sm" onClick={() => setAddOpen(false)} className="h-8 text-xs font-mono">
                Cancel
              </Button>
              <Button type="submit" size="sm" disabled={createMutation.isPending} className="h-8 text-xs font-mono bg-emerald-600 hover:bg-emerald-700 text-white">
                {createMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Save Bank Account
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
