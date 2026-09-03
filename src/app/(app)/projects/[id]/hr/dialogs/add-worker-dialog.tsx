"use client";

import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc-client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { UserPlus, Loader2, Building, Banknote, ShieldCheck, AlertTriangle, X } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

type DuplicateSuggestion = {
  id: string;
  displayName: string;
  phone: string | null;
  pan: string | null;
  idNumber: string | null;
  status: string;
};

export function AddWorkerDialog({
  projectId,
  open,
  onOpenChange,
  onSuccess,
  existingWorker,
  gangs = [],
}: {
  projectId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  existingWorker?: any;
  gangs?: string[];
}) {
  const [name, setName] = useState("");
  const [designation, setDesignation] = useState("");
  const [category, setCategory] = useState<"skilled" | "unskilled" | "supervisor" | "staff" | "operator">("skilled");
  const [employmentType, setEmploymentType] = useState<"daily" | "monthly" | "piece_rate">("daily");
  const [dailyWage, setDailyWage] = useState<number>(850);
  const [monthlySalary, setMonthlySalary] = useState<number>(0);
  const [gangName, setGangName] = useState("");
  const [phone, setPhone] = useState("");
  const [bankAccountNo, setBankAccountNo] = useState("");
  const [bankName, setBankName] = useState("");
  const [pan, setPan] = useState("");
  const [idNumber, setIdNumber] = useState("");
  // Existing org persons matching the created worker's identity fields
  // (returned fail-safe by hr.create — the person IS created regardless).
  const [duplicateSuggestions, setDuplicateSuggestions] = useState<DuplicateSuggestion[]>([]);

  useEffect(() => {
    setDuplicateSuggestions([]);
    if (existingWorker) {
      setName(existingWorker.name || "");
      setDesignation(existingWorker.designation || "");
      setCategory(existingWorker.category || "skilled");
      setEmploymentType(existingWorker.employmentType || "daily");
      setDailyWage(existingWorker.dailyWage || 0);
      setMonthlySalary(existingWorker.monthlySalary || 0);
      setGangName(existingWorker.gangName || "");
      setPhone(existingWorker.phone || "");
      setBankAccountNo(existingWorker.bankAccountNo || "");
      setBankName(existingWorker.bankName || "");
      setPan(existingWorker.pan || "");
      setIdNumber(existingWorker.idNumber || "");
    } else {
      setName("");
      setDesignation("");
      setCategory("skilled");
      setEmploymentType("daily");
      setDailyWage(850);
      setMonthlySalary(0);
      setGangName("");
      setPhone("");
      setBankAccountNo("");
      setBankName("");
      setPan("");
      setIdNumber("");
    }
  }, [existingWorker, open]);

  const createMut = trpc.hr.create.useMutation({
    onSuccess: (res) => {
      const suggestions = res.duplicateSuggestions || [];
      if (suggestions.length > 0) {
        // Fail-safe default: the create went through, but surface the
        // identity matches so the user can attach the EXISTING person
        // (one human, one person row — ADR-0005) instead of accumulating
        // duplicates.
        setDuplicateSuggestions(suggestions);
        toast.warning("Worker created — possible duplicates found in your organization");
        onSuccess();
        return;
      }
      toast.success("Worker added to roster");
      onSuccess();
      onOpenChange(false);
    },
    onError: (e) => toast.error(e.message),
  });

  const attachMut = trpc.hr.attach.useMutation({
    onSuccess: (res) => {
      toast.success(`${res.assignment.name} attached to this project as an existing person`);
      onSuccess();
      onOpenChange(false);
    },
    onError: (e) => toast.error(e.message),
  });

  const handleAttachExisting = (suggestion: DuplicateSuggestion) => {
    // Same terms the user entered, against the EXISTING person record.
    const attachInput = {
      projectId,
      personId: suggestion.id,
      fromDate: format(new Date(), "yyyy-MM-dd"),
      designation: designation || null,
      category,
      employmentType,
      dailyWage: Number(dailyWage) || 0,
      monthlySalary: Number(monthlySalary) || 0,
      gangName: gangName || null,
    };
    attachMut.mutate(attachInput);
  };

  const updateMut = trpc.hr.update.useMutation({
    onSuccess: () => {
      toast.success("Worker profile updated");
      onSuccess();
      onOpenChange(false);
    },
    onError: (e) => toast.error(e.message),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error("Please enter worker name");
      return;
    }

    if (existingWorker) {
      updateMut.mutate({
        itemId: existingWorker.id,
        name,
        designation: designation || null,
        category,
        employmentType,
        dailyWage: Number(dailyWage) || 0,
        monthlySalary: Number(monthlySalary) || 0,
        gangName: gangName || null,
        phone: phone || null,
        bankAccountNo: bankAccountNo || null,
        bankName: bankName || null,
        pan: pan || null,
        idNumber: idNumber || null,
      });
    } else {
      createMut.mutate({
        projectId,
        name,
        designation: designation || null,
        category,
        employmentType,
        dailyWage: Number(dailyWage) || 0,
        monthlySalary: Number(monthlySalary) || 0,
        gangName: gangName || null,
        phone: phone || null,
        bankAccountNo: bankAccountNo || null,
        bankName: bankName || null,
        pan: pan || null,
        idNumber: idNumber || null,
      });
    }
  };

  const isPending = createMut.isPending || updateMut.isPending || attachMut.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <UserPlus className="h-5 w-5 text-primary" />
            {existingWorker ? "Edit Worker Profile" : "Add Staff / Site Labor"}
          </DialogTitle>
          <DialogDescription className="text-xs">
            Register personnel for daily muster roll attendance, chainage role assignments, and monthly payroll.
          </DialogDescription>
        </DialogHeader>

        {!existingWorker && duplicateSuggestions.length > 0 && (
          <div className="rounded-md border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 p-3 space-y-2">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
                <p className="text-xs font-semibold text-amber-800 dark:text-amber-300">
                  Possible duplicates found — this person may already exist in your organization.
                  The new record was still created.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setDuplicateSuggestions([])}
                className="text-amber-600 dark:text-amber-400 hover:text-foreground"
                title="Dismiss"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
            {duplicateSuggestions.map((dup) => (
              <div
                key={dup.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded border border-amber-200 dark:border-amber-800 bg-background/60 px-2 py-1.5"
              >
                <div>
                  <span className="text-xs font-medium text-foreground">{dup.displayName}</span>
                  <span className="block text-[10px] font-mono text-muted-foreground">
                    {[dup.phone, dup.pan, dup.idNumber].filter(Boolean).join(" · ") || "No identity details"}
                    {" — "}
                    {dup.status}
                  </span>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-6 text-[10px] border-amber-400 text-amber-700 hover:bg-amber-100 dark:text-amber-300 dark:hover:bg-amber-900"
                  disabled={attachMut.isPending}
                  onClick={() => handleAttachExisting(dup)}
                >
                  {attachMut.isPending && <Loader2 className="h-3 w-3 animate-spin mr-1" />}
                  Add assignment for existing person instead
                </Button>
              </div>
            ))}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4 py-2">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Full Name *</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Ramesh Thapa"
                className="h-8 text-xs"
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Designation / Trade</Label>
              <Input
                value={designation}
                onChange={(e) => setDesignation(e.target.value)}
                placeholder="e.g. Head Mason, Bar Bender, Site Eng."
                className="h-8 text-xs"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Skill Category</Label>
              <Select value={category} onValueChange={(val: any) => setCategory(val)}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="skilled">Skilled Labor</SelectItem>
                  <SelectItem value="unskilled">Unskilled Helper</SelectItem>
                  <SelectItem value="operator">Plant / Heavy Operator</SelectItem>
                  <SelectItem value="supervisor">Foreman / Supervisor</SelectItem>
                  <SelectItem value="staff">Salaried Technical Staff</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Employment Track</Label>
              <Select value={employmentType} onValueChange={(val: any) => setEmploymentType(val)}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="daily">Daily Wage (Per Day Rate)</SelectItem>
                  <SelectItem value="monthly">Monthly Salaried</SelectItem>
                  <SelectItem value="piece_rate">Piece Rate / Task Based</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {employmentType === "monthly" ? (
              <div className="space-y-1.5">
                <Label className="text-xs">Monthly Salary (NPR) *</Label>
                <Input
                  type="number"
                  min="0"
                  step="100"
                  value={monthlySalary}
                  onChange={(e) => setMonthlySalary(parseFloat(e.target.value) || 0)}
                  placeholder="e.g. 45000"
                  className="h-8 text-xs font-mono font-bold"
                  required
                />
              </div>
            ) : (
              <div className="space-y-1.5">
                <Label className="text-xs">Daily Wage Rate (NPR / 8hr Day) *</Label>
                <Input
                  type="number"
                  min="0"
                  step="10"
                  value={dailyWage}
                  onChange={(e) => setDailyWage(parseFloat(e.target.value) || 0)}
                  placeholder="e.g. 950"
                  className="h-8 text-xs font-mono font-bold"
                  required
                />
              </div>
            )}

            <div className="space-y-1.5">
              <Label className="text-xs">Gang / Toli / Team Name</Label>
              <Input
                value={gangName}
                onChange={(e) => setGangName(e.target.value)}
                placeholder="e.g. Mason Gang A, RCC Toli"
                className="h-8 text-xs"
                list="gang-suggestions"
              />
              <datalist id="gang-suggestions">
                {gangs.map((g) => (
                  <option key={g} value={g} />
                ))}
              </datalist>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Phone Number</Label>
              <Input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="98XXXXXXXX"
                className="h-8 text-xs"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Citizenship / ID No.</Label>
              <Input
                value={idNumber}
                onChange={(e) => setIdNumber(e.target.value)}
                placeholder="National ID / Citizenship #"
                className="h-8 text-xs"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Bank Account Number</Label>
              <Input
                value={bankAccountNo}
                onChange={(e) => setBankAccountNo(e.target.value)}
                placeholder="Account #"
                className="h-8 text-xs font-mono"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Bank Name &amp; Branch</Label>
              <Input
                value={bankName}
                onChange={(e) => setBankName(e.target.value)}
                placeholder="e.g. Nabil Bank, Butwal"
                className="h-8 text-xs"
              />
            </div>

            <div className="space-y-1.5 sm:col-span-2">
              <Label className="text-xs">PAN / Tax ID</Label>
              <Input
                value={pan}
                onChange={(e) => setPan(e.target.value)}
                placeholder="9-digit PAN"
                className="h-8 text-xs font-mono"
              />
            </div>
          </div>

          <DialogFooter className="border-t pt-3">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={isPending} className="font-semibold">
              {isPending && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />}
              {existingWorker ? "Save Changes" : "Add to Roster"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
