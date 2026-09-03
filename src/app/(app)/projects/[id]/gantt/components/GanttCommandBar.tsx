"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Activity, CalendarDays, Download, Eye, FileDown, MoreHorizontal, PanelRight, Play, Plus, Search, Target, Upload } from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { MSPImportButton } from "./MSPImportButton";
import type { ZoomLevel } from "../types";

type Props = {
  id: string; activeTab: string; currentVersion: any; isPlanning: boolean; isExecution: boolean;
  versionsData: any; selectedVersionId?: string; setSelectedVersionId: (value?: string) => void;
  defaultVersion: any; selectedVersion: any; overlayVersionId?: string; setOverlayVersionId: (value?: string) => void;
  zoom: ZoomLevel; handleZoomChange: (zoom: ZoomLevel) => void; zoomScale: number; handleZoomScaleChange: (scale: number) => void;
  showCriticalPath: boolean; setShowCriticalPath: (value: boolean) => void; calculateAll: any; canWrite: boolean;
  showVariance: boolean; setShowVariance: (value: boolean) => void; showConflicts: boolean; setShowConflicts: (value: boolean) => void;
  conflictsData: any; showEVM: boolean; setShowEVM: (value: boolean) => void; taskFilter?: any; setTaskFilter?: any;
  searchQuery: string; setSearchQuery: (value: string) => void; setJumpToTodayTrigger: (updater: (value: number) => number) => void;
  undo: () => void; redo: () => void; canUndo: boolean; canRedo: boolean; taskListVisible: boolean; handleToggleTaskList: () => void;
  inspectorVisible: boolean; handleToggleInspector: () => void; fullScreen: boolean; setFullScreen: (value: boolean) => void;
  setAddTaskTrigger: (updater: (value: number) => number) => void; onOpenTemplates?: () => void; myRole?: string;
  creatingVersion: boolean; setCreatingVersion: (value: boolean) => void; createVersionMutation: any;
};

