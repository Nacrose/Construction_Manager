"use client";

import { Fragment } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  ChevronDown,
  ChevronRight,
  Folder,
  FolderOpen,
  BookOpen,
  Check,
  Shield,
  Building2,
  Zap,
  AlertTriangle,
  RefreshCw,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { sortCategories, getCategoryTheme } from "@/lib/category-theme";

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
  if (Object.keys(treeData).length === 0) {
    return (
      <Card className="p-12 text-center text-muted-foreground space-y-3">
        <BookOpen className="h-10 w-10 mx-auto text-muted-foreground/40" />
        <p className="text-sm font-medium">
          {search || categoryFilter !== "all"
            ? "No items found matching filter criteria."
            : projectId
              ? "No materials synced to this project yet."
              : "No rate catalog items found."}
        </p>
        {projectId && canWrite && !search && categoryFilter === "all" && (
          <Button
            size="sm"
            onClick={onShowSyncDialog}
            className="gap-1.5 text-xs bg-amber-600 hover:bg-amber-700 text-white"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Sync Materials from Organization Catalog
          </Button>
        )}
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {sortCategories(Object.keys(treeData)).map((category, catIdx) => {
        const groups = treeData[category];
        const isCatCollapsed = collapsedCategories[category];
        const catItemCount = Object.values(groups).reduce(
          (sum, list) => sum + list.length,
          0
        );
        const catNumber = catIdx + 1;
        const theme = getCategoryTheme(category, catIdx);

        return (
          <div
            key={category}
            className={cn(
              "rounded-lg overflow-hidden border shadow-2xs transition-all",
              theme.border,
              !isCatCollapsed && "border-l-4"
            )}
          >
            {/* LEVEL 1: Main Category Header */}
            <div
              onClick={() => toggleCategory(category)}
              className={cn(
                "flex items-center justify-between py-1.5 px-3 cursor-pointer select-none rounded-t-lg transition-colors border-b border-border/50",
                theme.headerBg
              )}
            >
              <div className="flex items-center gap-2.5">
                {isCatCollapsed ? (
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <ChevronDown className={cn("h-4 w-4", theme.text)} />
                )}
                {isCatCollapsed ? (
                  <Folder className={cn("h-4 w-4", theme.icon)} />
                ) : (
                  <FolderOpen className={cn("h-4 w-4", theme.icon)} />
                )}
                <span className="font-bold text-sm tracking-wide text-foreground">
                  {catNumber}.0 {category}
                </span>
                <Badge
                  variant="outline"
                  className={cn("text-[10px] font-medium shadow-none", theme.badge)}
                >
                  {catItemCount} items across {Object.keys(groups).length} groups
                </Badge>
              </div>
            </div>

            {/* Category Table */}
            {!isCatCollapsed && (
              <div className="border-t border-border/50 bg-background/30 overflow-x-auto">
                <table className="w-full text-xs font-mono tabular-nums text-left table-fixed">
                  <thead className="sticky top-0 z-10 bg-muted/90 backdrop-blur-md text-primary border-b border-border/80 font-mono">
                    <tr className="border-b border-border/40 text-[11px] font-mono font-bold uppercase tracking-wider text-primary">
                      <th className="py-2 px-2.5 font-semibold w-16 text-center">SN</th>
                      <th className="py-2 px-2.5 font-semibold min-w-[220px]">
                        Sub-Category / Spec
                      </th>
                      <th className="py-2 px-2 font-semibold w-16 text-center">Unit</th>
                      {displayedDistricts.map((d: string) => (
                        <th
                          key={d}
                          className={cn(
                            "py-2 px-2 text-right font-semibold pr-3 w-32",
                            d === activeLocation
                              ? "text-amber-400 font-bold"
                              : "text-primary/90"
                          )}
                        >
                          {d} {d === activeLocation ? "⭐" : ""}
                        </th>
                      ))}
                      {orgProjectColumns.map((col) => (
                        <th
                          key={col.id}
                          className="py-2 px-2 text-right font-semibold pr-3 w-32 border-l border-emerald-500/30 text-emerald-400"
                        >
                          {col.projectName}
                        </th>
                      ))}
                      {projectId && (
                        <th className="py-2 px-2 text-right border-l-2 border-amber-500/40 text-amber-400 font-semibold pr-3 w-36">
                          Project Rate (NPR)
                        </th>
                      )}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/40 font-mono text-xs">
                    {Object.entries(groups)
                      .sort(([a], [b]) => a.localeCompare(b))
                      .map(([groupName, groupItems], grpIdx) => {
                        const groupKey = `${category}::${groupName}`;
                        const isGrpCollapsed = collapsedGroups[groupKey];
                        const hasMultipleSpecs = groupItems.length > 1;
                        const totalCols =
                          3 +
                          displayedDistricts.length +
                          orgProjectColumns.length +
                          (projectId ? 1 : 0);

                        return (
                          <Fragment key={groupName}>
                            {/* LEVEL 2: Group Row */}
                            <tr
                              onClick={() => toggleGroup(category, groupName)}
                              className="bg-slate-700/15 dark:bg-zinc-800/40 hover:bg-slate-700/25 cursor-pointer select-none transition-colors border-b border-border/60"
                            >
                              <td colSpan={totalCols} className="py-1 px-2.5">
                                <div className="flex items-center gap-2">
                                  {isGrpCollapsed ? (
                                    <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                                  ) : (
                                    <ChevronDown
                                      className={cn("h-3.5 w-3.5 shrink-0", theme.text)}
                                    />
                                  )}
                                  <Folder
                                    className={cn("h-3.5 w-3.5 shrink-0", theme.icon)}
                                  />
                                  <span className="font-semibold text-xs text-foreground">
                                    {catNumber}.{grpIdx + 1} {groupName}
                                  </span>
                                  <Badge
                                    variant="outline"
                                    className="text-[10px] font-mono bg-transparent text-muted-foreground border-muted-foreground/25 shadow-none shrink-0"
                                  >
                                    {groupItems.length}{" "}
                                    {groupItems.length === 1 ? "spec" : "specs"}
                                  </Badge>
                                  {groupItems.some((i) => i.materialCatalogId) && (
                                    <Badge
                                      variant="outline"
                                      className="text-[9px] font-mono bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 border-emerald-200/60 shadow-none font-medium gap-0.5 shrink-0"
                                    >
                                      <Check className="h-2.5 w-2.5" />{" "}
                                      {
                                        groupItems.filter((i) => i.materialCatalogId).length
                                      }{" "}
                                      Linked
                                    </Badge>
                                  )}
                                </div>
                              </td>
                            </tr>

                            {/* LEVEL 3: Leaf Spec Data Rows */}
                            {!isGrpCollapsed &&
                              groupItems.map((item, idx) => {
                                const isMissing = missingItemIds.has(item.id);
                                const spec =
                                  item.materialCatalog?.subCategory ||
                                  item.materialCatalog?.name ||
                                  "";
                                const snLabel = `${catNumber}.${grpIdx + 1}.${idx + 1}`;
                                const isSingleStandardSpec =
                                  groupItems.length === 1 &&
                                  (!spec ||
                                    spec.toLowerCase() === "standard" ||
                                    spec.toLowerCase() === groupName.toLowerCase());
                                const displayName =
                                  spec &&
                                  spec.toLowerCase() !== "standard" &&
                                  spec.toLowerCase() !== groupName.toLowerCase()
                                    ? spec
                                    : isSingleStandardSpec
                                      ? "Standard"
                                      : item.materialName || groupName;

                                const validRates = displayedDistricts
                                  .map((d) => ({
                                    district: d,
                                    rate: Number(displayRate(item, d)),
                                  }))
                                  .filter((r) => r.rate > 0);

                                const minRateObj =
                                  validRates.length > 0
                                    ? validRates.reduce((prev, curr) =>
                                        curr.rate < prev.rate ? curr : prev
                                      )
                                    : null;
                                const maxRateObj =
                                  validRates.length > 0
                                    ? validRates.reduce((prev, curr) =>
                                        curr.rate > prev.rate ? curr : prev
                                      )
                                    : null;

                                return (
                                  <tr
                                    key={item.id}
                                    className={cn(
                                      "hover:bg-muted/40 transition-colors",
                                      isMissing && "bg-amber-500/5 dark:bg-amber-950/20"
                                    )}
                                  >
                                    <td className="py-1 px-2.5 text-center text-xs text-muted-foreground font-mono w-16 border-r border-border/30">
                                      {snLabel}
                                    </td>
                                    <td className="py-1 px-2.5 text-xs font-medium text-foreground truncate">
                                      <div
                                        className={cn(
                                          "flex items-center gap-1.5 truncate",
                                          hasMultipleSpecs && "pl-3"
                                        )}
                                      >
                                        <span className="font-mono text-xs truncate">
                                          {displayName}
                                        </span>
                                        {item.materialCatalogId ? (
                                          (() => {
                                            if (projectId) {
                                              const isProjectLinked =
                                                projectMaterialCatalogIds.has(
                                                  item.materialCatalogId
                                                ) ||
                                                projectMaterialNames.has(
                                                  item.materialName.toLowerCase()
                                                );
                                              if (isProjectLinked) {
                                                return (
                                                  <Badge
                                                    variant="outline"
                                                    className="bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 border-emerald-200 text-[9px] gap-0.5 shrink-0 font-medium"
                                                    title="In Project Material Inventory"
                                                  >
                                                    <Shield className="h-2.5 w-2.5" /> Project Item
                                                  </Badge>
                                                );
                                              }
                                              return (
                                                <Badge
                                                  variant="outline"
                                                  className="bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300 border-blue-200 text-[9px] gap-0.5 shrink-0 font-medium"
                                                  title="Available in Organization Catalog"
                                                >
                                                  <Building2 className="h-2.5 w-2.5" /> Org Item
                                                </Badge>
                                              );
                                            }
                                            return (
                                              <Badge
                                                variant="outline"
                                                className="bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300 border-blue-200 text-[9px] gap-0.5 shrink-0 font-medium"
                                                title="Organization Catalog Item"
                                              >
                                                <Building2 className="h-2.5 w-2.5" /> Org Catalog Item
                                              </Badge>
                                            );
                                          })()
                                        ) : (
                                          <Badge
                                            variant="outline"
                                            className="bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300 border-amber-200/80 text-[9px] gap-0.5 shrink-0 font-medium"
                                            title="Rate exists in Rate Catalog without a linked entry in Material Catalog"
                                          >
                                            <Zap className="h-2.5 w-2.5 text-amber-500" /> Standalone Rate
                                          </Badge>
                                        )}
                                        {isMissing && (
                                          <Badge
                                            variant="outline"
                                            className="bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 border-amber-300 text-[9px] gap-0.5 shrink-0"
                                          >
                                            <AlertTriangle className="h-2.5 w-2.5 text-amber-500" /> Rate Missing
                                          </Badge>
                                        )}
                                      </div>
                                    </td>
                                    <td className="py-1 px-2 text-xs font-mono text-muted-foreground text-center w-16">
                                      {item.unit}
                                    </td>

                                    {/* District Side-by-Side Rate Columns */}
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
                                                onChange={(e) =>
                                                  handleRateChange(
                                                    item.id,
                                                    d,
                                                    e.target.value
                                                  )
                                                }
                                                onBlur={() => saveRate(item.id, d)}
                                                onKeyDown={(e) => {
                                                  if (e.key === "Enter")
                                                    saveRate(item.id, d);
                                                }}
                                                className={cn(
                                                  "h-6 w-full rounded border border-transparent bg-transparent px-1.5 text-[11px] text-right tabular-nums hover:border-border focus:border-amber-500 focus:outline-none font-mono [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none",
                                                  currentRate === 0 &&
                                                    "text-muted-foreground/40 italic"
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
                                              {currentRate > 0
                                                ? currentRate.toLocaleString("en-IN")
                                                : "—"}
                                            </span>
                                          )}
                                        </td>
                                      );
                                    })}

                                    {/* Org Project Columns */}
                                    {orgProjectColumns.map((col) => {
                                      const pEntry = col.rates.find(
                                        (r: any) => r.rateCatalogItemId === item.id
                                      );
                                      const val = pEntry?.rate ?? 0;
                                      return (
                                        <td
                                          key={col.id}
                                          className="py-1 px-2 text-right font-mono text-xs border-l border-emerald-500/20 bg-emerald-500/5 text-emerald-800 dark:text-emerald-200"
                                        >
                                          {val > 0
                                            ? `NPR ${val.toLocaleString("en-IN")}`
                                            : "—"}
                                        </td>
                                      );
                                    })}

                                    {/* Editable Project Rate */}
                                    {projectId && (
                                      <td className="p-1 border-l-2 border-amber-500/40 bg-amber-500/5 text-right font-mono w-36">
                                        {canWrite ? (
                                          <input
                                            type="number"
                                            value={
                                              displayRate(item, "__PROJECT__") || ""
                                            }
                                            onChange={(e) =>
                                              handleRateChange(
                                                item.id,
                                                "__PROJECT__",
                                                e.target.value
                                              )
                                            }
                                            onBlur={() => saveRate(item.id, "__PROJECT__")}
                                            onKeyDown={(e) => {
                                              if (e.key === "Enter")
                                                saveRate(item.id, "__PROJECT__");
                                            }}
                                            className="h-6 w-full rounded border border-amber-500/30 bg-background px-1.5 text-xs text-right tabular-nums focus:border-amber-500 focus:outline-none font-mono font-bold text-amber-600 dark:text-amber-400"
                                            placeholder="0"
                                          />
                                        ) : (
                                          <span className="text-xs font-bold text-amber-600 dark:text-amber-400 px-1.5">
                                            {Number(displayRate(item, "__PROJECT__")) >
                                            0
                                              ? `NPR ${Number(displayRate(item, "__PROJECT__")).toLocaleString("en-IN")}`
                                              : "—"}
                                          </span>
                                        )}
                                      </td>
                                    )}
                                  </tr>
                                );
                              })}
                          </Fragment>
                        );
                      })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
