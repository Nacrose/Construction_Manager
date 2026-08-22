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

      <div className="space-y-1">
        <h1 className="text-xl font-bold tracking-tight">Resource & Rate Library</h1>
        <p className="text-muted-foreground text-xs">
          Manage project canonical resource specifications and district rate books for BOQ rate analysis.
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-[3px]">
        <TabsList className="bg-muted p-1 rounded-xl h-10 border-none shadow-none flex w-fit">
          <TabsTrigger value="materials" className="gap-2 text-xs font-semibold px-4 py-1.5">
            <BookOpen className="h-4 w-4 text-amber-500" /> Material Catalog
          </TabsTrigger>
          <TabsTrigger value="rate-catalogs" className="gap-2 text-xs font-semibold px-4 py-1.5">
            <Tag className="h-4 w-4 text-blue-500" /> Rate Catalogs
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
