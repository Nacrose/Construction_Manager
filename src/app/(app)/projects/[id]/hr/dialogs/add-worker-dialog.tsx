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
import { UserPlus, Loader2, Building, Banknote, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

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

  useEffect(() => {
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
    onSuccess: () => {
      toast.success("Worker added to roster");
      onSuccess();
      onOpenChange(false);
    },
    onError: (e) => toast.error(e.message),
  });

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

  const isPending = createMut.isPending || updateMut.isPending;

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
