"use client";

import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc-client";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { GitMerge, ArrowRight, CheckCircle2, Loader2, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

export interface MergeableMaterial {
  id: string;
  name: string;
  subCategory?: string | null;
  category?: string | null;
  defaultUnit?: string | null;
}

export function MergeMaterialsDialog({
  open,
  onOpenChange,
  level = "org",
  materials,
  initialWinnerId,
  initialLoserId,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  level?: "global" | "org" | "project";
  materials: MergeableMaterial[];
  initialWinnerId?: string;
  initialLoserId?: string;
  onSuccess?: () => void;
}) {
  const utils = trpc.useUtils();

  const [winnerId, setWinnerId] = useState(initialWinnerId || materials[0]?.id || "");
  const [loserId, setLoserId] = useState(initialLoserId || materials[1]?.id || "");

  // Update if initials change
  useEffect(() => {
    if (initialWinnerId) setWinnerId(initialWinnerId);
    if (initialLoserId) setLoserId(initialLoserId);
  }, [initialWinnerId, initialLoserId]);

  const canPreview = !!winnerId && !!loserId && winnerId !== loserId;

  const { data: previewData, isLoading: isPreviewLoading } = trpc.catalogV2.previewMerge.useQuery(
    { level, winnerId, loserId },
    { enabled: open && canPreview }
  );

  const mergeMut = trpc.catalogV2.executeMerge.useMutation({
    onSuccess: (res) => {
      utils.catalogV2.listMaterials.invalidate();
      utils.catalogV2.getRateCatalog.invalidate();
      utils.uncatalogedMaterial.invalidate();
      toast.success(
        `Merged materials successfully! (${res.totalRowsRemapped} related records remapped).`
      );
      onOpenChange(false);
      onSuccess?.();
    },
    onError: (e) => toast.error(e.message),
  });

  const handleMerge = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canPreview) {
      toast.error("Please select two different materials to merge.");
      return;
    }

    if (
      confirm(
        `Are you sure you want to merge "${previewData?.loser.name}" into "${previewData?.winner.name}"? This action will reassign all historical references and cannot be undone.`
      )
    ) {
      mergeMut.mutate({
        level,
        winnerId,
        loserId,
      });
    }
  };

  const winner = materials.find((m) => m.id === winnerId);
  const loser = materials.find((m) => m.id === loserId);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <form onSubmit={handleMerge}>
          <DialogHeader>
            <DialogTitle className="text-base font-bold flex items-center gap-2">
              <GitMerge className="h-5 w-5 text-amber-500" />
              Merge & Deduplicate Materials
            </DialogTitle>
            <DialogDescription className="text-xs">
              Consolidate duplicate or redundant materials into a single canonical item. All project
              materials, BoQ rate analyses, and rate books referencing the duplicate will be atomically
              remapped.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Primary / Winner */}
              <div className="space-y-1.5 p-3 rounded-lg border border-success/30 bg-success/5">
                <Label className="text-xs font-semibold text-success dark:text-success/80 flex items-center gap-1">
                  <CheckCircle2 className="h-3.5 w-3.5" /> Keeper (Primary Material)
                </Label>
                <select
                  value={winnerId}
                  onChange={(e) => setWinnerId(e.target.value)}
                  className="w-full h-8 text-xs rounded-md border border-input bg-background px-2.5 py-1 focus:outline-none focus:ring-1 focus:ring-success"
                >
                  <option value="" disabled>Select keeper...</option>
                  {materials.map((m) => (
                    <option key={m.id} value={m.id} disabled={m.id === loserId}>
                      {m.name} {m.subCategory ? `(${m.subCategory})` : ""} [{m.category || "General"}]
                    </option>
                  ))}
                </select>
                {winner && (
                  <div className="text-[11px] text-muted-foreground pt-1">
                    Unit: <strong className="text-foreground">{winner.defaultUnit || "unit"}</strong> • {winner.category || "General"}
                  </div>
                )}
              </div>

              {/* Duplicate / Loser */}
              <div className="space-y-1.5 p-3 rounded-lg border border-red-500/30 bg-red-500/5">
                <Label className="text-xs font-semibold text-red-700 dark:text-red-300 flex items-center gap-1">
                  <AlertTriangle className="h-3.5 w-3.5" /> Duplicate to Merge & Archive
                </Label>
                <select
                  value={loserId}
                  onChange={(e) => setLoserId(e.target.value)}
                  className="w-full h-8 text-xs rounded-md border border-input bg-background px-2.5 py-1 focus:outline-none focus:ring-1 focus:ring-red-500"
                >
                  <option value="" disabled>Select duplicate...</option>
                  {materials.map((m) => (
                    <option key={m.id} value={m.id} disabled={m.id === winnerId}>
                      {m.name} {m.subCategory ? `(${m.subCategory})` : ""} [{m.category || "General"}]
                    </option>
                  ))}
                </select>
                {loser && (
                  <div className="text-[11px] text-muted-foreground pt-1">
                    Unit: <strong className="text-foreground">{loser.defaultUnit || "unit"}</strong> • {loser.category || "General"}
                  </div>
                )}
              </div>
            </div>

            {/* Impact Preview */}
            {canPreview && (
              <div className="rounded-lg border border-border/60 bg-muted/30 p-3 space-y-2 text-xs">
                <div className="font-semibold text-foreground flex items-center justify-between">
                  <span>Impact Preview:</span>
                  {isPreviewLoading && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
                </div>

                {previewData && (
                  <div className="grid grid-cols-2 gap-2 text-[11px] text-muted-foreground">
                    <div>
                      Project Material Records:{" "}
                      <strong className="text-foreground font-mono">
                        {previewData.affectedCounts.projectMaterials}
                      </strong>
                    </div>
                    <div>
                      BoQ Rate Analysis Formulas:{" "}
                      <strong className="text-foreground font-mono">
                        {previewData.affectedCounts.boqIngredients}
                      </strong>
                    </div>
                    <div>
                      Rate Book Entries:{" "}
                      <strong className="text-foreground font-mono">
                        {previewData.affectedCounts.rateEntries}
                      </strong>
                    </div>
                    <div>
                      Total References Remapped:{" "}
                      <Badge variant="outline" className="text-[10px] bg-amber-500/10 text-amber-600 font-mono">
                        {previewData.affectedCounts.totalRows}
                      </Badge>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          <DialogFooter className="gap-2 sm:gap-0 pt-2 border-t">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
              disabled={mergeMut.isPending}
              className="h-8 text-xs"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={mergeMut.isPending || !canPreview}
              className="h-8 text-xs bg-amber-600 hover:bg-amber-700 text-white font-medium gap-1.5"
            >
              {mergeMut.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <GitMerge className="h-3.5 w-3.5" />
              )}
              Confirm & Merge
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
