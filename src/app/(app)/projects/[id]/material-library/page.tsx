"use client";

import { use } from "react";
import { AnimatedPage } from "@/components/ui/animated-page";
import AdminMaterialCatalogPage from "@/app/(app)/admin/material-catalog/page";

export default function MaterialLibraryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);

  return (
    <AnimatedPage className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Project Material Library</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Project material inventory and specifications linked to Organization Material Catalog.
        </p>
      </div>
      <AdminMaterialCatalogPage projectId={id} isProjectScoped={true} />
    </AnimatedPage>
  );
}
