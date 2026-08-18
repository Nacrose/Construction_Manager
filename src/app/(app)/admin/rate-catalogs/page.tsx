"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc-client";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Database, BookOpen, Tag, Plus, Globe } from "lucide-react";
import AdminMaterialCatalogPage from "../material-catalog/page";
import { CatalogRatesLibrary } from "@/app/(app)/projects/[id]/boq/components/catalog-rates-library";

export default function AdminGlobalCatalogsPage() {
  const [activeTab, setActiveTab] = useState("materials");

  return (
    <div className="space-y-[3px]">
      {/* Tabs Navigation */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-[3px]">
        <TabsList className="bg-muted p-1 rounded-xl h-10 border-none shadow-none">
          <TabsTrigger value="materials" className="gap-2 text-xs font-semibold px-4 py-1.5">
            <BookOpen className="h-4 w-4 text-amber-500" /> Global Material Catalog
          </TabsTrigger>
          <TabsTrigger value="rate-catalogs" className="gap-2 text-xs font-semibold px-4 py-1.5">
            <Tag className="h-4 w-4 text-blue-500" /> Global Rate Catalogs
          </TabsTrigger>
        </TabsList>

        {/* Tab 1: Global Material Catalog (3-Level WBS Tree with Roads & Hydropower) */}
        <TabsContent value="materials" className="mt-[3px] space-y-[3px]">
          <AdminMaterialCatalogPage />
        </TabsContent>

        {/* Tab 2: Global Rate Catalogs (Red Badge, Active Location Selector, District Comparison Matrix, Manage Districts Modal) */}
        <TabsContent value="rate-catalogs" className="mt-[3px] space-y-[3px]">
          <CatalogRatesLibrary canWrite={true} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
