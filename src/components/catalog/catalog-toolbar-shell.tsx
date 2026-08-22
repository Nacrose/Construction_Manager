"use client";

import { type ReactNode } from "react";
import { Search, Maximize2, Minimize2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function CatalogToolbarShell({
  catalogSelect,
  search,
  setSearch,
  searchPlaceholder = "Search...",
  categoryFilter,
  setCategoryFilter,
  allCategories,
  locationSelect,
  onExpandAll,
  onCollapseAll,
  className,
  children,
}: {
  catalogSelect?: ReactNode;
  search: string;
  setSearch: (val: string) => void;
  searchPlaceholder?: string;
  categoryFilter: string;
  setCategoryFilter: (val: string) => void;
  allCategories: string[];
  locationSelect?: ReactNode;
  onExpandAll: () => void;
  onCollapseAll: () => void;
  className?: string;
  children?: ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-muted/40 p-2.5 rounded-lg border",
        className
      )}
    >
      <div className="flex flex-1 flex-wrap items-center gap-2 min-w-[280px]">
        {catalogSelect}
        <div className="relative flex-1 min-w-[160px] max-w-xs">
          <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={searchPlaceholder}
            className="pl-8 h-8 text-xs bg-background"
          />
        </div>
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="h-8 text-xs w-44 bg-background">
            <SelectValue placeholder="All Categories" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all" className="text-xs">
              All Categories
            </SelectItem>
            {allCategories.map((c) => (
              <SelectItem key={c} value={c} className="text-xs">
                {c}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {locationSelect}
      </div>

      <div className="flex items-center gap-1.5 shrink-0">
        {children}
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
