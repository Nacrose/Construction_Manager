"use client";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  BookTemplate,
  Calendar,
  Search,
  Settings,
  Columns,
  RefreshCw,
  MoreVertical,
  Copy,
} from "lucide-react";
import { CatalogToolbarShell } from "@/components/catalog/catalog-toolbar-shell";

export function CatalogRatesToolbar({
  catalogs,
  selectedCatalogId,
  setSelectedCatalogId,
  search,
  setSearch,
  categoryFilter,
  setCategoryFilter,
  allDistricts,
  activeLocation,
  setActiveLocation,
  visibleDistricts,
  setVisibleDistricts,
  categories,
  missingCount,
  projectId,
  canWrite,
  onShowFYSwitchDialog,
  onShowSyncDialog,
  onShowManageDistricts,
  onShowCopyFrom,
  onShowCreateCatalog,
  onShowDistrictMultiplier,
  onExportCSV,
  onImportCSV,
  onExpandAll,
  onCollapseAll,
  isSyncing,
}: {
  catalogs: any[];
  selectedCatalogId: string;
  setSelectedCatalogId: (id: string) => void;
  search: string;
  setSearch: (s: string) => void;
  categoryFilter: string;
  setCategoryFilter: (cat: string) => void;
  allDistricts: string[];
  activeLocation: string;
  setActiveLocation: (loc: string) => void;
  visibleDistricts: string[];
  setVisibleDistricts: (districts: string[]) => void;
  categories: string[];
  missingCount: number;
  projectId?: string;
  canWrite: boolean;
  onShowFYSwitchDialog: () => void;
  onShowSyncDialog: () => void;
  onShowManageDistricts: () => void;
  onShowCopyFrom: () => void;
  onShowCreateCatalog?: () => void;
  onShowDistrictMultiplier?: () => void;
  onExportCSV?: () => void;
  onImportCSV?: () => void;
  onExpandAll: () => void;
  onCollapseAll: () => void;
  isSyncing?: boolean;
}) {
  const toggleDistrictVisible = (district: string) => {
    if (visibleDistricts.includes(district)) {
      if (visibleDistricts.length <= 1) return;
      setVisibleDistricts(visibleDistricts.filter((d) => d !== district));
    } else {
      setVisibleDistricts([...visibleDistricts, district]);
    }
  };

  const catalogSelect = (
    <div className="w-56 shrink-0 flex items-center gap-1">
      <Select value={selectedCatalogId} onValueChange={setSelectedCatalogId}>
        <SelectTrigger className="h-8 text-xs font-semibold bg-background flex-1">
          <BookTemplate className="h-3.5 w-3.5 text-amber-500 mr-1 shrink-0" />
          <SelectValue placeholder="Select Catalog" />
        </SelectTrigger>
        <SelectContent>
          {catalogs.map((c) => (
            <SelectItem key={c.id} value={c.id} className="text-xs">
              {c.name} ({c.fiscalYear}) {c.isActive ? "⭐" : ""}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {canWrite && onShowCreateCatalog && (
        <Button
          size="sm"
          variant="outline"
          onClick={onShowCreateCatalog}
          className="h-8 px-2 text-xs font-semibold shrink-0"
          title="Create or adopt a new rate catalog"
        >
          + New
        </Button>
      )}
    </div>
  );

  const locationSelect =
    allDistricts.length > 0 ? (
      <div className="flex items-center gap-1 bg-background border px-2 py-0.5 rounded-md text-xs">
        <span className="text-muted-foreground text-[10px] uppercase font-semibold">
          Active:
        </span>
        <Select value={activeLocation} onValueChange={setActiveLocation}>
          <SelectTrigger className="h-6 border-none shadow-none text-xs font-bold text-amber-700 dark:text-amber-300 p-0 focus:ring-0">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {allDistricts.map((d) => (
              <SelectItem key={d} value={d} className="text-xs">
                {d}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    ) : null;

  return (
    <CatalogToolbarShell
      catalogSelect={catalogSelect}
      search={search}
      setSearch={setSearch}
      searchPlaceholder="Search material or code..."
      categoryFilter={categoryFilter}
      setCategoryFilter={setCategoryFilter}
      allCategories={categories}
      locationSelect={locationSelect}
      onExpandAll={onExpandAll}
      onCollapseAll={onCollapseAll}
    >
      {projectId && canWrite && (
        <Button
          size="sm"
          variant="outline"
          onClick={onShowFYSwitchDialog}
          className="h-8 text-xs gap-1.5 border-amber-500/30 hover:border-amber-500 text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/20 font-medium"
        >
          <Calendar className="h-3.5 w-3.5" />
          Switch Fiscal Year
        </Button>
      )}

      {canWrite && (
        <Button
          size="sm"
          variant="outline"
          onClick={onShowSyncDialog}
          disabled={isSyncing}
          className="h-8 text-xs gap-1.5 text-muted-foreground hover:text-foreground font-medium relative"
        >
          <RefreshCw className="h-3.5 w-3.5 text-amber-500" />
          Sync
          {missingCount > 0 && (
            <Badge className="bg-red-500 text-white text-[9px] px-1 py-0 h-4 leading-none font-mono">
              {missingCount}
            </Badge>
          )}
        </Button>
      )}

      <Popover>
        <PopoverTrigger asChild>
          <Button
            size="sm"
            variant="outline"
            className="h-8 text-xs gap-1 text-muted-foreground hover:text-foreground"
          >
            <Columns className="h-3.5 w-3.5 text-blue-500" />
            Columns ({visibleDistricts.length}/{allDistricts.length})
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-56 p-2 text-xs" align="end">
          <div className="font-semibold text-xs mb-1.5">Visible District Columns</div>
          <div className="space-y-1 max-h-48 overflow-y-auto">
            {allDistricts.map((d) => (
              <label
                key={d}
                className="flex items-center gap-2 p-1 rounded hover:bg-muted cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={visibleDistricts.includes(d)}
                  onChange={() => toggleDistrictVisible(d)}
                  className="rounded border-zinc-300 text-amber-600 focus:ring-amber-500 h-3.5 w-3.5"
                />
                <span className="font-mono text-xs">{d}</span>
                {d === activeLocation && (
                  <Badge className="ml-auto text-[8px] bg-amber-500/20 text-amber-700 dark:text-amber-300 px-1 py-0 h-3.5">
                    Active
                  </Badge>
                )}
              </label>
            ))}
          </div>
        </PopoverContent>
      </Popover>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
          >
            <MoreVertical className="h-3.5 w-3.5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="text-xs">
          {canWrite && onShowDistrictMultiplier && (
            <DropdownMenuItem
              onClick={onShowDistrictMultiplier}
              className="gap-2 cursor-pointer text-xs"
            >
              <Settings className="h-3.5 w-3.5 text-amber-500" /> Apply District Multiplier / Escalation
            </DropdownMenuItem>
          )}
          {canWrite && (
            <DropdownMenuItem
              onClick={onShowManageDistricts}
              className="gap-2 cursor-pointer text-xs"
            >
              <Settings className="h-3.5 w-3.5 text-blue-500" /> Manage Districts
            </DropdownMenuItem>
          )}
          <DropdownMenuItem
            onClick={onShowCopyFrom}
            className="gap-2 cursor-pointer text-xs"
          >
            <Copy className="h-3.5 w-3.5" /> Copy Rates from Another Catalog
          </DropdownMenuItem>
          {onExportCSV && (
            <DropdownMenuItem
              onClick={onExportCSV}
              className="gap-2 cursor-pointer text-xs"
            >
              📥 Export Rates (CSV)
            </DropdownMenuItem>
          )}
          {canWrite && onImportCSV && (
            <DropdownMenuItem
              onClick={onImportCSV}
              className="gap-2 cursor-pointer text-xs"
            >
              📤 Import Rates (CSV)
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </CatalogToolbarShell>
  );
}