export function GanttCommandBar(props: Props) {
  const router = useRouter();
  const planningVersions = props.versionsData?.versions?.filter((version: any) => version.scheduleType === "PLANNING") ?? [];
  const executionVersions = props.versionsData?.versions?.filter((version: any) => version.scheduleType === "EXECUTION") ?? [];
  const visibleVersions = props.isExecution ? executionVersions : planningVersions;

  const switchMode = (mode: "PLANNING" | "EXECUTION") => {
    const versions = mode === "PLANNING" ? planningVersions : executionVersions;
    const next = versions.find((version: any) => version.isActive) ?? versions.find((version: any) => version.status === "DRAFT") ?? versions[0];
    if (next) {
      props.setSelectedVersionId(next.id);
      return;
    }
    if (mode === "EXECUTION") {
      const approvedPlanning = planningVersions.find((version: any) => version.status === "APPROVED");
      if (approvedPlanning && !props.creatingVersion) {
        props.setCreatingVersion(true);
        props.createVersionMutation.mutate({
          projectId: props.id,
          name: `Execution — Baseline v${approvedPlanning.versionNumber}`,
          baseVersionId: approvedPlanning.id,
        });
      }
    }
  };

  const addActivity = () => {
    if (props.canWrite) {
      props.setAddTaskTrigger((value) => value + 1);
      return;
    }
    if (!props.myRole || props.creatingVersion) return;
    props.setCreatingVersion(true);
    props.createVersionMutation.mutate({
      projectId: props.id,
      name: props.currentVersion
        ? `Edit v${(props.currentVersion.versionNumber || 0) + 1}`
        : "Draft",
      baseVersionId: props.currentVersion?.id,
    });
  };

  return (
    <div className="flex h-11 shrink-0 items-center gap-1.5 border-b border-border bg-card px-2 text-[10px]">
      <div className="flex h-full shrink-0 items-end gap-0.5 border-r border-border pr-2">
        <span className="border-b-2 border-primary px-2.5 pb-3 font-semibold text-primary">Work Plan</span>
        <Link href={`/projects/${props.id}/look-ahead`} className="border-b-2 border-transparent px-2.5 pb-3 text-muted-foreground hover:text-foreground">Lookahead</Link>
        <Link href={`/projects/${props.id}/workflow/program`} className="border-b-2 border-transparent px-2.5 pb-3 text-muted-foreground hover:text-foreground">Daily Program</Link>
        <Link href={`/projects/${props.id}/workflow/reports`} className="hidden border-b-2 border-transparent px-2.5 pb-3 text-muted-foreground hover:text-foreground xl:block">Progress</Link>
      </div>

      <div className="flex shrink-0 items-center rounded-[4px] border border-border bg-secondary/45 p-0.5">
        <button onClick={() => switchMode("PLANNING")} className={cn("h-6 rounded-[3px] px-2 font-semibold", props.isPlanning ? "bg-card text-primary shadow-sm" : "text-muted-foreground")}>Plan</button>
        <button onClick={() => switchMode("EXECUTION")} className={cn("h-6 rounded-[3px] px-2 font-semibold", props.isExecution ? "bg-card text-primary shadow-sm" : "text-muted-foreground")}>Live</button>
      </div>

      <Select value={props.selectedVersionId || props.defaultVersion?.id || "__none"} onValueChange={(value) => props.setSelectedVersionId(value === props.defaultVersion?.id ? undefined : value)}>
        <SelectTrigger className="h-7 w-[112px] bg-card px-2 text-[10px]"><SelectValue placeholder="Schedule" /></SelectTrigger>
        <SelectContent>{visibleVersions.map((version: any) => <SelectItem key={version.id} value={version.id}>v{version.versionNumber} · {version.name || version.status}</SelectItem>)}</SelectContent>
      </Select>

      <button onClick={addActivity} disabled={!props.myRole || props.creatingVersion} className="snappy-btn flex h-7 shrink-0 items-center gap-1 rounded-[4px] border border-border bg-card px-2 font-medium text-foreground shadow-[0_1px_0_rgba(79,62,45,.18)] disabled:opacity-40"><Plus className="h-3.5 w-3.5" />{props.creatingVersion ? "Creating…" : "Activity"}</button>

      <div className="relative min-w-[90px] max-w-[180px] flex-1">
        <Search className="absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
        <Input value={props.searchQuery} onChange={(event) => props.setSearchQuery(event.target.value)} placeholder="Find activity" className="h-7 bg-background pl-6 text-[10px]" />
      </div>

      <button onClick={props.handleToggleTaskList} className={cn("flex h-7 items-center gap-1 rounded-[4px] border px-2", props.taskListVisible ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-muted-foreground")}><Eye className="h-3.5 w-3.5" />Grid</button>
      <button onClick={props.handleToggleInspector} className={cn("flex h-7 items-center gap-1 rounded-[4px] border px-2", props.inspectorVisible ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-muted-foreground")}><PanelRight className="h-3.5 w-3.5" />Inspector</button>
      <Select value={props.zoom} onValueChange={(value) => props.handleZoomChange(value as ZoomLevel)}><SelectTrigger className="h-7 w-[76px] text-[10px]"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="day">Days</SelectItem><SelectItem value="week">Weeks</SelectItem><SelectItem value="month">Months</SelectItem></SelectContent></Select>

      <DropdownMenu>
        <DropdownMenuTrigger asChild><button className="flex h-7 w-7 items-center justify-center rounded-[4px] border border-border bg-card"><MoreHorizontal className="h-4 w-4" /></button></DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52 text-xs">
          <DropdownMenuLabel className="text-[9px] uppercase tracking-wider text-muted-foreground">Schedule actions</DropdownMenuLabel>
          <DropdownMenuItem onClick={() => props.setJumpToTodayTrigger((value) => value + 1)}><CalendarDays className="mr-2 h-3.5 w-3.5" />Go to today</DropdownMenuItem>
          <DropdownMenuItem onClick={() => props.setShowCriticalPath(!props.showCriticalPath)}><Target className="mr-2 h-3.5 w-3.5" />{props.showCriticalPath ? "Hide" : "Show"} critical path</DropdownMenuItem>
          <DropdownMenuItem disabled={!props.canWrite} onClick={() => props.calculateAll.mutate({ projectId: props.id, versionId: props.selectedVersion?.id })}><Play className="mr-2 h-3.5 w-3.5" />Recalculate CPM</DropdownMenuItem>
          <DropdownMenuItem onClick={props.onOpenTemplates}><Activity className="mr-2 h-3.5 w-3.5" />Work package templates</DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => router.push(`/projects/${props.id}/gantt/pdf-designer`)}><FileDown className="mr-2 h-3.5 w-3.5" />Design PDF</DropdownMenuItem>
          <DropdownMenuItem asChild><a href={`/api/gantt/export-msp?projectId=${props.id}${props.selectedVersionId ? `&versionId=${props.selectedVersionId}` : ""}`} download><Download className="mr-2 h-3.5 w-3.5" />Export MS Project</a></DropdownMenuItem>
          <MSPImportButton projectId={props.id} versionId={props.selectedVersionId} renderTrigger={(open) => <DropdownMenuItem onClick={open}><Upload className="mr-2 h-3.5 w-3.5" />Import MS Project</DropdownMenuItem>} />
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
