"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  Search,
  BookTemplate,
  Calendar,
  Settings,
  Columns,
  Maximize2,
  Minimize2,
  Copy,
  RefreshCw,
  MoreVertical,
  Plus,
} from "lucide-react";
import { STANDARD_CATEGORIES } from "@/lib/category-theme";

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
  onExpandAll,
  onCollapseAll,
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
  onExpandAll: () => void;
  onCollapseAll: () => void;
}) {
  const toggleDistrictVisible = (district: string) => {
    if (visibleDistricts.includes(district)) {
      if (visibleDistricts.length <= 1) return;
      setVisibleDistricts(visibleDistricts.filter((d) => d !== district));
    } else {
      setVisibleDistricts([...visibleDistricts, district]);
    }
  };

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 bg-muted/40 p-2.5 rounded-lg border">
      <div className="flex flex-wrap items-center gap-2 flex-1 min-w-[280px]">
        {/* Catalog Selector */}
        <div className="w-56 shrink-0">
          <Select value={selectedCatalogId} onValueChange={setSelectedCatalogId}>
            <SelectTrigger className="h-8 text-xs font-semibold bg-background">
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
        </div>

        {/* Search */}
        <div className="relative flex-1 min-w-[160px] max-w-xs">
          <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search material or code..."
            className="pl-8 h-8 text-xs bg-background"
          />
        </div>

        {/* Category Filter */}
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="h-8 text-xs w-40 bg-background">
            <SelectValue placeholder="All Categories" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all" className="text-xs">
              All Categories
            </SelectItem>
            {categories.map((cat) => (
              <SelectItem key={cat} value={cat} className="text-xs">
                {cat}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Active Location Indicator & Selector */}
        {allDistricts.length > 0 && (
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
        )}
      </div>

      <div className="flex items-center gap-1.5 shrink-0">
        {/* Fiscal Year Switch Button */}
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

        {/* Sync Button */}
        {canWrite && (
          <Button
            size="sm"
            variant="outline"
            onClick={onShowSyncDialog}
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

        {/* Column Chooser Popover */}
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

        {/* More Actions Dropdown */}
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
            {canWrite && (
              <DropdownMenuItem
                onClick={onShowManageDistricts}
                className="gap-2 cursor-pointer text-xs"
              >
                <Settings className="h-3.5 w-3.5 text-amber-500" /> Manage Districts
              </DropdownMenuItem>
            )}
            <DropdownMenuItem
              onClick={onShowCopyFrom}
              className="gap-2 cursor-pointer text-xs"
            >
              <Copy className="h-3.5 w-3.5" /> Copy Rates from Another Catalog
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Expand / Collapse All */}
        <div className="flex items-center border-l pl-1.5 ml-0.5 gap-0.5 border-border">
          <Button
            size="sm"
            variant="ghost"
            onClick={onExpandAll}
            className="h-7 w-7 p-0"
            title="Expand All"
          >
            <Maximize2 className="h-3 w-3" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={onCollapseAll}
            className="h-7 w-7 p-0"
            title="Collapse All"
          >
            <Minimize2 className="h-3 w-3" />
          </Button>
        </div>
      </div>
    </div>
  );
}
