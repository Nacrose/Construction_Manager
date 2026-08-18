"use client";

import { use } from "react";
import { trpc } from "@/lib/trpc-client";
import { ReportDesigner } from "@/components/report-designer/report-designer";
import { Skeleton } from "@/components/ui/skeleton";

export default function IpcPdfDesignerPage({
  params,
}: {
  params: Promise<{ id: string; ipcId: string }>;
}) {
  const { id, ipcId } = use(params);

  const { data: projectInfo } = trpc.project.get.useQuery({ id }, { staleTime: 300_000 });
  const { data: ipcData, isLoading } = trpc.ipc.listItems.useQuery({ ipcId });

  if (isLoading || !ipcData || !projectInfo) {
    return (
      <div className="p-8 space-y-4">
        <Skeleton className="h-16" />
        <Skeleton className="h-96" />
      </div>
    );
  }

  return (
    <ReportDesigner
      entityType="ipc"
      entityId={ipcId}
      projectId={id}
      data={{
        ipc: ipcData.ipc,
        items: ipcData.items,
        project: projectInfo.project,
      }}
      backHref={`/projects/${id}/ipc/${ipcId}`}
    />
  );
}
