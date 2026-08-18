"use client";

import { Search, Maximize2, Minimize2, Trash2, Undo2, Download, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

export function CatalogToolbar({
  search,
  setSearch,
  categoryFilter,
  setCategoryFilter,
  allCategories,
  handleExpandAll,
  handleCollapseAll,
  selectedIds,
  handleBulkDelete,
  deletedHistoryStack,
  handleUndoDelete,
  isOrgScoped,
  isProjectScoped,
  setSyncDialogOpen,
  showArchived,
  setShowArchived,
  archivedQuery,
  setCreateDialogOpen,
}: {
  search: string;
  setSearch: (val: string) => void;
  categoryFilter: string;
  setCategoryFilter: (val: string) => void;
  allCategories: string[];
  handleExpandAll: () => void;
  handleCollapseAll: () => void;
  selectedIds: Set<string>;
  handleBulkDelete: () => void;
  deletedHistoryStack: any[];
  handleUndoDelete: (item: any) => void;
  isOrgScoped: boolean;
  isProjectScoped: boolean;
  setSyncDialogOpen: (val: boolean) => void;
  showArchived: boolean;
  setShowArchived: (updater: (prev: boolean) => boolean) => void;
  archivedQuery: any;
  setCreateDialogOpen: (val: boolean) => void;
}) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 py-1">
      <div className="flex flex-1 flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[240px]">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search materials (e.g. Bitumen, Rock Bolt, Rebar)..."
            className="pl-8 h-9 text-xs"
          />
        </div>

        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="h-9 rounded-md border border-input bg-background px-2.5 text-xs shadow-2xs focus:ring-1 focus:ring-amber-500 font-medium"
        >
          <option value="all">📦 All Main Categories</option>
          {allCategories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>

        <div className="flex items-center gap-1 border-l pl-2 border-border">
          <Button
            size="sm"
            variant="outline"
            onClick={handleExpandAll}
            className="h-9 text-[11px] gap-1 px-2.5 text-muted-foreground hover:text-foreground"
          >
            <Maximize2 className="h-3.5 w-3.5" /> Expand All
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={handleCollapseAll}
            className="h-9 text-[11px] gap-1 px-2.5 text-muted-foreground hover:text-foreground"
          >
            <Minimize2 className="h-3.5 w-3.5" /> Collapse All
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        {selectedIds.size > 0 && (
          <Button
            onClick={handleBulkDelete}
            variant="destructive"
            className="h-9 text-xs gap-1.5 font-medium shrink-0 animate-fade-in"
          >
            <Trash2 className="h-3.5 w-3.5" /> Archive Selected ({selectedIds.size})
          </Button>
        )}
        {deletedHistoryStack.length > 0 && (
          <Button
            onClick={() => handleUndoDelete(deletedHistoryStack[0])}
            variant="outline"
            className="h-9 text-xs gap-1.5 border-dashed border-amber-500/50 hover:bg-amber-50 dark:hover:bg-amber-950/20 text-amber-600 dark:text-amber-400 font-medium shrink-0 animate-pulse"
            title={`Restore "${deletedHistoryStack[0]?.name}" (Can undo last 10 deletions)`}
          >
            <Undo2 className="h-3.5 w-3.5" /> Undo Delete ({deletedHistoryStack.length})
          </Button>
        )}
        {(isOrgScoped || isProjectScoped) && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => setSyncDialogOpen(true)}
            className="h-9 text-xs gap-1.5 border-amber-500/40 hover:border-amber-500 text-amber-700 dark:text-amber-300 bg-amber-50/50 dark:bg-amber-950/20 font-medium shrink-0"
          >
            <Download className="h-3.5 w-3.5" />
            {isProjectScoped ? "Sync from Organization Catalog" : "Sync from Global Catalog"}
          </Button>
        )}
        {/* Archived toggle — only for catalog views, not project */}
        {!isProjectScoped && (
          <Button
            size="sm"
            variant={showArchived ? "secondary" : "outline"}
            onClick={() => setShowArchived((v) => !v)}
            className={cn(
              "h-9 text-xs gap-1.5 font-medium shrink-0 transition-colors",
              showArchived
                ? "bg-zinc-200 dark:bg-zinc-700 text-foreground border-zinc-400"
                : "text-muted-foreground hover:text-foreground"
            )}
            title={
              showArchived
                ? "Currently showing archived items. Click to switch back to active catalog."
                : "Show archived (soft-deleted) items"
            }
          >
            <Undo2 className="h-3.5 w-3.5" />
            {showArchived ? "← Back to Active" : "Archived Items"}
            {!showArchived && archivedQuery.data && archivedQuery.data.items.length > 0 && (
              <Badge
                variant="outline"
                className="text-[10px] px-1 font-mono ml-0.5 bg-zinc-100 dark:bg-zinc-800 border-zinc-400 text-zinc-600 dark:text-zinc-300"
              >
                {archivedQuery.data.items.length}
              </Badge>
            )}
          </Button>
        )}
        <Button
          onClick={() => setCreateDialogOpen(true)}
          className="h-9 text-xs gap-1.5 bg-amber-600 hover:bg-amber-700 text-white shadow-2xs shrink-0 font-medium"
        >
          <Plus className="h-4 w-4" />{" "}
          {isProjectScoped
            ? "Add Project Material"
            : isOrgScoped
              ? "Add Org Material"
              : "Add Global Master Item"}
        </Button>
      </div>
    </div>
  );
}
