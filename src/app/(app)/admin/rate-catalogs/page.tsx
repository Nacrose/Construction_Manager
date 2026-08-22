"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc-client";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BookOpen, Tag, Layers } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import AdminMaterialCatalogPage from "../material-catalog/page";
import { CatalogRatesLibrary } from "@/app/(app)/projects/[id]/boq/components/catalog-rates-library";
import { UncatalogedReviewTab } from "../material-catalog/components/uncataloged-review-tab";

export function AdminUncatalogedBadge() {
  const { data } = trpc.uncatalogedMaterial.stats.useQuery({ level: "global" });
  if (!data?.pending) return null;
  return (
    <span className="ml-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-amber-500 px-1 text-[9px] font-bold text-white">
      {data.pending > 99 ? "99+" : data.pending}
    </span>
  );
}

export default function AdminGlobalCatalogsPage() {
  const [activeTab, setActiveTab] = useState("materials");

  return (
    <div className="space-y-[3px]">
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-[3px]">
        <TabsList className="bg-muted p-1 rounded-xl h-10 border-none shadow-none flex w-fit">
          <TabsTrigger value="materials" className="gap-2 text-xs font-semibold px-4 py-1.5">
            <BookOpen className="h-4 w-4 text-amber-500" /> Material Catalog
          </TabsTrigger>
          <TabsTrigger value="rate-catalogs" className="gap-2 text-xs font-semibold px-4 py-1.5">
            <Tag className="h-4 w-4 text-blue-500" /> Rate Catalogs
          </TabsTrigger>
          <TabsTrigger value="uncataloged" className="gap-2 text-xs font-semibold px-4 py-1.5 relative">
            <Layers className="h-4 w-4 text-purple-500" /> Uncataloged Materials
            <AdminUncatalogedBadge />
          </TabsTrigger>
        </TabsList>

        <TabsContent value="materials" className="mt-[3px] space-y-[3px]">
          <AdminMaterialCatalogPage />
        </TabsContent>

        <TabsContent value="rate-catalogs" className="mt-[3px] space-y-[3px]">
          <CatalogRatesLibrary canWrite={true} scope="global" />
        </TabsContent>

        <TabsContent value="uncataloged" className="mt-[3px] space-y-[3px]">
          <UncatalogedReviewTab level="global" />
        </TabsContent>
      </Tabs>
    </div>
  );
}
