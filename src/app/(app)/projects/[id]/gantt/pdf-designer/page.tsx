"use client";

import { use, useEffect, useState, useMemo, useRef } from "react";
import { trpc } from "@/lib/trpc-client";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { 
  Printer, ArrowLeft, Settings, Columns, Layers, FileText, Layout, 
  ChevronLeft, Plus, Minus, Eye, Check, RefreshCw 
} from "lucide-react";
import { addDays, format, differenceInDays } from "date-fns";
import { computeDateRange, computeRolledUpProgress, getDayWidth, getTaskRowHeight, getDeps, computeFloatMap, getBarStatus, computeCriticalPath } from "../utils";
import type { Task, ZoomLevel } from "../types";
import { TaskList } from "../components/TaskList";
import { Timeline, type DayLabel } from "../components/Timeline";
import { TimelineHeader } from "../components/TimelineHeader";
import { DependencyArrow } from "../components/DependencyArrow";
import { TaskBar } from "../components/TaskBar";

export interface GanttPrintSettings {
  paperSize: "A3" | "A4";
  orientation: "landscape" | "portrait";
  margin: number;
  timelineFitMode: "fit-width" | "multi-page";
  customDayWidth: number;
  showLogo: boolean;
  documentTitle: string;
  documentSubtitle: string;
  showProjectName: boolean;
  showClientName: boolean;
  showDateRange: boolean;
  showProgress: boolean;
  zoomLevel: "day" | "week" | "month";
  showBaseline: boolean;
  highlightCriticalPath: boolean;
  showWBSColumn: boolean;
  showDatesColumn: boolean;
  showDurationColumn: boolean;
  showProgressColumn: boolean;
  columnWidths: {
    wbs: number;
    task: number;
    dates: number;
    duration: number;
    progress: number;
  };
  footerNote: string;
  showPrintDate: boolean;
  showDependencies: boolean;
}

const DEFAULT_SETTINGS: GanttPrintSettings = {
  paperSize: "A3",
  orientation: "landscape",
  margin: 15,
  timelineFitMode: "fit-width",
  customDayWidth: 15,
  showLogo: true,
  documentTitle: "Project Construction Schedule",
  documentSubtitle: "Main Execution Plan",
  showProjectName: true,
  showClientName: true,
  showDateRange: true,
  showProgress: true,
  zoomLevel: "week",
  showBaseline: true,
  highlightCriticalPath: true,
  showWBSColumn: true,
  showDatesColumn: true,
  showDurationColumn: true,
  showProgressColumn: true,
  columnWidths: {
    wbs: 45,
    task: 180,
    dates: 120,
    duration: 65,
    progress: 65,
  },
  footerNote: "Confidential - For Internal Use Only",
  showPrintDate: true,
  showDependencies: true,
};

