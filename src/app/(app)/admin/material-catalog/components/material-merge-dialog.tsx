"use client";

import React, { useState } from "react";
import { trpc } from "@/lib/trpc-client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { MaterialNameInput, MaterialMatchItem } from "@/components/material-name-input";
import {
  GitMerge,
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ShieldAlert,
  Loader2,
  Undo2,
} from "lucide-react";
import { toast } from "sonner";

interface MaterialMergeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  level?: "global" | "org" | "project";
  organizationId?: string;
  initialWinnerId?: string;
  initialWinnerName?: string;
  initialLoserId?: string;
  initialLoserName?: string;
  onSuccess?: () => void;
}

export function MaterialMergeDialog({
  open,
  onOpenChange,
  level = "org",
  organizationId,
  initialWinnerId,
  initialWinnerName = "",
  initialLoserId,
  initialLoserName = "",
  onSuccess,
}: MaterialMergeDialogProps) {
  const utils = trpc.useUtils();
  const [winnerId, setWinnerId] = useState<string | null>(initialWinnerId || null);
  const [winnerName, setWinnerName] = useState<string>(initialWinnerName);
  const [loserId, setLoserId] = useState<string | null>(initialLoserId || null);
  const [loserName, setLoserName] = useState<string>(initialLoserName);
  const [notes, setNotes] = useState<string>("");

  const previewQuery = trpc.catalogV2.previewMerge.useQuery(
    {
      level,
      winnerId: winnerId || "",
      loserId: loserId || "",
    },
    {
      enabled: !!winnerId && !!loserId && winnerId !== loserId,
    }
  );

  const mergeMutation = trpc.catalogV2.executeMerge.useMutation({
    onSuccess: (data) => {
      toast.success(`Successfully merged materials! (${data.totalRowsRemapped} rows safely remapped across ${data.affectedTables.join(", ")})`);
      utils.catalogV2.listMaterials.invalidate();
      utils.material.invalidate();
      utils.uncatalogedMaterial.invalidate();
      onOpenChange(false);
      if (onSuccess) onSuccess();
    },
    onError: (err) => toast.error(err.message),
  });

  const preview = previewQuery.data;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <div className="flex items-center gap-2 text-primary">
            <GitMerge className="h-5 w-5" />
            <DialogTitle>Safely Merge Duplicate Materials</DialogTitle>
          </div>
          <DialogDescription className="text-xs">
            Merge two duplicate records into one canonical material. All transactions, BOQ ingredients, purchase orders, and stock will be atomically remapped without breaking calculations.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Step 1: Pick Winner & Loser */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Loser / Duplicate */}
            <div className="space-y-1.5 p-3 rounded-lg border border-red-200/60 dark:border-red-950/60 bg-red-500/5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-red-600 dark:text-red-400">
                  1. Duplicate Item (To Retire)
                </span>
                <Badge variant="outline" className="text-[10px] text-red-600 border-red-200">
                  Loser
                </Badge>
              </div>
              <MaterialNameInput
                value={loserName}
                onChange={(val) => {
                  setLoserName(val);
                  setLoserId(null);
                }}
                onSelectMatch={(match: MaterialMatchItem) => {
                  setLoserName(match.name);
                  setLoserId(match.id);
                }}
                scope={level === "global" ? "global" : "org"}
                organizationId={organizationId}
                placeholder="Search duplicate material..."
                className="text-xs h-8"
              />
              {loserId && (
                <div className="text-[10px] text-muted-foreground flex items-center gap-1 font-mono">
                  <CheckCircle2 className="h-2.5 w-2.5 text-emerald-500" /> ID: {loserId}
                </div>
              )}
            </div>

            {/* Winner / Canonical */}
            <div className="space-y-1.5 p-3 rounded-lg border border-emerald-200/60 dark:border-emerald-950/60 bg-emerald-500/5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400">
                  2. Canonical Item (To Keep)
                </span>
                <Badge variant="outline" className="text-[10px] text-emerald-600 border-emerald-200">
                  Winner
                </Badge>
              </div>
              <MaterialNameInput
                value={winnerName}
                onChange={(val) => {
                  setWinnerName(val);
                  setWinnerId(null);
                }}
                onSelectMatch={(match: MaterialMatchItem) => {
                  setWinnerName(match.name);
                  setWinnerId(match.id);
                }}
                scope={level === "global" ? "global" : "org"}
                organizationId={organizationId}
                placeholder="Search canonical material..."
                className="text-xs h-8"
              />
              {winnerId && (
                <div className="text-[10px] text-muted-foreground flex items-center gap-1 font-mono">
                  <CheckCircle2 className="h-2.5 w-2.5 text-emerald-500" /> ID: {winnerId}
                </div>
              )}
            </div>
          </div>

          {/* Validation Warning if IDs match */}
          {winnerId && loserId && winnerId === loserId && (
            <Card className="p-3 border-red-300 bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 text-xs flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0 text-red-500" />
              <span>Winner and Loser cannot be the same material! Please select two different materials.</span>
            </Card>
          )}

          {/* Step 2: Impact Preview Box */}
          {previewQuery.isLoading && (
            <div className="p-4 text-center text-xs text-muted-foreground flex items-center justify-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" /> Calculating atomic merge impact across database...
            </div>
          )}

          {preview && (
            <Card className="p-3.5 border-border bg-muted/20 space-y-3 animate-in fade-in-50">
              <div className="flex items-center justify-between border-b border-border/60 pb-2">
                <span className="text-xs font-bold text-foreground flex items-center gap-1.5">
                  <ShieldAlert className="h-3.5 w-3.5 text-amber-500" />
                  Merge Impact Assessment
                </span>
                <Badge variant="secondary" className="text-xs font-mono font-bold">
                  {preview.affectedCounts.totalRows} Total Rows Affected
                </Badge>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                {Object.entries(preview.affectedCounts).map(([key, count]) => {
                  if (key === "totalRows") return null;
                  return (
                    <div key={key} className="p-2 rounded-md bg-background border border-border/70 text-center">
                      <div className="text-sm font-bold text-foreground font-mono">{count as number}</div>
                      <div className="text-[10px] text-muted-foreground capitalize mt-0.5">
                        {key.replace(/([A-Z])/g, " $1")}
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="text-[11px] text-muted-foreground bg-background/60 p-2.5 rounded-md border border-border/60 space-y-1">
                <div>• Retiring material will remain soft-deactivated with <code className="text-foreground">mergedIntoId</code> pointer for full auditability.</div>
                <div>• Aliases will be merged so future fuzzy matching recognizes both names.</div>
                <div className="text-amber-600 dark:text-amber-400 font-medium flex items-center gap-1 pt-0.5">
                  <Undo2 className="h-3 w-3" /> Rollback window: Available for 24 hours after execution.
                </div>
              </div>
            </Card>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            size="sm"
            variant="default"
            className="gap-1.5 bg-amber-600 hover:bg-amber-700 text-white shadow-sm"
            disabled={!winnerId || !loserId || winnerId === loserId || mergeMutation.isPending || previewQuery.isLoading}
            onClick={() => {
              if (!winnerId || !loserId) return;
              mergeMutation.mutate({
                level,
                winnerId,
                loserId,
                notes: notes.trim() || undefined,
              });
            }}
          >
            {mergeMutation.isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <GitMerge className="h-3.5 w-3.5" />
            )}
            Execute Atomic Merge
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
