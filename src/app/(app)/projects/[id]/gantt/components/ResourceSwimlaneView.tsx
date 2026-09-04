"use client";

import { useState, useMemo, useRef } from "react";
import { format, differenceInDays, addDays } from "date-fns";
import { cn } from "@/lib/utils";
import { Users, Wrench, Shield, HardHat, ChevronRight, ChevronDown, Clock, Calendar } from "lucide-react";
import type { Task } from "../types";
import { useUserPreferences } from "@/components/user-preferences-provider";

export type ResourceSwimlaneViewProps = {
  tasks: Task[];
  rangeStart: Date;
  days: number;
  selectedTaskId?: string | null;
  onSelectTask?: (taskId: string) => void;
  canWrite?: boolean;
};

type ResourceItem = {
  id: string;
  name: string;
  role: string;
  type: "person" | "equipment" | "crew" | "subcontractor";
  initials: string;
};

type ResourceGroup = {
  id: string;
  title: string;
  icon: typeof Users;
  resources: ResourceItem[];
};

const DEFAULT_RESOURCE_GROUPS: ResourceGroup[] = [
  {
    id: "leadership",
    title: "Site Leadership & Supervision",
    icon: Shield,
    resources: [
      { id: "res-pm", name: "Er. Ramesh Shrestha", role: "Project Manager", type: "person", initials: "RS" },
      { id: "res-se", name: "Er. Ankit Adhikari", role: "Site In-Charge", type: "person", initials: "AA" },
      { id: "res-qa", name: "Bikash Thapa", role: "QA/QC Engineer", type: "person", initials: "BT" },
      { id: "res-so", name: "Suman Giri", role: "Safety Officer", type: "person", initials: "SG" },
    ],
  },
  {
    id: "civil_crews",
    title: "Civil & Structural Crews",
    icon: HardHat,
    resources: [
      { id: "res-earth", name: "Earthwork Team Alpha", role: "Excavation & Shoring", type: "crew", initials: "EA" },
      { id: "res-rebar", name: "Rebar Crew (12 Gang)", role: "Bar Bending & Fixing", type: "crew", initials: "RC" },
      { id: "res-shutter", name: "Formwork Crew (8 Gang)", role: "Centering & Shuttering", type: "crew", initials: "FC" },
      { id: "res-conc", name: "Concreting Team", role: "Batching & Pouring", type: "crew", initials: "CT" },
      { id: "res-mason", name: "Masonry Team Beta", role: "Brickwork & Plaster", type: "crew", initials: "MB" },
    ],
  },
  {
    id: "plant",
    title: "Plant & Heavy Equipment",
    icon: Wrench,
    resources: [
      { id: "res-excavator", name: "CAT 320D Excavator", role: "Earthmoving & Trenching", type: "equipment", initials: "EX" },
      { id: "res-crane", name: "Potain Tower Crane", role: "Material Hoisting", type: "equipment", initials: "TC" },
      { id: "res-mixer", name: "Transit Mixer (6m³)", role: "Ready-Mix Delivery", type: "equipment", initials: "TM" },
    ],
  },
  {
    id: "specialized",
    title: "MEP & Finishing Subcontractors",
    icon: Users,
    resources: [
      { id: "res-elec", name: "Pinnacle Electricals", role: "Conduiting & Wiring Sub", type: "subcontractor", initials: "PE" },
      { id: "res-plumb", name: "Jal Plumbing Solutions", role: "Sanitary & Drainage Sub", type: "subcontractor", initials: "JP" },
    ],
  },
];

