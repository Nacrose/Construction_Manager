import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { trpc } from "@/lib/trpc-client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { BookOpen, Loader2, Plus, Copy, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { CopyFromDialog } from "@/components/rate-catalog/copy-from-dialog";
import { FiscalYearSwitchDialog } from "./fiscal-year-switch-dialog";
import { ManageDistrictsDialog } from "./manage-districts-dialog";
import { CatalogRatesToolbar } from "./catalog-rates-toolbar";
import { CatalogRatesTable } from "./catalog-rates-table";
import { CreateRateCatalogDialog } from "./create-rate-catalog-dialog";
import { DistrictMultiplierDialog } from "./district-multiplier-dialog";
import { STANDARD_CATEGORIES } from "@/lib/category-theme";

type CatalogItem = {
  id: string;
  code: number;
  materialName: string;
  unit: string;
  materialCatalogId: string | null;
  materialCatalog?: {
    category?: string | null;
    subCategory?: string | null;
    name?: string | null;
    organizationId?: string | null;
    isGlobal?: boolean;
    projectId?: string | null;
    scope?: string | null;
  } | null;
  rates: { district: string; rate: number }[];
};

export function CatalogRatesLibrary({
  projectId,
  canWrite,
  initialCatalogId,
  scope,
  organizationId,
}: {
  projectId?: string;
  canWrite: boolean;
  initialCatalogId?: string;
  scope?: "global" | "org" | "project";
  organizationId?: string;
}) {
  const utils = trpc.useUtils();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const effectiveScope = scope || (projectId ? "project" : undefined);
  const { data: catalogsData, isLoading: isCatalogsLoading } = trpc.catalogV2.listRateCatalogs.useQuery({
    ...(effectiveScope ? { scope: effectiveScope } : {}),
    ...(projectId ? { projectId } : {}),
    ...(organizationId ? { organizationId } : {}),
  });
  const [selectedCatalogId, setSelectedCatalogId] = useState<string>(initialCatalogId || "");
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showCopyFrom, setShowCopyFrom] = useState(false);
  const [showManageDistricts, setShowManageDistricts] = useState(false);
  const [showFYSwitchDialog, setShowFYSwitchDialog] = useState(false);
  const [showMultiplierDialog, setShowMultiplierDialog] = useState(false);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");

  const [activeLocation, setActiveLocation] = useState<string>("");
  const [visibleDistricts, setVisibleDistricts] = useState<string[]>([]);
  const [editRates, setEditRates] = useState<Record<string, Record<string, string>>>({});

  const projectMaterialsQuery = trpc.material.list.useQuery(
    { projectId: projectId || "" },
    { enabled: !!projectId }
  );

  const projectMaterialCatalogIds = useMemo(() => {
    const ids = new Set<string>();
    if (projectMaterialsQuery.data?.materials) {
      for (const m of projectMaterialsQuery.data.materials) {
        const cid = (m as any).catalogMaterialId || (m as any).materialCatalogId;
        if (cid) ids.add(cid);
      }
    }
    return ids;
  }, [projectMaterialsQuery.data]);

  const projectMaterialNames = useMemo(() => {
    const names = new Set<string>();
    if (projectMaterialsQuery.data?.materials) {
      for (const m of projectMaterialsQuery.data.materials) {
        if (m.name) names.add(m.name.toLowerCase());
      }
    }
    return names;
  }, [projectMaterialsQuery.data]);

  const [collapsedCategories, setCollapsedCategories] = useState<Record<string, boolean>>({});
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});

  const { data: catalogData, isLoading: catalogLoading } = trpc.catalogV2.getRateCatalog.useQuery(
    { id: selectedCatalogId },
    { enabled: !!selectedCatalogId }
  );
  const catalog = catalogData?.catalog;

  const missingCount = useMemo(() => {
    if (!catalog?.catalogRates) return 0;
    return (catalog.catalogRates as any[]).filter((r) => !r.rate || r.rate <= 0).length;
  }, [catalog]);
  const missingItemIds = useMemo(
    () =>
      new Set(
        (catalog?.catalogRates || [] as any[])
          .filter((r) => !r.rate || r.rate <= 0)
          .map((r) => r.id)
      ),
    [catalog]
  );

  useEffect(() => {
    if (!selectedCatalogId && catalogsData?.catalogs && catalogsData.catalogs.length > 0) {
      const activeCat =
        catalogsData.catalogs.find((c) => c.isActive) || catalogsData.catalogs[0];
      setSelectedCatalogId(activeCat.id);
    }
  }, [catalogsData?.catalogs, selectedCatalogId]);

  useEffect(() => {
    if (catalog?.districts) {
      const dists = projectId && !catalog.districts.includes("Project Rate")
        ? [...catalog.districts, "Project Rate"]
        : catalog.districts;
      setVisibleDistricts(dists);
      if (!activeLocation) {
        setActiveLocation(projectId ? "Project Rate" : (dists[0] || ""));
      }
    }
  }, [catalog?.districts, activeLocation, projectId]);

  const updateCatalogMut = trpc.catalogV2.updateRateCatalog.useMutation({
    onSuccess: () => {
      utils.catalogV2.getRateCatalog.invalidate({ id: selectedCatalogId });
      toast.success("Catalog districts updated");
    },
    onError: (e) => toast.error(e.message),
  });

  const setRateMut = trpc.catalogV2.setRate.useMutation({
    onSuccess: () => {
      utils.catalogV2.getRateCatalog.invalidate({ id: selectedCatalogId });
    },
    onError: (e) => toast.error(e.message),
  });

  const bulkSetRatesMut = trpc.catalogV2.bulkSetRates.useMutation({
    onSuccess: () => {
      utils.catalogV2.getRateCatalog.invalidate({ id: selectedCatalogId });
    },
    onError: (e) => toast.error(e.message),
  });

  const syncMut = trpc.catalogV2.syncRateCatalog.useMutation({
    onSuccess: (res) => {
      utils.catalogV2.getRateCatalog.invalidate({ id: selectedCatalogId });
      toast.success(
        `Synced ${res.addedMaterials} materials (${res.addedRates} rate entries) into the rate catalog.`
      );
    },
    onError: (e) => toast.error(e.message),
  });

  const handleSync = useCallback(() => {
    if (selectedCatalogId) syncMut.mutate({ rateCatalogId: selectedCatalogId });
  }, [selectedCatalogId, syncMut]);

  // Auto-populate: materials should automatically appear in the rate catalog.
  const didAutoSync = useRef(false);
  useEffect(() => {
    if (
      canWrite &&
      catalog &&
      !catalogLoading &&
      (catalog.catalogRates?.length ?? 0) === 0 &&
      !didAutoSync.current &&
      !syncMut.isPending
    ) {
      didAutoSync.current = true;
      handleSync();
    }
  }, [canWrite, catalog, catalogLoading, syncMut.isPending, handleSync]);

  const allDistricts = useMemo(() => {
    const rawDistricts = catalog?.districts || [];
    if (projectId && !rawDistricts.includes("Project Rate")) {
      return [...rawDistricts, "Project Rate"];
    }
    return rawDistricts;
  }, [catalog?.districts, projectId]);

  const displayedDistricts = useMemo(() => {
    return allDistricts.filter((d) => visibleDistricts.includes(d));
  }, [allDistricts, visibleDistricts]);

  // Group rates by materialId so each material is ONE row with columns for each district
  const rawItems = useMemo(() => {
    const rates = (catalog?.catalogRates || []) as any[];
    const map = new Map<string, CatalogItem>();

    let idx = 1;
    for (const r of rates) {
      const matId = r.materialId || r.material?.id || r.id;
      if (!map.has(matId)) {
        map.set(matId, {
          id: r.id,
          code: idx++,
          materialName: r.material?.name || "",
          unit: r.material?.defaultUnit || "",
          materialCatalogId: r.materialId,
          materialCatalog: r.material
            ? {
                category: r.material.category || null,
                subCategory: r.material.subCategory || null,
                name: r.material.name || null,
                organizationId: r.material.organizationId ?? null,
                isGlobal: r.material.scope === "global",
                projectId: r.material.projectId ?? null,
                scope: r.material.scope,
              }
            : null,
          rates: [],
        });
      }
      map.get(matId)!.rates.push({ district: r.district, rate: r.rate });
    }

    return Array.from(map.values());
  }, [catalog?.catalogRates]);

  const availableCategories = useMemo(() => {
    const set = new Set<string>();
    for (const item of rawItems) {
      const cat = item.materialCatalog?.category || "General";
      set.add(cat);
    }
    return Array.from(set).sort();
  }, [rawItems]);

  const filteredItems = useMemo(() => {
    const q = search.toLowerCase().trim();
    return rawItems.filter((item) => {
      const nameMatch = !q || item.materialName.toLowerCase().includes(q);
      const codeMatch = !q || String(item.code).includes(q);
      const subCatMatch =
        !q || (item.materialCatalog?.subCategory || "").toLowerCase().includes(q);
      const itemCat = item.materialCatalog?.category || "General";
      const catMatch = categoryFilter === "all" || itemCat === categoryFilter;
      return (nameMatch || codeMatch || subCatMatch) && catMatch;
    });
  }, [rawItems, search, categoryFilter]);

  const treeData = useMemo(() => {
    return filteredItems.reduce(
      (acc, item) => {
        const cat = item.materialCatalog?.category || "General";
        const group =
          item.materialCatalog?.name ||
          item.materialName.replace(/\s*\(.*?\)\s*/g, "").trim() ||
          "Unspecified";
        if (!acc[cat]) acc[cat] = {};
        if (!acc[cat][group]) acc[cat][group] = [];
        acc[cat][group].push(item);
        return acc;
      },
      {} as Record<string, Record<string, CatalogItem[]>>
    );
  }, [filteredItems]);

  const toggleCategory = (cat: string) => {
    setCollapsedCategories((prev) => ({ ...prev, [cat]: !prev[cat] }));
  };

  const toggleGroup = (cat: string, group: string) => {
    const key = `${cat}::${group}`;
    setCollapsedGroups((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleExpandAll = () => {
    setCollapsedCategories({});
    setCollapsedGroups({});
  };

  const handleCollapseAll = () => {
    const newCats: Record<string, boolean> = {};
    for (const c of Object.keys(treeData)) newCats[c] = true;
    setCollapsedCategories(newCats);
  };

  const displayRate = (item: CatalogItem, district: string) => {
    if (editRates[item.id]?.[district] !== undefined) {
      return editRates[item.id][district];
    }
    const r = item.rates.find((rate) => rate.district === district);
    return r ? String(r.rate) : "";
  };

  const handleRateChange = (itemId: string, district: string, val: string) => {
    setEditRates((prev) => ({
      ...prev,
      [itemId]: { ...(prev[itemId] || {}), [district]: val },
    }));
  };

  const saveRate = (itemId: string, district: string) => {
    const val = editRates[itemId]?.[district];
    if (val === undefined) return;
    const num = parseFloat(val);
    if (isNaN(num)) return;

    const item = rawItems.find((i) => i.id === itemId);
    if (!item || !item.materialCatalogId) return;
    setRateMut.mutate({
      rateCatalogId: selectedCatalogId,
      materialId: item.materialCatalogId,
      district,
      rate: num,
    });
  };

  if (catalogLoading && !catalog) {
    return (
      <Card>
        <CardContent className="py-16 text-center text-sm text-muted-foreground">
          <Loader2 className="mx-auto h-8 w-8 animate-spin text-amber-500 mb-2" />
          Loading rate catalog...
        </CardContent>
      </Card>
    );
  }

  if (!catalog) {
    return (
      <div className="space-y-4">
        <Card className="border-dashed">
          <CardContent className="py-16 text-center space-y-3">
            <div className="mx-auto w-12 h-12 rounded-full bg-amber-500/10 flex items-center justify-center text-amber-600 dark:text-amber-400 mb-2">
              <BookOpen className="h-6 w-6" />
            </div>
            <div className="space-y-1">
              <h3 className="text-base font-semibold">
                {effectiveScope === "project" ? "No Project Rate Catalog Found" : "No Rate Catalog Found"}
              </h3>
              <p className="text-xs text-muted-foreground max-w-md mx-auto">
                {effectiveScope === "project"
                  ? "Set up a rate book for this project to define district material, labor, and equipment rates used across BOQ rate analyses."
                  : "Create or adopt a rate catalog to begin managing district rate schedules."}
              </p>
            </div>
            {canWrite && (
              <div className="flex items-center justify-center gap-2 pt-2">
                <Button
                  onClick={() => setShowCreateDialog(true)}
                  className="bg-amber-600 hover:bg-amber-700 text-white text-xs gap-1.5 shadow-2xs"
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  {effectiveScope === "project" ? "Adopt / Create Rate Catalog" : "Create Rate Catalog"}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        <CreateRateCatalogDialog
          open={showCreateDialog}
          onOpenChange={setShowCreateDialog}
          projectId={projectId}
          scope={effectiveScope || "project"}
          onSuccess={(newId) => {
            setSelectedCatalogId(newId);
          }}
        />
      </div>
    );
  }

  const handleExportCSV = () => {
    if (!catalog || rawItems.length === 0) {
      toast.error("No items to export.");
      return;
    }
    const districts = catalog.districts || ["Default"];
    const headers = ["Category", "Material Name", "Specification / Grade", "Unit", ...districts];
    const rows = rawItems.map((item) => {
      const cat = item.materialCatalog?.category || "General";
      const name = item.materialCatalog?.name || item.materialName;
      const spec = item.materialCatalog?.subCategory || "";
      const unit = item.unit || "";
      const rateCols = districts.map((d) => {
        const found = item.rates.find((r) => r.district === d);
        return found ? found.rate : 0;
      });
      return [
        `"${cat.replace(/"/g, '""')}"`,
        `"${name.replace(/"/g, '""')}"`,
        `"${spec.replace(/"/g, '""')}"`,
        `"${unit.replace(/"/g, '""')}"`,
        ...rateCols,
      ].join(",");
    });

    const csvContent = [headers.join(","), ...rows].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `${catalog.name.replace(/[^a-zA-Z0-9_-]/g, "_")}_Rates.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success("Rate catalog exported as CSV.");
  };

  const handleImportCSV = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !catalog) return;

    try {
      const text = await file.text();
      const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
      if (lines.length < 2) {
        toast.error("CSV file is empty or missing data rows.");
        return;
      }

      // Parse headers
      const headerLine = lines[0];
      const headerCols = headerLine.split(",").map((h) => h.replace(/^"|"$/g, "").trim());
      const districtCols = headerCols.slice(4); // Indices 4+ are district columns

      if (districtCols.length === 0) {
        toast.error("CSV must contain at least one district rate column.");
        return;
      }

      const entriesToUpdate: Array<{ materialId: string; district: string; rate: number }> = [];

      for (let i = 1; i < lines.length; i++) {
        // Simple CSV splitter handling quoted values
        const row = lines[i].match(/(".*?"|[^",]+)(?=\s*,|\s*$)/g) || [];
        const cleanRow = row.map((c) => c.replace(/^"|"$/g, "").trim());
        if (cleanRow.length < 4) continue;

        const rowName = cleanRow[1]?.toLowerCase();
        const rowSpec = cleanRow[2]?.toLowerCase() || "";

        // Find matching item in rawItems
        const matchedItem = rawItems.find((item) => {
          const mName = (item.materialCatalog?.name || item.materialName).toLowerCase();
          const mSpec = (item.materialCatalog?.subCategory || "").toLowerCase();
          return mName === rowName && (rowSpec === "" || mSpec === rowSpec);
        });

        if (matchedItem && matchedItem.materialCatalogId) {
          districtCols.forEach((district, colIdx) => {
            const rawRateStr = cleanRow[4 + colIdx];
            if (rawRateStr) {
              const rateVal = parseFloat(rawRateStr);
              if (!isNaN(rateVal) && rateVal >= 0) {
                entriesToUpdate.push({
                  materialId: matchedItem.materialCatalogId!,
                  district,
                  rate: rateVal,
                });
              }
            }
          });
        }
      }

      if (entriesToUpdate.length === 0) {
        toast.error("No matching materials found in the CSV to update.");
        return;
      }

      toast.info(`Importing ${entriesToUpdate.length} rate entries...`);
      await bulkSetRatesMut.mutateAsync({
        rateCatalogId: selectedCatalogId,
        rates: entriesToUpdate,
      });
      toast.success(`Successfully imported rates from ${file.name}.`);
    } catch (err: any) {
      toast.error(`CSV import failed: ${err.message}`);
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  return (
    <div className="space-y-4">
      {/* Hidden File Input for CSV Import */}
      <input
        type="file"
        ref={fileInputRef}
        accept=".csv"
        className="hidden"
        onChange={handleImportCSV}
      />

      {/* Toolbar */}
      <CatalogRatesToolbar
        catalogs={catalogsData?.catalogs ?? []}
        selectedCatalogId={selectedCatalogId}
        setSelectedCatalogId={setSelectedCatalogId}
        search={search}
        setSearch={setSearch}
        categoryFilter={categoryFilter}
        setCategoryFilter={setCategoryFilter}
        allDistricts={allDistricts}
        activeLocation={activeLocation}
        setActiveLocation={setActiveLocation}
        visibleDistricts={visibleDistricts}
        setVisibleDistricts={setVisibleDistricts}
        categories={availableCategories}
        missingCount={missingCount}
        projectId={projectId}
        canWrite={canWrite}
        onShowFYSwitchDialog={() => setShowFYSwitchDialog(true)}
        onShowSyncDialog={handleSync}
        isSyncing={syncMut.isPending}
        onShowManageDistricts={() => setShowManageDistricts(true)}
        onShowCopyFrom={() => setShowCopyFrom(true)}
        onShowCreateCatalog={() => setShowCreateDialog(true)}
        onShowDistrictMultiplier={() => setShowMultiplierDialog(true)}
        onExportCSV={handleExportCSV}
        onImportCSV={() => fileInputRef.current?.click()}
        onExpandAll={handleExpandAll}
        onCollapseAll={handleCollapseAll}
      />

      {/* 3-Level Collapsible WBS Tree Table */}
      <CatalogRatesTable
        treeData={treeData}
        collapsedCategories={collapsedCategories}
        toggleCategory={toggleCategory}
        collapsedGroups={collapsedGroups}
        toggleGroup={toggleGroup}
        displayedDistricts={displayedDistricts}
        activeLocation={activeLocation}
        orgProjectColumns={[]}
        projectId={projectId}
        canWrite={canWrite}
        displayRate={displayRate}
        handleRateChange={handleRateChange}
        saveRate={saveRate}
        missingItemIds={missingItemIds}
        projectMaterialCatalogIds={projectMaterialCatalogIds}
        projectMaterialNames={projectMaterialNames}
        search={search}
        categoryFilter={categoryFilter}
        onShowSyncDialog={handleSync}
      />

      {/* Footer */}
      <div className="flex items-center justify-between text-xs text-muted-foreground pt-1">
        <span>
          {rawItems.length} items · {displayedDistricts.length} displayed districts (
          {allDistricts.length} total) · Fiscal Year {catalog.fiscalYear}
        </span>
      </div>

      {/* District Multiplier / Escalation Dialog */}
      <DistrictMultiplierDialog
        open={showMultiplierDialog}
        onOpenChange={setShowMultiplierDialog}
        rateCatalogId={selectedCatalogId}
        districts={catalog.districts}
        activeDistrict={activeLocation}
      />

      {/* Dialogs */}
      <CopyFromDialog
        open={showCopyFrom}
        onOpenChange={setShowCopyFrom}
        destinationColumns={catalog.districts}
        onCopy={async (data) => {
          const rates: { materialId: string; district: string; rate: number }[] = [];
          for (const copyItem of data.items) {
            if (!copyItem.materialId) continue;
            for (const [district, rate] of Object.entries(copyItem.rates)) {
              rates.push({ materialId: copyItem.materialId, district, rate });
            }
          }
          if (rates.length) {
            await bulkSetRatesMut.mutateAsync({ rateCatalogId: selectedCatalogId, rates });
          }
        }}
      />

      {showManageDistricts && (
        <ManageDistrictsDialog
          catalogId={catalog.id}
          districts={allDistricts}
          open={showManageDistricts}
          onOpenChange={setShowManageDistricts}
          onSuccess={(updatedDistricts) => {
            updateCatalogMut.mutate({ id: catalog.id, districts: updatedDistricts });
            setShowManageDistricts(false);
          }}
        />
      )}

      {projectId && (
        <FiscalYearSwitchDialog
          projectId={projectId}
          open={showFYSwitchDialog}
          onOpenChange={setShowFYSwitchDialog}
          currentFiscalYear={catalog?.fiscalYear || "2080/81"}
          district={activeLocation || "Morang"}
          onSuccess={() => {
            utils.catalogV2.getRateCatalog.invalidate({ id: selectedCatalogId });
          }}
        />
      )}

      <CreateRateCatalogDialog
        open={showCreateDialog}
        onOpenChange={setShowCreateDialog}
        projectId={projectId}
        scope={effectiveScope || "project"}
        onSuccess={(newId) => {
          setSelectedCatalogId(newId);
        }}
      />
    </div>
  );
}
