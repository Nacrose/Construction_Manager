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
import { ConstructionTable, ConstructionTableColumn } from "@/components/ui/construction-table";

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

  const tallyMutation = trpc.catalogV2.tallyImportRows.useMutation({
    onSuccess: (data) => {
      setTalliedRows(data.tallies);
      setStep("tally");
    },
    onError: (err) => toast.error(err.message),
  });

  const commitMutation = trpc.catalogV2.commitImport.useMutation({
    onSuccess: (data) => {
      toast.success(
        `Import complete! (${data.createdCount} created, ${data.linkedCount} linked to canonical items, ${data.aliasCount} aliases added)`
      );
      utils.catalogV2.listMaterials.invalidate();
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
      scope,
      organizationId,
      rows,
    });
  };

  const handleActionChange = (
    index: number,
    action: "create_new" | "link_existing" | "add_alias",
    canonicalId?: string
  ) => {
    setTalliedRows((prev) =>
      prev.map((item) =>
        item.index === index
          ? {
              ...item,
              recommendedAction: action,
              selectedCanonicalId:
                action !== "create_new" ? canonicalId || item.topMatch?.id : undefined,
            }
          : item
      )
    );
  };

  const handleCommit = () => {
    const items = talliedRows.map((t) => ({
      rawName: t.row.rawName,
      category: t.row.category,
      subCategory: t.row.subCategory,
      unit: t.row.unit,
      defaultRate: t.row.defaultRate,
      action: t.recommendedAction || "create_new",
      targetId: t.selectedCanonicalId || (t.recommendedAction !== "create_new" ? t.topMatch?.id : undefined),
    }));

    commitMutation.mutate({
      scope,
      organizationId,
      items,
    });
  };


  const exactCount = talliedRows.filter((t) => t.status === "exact").length;
  const similarCount = talliedRows.filter((t) => t.status === "similar").length;
  const uniqueCount = talliedRows.filter((t) => t.status === "unique").length;

  const tallyColumns: ConstructionTableColumn<any>[] = [
    {
      key: "index",
      header: "#",
      width: "48px",
      align: "center",
      render: (_, __, idx) => <span className="font-mono text-xs text-muted-foreground">{idx + 1}</span>,
    },
    {
      key: "rawName",
      header: "Imported Name",
      render: (_, t) => (
        <div>
          <div className="font-semibold text-foreground text-xs">{t.row.rawName}</div>
          <div className="text-[10px] text-muted-foreground font-mono">
            {t.row.category || "General"} &bull; {t.row.unit || "unit"}
          </div>
        </div>
      ),
    },
    {
      key: "matchStatus",
      header: "Match Status & Suggestion",
      render: (_, t) => {
        const isExact = t.status === "exact";
        const isSimilar = t.status === "similar";
        const topMatch = t.topMatch;

        return (
          <div>
            {isExact && topMatch && (
              <Badge variant="outline" className="bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 border-emerald-200 gap-1 text-[10px] font-mono">
                <CheckCircle2 className="h-2.5 w-2.5" /> Exact: {topMatch.name}
              </Badge>
            )}
            {isSimilar && topMatch && (
              <Badge variant="outline" className="bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300 border-amber-200 gap-1 text-[10px] font-mono">
                <AlertTriangle className="h-2.5 w-2.5" /> {Math.round(topMatch.score * 100)}% match: {topMatch.name}
              </Badge>
            )}
            {!isExact && !isSimilar && (
              <Badge variant="outline" className="bg-info/10 text-info dark:bg-[var(--navy-deep)]/40 dark:text-info/80 border-info/30 text-[10px] font-mono">
                New Unique
              </Badge>
            )}
          </div>
        );
      },
    },
    {
      key: "resolution",
      header: "Resolution Action",
      align: "right",
      render: (_, t) => {
        const topMatch = t.topMatch;

        return (
          <div className="flex items-center justify-end gap-1">
            {topMatch && (
              <button
                type="button"
                onClick={() => handleActionChange(t.index, "link_existing", topMatch.id)}
                className={cn(
                  "px-2 py-0.5 text-[10px] rounded border transition-all font-mono",
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
                  "px-2 py-0.5 text-[10px] rounded border transition-all font-mono",
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
                "px-2 py-0.5 text-[10px] rounded border transition-all font-mono",
                t.recommendedAction === "create_new"
                  ? "bg-primary text-primary-foreground font-bold border-primary shadow-xs"
                  : "bg-background text-muted-foreground hover:text-foreground border-border"
              )}
            >
              Create New
            </button>
          </div>
        );
      },
    },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl max-h-[85vh] overflow-y-auto backdrop-blur-md bg-black/85 border-white/10 text-white">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base font-bold">
            <FileSpreadsheet className="h-5 w-5 text-amber-500" />
            Bulk Import Materials &amp; Fuzzy Reconciliation
          </DialogTitle>
          <DialogDescription className="text-white/60 text-xs">
            Paste tabular material data from Excel. Our AI engine tallies duplicates, matches aliases, and protects against catalog fragmentation.
          </DialogDescription>
        </DialogHeader>

        {step === "input" ? (
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-white/80">
                Paste Columns (Name, Category, SubCategory, Unit, DefaultRate):
              </label>
              <Textarea
                rows={10}
                value={rawText}
                onChange={(e) => setRawText(e.target.value)}
                placeholder={`OPC 53 Cement\tStructural\tCement\tbag\t850\nFe500 Rebar 12mm\tStructural\tSteel\tkg\t95\nSand (River Bed)\tAggregates\tCoarse\tcft\t45`}
                className="font-mono text-xs bg-white/5 border-white/20 text-white placeholder:text-white/30 resize-none"
              />
              <p className="text-[11px] text-white/50">
                Tip: Copy columns directly from Excel or Google Sheets and paste here. Tab, comma, and pipe delimiters are auto-detected.
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-4 py-2">
            {/* Tally Metrics Summary */}
            <div className="grid grid-cols-3 gap-2">
              <Card className="p-2.5 bg-emerald-500/10 border-emerald-500/30 text-center">
                <div className="text-sm font-bold text-emerald-700 dark:text-emerald-300 font-mono">
                  {exactCount} Exact Matches
                </div>
                <div className="text-[10px] text-muted-foreground font-mono">Will link directly to existing</div>
              </Card>
              <Card className="p-2.5 bg-amber-500/10 border-amber-500/30 text-center">
                <div className="text-sm font-bold text-amber-700 dark:text-amber-300 font-mono">
                  {similarCount} Fuzzy Matches
                </div>
                <div className="text-[10px] text-muted-foreground font-mono">Candidate duplicates detected</div>
              </Card>
              <Card className="p-2.5 bg-info/10 border-info/40 text-center">
                <div className="text-sm font-bold text-info dark:text-info/80 font-mono">
                  {uniqueCount} Unique Items
                </div>
                <div className="text-[10px] text-muted-foreground font-mono">Safe to create new records</div>
              </Card>
            </div>

            {/* Row-by-Row Tally Table using ConstructionTable */}
            <ConstructionTable
              data={talliedRows}
              columns={tallyColumns}
              isLoading={false}
              searchPlaceholder="Filter imported items..."
              searchFilterKeys={["row.rawName", "status"]}
            />
          </div>
        )}

        <DialogFooter className="gap-2 pt-2 border-t border-white/10">
          {step === "input" ? (
            <>
              <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} className="font-mono text-xs">
                Cancel
              </Button>
              <Button
                size="sm"
                variant="default"
                disabled={tallyMutation.isPending || !rawText.trim()}
                onClick={handleParseAndTally}
                className="gap-1.5 bg-amber-600 hover:bg-amber-700 text-white shadow-sm font-mono text-xs"
              >
                {tallyMutation.isPending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Sparkles className="h-3.5 w-3.5" />
                )}
                Tally &amp; Analyze Duplicates
              </Button>
            </>
          ) : (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setStep("input")}
                disabled={commitMutation.isPending}
                className="font-mono text-xs"
              >
                Back to Edit
              </Button>
              <Button
                size="sm"
                onClick={handleCommit}
                disabled={commitMutation.isPending || talliedRows.length === 0}
                className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-mono text-xs shadow-sm"
              >
                {commitMutation.isPending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <CheckCircle2 className="h-3.5 w-3.5" />
                )}
                Commit Import ({talliedRows.length} items)
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
