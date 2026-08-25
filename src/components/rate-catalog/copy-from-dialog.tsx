// @ts-nocheck
"use client";

import { useState, useEffect, useMemo } from "react";
import { trpc } from "@/lib/trpc-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Search, Loader2, Copy, ChevronDown } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type CatalogItem = {
  id: string;
  code: number;
  materialId: string;
  materialName: string;
  unit: string;
  rates: { district: string; rate: number }[];
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Columns to paste into (destination district columns) */
  destinationColumns: string[];
  onCopy: (data: {
    items: { materialId: string; rates: Record<string, number> }[];
    sourceName: string;
  }) => Promise<void>;
  /** Which catalogs to show (orgId optional) */
  organizationId?: string;
};

export function CopyFromDialog({
  open,
  onOpenChange,
  destinationColumns,
  onCopy,
  organizationId,
}: Props) {
  const [sourceCatalogId, setSourceCatalogId] = useState<string>("");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [destCols, setDestCols] = useState<string[]>(destinationColumns);
  const [copying, setCopying] = useState(false);

  const { data: catalogs } = trpc.catalogV2.listRateCatalogs.useQuery(
    { organizationId },
    { enabled: open },
  );

  const { data: catalogData } = trpc.catalogV2.getRateCatalog.useQuery(
    { id: sourceCatalogId },
    { enabled: !!sourceCatalogId },
  );

  const items = useMemo(() => {
    if (!catalogData?.catalog?.catalogRates) return [];
    const list = (catalogData.catalog.catalogRates as any[]).map(
      (r: any, idx: number) => ({
        id: r.id,
        code: idx + 1,
        materialId: r.materialId,
        materialName: r.material?.name || "",
        unit: r.material?.defaultUnit || "",
        rates: [{ district: r.district, rate: r.rate }],
      }),
    );
    if (!search.trim()) return list;
    const q = search.toLowerCase();
    return list.filter(
      (i) =>
        i.materialName.toLowerCase().includes(q) ||
        i.unit.toLowerCase().includes(q) ||
        String(i.code).includes(q),
    );
  }, [catalogData, search]);

  useEffect(() => {
    if (open) {
      setSourceCatalogId("");
      setSearch("");
      setSelected(new Set());
      setDestCols(destinationColumns);
    }
  }, [open, destinationColumns]);

  function toggleAll() {
    if (selected.size === items.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(items.map((i) => i.id)));
    }
  }

  function toggle(id: string) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  }

  function getRate(item: CatalogItem, district: string) {
    return item.rates?.find((r) => r.district === district)?.rate ?? 0;
  }

  async function handleCopy() {
    if (!catalogData?.catalog || selected.size === 0) return;
    setCopying(true);
    try {
      const data = items
        .filter((i) => selected.has(i.id))
        .map((item) => {
          const rates: Record<string, number> = {};
          for (const col of destCols) {
            const rate = getRate(item, col);
            if (rate > 0) rates[col] = rate;
          }
          return { materialId: item.materialId, rates };
        });
      await onCopy({
        items: data,
        sourceName: catalogData.catalog.name,
      });
      toast.success(`Copied ${data.length} items`);
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Copy failed");
    } finally {
      setCopying(false);
    }
  }

  const sourceCatalog = catalogData?.catalog;
  const sourceDistricts = sourceCatalog?.districts ?? [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-4xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Copy From Library</DialogTitle>
          <DialogDescription>
            Select a source catalog and choose items to copy into destination columns.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-3 py-2">
          <div className="flex-1 space-y-1">
            <Label className="text-xs">Source Library</Label>
            <Select value={sourceCatalogId} onValueChange={setSourceCatalogId}>
              <SelectTrigger>
                <SelectValue placeholder="Select a rate catalog..." />
              </SelectTrigger>
              <SelectContent>
                {catalogs?.catalogs?.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name} ({c.fiscalYear}) — {c._count.catalogRates} items
                  </SelectItem>
                )) ?? null}
              </SelectContent>
            </Select>
          </div>
        </div>

        {sourceCatalog && (
          <>
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search materials..."
                className="pl-9 h-9"
              />
            </div>

            <div className="flex items-center gap-2 text-xs text-muted-foreground py-1">
              <label className="flex items-center gap-1.5 cursor-pointer">
                <Checkbox
                  checked={items.length > 0 && selected.size === items.length}
                  onCheckedChange={toggleAll}
                />
                Select all ({selected.size} of {items.length})
              </label>
            </div>

            <div className="flex-1 overflow-y-auto max-h-[40vh] border rounded-lg">
              <Table>
                <TableHeader className="sticky top-0 bg-card z-10">
                  <TableRow>
                    <TableHead className="w-10" />
                    <TableHead className="w-12 text-xs">SN</TableHead>
                    <TableHead className="text-xs">Material</TableHead>
                    <TableHead className="w-16 text-xs">Unit</TableHead>
                    {sourceDistricts.map((d: string) => (
                      <TableHead key={d} className="w-20 text-xs text-right">
                        {d}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((item) => (
                    <TableRow
                      key={item.id}
                      className={cn(
                        "cursor-pointer",
                        selected.has(item.id) && "bg-muted/50",
                      )}
                      onClick={() => toggle(item.id)}
                    >
                      <TableCell>
                        <Checkbox
                          checked={selected.has(item.id)}
                          onCheckedChange={() => toggle(item.id)}
                        />
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {item.code}
                      </TableCell>
                      <TableCell className="text-sm font-medium">
                        {item.materialName}
                      </TableCell>
                      <TableCell className="text-xs">{item.unit}</TableCell>
                      {sourceDistricts.map((d: string) => (
                        <TableCell
                          key={d}
                          className="text-xs text-right tabular-nums"
                        >
                          {getRate(item, d) > 0
                            ? getRate(item, d).toLocaleString()
                            : "—"}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                  {items.length === 0 && (
                    <TableRow>
                      <TableCell
                        colSpan={3 + sourceDistricts.length}
                        className="py-8 text-center text-sm text-muted-foreground"
                      >
                        {search
                          ? "No items match your search."
                          : "No items in this catalog."}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">
                Copy into columns
                <span className="text-muted-foreground ml-1">
                  (select which destination columns to fill)
                </span>
              </Label>
              <div className="flex flex-wrap gap-2">
                {destinationColumns.map((col) => {
                  const enabled = destCols.includes(col);
                  return (
                    <Badge
                      key={col}
                      variant={enabled ? "default" : "outline"}
                      className={cn(
                        "cursor-pointer",
                        enabled && "bg-primary",
                      )}
                      onClick={() => {
                        setDestCols((prev) =>
                          prev.includes(col)
                            ? prev.filter((c) => c !== col)
                            : [...prev, col],
                        );
                      }}
                    >
                      {enabled ? "✓ " : ""}
                      {col}
                    </Badge>
                  );
                })}
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleCopy}
                disabled={selected.size === 0 || copying}
              >
                {copying ? (
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                ) : (
                  <Copy className="h-4 w-4 mr-1" />
                )}
                Copy {selected.size} Item{selected.size !== 1 ? "s" : ""} →
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
