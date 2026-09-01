"use client";

import { use, useState } from "react";
import { AnimatedPage } from "@/components/ui/animated-page";
import { ModuleTabs } from "@/components/module-tabs";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BookOpen, Tag } from "lucide-react";
import { trpc } from "@/lib/trpc-client";
import AdminMaterialCatalogPage from "@/app/(app)/admin/material-catalog/page";
import { CatalogRatesLibrary } from "../boq/components/catalog-rates-library";


export default function RateLibraryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data } = trpc.project.get.useQuery({ id });
  const canWrite = Boolean(
    data?.myRole && data.myRole !== "client" && data.myRole !== "inspector"
  );
  const [activeTab, setActiveTab] = useState("materials");

  return (
    <AnimatedPage className="space-y-4 pb-8">
      {/* Sub-module Navigation */}
      <ModuleTabs projectId={id} cluster="resources" />

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-[3px]">
        <TabsList className="bg-[#f8fbfe] border border-[#c7d8e8] p-1 rounded-xl h-10 flex w-fit">
          <TabsTrigger value="materials" className="gap-2 text-xs font-semibold px-4 py-1.5 data-[state=active]:bg-amber-500 data-[state=active]:text-black">
            <BookOpen className="h-4 w-4" /> Material Catalog
          </TabsTrigger>
          <TabsTrigger value="rate-catalogs" className="gap-2 text-xs font-semibold px-4 py-1.5 data-[state=active]:bg-amber-500 data-[state=active]:text-black">
            <Tag className="h-4 w-4" /> Rate Catalogs
          </TabsTrigger>
        </TabsList>

        <TabsContent value="materials" className="pt-2">
          <AdminMaterialCatalogPage projectId={id} isProjectScoped={true} />
        </TabsContent>

        <TabsContent value="rate-catalogs" className="pt-2">
          <CatalogRatesLibrary projectId={id} canWrite={canWrite} />
        </TabsContent>
      </Tabs>
    </AnimatedPage>
  );
}
