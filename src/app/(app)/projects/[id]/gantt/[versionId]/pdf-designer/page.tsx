"use client";

import { use, useState, useMemo } from "react";
import { trpc } from "@/lib/trpc-client";
import { ReportDesigner } from "@/components/report-designer/report-designer";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";

export default function SchedulePdfDesignerPage({
  params,
}: {
  params: Promise<{ id: string; versionId: string }>;
}) {
  const { id, versionId } = use(params);

  const { data: projectInfo } = trpc.project.get.useQuery({ id }, { staleTime: 300_000 });
  const { data: versionsData } = trpc.gantt.listVersions.useQuery({ projectId: id });
  const [selectedVersionId, setSelectedVersionId] = useState<string>(versionId);

  const { data: ganttData, isLoading } = trpc.gantt.list.useQuery({
    projectId: id,
    versionId: selectedVersionId,
  });

  const selectedVersion = useMemo(
    () => versionsData?.versions.find(v => v.id === selectedVersionId),
    [versionsData, selectedVersionId]
  );

  if (isLoading || !ganttData || !projectInfo) {
    return (
      <div className="p-8 space-y-4">
        <Skeleton className="h-16" />
        <Skeleton className="h-96" />
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-3.5rem)] flex-col">
      {/* Version picker bar */}
      <div className="shrink-0 border-b bg-card px-4 py-2 flex items-center gap-3">
        <Label className="text-xs text-muted-foreground">Schedule Version:</Label>
        <Select value={selectedVersionId} onValueChange={setSelectedVersionId}>
          <SelectTrigger className="h-8 text-xs w-64"><SelectValue /></SelectTrigger>
          <SelectContent>
            {versionsData?.versions.map(v => (
              <SelectItem key={v.id} value={v.id}>
                {v.name} ({v.scheduleType ?? "PLANNING"})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <ReportDesigner
        entityType="schedule"
        entityId={selectedVersionId}
        projectId={id}
        data={{
          version: {
            ...selectedVersion,
            tasks: ganttData.tasks,
          },
          project: projectInfo.project,
        }}
        backHref={`/projects/${id}/gantt`}
      />
    </div>
  );
}
