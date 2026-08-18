"use client";

import { use } from "react";
import { trpc } from "@/lib/trpc-client";
import { ReportDesigner } from "@/components/report-designer/report-designer";
import { Skeleton } from "@/components/ui/skeleton";

export default function PdfDesignerPage({
  params,
}: {
  params: Promise<{ id: string; reportId: string }>;
}) {
  const { id, reportId } = use(params);

  const { data: reportData, isLoading } = trpc.workflow.dailyReport.getReport.useQuery({ reportId });
  const { data: projectInfo } = trpc.project.get.useQuery({ id }, { staleTime: 300_000 });

  if (isLoading || !reportData) {
    return (
      <div className="p-8 space-y-4">
        <Skeleton className="h-16" />
        <Skeleton className="h-96" />
      </div>
    );
  }

  return (
    <ReportDesigner
      entityType="daily_report"
      entityId={reportId}
      projectId={id}
      data={reportData}
      backHref={`/projects/${id}/workflow/reports/${reportId}`}
    />
  );
}
