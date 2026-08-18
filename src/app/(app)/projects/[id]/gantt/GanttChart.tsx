"use client";

import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { format, addDays } from "date-fns";
import { cn } from "@/lib/utils";
import { trpc } from "@/lib/trpc-client";
import { toast } from "sonner";
import { Plus, Loader2 } from "lucide-react";
import { UndoRedoProvider, useUndoRedo } from "./undo-redo";
import { useUserPreferences } from "@/components/user-preferences-provider";
import {
  computeCriticalPath,
  computeCriticalPathDrag,
  computeFloatMap,
  computeDateRange,
  computeRolledUpProgress,
  getSuccessorIds,
  getDayWidth,
} from "./utils";
import type { Task, ZoomLevel } from "./types";
import { Gantt } from "./components/Gantt";
import { ResourcePage } from "./components/ResourcePage";
import { SCurveChart } from "./components/SCurveChart";
import { InlineAddRow } from "./components/InlineAddRow";
import { GanttFullscreenPrompt } from "./components/GanttFullscreenPrompt";
import { GanttCommandBar } from "./components/GanttCommandBar";
import { GanttAnalysisModals } from "./components/GanttAnalysisModals";
import { WorkPackageTemplatesModal } from "./components/WorkPackageTemplatesModal";

export function GanttChart({
  projectId,
  view = "schedule",
}: {
  projectId: string;
  view?: "schedule" | "resources" | "scurve";
}) {
  return (
    <UndoRedoProvider>
      <GanttChartContent projectId={projectId} view={view} />
    </UndoRedoProvider>
  );
}

