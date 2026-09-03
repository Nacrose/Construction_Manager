"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc-client";
import { DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, AlertTriangle, X } from "lucide-react";
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

export function AddStaffDialog({ projectId, onDone }: { projectId: string; onDone: () => void }) {
  const utils = trpc.useUtils();
  const [name, setName] = useState("");
  const [designation, setDesignation] = useState("");
  const [category, setCategory] = useState("skilled");
  const [phone, setPhone] = useState("");
  const [dailyWage, setDailyWage] = useState("");
  const [duplicateSuggestions, setDuplicateSuggestions] = useState<DuplicateSuggestion[]>([]);

  const mutation = trpc.hr.create.useMutation({
    onSuccess: (res) => {
      const suggestions = res.duplicateSuggestions || [];
      if (suggestions.length > 0) {
        // Fail-safe default: the person was created, but surface identity
        // matches so the user can attach the EXISTING person instead (ADR-0005).
        setDuplicateSuggestions(suggestions);
        toast.warning("Staff added — possible duplicates found in your organization");
        utils.hr.list.invalidate({ projectId });
        return;
      }
      utils.hr.list.invalidate({ projectId });
      toast.success("Staff added");
      onDone();
    },
    onError: (e) => toast.error(e.message),
  });

  const attachMut = trpc.hr.attach.useMutation({
    onSuccess: (res) => {
      toast.success(`${res.assignment.name} attached to this project as an existing person`);
      onDone();
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
      category: (category as "skilled" | "unskilled" | "supervisor" | "staff" | "operator") || "skilled",
      employmentType: "daily" as const,
      dailyWage: parseFloat(dailyWage) || 0,
      monthlySalary: 0,
    };
    attachMut.mutate(attachInput);
  };

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setDuplicateSuggestions([]);
    mutation.mutate({
      projectId,
      name,
      designation: designation || undefined,
      category: (category as any) || "skilled",
      phone: phone || undefined,
      dailyWage: parseFloat(dailyWage) || 0,
    });
  };

  return (
    <DialogContent className="max-w-md">
      <DialogHeader><DialogTitle>Add staff member</DialogTitle></DialogHeader>
      {duplicateSuggestions.length > 0 && (
        <div className="rounded-md border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 p-3 space-y-2">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
              <p className="text-xs font-semibold text-amber-800 dark:text-amber-300">
                Possible duplicates found — this person may already exist. The new record was still created.
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
      <form onSubmit={onSubmit} className="space-y-3">
        <div className="space-y-1.5"><Label>Name *</Label><Input value={name} onChange={(e) => setName(e.target.value)} required /></div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5"><Label>Designation</Label><Input value={designation} onChange={(e) => setDesignation(e.target.value)} placeholder="Mason" /></div>
          <div className="space-y-1.5"><Label>Category</Label><Input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="skilled" /></div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5"><Label>Phone</Label><Input value={phone} onChange={(e) => setPhone(e.target.value)} /></div>
          <div className="space-y-1.5"><Label>Daily wage (NPR)</Label><Input value={dailyWage} onChange={(e) => setDailyWage(e.target.value)} type="number" /></div>
        </div>
        <DialogFooter>
          <Button type="submit" disabled={mutation.isPending || attachMut.isPending}>
            {(mutation.isPending || attachMut.isPending) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Add
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
