"use client";

import { useState, useMemo, useCallback, useRef, useEffect, type CSSProperties } from "react";
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
import type { Task, ZoomLevel, OmniPlanView } from "./types";
import { getHolidayName } from "@/server/utils/nepal-calendar";
import { Gantt } from "./components/Gantt";
import { ResourcePage } from "./components/ResourcePage";
import { SCurveChart } from "./components/SCurveChart";
import { InlineAddRow } from "./components/InlineAddRow";
import { GanttCommandBar } from "./components/GanttCommandBar";
import { GanttAnalysisModals } from "./components/GanttAnalysisModals";
import { WorkPackageTemplatesModal } from "./components/WorkPackageTemplatesModal";
import { ResourceSwimlaneView } from "./components/ResourceSwimlaneView";
import { NetworkPertView } from "./components/NetworkPertView";
import { CalendarWorkWeekView } from "./components/CalendarWorkWeekView";
import { StylesSettingsView } from "./components/StylesSettingsView";
import { TaskInspector } from "./components/TaskInspector";
import { Dialog, DialogContent, DialogTitle, DialogDescription, DialogHeader } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

function LegendSwatch({ className, label, diamond }: { className: string; label: string; diamond?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span className={`h-2 w-2 ${diamond ? "rotate-45" : "rounded-[2px]"} ${className}`} />
      {label}
    </span>
  );
}

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
  const [showCriticalPath, setShowCriticalPath] = useState<boolean>(() => {
    const saved = getPref<boolean>(`gantt_${id}_showCriticalPath`) ?? getPref<boolean>("ganttShowCriticalPath");
    return saved !== undefined && saved !== null ? saved : false;
  });
  const [zoom, setZoom] = useState<ZoomLevel>(() => {
    const saved = getPref<ZoomLevel>(`gantt_${id}_zoom`) ?? getPref<ZoomLevel>("ganttZoom");
    const valid: ZoomLevel[] = ["day", "week", "month", "year"];
    return saved && (valid as string[]).includes(saved) ? saved : "week";
  });
  const [zoomScale, setZoomScale] = useState<number>(() => {
    const saved = getPref<number>(`gantt_${id}_zoomScale`) ?? getPref<number>("ganttZoomScale");
    return saved !== undefined && saved !== null && typeof saved === "number" ? saved : 1.0;
  });

  const [searchQuery, setSearchQuery] = useState("");
  const [fullScreen, setFullScreen] = useState(false);
  const [taskListVisible, setTaskListVisible] = useState<boolean>(() => {
    const saved = getPref<boolean>(`gantt_${id}_taskListVisible`) ?? getPref<boolean>("ganttTaskListVisible");
    return saved !== undefined && saved !== null ? saved : true;
  });
  const [inspectorVisible, setInspectorVisible] = useState<boolean>(() => {
    const saved = getPref<boolean>(`gantt_${id}_inspectorVisible`) ?? getPref<boolean>("ganttInspectorVisible");
    return saved !== undefined && saved !== null ? saved : false;
  });
  const [showVariance, setShowVariance] = useState<boolean>(() => {
    const saved = getPref<boolean>(`gantt_${id}_showVariance`) ?? getPref<boolean>("ganttShowVariance");
    return saved !== undefined && saved !== null ? saved : false;
  });
  const [showConflicts, setShowConflicts] = useState<boolean>(() => {
    const saved = getPref<boolean>(`gantt_${id}_showConflicts`) ?? getPref<boolean>("ganttShowConflicts");
    return saved !== undefined && saved !== null ? saved : false;
  });
  const [showEVM, setShowEVM] = useState<boolean>(() => {
    const saved = getPref<boolean>(`gantt_${id}_showEVM`) ?? getPref<boolean>("ganttShowEVM");
    return saved !== undefined && saved !== null ? saved : false;
  });
  const [addTaskTrigger, setAddTaskTrigger] = useState(0);
  const [templatesModalOpen, setTemplatesModalOpen] = useState(false);
  const [replicateSourceTask, setReplicateSourceTask] = useState<Task | null>(null);
  const [jumpToTodayTrigger, setJumpToTodayTrigger] = useState(0);
  const [creatingVersion, setCreatingVersion] = useState(false);
  const activeTab = view;

  const [activeView, setActiveView] = useState<OmniPlanView>(() => {
    if (view === "resources") return "resources";
    const saved = getPref<OmniPlanView>(`gantt_${id}_activeView`) ?? getPref<OmniPlanView>("ganttActiveView");
    return saved || "tasks";
  });
  const [editingMode, setEditingMode] = useState<"actual" | "baseline">(() => {
    const saved = getPref<"actual" | "baseline">(`gantt_${id}_editingMode`);
    return saved || "actual";
  });
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);

  // Sync state when preferences hydrate from cloud
  useEffect(() => {
    const savedZoom = getPref<ZoomLevel>(`gantt_${id}_zoom`) ?? getPref<ZoomLevel>("ganttZoom");
    if (savedZoom && ["day", "week", "month", "year"].includes(savedZoom)) {
      setZoom(savedZoom);
    }
    const savedScale = getPref<number>(`gantt_${id}_zoomScale`) ?? getPref<number>("ganttZoomScale");
    if (savedScale && typeof savedScale === "number") {
      setZoomScale(savedScale);
    }
    const savedTaskList = getPref<boolean>(`gantt_${id}_taskListVisible`) ?? getPref<boolean>("ganttTaskListVisible");
    if (savedTaskList !== undefined && savedTaskList !== null) {
      setTaskListVisible(savedTaskList);
    }
    const savedInspector = getPref<boolean>(`gantt_${id}_inspectorVisible`) ?? getPref<boolean>("ganttInspectorVisible");
    if (savedInspector !== undefined && savedInspector !== null) {
      setInspectorVisible(savedInspector);
    }
    const savedCrit = getPref<boolean>(`gantt_${id}_showCriticalPath`) ?? getPref<boolean>("ganttShowCriticalPath");
    if (savedCrit !== undefined && savedCrit !== null) {
      setShowCriticalPath(savedCrit);
    }
    const savedView = getPref<OmniPlanView>(`gantt_${id}_activeView`) ?? getPref<OmniPlanView>("ganttActiveView");
    if (savedView && !view) {
      setActiveView(savedView);
    }
  }, [getPref, id, view]);

  const handleEditingModeChange = (mode: "actual" | "baseline") => {
    setEditingMode(mode);
    setPref(`gantt_${id}_editingMode`, mode);
    if (mode === "baseline") {
      if (!overlayVersionId) {
        const baseline =
          versionsData?.versions?.find((v) => v.status === "APPROVED") ??
          versionsData?.versions?.find((v) => v.id !== currentVersion?.id);
        if (baseline) setOverlayVersionId(baseline.id);
      }
    } else {
      setOverlayVersionId(undefined);
    }
  };

  const handleActiveViewChange = (v: OmniPlanView) => {
    setActiveView(v);
    setPref(`gantt_${id}_activeView`, v);
    setPref("ganttActiveView", v);
  };

  const handleZoomChange = (newZoom: ZoomLevel) => {
    setZoom(newZoom);
    setPref(`gantt_${id}_zoom`, newZoom);
    setPref("ganttZoom", newZoom);
  };

  const handleZoomScaleChange = (newScale: number) => {
    const rounded = Number(newScale.toFixed(2));
    setZoomScale(rounded);
    setPref(`gantt_${id}_zoomScale`, rounded);
    setPref("ganttZoomScale", rounded);
  };

  const handleToggleTaskList = () => {
    setTaskListVisible((prev) => {
      const next = !prev;
      setPref(`gantt_${id}_taskListVisible`, next);
      setPref("ganttTaskListVisible", next);
      return next;
    });
  };

  const handleToggleInspector = () => {
    setInspectorVisible((prev) => {
      const next = !prev;
      setPref(`gantt_${id}_inspectorVisible`, next);
      setPref("ganttInspectorVisible", next);
      return next;
    });
  };

  const handleToggleCriticalPath = (val: boolean) => {
    setShowCriticalPath(val);
    setPref(`gantt_${id}_showCriticalPath`, val);
    setPref("ganttShowCriticalPath", val);
  };

  const handleToggleConflicts = (val: boolean) => {
    setShowConflicts(val);
    setPref(`gantt_${id}_showConflicts`, val);
  };

  const handleToggleVariance = (val: boolean) => {
    setShowVariance(val);
    setPref(`gantt_${id}_showVariance`, val);
  };

  const handleToggleEVM = (val: boolean) => {
    setShowEVM(val);
    setPref(`gantt_${id}_showEVM`, val);
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
  const canWrite = !!myRole && versionCanWrite;

  const allTasks: Task[] = useMemo(() => (data?.tasks ?? []) as unknown as Task[], [data]);
  const taskMap = useMemo(() => new Map(allTasks.map((t) => [t.id, t])), [allTasks]);
  const selectedTask = useMemo(
    () => (selectedTaskId ? allTasks.find((t) => t.id === selectedTaskId) ?? null : null),
    [selectedTaskId, allTasks]
  );

  const [taskFilter, setTaskFilter] = useState<"all" | "critical" | "in_progress" | "delayed" | "completed">("all");

  // ─── Link mode (visual dependency creation / removal) ────────────────
  const [linkMode, setLinkMode] = useState(false);
  const [linkSourceId, setLinkSourceId] = useState<string | null>(null);
  const [pendingLink, setPendingLink] = useState<{ taskId: string; predecessorId: string } | null>(null);
  const [linkType, setLinkType] = useState<"FS" | "SS" | "FF" | "SF">("FS");
  const [linkOffset, setLinkOffset] = useState(0);
  const createDepMut = trpc.gantt.addDependency.useMutation({
    onSuccess: (res) => {
      utils.gantt.list.invalidate({ projectId: id });
      if (res && typeof res.updatedCount === "number" && res.updatedCount > 0) {
        toast.success(`Dependency linked — ${res.updatedCount} downstream task${res.updatedCount > 1 ? "s" : ""} rescheduled`);
      } else {
        toast.success("Dependency linked");
      }
      setLinkSourceId(null);
    },
    onError: (e) => toast.error(e.message),
  });
  const deleteDepMut = trpc.gantt.removeDependency.useMutation({
    onSuccess: (res) => {
      utils.gantt.list.invalidate({ projectId: id });
      if (res && typeof res.updatedCount === "number" && res.updatedCount > 0) {
        toast.success(`Dependency removed — ${res.updatedCount} downstream task${res.updatedCount > 1 ? "s" : ""} rescheduled`);
      } else {
        toast.success("Dependency removed");
      }
    },
    onError: (e) => toast.error(e.message),
  });
  const handleBarClick = useCallback(
    (taskId: string) => {
      if (!linkMode) return;
      if (!linkSourceId) {
        setLinkSourceId(taskId);
        return;
      }
      if (linkSourceId === taskId) {
        setLinkSourceId(null);
        return;
      }
      setPendingLink({ taskId, predecessorId: linkSourceId });
      setLinkSourceId(null);
      setLinkType("FS");
      setLinkOffset(0);
    },
    [linkMode, linkSourceId]
  );
  const handleArrowClick = useCallback(
    (taskId: string, predecessorId: string) => {
      if (!linkMode) return;
      deleteDepMut.mutate({ taskId, predecessorId });
    },
    [linkMode, deleteDepMut]
  );
  const handleLinkFromDrag = useCallback(
    (sourceId: string, targetId: string) => {
      setPendingLink({ taskId: targetId, predecessorId: sourceId });
      setLinkType("FS");
      setLinkOffset(0);
    },
    []
  );

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

  const [baselineSnapshot, setBaselineSnapshot] = useState<{ id: string; code?: string | null; name?: string; startDate: string; endDate: string }[] | null>(() => {
    if (typeof window !== "undefined") {
      try {
        const saved = localStorage.getItem(`gantt-baseline-${id}`);
        if (saved) return JSON.parse(saved);
      } catch {}
    }
    return null;
  });
  const [isBaselineSnapshotActive, setIsBaselineSnapshotActive] = useState(false);

  const handleCaptureBaseline = useCallback(() => {
    if (!allTasks || allTasks.length === 0) return;
    const snapshot = allTasks.map((t) => ({
      id: t.id,
      code: t.code,
      name: t.name,
      startDate: t.startDate,
      endDate: t.endDate,
    }));
    setBaselineSnapshot(snapshot);
    setIsBaselineSnapshotActive(true);
    if (typeof window !== "undefined") {
      localStorage.setItem(`gantt-baseline-${id}`, JSON.stringify(snapshot));
    }
    toast.success(`Captured ${snapshot.length} activities as baseline snapshot`);
  }, [allTasks, id]);

  const overlayMap = useMemo(() => {
    const map = new Map<string, { startDate: string; endDate: string }>();
    let tasksToUse: { id: string; code?: string | null; name?: string; startDate: string; endDate: string }[] = [];

    if (overlayData?.tasks && overlayVersionId) {
      tasksToUse = overlayData.tasks as unknown as Task[];
    } else if (isBaselineSnapshotActive && baselineSnapshot) {
      tasksToUse = baselineSnapshot;
    }

    if (tasksToUse.length === 0) return map;

    const byCode = new Map<string, { startDate: string; endDate: string }>();
    const byName = new Map<string, { startDate: string; endDate: string }>();

    for (const t of tasksToUse) {
      const dates = { startDate: t.startDate, endDate: t.endDate };
      map.set(t.id, dates);
      if (t.code) {
        map.set(t.code, dates);
        byCode.set(t.code, dates);
      }
      if (t.name) {
        byName.set(t.name, dates);
      }
    }

    for (const cur of allTasks) {
      if (!map.has(cur.id)) {
        if (cur.code && byCode.has(cur.code)) {
          map.set(cur.id, byCode.get(cur.code)!);
        } else if (cur.name && byName.has(cur.name)) {
          map.set(cur.id, byName.get(cur.name)!);
        }
      }
    }

    return map;
  }, [overlayData, overlayVersionId, isBaselineSnapshotActive, baselineSnapshot, allTasks]);

  const rootTasks = useMemo(() => filteredTasks.filter((t) => !t.parentId), [filteredTasks]);

  const [leftPanelWidth, setLeftPanelWidth] = useState<number>(() => {
    const saved = getPref<number>(`gantt_${id}_leftPanelWidth`) ?? getPref<number>("ganttLeftPanelWidth");
    if (saved && typeof saved === "number" && saved >= 160) return saved;
    if (typeof window !== "undefined") {
      const local = localStorage.getItem("ganttActivityGridWidthV2");
      if (local) {
        const parsed = parseInt(local, 10);
        if (!isNaN(parsed) && parsed >= 160) return parsed;
      }
    }
    return 640;
  });
  const leftPanelWidthRef = useRef(leftPanelWidth);
  useEffect(() => {
    leftPanelWidthRef.current = leftPanelWidth;
  }, [leftPanelWidth]);

  const dividerRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const [hasManuallyResized, setHasManuallyResized] = useState(false);

  // Sync left panel width from cloud preferences
  useEffect(() => {
    const saved = getPref<number>(`gantt_${id}_leftPanelWidth`) ?? getPref<number>("ganttLeftPanelWidth");
    if (saved && typeof saved === "number" && saved >= 160 && !hasManuallyResized) {
      setLeftPanelWidth(saved);
    }
  }, [getPref, id, hasManuallyResized]);

  const handleFitToProject = useCallback(() => {
    const baseW = getDayWidth(zoom);
    const panelW = Math.max(300, (typeof window !== "undefined" ? window.innerWidth : 1400) - leftPanelWidth - 330);
    if (days <= 0 || baseW <= 0) return;
    const scale = Math.min(6, Math.max(0.2, (panelW - 20) / (days * baseW)));
    const rounded = Number(scale.toFixed(2));
    setZoomScale(rounded);
    setPref("ganttZoomScale", rounded);
  }, [zoom, days, leftPanelWidth, setPref]);

  const handleToggleTaskNameOnly = useCallback(() => {
    const nextW = leftPanelWidth <= 260 ? 640 : 240;
    setLeftPanelWidth(nextW);
    setHasManuallyResized(true);
    setPref(`gantt_${id}_leftPanelWidth`, nextW);
    setPref("ganttLeftPanelWidth", nextW);
    if (typeof window !== "undefined") {
      localStorage.setItem("ganttActivityGridWidthV2", String(nextW));
    }
  }, [leftPanelWidth, id, setPref]);

  const handleToggleBaseline = useCallback(() => {
    if (overlayVersionId || isBaselineSnapshotActive) {
      setOverlayVersionId(undefined);
      setIsBaselineSnapshotActive(false);
      toast.info("Baseline overlay hidden");
      return;
    }
    const baseline =
      versionsData?.versions?.find((v) => v.status === "APPROVED" && v.id !== currentVersion?.id) ??
      versionsData?.versions?.find((v) => v.id !== currentVersion?.id);
    if (baseline) {
      setOverlayVersionId(baseline.id);
      toast.success(`Overlaying baseline from v${baseline.versionNumber} (${baseline.name || baseline.status})`);
      return;
    }
    if (baselineSnapshot && baselineSnapshot.length > 0) {
      setIsBaselineSnapshotActive(true);
      toast.success("Overlaying captured baseline snapshot");
      return;
    }
    handleCaptureBaseline();
  }, [overlayVersionId, isBaselineSnapshotActive, versionsData, currentVersion, baselineSnapshot, handleCaptureBaseline]);

  const startDrag = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    dragging.current = true;
    setHasManuallyResized(true);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    // Anchor to the divider's own container so the width is relative to the
    // gantt area (not the window), and leave room for the timeline panel.
    const dividerRect = (e.currentTarget as HTMLElement).parentElement?.getBoundingClientRect();
    const containerLeft = dividerRect?.left ?? 0;
    const minW = 160;
    const maxW = Math.max(minW, (window.innerWidth - containerLeft - 340));
    const onMove = (ev: MouseEvent) => {
      if (!dragging.current) return;
      setLeftPanelWidth(Math.min(Math.max(ev.clientX - containerLeft, minW), maxW));
    };
    const onUp = () => {
      dragging.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      setPref(`gantt_${id}_leftPanelWidth`, leftPanelWidthRef.current);
      setPref("ganttLeftPanelWidth", leftPanelWidthRef.current);
      if (typeof window !== "undefined") {
        localStorage.setItem("ganttActivityGridWidthV2", String(leftPanelWidthRef.current));
      }
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }, [id, setPref]);

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

  const dayLabels = useMemo(() => {
    return Array.from({ length: days }, (_, i) => {
      const d = addDays(rangeStart, i);
      const dow = d.getDay();
      const isFirstOfMonth = d.getDate() === 1;
      const isMonday = dow === 1;
      // Look up Nepal public holidays (Dashain, Tihar, etc.) from the
      // static nepal-calendar.ts table. getHolidayName returns null for
      // working days. isHoliday is a fast Set-based lookup.
      const holidayName = getHolidayName(d);
      const dayIsHoliday = holidayName !== null;
      let label: string;
      const isFirstOfYear = d.getMonth() === 0 && d.getDate() === 1;
      if (zoom === "day") label = format(d, "dd MMM");
      else if (zoom === "month") label = isFirstOfMonth ? format(d, "MMM") : "";
      else label = isFirstOfYear ? format(d, "yyyy") : "";
      return {
        date: d,
        label,
        isWeekend: dow === 6,
        isFirstOfMonth,
        isMonday,
        isFirstOfYear: d.getMonth() === 0 && d.getDate() === 1,
        isHoliday: dayIsHoliday,
        holidayName: holidayName ?? undefined,
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
      style={{ "--navy-deep": "#fbf8f2", "--navy-mid": "#e8dfd2" } as CSSProperties}
      className={cn(
        "h-[calc(100vh-146px)] flex flex-col font-mono bg-background",
        fullScreen && "fixed inset-0 z-50 bg-background p-3"
      )}
    >
      <GanttCommandBar
        id={id}
        activeView={activeView}
        onViewChange={handleActiveViewChange}
        editingMode={editingMode}
        onEditingModeChange={handleEditingModeChange}
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
        setShowCriticalPath={handleToggleCriticalPath}
        calculateAll={calculateAll}
        canWrite={canWrite}
        showVariance={showVariance}
        setShowVariance={handleToggleVariance}
        showConflicts={showConflicts}
        setShowConflicts={handleToggleConflicts}
        conflictsData={conflictsData}
        showEVM={showEVM}
        setShowEVM={handleToggleEVM}
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
        onFitToProject={handleFitToProject}
        onToggleBaseline={handleToggleBaseline}
        isBaselineActive={isBaselineSnapshotActive}
        onCaptureBaseline={handleCaptureBaseline}
        linkMode={linkMode}
        setLinkMode={setLinkMode}
      />

      <div className="flex-1 min-h-0 border-x border-b border-border/90 overflow-hidden bg-card/65">
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
            {!canWrite && myRole && (
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
          <div className="flex h-full w-full overflow-hidden">
            <div className="flex-1 min-w-0 h-full overflow-hidden">
              {activeView === "network" ? (
                <NetworkPertView
                  tasks={allTasks}
                  criticalTaskIds={criticalTaskIds}
                  floatMap={floatMap}
                  selectedTaskId={selectedTaskId}
                  onSelectTask={(tid) => {
                    setSelectedTaskId(tid);
                    setInspectorVisible(true);
                  }}
                />
              ) : activeView === "resources" ? (
                <ResourceSwimlaneView
                  tasks={allTasks}
                  rangeStart={rangeStart}
                  days={days}
                  selectedTaskId={selectedTaskId}
                  onSelectTask={(tid) => {
                    setSelectedTaskId(tid);
                    setInspectorVisible(true);
                  }}
                  canWrite={canWrite}
                />
              ) : activeView === "calendar" ? (
                <CalendarWorkWeekView projectId={id} />
              ) : activeView === "styles" ? (
                <StylesSettingsView projectId={id} />
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
                  onToggleTaskNameOnly={handleToggleTaskNameOnly}
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
                  linkMode={linkMode}
                  linkSourceId={linkSourceId}
                  onBarClick={handleBarClick}
                  onArrowClick={handleArrowClick}
                  onAddTask={() => setAddTaskTrigger((n) => n + 1)}
                  onViolationClick={() => setShowConflicts(true)}
                  onLinkFromDrag={handleLinkFromDrag}
                  selectedTaskId={selectedTaskId}
                  onSelectTaskId={setSelectedTaskId}
                />
              )}
            </div>

            {/* In non-Gantt views, render TaskInspector docked on the right when visible & task selected */}
            {activeView !== "tasks" && inspectorVisible && selectedTask && (
              <TaskInspector
                task={selectedTask}
                allTasks={allTasks}
                canWrite={canWrite}
                projectId={id}
                onClose={handleToggleInspector}
                utils={utils}
                pushAction={pushAction}
                onReplicate={(task) => {
                  setReplicateSourceTask(task);
                  setTemplatesModalOpen(true);
                }}
                overlayMap={overlayMap}
              />
            )}
          </div>
        )}
      </div>

      {allTasks.length > 0 && activeView !== "styles" && activeView !== "calendar" && (
        <footer className="flex h-7 shrink-0 items-center gap-3 border-t border-border/70 px-2 text-[9px] font-mono text-muted-foreground">
          <span className="flex items-center gap-2">
            <LegendSwatch className="bg-[#4a8b57]" label="Done" />
            <LegendSwatch className="bg-[#f59e0b]" label="In-progress" />
            <LegendSwatch className="bg-[#dc2626]" label="Critical / late" />
            <LegendSwatch className="bg-[#3f7180]" label="Not started" />
            <LegendSwatch diamond className="bg-[#f59e0b]" label="Milestone" />
          </span>
          <span className="h-3 w-px bg-border" />
          <span>{allTasks.length} activities</span>
          <span>·</span>
          <span>{criticalTaskIds.size} critical</span>
          <span>·</span>
          <span>{Math.round(allTasks.reduce((sum, task) => sum + (rolledUpProgress.get(task.id) ?? task.progress ?? 0), 0) / allTasks.length)}% complete</span>
          <span>·</span>
          <span>Finish {format(new Date(Math.max(...allTasks.map((task) => new Date(task.endDate).getTime()))), "dd MMM yyyy")}</span>
        </footer>
      )}

      {/* Dependency link type picker */}
      <Dialog open={!!pendingLink} onOpenChange={(open) => { if (!open) setPendingLink(null); }}>
        <DialogContent className="sm:max-w-[360px] p-0 gap-0 bg-card border border-[var(--border)] text-foreground rounded-2xl overflow-hidden font-sans">
          <DialogHeader className="px-5 py-3 border-b border-[var(--input)] bg-[#f8fbfe]">
            <DialogTitle className="text-sm font-bold text-foreground">Link tasks</DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">Pick the dependency type and lag.</DialogDescription>
          </DialogHeader>
          <div className="p-5 space-y-3 text-xs">
            <div className="grid grid-cols-4 gap-1.5">
              {(["FS", "SS", "FF", "SF"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setLinkType(t)}
                  className={`h-8 rounded-[4px] border text-[10px] font-bold transition-colors ${linkType === t ? "border-primary bg-primary/10 text-primary" : "border-[var(--border)] bg-card text-muted-foreground hover:text-foreground"}`}
                  title={{ FS: "Finish → Start", SS: "Start → Start", FF: "Finish → Finish", SF: "Start → Finish" }[t]}
                >
                  {t}
                  <span className="block text-[8px] font-normal">{({ FS: "Fin→Sta", SS: "Sta→Sta", FF: "Fin→Fin", SF: "Sta→Fin" } as const)[t]}</span>
                </button>
              ))}
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-muted-foreground">Lag (days)</span>
              <div className="flex items-center gap-1.5">
                <button type="button" onClick={() => setLinkOffset((o) => o - 1)} className="h-6 w-6 rounded border border-[var(--border)]">−</button>
                <span className="min-w-[24px] text-center font-mono">{linkOffset}</span>
                <button type="button" onClick={() => setLinkOffset((o) => o + 1)} className="h-6 w-6 rounded border border-[var(--border)]">+</button>
              </div>
            </div>
          </div>
          <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-[var(--input)]">
            <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={() => setPendingLink(null)}>Cancel</Button>
            <Button
              size="sm"
              className="h-7 text-[11px] font-bold"
              disabled={createDepMut.isPending || !pendingLink}
              onClick={() => {
                if (!pendingLink) return;
                createDepMut.mutate({ taskId: pendingLink.taskId, predecessorId: pendingLink.predecessorId, type: linkType, offset: linkOffset });
                setPendingLink(null);
              }}
            >
              Link
            </Button>
          </div>
        </DialogContent>
      </Dialog>

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
    </div>
  );
}
