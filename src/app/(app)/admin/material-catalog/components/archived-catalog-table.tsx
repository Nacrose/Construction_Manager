"use client";

import { CheckCircle2, Trash2, Undo2, RotateCcw } from "lucide-react";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

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
              {archivedQuery.data.items.length} archived
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

      {archivedQuery.isLoading ? (
        <div className="space-y-2 p-4">
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-full" />
        </div>
      ) : !archivedQuery.data?.items.length ? (
        <Card className="p-8 text-center text-muted-foreground">
          <CheckCircle2 className="h-8 w-8 mx-auto text-emerald-500/50 mb-2" />
          <p className="text-sm font-medium">No archived items found.</p>
          <p className="text-xs">
            Items you archive will appear here and can be restored at any time.
          </p>
        </Card>
      ) : (
        <div className="border border-border rounded-lg overflow-hidden">
          <table className="w-full text-xs text-left table-fixed">
            <thead>
              <tr className="border-b border-border bg-muted/30 text-muted-foreground text-[11px]">
                <th className="py-2 px-3 font-semibold">Name</th>
                <th className="py-2 px-3 font-semibold w-32">Category</th>
                <th className="py-2 px-3 font-semibold w-24">Unit</th>
                <th className="py-2 px-3 font-semibold w-28">Archived</th>
                <th className="py-2 px-3 font-semibold text-right w-24">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {archivedQuery.data.items.map((item: any) => (
                <tr key={item.id} className="hover:bg-muted/30 transition-colors">
                  <td className="py-2 px-3 font-medium text-foreground truncate">
                    {item.name}
                    {item.subCategory && item.subCategory !== item.name && (
                      <span className="text-muted-foreground ml-1.5 text-[11px]">
                        ({item.subCategory})
                      </span>
                    )}
                  </td>
                  <td className="py-2 px-3 text-muted-foreground truncate">{item.category}</td>
                  <td className="py-2 px-3 font-mono text-muted-foreground">
                    {item.defaultUnit || "unit"}
                  </td>
                  <td className="py-2 px-3 text-muted-foreground text-[11px]">
                    {item.deletedAt ? format(new Date(item.deletedAt), "dd MMM yyyy") : "—"}
                  </td>
                  <td className="py-2 px-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-6 text-[11px] gap-1 px-2 text-emerald-700 dark:text-emerald-300 border-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-950/20"
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
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
