// @ts-nocheck
"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, BookTemplate, BookOpen, Tag, Layers } from "lucide-react";
import { toast } from "sonner";
import { CatalogRatesLibrary } from "@/app/(app)/projects/[id]/boq/components/catalog-rates-library";
import AdminMaterialCatalogPage from "../admin/material-catalog/page";
import { CatalogDetail, type Catalog } from "./components/catalog-detail";
import {
  UnrecognizedMaterialsTab,
  UnrecognizedBadge,
} from "./components/unrecognized-materials-tab";
import { OrgPresetsPanel } from "./components/org-presets-panel";

export { UnrecognizedBadge };

export default function RateCatalogsPage() {
  const utils = trpc.useUtils();

  const { data } = (trpc.catalogV2 as any).listRateCatalogs.useQuery({ scope: "org" } as any);
  const { data: globalData } = (trpc.catalogV2 as any).listRateCatalogs.useQuery({ scope: "global" } as any);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showImport, setShowImport] = useState(false);
  const [importCatalogId, setImportCatalogId] = useState("");
  const [importName, setImportName] = useState("");

  const catalogs = ((data as any)?.catalogs ?? []) as Catalog[];
  const globalCatalogs = ((globalData as any)?.catalogs ?? []) as any[];
  const selected = catalogs.find((c: Catalog) => c.id === selectedId) ?? null;

  const importGlobal = (trpc.catalogV2 as any).importFromParent.useMutation({
    onSuccess: () => {
      (utils as any).catalogV2.listRateCatalogs.invalidate();
      setShowImport(false);
      toast.success("Catalog imported");
    },
    onError: (e: any) => toast.error(e.message),
  });

  if (selected) {
    return (
      <div className="space-y-[3px]">
        <div className="flex items-center gap-2 py-1">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setSelectedId(null)}
            className="h-8 px-2 text-xs text-muted-foreground hover:text-foreground"
          >
            ← Back to catalogs list
          </Button>
        </div>
        <CatalogRatesLibrary initialCatalogId={selected.id} canWrite={true} />
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-8">
      <Tabs defaultValue="materials" className="space-y-[3px]">
        <TabsList className="bg-muted p-1 rounded-xl h-10 border-none shadow-none shrink-0 flex w-fit">
          <TabsTrigger value="materials" className="gap-2 text-xs font-semibold px-4 py-1.5">
            <BookOpen className="h-4 w-4 text-amber-500" /> Material Catalog
          </TabsTrigger>
          <TabsTrigger value="catalogs" className="gap-2 text-xs font-semibold px-4 py-1.5">
            <Tag className="h-4 w-4 text-info" /> Rate Catalogs
          </TabsTrigger>
          <TabsTrigger value="presets" className="gap-2 text-xs font-semibold px-4 py-1.5">
            <BookTemplate className="h-4 w-4 text-teal-500" /> Presets
          </TabsTrigger>
          <TabsTrigger
            value="unrecognized"
            className="gap-2 text-xs font-semibold px-4 py-1.5 relative"
          >
            <Layers className="h-4 w-4 text-purple-500" /> Uncataloged Materials
            <UnrecognizedBadge />
          </TabsTrigger>
        </TabsList>

        <TabsContent value="materials" className="pt-2">
          <AdminMaterialCatalogPage isOrgScoped={true} />
        </TabsContent>

        <TabsContent value="catalogs" className="pt-2">
          <CatalogRatesLibrary canWrite={true} />
        </TabsContent>

        <TabsContent value="unrecognized" className="pt-4">
          <UnrecognizedMaterialsTab />
        </TabsContent>

        <TabsContent value="presets" className="pt-4">
          <OrgPresetsPanel />
        </TabsContent>
      </Tabs>

      {/* Import Global Dialog */}
      <Dialog open={showImport} onOpenChange={setShowImport}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Import Global Catalog</DialogTitle>
            <DialogDescription>
              Copy a global rate catalog to your organization. You can customize the rates after
              import.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Global Catalog</Label>
              <Select value={importCatalogId} onValueChange={setImportCatalogId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a global catalog..." />
                </SelectTrigger>
                <SelectContent>
                  {globalCatalogs.map((c: any) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name} ({c.fiscalYear}) — {(c._count?.catalogRates ?? c._count?.items ?? 0)} items
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Name (optional)</Label>
              <Input
                value={importName}
                onChange={(e) => setImportName(e.target.value)}
                placeholder="Leave empty to use original name"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowImport(false)}>
              Cancel
            </Button>
            <Button
              onClick={() =>
                importGlobal.mutate({
                  targetScope: "org",
                  sourceScope: "global",
                  sourceRateCatalogId: importCatalogId,
                } as any)
              }
              disabled={!importCatalogId || importGlobal.isPending}
            >
              {importGlobal.isPending && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
              Import
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