export default function GanttPdfDesignerPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);

  // 1. Fetch data
  const { data: versionsData, isLoading: versionsLoading } = trpc.gantt.listVersions.useQuery({ projectId: id });
  const activeVersion = versionsData?.versions.find(v => v.status === "APPROVED") || versionsData?.versions[0];
  const { data: scheduleData, isLoading: scheduleLoading } = trpc.gantt.list.useQuery(
    { projectId: id, versionId: activeVersion?.id },
    { enabled: !!activeVersion?.id }
  );
  const { data: projectInfo, isLoading: projectLoading } = trpc.project.get.useQuery({ id }, { staleTime: 300_000 });

  // 2. Settings state
  const [settings, setSettings] = useState<GanttPrintSettings>(DEFAULT_SETTINGS);
  const [activeTab, setActiveTab] = useState<"layout" | "header" | "columns" | "footer">("layout");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [canvasZoom, setCanvasZoom] = useState(80);

  // Read saved settings
  useEffect(() => {
    try {
      const key = `gantt-print-settings-${id}`;
      const saved = localStorage.getItem(key);
      if (saved) {
        const parsed = JSON.parse(saved);
        setSettings(prev => ({
          ...prev,
          ...parsed,
          columnWidths: {
            ...prev.columnWidths,
            ...(parsed.columnWidths || {}),
          }
        }));
      }
    } catch { /* ignore */ }
  }, [id]);

  // Save settings helper
  const updateSetting = <K extends keyof GanttPrintSettings>(key: K, value: GanttPrintSettings[K]) => {
    setSettings(prev => {
      const next = { ...prev, [key]: value };
      localStorage.setItem(`gantt-print-settings-${id}`, JSON.stringify(next));
      return next;
    });
  };

  const updateColumnWidth = (col: keyof GanttPrintSettings["columnWidths"], width: number) => {
    setSettings(prev => {
      const next = {
        ...prev,
        columnWidths: {
          ...prev.columnWidths,
          [col]: Math.max(25, width),
        }
      };
      localStorage.setItem(`gantt-print-settings-${id}`, JSON.stringify(next));
      return next;
    });
  };

  // 3. Render calculations
  const allTasks = useMemo(() => (scheduleData?.tasks as unknown as Task[]) || [], [scheduleData]);
  const rootTasks = useMemo(() => allTasks.filter(t => !t.parentId), [allTasks]);
  const taskMap = useMemo(() => new Map(allTasks.map(t => [t.id, t])), [allTasks]);
  const { rangeStart, days } = useMemo(() => computeDateRange(allTasks), [allTasks]);
  const rolledUpProgress = useMemo(() => computeRolledUpProgress(allTasks), [allTasks]);
  const floatMap = useMemo(() => computeFloatMap(allTasks), [allTasks]);
  const criticalTaskIds = useMemo(() => computeCriticalPath(allTasks), [allTasks]);

  const flattened = useMemo(() => {
    const result: { task: Task; depth: number }[] = [];
    function walk(list: Task[], depth: number) {
      for (const t of list) {
        result.push({ task: t, depth });
        const children = allTasks.filter(ch => ch.parentId === t.id);
        if (children.length > 0) walk(children, depth + 1);
      }
    }
    walk(rootTasks, 0);
    return result;
  }, [rootTasks, allTasks]);

  // Page width/height logic based on paper choice
  // A3: 420mm x 297mm | A4: 297mm x 210mm
  const pageDimensions = useMemo(() => {
    const isA3 = settings.paperSize === "A3";
    const isLandscape = settings.orientation === "landscape";
    
    let wMm = isA3 ? 420 : 297;
    let hMm = isA3 ? 297 : 210;
    
    if (!isLandscape) {
      const tmp = wMm;
      wMm = hMm;
      hMm = tmp;
    }
    
    return { wMm, hMm };
  }, [settings.paperSize, settings.orientation]);

  // Total Task List Left Panel width
  const totalLeftColumnsWidth = useMemo(() => {
    let w = 20; // margins
    if (settings.showWBSColumn) w += settings.columnWidths.wbs;
    w += settings.columnWidths.task;
    if (settings.showDatesColumn) w += settings.columnWidths.dates;
    if (settings.showDurationColumn) w += settings.columnWidths.duration;
    if (settings.showProgressColumn) w += settings.columnWidths.progress;
    return w;
  }, [settings]);

  // Print Timeline SVG width & dayWidth computation
  // A3 Landscape is 420mm wide. Standard print DPI mapping is ~3.78px per mm
  const MM_TO_PX = 3.7795;
  const pageWpx = pageDimensions.wMm * MM_TO_PX;
  const pageHpx = pageDimensions.hMm * MM_TO_PX;
  const marginsPx = settings.margin * 2 * MM_TO_PX;
  const availableWidthPx = pageWpx - marginsPx;

  const calculatedDayWidth = useMemo(() => {
    if (!days) return 5;
    if (settings.timelineFitMode === "fit-width") {
      const remainingTimelineWidth = availableWidthPx - totalLeftColumnsWidth - 25; // 25px timeline margin spacing
      return Math.max(0.5, remainingTimelineWidth / days);
    } else {
      // Manual slider scale
      return settings.customDayWidth;
    }
  }, [days, settings.timelineFitMode, settings.customDayWidth, availableWidthPx, totalLeftColumnsWidth]);

  const svgWidth = useMemo(() => {
    if (!days) return 200;
    return days * calculatedDayWidth + 20;
  }, [days, calculatedDayWidth]);

  // Generate day labels
  const dayLabels = useMemo(() => {
    if (!rangeStart || !days) return [];
    const zoom: ZoomLevel = calculatedDayWidth < 2 ? "month" : calculatedDayWidth < 8 ? "week" : "day";
    return Array.from({ length: days }, (_, i) => {
      const d = addDays(rangeStart, i);
      const dow = d.getDay();
      const isFirstOfMonth = d.getDate() === 1;
      const isMonday = dow === 1;
      let label = "";
      if (zoom === "day") label = format(d, "dd MMM");
      else if (zoom === "week") label = isMonday ? format(d, "MMM d") : "";
      else label = isFirstOfMonth ? format(d, "MMM") : "";
      return { date: d, label, isWeekend: dow === 6 || dow === 0, isFirstOfMonth, isMonday, isFirstOfYear: d.getMonth() === 0 && d.getDate() === 1 };
    });
  }, [rangeStart, days, calculatedDayWidth]);

  const rowHeights = useMemo(() => {
    return flattened.map(({ task, depth }) => getTaskRowHeight(task.name, depth, settings.columnWidths.task));
  }, [flattened, settings.columnWidths.task]);


  const deps = useMemo(() => {
    const result: { from: Task; to: Task; x1: number; x2: number; index: number; type: string; offset: number }[] = [];
    let idx = 0;
    for (const { task } of flattened) {
      for (const dep of getDeps(task)) {
        const fromTask = taskMap.get(dep.taskId);
        if (!fromTask) continue;
        const fromStart = differenceInDays(new Date(fromTask.startDate), rangeStart || new Date());
        const fromEnd = differenceInDays(new Date(fromTask.endDate), rangeStart || new Date()) + 1;
        const toStart = differenceInDays(new Date(task.startDate), rangeStart || new Date());
        const toEnd = differenceInDays(new Date(task.endDate), rangeStart || new Date()) + 1;
        let x1: number, x2: number;
        switch (dep.type) {
          case "SS": x1 = fromStart; x2 = toStart; break;
          case "FF": x1 = fromEnd; x2 = toEnd; break;
          case "SF": x1 = fromStart; x2 = toEnd; break;
          case "FS":
          default:   x1 = fromEnd; x2 = toStart; break;
        }
        x2 += dep.offset || 0;
        result.push({ from: fromTask, to: task, x1, x2, index: idx++, type: dep.type, offset: dep.offset || 0 });
      }
    }
    return result;
  }, [flattened, taskMap, rangeStart]);

  const rowOffsets = useMemo(() => {
    const offsets: number[] = [];
    let current = 0;
    for (const h of rowHeights) {
      offsets.push(current);
      current += h;
    }
    return { offsets, totalHeight: current + 40 };
  }, [rowHeights]);

  const totalHeight = rowOffsets.totalHeight;

  // Determine split pages horizontally in multi-page mode
  const numHorizontalPages = useMemo(() => {
    if (settings.timelineFitMode === "fit-width") return 1;
    const firstPageWidth = availableWidthPx - totalLeftColumnsWidth;
    if (svgWidth <= firstPageWidth) return 1;
    return 1 + Math.ceil((svgWidth - firstPageWidth) / availableWidthPx);
  }, [settings.timelineFitMode, svgWidth, availableWidthPx, totalLeftColumnsWidth]);

  const getTimelineTranslationX = (pIdx: number) => {
    if (pIdx === 0) return 0;
    const firstPageWidth = availableWidthPx - totalLeftColumnsWidth;
    return firstPageWidth + (pIdx - 1) * availableWidthPx;
  };

  const handlePrint = () => {
    // Open print preview in new window
    window.open(`/projects/${id}/gantt/pdf-designer/print`, "_blank", "noopener,noreferrer");
  };

  const isLoading = versionsLoading || scheduleLoading || projectLoading;

  if (isLoading || !scheduleData) {
    return (
      <div className="flex h-screen bg-slate-900 text-slate-100 items-center justify-center">
        <div className="space-y-4 text-center">
          <RefreshCw className="h-10 w-10 animate-spin text-emerald-500 mx-auto" />
          <p className="text-sm text-slate-400">Loading Gantt Print Designer...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden bg-slate-950 text-slate-100 font-sans">
      {/* 1. LEFT SIDEBAR PANEL */}
      <div className={`${sidebarOpen ? "w-[380px]" : "w-[64px]"} shrink-0 border-r border-slate-800 bg-slate-900 flex flex-col z-20 transition-all duration-300`}>
        {/* Sidebar Header */}
        <div className={`p-4 border-b border-slate-800 flex items-center ${sidebarOpen ? "justify-between" : "justify-center"} overflow-hidden shrink-0`}>
          {sidebarOpen ? (
            <>
              <div className="flex items-center gap-2 shrink-0">
                <Button size="icon" variant="ghost" className="h-8 w-8 hover:bg-slate-800" asChild>
                  <a href={`/projects/${id}/gantt`}>
                    <ChevronLeft className="h-4 w-4 text-slate-400" />
                  </a>
                </Button>
                <h1 className="text-base font-semibold tracking-tight text-white truncate">Gantt PDF Designer</h1>
              </div>
              <Button size="icon" variant="ghost" className="h-8 w-8 hover:bg-slate-800 shrink-0 text-slate-400" onClick={() => setSidebarOpen(false)}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
            </>
          ) : (
            <Button size="icon" variant="ghost" className="h-8 w-8 hover:bg-slate-800 text-slate-400" onClick={() => setSidebarOpen(true)}>
              <Settings className="h-4 w-4" />
            </Button>
          )}
        </div>

        {/* Sidebar Tab Selector */}
        <div className={`flex bg-slate-950/40 ${sidebarOpen ? "p-1" : "flex-col p-1 gap-2"} border-b border-slate-800 text-xs font-medium shrink-0`}>
          <button onClick={() => { setActiveTab("layout"); setSidebarOpen(true); }} className={`flex-1 py-2 flex items-center justify-center rounded transition-colors ${activeTab === "layout" ? "bg-slate-800 text-white font-semibold" : "text-slate-400 hover:text-slate-200"}`} title="Setup">
            <Layout className="h-4 w-4" />
            {sidebarOpen && <span className="ml-2">Setup</span>}
          </button>
          <button onClick={() => { setActiveTab("header"); setSidebarOpen(true); }} className={`flex-1 py-2 flex items-center justify-center rounded transition-colors ${activeTab === "header" ? "bg-slate-800 text-white font-semibold" : "text-slate-400 hover:text-slate-200"}`} title="Header">
            <FileText className="h-4 w-4" />
            {sidebarOpen && <span className="ml-2">Header</span>}
          </button>
          <button onClick={() => { setActiveTab("columns"); setSidebarOpen(true); }} className={`flex-1 py-2 flex items-center justify-center rounded transition-colors ${activeTab === "columns" ? "bg-slate-800 text-white font-semibold" : "text-slate-400 hover:text-slate-200"}`} title="Columns">
            <Columns className="h-4 w-4" />
            {sidebarOpen && <span className="ml-2">Columns</span>}
          </button>
          <button onClick={() => { setActiveTab("footer"); setSidebarOpen(true); }} className={`flex-1 py-2 flex items-center justify-center rounded transition-colors ${activeTab === "footer" ? "bg-slate-800 text-white font-semibold" : "text-slate-400 hover:text-slate-200"}`} title="Footer">
            <Layers className="h-4 w-4" />
            {sidebarOpen && <span className="ml-2">Footer</span>}
          </button>
        </div>

        {/* Sidebar Content Scroll Area */}
        {sidebarOpen && (
          <div className="flex-1 overflow-y-auto p-4 space-y-5 text-sm">
          {/* TAB 1: LAYOUT & PAGE SETUP */}
          {activeTab === "layout" && (
            <div className="space-y-4">
              <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5"><Layout className="h-3.5 w-3.5" /> Page Layout Setup</h2>
              
              <div className="space-y-2">
                <Label className="text-xs text-slate-300">Paper Size</Label>
                <div className="grid grid-cols-2 gap-2">
                  <Button size="sm" variant={settings.paperSize === "A3" ? "default" : "outline"} onClick={() => updateSetting("paperSize", "A3")} className={settings.paperSize === "A3" ? "bg-emerald-600 text-white hover:bg-emerald-700" : "border-slate-700 hover:bg-slate-800"}>A3 (Landscape)</Button>
                  <Button size="sm" variant={settings.paperSize === "A4" ? "default" : "outline"} onClick={() => updateSetting("paperSize", "A4")} className={settings.paperSize === "A4" ? "bg-emerald-600 text-white hover:bg-emerald-700" : "border-slate-700 hover:bg-slate-800"}>A4 (Draft checking)</Button>
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-xs text-slate-300">Orientation</Label>
                <div className="grid grid-cols-2 gap-2">
                  <Button size="sm" variant={settings.orientation === "landscape" ? "default" : "outline"} onClick={() => updateSetting("orientation", "landscape")} className={settings.orientation === "landscape" ? "bg-emerald-600 text-white hover:bg-emerald-700" : "border-slate-700 hover:bg-slate-800"}>Landscape</Button>
                  <Button size="sm" variant={settings.orientation === "portrait" ? "default" : "outline"} onClick={() => updateSetting("orientation", "portrait")} className={settings.orientation === "portrait" ? "bg-emerald-600 text-white hover:bg-emerald-700" : "border-slate-700 hover:bg-slate-800"}>Portrait</Button>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <Label className="text-xs text-slate-300">Page Margins (mm)</Label>
                  <span className="text-xs text-slate-400 font-mono">{settings.margin}mm</span>
                </div>
                <Slider value={[settings.margin]} onValueChange={([val]) => updateSetting("margin", val)} min={5} max={30} step={1} className="py-2" />
              </div>

              <div className="pt-2 border-t border-slate-800 space-y-4">
                <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5"><Layers className="h-3.5 w-3.5" /> Timeline Fit Mode</h3>
                
                <div className="space-y-3">
                  <div className="flex items-center justify-between bg-slate-950/30 p-2.5 rounded border border-slate-800">
                    <div className="space-y-0.5">
                      <Label className="text-xs text-slate-200 font-medium">Fit to 1 Page Width</Label>
                      <p className="text-[10px] text-slate-400">Scale timeline to fit exactly on page width</p>
                    </div>
                    <Switch checked={settings.timelineFitMode === "fit-width"} onCheckedChange={(checked) => updateSetting("timelineFitMode", checked ? "fit-width" : "multi-page")} />
                  </div>

                  {settings.timelineFitMode === "multi-page" && (
                    <div className="space-y-2.5 p-3 bg-slate-950/20 rounded border border-slate-800/80">
                      <div className="flex justify-between items-center">
                        <Label className="text-xs text-slate-300">Timeline Width (Day Zoom)</Label>
                        <span className="text-xs text-slate-400 font-mono">{settings.customDayWidth}px/day</span>
                      </div>
                      <Slider value={[settings.customDayWidth]} onValueChange={([val]) => updateSetting("customDayWidth", val)} min={2} max={45} step={1} className="py-1" />
                      <div className="flex gap-2">
                        <Button size="sm" variant="outline" className="flex-1 text-[10px] h-7" onClick={() => updateSetting("customDayWidth", 3)}>Day</Button>
                        <Button size="sm" variant="outline" className="flex-1 text-[10px] h-7" onClick={() => updateSetting("customDayWidth", 8)}>Week</Button>
                        <Button size="sm" variant="outline" className="flex-1 text-[10px] h-7" onClick={() => updateSetting("customDayWidth", 20)}>Month</Button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: DOCUMENT HEADER DETAILS */}
          {activeTab === "header" && (
            <div className="space-y-4">
              <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5"><FileText className="h-3.5 w-3.5" /> Header Configurations</h2>
              
              <div className="space-y-2">
                <Label className="text-xs text-slate-300">Document Title</Label>
                <Input value={settings.documentTitle} onChange={(e) => updateSetting("documentTitle", e.target.value)} className="bg-slate-950 border-slate-800 text-white placeholder-slate-600 focus-visible:ring-emerald-500" />
              </div>

              <div className="space-y-2">
                <Label className="text-xs text-slate-300">Document Subtitle</Label>
                <Input value={settings.documentSubtitle} onChange={(e) => updateSetting("documentSubtitle", e.target.value)} className="bg-slate-950 border-slate-800 text-white placeholder-slate-600 focus-visible:ring-emerald-500" />
              </div>

              <div className="pt-2 border-t border-slate-800 space-y-3">
                <Label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Show Info Metadata</Label>
                
                <div className="flex items-center justify-between">
                  <Label className="text-xs text-slate-300">Logo Placeholder</Label>
                  <Switch checked={settings.showLogo} onCheckedChange={(checked) => updateSetting("showLogo", checked)} />
                </div>
                <div className="flex items-center justify-between">
                  <Label className="text-xs text-slate-300">Project Name</Label>
                  <Switch checked={settings.showProjectName} onCheckedChange={(checked) => updateSetting("showProjectName", checked)} />
                </div>
                <div className="flex items-center justify-between">
                  <Label className="text-xs text-slate-300">Client Name</Label>
                  <Switch checked={settings.showClientName} onCheckedChange={(checked) => updateSetting("showClientName", checked)} />
                </div>
                <div className="flex items-center justify-between">
                  <Label className="text-xs text-slate-300">Date Range (Start/End)</Label>
                  <Switch checked={settings.showDateRange} onCheckedChange={(checked) => updateSetting("showDateRange", checked)} />
                </div>
                <div className="flex items-center justify-between">
                  <Label className="text-xs text-slate-300">Project Progress Tag</Label>
                  <Switch checked={settings.showProgress} onCheckedChange={(checked) => updateSetting("showProgress", checked)} />
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: TASK COLUMNS & WIDTHS */}
          {activeTab === "columns" && (
            <div className="space-y-4">
              <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5"><Columns className="h-3.5 w-3.5" /> Columns Visibility & Widths</h2>

              <div className="space-y-3">
                {/* WBS Column */}
                <div className="space-y-1.5 bg-slate-950/30 p-2.5 rounded border border-slate-800">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-medium text-slate-200">WBS Code Column</Label>
                    <Switch checked={settings.showWBSColumn} onCheckedChange={(checked) => updateSetting("showWBSColumn", checked)} />
                  </div>
                  {settings.showWBSColumn && (
                    <div className="flex gap-2 items-center pt-1.5">
                      <Label className="text-[10px] text-slate-400 shrink-0 w-16">Width (px)</Label>
                      <Slider value={[settings.columnWidths.wbs]} onValueChange={([val]) => updateColumnWidth("wbs", val)} min={30} max={90} step={5} className="flex-1" />
                      <span className="text-[10px] font-mono text-slate-400 w-8 text-right">{settings.columnWidths.wbs}px</span>
                    </div>
                  )}
                </div>

                {/* Task Name Column */}
                <div className="space-y-1.5 bg-slate-950/30 p-2.5 rounded border border-slate-800">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-medium text-slate-200">Task Description Column</Label>
                    <span className="text-[10px] text-emerald-400">Required</span>
                  </div>
                  <div className="flex gap-2 items-center pt-1.5">
                    <Label className="text-[10px] text-slate-400 shrink-0 w-16">Width (px)</Label>
                    <Slider value={[settings.columnWidths.task]} onValueChange={([val]) => updateColumnWidth("task", val)} min={120} max={300} step={10} className="flex-1" />
                    <span className="text-[10px] font-mono text-slate-400 w-8 text-right">{settings.columnWidths.task}px</span>
                  </div>
                </div>

                {/* Dates Column */}
                <div className="space-y-1.5 bg-slate-950/30 p-2.5 rounded border border-slate-800">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-medium text-slate-200">Dates Column (Start/End)</Label>
                    <Switch checked={settings.showDatesColumn} onCheckedChange={(checked) => updateSetting("showDatesColumn", checked)} />
                  </div>
                  {settings.showDatesColumn && (
                    <div className="flex gap-2 items-center pt-1.5">
                      <Label className="text-[10px] text-slate-400 shrink-0 w-16">Width (px)</Label>
                      <Slider value={[settings.columnWidths.dates]} onValueChange={([val]) => updateColumnWidth("dates", val)} min={80} max={200} step={10} className="flex-1" />
                      <span className="text-[10px] font-mono text-slate-400 w-8 text-right">{settings.columnWidths.dates}px</span>
                    </div>
                  )}
                </div>

                {/* Duration Column */}
                <div className="space-y-1.5 bg-slate-950/30 p-2.5 rounded border border-slate-800">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-medium text-slate-200">Duration Column</Label>
                    <Switch checked={settings.showDurationColumn} onCheckedChange={(checked) => updateSetting("showDurationColumn", checked)} />
                  </div>
                  {settings.showDurationColumn && (
                    <div className="flex gap-2 items-center pt-1.5">
                      <Label className="text-[10px] text-slate-400 shrink-0 w-16">Width (px)</Label>
                      <Slider value={[settings.columnWidths.duration]} onValueChange={([val]) => updateColumnWidth("duration", val)} min={40} max={120} step={5} className="flex-1" />
                      <span className="text-[10px] font-mono text-slate-400 w-8 text-right">{settings.columnWidths.duration}px</span>
                    </div>
                  )}
                </div>

                {/* Progress Column */}
                <div className="space-y-1.5 bg-slate-950/30 p-2.5 rounded border border-slate-800">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-medium text-slate-200">Progress (%) Column</Label>
                    <Switch checked={settings.showProgressColumn} onCheckedChange={(checked) => updateSetting("showProgressColumn", checked)} />
                  </div>
                  {settings.showProgressColumn && (
                    <div className="flex gap-2 items-center pt-1.5">
                      <Label className="text-[10px] text-slate-400 shrink-0 w-16">Width (px)</Label>
                      <Slider value={[settings.columnWidths.progress]} onValueChange={([val]) => updateColumnWidth("progress", val)} min={40} max={120} step={5} className="flex-1" />
                      <span className="text-[10px] font-mono text-slate-400 w-8 text-right">{settings.columnWidths.progress}px</span>
                    </div>
                  )}
                </div>
              </div>

              <div className="pt-2 border-t border-slate-800 space-y-3">
                <Label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Timeline Visual Settings</Label>
                <div className="flex items-center justify-between">
                  <Label className="text-xs text-slate-300">Show Baseline comparison</Label>
                  <Switch checked={settings.showBaseline} onCheckedChange={(checked) => updateSetting("showBaseline", checked)} />
                </div>
                <div className="flex items-center justify-between">
                  <Label className="text-xs text-slate-300">Highlight Critical Path</Label>
                  <Switch checked={settings.highlightCriticalPath} onCheckedChange={(checked) => updateSetting("highlightCriticalPath", checked)} />
                </div>
                <div className="flex items-center justify-between">
                  <Label className="text-xs text-slate-300">Show Dependency Arrows</Label>
                  <Switch checked={settings.showDependencies} onCheckedChange={(checked) => updateSetting("showDependencies", checked)} />
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: DOCUMENT FOOTER DETAILS */}
          {activeTab === "footer" && (
            <div className="space-y-4">
              <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5"><Layers className="h-3.5 w-3.5" /> Footer & Notes Settings</h2>
              
              <div className="space-y-2">
                <Label className="text-xs text-slate-300">Footer Text Note</Label>
                <Input value={settings.footerNote} onChange={(e) => updateSetting("footerNote", e.target.value)} className="bg-slate-950 border-slate-800 text-white placeholder-slate-600 focus-visible:ring-emerald-500" />
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-slate-800">
                <Label className="text-xs text-slate-300">Include Printed Date & Time</Label>
                <Switch checked={settings.showPrintDate} onCheckedChange={(checked) => updateSetting("showPrintDate", checked)} />
              </div>
            </div>
          )}
        </div>
        )}

        {/* Bottom Print Button */}
        <div className={`p-4 border-t border-slate-800 flex items-center ${sidebarOpen ? "justify-end" : "justify-center"} shrink-0`}>
          <Button size={sidebarOpen ? "sm" : "icon"} className="bg-emerald-600 hover:bg-emerald-700 text-white" onClick={handlePrint} title="Print PDF">
            <Printer className="h-3.5 w-3.5" />
            {sidebarOpen && <span className="ml-1.5">Print PDF</span>}
          </Button>
        </div>
      </div>

      {/* 2. DESIGNER WORKSPACE CANVAS */}
      <div className="flex-1 bg-slate-950 overflow-auto p-8 flex flex-col items-start select-none relative font-sans relative">
        <div className="min-w-fit w-full mb-4 flex justify-between items-center text-xs text-slate-400 sticky left-0 top-0 z-10 bg-slate-950/90 py-2 border-b border-slate-800 backdrop-blur-sm">
          <div className="flex gap-4 items-center">
            <span>Paper: <b className="text-slate-200">{settings.paperSize} ({settings.orientation})</b></span>
            <span>Scale: <b className="text-slate-200">{Math.round(calculatedDayWidth * 10) / 10}px/day</b></span>
            {settings.timelineFitMode === "multi-page" && (
              <span>Horizontal pages: <b className="text-emerald-400">{numHorizontalPages} pages wide</b></span>
            )}
            
            {/* Zoom Toolbar */}
            <div className="flex items-center gap-1 bg-slate-900 rounded border border-slate-800 p-0.5 ml-4">
              <Button variant="ghost" size="icon" className="h-6 w-6 text-slate-400 hover:text-white" onClick={() => setCanvasZoom(z => Math.max(20, z - 10))}>
                <Minus className="h-3 w-3" />
              </Button>
              <span className="w-12 text-center text-xs font-mono">{canvasZoom}%</span>
              <Button variant="ghost" size="icon" className="h-6 w-6 text-slate-400 hover:text-white" onClick={() => setCanvasZoom(z => Math.min(200, z + 10))}>
                <Plus className="h-3 w-3" />
              </Button>
              <Button variant="ghost" className="h-6 px-2 text-[10px] text-slate-400 hover:text-white" onClick={() => setCanvasZoom(100)}>
                Fit
              </Button>
            </div>
          </div>
          <div className="flex items-center gap-1 text-[11px] bg-slate-900 border border-slate-800/80 px-2 py-1 rounded text-slate-300 font-sans shrink-0">
            <Eye className="h-3.5 w-3.5 text-emerald-400" /> Print layout preview mode
          </div>
        </div>

        {/* Paper Sheet Preview container */}
        <div className="flex flex-col gap-6 items-start transform-gpu transition-transform origin-top-left" style={{ transform: `scale(${canvasZoom / 100})` }}>
          {Array.from({ length: numHorizontalPages }).map((_, pIdx) => {
            const isFirstPage = pIdx === 0;
            return (
              <div
                key={pIdx}
                className="bg-white border border-slate-300 shadow-2xl relative shrink-0 flex flex-col overflow-hidden text-slate-900 transition-all duration-300 font-sans"
                style={{
                  width: `${pageWpx}px`,
                  minHeight: `${pageHpx}px`,
                  padding: `${settings.margin * MM_TO_PX}px`,
                }}
              >
                {/* 1. Print Document Header — fixed height so all pages align identically */}
                <div className="shrink-0 border-b-2 border-slate-300 mb-4 font-sans" style={{ height: "88px", display: "flex", flexDirection: "column", justifyContent: "flex-end", paddingBottom: "12px" }}>
                  {isFirstPage ? (
                    <div className="flex justify-between items-end">
                      {/* Left: Title & Subtitle */}
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          {settings.showLogo && (
                            <div className="h-7 w-7 rounded bg-slate-900 flex items-center justify-center font-bold text-white text-[10px]">
                              CM
                            </div>
                          )}
                          <h2 className="text-xl font-bold tracking-tight text-slate-900">{settings.documentTitle}</h2>
                        </div>
                        <p className="text-xs font-medium text-slate-500 italic">{settings.documentSubtitle}</p>
                      </div>

                      {/* Right: Info metadata columns */}
                      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[10px] text-slate-600 bg-slate-50 p-2 rounded border border-slate-200 font-sans">
                        {settings.showProjectName && (
                          <>
                            <span className="font-semibold">Project:</span>
                            <span className="truncate max-w-[120px]">{projectInfo?.project?.name || "N/A"}</span>
                          </>
                        )}
                        {settings.showClientName && (
                          <>
                            <span className="font-semibold">Client:</span>
                            <span className="truncate max-w-[120px]">{projectInfo?.project?.client || "N/A"}</span>
                          </>
                        )}
                        {settings.showDateRange && (
                          <>
                            <span className="font-semibold">Schedule Period:</span>
                            <span>{rangeStart && days ? `${format(rangeStart, "dd MMM yy")} - ${format(addDays(rangeStart, days), "dd MMM yy")}` : "N/A"}</span>
                          </>
                        )}
                        {settings.showProgress && (
                          <>
                            <span className="font-semibold">Status:</span>
                            <span className="font-semibold text-emerald-600">{rolledUpProgress.get("root") ?? 0}% Complete</span>
                          </>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-end justify-between">
                      <span className="text-xs font-semibold text-slate-500 italic">{settings.documentTitle} — Schedule Continued...</span>
                      <span className="text-xs text-slate-400">Page {pIdx + 1} of {numHorizontalPages}</span>
                    </div>
                  )}
                </div>

                {/* 2. Print Gantt chart body viewport */}
                <div className="flex-1 flex overflow-hidden border border-slate-200 rounded font-sans bg-white">
                  {/* Column 1: Task list pane (Only on Page 1) */}
                  {isFirstPage && (
                    <div
                      className="shrink-0 border-r border-slate-200 flex flex-col bg-slate-50 font-sans"
                      style={{ width: `${totalLeftColumnsWidth}px` }}
                    >
                      {/* Fake header line */}
                      <div className="h-12 shrink-0 flex items-center border-b border-slate-200 px-1 text-[9px] font-bold text-slate-500 uppercase tracking-wider bg-slate-100 font-sans">
                        {settings.showWBSColumn && <span className="text-center shrink-0" style={{ width: settings.columnWidths.wbs }}>WBS</span>}
                        <span className="flex-1 pl-1 shrink-0" style={{ width: settings.columnWidths.task }}>Task</span>
                        {settings.showDatesColumn && <span className="text-center shrink-0" style={{ width: settings.columnWidths.dates }}>Dates</span>}
                        {settings.showDurationColumn && <span className="text-center shrink-0" style={{ width: settings.columnWidths.duration }}>Dur</span>}
                        {settings.showProgressColumn && <span className="text-center shrink-0" style={{ width: settings.columnWidths.progress }}>%</span>}
                      </div>

                      {/* Mock list mapping to show preview widths */}
                      <div className="flex-1 overflow-hidden text-[10px] text-slate-800 divide-y divide-slate-100 bg-white font-sans">
                        {flattened.map(({ task, depth }, idx) => (
                          <div key={task.id} className="flex items-center px-1 font-sans" style={{ height: `${rowHeights[idx]}px`, paddingLeft: `${depth * 8 + 4}px` }}>
                            {settings.showWBSColumn && (
                              <span className="text-slate-400 font-mono text-[9px] shrink-0" style={{ width: settings.columnWidths.wbs }}>
                                {idx + 1}
                              </span>
                            )}
                            <span className="flex-1 font-medium shrink-0 whitespace-normal break-words pr-2 leading-tight" style={{ width: settings.columnWidths.task }}>
                              {task.name}
                            </span>
                            {settings.showDatesColumn && (
                              <span className="text-slate-500 text-[9px] shrink-0 font-sans" style={{ width: settings.columnWidths.dates }}>
                                {format(new Date(task.startDate), "MMM dd")}
                              </span>
                            )}
                            {settings.showDurationColumn && (
                              <span className="text-slate-500 text-center shrink-0" style={{ width: settings.columnWidths.duration }}>
                                {task.duration || 1}d
                              </span>
                            )}
                            {settings.showProgressColumn && (
                              <span className="text-emerald-600 font-semibold text-center shrink-0" style={{ width: settings.columnWidths.progress }}>
                                {task.progress}%
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Column 2: Timeline calendar viewport */}
                  <div className="flex-1 overflow-hidden flex flex-col relative bg-white font-sans">
                    {/* Header: Months/Weeks */}
                    <div className="h-12 shrink-0 border-b border-slate-200 bg-slate-50 relative font-sans" style={{ width: `${svgWidth}px`, transform: `translateX(-${getTimelineTranslationX(pIdx)}px)` }}>
                      <svg height={48} width={svgWidth} className="block">
                        <TimelineHeader dayLabels={dayLabels} dayWidth={calculatedDayWidth} zoom="week" days={days || 30} svgWidth={svgWidth} />
                      </svg>
                    </div>
                    {/* Timeline grid content */}
                    <div className="flex-1 relative font-sans" style={{ width: `${svgWidth}px`, transform: `translateX(-${getTimelineTranslationX(pIdx)}px)` }}>
                      <svg height={totalHeight} width={svgWidth} className="block">
                        {/* Zebra stripes */}
                        {flattened.map((_, i) => i % 2 === 1 && (
                          <rect key={i} x={0} y={rowOffsets.offsets[i]} width={svgWidth} height={rowHeights[i]} fill="hsla(0, 0%, 0%, 0.02)" />
                        ))}
                        {/* Task bars */}
                        {flattened.map(({ task }, i) => {
                          const barStart = differenceInDays(new Date(task.startDate), rangeStart || new Date());
                          const dur = task.duration || 1;
                          const barX = barStart * calculatedDayWidth + 10;
                          const barW = Math.max(dur * calculatedDayWidth, task.isMilestone ? 14 : 6);
                          const barY = rowOffsets.offsets[i] + Math.floor((rowHeights[i] - 8) / 2);
                          const hasCh = allTasks.some(t => t.parentId === task.id);
                          const isCritical = settings.highlightCriticalPath && (criticalTaskIds.has(task.id) || task.isMilestone);
                          const pct = hasCh ? (rolledUpProgress.get(task.id) ?? task.progress) : task.progress;
                          const barStatus = getBarStatus(task, pct);

                          return (
                            <g key={task.id}>
                              <TaskBar
                                x={barX}
                                y={barY}
                                w={barW}
                                h={8}
                                pct={pct}
                                isMilestone={task.isMilestone}
                                isCritical={isCritical}
                                isSummary={hasCh}
                                isGhost={false}
                                status={barStatus}
                              />
                              {/* Baseline ghost bar */}
                              {settings.showBaseline && (
                                <rect x={barX} y={barY + 10} width={barW} height={2} rx={1} fill="#cbd5e1" strokeDasharray="2,2" />
                              )}
                              {/* Float / slack tail (OmniPlan style) */}
                              {!hasCh && !isCritical && !task.isMilestone && (() => {
                                const floatDays = floatMap?.get(task.id) ?? 0;
                                if (floatDays < 0.5) return null;
                                const tailW = Math.min(floatDays, 30) * calculatedDayWidth;
                                const tailY = rowOffsets.offsets[i] + rowHeights[i] / 2 - 1.5;
                                return (
                                  <rect
                                    x={barX + barW}
                                    y={tailY}
                                    width={tailW}
                                    height={3}
                                    rx={1}
                                    fill="hsl(0 0% 60%)"
                                    opacity={0.28}
                                    className="pointer-events-none"
                                  />
                                );
                              })()}
                              {/* Milestone external label */}
                              {task.isMilestone && (
                                <text
                                  x={barX + barW / 2 + 11}
                                  y={rowOffsets.offsets[i] + rowHeights[i] / 2 + 3}
                                  fontSize={9}
                                  fontFamily="sans-serif"
                                  fill="currentColor"
                                  fillOpacity={0.6}
                                  className="text-foreground pointer-events-none"
                                >
                                  {task.name.length > 20 ? task.name.slice(0, 19) + "…" : task.name}
                                </text>
                              )}
                              {/* External label for short bars */}
                              {!hasCh && !task.isMilestone && barW < 60 && (
                                <text
                                  x={barX + barW + 5}
                                  y={rowOffsets.offsets[i] + rowHeights[i] / 2 + 3}
                                  fontSize={9}
                                  fontFamily="sans-serif"
                                  fill="currentColor"
                                  fillOpacity={0.55}
                                  className="text-foreground pointer-events-none"
                                >
                                  {task.name.length > 22 ? task.name.slice(0, 21) + "…" : task.name}
                                </text>
                              )}
                            </g>
                          );
                        })}

                        {/* Dependency arrows */}
                        {settings.showDependencies && deps.map((dep) => {
                          const fromIdx = flattened.findIndex(r => r.task.id === dep.from.id);
                          const toIdx = flattened.findIndex(r => r.task.id === dep.to.id);
                          if (fromIdx === -1 || toIdx === -1) return null;
                          return (
                            <DependencyArrow
                              key={`dep-${dep.from.id}-${dep.to.id}-${dep.index}`}
                              x1={dep.x1 * calculatedDayWidth + 10}
                              y1={rowOffsets.offsets[fromIdx] + rowHeights[fromIdx] / 2}
                              x2={dep.x2 * calculatedDayWidth + 10}
                              y2={rowOffsets.offsets[toIdx] + rowHeights[toIdx] / 2}
                              type={dep.type}
                              offset={dep.offset}
                            />
                          );
                        })}
                      </svg>
                    </div>
                  </div>
                </div>

                {/* 3. Print Document Footer */}
                <div className="border-t border-slate-200 pt-2 mt-3 flex justify-between items-center text-[9px] text-slate-400 font-sans">
                  <span>{settings.footerNote}</span>
                  <span>Page {pIdx + 1} of {numHorizontalPages}</span>
                  {settings.showPrintDate && (
                    <span>Printed: {format(new Date(), "dd MMM yyyy HH:mm")}</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
