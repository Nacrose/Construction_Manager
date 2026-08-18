"use client";

import { useState, useMemo, useEffect, useCallback } from "react";
import { trpc } from "@/lib/trpc-client";
import { Card, CardContent } from "@/components/ui/card";
import { BookOpen, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { CopyFromDialog } from "@/components/rate-catalog/copy-from-dialog";
import { FiscalYearSwitchDialog } from "./fiscal-year-switch-dialog";
import { ManageDistrictsDialog } from "./manage-districts-dialog";
import { SyncRateCatalogDialog } from "./sync-rate-catalog-dialog";
import { CatalogRatesToolbar } from "./catalog-rates-toolbar";
import { CatalogRatesTable } from "./catalog-rates-table";
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
  } | null;
  rates: { district: string; rate: number }[];
};

export function CatalogRatesLibrary({
  projectId,
  canWrite,
  initialCatalogId,
}: {
  projectId?: string;
  canWrite: boolean;
  initialCatalogId?: string;
}) {
  const utils = trpc.useUtils();
  const { data: catalogsData } = trpc.rateCatalog.list.useQuery({ activeOnly: false });
  const [selectedCatalogId, setSelectedCatalogId] = useState<string>(initialCatalogId || "");
  const [showCopyFrom, setShowCopyFrom] = useState(false);
  const [showManageDistricts, setShowManageDistricts] = useState(false);
  const [showSyncDialog, setShowSyncDialog] = useState(false);
  const [showFYSwitchDialog, setShowFYSwitchDialog] = useState(false);
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
        if (m.materialCatalogId) ids.add(m.materialCatalogId);
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

  const { data: catalogData, isLoading: catalogLoading } = trpc.rateCatalog.get.useQuery(
    { id: selectedCatalogId },
    { enabled: !!selectedCatalogId }
  );
  const catalog = catalogData?.catalog;

  const { data: missingRatesData } = trpc.rateCatalog.getMissingRatesCount.useQuery(
    { catalogId: selectedCatalogId || undefined },
    { enabled: !!selectedCatalogId }
  );

  const missingCount = missingRatesData?.count || 0;
  const missingItemIds = useMemo(
    () => new Set(missingRatesData?.missingItemIds || []),
    [missingRatesData]
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
      setVisibleDistricts(catalog.districts);
      if (!activeLocation && catalog.districts.length > 0) {
        setActiveLocation(catalog.districts[0]);
      }
    }
  }, [catalog?.districts, activeLocation]);

  const updateCatalogMut = trpc.rateCatalog.update.useMutation({
    onSuccess: () => {
      utils.rateCatalog.get.invalidate({ id: selectedCatalogId });
      toast.success("Catalog districts updated");
    },
    onError: (e) => toast.error(e.message),
  });

  const setItemRates = trpc.rateCatalog.setItemRates.useMutation({
    onSuccess: () => {
      utils.rateCatalog.get.invalidate({ id: selectedCatalogId });
      utils.rateCatalog.getMissingRatesCount.invalidate({ catalogId: selectedCatalogId });
    },
  });

  const orgProjectColumnsQuery = trpc.projectRate.getOrgProjectColumns.useQuery(
    { rateCatalogId: selectedCatalogId },
    { enabled: !!selectedCatalogId }
  );

  const saveProjectRateMut = trpc.projectRate.saveProjectRate.useMutation({
    onSuccess: () => {
      utils.rateCatalog.get.invalidate({ id: selectedCatalogId });
      toast.success("Project rate saved");
    },
    onError: (e) => toast.error(e.message),
  });

  const allDistricts = useMemo(() => catalog?.districts || [], [catalog?.districts]);
  const displayedDistricts = useMemo(() => {
    return allDistricts.filter((d) => visibleDistricts.includes(d));
  }, [allDistricts, visibleDistricts]);

  const rawItems = (catalog?.items || []) as CatalogItem[];

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

    if (district === "__PROJECT__") {
      saveProjectRateMut.mutate({
        catalogItemId: itemId,
        rate: num,
      });
      return;
    }

    const item = rawItems.find((i) => i.id === itemId);
    if (!item) return;
    setItemRates.mutate({ itemId, rates: { [district]: num } });
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
      <Card>
        <CardContent className="py-12 text-center text-sm text-muted-foreground">
          <BookOpen className="mx-auto h-8 w-8 mb-2 opacity-40" />
          No rate catalog found or selected.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
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
        onShowSyncDialog={() => setShowSyncDialog(true)}
        onShowManageDistricts={() => setShowManageDistricts(true)}
        onShowCopyFrom={() => setShowCopyFrom(true)}
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
        orgProjectColumns={orgProjectColumnsQuery.data?.columns || []}
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
        onShowSyncDialog={() => setShowSyncDialog(true)}
      />

      {/* Footer */}
      <div className="flex items-center justify-between text-xs text-muted-foreground pt-1">
        <span>
          {rawItems.length} items · {displayedDistricts.length} displayed districts (
          {allDistricts.length} total) · Fiscal Year {catalog.fiscalYear}
        </span>
      </div>

      {/* Dialogs */}
      <CopyFromDialog
        open={showCopyFrom}
        onOpenChange={setShowCopyFrom}
        destinationColumns={catalog.districts}
        onCopy={async (data) => {
          for (const copyItem of data.items) {
            if (copyItem.rates) {
              await setItemRates.mutateAsync({
                itemId: copyItem.itemId,
                rates: copyItem.rates,
              });
            }
          }
          utils.rateCatalog.get.invalidate({ id: catalog.id });
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

      <SyncRateCatalogDialog
        open={showSyncDialog}
        onOpenChange={setShowSyncDialog}
        catalogId={selectedCatalogId}
        onSynced={() => {
          utils.rateCatalog.get.invalidate({ id: selectedCatalogId });
          utils.rateCatalog.getMissingRatesCount.invalidate({ catalogId: selectedCatalogId });
        }}
      />

      {projectId && (
        <FiscalYearSwitchDialog
          projectId={projectId}
          open={showFYSwitchDialog}
          onOpenChange={setShowFYSwitchDialog}
          currentFiscalYear={catalog?.fiscalYear || "2080/81"}
          district={activeLocation || "Morang"}
          onSuccess={() => {
            utils.rateCatalog.get.invalidate({ id: selectedCatalogId });
          }}
        />
      )}
    </div>
  );
}
