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
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import {
  UploadCloud,
  FileSpreadsheet,
  CheckCircle2,
  AlertTriangle,
  PlusCircle,
  Link,
  Tag,
  Loader2,
  Sparkles,
  ArrowRight,
  RefreshCw,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface ExcelMaterialImporterProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  scope?: "global" | "org";
  organizationId?: string;
  onSuccess?: () => void;
}

export function ExcelMaterialImporter({
  open,
  onOpenChange,
  scope = "org",
  organizationId,
  onSuccess,
}: ExcelMaterialImporterProps) {
  const utils = trpc.useUtils();
  const [rawText, setRawText] = useState("");
  const [step, setStep] = useState<"input" | "tally">("input");
  const [talliedRows, setTalliedRows] = useState<any[]>([]);

  const tallyMutation = trpc.materialImport.tallyImportRows.useMutation({
    onSuccess: (data) => {
      setTalliedRows(data.tallies);
      setStep("tally");
    },
    onError: (err) => toast.error(err.message),
  });

  const commitMutation = trpc.materialImport.commitImport.useMutation({
    onSuccess: (data) => {
      toast.success(
        `Import complete! (${data.createdCount} created, ${data.linkedCount} linked to canonical items, ${data.aliasCount} aliases added)`
      );
      utils.materialCatalog.list.invalidate();
      utils.orgMaterialEntry.invalidate();
      utils.globalMaterialCatalog.invalidate();
      onOpenChange(false);
      setStep("input");
      setRawText("");
      if (onSuccess) onSuccess();
    },
    onError: (err) => toast.error(err.message),
  });

  const handleParseAndTally = () => {
    const lines = rawText
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);

    if (lines.length === 0) {
      toast.error("Please paste material records to import.");
      return;
    }

    const rows = lines.map((line) => {
      // Support comma-separated, tab-separated, or pipe-separated
      const parts = line.split(/[,\t|]/).map((p) => p.trim());
      return {
        rawName: parts[0] || "",
        category: parts[1] || null,
        subCategory: parts[2] || null,
        unit: parts[3] || "unit",
        defaultRate: parseFloat(parts[4]) || 0,
      };
    }).filter((r) => r.rawName.length > 0);

    if (rows.length === 0) {
      toast.error("Could not parse valid material names.");
      return;
    }

    tallyMutation.mutate({
      rows,
      scope,
      organizationId,
    });
  };

  const handleActionChange = (index: number, action: "link_existing" | "add_alias" | "create_new", targetId?: string) => {
    setTalliedRows((prev) =>
      prev.map((r) => (r.index === index ? { ...r, recommendedAction: action, customTargetId: targetId } : r))
    );
  };

  const exactCount = talliedRows.filter((t) => t.status === "exact").length;
  const similarCount = talliedRows.filter((t) => t.status === "similar").length;
  const uniqueCount = talliedRows.filter((t) => t.status === "unique").length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <div className="flex items-center gap-2 text-primary">
            <FileSpreadsheet className="h-5 w-5" />
            <DialogTitle>Import & Deduplicate Materials Spreadsheet</DialogTitle>
          </div>
          <DialogDescription className="text-xs">
            Paste or import materials. The system tallies each row against the master catalog using fuzzy trigrams to catch duplicates, misspellings, and spec variants before insertion.
          </DialogDescription>
        </DialogHeader>

        {step === "input" ? (
          <div className="space-y-3 py-2 flex-1 overflow-y-auto">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground flex items-center justify-between">
                <span>Paste Table Data (CSV, TSV, or Name list)</span>
                <span className="text-[11px] text-muted-foreground">Format: Name, Category, Spec, Unit, Rate</span>
              </label>
              <Textarea
                value={rawText}
                onChange={(e) => setRawText(e.target.value)}
                placeholder={`Cement OPC 53 Grade, Civil & Concrete, 53 Grade, bag, 750\nRebar Fe500D 12mm, Steel & Rebar, 12mm, kg, 105\nBitumen VG-30, Roads & Highways, VG-30, drum, 18500\nCoarse Aggregate 20mm, Civil & Concrete, 20mm, cum, 2400`}
                className="font-mono text-xs h-64 resize-none leading-relaxed"
              />
            </div>

            <div className="p-3 rounded-lg bg-muted/40 border border-border text-xs text-muted-foreground space-y-1">
              <div className="font-semibold text-foreground flex items-center gap-1.5">
                <Sparkles className="h-3.5 w-3.5 text-amber-500" />
                Intelligent Deduplication Guarantee:
              </div>
              <div>• Matches token-reversals (e.g. "Aggregate 20mm" vs "20mm Aggregate").</div>
              <div>• Surfaces existing catalog materials so you can link them directly without creating redundant records.</div>
            </div>
          </div>
        ) : (
          <div className="space-y-3 py-2 flex-1 overflow-y-auto">
            {/* Tally Summary Bar */}
            <div className="grid grid-cols-3 gap-2">
              <Card className="p-2.5 bg-emerald-500/10 border-emerald-500/30 text-center">
                <div className="text-sm font-bold text-emerald-700 dark:text-emerald-300 font-mono">
                  {exactCount} Exact Matches
                </div>
                <div className="text-[10px] text-muted-foreground">Will link to existing catalog item</div>
              </Card>
              <Card className="p-2.5 bg-amber-500/10 border-amber-500/30 text-center">
                <div className="text-sm font-bold text-amber-700 dark:text-amber-300 font-mono">
                  {similarCount} Similar / Typos
                </div>
                <div className="text-[10px] text-muted-foreground">Candidate duplicates detected</div>
              </Card>
              <Card className="p-2.5 bg-blue-500/10 border-blue-500/30 text-center">
                <div className="text-sm font-bold text-blue-700 dark:text-blue-300 font-mono">
                  {uniqueCount} Unique Items
                </div>
                <div className="text-[10px] text-muted-foreground">Safe to create new records</div>
              </Card>
            </div>

            {/* Row-by-Row Tally Table */}
            <div className="border border-border rounded-lg overflow-hidden max-h-[45vh] overflow-y-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-muted/80 sticky top-0 text-[11px] font-semibold border-b border-border">
                  <tr>
                    <th className="p-2 w-8 text-center">#</th>
                    <th className="p-2">Imported Name</th>
                    <th className="p-2">Match Status & Suggestion</th>
                    <th className="p-2 text-right">Resolution Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60 font-medium">
                  {talliedRows.map((t, idx) => {
                    const isExact = t.status === "exact";
                    const isSimilar = t.status === "similar";
                    const topMatch = t.topMatch;

                    return (
                      <tr key={t.index} className="hover:bg-muted/30 transition-colors">
                        <td className="p-2 text-center text-muted-foreground font-mono">{idx + 1}</td>
                        <td className="p-2">
                          <div className="font-semibold text-foreground">{t.row.rawName}</div>
                          <div className="text-[10px] text-muted-foreground">
                            {t.row.category || "General"} • {t.row.unit || "unit"}
                          </div>
                        </td>
                        <td className="p-2">
                          {isExact && topMatch && (
                            <Badge variant="outline" className="bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 border-emerald-200 gap-1 text-[10px]">
                              <CheckCircle2 className="h-2.5 w-2.5" /> Exact: {topMatch.name}
                            </Badge>
                          )}
                          {isSimilar && topMatch && (
                            <div className="space-y-0.5">
                              <Badge variant="outline" className="bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300 border-amber-200 gap-1 text-[10px]">
                                <AlertTriangle className="h-2.5 w-2.5" /> {Math.round(topMatch.score * 100)}% match: {topMatch.name}
                              </Badge>
                            </div>
                          )}
                          {!isExact && !isSimilar && (
                            <Badge variant="outline" className="bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300 border-blue-200 text-[10px]">
                              New Unique
                            </Badge>
                          )}
                        </td>
                        <td className="p-2 text-right">
                          <div className="flex items-center justify-end gap-1">
                            {topMatch && (
                              <button
                                type="button"
                                onClick={() => handleActionChange(t.index, "link_existing", topMatch.id)}
                                className={cn(
                                  "px-2 py-0.5 text-[10px] rounded border transition-all",
                                  t.recommendedAction === "link_existing"
                                    ? "bg-emerald-600 text-white font-bold border-emerald-600 shadow-xs"
                                    : "bg-background text-muted-foreground hover:text-foreground border-border"
                                )}
                              >
                                Link Existing
                              </button>
                            )}
                            {topMatch && scope === "global" && (
                              <button
                                type="button"
                                onClick={() => handleActionChange(t.index, "add_alias", topMatch.id)}
                                className={cn(
                                  "px-2 py-0.5 text-[10px] rounded border transition-all",
                                  t.recommendedAction === "add_alias"
                                    ? "bg-amber-600 text-white font-bold border-amber-600 shadow-xs"
                                    : "bg-background text-muted-foreground hover:text-foreground border-border"
                                )}
                              >
                                Add Alias
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => handleActionChange(t.index, "create_new")}
                              className={cn(
                                "px-2 py-0.5 text-[10px] rounded border transition-all",
                                t.recommendedAction === "create_new"
                                  ? "bg-primary text-primary-foreground font-bold border-primary shadow-xs"
                                  : "bg-background text-muted-foreground hover:text-foreground border-border"
                              )}
                            >
                              Create New
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <DialogFooter className="gap-2 pt-2 border-t border-border">
          {step === "input" ? (
            <>
              <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button
                size="sm"
                variant="default"
                disabled={tallyMutation.isPending || !rawText.trim()}
                onClick={handleParseAndTally}
                className="gap-1.5 bg-amber-600 hover:bg-amber-700 text-white shadow-sm"
              >
                {tallyMutation.isPending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Sparkles className="h-3.5 w-3.5" />
                )}
                Tally & Analyze Duplicates
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" size="sm" onClick={() => setStep("input")}>
                Back to Input
              </Button>
              <Button
                size="sm"
                variant="default"
                disabled={commitMutation.isPending}
                onClick={() => {
                  const itemsToCommit = talliedRows.map((t) => ({
                    rawName: t.row.rawName,
                    category: t.row.category,
                    subCategory: t.row.subCategory,
                    unit: t.row.unit,
                    defaultRate: t.row.defaultRate,
                    action: t.recommendedAction,
                    targetId: t.customTargetId || t.topMatch?.id || null,
                  }));

                  commitMutation.mutate({
                    scope,
                    organizationId,
                    items: itemsToCommit,
                  });
                }}
                className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm"
              >
                {commitMutation.isPending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <CheckCircle2 className="h-3.5 w-3.5" />
                )}
                Commit {talliedRows.length} Items
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
