"use client";

import { CheckCircle2, Trash2, Undo2, RotateCcw } from "lucide-react";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ConstructionTable, ConstructionTableColumn } from "@/components/ui/construction-table";

export function ArchivedCatalogTable({
  archivedQuery,
  restoreCatalogMut,
  setPurgeDialogOpen,
  setDeleteConfirmIds,
}: {
  archivedQuery: any;
  restoreCatalogMut: any;
  setPurgeDialogOpen: (val: boolean) => void;
  setDeleteConfirmIds: (ids: string[]) => void;
}) {
  const items = archivedQuery.data?.items || [];

  const columns: ConstructionTableColumn<any>[] = [
    {
      key: "name",
      header: "Name",
      render: (_, item) => (
        <div className="font-medium text-foreground truncate">
          {item.name}
          {item.subCategory && item.subCategory !== item.name && (
            <span className="text-muted-foreground ml-1.5 text-[11px]">
              ({item.subCategory})
            </span>
          )}
        </div>
      ),
    },
    {
      key: "category",
      header: "Category",
      render: (_, item) => <span className="text-muted-foreground truncate">{item.category}</span>,
    },
    {
      key: "defaultUnit",
      header: "Unit",
      render: (_, item) => (
        <span className="font-mono text-muted-foreground">{item.defaultUnit || "unit"}</span>
      ),
    },
    {
      key: "deletedAt",
      header: "Archived",
      render: (_, item) => (
        <span className="text-muted-foreground text-[11px]">
          {item.deletedAt ? format(new Date(item.deletedAt), "dd MMM yyyy") : "—"}
        </span>
      ),
    },
    {
      key: "actions",
      header: "Actions",
      align: "right",
      render: (_, item) => (
        <div className="flex items-center justify-end gap-1">
          <Button
            size="sm"
            variant="outline"
            className="h-6 text-[11px] gap-1 px-2 text-success dark:text-success/80 border-success/40 hover:bg-success/10 dark:hover:bg-success/20"
            onClick={() => restoreCatalogMut.mutate({ id: item.id })}
            disabled={restoreCatalogMut.isPending}
            title="Restore this item to the active catalog"
          >
            <RotateCcw className="h-3 w-3" /> Restore
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="h-6 w-6 text-muted-foreground hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/20"
            onClick={() => setDeleteConfirmIds([item.id])}
            title="Permanently delete from database"
          >
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between py-1">
        <div className="flex items-center gap-2">
          <Undo2 className="h-4 w-4 text-zinc-500" />
          <span className="text-sm font-semibold text-foreground">Archived Items</span>
          {archivedQuery.data && (
            <Badge
              variant="outline"
              className="text-[10px] font-mono border-zinc-400 text-zinc-600 dark:text-zinc-300"
            >
              {items.length} archived
            </Badge>
          )}
        </div>
        {/* Purge Archived — SuperAdmin only */}
        <Button
          size="sm"
          variant="outline"
          className="h-7 text-xs gap-1.5 border-red-300 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/20 font-medium"
          onClick={() => setPurgeDialogOpen(true)}
        >
          <Trash2 className="h-3.5 w-3.5" /> Purge Archived (SuperAdmin)
        </Button>
      </div>

      <ConstructionTable
        data={items}
        columns={columns}
        isLoading={archivedQuery.isLoading}
        searchPlaceholder="Search archived items..."
        searchFilterKeys={["name", "category", "subCategory", "defaultUnit"]}
      />
    </div>
  );
}
