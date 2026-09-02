"use client";

import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Undo2,
  Redo2,
  Search,
  Maximize2,
  Minimize2,
  PanelLeft,
  PanelRight,
  Play,
  Plus,
  X,
  Loader2,
  Printer,
  Download,
  Upload,
  ChevronDown,
  Sparkles,
  Layers,
  Activity,
  AlertTriangle,
  Calendar,
  Zap,
  TrendingUp,
  Clock,
  Share2,
} from "lucide-react";
import type { ZoomLevel } from "../types";
import { MSPImportButton } from "./MSPImportButton";

export function GanttCommandBar({
  id,
  activeTab,
  currentVersion,
  isPlanning,
  isExecution,
  versionsData,
  selectedVersionId,
  setSelectedVersionId,
  defaultVersion,
  selectedVersion,
  overlayVersionId,
  setOverlayVersionId,
  zoom,
  handleZoomChange,
  zoomScale,
  handleZoomScaleChange,
  showCriticalPath,
  setShowCriticalPath,
  calculateAll,
  canWrite,
  showVariance,
  setShowVariance,
  showConflicts,
  setShowConflicts,
  conflictsData,
  showEVM,
  setShowEVM,
  taskFilter,
  setTaskFilter,
  searchQuery,
  setSearchQuery,
  setJumpToTodayTrigger,
  undo,
  redo,
  canUndo,
  canRedo,
  taskListVisible,
  handleToggleTaskList,
  inspectorVisible,
  handleToggleInspector,
  fullScreen,
  setFullScreen,
  setAddTaskTrigger,
  onOpenTemplates,
  myRole,
  creatingVersion,
  setCreatingVersion,
  createVersionMutation,
}: {
  id: string;
  activeTab: string;
  currentVersion: any;
  isPlanning: boolean;
  isExecution: boolean;
  versionsData: any;
  selectedVersionId?: string;
  setSelectedVersionId: (val?: string) => void;
  defaultVersion: any;
  selectedVersion: any;
  overlayVersionId?: string;
  setOverlayVersionId: (val?: string) => void;
  zoom: ZoomLevel;
  handleZoomChange: (zoom: ZoomLevel) => void;
  zoomScale: number;
  handleZoomScaleChange: (scale: number) => void;
  showCriticalPath: boolean;
  setShowCriticalPath: (val: boolean) => void;
  calculateAll: any;
  canWrite: boolean;
  showVariance: boolean;
  setShowVariance: (val: boolean) => void;
  showConflicts: boolean;
  setShowConflicts: (val: boolean) => void;
  conflictsData: any;
  showEVM: boolean;
  setShowEVM: (val: boolean) => void;
  taskFilter?: "all" | "critical" | "in_progress" | "delayed" | "completed";
  setTaskFilter?: (val: "all" | "critical" | "in_progress" | "delayed" | "completed") => void;
  searchQuery: string;
  setSearchQuery: (val: string) => void;
  setJumpToTodayTrigger: (updater: (n: number) => number) => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  taskListVisible: boolean;
  handleToggleTaskList: () => void;
  inspectorVisible: boolean;
  handleToggleInspector: () => void;
  fullScreen: boolean;
  setFullScreen: (val: boolean) => void;
  setAddTaskTrigger: (updater: (n: number) => number) => void;
  onOpenTemplates?: () => void;
  myRole: string | undefined;
  creatingVersion: boolean;
  setCreatingVersion: (val: boolean) => void;
  createVersionMutation: any;
}) {
  const router = useRouter();

  const planningVersions =
    versionsData?.versions?.filter((v: any) => v.scheduleType === "PLANNING") || [];
  const executionVersions =
    versionsData?.versions?.filter((v: any) => v.scheduleType === "EXECUTION") || [];

  function handleSwitchMode(targetMode: "PLANNING" | "EXECUTION") {
    if (targetMode === "PLANNING") {
      const activePlanning =
        planningVersions.find((v: any) => v.isActive) ||
        planningVersions.find((v: any) => v.status === "DRAFT") ||
        planningVersions[0];
      if (activePlanning) {
        setSelectedVersionId(activePlanning.id);
      }
    } else {
      const activeExec =
        executionVersions.find((v: any) => v.isActive) || executionVersions[0];
      if (activeExec) {
        setSelectedVersionId(activeExec.id);
      } else {
        const approvedPlanning = planningVersions.find((v: any) => v.status === "APPROVED");
        if (approvedPlanning && !creatingVersion) {
          setCreatingVersion(true);
          createVersionMutation.mutate({
            projectId: id,
            name: `Execution — Baseline v${approvedPlanning.versionNumber}`,
            baseVersionId: approvedPlanning.id,
          });
        }
      }
    }
  }

  function versionLabel(v: { versionNumber: number; name?: string | null; scheduleType?: string }) {
    const prefix = v.scheduleType === "EXECUTION" ? "EXEC " : "";
    return `${prefix}v${v.versionNumber}${v.name ? `: ${v.name}` : ""}`;
  }

  function statusBadge(status: string) {
    const colors: Record<string, string> = {
      DRAFT: "text-amber-400 bg-amber-500/10 border-amber-500/30",
      APPROVED: "text-emerald-400 bg-emerald-500/10 border-emerald-500/30",
      ARCHIVED: "text-muted-foreground bg-muted/30 border-border/40",
    };
    return (
      <span
        className={cn(
          "text-[9px] font-mono font-bold px-1.5 py-0.5 rounded border uppercase shrink-0",
          colors[status] || colors.ARCHIVED
        )}
      >
        {status}
      </span>
    );
  }

  const activeAnalysisCount =
    (showConflicts ? 1 : 0) + (showVariance ? 1 : 0) + (showEVM ? 1 : 0);

  return (
    <div className="shrink-0 flex items-center justify-between gap-1.5 px-2.5 h-9 border border-border/90 rounded-lg bg-[var(--navy-deep)]/95 backdrop-blur-md z-15 font-mono text-[11px] shadow-2xs select-none">
      {/* ── LEFT SECTION: Mode, Version & Overlay ────────────────────────── */}
      <div className="flex items-center gap-1.5 shrink-0">
        {/* Mode Switcher Pill */}
        <div className="flex items-center rounded-md border border-border/80 bg-background/90 p-0.5 shadow-2xs">
          <button
            type="button"
            onClick={() => handleSwitchMode("PLANNING")}
            className={cn(
              "flex items-center gap-1 px-2 h-6 rounded text-[10px] font-mono uppercase font-bold transition-all cursor-pointer",
              isPlanning
                ? "bg-primary/20 text-primary border border-primary/40 shadow-2xs"
                : "text-muted-foreground hover:text-foreground border border-transparent"
            )}
            title="Switch to Planning Baseline Schedule"
          >
            <Calendar className="h-3 w-3" />
            <span className="hidden sm:inline">Plan</span>
          </button>
          <button
            type="button"
            onClick={() => handleSwitchMode("EXECUTION")}
            className={cn(
              "flex items-center gap-1 px-2 h-6 rounded text-[10px] font-mono uppercase font-bold transition-all cursor-pointer",
              isExecution
                ? "bg-amber-500/20 text-amber-400 border border-amber-500/40 shadow-2xs"
                : "text-muted-foreground hover:text-foreground border border-transparent"
            )}
            title="Switch to Live Site Execution Schedule"
          >
            <Activity className="h-3 w-3" />
            <span className="hidden sm:inline">Exec</span>
          </button>
        </div>

        {/* Version Selector */}
        <Select
          value={selectedVersionId || (defaultVersion?.id ?? "__auto")}
          onValueChange={(v) =>
            setSelectedVersionId(v === (defaultVersion?.id ?? "__auto") ? undefined : v)
          }
        >
          <SelectTrigger className="h-7 w-[110px] md:w-[130px] text-[10px] font-mono bg-background/90 border-border/80 px-2 shadow-2xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="font-mono bg-card border-border min-w-[200px]">
            <p className="px-2 py-1 text-[9px] font-bold uppercase text-muted-foreground">
              {isExecution ? "Execution Schedules" : "Planning Baselines"}
            </p>
            {(isExecution ? executionVersions : planningVersions).map((v: any) => (
              <SelectItem key={v.id} value={v.id} className="text-xs">
                <span className="flex items-center justify-between gap-2 w-full">
                  <span className="truncate">{versionLabel(v)}</span>
                  {statusBadge(v.status)}
                </span>
              </SelectItem>
            ))}
            {(!versionsData || versionsData.versions?.length === 0) && defaultVersion && (
              <SelectItem value="__auto" className="text-xs">
                <span className="flex items-center justify-between gap-2 w-full">
                  <span className="truncate">{versionLabel(defaultVersion)}</span>
                  {statusBadge(defaultVersion.status)}
                </span>
              </SelectItem>
            )}
          </SelectContent>
        </Select>

        {/* Baseline Overlay Selector */}
        {activeTab === "schedule" && (
          <Select
            value={overlayVersionId || "__none"}
            onValueChange={(v) => setOverlayVersionId(v === "__none" ? undefined : v)}
          >
            <SelectTrigger
              className="h-7 w-[32px] md:w-[95px] text-[10px] font-mono bg-background/90 border-border/80 px-2 text-muted-foreground hover:text-foreground shadow-2xs"
              title="Compare with baseline overlay"
            >
              <Layers className="h-3 w-3 text-muted-foreground shrink-0 md:mr-1" />
              <span className="hidden md:inline truncate">
                {overlayVersionId ? "Overlay On" : "Overlay"}
              </span>
            </SelectTrigger>
            <SelectContent className="font-mono bg-card border-border min-w-[190px]">
              <SelectItem value="__none" className="text-xs">
                Overlay: None
              </SelectItem>
              {versionsData?.versions
                ?.filter((v: any) => v.id !== (selectedVersion?.id ?? currentVersion?.id))
                .map((v: any) => (
                  <SelectItem key={v.id} value={v.id} className="text-xs">
                    Overlay: {versionLabel(v)}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {/* ── CENTER-LEFT: CPM Engine & Analysis Toggles ─────────────────── */}
      {activeTab === "schedule" && (
        <div className="flex items-center gap-1 shrink-0">
          {/* Critical Path & Calc Group */}
          <div className="flex items-center rounded-md border border-border/80 bg-background/90 p-0.5 shadow-2xs">
            <button
              type="button"
              onClick={() => setShowCriticalPath(!showCriticalPath)}
              className={cn(
                "flex items-center gap-1 px-1.5 h-6 rounded text-[10px] font-mono uppercase font-bold transition-all cursor-pointer",
                showCriticalPath
                  ? "bg-red-500/20 text-red-400 border border-red-500/40 shadow-2xs"
                  : "text-muted-foreground hover:text-foreground border border-transparent"
              )}
              title="Toggle Critical Path (CPM)"
            >
              <Zap
                className={cn(
                  "h-3 w-3",
                  showCriticalPath ? "text-red-400 fill-red-400" : "text-muted-foreground"
                )}
              />
              <span className="hidden lg:inline">CPM</span>
            </button>
            <button
              type="button"
              onClick={() =>
                calculateAll.mutate({ projectId: id, versionId: selectedVersion?.id })
              }
              disabled={calculateAll.isPending || !canWrite}
              className="flex items-center px-1.5 h-6 rounded text-[10px] font-mono font-bold text-primary hover:bg-primary/20 transition-all disabled:opacity-40 cursor-pointer"
              title="Recalculate CPM Forward Pass"
            >
              <Play className="h-2.5 w-2.5 fill-primary stroke-none" />
            </button>
          </div>

          {/* Analysis Menu Capsule */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className={cn(
                  "flex items-center gap-1 rounded-md border border-border/80 bg-background/90 px-1.5 h-7 text-[10px] font-mono font-bold transition-all cursor-pointer shadow-2xs",
                  activeAnalysisCount > 0
                    ? "bg-primary/20 text-primary border-primary/40"
                    : "text-muted-foreground hover:text-foreground"
                )}
                title="Analysis Trays (Conflicts, Variance, EVM)"
              >
                <AlertTriangle
                  className={cn(
                    "h-3 w-3",
                    conflictsData?.totalConflicts > 0 ? "text-destructive" : "text-muted-foreground"
                  )}
                />
                <span className="hidden xl:inline">Analysis</span>
                {conflictsData?.totalConflicts > 0 && (
                  <span className="rounded bg-destructive/30 text-destructive px-1 text-[8px] font-bold">
                    {conflictsData.totalConflicts}
                  </span>
                )}
                <ChevronDown className="h-2 w-2 opacity-60" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="font-mono bg-card border-border min-w-[170px]">
              <DropdownMenuLabel className="text-[9px] uppercase text-muted-foreground">
                Analytical Drawers
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => {
                  setShowConflicts(!showConflicts);
                  if (!showConflicts) {
                    setShowVariance(false);
                    setShowEVM(false);
                  }
                }}
                className={cn(
                  "flex items-center justify-between text-xs cursor-pointer",
                  showConflicts && "font-bold text-destructive"
                )}
              >
                <span className="flex items-center gap-1.5">
                  <AlertTriangle className="h-3 w-3 text-destructive" />
                  Resource Conflicts
                </span>
                {conflictsData?.totalConflicts > 0 && (
                  <span className="rounded bg-destructive/20 text-destructive border border-destructive/40 px-1 text-[8px] font-bold">
                    {conflictsData.totalConflicts}
                  </span>
                )}
              </DropdownMenuItem>
              {isExecution && (
                <DropdownMenuItem
                  onClick={() => {
                    setShowVariance(!showVariance);
                    if (!showVariance) {
                      setShowConflicts(false);
                      setShowEVM(false);
                    }
                  }}
                  className={cn(
                    "flex items-center gap-1.5 text-xs cursor-pointer",
                    showVariance && "font-bold text-amber-400"
                  )}
                >
                  <Sparkles className="h-3 w-3 text-amber-400" />
                  Schedule Variance
                </DropdownMenuItem>
              )}
              <DropdownMenuItem
                onClick={() => {
                  setShowEVM(!showEVM);
                  if (!showEVM) {
                    setShowConflicts(false);
                    setShowVariance(false);
                  }
                }}
                className={cn(
                  "flex items-center gap-1.5 text-xs cursor-pointer",
                  showEVM && "font-bold text-info"
                )}
              >
                <TrendingUp className="h-3 w-3 text-info" />
                Earned Value (EVM)
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}

      {/* ── CENTER: Search Field ─────────────────────────────────────────── */}
      {activeTab === "schedule" && (
        <div className="relative flex-1 max-w-[170px] sm:max-w-[220px]">
          <Search className="absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground pointer-events-none" />
          <Input
            placeholder="Search tasks..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-7 w-full pl-6 pr-5 text-[10px] font-mono bg-background/80 border-border/80 focus:border-primary transition-all shadow-2xs"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground cursor-pointer"
            >
              <X className="h-2.5 w-2.5" />
            </button>
          )}
        </div>
      )}

      {/* ── CENTER-RIGHT: Navigation & Zoom Capsule ──────────────────────── */}
      {activeTab === "schedule" && (
        <div className="flex items-center gap-1 shrink-0">
          {/* Jump to Today Anchor */}
          <button
            type="button"
            onClick={() => setJumpToTodayTrigger((n) => n + 1)}
            className="flex items-center gap-1 rounded-md border border-emerald-500/40 bg-emerald-500/10 px-2 h-7 text-[10px] font-mono font-bold text-emerald-400 hover:bg-emerald-500/20 hover:border-emerald-500/60 transition-all shadow-2xs active:scale-95 cursor-pointer whitespace-nowrap"
            title="Scroll timeline to today's date"
          >
            <Clock className="h-3 w-3 animate-pulse text-emerald-400" />
            <span className="hidden sm:inline">Today</span>
          </button>

          {/* Zoom Segmented Capsule */}
          <div className="flex items-center rounded-md border border-border/80 bg-background/90 p-0.5 shadow-2xs">
            {(["day", "week", "month"] as ZoomLevel[]).map((level) => (
              <button
                key={level}
                type="button"
                onClick={() => handleZoomChange(level)}
                className={cn(
                  "px-1.5 h-6 rounded text-[9px] font-mono uppercase font-bold transition-all cursor-pointer",
                  zoom === level
                    ? "bg-primary text-primary-foreground shadow-2xs"
                    : "text-muted-foreground hover:text-foreground"
                )}
                title={`Scale: ${level}`}
              >
                {level[0]}
              </button>
            ))}

            <div className="w-px h-3 bg-border/60 mx-0.5" />

            <button
              type="button"
              onClick={() => {
                const step = zoomScale > 3.0 ? 1.0 : zoomScale > 1.0 ? 0.25 : 0.15;
                handleZoomScaleChange(Math.max(0.2, Number((zoomScale - step).toFixed(2))));
              }}
              className="px-1 h-6 text-muted-foreground hover:text-foreground rounded transition-colors cursor-pointer text-[10px] font-bold"
              title="Zoom out timeline scale"
            >
              −
            </button>
            <button
              type="button"
              onClick={() => handleZoomScaleChange(1.0)}
              className="text-[9px] font-mono font-bold text-muted-foreground hover:text-primary px-1.5 h-6 flex items-center cursor-pointer"
              title="Reset zoom to 100%"
            >
              {Math.round(zoomScale * 100)}%
            </button>
            <button
              type="button"
              onClick={() => {
                const step = zoomScale >= 3.0 ? 1.0 : zoomScale >= 1.0 ? 0.25 : 0.15;
                handleZoomScaleChange(Math.min(10.0, Number((zoomScale + step).toFixed(2))));
              }}
              className="px-1 h-6 text-muted-foreground hover:text-foreground rounded transition-colors cursor-pointer text-[10px] font-bold"
              title="Zoom in timeline scale (up to 1000%)"
            >
              +
            </button>
          </div>
        </div>
      )}

      {/* ── RIGHT SECTION: History, Share, Panes & Add Task ──────────────── */}
      <div className="flex items-center gap-1 shrink-0">
        {/* Undo / Redo */}
        <div className="flex items-center rounded-md border border-border/80 bg-background/90 p-0.5 shadow-2xs">
          <button
            type="button"
            onClick={() => undo()}
            disabled={!canUndo}
            className="rounded p-1 text-muted-foreground hover:text-foreground hover:bg-muted active:scale-90 transition-all disabled:opacity-30 cursor-pointer h-6 w-6 flex items-center justify-center"
            title="Undo (Ctrl+Z)"
          >
            <Undo2 className="h-3 w-3" />
          </button>
          <button
            type="button"
            onClick={() => redo()}
            disabled={!canRedo}
            className="rounded p-1 text-muted-foreground hover:text-foreground hover:bg-muted active:scale-90 transition-all disabled:opacity-30 cursor-pointer h-6 w-6 flex items-center justify-center"
            title="Redo (Ctrl+Y)"
          >
            <Redo2 className="h-3 w-3" />
          </button>
        </div>

        {/* Share Dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="flex items-center gap-1 rounded-md border border-border/80 bg-background/90 px-2 h-7 text-[10px] font-mono font-semibold text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer shadow-2xs"
              title="Export, Print, or Import MS Project schedules"
            >
              <Share2 className="h-3 w-3 text-primary" />
              <ChevronDown className="h-2 w-2 opacity-60" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="font-mono bg-card border-border min-w-[180px]">
            <DropdownMenuLabel className="text-[9px] uppercase text-muted-foreground">
              Export & Reports
            </DropdownMenuLabel>
            <DropdownMenuItem
              onClick={() => router.push(`/projects/${id}/gantt/pdf-designer`)}
              className="flex items-center gap-2 cursor-pointer text-xs"
            >
              <Printer className="h-3.5 w-3.5 text-primary" />
              <span>Design PDF Report</span>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <a
                href={`/api/gantt/export-msp?projectId=${id}${
                  selectedVersionId ? `&versionId=${selectedVersionId}` : ""
                }`}
                download
                className="flex items-center gap-2 cursor-pointer text-xs"
              >
                <Download className="h-3.5 w-3.5 text-muted-foreground" />
                <span>Export MS Project (.xml)</span>
              </a>
            </DropdownMenuItem>

            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-[9px] uppercase text-muted-foreground">
              Integrations
            </DropdownMenuLabel>
            <MSPImportButton
              projectId={id}
              versionId={selectedVersionId}
              renderTrigger={(openModal) => (
                <DropdownMenuItem
                  onClick={openModal}
                  className="flex items-center gap-2 cursor-pointer text-xs"
                >
                  <Upload className="h-3.5 w-3.5 text-emerald-400" />
                  <span>Import MS Project XML...</span>
                </DropdownMenuItem>
              )}
            />
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Viewport Panels: Tasks & Inspector */}
        <div className="flex items-center rounded-md border border-border/80 bg-background/90 p-0.5 shadow-2xs gap-0.5">
          <button
            type="button"
            onClick={handleToggleTaskList}
            className={cn(
              "flex items-center justify-center h-6 w-6 rounded transition-colors cursor-pointer",
              taskListVisible
                ? "bg-muted text-foreground font-bold shadow-2xs"
                : "text-muted-foreground/60 hover:text-foreground"
            )}
            title="Toggle Left Task Grid"
          >
            <PanelLeft className="h-3 w-3" />
          </button>
          <button
            type="button"
            onClick={handleToggleInspector}
            className={cn(
              "flex items-center justify-center h-6 w-6 rounded transition-colors cursor-pointer",
              inspectorVisible
                ? "bg-muted text-foreground font-bold shadow-2xs"
                : "text-muted-foreground/60 hover:text-foreground"
            )}
            title="Toggle Right Task Inspector"
          >
            <PanelRight className="h-3 w-3" />
          </button>
        </div>

        {/* Fullscreen */}
        <button
          type="button"
          onClick={() => setFullScreen(!fullScreen)}
          className="rounded-md p-1 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors border border-border/80 bg-background/90 cursor-pointer h-7 w-7 flex items-center justify-center shadow-2xs"
          title={fullScreen ? "Exit full screen" : "Full screen"}
        >
          {fullScreen ? (
            <Minimize2 className="h-3 w-3" />
          ) : (
            <Maximize2 className="h-3 w-3 text-primary" />
          )}
        </button>

        {/* Work Package Templates Library Action */}
        {canWrite && (
          <button
            type="button"
            onClick={onOpenTemplates}
            className="flex items-center gap-1.5 rounded-md border border-border bg-[var(--navy-mid)]/90 px-2.5 h-7 text-[10px] font-mono font-semibold text-foreground hover:border-emerald-500/80 hover:text-emerald-400 hover:bg-[var(--navy-mid)] transition-all cursor-pointer whitespace-nowrap shadow-2xs"
            title="Open Work Package & Structure Template Library"
          >
            <Layers className="h-3.5 w-3.5 text-emerald-400" />
            <span className="hidden sm:inline">Templates</span>
          </button>
        )}

        {/* Add Task Primary Action */}
        {canWrite && (
          <button
            type="button"
            onClick={() => setAddTaskTrigger((n) => n + 1)}
            className="flex items-center gap-1 rounded-md bg-primary px-2.5 h-7 text-[10px] font-mono font-bold text-primary-foreground hover:bg-primary/90 shadow-[0_0_8px_rgba(16,185,129,0.35)] transition-all cursor-pointer whitespace-nowrap"
            title="Add a new task"
          >
            <Plus className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Add Task</span>
          </button>
        )}

        {!canWrite && myRole && myRole !== "client" && myRole !== "inspector" && (
          <button
            type="button"
            onClick={() => {
              if (creatingVersion) return;
              setCreatingVersion(true);
              if (currentVersion) {
                createVersionMutation.mutate({
                  projectId: id,
                  name: `Edit v${(currentVersion.versionNumber || 0) + 1}`,
                  baseVersionId: currentVersion.id,
                });
              } else {
                createVersionMutation.mutate({ projectId: id, name: "Draft" });
              }
            }}
            disabled={creatingVersion}
            className="flex items-center gap-1 rounded-md bg-primary px-2.5 h-7 text-[10px] font-mono font-bold text-primary-foreground hover:bg-primary/90 shadow-[0_0_8px_rgba(16,185,129,0.35)] transition-all disabled:opacity-50 cursor-pointer whitespace-nowrap"
            title="Create a draft revision to edit tasks"
          >
            {creatingVersion ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Plus className="h-3.5 w-3.5" />
            )}
            <span className="hidden sm:inline">{creatingVersion ? "Creating..." : "Add Task"}</span>
          </button>
        )}
      </div>
    </div>
  );
}
