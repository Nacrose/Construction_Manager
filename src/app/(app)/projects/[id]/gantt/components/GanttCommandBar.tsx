"use client";

import { useRouter } from "next/navigation";
import {
  AlertTriangle, CalendarDays, Check, ChevronDown, Cloud, CloudCheck, Download, FileDown,
  GitCompare, Link as LinkIcon, Loader2, PanelRight, Play, Plus,
  Redo2, Search, Sparkles, Table, Target, TrendingUp, Undo2,
  Upload
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { MSPImportButton } from "./MSPImportButton";
import { useUserPreferences } from "@/components/user-preferences-provider";
import type { ZoomLevel, OmniPlanView } from "../types";

type Props = {
  id: string;
  activeView: OmniPlanView;
  onViewChange: (view: OmniPlanView) => void;
  editingMode?: "actual" | "baseline";
  onEditingModeChange?: (mode: "actual" | "baseline") => void;
  activeTab?: string;
  currentVersion: any;
  isPlanning: boolean;
  isExecution: boolean;
  versionsData: any;
  selectedVersionId?: string;
  setSelectedVersionId: (value?: string) => void;
  defaultVersion: any;
  selectedVersion: any;
  overlayVersionId?: string;
  setOverlayVersionId: (value?: string) => void;
  zoom: ZoomLevel;
  handleZoomChange: (zoom: ZoomLevel) => void;
  zoomScale: number;
  handleZoomScaleChange: (scale: number) => void;
  showCriticalPath: boolean;
  setShowCriticalPath: (value: boolean) => void;
  calculateAll: any;
  canWrite: boolean;
  showVariance: boolean;
  setShowVariance: (value: boolean) => void;
  showConflicts: boolean;
  setShowConflicts: (value: boolean) => void;
  conflictsData: any;
  showEVM: boolean;
  setShowEVM: (value: boolean) => void;
  taskFilter?: any;
  setTaskFilter?: any;
  searchQuery: string;
  setSearchQuery: (value: string) => void;
  setJumpToTodayTrigger: (updater: (value: number) => number) => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  taskListVisible: boolean;
  handleToggleTaskList: () => void;
  inspectorVisible: boolean;
  handleToggleInspector: () => void;
  fullScreen: boolean;
  setFullScreen: (value: boolean) => void;
  setAddTaskTrigger: (updater: (value: number) => number) => void;
  onOpenTemplates?: () => void;
  myRole?: string;
  creatingVersion: boolean;
  setCreatingVersion: (value: boolean) => void;
  createVersionMutation: any;
  onFitToProject?: () => void;
  onToggleBaseline?: () => void;
  isBaselineActive?: boolean;
  onCaptureBaseline?: () => void;
  linkMode?: boolean;
  setLinkMode?: (value: boolean) => void;
};

/** OmniPlan Tasks Gantt Icon (Orange badge with summary bracket, task bar, and diamond milestone) */
function OmniPlanTasksIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" className={cn("h-3.5 w-3.5 shrink-0", className)} fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="16" height="16" rx="3.5" fill="#ea580c" />
      {/* Summary Bracket: horizontal bar with downward hooks at ends */}
      <path d="M2.5 5V3.5H13.5V5" stroke="#ffffff" strokeWidth="1.5" strokeLinecap="square" strokeLinejoin="miter" />
      {/* Standard Gantt Bar */}
      <rect x="3.5" y="7" width="6.5" height="2.2" rx="0.7" fill="#ffffff" />
      {/* Milestone Diamond */}
      <polygon points="12,9.5 14,11.5 12,13.5 10,11.5" fill="#ffffff" />
    </svg>
  );
}

/** OmniPlan Network PERT Icon (Green badge with 3 interconnected PERT nodes) */
function OmniPlanNetworkIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" className={cn("h-3.5 w-3.5 shrink-0", className)} fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="16" height="16" rx="3.5" fill="#16a34a" />
      {/* Dependency Link Lines */}
      <path d="M5.5 8H8V4.5H10.5 M8 8V11.5H10.5" stroke="#ffffff" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" opacity="0.85" />
      {/* Node 1 (Source on left) */}
      <rect x="2" y="6" width="3.5" height="4" rx="0.8" fill="#ffffff" />
      {/* Node 2 (Top Right) */}
      <rect x="10.5" y="2.5" width="3.5" height="4" rx="0.8" fill="#ffffff" />
      {/* Node 3 (Bottom Right) */}
      <rect x="10.5" y="9.5" width="3.5" height="4" rx="0.8" fill="#ffffff" />
    </svg>
  );
}

