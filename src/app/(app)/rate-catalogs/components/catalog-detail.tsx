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
  sourceCatalogId?: string | null;
  _count?: { catalogRates: number };
};

export function CatalogDetail({
  catalog,
  onBack,
}: {
  catalog: Catalog;
  onBack: () => void;
}) {
  const utils = trpc.useUtils();
  const { data, isLoading } = trpc.catalogV2.getRateCatalog.useQuery({ id: catalog.id });
  const [search, setSearch] = useState("");
  const [editRates, setEditRates] = useState<Record<string, Record<string, string>>>({});
  const [showCopyFrom, setShowCopyFrom] = useState(false);

  // Group catalogRates by materialId
  const items = useMemo(() => {
    const rawRates = data?.catalog?.catalogRates || [];
    const matMap = new Map<
      string,
      {
        id: string;
        materialId: string;
        materialName: string;
        category: string | null;
        subCategory: string | null;
        unit: string;
        rates: Record<string, number>;
      }
    >();

    for (const r of rawRates) {
      const mat = r.material;
      if (!mat) continue;
      if (!matMap.has(mat.id)) {
        matMap.set(mat.id, {
          id: mat.id,
          materialId: mat.id,
          materialName: mat.name,
          category: mat.category,
          subCategory: mat.subCategory,
          unit: mat.defaultUnit || "unit",
          rates: {},
        });
      }
      matMap.get(mat.id)!.rates[r.district] = r.rate;
    }

    const allGrouped = Array.from(matMap.values());
    if (!search.trim()) return allGrouped;
    const q = search.toLowerCase();
    return allGrouped.filter(
      (i) =>
        i.materialName.toLowerCase().includes(q) ||
        (i.category && i.category.toLowerCase().includes(q)) ||
        (i.subCategory && i.subCategory.toLowerCase().includes(q))
    );
  }, [data, search]);

  const updateCatalog = trpc.catalogV2.updateRateCatalog.useMutation({
    onSuccess: () => {
      utils.catalogV2.listRateCatalogs.invalidate();
      utils.catalogV2.getRateCatalog.invalidate({ id: catalog.id });
      toast.success("Catalog updated");
    },
    onError: (e) => toast.error(e.message),
  });

  const setRateMut = trpc.catalogV2.setRate.useMutation({
    onSuccess: () => {
      utils.catalogV2.getRateCatalog.invalidate({ id: catalog.id });
    },
    onError: (e) => toast.error(e.message),
  });

  const syncMaterialsMut = trpc.catalogV2.syncRateCatalog.useMutation({
    onSuccess: (res) => {
      utils.catalogV2.getRateCatalog.invalidate({ id: catalog.id });
      toast.success(`Synced ${res.addedRates} district rates across ${res.addedMaterials} materials.`);
    },
    onError: (e) => toast.error(e.message),
  });

  const createMaterialMut = trpc.catalogV2.createMaterial.useMutation({
    onSuccess: async (res) => {
      // Also add initial rate for all catalog districts
      for (const d of catalog.districts) {
        await setRateMut.mutateAsync({
          rateCatalogId: catalog.id,
          materialId: res.material.id,
          district: d,
          rate: res.material.defaultRate || 0,
        });
      }
      utils.catalogV2.getRateCatalog.invalidate({ id: catalog.id });
      toast.success("Material item added to catalog");
    },
    onError: (e) => toast.error(e.message),
  });

  const copyInflate = trpc.catalogV2.copyWithInflation.useMutation({
    onSuccess: (res) => {
      utils.catalogV2.listRateCatalogs.invalidate();
      toast.success(`Copied ${res.copiedRatesCount} rates to new catalog`);
    },
    onError: (e) => toast.error(e.message),
  });

  const [inflatePct, setInflatePct] = useState("8");
  const [newName, setNewName] = useState("");
  const [newUnit, setNewUnit] = useState("cum");
  const [newCategory, setNewCategory] = useState("Roads & Highways");

  function handleRateChange(materialId: string, district: string, val: string) {
    setEditRates((prev) => ({
      ...prev,
      [materialId]: { ...prev[materialId], [district]: val },
    }));
  }

  function saveRate(materialId: string, district: string) {
    const rate = parseFloat(editRates[materialId]?.[district] ?? "");
    if (isNaN(rate)) return;
    setRateMut.mutate({
      rateCatalogId: catalog.id,
      materialId,
      district,
      rate,
    });
    setEditRates((prev) => {
      const next = { ...prev };
      if (next[materialId]) delete next[materialId][district];
      return next;
    });
  }

  function displayRate(item: { materialId: string; rates: Record<string, number> }, district: string) {
    const edit = editRates[item.materialId]?.[district];
    if (edit !== undefined) return edit;
    const rate = item.rates[district];
    return rate !== undefined ? String(rate) : "";
  }

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-amber-500" />
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
              onClick={() => updateCatalog.mutate({ id: catalog.id, isActive: true })}
            >
              <Check className="h-3 w-3 mr-1" /> Set Active
            </Button>
          )}
          <Button
            size="sm"
            variant="outline"
            disabled={syncMaterialsMut.isPending}
            onClick={() => syncMaterialsMut.mutate({ rateCatalogId: catalog.id })}
          >
            <Plus className="h-3 w-3 mr-1" /> Sync Materials
          </Button>
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
                    name: `${catalog.name} (${fy})`,
                    newFiscalYear: fy,
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
            placeholder="Category"
            value={newCategory}
            onChange={(e) => setNewCategory(e.target.value)}
            className="h-8 w-36 text-xs"
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
            disabled={!newName.trim() || createMaterialMut.isPending}
            onClick={() => {
              createMaterialMut.mutate({
                scope: (catalog.scope as any) || "org",
                name: newName.trim(),
                category: newCategory.trim() || undefined,
                defaultUnit: newUnit.trim() || "unit",
              });
              setNewName("");
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
                <TableHead className="w-12 text-xs">#</TableHead>
                <TableHead className="text-xs min-w-[200px]">Material</TableHead>
                <TableHead className="w-16 text-xs">Unit</TableHead>
                {catalog.districts.map((d) => (
                  <TableHead key={d} className="w-28 text-xs text-right">
                    {d}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item, idx) => (
                <TableRow key={item.id}>
                  <TableCell className="text-xs text-muted-foreground">{idx + 1}</TableCell>
                  <TableCell className="text-sm font-medium">
                    {item.materialName}
                    {item.subCategory && (
                      <span className="text-xs text-muted-foreground ml-1">
                        ({item.subCategory})
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-xs">{item.unit}</TableCell>
                  {catalog.districts.map((d) => (
                    <TableCell key={d} className="p-1">
                      <input
                        type="number"
                        value={displayRate(item, d)}
                        onChange={(e) => handleRateChange(item.materialId, d, e.target.value)}
                        onBlur={() => saveRate(item.materialId, d)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") saveRate(item.materialId, d);
                        }}
                        placeholder="0"
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
                    No rate items yet. Click &quot;Sync Materials&quot; to populate from the material catalog.
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
        onCopy={async (copyData) => {
          for (const copyItem of copyData.items) {
            if (copyItem.rates) {
              for (const [dist, rateVal] of Object.entries(copyItem.rates)) {
                await setRateMut.mutateAsync({
                  rateCatalogId: catalog.id,
                  materialId: copyItem.materialId,
                  district: dist,
                  rate: Number(rateVal) || 0,
                });
              }
            }
          }
          utils.catalogV2.getRateCatalog.invalidate({ id: catalog.id });
        }}
      />
    </div>
  );
}
