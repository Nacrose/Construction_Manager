"use client";

import { use } from "react";
import { trpc } from "@/lib/trpc-client";
import { ReportDesigner } from "@/components/report-designer/report-designer";
import { Skeleton } from "@/components/ui/skeleton";

export default function BoqPdfDesignerPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);

  const { data: projectInfo } = trpc.project.get.useQuery({ id }, { staleTime: 300_000 });
  const { data: boqData, isLoading } = trpc.boq.list.useQuery({ projectId: id });

  if (isLoading || !boqData || !projectInfo) {
    return (
      <div className="p-8 space-y-4">
        <Skeleton className="h-16" />
        <Skeleton className="h-96" />
      </div>
    );
  }

  // For BOQ, entityId is the project ID itself (BOQ is per-project)
  return (
    <ReportDesigner
      entityType="boq"
      entityId={id}
      projectId={id}
      data={{
        project: projectInfo.project,
        items: boqData.items,
        boqLocked: projectInfo.project.boqLocked,
      }}
      backHref={`/projects/${id}/boq`}
    />
  );
}
