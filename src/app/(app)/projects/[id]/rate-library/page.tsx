"use client";

import { use, useState } from "react";
import { AnimatedPage } from "@/components/ui/animated-page";
import { ModuleTabs } from "@/components/module-tabs";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BookOpen, Tag } from "lucide-react";
import { trpc } from "@/lib/trpc-client";
import AdminMaterialCatalogPage from "@/app/(app)/admin/material-catalog/page";
import { CatalogRatesLibrary } from "../boq/components/catalog-rates-library";

const RES_TABS = [
  { label: "Materials & Procurement", href: "/materials" },
  { label: "Resource & Rate Library", href: "/rate-library" },
  { label: "Equipment & Fleet", href: "/equipment" },
  { label: "Plant & Production", href: "/production" },
  { label: "Subcontractors", href: "/subcontractors" },
  { label: "HR / Staff", href: "/hr" },
  { label: "Vendors Directory", href: "/vendors" },
];

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
      <ModuleTabs projectId={id} tabs={RES_TABS} />

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-[3px]">
        <TabsList className="bg-[#121820] border border-white/10 p-1 rounded-xl h-10 flex w-fit">
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
