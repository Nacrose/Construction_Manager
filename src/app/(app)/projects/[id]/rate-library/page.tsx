"use client";

import { use } from "react";
import { AnimatedPage } from "@/components/ui/animated-page";
import { trpc } from "@/lib/trpc-client";
import { CatalogRatesLibrary } from "../boq/components/catalog-rates-library";

export default function RateLibraryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data } = trpc.project.get.useQuery({ id });
  const canWrite = data?.myRole && data.myRole !== "client" && data.myRole !== "inspector";

  return (
    <AnimatedPage className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Rate Library</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Manage rate catalog items used across this project&apos;s BOQ analysis.
        </p>
      </div>
      <CatalogRatesLibrary projectId={id} canWrite={!!canWrite} />
    </AnimatedPage>
  );
}