function GanttChartContent({
  projectId,
  view = "schedule",
}: {
  projectId: string;
  view?: "schedule" | "resources" | "scurve";
}) {
  const id = projectId;
  const { getPref, setPref } = useUserPreferences();
  const [selectedVersionId, setSelectedVersionId] = useState<string | undefined>();
  const [selectedCostLibraryId, setSelectedCostLibraryId] = useState<string>("");
  const [overlayVersionId, setOverlayVersionId] = useState<string | undefined>();
  const [showCriticalPath, setShowCriticalPath] = useState(false);
  const [zoom, setZoom] = useState<ZoomLevel>(
    () => (getPref<ZoomLevel>("ganttZoom") as ZoomLevel) || "day"
  );
  const [zoomScale, setZoomScale] = useState<number>(() => {
    const saved = getPref<number>("ganttZoomScale");
    return saved !== undefined && saved !== null ? saved : 1.0;
  });

  const [searchQuery, setSearchQuery] = useState("");
  const [fullScreen, setFullScreen] = useState(false);
  const [taskListVisible, setTaskListVisible] = useState<boolean>(() => {
    const saved = getPref<boolean>("ganttTaskListVisible");
    return saved !== undefined && saved !== null ? saved : true;
  });
  const [inspectorVisible, setInspectorVisible] = useState<boolean>(() => {
    const saved = getPref<boolean>("ganttInspectorVisible");
    return saved !== undefined && saved !== null ? saved : true;
  });
  const [showVariance, setShowVariance] = useState(false);
  const [showConflicts, setShowConflicts] = useState(false);
  const [showEVM, setShowEVM] = useState(false);
  const [addTaskTrigger, setAddTaskTrigger] = useState(0);
  const [templatesModalOpen, setTemplatesModalOpen] = useState(false);
  const [replicateSourceTask, setReplicateSourceTask] = useState<Task | null>(null);
  const [jumpToTodayTrigger, setJumpToTodayTrigger] = useState(0);
  const [creatingVersion, setCreatingVersion] = useState(false);
  const [showFullscreenPrompt, setShowFullscreenPrompt] = useState(false);
  const activeTab = view;

  const handleZoomChange = (newZoom: ZoomLevel) => {
    setZoom(newZoom);
    setPref("ganttZoom", newZoom);
  };

  const handleZoomScaleChange = (newScale: number) => {
    setZoomScale(newScale);
    setPref("ganttZoomScale", newScale);
  };

  const handleToggleTaskList = () => {
    setTaskListVisible((prev) => {
      const next = !prev;
      setPref("ganttTaskListVisible", next);
      return next;
    });
  };

  const handleToggleInspector = () => {
    setInspectorVisible((prev) => {
      const next = !prev;
      setPref("ganttInspectorVisible", next);
      return next;
    });
  };

  const { data: versionsData } = trpc.gantt.listVersions.useQuery({ projectId: id });
  const { data: libsData } = trpc.analysisLibrary.list.useQuery({ projectId: id });
  const { data: projectInfo } = trpc.project.get.useQuery({ id }, { staleTime: 300_000 });
  const { data, isLoading } = trpc.gantt.list.useQuery({
    projectId: id,
    versionId: selectedVersionId || undefined,
    costLibraryId: selectedCostLibraryId || undefined,
  });
  const { data: overlayData } = trpc.gantt.list.useQuery(
    {
      projectId: id,
      versionId: overlayVersionId || undefined,
      costLibraryId: selectedCostLibraryId || undefined,
    },
    { enabled: !!overlayVersionId }
  );

  const utils = trpc.useUtils();
  const calculateAll = trpc.gantt.calculateAll.useMutation({
    onSuccess: (res) => {
      utils.gantt.list.invalidate({ projectId: id, versionId: selectedVersionId || undefined });
      if (res.warning) {
        toast.warning(res.warning);
      } else {
        toast.success(`Updated ${res.updatedCount} task${res.updatedCount !== 1 ? "s" : ""}`);
      }
    },
    onError: (e) => toast.error(e.message),
  });

  const myRole = projectInfo?.myRole;

  const defaultVersion = useMemo(() => {
    if (!versionsData?.versions) return null;
    const draft = versionsData.versions.find((v) => v.status === "DRAFT");
    return (
      draft ??
      versionsData.versions.find((v) => v.isActive) ??
      versionsData.versions[0] ??
      null
    );
  }, [versionsData]);

  const selectedVersion = useMemo(() => {
    if (!versionsData?.versions) return null;
    if (!selectedVersionId) return defaultVersion;
    return versionsData.versions.find((v) => v.id === selectedVersionId) ?? null;
  }, [versionsData, selectedVersionId, defaultVersion]);

  const currentVersion =
    versionsData?.versions.find((v) => v.id === selectedVersionId) ||
    selectedVersion ||
    defaultVersion;
  const isPlanning = currentVersion?.scheduleType === "PLANNING";
  const isExecution = currentVersion?.scheduleType === "EXECUTION";

  const versionCanWrite = selectedVersion?.status === "DRAFT";
  const canWrite = !!(myRole && myRole !== "client" && myRole !== "inspector" && versionCanWrite);

  const allTasks: Task[] = useMemo(() => (data?.tasks ?? []) as unknown as Task[], [data]);
  const taskMap = useMemo(() => new Map(allTasks.map((t) => [t.id, t])), [allTasks]);

  const [taskFilter, setTaskFilter] = useState<"all" | "critical" | "in_progress" | "delayed" | "completed">("all");

  const structureKey = useMemo(
    () => allTasks.map((t) => `${t.id}:${t.startDate}:${t.endDate}:${t.duration}`).join("|"),
    [allTasks]
  );
  const criticalTaskIds = useMemo(
    () => (showCriticalPath || taskFilter === "critical" ? computeCriticalPath(allTasks) : new Set<string>()),
    [showCriticalPath, taskFilter, structureKey, allTasks]
  );

  const filteredTasks = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const now = new Date();

    let base = allTasks;
    if (taskFilter === "critical") {
      const critSet = computeCriticalPath(allTasks);
      base = base.filter((t) => critSet.has(t.id));
    } else if (taskFilter === "in_progress") {
      base = base.filter((t) => (t.progress ?? 0) > 0 && (t.progress ?? 0) < 100);
    } else if (taskFilter === "delayed") {
      base = base.filter((t) => new Date(t.endDate) < now && (t.progress ?? 0) < 100);
    } else if (taskFilter === "completed") {
      base = base.filter((t) => (t.progress ?? 0) === 100);
    }

    if (!q && taskFilter === "all") return allTasks;

    const matchingIds = new Set<string>();
    for (const t of base) {
      if (!q || t.name.toLowerCase().includes(q) || (t.code && t.code.toLowerCase().includes(q))) {
        matchingIds.add(t.id);
      }
    }
    const ancestors = new Set<string>();
    for (const id of matchingIds) {
      let t = taskMap.get(id);
      while (t?.parentId) {
        ancestors.add(t.parentId);
        t = taskMap.get(t.parentId);
      }
    }
    return allTasks.filter((t) => matchingIds.has(t.id) || ancestors.has(t.id));
  }, [allTasks, searchQuery, taskFilter, taskMap]);

  const rolledUpProgress = useMemo(() => computeRolledUpProgress(allTasks), [allTasks]);
  const criticalDragMap = useMemo(
    () =>
      showCriticalPath
        ? computeCriticalPathDrag(allTasks, criticalTaskIds)
        : new Map<string, number>(),
    [showCriticalPath, criticalTaskIds, allTasks]
  );
  const successorIds = useMemo(() => getSuccessorIds(allTasks), [allTasks]);
  const floatMap = useMemo(() => computeFloatMap(allTasks), [structureKey, allTasks]);

  const calendarType = getPref<string>("calendarType", "BS");
  const { rangeStart, days } = useMemo(() => computeDateRange(allTasks, calendarType), [allTasks, calendarType]);
  const dayWidth = useMemo(() => getDayWidth(zoom) * zoomScale, [zoom, zoomScale]);

  const overlayMap = useMemo(() => {
    if (!overlayData?.tasks || !overlayVersionId)
      return new Map<string, { startDate: string; endDate: string }>();
    return new Map(
      (overlayData.tasks as unknown as Task[]).map((t) => [
        t.id,
        { startDate: t.startDate, endDate: t.endDate },
      ])
    );
  }, [overlayData, overlayVersionId]);

  const rootTasks = useMemo(() => filteredTasks.filter((t) => !t.parentId), [filteredTasks]);

  const [leftPanelWidth, setLeftPanelWidth] = useState<number>(() => {
    if (typeof window !== "undefined") {
      const local = localStorage.getItem("ganttLeftPanelWidth");
      if (local) {
        const parsed = parseInt(local, 10);
        if (!isNaN(parsed) && parsed >= 180) return parsed;
      }
    }
    const saved = getPref<number>("ganttLeftPanelWidth");
    if (saved && typeof saved === "number" && saved >= 180) return saved;
    return 300;
  });
  const leftPanelWidthRef = useRef(leftPanelWidth);
  useEffect(() => {
    leftPanelWidthRef.current = leftPanelWidth;
  }, [leftPanelWidth]);

  const dividerRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const [hasManuallyResized, setHasManuallyResized] = useState(false);

  const startDrag = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    dragging.current = true;
    setHasManuallyResized(true);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    const onMove = (ev: MouseEvent) => {
      if (!dragging.current) return;
      const minW = 180;
      const maxW = window.innerWidth * 0.6;
      setLeftPanelWidth(Math.min(Math.max(ev.clientX, minW), maxW));
    };
    const onUp = () => {
      dragging.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      setPref("ganttLeftPanelWidth", leftPanelWidthRef.current);
      if (typeof window !== "undefined") {
        localStorage.setItem("ganttLeftPanelWidth", String(leftPanelWidthRef.current));
      }
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }, [setPref]);

  const { undo, redo, canUndo, canRedo, pushAction } = useUndoRedo();

  useEffect(() => {
    const handleKeyboard = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "z") {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      }
      if (e.key === "Escape" && fullScreen) setFullScreen(false);
    };
    window.addEventListener("keydown", handleKeyboard);
    return () => window.removeEventListener("keydown", handleKeyboard);
  }, [undo, redo, fullScreen]);

  useEffect(() => {
    if (activeTab !== "schedule") return;
    const preference =
      getPref("ganttFullscreen", null) ||
      (typeof window !== "undefined"
        ? localStorage.getItem("gantt-fullscreen-preference")
        : null);
    if (preference === null) {
      setShowFullscreenPrompt(true);
    } else if (preference === "yes") {
      setFullScreen(true);
    }
  }, [activeTab, getPref]);

  const dayLabels = useMemo(() => {
    return Array.from({ length: days }, (_, i) => {
      const d = addDays(rangeStart, i);
      const dow = d.getDay();
      const isFirstOfMonth = d.getDate() === 1;
      const isMonday = dow === 1;
      let label: string;
      if (zoom === "day") label = format(d, "dd MMM");
      else if (zoom === "week") label = isMonday ? format(d, "MMM d") : "";
      else label = isFirstOfMonth ? format(d, "MMM") : "";
      return {
        date: d,
        label,
        isWeekend: dow === 6,
        isFirstOfMonth,
        isMonday,
        isFirstOfYear: d.getMonth() === 0 && d.getDate() === 1,
      };
    });
  }, [rangeStart, days, zoom]);

  const createVersionMutation = trpc.gantt.createVersion.useMutation({
    onSuccess: (resData) => {
      utils.gantt.listVersions.invalidate({ projectId: id });
      setSelectedVersionId(resData.version.id);
      setAddTaskTrigger((n) => n + 1);
      setCreatingVersion(false);
      toast.success("New draft version created — you can now edit tasks");
    },
    onError: (e) => {
      setCreatingVersion(false);
      toast.error(e.message);
    },
  });

  const applyLevelingMutation = trpc.gantt.applyLeveling.useMutation({
    onSuccess: (res) => {
      utils.gantt.list.invalidate({ projectId: id });
      utils.gantt.getResourceConflicts.invalidate({
        projectId: id,
        versionId: currentVersion?.id ?? "",
      });
      toast.success(`Leveling applied: ${res.applied} tasks rescheduled`);
      setShowConflicts(false);
    },
    onError: (e) => toast.error(e.message),
  });

  const { data: varianceData, isLoading: varianceLoading } = trpc.gantt.getVariance.useQuery(
    { projectId: id, executionVersionId: currentVersion?.id ?? "" },
    { enabled: isExecution && showVariance && !!currentVersion?.id }
  );

  const { data: conflictsData, isLoading: conflictsLoading } =
    trpc.gantt.getResourceConflicts.useQuery(
      { projectId: id, versionId: currentVersion?.id ?? "" },
      { enabled: showConflicts && !!currentVersion?.id }
    );

  const { data: evmData, isLoading: evmLoading } = trpc.gantt.getEVM.useQuery(
    { projectId: id, versionId: currentVersion?.id },
    { enabled: showEVM && !!currentVersion?.id }
  );

  return (
    <div
      className={cn(
        "h-full flex flex-col font-mono p-1.5 bg-background",
        fullScreen && "fixed inset-0 z-50 bg-background p-2.5"
      )}
    >
      <GanttCommandBar
        id={id}
        activeTab={activeTab}
        currentVersion={currentVersion}
        isPlanning={isPlanning}
        isExecution={isExecution}
        versionsData={versionsData}
        selectedVersionId={selectedVersionId}
        setSelectedVersionId={setSelectedVersionId}
        defaultVersion={defaultVersion}
        selectedVersion={selectedVersion}
        overlayVersionId={overlayVersionId}
        setOverlayVersionId={setOverlayVersionId}
        zoom={zoom}
        handleZoomChange={handleZoomChange}
        zoomScale={zoomScale}
        handleZoomScaleChange={handleZoomScaleChange}
        showCriticalPath={showCriticalPath}
        setShowCriticalPath={setShowCriticalPath}
        calculateAll={calculateAll}
        canWrite={canWrite}
        showVariance={showVariance}
        setShowVariance={setShowVariance}
        showConflicts={showConflicts}
        setShowConflicts={setShowConflicts}
        conflictsData={conflictsData}
        showEVM={showEVM}
        setShowEVM={setShowEVM}
        taskFilter={taskFilter}
        setTaskFilter={setTaskFilter}
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        setJumpToTodayTrigger={setJumpToTodayTrigger}
        undo={undo}
        redo={redo}
        canUndo={canUndo}
        canRedo={canRedo}
        taskListVisible={taskListVisible}
        handleToggleTaskList={handleToggleTaskList}
        inspectorVisible={inspectorVisible}
        handleToggleInspector={handleToggleInspector}
        fullScreen={fullScreen}
        setFullScreen={setFullScreen}
        setAddTaskTrigger={setAddTaskTrigger}
        onOpenTemplates={() => {
          setReplicateSourceTask(null);
          setTemplatesModalOpen(true);
        }}
        myRole={myRole}
        creatingVersion={creatingVersion}
        setCreatingVersion={setCreatingVersion}
        createVersionMutation={createVersionMutation}
      />

      <div className="flex-1 min-h-0 mt-1.5 border border-slate-800/90 rounded-lg overflow-hidden shadow-xs">
        {showEVM || showConflicts || (isExecution && showVariance) ? (
          <GanttAnalysisModals
            showEVM={showEVM}
            evmLoading={evmLoading}
            evmData={evmData}
            showConflicts={showConflicts}
            conflictsLoading={conflictsLoading}
            conflictsData={conflictsData}
            isExecution={isExecution}
            showVariance={showVariance}
            varianceLoading={varianceLoading}
            varianceData={varianceData}
            id={id}
            applyLevelingMutation={applyLevelingMutation}
          />
        ) : activeTab === "scurve" ? (
          <div className="flex-1 overflow-y-auto p-4 w-full">
            <div className="w-full space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h1 className="text-base font-mono font-bold uppercase tracking-wider text-foreground">
                    Progress S-Curve
                  </h1>
                  <p className="text-xs font-mono text-muted-foreground">
                    Cumulative Planned vs. Actual Work Progress Over Time
                  </p>
                </div>
              </div>
              <div className="w-full rounded-lg border border-border/60 bg-card/60 p-4 backdrop-blur-xs">
                <SCurveChart tasks={allTasks} rangeStart={rangeStart} days={days} />
              </div>
            </div>
          </div>
        ) : activeTab === "resources" ? (
          <ResourcePage
            tasks={allTasks}
            rangeStart={rangeStart}
            days={days}
            isLoading={isLoading}
          />
        ) : isLoading ? (
          <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
            Loading...
          </div>
        ) : !allTasks.length ? (
          <div className="flex flex-col items-center justify-center h-full gap-2 text-muted-foreground">
            <p className="text-sm font-medium">No tasks yet</p>
            <p className="text-xs">Create tasks to build your project schedule.</p>
            {canWrite && (
              <div className="mt-2 w-full max-w-lg">
                <InlineAddRow
                  projectId={id}
                  parentId={null}
                  existingCount={0}
                  trigger={addTaskTrigger}
                />
              </div>
            )}
            {!canWrite && myRole && myRole !== "client" && myRole !== "inspector" && (
              <button
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
                className="mt-2 flex items-center gap-1.5 rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700 transition-colors disabled:opacity-50"
              >
                {creatingVersion ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Plus className="h-4 w-4" />
                )}
                {creatingVersion ? "Creating..." : "Add First Task"}
              </button>
            )}
          </div>
        ) : (
          <Gantt
            tasks={allTasks}
            rootTasks={rootTasks}
            rangeStart={rangeStart}
            days={days}
            dayWidth={dayWidth}
            zoom={zoom}
            canWrite={canWrite}
            projectId={id}
            overlayMap={overlayMap}
            criticalTaskIds={criticalTaskIds}
            criticalDragMap={criticalDragMap}
            rolledUpProgress={rolledUpProgress}
            successorIds={successorIds}
            leftPanelWidth={leftPanelWidth}
            taskListVisible={taskListVisible}
            inspectorVisible={inspectorVisible}
            onToggleInspector={handleToggleInspector}
            dividerRef={dividerRef}
            startDrag={startDrag}
            dayLabels={dayLabels}
            selectedCostLibraryId={selectedCostLibraryId || undefined}
            pushAction={pushAction}
            utils={utils}
            addTaskTrigger={addTaskTrigger}
            jumpToTodayTrigger={jumpToTodayTrigger}
            onWidthNeeded={(w) => setLeftPanelWidth(w)}
            hasManuallyResized={hasManuallyResized}
            floatMap={floatMap}
            zoomScale={zoomScale}
            onZoomScaleChange={handleZoomScaleChange}
            onReplicate={(task) => {
              setReplicateSourceTask(task);
              setTemplatesModalOpen(true);
            }}
          />
        )}
      </div>

      {/* Work Package & Structure Template Manager / Replicator Modal */}
      <WorkPackageTemplatesModal
        projectId={id}
        versionId={selectedVersionId}
        isOpen={templatesModalOpen}
        onClose={() => {
          setTemplatesModalOpen(false);
          setReplicateSourceTask(null);
        }}
        tasks={allTasks}
        replicateSourceTask={replicateSourceTask}
        onClearReplicateSource={() => setReplicateSourceTask(null)}
      />

      {/* Fullscreen prompt — shown on first visit to Schedule tab */}
      {showFullscreenPrompt && (
        <GanttFullscreenPrompt
          onDismiss={() => {
            setPref("ganttFullscreen", "no");
            setShowFullscreenPrompt(false);
          }}
          onEnterFullscreen={() => {
            setPref("ganttFullscreen", "yes");
            setFullScreen(true);
            setShowFullscreenPrompt(false);
          }}
        />
      )}
    </div>
  );
}
