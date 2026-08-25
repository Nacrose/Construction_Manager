"use client";

import { use } from "react";
import { trpc } from "@/lib/trpc-client";
import { ReportDesigner } from "@/components/report-designer/report-designer";
import { Skeleton } from "@/components/ui/skeleton";

export default function RfiPdfDesignerPage({
  params,
}: {
  params: Promise<{ id: string; rfiId: string }>;
}) {
  const { id, rfiId } = use(params);

  const { data: rfiData, isLoading } = trpc.workflow.rfi.get.useQuery({ id: rfiId });
  const { data: projectInfo } = trpc.project.get.useQuery({ id }, { staleTime: 300_000 });

  if (isLoading || !rfiData) {
    return (
      <div className="p-8 space-y-4">
        <Skeleton className="h-16" />
        <Skeleton className="h-96" />
      </div>
    );
  }

  return (
    <ReportDesigner
      entityType="rfi"
      entityId={rfiId}
      projectId={id}
      data={rfiData}
      backHref={`/projects/${id}/workflow/rfi`}
    />
  );
}