export function ResourceSwimlaneView({
  tasks,
  rangeStart,
  days,
  selectedTaskId,
  onSelectTask,
}: ResourceSwimlaneViewProps) {
  const [subTab, setSubTab] = useState<"timeline" | "normal_hours" | "custom_hours">("timeline");
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [hoveredTask, setHoveredTask] = useState<string | null>(null);
  const { getPref } = useUserPreferences();
  const ganttTheme = getPref<string>("ganttTheme", "omniplan");
  const ganttBarRadius = getPref<string>("ganttBarRadius", "rounded");

  const leftPanelRef = useRef<HTMLDivElement>(null);
  const rightPanelRef = useRef<HTMLDivElement>(null);
  const isSyncing = useRef(false);

  const toggleGroup = (groupId: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  };

  const dayWidth = 34;
  const headerHeight = 44;
  const laneHeight = 38;

  const onRightScroll = () => {
    if (isSyncing.current) return;
    isSyncing.current = true;
    if (leftPanelRef.current && rightPanelRef.current) {
      leftPanelRef.current.scrollTop = rightPanelRef.current.scrollTop;
    }
    isSyncing.current = false;
  };

  const onLeftScroll = () => {
    if (isSyncing.current) return;
    isSyncing.current = true;
    if (leftPanelRef.current && rightPanelRef.current) {
      rightPanelRef.current.scrollTop = leftPanelRef.current.scrollTop;
    }
    isSyncing.current = false;
  };

  const dayCols = useMemo(() => {
    return Array.from({ length: Math.min(days, 180) }, (_, i) => {
      const d = addDays(rangeStart, i);
      const isWeekend = d.getDay() === 6;
      return {
        index: i,
        date: d,
        dayNum: format(d, "d"),
        dayName: format(d, "EEE"),
        isWeekend,
      };
    });
  }, [rangeStart, days]);

  const visibleRows = useMemo(() => {
    const rows: { isHeader: boolean; groupId: string; group?: ResourceGroup; resource?: ResourceItem }[] = [];
    DEFAULT_RESOURCE_GROUPS.forEach((group) => {
      rows.push({ isHeader: true, groupId: group.id, group });
      if (!collapsedGroups.has(group.id)) {
        group.resources.forEach((res) => {
          rows.push({ isHeader: false, groupId: group.id, resource: res });
        });
      }
    });
    return rows;
  }, [collapsedGroups]);

  const resourceTasksMap = useMemo(() => {
    const map = new Map<string, Task[]>();
    const allResources = DEFAULT_RESOURCE_GROUPS.flatMap((g) => g.resources);

    tasks.forEach((task, idx) => {
      const lower = task.name.toLowerCase();
      let matchedRes: ResourceItem;

      if (lower.includes("survey") || lower.includes("layout")) {
        matchedRes = allResources[2];
      } else if (lower.includes("excavat") || lower.includes("earth") || lower.includes("dig")) {
        matchedRes = allResources[4];
      } else if (lower.includes("rebar") || lower.includes("steel") || lower.includes("bend")) {
        matchedRes = allResources[5];
      } else if (lower.includes("formwork") || lower.includes("shutter") || lower.includes("column")) {
        matchedRes = allResources[6];
      } else if (lower.includes("concret") || lower.includes("slab") || lower.includes("pour")) {
        matchedRes = allResources[7];
      } else if (lower.includes("mason") || lower.includes("brick") || lower.includes("plaster")) {
        matchedRes = allResources[8];
      } else if (lower.includes("electr") || lower.includes("conduit") || lower.includes("wire")) {
        matchedRes = allResources[12];
      } else if (lower.includes("plumb") || lower.includes("pipe") || lower.includes("drain")) {
        matchedRes = allResources[13];
      } else {
        const pool = allResources.slice(4, 9);
        matchedRes = pool[idx % pool.length] ?? allResources[1];
      }

      const existing = map.get(matchedRes.id) ?? [];
      existing.push(task);
      map.set(matchedRes.id, existing);
    });

    return map;
  }, [tasks]);

  const dailyAllocations = useMemo(() => {
    const counts = new Array(dayCols.length).fill(0);
    tasks.forEach((task) => {
      const s = differenceInDays(new Date(task.startDate), rangeStart);
      const e = differenceInDays(new Date(task.endDate), rangeStart);
      for (let d = Math.max(0, s); d <= Math.min(dayCols.length - 1, e); d++) {
        counts[d] = (counts[d] || 0) + 1;
      }
    });
    return counts;
  }, [tasks, rangeStart, dayCols.length]);

  return (
    <div className="flex h-full flex-col bg-background font-sans select-none overflow-hidden">
      {/* Sub-tab toolbar strip matching OmniPlan screenshot */}
      <div className="flex h-8 shrink-0 items-center justify-between border-b border-border bg-card px-3 text-[11px]">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setSubTab("timeline")}
            className={cn(
              "h-6 rounded-[3px] px-2.5 font-medium transition-colors",
              subTab === "timeline" ? "bg-primary text-primary-foreground font-semibold shadow-2xs" : "text-muted-foreground hover:text-foreground"
            )}
          >
            <span className="flex items-center gap-1.5"><Clock className="h-3 w-3" /> Timeline</span>
          </button>
          <button
            type="button"
            onClick={() => setSubTab("normal_hours")}
            className={cn(
              "h-6 rounded-[3px] px-2.5 font-medium transition-colors",
              subTab === "normal_hours" ? "bg-primary text-primary-foreground font-semibold shadow-2xs" : "text-muted-foreground hover:text-foreground"
            )}
          >
            <span className="flex items-center gap-1.5"><Calendar className="h-3 w-3" /> Normal Hours</span>
          </button>
          <button
            type="button"
            onClick={() => setSubTab("custom_hours")}
            className={cn(
              "h-6 rounded-[3px] px-2.5 font-medium transition-colors",
              subTab === "custom_hours" ? "bg-primary text-primary-foreground font-semibold shadow-2xs" : "text-muted-foreground hover:text-foreground"
            )}
          >
            Custom Hours
          </button>
        </div>
        <div className="text-[10px] font-mono text-muted-foreground">
          {tasks.length} activities mapped across {DEFAULT_RESOURCE_GROUPS.reduce((s, g) => s + g.resources.length, 0)} resources
        </div>
      </div>

      {subTab !== "timeline" ? (
        <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-muted-foreground">
          <Calendar className="h-8 w-8 mb-2 text-primary/70" />
          <h3 className="text-sm font-bold text-foreground">
            {subTab === "normal_hours" ? "Standard Work Week Hours" : "Custom Hours & Holidays"}
          </h3>
          <p className="text-xs max-w-sm mt-1">
            {subTab === "normal_hours"
              ? "Standard shifts are configured Sunday through Friday, 8:00 AM – 5:00 PM (8 hrs/day, 48 hrs/week) with Saturday off."
              : "No specific holiday exceptions configured for the active range. Click any resource row to customize overtime or off-days."}
          </p>
        </div>
      ) : (
        <div className="flex-1 min-h-0 flex relative">
          {/* Left Pane: Resource Outline [Type | Resource | Role] */}
          <div className="w-[300px] shrink-0 border-r border-border bg-card flex flex-col z-10">
            <div className="h-[44px] shrink-0 border-b border-border bg-secondary/35 flex items-center px-2 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider font-mono">
              <div className="w-8 shrink-0 text-center">Type</div>
              <div className="flex-1 px-1">Resource</div>
              <div className="w-28 shrink-0 px-1 text-right">Role</div>
            </div>

            <div
              ref={leftPanelRef}
              onScroll={onLeftScroll}
              className="flex-1 overflow-y-auto divide-y divide-border/40 scrollbar-none"
            >
              {visibleRows.map((row, rIdx) => {
                if (row.isHeader && row.group) {
                  const isCollapsed = collapsedGroups.has(row.groupId);
                  const Icon = row.group.icon;
                  return (
                    <div
                      key={`grp-${row.groupId}`}
                      onClick={() => toggleGroup(row.groupId)}
                      className="flex h-[32px] items-center px-2 bg-muted/40 hover:bg-muted/60 cursor-pointer font-semibold text-[11px] text-foreground transition-colors"
                    >
                      <button type="button" className="p-0.5 text-muted-foreground mr-1">
                        {isCollapsed ? <ChevronRight className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                      </button>
                      <Icon className="h-3.5 w-3.5 mr-1.5 text-primary" />
                      <span className="truncate flex-1">{row.group.title}</span>
                      <span className="text-[9px] font-mono text-muted-foreground">({row.group.resources.length})</span>
                    </div>
                  );
                }

                const res = row.resource!;
                const assignedCount = (resourceTasksMap.get(res.id) ?? []).length;

                return (
                  <div
                    key={`res-${res.id}-${rIdx}`}
                    style={{ height: `${laneHeight}px` }}
                    className="flex items-center px-2 text-xs hover:bg-accent/40 transition-colors"
                  >
                    <div className="w-8 shrink-0 flex items-center justify-center">
                      <span className="h-5 w-5 rounded-full bg-secondary border border-border flex items-center justify-center text-[9px] font-bold text-muted-foreground">
                        {res.initials}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0 px-1">
                      <div className="truncate font-medium text-foreground text-[11.5px]">{res.name}</div>
                      <div className="text-[9px] text-muted-foreground font-mono">{assignedCount} task{assignedCount !== 1 ? "s" : ""}</div>
                    </div>
                    <div className="w-28 shrink-0 px-1 text-right text-[10px] text-muted-foreground truncate" title={res.role}>
                      {res.role}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Right Pane: Horizontal Swimlane Timeline */}
          <div
            ref={rightPanelRef}
            onScroll={onRightScroll}
            className="flex-1 min-w-0 overflow-auto bg-[var(--timeline-canvas,#f6eed8)]"
          >
            <div style={{ width: `${dayCols.length * dayWidth + 40}px` }}>
              {/* Timescale header + Daily capacity utilization numbers */}
              <div
                style={{ height: `${headerHeight}px` }}
                className="sticky top-0 z-20 flex flex-col border-b border-border bg-card/95 backdrop-blur-xs font-mono"
              >
                {/* Row 1: Daily allocation numbers (matching screenshot) */}
                <div className="flex h-5 border-b border-border/50 text-[8.5px] text-muted-foreground">
                  {dayCols.map((col, idx) => {
                    const count = dailyAllocations[idx] || 0;
                    const isOverload = count >= 4;
                    return (
                      <div
                        key={`alloc-${col.index}`}
                        style={{ width: `${dayWidth}px` }}
                        className={cn(
                          "shrink-0 flex items-center justify-center border-r border-border/30",
                          isOverload && "bg-destructive/15 text-destructive font-bold"
                        )}
                        title={`Day ${col.dayNum}: ${count} active task(s)`}
                      >
                        {count > 0 ? (isOverload ? `!${count}` : `·${count}`) : "0"}
                      </div>
                    );
                  })}
                </div>

                {/* Row 2: Date numbers */}
                <div className="flex h-6 text-[9.5px]">
                  {dayCols.map((col) => (
                    <div
                      key={`day-${col.index}`}
                      style={{ width: `${dayWidth}px` }}
                      className={cn(
                        "shrink-0 flex flex-col items-center justify-center border-r border-border/40 font-medium",
                        col.isWeekend && "bg-muted/45 text-muted-foreground"
                      )}
                    >
                      <span className="font-bold">{col.dayNum}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Swimlane Rows */}
              <div className="relative">
                {/* Weekend vertical background stripes */}
                <div className="absolute inset-0 pointer-events-none flex">
                  {dayCols.map((col) => (
                    <div
                      key={`bg-stripe-${col.index}`}
                      style={{ width: `${dayWidth}px` }}
                      className={cn(
                        "shrink-0 border-r border-border/25 h-full",
                        col.isWeekend && "bg-black/[0.02]"
                      )}
                    />
                  ))}
                </div>

                {/* Rows matching left panel */}
                {visibleRows.map((row, rIdx) => {
                  if (row.isHeader) {
                    return (
                      <div
                        key={`row-grp-${row.groupId}`}
                        className="h-[32px] border-b border-border/40 bg-muted/20"
                      />
                    );
                  }

                  const res = row.resource!;
                  const assignedTasks = resourceTasksMap.get(res.id) ?? [];

                  return (
                    <div
                      key={`lane-${res.id}-${rIdx}`}
                      style={{ height: `${laneHeight}px` }}
                      className="relative border-b border-border/40 flex items-center px-1"
                    >
                      {/* Name label watermark in lane */}
                      <span className="absolute left-2 top-1 text-[8.5px] font-mono text-muted-foreground/35 uppercase pointer-events-none">
                        {res.name}
                      </span>

                      {/* Render tasks assigned to this swimlane */}
                      {assignedTasks.map((t) => {
                        const startOff = differenceInDays(new Date(t.startDate), rangeStart);
                        const endOff = differenceInDays(new Date(t.endDate), rangeStart) + 1;
                        const barLeft = Math.max(0, startOff * dayWidth);
                        const barWidth = Math.max((endOff - startOff) * dayWidth, 18);
                        const isSelected = selectedTaskId === t.id;
                        const isHovered = hoveredTask === t.id;

                        const radiusClass = ganttBarRadius === "sharp" ? "rounded-none" : ganttBarRadius === "pill" ? "rounded-full" : "rounded-[3px]";
                        const themeBg =
                          ganttTheme === "emerald"
                            ? "bg-[#059669] border-[#047857]"
                            : ganttTheme === "slate"
                            ? "bg-[#475569] border-[#334155]"
                            : ganttTheme === "amber"
                            ? "bg-[#d97706] border-[#b45309]"
                            : "bg-[#2563eb] border-[#1d4ed8]";

                        return (
                          <div
                            key={`swim-task-${t.id}`}
                            onClick={() => onSelectTask?.(t.id)}
                            onMouseEnter={() => setHoveredTask(t.id)}
                            onMouseLeave={() => setHoveredTask(null)}
                            style={{
                              left: `${barLeft}px`,
                              width: `${barWidth}px`,
                              height: "22px",
                            }}
                            className={cn(
                              "absolute top-[8px] px-2 flex items-center text-[10px] font-medium truncate cursor-pointer transition-all shadow-xs",
                              radiusClass,
                              isSelected
                                ? "bg-blue-600 text-white border-2 border-blue-400 font-bold z-10 ring-2 ring-blue-500/40"
                                : isHovered
                                ? `${themeBg} text-white z-10 scale-[1.01] brightness-110 shadow-md`
                                : t.progress >= 100
                                ? "bg-[#10b981] text-white border border-[#059669]"
                                : `${themeBg} text-white`
                            )}
                            title={`${t.name}\n${format(new Date(t.startDate), "dd MMM")} → ${format(new Date(t.endDate), "dd MMM")}\nEffort: ${t.workHours ?? 0}h | Progress: ${t.progress}%`}
                          >
                            <span className="truncate">{t.name}</span>
                            <div
                              style={{ width: `${t.progress}%` }}
                              className="absolute bottom-0 left-0 h-[2.5px] bg-white/50 rounded-b"
                            />
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
