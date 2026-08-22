"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Percent, TrendingUp, Loader2 } from "lucide-react";
import { toast } from "sonner";

export function DistrictMultiplierDialog({
  open,
  onOpenChange,
  rateCatalogId,
  districts,
  activeDistrict,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rateCatalogId: string;
  districts: string[];
  activeDistrict?: string;
  onSuccess?: () => void;
}) {
  const utils = trpc.useUtils();
  const [selectedDistrict, setSelectedDistrict] = useState(activeDistrict || districts[0] || "Kathmandu");
  const [percentage, setPercentage] = useState("10"); // +10% default
  const [operation, setOperation] = useState<"increase" | "decrease">("increase");

  const applyMut = trpc.catalogV2.applyDistrictMultiplier.useMutation({
    onSuccess: (res) => {
      utils.catalogV2.getRateCatalog.invalidate({ id: rateCatalogId });
      toast.success(
        `Applied ${operation === "increase" ? "+" : "-"}${percentage}% to ${res.updatedCount} items in ${selectedDistrict}.`
      );
      onOpenChange(false);
      onSuccess?.();
    },
    onError: (e) => toast.error(e.message),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const pct = parseFloat(percentage);
    if (isNaN(pct) || pct <= 0) {
      toast.error("Please enter a valid positive percentage.");
      return;
    }

    const multiplier = operation === "increase" ? 1 + pct / 100 : 1 - pct / 100;

    applyMut.mutate({
      rateCatalogId,
      district: selectedDistrict,
      multiplier,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle className="text-base font-bold flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-amber-500" />
              Apply District Rate Escalation / Transport Multiplier
            </DialogTitle>
            <DialogDescription className="text-xs">
              Batch adjust all rates in a specific district by a percentage (e.g. Hill/Mountain transport
              premium or annual fiscal year inflation).
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* Target District */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Target District</Label>
              <select
                value={selectedDistrict}
                onChange={(e) => setSelectedDistrict(e.target.value)}
                className="w-full h-8 text-xs rounded-md border border-input bg-background px-2.5 py-1 focus:outline-none focus:ring-1 focus:ring-amber-500"
              >
                {districts.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </div>

            {/* Adjustment Type */}
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setOperation("increase")}
                className={`py-2 px-3 rounded-lg border text-xs font-medium transition-all ${
                  operation === "increase"
                    ? "bg-amber-500/10 border-amber-500 text-amber-700 dark:text-amber-300 font-semibold"
                    : "bg-muted/40 border-border/60 text-muted-foreground hover:bg-muted"
                }`}
              >
                + Escalation / Transport (+%)
              </button>
              <button
                type="button"
                onClick={() => setOperation("decrease")}
                className={`py-2 px-3 rounded-lg border text-xs font-medium transition-all ${
                  operation === "decrease"
                    ? "bg-blue-500/10 border-blue-500 text-blue-700 dark:text-blue-300 font-semibold"
                    : "bg-muted/40 border-border/60 text-muted-foreground hover:bg-muted"
                }`}
              >
                - Discount / Reduction (-%)
              </button>
            </div>

            {/* Percentage Input */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Percentage (%)</Label>
              <div className="relative">
                <Input
                  type="number"
                  min="0.1"
                  max="500"
                  step="0.1"
                  value={percentage}
                  onChange={(e) => setPercentage(e.target.value)}
                  placeholder="e.g. 10"
                  className="h-8 text-xs pr-8"
                  required
                />
                <Percent className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              </div>
            </div>

            {/* Quick Presets */}
            <div className="space-y-1">
              <span className="text-[10px] text-muted-foreground">Quick Presets:</span>
              <div className="flex flex-wrap gap-1.5">
                {["5", "8", "10", "12", "15", "20"].map((val) => (
                  <button
                    key={val}
                    type="button"
                    onClick={() => setPercentage(val)}
                    className="text-[11px] px-2 py-0.5 rounded border border-border/60 bg-muted/30 hover:bg-muted text-foreground"
                  >
                    {val}%
                  </button>
                ))}
              </div>
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0 pt-2 border-t">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
              disabled={applyMut.isPending}
              className="h-8 text-xs"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={applyMut.isPending}
              className="h-8 text-xs bg-amber-600 hover:bg-amber-700 text-white font-medium gap-1.5"
            >
              {applyMut.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <TrendingUp className="h-3.5 w-3.5" />
              )}
              Apply to {selectedDistrict}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