/** OmniPlan Resources Icon (Blue badge with swimlane bars and person silhouette) */
function OmniPlanResourcesIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" className={cn("h-3.5 w-3.5 shrink-0", className)} fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="16" height="16" rx="3.5" fill="#2563eb" />
      {/* User 1 Head & Body */}
      <circle cx="4.2" cy="4.2" r="1.3" fill="#ffffff" />
      <path d="M2.3 8C2.3 6.8 3.1 6.2 4.2 6.2C5.3 6.2 6.1 6.8 6.1 8" stroke="#ffffff" strokeWidth="1" strokeLinecap="round" />
      {/* Task allocation bar for user 1 */}
      <rect x="7.5" y="4.5" width="6" height="2.2" rx="0.7" fill="#ffffff" opacity="0.9" />
      {/* User 2 Head & Body */}
      <circle cx="4.2" cy="10.5" r="1.3" fill="#ffffff" />
      <path d="M2.3 14C2.3 12.8 3.1 12.2 4.2 12.2C5.3 12.2 6.1 12.8 6.1 14" stroke="#ffffff" strokeWidth="1" strokeLinecap="round" />
      {/* Task allocation bar for user 2 */}
      <rect x="7.5" y="10.5" width="4.5" height="2.2" rx="0.7" fill="#ffffff" opacity="0.9" />
    </svg>
  );
}

/** OmniPlan Calendar Icon (Purple badge with calendar binding and work schedule clock) */
function OmniPlanCalendarIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" className={cn("h-3.5 w-3.5 shrink-0", className)} fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="16" height="16" rx="3.5" fill="#9333ea" />
      {/* Calendar body */}
      <rect x="2.5" y="3.5" width="11" height="9.5" rx="1.2" fill="#ffffff" fillOpacity="0.2" stroke="#ffffff" strokeWidth="1" />
      {/* Top spiral/binder loops */}
      <line x1="5" y1="2" x2="5" y2="4.5" stroke="#ffffff" strokeWidth="1.2" strokeLinecap="round" />
      <line x1="11" y1="2" x2="11" y2="4.5" stroke="#ffffff" strokeWidth="1.2" strokeLinecap="round" />
      {/* Calendar header separator */}
      <line x1="2.5" y1="6" x2="13.5" y2="6" stroke="#ffffff" strokeWidth="1" />
      {/* Clock dial in bottom area */}
      <circle cx="8" cy="9.8" r="2.3" stroke="#ffffff" strokeWidth="0.9" fill="#9333ea" />
      <path d="M8 8.4V9.8H9.3" stroke="#ffffff" strokeWidth="0.8" strokeLinecap="round" />
    </svg>
  );
}

/** OmniPlan Styles Icon (Slate badge with artist palette and color swatches) */
function OmniPlanStylesIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" className={cn("h-3.5 w-3.5 shrink-0", className)} fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="16" height="16" rx="3.5" fill="#475569" />
      {/* Artist Palette */}
      <path
        d="M8 2.5C4.96 2.5 2.5 4.74 2.5 7.5C2.5 9.71 4.07 11.58 6.2 12.25C6.72 12.41 7.15 12.06 7.15 11.52C7.15 11.23 7.03 10.97 6.84 10.77C6.63 10.55 6.5 10.25 6.5 9.91C6.5 9.22 7.06 8.66 7.75 8.66H9C11.21 8.66 13 6.87 13 4.66C13 3.47 10.76 2.5 8 2.5Z"
        fill="#ffffff"
      />
      {/* Color Dots on palette */}
      <circle cx="5" cy="5.5" r="0.75" fill="#ea580c" />
      <circle cx="7.2" cy="4.5" r="0.75" fill="#16a34a" />
      <circle cx="9.5" cy="5.2" r="0.75" fill="#2563eb" />
      <circle cx="10.8" cy="7" r="0.6" fill="#eab308" />
    </svg>
  );
}

