"use client";

import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Plus, Search, Loader2, Copy, Check } from "lucide-react";
import { toast } from "sonner";
import { CopyFromDialog } from "@/components/rate-catalog/copy-from-dialog";

export type Catalog = {
  id: string;
  name: string;
  fiscalYear: string;
  districts: string[];
  isActive: boolean;
  scope: string;
  sourceCatalogId: string | null;
  _count: { items: number };
};

export type CatalogItem = {
  id: string;
  code: number;
  materialName: string;
  unit: string;
  materialCatalogId: string | null;
  rates: { district: string; rate: number }[];
};

export function CatalogDetail({
  catalog,
  onBack,
}: {
  catalog: Catalog;
  onBack: () => void;
}) {
  const utils = trpc.useUtils();
  const { data, isLoading } = trpc.rateCatalog.get.useQuery({ id: catalog.id });
  const [search, setSearch] = useState("");
  const [editRates, setEditRates] = useState<Record<string, Record<string, string>>>({});
  const [showCopyFrom, setShowCopyFrom] = useState(false);

  const items = useMemo(() => {
    if (!data?.catalog?.items) return [];
    const q = search.toLowerCase();
    return data.catalog.items.filter(
      (i) => i.materialName.toLowerCase().includes(q) || String(i.code).includes(q)
    );
  }, [data, search]);

  const setActive = trpc.rateCatalog.setActive.useMutation({
    onSuccess: () => {
      utils.rateCatalog.list.invalidate();
      utils.rateCatalog.get.invalidate({ id: catalog.id });
      toast.success("Set as active");
    },
    onError: (e) => toast.error(e.message),
  });

  const addItem = trpc.rateCatalog.addItem.useMutation({
    onSuccess: () => {
      utils.rateCatalog.get.invalidate({ id: catalog.id });
      toast.success("Item added");
    },
    onError: (e) => toast.error(e.message),
  });

  const setItemRates = trpc.rateCatalog.setItemRates.useMutation({
    onSuccess: () => {
      utils.rateCatalog.get.invalidate({ id: catalog.id });
    },
  });

  const copyInflate = trpc.rateCatalog.copyWithInflation.useMutation({
    onSuccess: () => {
      utils.rateCatalog.list.invalidate();
      toast.success("Copied with inflation");
    },
    onError: (e) => toast.error(e.message),
  });

  const [inflatePct, setInflatePct] = useState("8");
  const [newCode, setNewCode] = useState("");
  const [newName, setNewName] = useState("");
  const [newUnit, setNewUnit] = useState("");

  function handleRateChange(itemId: string, district: string, val: string) {
    setEditRates((prev) => ({
      ...prev,
      [itemId]: { ...prev[itemId], [district]: val },
    }));
  }

  function saveRate(itemId: string, district: string) {
    const rate = parseFloat(editRates[itemId]?.[district] ?? "");
    if (isNaN(rate)) return;
    setItemRates.mutate({ itemId, rates: { [district]: rate } });
    setEditRates((prev) => {
      const next = { ...prev };
      if (next[itemId]) delete next[itemId][district];
      return next;
    });
  }

  function displayRate(item: CatalogItem, district: string) {
    const edit = editRates[item.id]?.[district];
    if (edit !== undefined) return edit;
    const rate = item.rates?.find((r) => r.district === district)?.rate;
    return rate ?? 0;
  }

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <button
            onClick={onBack}
            className="text-xs text-muted-foreground hover:text-foreground mb-1"
          >
            ← Back to catalogs
          </button>
          <h2 className="text-xl font-bold flex items-center gap-2">
            {catalog.name}
            <Badge variant="outline" className="text-xs font-mono">
              {catalog.fiscalYear}
            </Badge>
            {catalog.isActive && <Badge className="bg-emerald-600 text-[9px]">Active</Badge>}
            {catalog.sourceCatalogId && (
              <Badge variant="outline" className="text-[9px] text-muted-foreground">
                Imported
              </Badge>
            )}
          </h2>
        </div>
        <div className="flex gap-2">
          {!catalog.isActive && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setActive.mutate({ id: catalog.id })}
            >
              <Check className="h-3 w-3 mr-1" /> Set Active
            </Button>
          )}
          <Button size="sm" variant="outline" onClick={() => setShowCopyFrom(true)}>
            <Copy className="h-3 w-3 mr-1" /> Copy From
          </Button>
          <div className="flex items-center gap-1">
            <Input
              type="number"
              value={inflatePct}
              onChange={(e) => setInflatePct(e.target.value)}
              className="h-8 w-16 text-xs"
              placeholder="%"
            />
            <Button
              size="sm"
              variant="outline"
              className="h-8 text-xs"
              onClick={() => {
                const fy = prompt("New fiscal year:", "2081/82");
                if (fy)
                  copyInflate.mutate({
                    sourceCatalogId: catalog.id,
                    name: catalog.name,
                    fiscalYear: fy,
                    inflationPct: parseFloat(inflatePct) || 0,
                  });
              }}
            >
              <Copy className="h-3 w-3 mr-1" /> +{inflatePct}%
            </Button>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search items..."
            className="pl-7 h-8 text-sm"
          />
        </div>
        <div className="flex items-center gap-2 ml-auto">
          <Input
            placeholder="SN"
            value={newCode}
            onChange={(e) => setNewCode(e.target.value)}
            className="h-8 w-16 text-xs"
          />
          <Input
            placeholder="Material name"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            className="h-8 w-48 text-xs"
          />
          <Input
            placeholder="Unit"
            value={newUnit}
            onChange={(e) => setNewUnit(e.target.value)}
            className="h-8 w-20 text-xs"
          />
          <Button
            size="sm"
            className="h-8"
            disabled={!newName || addItem.isPending}
            onClick={() => {
              addItem.mutate({
                catalogId: catalog.id,
                code: parseInt(newCode) || items.length + 1,
                materialName: newName,
                unit: newUnit,
              });
              setNewCode("");
              setNewName("");
              setNewUnit("");
            }}
          >
            <Plus className="h-3 w-3 mr-1" /> Add
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader className="sticky top-0 bg-card z-10">
              <TableRow>
                <TableHead className="w-12 text-xs">SN</TableHead>
                <TableHead className="text-xs min-w-[200px]">Material</TableHead>
                <TableHead className="w-16 text-xs">Unit</TableHead>
                {catalog.districts.map((d) => (
                  <TableHead key={d} className="w-24 text-xs text-right">
                    {d}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item: CatalogItem) => (
                <TableRow key={item.id}>
                  <TableCell className="text-xs text-muted-foreground">{item.code}</TableCell>
                  <TableCell className="text-sm font-medium">{item.materialName}</TableCell>
                  <TableCell className="text-xs">{item.unit}</TableCell>
                  {catalog.districts.map((d) => (
                    <TableCell key={d} className="p-1">
                      <input
                        type="number"
                        value={displayRate(item, d)}
                        onChange={(e) => handleRateChange(item.id, d, e.target.value)}
                        onBlur={() => saveRate(item.id, d)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") saveRate(item.id, d);
                        }}
                        className="h-7 w-full rounded border border-transparent bg-transparent px-1.5 text-xs text-right tabular-nums hover:border-border focus:border-primary focus:outline-none"
                      />
                    </TableCell>
                  ))}
                </TableRow>
              ))}
              {items.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={3 + catalog.districts.length}
                    className="py-12 text-center text-sm text-muted-foreground"
                  >
                    No items yet. Add one or import from global catalog.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <CopyFromDialog
        open={showCopyFrom}
        onOpenChange={setShowCopyFrom}
        destinationColumns={catalog.districts}
        onCopy={async (data) => {
          for (const copyItem of data.items) {
            if (copyItem.rates) {
              await setItemRates.mutateAsync({ itemId: copyItem.itemId, rates: copyItem.rates });
            }
          }
          utils.rateCatalog.get.invalidate({ id: catalog.id });
        }}
      />
    </div>
  );
}
