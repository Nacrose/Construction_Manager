"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { CatalogView } from "@/components/catalog/catalog-view";

export function CatalogRatesTable({
  treeData,
  collapsedCategories,
  toggleCategory,
  collapsedGroups,
  toggleGroup,
  displayedDistricts,
  activeLocation,
  orgProjectColumns,
  projectId,
  canWrite,
  displayRate,
  handleRateChange,
  saveRate,
  missingItemIds,
  projectMaterialCatalogIds,
  projectMaterialNames,
  search,
  categoryFilter,
  onShowSyncDialog,
}: {
  treeData: Record<string, Record<string, any[]>>;
  collapsedCategories: Record<string, boolean>;
  toggleCategory: (cat: string) => void;
  collapsedGroups: Record<string, boolean>;
  toggleGroup: (cat: string, group: string) => void;
  displayedDistricts: string[];
  activeLocation: string;
  orgProjectColumns: any[];
  projectId?: string;
  canWrite: boolean;
  displayRate: (item: any, district: string) => string;
  handleRateChange: (itemId: string, district: string, val: string) => void;
  saveRate: (itemId: string, district: string) => void;
  missingItemIds: Set<string>;
  projectMaterialCatalogIds: Set<string>;
  projectMaterialNames: Set<string>;
  search: string;
  categoryFilter: string;
  onShowSyncDialog: () => void;
}) {
  const getDisplayName = (item: any, groupName: string, groupItems: any[]) => {
    const spec =
      item.materialCatalog?.subCategory || item.materialCatalog?.name || "";
    const isSingleStandardSpec =
      groupItems.length === 1 &&
      (!spec ||
        spec.toLowerCase() === "standard" ||
        spec.toLowerCase() === groupName.toLowerCase());
    return spec &&
      spec.toLowerCase() !== "standard" &&
      spec.toLowerCase() !== groupName.toLowerCase()
      ? spec
      : isSingleStandardSpec
        ? "Standard"
        : item.materialName || groupName;
  };

  const getScope = (item: any) => {
    const rateMissing = missingItemIds.has(item.id);
    if (item.materialCatalogId) {
      const matScope = item.materialCatalog?.scope;
      if (matScope === "project" || item.materialCatalog?.projectId) {
        return {
          projectId: item.materialCatalog.projectId || projectId,
          projectLinked: true,
          rateMissing,
        };
      }
      if (projectId) {
        const isProjectLinked =
          projectMaterialCatalogIds.has(item.materialCatalogId) ||
          projectMaterialNames.has(item.materialName.toLowerCase());
        if (isProjectLinked) {
          return {
            projectId: item.id,
            projectLinked: true,
            rateMissing,
          };
        }
      }
      if (matScope === "global" || item.materialCatalog?.isGlobal) {
        return { isGlobal: true, rateMissing };
      }
      return { organizationId: item.materialCatalog?.organizationId ?? "org", rateMissing };
    }
    return { standalone: true, rateMissing };
  };

  const extraColumnCount = displayedDistricts.length;

  return (
    <CatalogView
      treeData={treeData}
      collapsedCategories={collapsedCategories}
      collapsedGroups={collapsedGroups}
      toggleCategory={toggleCategory}
      toggleGroup={toggleGroup}
      getDisplayName={getDisplayName}
      getScope={getScope}
      headerExtras={
        <>
          {displayedDistricts.map((d: string) => (
            <th
              key={d}
              className={cn(
                "py-2 px-2 text-right font-semibold pr-3 w-32",
                d === activeLocation ? "text-amber-400 font-bold" : "text-primary/90"
              )}
            >
              {d} {d === activeLocation ? "⭐" : ""}
            </th>
          ))}
        </>
      }
      extraColumnCount={extraColumnCount}
      groupBadge={(groupItems) =>
        groupItems.some((i: any) => i.materialCatalogId) ? (
          <Badge
            variant="outline"
            className="text-[9px] font-mono bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 border-emerald-200/60 shadow-none font-medium gap-0.5 shrink-0"
          >
            {groupItems.filter((i: any) => i.materialCatalogId).length} Linked
          </Badge>
        ) : null
      }
      renderLeafExtras={(item, ctx) => {
        const groupItems = ctx.groupItems;
        const validRates = displayedDistricts
          .map((d) => ({ district: d, rate: Number(displayRate(item, d)) }))
          .filter((r) => r.rate > 0);
        const minRateObj =
          validRates.length > 0
            ? validRates.reduce((prev, curr) => (curr.rate < prev.rate ? curr : prev))
            : null;
        const maxRateObj =
          validRates.length > 0
            ? validRates.reduce((prev, curr) => (curr.rate > prev.rate ? curr : prev))
            : null;

        return (
          <>
            {displayedDistricts.map((d: string) => {
              const currentRate = Number(displayRate(item, d));
              const isLowest =
                minRateObj &&
                minRateObj.district === d &&
                validRates.length > 1 &&
                currentRate > 0;
              const isHighest =
                maxRateObj &&
                maxRateObj.district === d &&
                validRates.length > 1 &&
                currentRate > 0 &&
                maxRateObj.rate !== minRateObj?.rate;

              return (
                <td
                  key={d}
                  className={cn(
                    "py-1 px-1 text-right tabular-nums w-32",
                    d === activeLocation &&
                      "bg-amber-500/5 dark:bg-amber-950/10 font-bold"
                  )}
                >
                  {canWrite ? (
                    <div className="relative flex items-center justify-end">
                      <input
                        type="number"
                        value={displayRate(item, d)}
                        onChange={(e) => handleRateChange(item.id, d, e.target.value)}
                        onBlur={() => saveRate(item.id, d)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") saveRate(item.id, d);
                        }}
                        className={cn(
                          "h-6 w-full rounded border border-transparent bg-transparent px-1.5 text-[11px] text-right tabular-nums hover:border-border focus:border-amber-500 focus:outline-none font-mono [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none",
                          currentRate === 0 && "text-muted-foreground/40 italic"
                        )}
                        placeholder="0"
                      />
                      {isLowest && (
                        <Badge className="absolute -top-1 right-0 text-[8px] bg-emerald-600 text-white px-1 py-0 h-3 leading-none pointer-events-none">
                          Lowest
                        </Badge>
                      )}
                      {isHighest && (
                        <Badge className="absolute -top-1 right-0 text-[8px] bg-red-600 text-white px-1 py-0 h-3 leading-none pointer-events-none">
                          Highest
                        </Badge>
                      )}
                    </div>
                  ) : (
                    <span className="text-xs font-mono text-right tabular-nums block px-1.5">
                      {currentRate > 0 ? currentRate.toLocaleString("en-IN") : "—"}
                    </span>
                  )}
                </td>
              );
            })}
          </>
        );
      }}
      emptyState={{
        title:
          search || categoryFilter !== "all"
            ? "No items found matching filter criteria."
            : projectId
              ? "No materials synced to this project yet."
              : "No rate catalog items found.",
        action:
          projectId && canWrite && !search && categoryFilter === "all" ? (
            <Button
              size="sm"
              onClick={onShowSyncDialog}
              className="gap-1.5 text-xs bg-amber-600 hover:bg-amber-700 text-white"
            >
              Sync Materials from Organization Catalog
            </Button>
          ) : undefined,
      }}
    />
  );
}