export function GanttCommandBar(props: Props) {
  const router = useRouter();
  const { saveStateImmediately, isSaving, saveStatus, lastSavedAt } = useUserPreferences();
  const planningVersions = props.versionsData?.versions?.filter((version: any) => version.scheduleType === "PLANNING") ?? [];
  const executionVersions = props.versionsData?.versions?.filter((version: any) => version.scheduleType === "EXECUTION") ?? [];
  const visibleVersions = props.isExecution ? executionVersions : planningVersions;

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
    <div className="flex h-11 shrink-0 items-center justify-between border-b border-border bg-card px-2.5 text-[10px] select-none gap-2 overflow-x-auto no-scrollbar">
      {/* Left side: Perspectives + Mode & Version + History & Save + Authoring */}
      <div className="flex items-center gap-1.5 shrink-0">
        {/* GROUP 1: Perspectives (OmniPlan 5 Views) */}
        <div className="flex items-center gap-0.5 rounded-[5px] border border-border bg-muted/40 p-0.5 shadow-2xs">
          <button
            type="button"
            title="Tasks (Gantt Chart View)"
            onClick={() => props.onViewChange("tasks")}
            className={cn(
              "group flex h-7 w-7 items-center justify-center rounded-[4px] transition-all cursor-pointer",
              props.activeView === "tasks"
                ? "bg-amber-500/20 border border-amber-500/40 shadow-xs ring-1 ring-amber-500/30"
                : "hover:bg-muted/60"
            )}
          >
            <OmniPlanTasksIcon className={cn("h-4 w-4 transition-transform group-hover:scale-110", props.activeView !== "tasks" && "opacity-80 group-hover:opacity-100")} />
          </button>

          <button
            type="button"
            title="Network (PERT Logic Flowchart)"
            onClick={() => props.onViewChange("network")}
            className={cn(
              "group flex h-7 w-7 items-center justify-center rounded-[4px] transition-all cursor-pointer",
              props.activeView === "network"
                ? "bg-emerald-500/20 border border-emerald-500/40 shadow-xs ring-1 ring-emerald-500/30"
                : "hover:bg-muted/60"
            )}
          >
            <OmniPlanNetworkIcon className={cn("h-4 w-4 transition-transform group-hover:scale-110", props.activeView !== "network" && "opacity-80 group-hover:opacity-100")} />
          </button>

          <button
            type="button"
            title="Resources (Allocation Swimlanes)"
            onClick={() => props.onViewChange("resources")}
            className={cn(
              "group flex h-7 w-7 items-center justify-center rounded-[4px] transition-all cursor-pointer",
              props.activeView === "resources"
                ? "bg-blue-500/20 border border-blue-500/40 shadow-xs ring-1 ring-blue-500/30"
                : "hover:bg-muted/60"
            )}
          >
            <OmniPlanResourcesIcon className={cn("h-4 w-4 transition-transform group-hover:scale-110", props.activeView !== "resources" && "opacity-80 group-hover:opacity-100")} />
          </button>

          <button
            type="button"
            title="Calendar (Work Week Shifts & Exceptions)"
            onClick={() => props.onViewChange("calendar")}
            className={cn(
              "group flex h-7 w-7 items-center justify-center rounded-[4px] transition-all cursor-pointer",
              props.activeView === "calendar"
                ? "bg-purple-500/20 border border-purple-500/40 shadow-xs ring-1 ring-purple-500/30"
                : "hover:bg-muted/60"
            )}
          >
            <OmniPlanCalendarIcon className={cn("h-4 w-4 transition-transform group-hover:scale-110", props.activeView !== "calendar" && "opacity-80 group-hover:opacity-100")} />
          </button>

          <button
            type="button"
            title="Styles (Appearance & Color Themes)"
            onClick={() => props.onViewChange("styles")}
            className={cn(
              "group flex h-7 w-7 items-center justify-center rounded-[4px] transition-all cursor-pointer",
              props.activeView === "styles"
                ? "bg-slate-500/20 border border-slate-500/40 shadow-xs ring-1 ring-slate-500/30"
                : "hover:bg-muted/60"
            )}
          >
            <OmniPlanStylesIcon className={cn("h-4 w-4 transition-transform group-hover:scale-110", props.activeView !== "styles" && "opacity-80 group-hover:opacity-100")} />
          </button>
        </div>

        <div className="h-4 w-px bg-border/80 mx-0.5" />

        {/* GROUP 2: Mode & Schedule Version Selector */}
        <div className="flex items-center gap-1">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="flex h-7 items-center gap-0.5 rounded border border-border bg-card px-1.5 font-semibold text-foreground shadow-2xs hover:bg-muted/50 cursor-pointer text-[9.5px]"
              >
                <span className="text-muted-foreground">Editing:</span>
                <span className="font-bold text-primary">
                  {props.editingMode === "baseline" ? "Baseline" : "Actual"}
                </span>
                <ChevronDown className="h-2.5 w-2.5 text-muted-foreground" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-56 text-xs">
              <DropdownMenuLabel className="text-[9px] uppercase tracking-wider text-muted-foreground">
                Schedule Mode
              </DropdownMenuLabel>
              <DropdownMenuItem
                onClick={() => {
                  props.onEditingModeChange?.("actual");
                }}
                className="flex items-center justify-between"
              >
                <span>Actual (Live Progress)</span>
                {props.editingMode !== "baseline" && <Check className="h-3.5 w-3.5 text-primary" />}
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => {
                  props.onEditingModeChange?.("baseline");
                }}
                className="flex items-center justify-between"
              >
                <span>Baseline (Contract Target)</span>
                {props.editingMode === "baseline" && <Check className="h-3.5 w-3.5 text-primary" />}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={props.onToggleBaseline}
                className="flex items-center justify-between"
              >
                <div className="flex items-center gap-1.5">
                  <GitCompare className="h-3.5 w-3.5 text-muted-foreground" />
                  <span>Show Baseline Ghost Overlay</span>
                </div>
                {(props.overlayVersionId || props.isBaselineActive) && <Check className="h-3.5 w-3.5 text-primary" />}
              </DropdownMenuItem>
              {props.onCaptureBaseline && (
                <DropdownMenuItem
                  onClick={props.onCaptureBaseline}
                  className="flex items-center gap-1.5"
                >
                  <Target className="h-3.5 w-3.5 text-emerald-600" />
                  <span>Capture Schedule as Baseline</span>
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>

          <Select
            value={props.selectedVersionId || props.defaultVersion?.id || "__none"}
            onValueChange={(value) => props.setSelectedVersionId(value === props.defaultVersion?.id ? undefined : value)}
          >
            <SelectTrigger className="h-7 w-[95px] bg-card px-1.5 text-[9.5px]">
              <SelectValue placeholder="Schedule" />
            </SelectTrigger>
            <SelectContent>
              {visibleVersions.map((version: any) => (
                <SelectItem key={version.id} value={version.id}>
                  v{version.versionNumber} · {version.name || version.status}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="h-4 w-px bg-border/80 mx-0.5" />

        {/* GROUP 3: History & Ambient Cloud Auto-Save Status */}
        <div className="flex items-center gap-0.5 rounded-[5px] border border-border bg-card p-0.5 shadow-2xs">
          <button
            type="button"
            onClick={props.undo}
            disabled={!props.canUndo}
            className="flex h-6 w-6 items-center justify-center rounded-[3px] text-muted-foreground hover:text-foreground hover:bg-muted/60 disabled:opacity-30 disabled:pointer-events-none cursor-pointer transition-colors"
            title="Undo action (⌘Z)"
          >
            <Undo2 className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={props.redo}
            disabled={!props.canRedo}
            className="flex h-6 w-6 items-center justify-center rounded-[3px] text-muted-foreground hover:text-foreground hover:bg-muted/60 disabled:opacity-30 disabled:pointer-events-none cursor-pointer transition-colors"
            title="Redo action (⌘⇧Z)"
          >
            <Redo2 className="h-3.5 w-3.5" />
          </button>
          <div className="h-3 w-px bg-border/70 mx-0.5" />
          <button
            type="button"
            onClick={saveStateImmediately}
            disabled={isSaving}
            className={cn(
              "flex h-6 w-6 items-center justify-center rounded-[3px] transition-colors cursor-pointer",
              saveStatus === "saving"
                ? "bg-primary/10 text-primary"
                : saveStatus === "saved"
                ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                : saveStatus === "error"
                ? "bg-rose-500/15 text-rose-600"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
            )}
            title={
              saveStatus === "saving"
                ? "Auto-saving workspace layouts & preferences to cloud profile…"
                : saveStatus === "saved"
                ? `All preferences auto-saved per user across devices${lastSavedAt ? ` (${lastSavedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })})` : ""}`
                : saveStatus === "error"
                ? "Auto-save failed — click to retry syncing"
                : "Cloud synced per user across devices (click to sync immediately)"
            }
          >
            {saveStatus === "saving" ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
            ) : saveStatus === "saved" ? (
              <CloudCheck className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
            ) : (
              <Cloud className="h-3.5 w-3.5" />
            )}
          </button>
        </div>

        <div className="h-4 w-px bg-border/80 mx-0.5" />

        {/* GROUP 4: Authoring & Computation */}
        <div className="flex items-center gap-1">
          {/* + Add Activity */}
          <button
            onClick={addActivity}
            disabled={!props.myRole || props.creatingVersion}
            className="snappy-btn flex h-7 w-7 shrink-0 items-center justify-center rounded-[4px] border border-border bg-card text-foreground shadow-2xs hover:bg-muted/40 disabled:opacity-40 cursor-pointer"
            title={props.creatingVersion ? "Creating Activity…" : "Add Activity (+)"}
          >
            <Plus className="h-3.5 w-3.5 text-emerald-600" />
          </button>

          {/* Link Mode */}
          <button
            type="button"
            onClick={() => props.setLinkMode?.(!props.linkMode)}
            className={cn(
              "flex h-7 w-7 items-center justify-center rounded-[4px] border transition-colors cursor-pointer",
              props.linkMode
                ? "border-primary bg-primary text-primary-foreground shadow-xs"
                : "border-border bg-card text-muted-foreground hover:text-foreground"
            )}
            title="Drag-to-Link / Click-to-Link mode"
          >
            <LinkIcon className="h-3.5 w-3.5" />
          </button>

          {/* Recalculate CPM */}
          <button
            type="button"
            disabled={!props.canWrite || props.calculateAll?.isPending}
            onClick={() => props.calculateAll.mutate({ projectId: props.id, versionId: props.selectedVersion?.id })}
            className="snappy-btn flex h-7 w-7 shrink-0 items-center justify-center rounded-[4px] border border-border bg-card text-muted-foreground hover:text-foreground shadow-2xs hover:bg-muted/40 disabled:opacity-40 cursor-pointer"
            title="Recalculate Critical Path Method (CPM)"
          >
            {props.calculateAll?.isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
            ) : (
              <Play className="h-3.5 w-3.5 text-emerald-600" />
            )}
          </button>

          {/* Work Package Templates */}
          <button
            type="button"
            onClick={props.onOpenTemplates}
            className="snappy-btn flex h-7 w-7 shrink-0 items-center justify-center rounded-[4px] border border-border bg-card text-muted-foreground hover:text-foreground shadow-2xs hover:bg-muted/40 cursor-pointer"
            title="Work Package Templates"
          >
            <Sparkles className="h-3.5 w-3.5 text-amber-500" />
          </button>
        </div>
      </div>

      {/* Right side: Diagnostics + Navigation + Scale + Exchange */}
      <div className="flex items-center gap-1.5 shrink-0">
        {/* GROUP 5: Diagnostics & Analysis Indicators */}
        <div className="flex items-center gap-1">
          {/* Critical Path Toggle */}
          <button
            type="button"
            onClick={() => props.setShowCriticalPath(!props.showCriticalPath)}
            className={cn(
              "snappy-btn flex h-7 w-7 shrink-0 items-center justify-center rounded-[4px] border transition-colors cursor-pointer",
              props.showCriticalPath
                ? "border-rose-500 bg-rose-500 text-white shadow-xs"
                : "border-border bg-card text-muted-foreground hover:text-foreground"
            )}
            title={props.showCriticalPath ? "Hide Critical Path" : "Highlight Critical Path"}
          >
            <Target className="h-3.5 w-3.5" />
          </button>

          {/* Earned Value EVM */}
          <button
            type="button"
            onClick={() => props.setShowEVM(!props.showEVM)}
            className={cn(
              "snappy-btn flex h-7 w-7 shrink-0 items-center justify-center rounded-[4px] border transition-colors cursor-pointer",
              props.showEVM
                ? "border-blue-500 bg-blue-500 text-white shadow-xs"
                : "border-border bg-card text-muted-foreground hover:text-foreground"
            )}
            title={props.showEVM ? "Hide Earned Value (EVM)" : "Earned Value Analysis (EVM S-Curve)"}
          >
            <TrendingUp className="h-3.5 w-3.5" />
          </button>

          {/* Resource Leveling Conflicts */}
          <button
            type="button"
            onClick={() => props.setShowConflicts(!props.showConflicts)}
            className={cn(
              "snappy-btn flex h-7 w-7 shrink-0 items-center justify-center rounded-[4px] border transition-colors cursor-pointer",
              props.showConflicts
                ? "border-amber-500 bg-amber-500 text-white shadow-xs"
                : "border-border bg-card text-muted-foreground hover:text-foreground"
            )}
            title={props.showConflicts ? "Hide Resource Conflicts" : "Resource Leveling & Allocation Conflicts"}
          >
            <AlertTriangle className="h-3.5 w-3.5" />
          </button>

          {/* Variance (Execution Mode) */}
          <button
            type="button"
            disabled={!props.isExecution}
            onClick={() => props.setShowVariance(!props.showVariance)}
            className={cn(
              "snappy-btn flex h-7 w-7 shrink-0 items-center justify-center rounded-[4px] border transition-colors cursor-pointer disabled:opacity-30",
              props.showVariance
                ? "border-emerald-600 bg-emerald-600 text-white shadow-xs"
                : "border-border bg-card text-muted-foreground hover:text-foreground"
            )}
            title={props.showVariance ? "Hide Variance" : "Schedule Variance Analysis"}
          >
            <GitCompare className="h-3.5 w-3.5" />
          </button>
        </div>

        <div className="h-4 w-px bg-border/80 mx-0.5" />

        {/* GROUP 6: Navigation, Search & Layout Panels */}
        <div className="flex items-center gap-1">
          {/* Go to Today */}
          <button
            type="button"
            onClick={() => props.setJumpToTodayTrigger((value) => value + 1)}
            className="snappy-btn flex h-7 w-7 shrink-0 items-center justify-center rounded-[4px] border border-border bg-card text-muted-foreground hover:text-foreground shadow-2xs cursor-pointer"
            title="Jump Timeline to Today"
          >
            <CalendarDays className="h-3.5 w-3.5" />
          </button>

          {/* Search Input */}
          <div className="relative w-28 min-w-[75px] max-w-[120px]">
            <Search className="absolute left-1.5 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={props.searchQuery}
              onChange={(event) => props.setSearchQuery(event.target.value)}
              placeholder="Find…"
              className="h-7 bg-background pl-5 pr-1 text-[9.5px]"
            />
          </div>

          {/* Outline Grid Toggle */}
          <button
            onClick={props.handleToggleTaskList}
            className={cn(
              "flex h-7 w-7 items-center justify-center rounded-[4px] border transition-colors cursor-pointer",
              props.taskListVisible ? "border-primary bg-primary text-primary-foreground shadow-xs" : "border-border bg-card text-muted-foreground hover:text-foreground"
            )}
            title={props.taskListVisible ? "Hide Activity Grid Outline" : "Show Activity Grid Outline"}
          >
            <Table className="h-3.5 w-3.5" />
          </button>

          {/* Inspector Toggle */}
          <button
            onClick={props.handleToggleInspector}
            className={cn(
              "flex h-7 w-7 items-center justify-center rounded-[4px] border transition-colors cursor-pointer",
              props.inspectorVisible ? "border-primary bg-primary text-primary-foreground shadow-xs" : "border-border bg-card text-muted-foreground hover:text-foreground"
            )}
            title={props.inspectorVisible ? "Hide Task Inspector" : "Show Task Inspector"}
          >
            <PanelRight className="h-3.5 w-3.5" />
          </button>
        </div>

        <div className="h-4 w-px bg-border/80 mx-0.5" />

        {/* GROUP 7: Timeline Scale & Granular Zoom (Compact 2-Row Cluster, Width ~72px) */}
        <div className="flex items-center gap-1">
          <div
            className="flex flex-col items-center justify-center rounded-[4px] border border-border bg-muted/40 p-0.5 shadow-2xs"
            title="Timeline scale (Top: Day/Week/Month, Subtitle: Zoom Out / 100% / Zoom In)"
          >
            {/* Top row: Macro time units D | W | M */}
            <div className="flex items-center">
              {(["day", "week", "month"] as ZoomLevel[]).map((z) => (
                <button
                  key={z}
                  type="button"
                  onClick={() => props.handleZoomChange(z)}
                  className={cn(
                    "h-3.5 w-6 rounded-[2px] text-[9px] font-bold leading-none cursor-pointer transition-colors flex items-center justify-center",
                    props.zoom === z
                      ? "bg-card text-primary shadow-xs"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                  title={`View by ${z === "day" ? "Days" : z === "week" ? "Weeks" : "Months"}`}
                >
                  {z === "day" ? "D" : z === "week" ? "W" : "M"}
                </button>
              ))}
            </div>

            {/* Subtitle row: Granular zoom [-] [100%] [+] */}
            <div className="flex items-center border-t border-border/50 pt-0.5 mt-0.5 text-muted-foreground">
              {/* Zoom Out (-) */}
              <button
                type="button"
                onClick={() =>
                  props.handleZoomScaleChange(
                    Math.max(0.2, Number((props.zoomScale - 0.15).toFixed(2)))
                  )
                }
                className="h-3 w-6 flex items-center justify-center rounded-[2px] hover:bg-card hover:text-foreground text-[9px] font-bold leading-none cursor-pointer transition-colors"
                title="Granular Zoom Out (-)"
              >
                -
              </button>

              {/* Reset to 100% */}
              <button
                type="button"
                onClick={() => props.handleZoomScaleChange(1.0)}
                className="h-3 w-6 flex items-center justify-center rounded-[2px] hover:bg-card hover:text-foreground text-[7.5px] font-mono font-semibold leading-none cursor-pointer transition-colors"
                title="Reset zoom to 100%"
              >
                {Math.round(props.zoomScale * 100)}%
              </button>

              {/* Zoom In (+) */}
              <button
                type="button"
                onClick={() =>
                  props.handleZoomScaleChange(
                    Math.min(5.0, Number((props.zoomScale + 0.15).toFixed(2)))
                  )
                }
                className="h-3 w-6 flex items-center justify-center rounded-[2px] hover:bg-card hover:text-foreground text-[9px] font-bold leading-none cursor-pointer transition-colors"
                title="Granular Zoom In (+)"
              >
                +
              </button>
            </div>
          </div>

          {/* Baseline Ghost Overlay Toggle */}
          <button
            type="button"
            onClick={props.onToggleBaseline}
            className={cn(
              "flex h-7 items-center gap-1 rounded-[4px] border px-1.5 text-[9.5px] font-semibold transition-colors cursor-pointer",
              (props.overlayVersionId || props.isBaselineActive)
                ? "border-primary bg-primary text-primary-foreground shadow-xs"
                : "border-border bg-card text-muted-foreground hover:text-foreground"
            )}
            title={(props.overlayVersionId || props.isBaselineActive) ? "Hide Baseline Overlay" : "Overlay Baseline Ghost Bars"}
          >
            <GitCompare className="h-3 w-3" />
            <span>Base</span>
          </button>
        </div>

        <div className="h-4 w-px bg-border/80 mx-0.5" />

        {/* GROUP 8: Exchange & Export (PDF, MSP Export, MSP Import) */}
        <div className="flex items-center gap-1">
          {/* Design PDF */}
          <button
            type="button"
            onClick={() => router.push(`/projects/${props.id}/gantt/pdf-designer`)}
            className="snappy-btn flex h-7 w-7 shrink-0 items-center justify-center rounded-[4px] border border-border bg-card text-muted-foreground hover:text-foreground shadow-2xs hover:bg-muted/40 cursor-pointer"
            title="Design & Print PDF Schedule"
          >
            <FileDown className="h-3.5 w-3.5 text-rose-500" />
          </button>

          {/* Export MS Project */}
          <a
            href={`/api/gantt/export-msp?projectId=${props.id}${props.selectedVersionId ? `&versionId=${props.selectedVersionId}` : ""}`}
            download
            className="snappy-btn flex h-7 w-7 shrink-0 items-center justify-center rounded-[4px] border border-border bg-card text-muted-foreground hover:text-foreground shadow-2xs hover:bg-muted/40 cursor-pointer"
            title="Export to MS Project (.xml)"
          >
            <Download className="h-3.5 w-3.5" />
          </a>

          {/* Import MS Project */}
          <MSPImportButton
            projectId={props.id}
            versionId={props.selectedVersionId}
            renderTrigger={(open) => (
              <button
                type="button"
                onClick={open}
                className="snappy-btn flex h-7 w-7 shrink-0 items-center justify-center rounded-[4px] border border-border bg-card text-muted-foreground hover:text-foreground shadow-2xs hover:bg-muted/40 cursor-pointer"
                title="Import from MS Project (.mpp / .xml)"
              >
                <Upload className="h-3.5 w-3.5" />
              </button>
            )}
          />
        </div>
      </div>
    </div>
  );
}
