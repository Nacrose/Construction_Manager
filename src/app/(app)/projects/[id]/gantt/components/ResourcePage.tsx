"use client";

import { useState, useMemo, useRef, useEffect, Fragment } from "react";
import { format, addDays, differenceInDays } from "date-fns";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ChevronDown, ChevronRight, Search, Download, Users, Package, Wrench, Receipt,
  Check,
} from "lucide-react";

import type { Task } from "../types";

type ResourcePageProps = {
  tasks: Task[];
  rangeStart: Date;
  days: number;
  isLoading: boolean;
};

type Period = "day" | "week" | "month" | "year" | "all";
type ResourceType = "all" | "material" | "labor" | "equipment" | "overhead";
type SortKey = "name" | "totalQty" | "periodQty" | "cost";

type ResourceRow = {
  key: string;
  name: string;
  type: string;
  unit: string;
  rate: number;
  totalQty: number;
  periodQty: number;
  totalCost: number;
  periodCost: number;
  sourceTasks: { taskId: string; taskName: string; taskCode: string | null; qty: number; cost: number }[];
};

type ResourceGroup = {
  type: string;
  label: string;
  icon: React.ReactNode;
  resources: ResourceRow[];
};

function formatNPR(v: number): string {
  return "NPR " + v.toLocaleString("en-IN", { maximumFractionDigits: 0 });
}

function formatQty(v: number): string {
  if (v >= 1000) return v.toLocaleString("en-IN", { maximumFractionDigits: 2 });
  if (v >= 1) return v.toFixed(2);
  if (v > 0) return v.toFixed(4);
  return "0";
}

function buildTaskTree(tasks: Task[]): { task: Task; depth: number; children: { task: Task; depth: number; children: any[] }[] }[] {
  const _taskMap = new Map(tasks.map(t => [t.id, t]));
  const roots: Task[] = [];
  const childMap = new Map<string, Task[]>();
  for (const t of tasks) {
    if (!t.parentId) {
      roots.push(t);
    } else {
      const list = childMap.get(t.parentId) ?? [];
      list.push(t);
      childMap.set(t.parentId, list);
    }
  }
  function walk(list: Task[], depth: number): any[] {
    return list.map(t => ({
      task: t,
      depth,
      children: walk(childMap.get(t.id) ?? [], depth + 1),
    }));
  }
  return walk(roots, 0);
}

export function ResourcePage({ tasks, rangeStart, days, isLoading }: ResourcePageProps) {
  const [period, setPeriod] = useState<Period>("week");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [resourceType, setResourceType] = useState<ResourceType>("all");
  const [sortKey, setSortKey] = useState<SortKey>("totalQty");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTaskIds, setSelectedTaskIds] = useState<Set<string>>(new Set());
  const [taskPickerOpen, setTaskPickerOpen] = useState(false);
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(["material", "labor", "equipment", "overhead"]));
  const [expandedResource, setExpandedResource] = useState<string | null>(null);
  const taskPickerRef = useRef<HTMLDivElement>(null);
  const initialized = useRef(false);

  useEffect(() => {
    if (!initialized.current) {
      initialized.current = true;
      const from = format(rangeStart, "yyyy-MM-dd");
      const end = period === "week" ? format(addDays(rangeStart, 7), "yyyy-MM-dd")
        : period === "day" ? format(addDays(rangeStart, 1), "yyyy-MM-dd")
        : period === "month" ? format(new Date(rangeStart.getFullYear(), rangeStart.getMonth() + 1, rangeStart.getDate()), "yyyy-MM-dd")
        : period === "year" ? format(new Date(rangeStart.getFullYear() + 1, rangeStart.getMonth(), rangeStart.getDate()), "yyyy-MM-dd")
        : format(addDays(rangeStart, days), "yyyy-MM-dd");
      setFromDate(from);
      setToDate(end);
      setSelectedTaskIds(new Set(tasks.map(t => t.id)));
    }
  }, [tasks, rangeStart, days, period]);

  // Update toDate when period changes (but not on first init)
  useEffect(() => {
    if (!initialized.current || !fromDate) return;
    if (period === "all") {
      setToDate(format(addDays(rangeStart, days), "yyyy-MM-dd"));
    } else {
      const start = new Date(fromDate);
      let end: Date;
      if (period === "day") end = addDays(start, 1);
      else if (period === "week") end = addDays(start, 7);
      else if (period === "month") end = new Date(start.getFullYear(), start.getMonth() + 1, start.getDate());
      else end = new Date(start.getFullYear() + 1, start.getMonth(), start.getDate());
      setToDate(format(end, "yyyy-MM-dd"));
    }
  }, [period]);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (taskPickerRef.current && !taskPickerRef.current.contains(e.target as Node)) {
        setTaskPickerOpen(false);
      }
    }
    if (taskPickerOpen) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [taskPickerOpen]);

  const periodRange = useMemo(() => {
    if (!fromDate || !toDate) return { start: null, end: null };
    const start = new Date(fromDate);
    const end = new Date(toDate);
    return { start, end };
  }, [fromDate, toDate]);

  const activeTasks = useMemo(() => {
    if (selectedTaskIds.size === 0) return [];
    return tasks.filter(t => selectedTaskIds.has(t.id));
  }, [tasks, selectedTaskIds]);

  const resourceGroups = useMemo((): ResourceGroup[] => {
    const { start, end } = periodRange;
    if (!start || !end || activeTasks.length === 0) return [];

    const resourceMap = new Map<string, ResourceRow>();

    for (const task of activeTasks) {
      const taskStart = new Date(task.startDate);
      const taskEnd = new Date(task.endDate);
      const taskDays = Math.max(1, differenceInDays(taskEnd, taskStart) + 1);

      for (const link of task.boqLinks) {
        for (const ing of link.boqItem.ingredients) {
          const totalQty = ing.quantity * link.quantity;
          const totalCost = (ing.amount || ing.rate * ing.quantity) * link.quantity;

          let periodQty = totalQty;
          let periodCost = totalCost;

          if (period !== "all") {
            const overlapStart = taskStart > start ? taskStart : start;
            const overlapEnd = taskEnd < end ? taskEnd : end;
            if (overlapStart < overlapEnd) {
              const overlapDays = Math.max(1, differenceInDays(overlapEnd, overlapStart) + 1);
              const fraction = overlapDays / taskDays;
              periodQty = totalQty * fraction;
              periodCost = totalCost * fraction;
            } else {
              periodQty = 0;
              periodCost = 0;
            }
          }

          const key = `${ing.name}|${ing.unit}`;
          const existing = resourceMap.get(key);
          const rate = ing.amount && ing.quantity ? ing.amount / ing.quantity : ing.rate;

          if (existing) {
            existing.totalQty += totalQty;
            existing.periodQty += periodQty;
            existing.totalCost += totalCost;
            existing.periodCost += periodCost;
            const srcIdx = existing.sourceTasks.findIndex(s => s.taskId === task.id);
            if (srcIdx >= 0) {
              existing.sourceTasks[srcIdx].qty += totalQty;
              existing.sourceTasks[srcIdx].cost += totalCost;
            } else {
              existing.sourceTasks.push({ taskId: task.id, taskName: task.name, taskCode: task.code, qty: totalQty, cost: totalCost });
            }
          } else {
            resourceMap.set(key, {
              key,
              name: ing.name,
              type: ing.type,
              unit: ing.unit,
              rate,
              totalQty,
              periodQty,
              totalCost,
              periodCost,
              sourceTasks: [{ taskId: task.id, taskName: task.name, taskCode: task.code, qty: totalQty, cost: totalCost }],
            });
          }
        }
      }
    }

    const groups: ResourceGroup[] = [];
    const typeConfig: { type: string; label: string; icon: React.ReactNode }[] = [
      { type: "material", label: "Materials", icon: <Package className="h-4 w-4 text-info" /> },
      { type: "labor", label: "Labor", icon: <Users className="h-4 w-4 text-emerald-600" /> },
      { type: "equipment", label: "Equipment", icon: <Wrench className="h-4 w-4 text-amber-600" /> },
      { type: "overhead", label: "Overhead", icon: <Receipt className="h-4 w-4 text-purple-600" /> },
    ];

    for (const cfg of typeConfig) {
      const resources = Array.from(resourceMap.values())
        .filter(r => r.type === cfg.type)
        .filter(r => !searchQuery || r.name.toLowerCase().includes(searchQuery.toLowerCase()));

      if (resources.length === 0) continue;

      const sorter = (a: ResourceRow, b: ResourceRow) => {
        if (sortKey === "name") return a.name.localeCompare(b.name);
        if (sortKey === "periodQty") return b.periodQty - a.periodQty;
        if (sortKey === "cost") return b.totalCost - a.totalCost;
        return b.totalQty - a.totalQty;
      };
      resources.sort(sorter);

      groups.push({ type: cfg.type, label: cfg.label, icon: cfg.icon, resources });
    }

    return groups;
  }, [activeTasks, periodRange, period, searchQuery, sortKey]);

  const filteredGroups = useMemo(() => {
    if (resourceType === "all") return resourceGroups;
    return resourceGroups.filter(g => g.type === resourceType);
  }, [resourceGroups, resourceType]);

  const summary = useMemo(() => {
    let totalQty = 0;
    let periodQty = 0;
    let totalCost = 0;
    let periodCost = 0;
    let count = 0;
    for (const g of filteredGroups) {
      for (const r of g.resources) {
        totalQty += r.totalQty;
        periodQty += r.periodQty;
        totalCost += r.totalCost;
        periodCost += r.periodCost;
        count++;
      }
    }
    return { count, totalQty, periodQty, totalCost, periodCost };
  }, [filteredGroups]);

  const toggleSection = (type: string) => {
    setExpandedSections(prev => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  };

  const toggleTask = (taskId: string) => {
    setSelectedTaskIds(prev => {
      const next = new Set(prev);
      if (next.has(taskId)) {
        next.delete(taskId);
        if (next.size === 0) return new Set(tasks.map(t => t.id));
      } else {
        next.add(taskId);
        if (next.size === tasks.length) return new Set(tasks.map(t => t.id));
      }
      return next;
    });
  };

  const toggleTaskWithChildren = (task: Task, _tree: any[] | null) => {
    const ids = new Set<string>();
    function collect(t: Task) {
      ids.add(t.id);
      for (const child of tasks.filter(c => c.parentId === t.id)) collect(child);
    }
    collect(task);
    setSelectedTaskIds(prev => {
      const allSelected = ids.size === 0 ? false : Array.from(ids).every(id => prev.has(id));
      const next = new Set(prev);
      if (allSelected) {
        for (const id of ids) next.delete(id);
      } else {
        for (const id of ids) next.add(id);
      }
      return next;
    });
  };

  const selectAll = () => {
    if (selectedTaskIds.size === tasks.length) {
      setSelectedTaskIds(new Set());
    } else {
      setSelectedTaskIds(new Set(tasks.map(t => t.id)));
    }
  };

  const exportCsv = () => {
    let csv = "Type,Resource,Unit,Rate,Total Qty,Period Qty,Total Cost,Period Cost\n";
    for (const g of filteredGroups) {
      for (const r of g.resources) {
        csv += `${g.type},${r.name},${r.unit},${r.rate},${r.totalQty},${r.periodQty},${r.totalCost},${r.periodCost}\n`;
      }
    }
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "resource-planning.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const tree = useMemo(() => buildTaskTree(tasks), [tasks]);

  function renderTaskTree(nodes: any[], depth: number): React.ReactNode {
    return nodes.map((node: any) => {
      const checked = selectedTaskIds.has(node.task.id);
      const hasChildren = node.children.length > 0;
      return (
        <div key={node.task.id}>
          <div
            className={cn(
              "flex items-center gap-1.5 px-2 py-1 rounded cursor-pointer text-xs hover:bg-muted/50",
              depth > 0 && "ml-4",
            )}
            onClick={() => hasChildren ? toggleTaskWithChildren(node.task, tree) : toggleTask(node.task.id)}
          >
            <span className={cn(
              "flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded border",
              checked ? "border-emerald-500 bg-emerald-500 text-white" : "border-muted-foreground",
            )}>
              {checked && <Check className="h-2.5 w-2.5" />}
            </span>
            {node.task.code && <span className="font-mono text-[10px] text-muted-foreground">{node.task.code}</span>}
            <span className="truncate">{node.task.name}</span>
          </div>
          {hasChildren && renderTaskTree(node.children, depth + 1)}
        </div>
      );
    });
  }

  if (isLoading) {
    return (
      <div className="flex-1 p-6 space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (tasks.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center space-y-2">
          <p className="text-sm font-medium text-muted-foreground">No tasks found</p>
          <p className="text-xs text-muted-foreground/60">Create tasks in the Schedule tab first and attach BOQ items.</p>
        </div>
      </div>
    );
  }

  const hasBoqLinks = tasks.some(t => t.boqLinks?.length > 0);
  if (!hasBoqLinks) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center space-y-2">
          <p className="text-sm font-medium text-muted-foreground">No BOQ items attached</p>
          <p className="text-xs text-muted-foreground/60">Link BOQ items to tasks in the Inspector panel to see resource requirements.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="p-6 space-y-4 max-w-6xl">
        <h1 className="text-lg font-semibold">Resource Planning</h1>

        {/* Controls */}
        <div className="rounded-lg border bg-card p-4 space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-muted-foreground">Period:</span>
              <div className="flex rounded-md border bg-muted/30 p-0.5">
                {(["day", "week", "month", "year", "all"] as Period[]).map((p) => (
                  <button key={p} onClick={() => setPeriod(p)}
                    className={cn("rounded px-2.5 py-1 text-xs capitalize transition-colors",
                      period === p ? "bg-background font-medium shadow-sm" : "text-muted-foreground hover:text-foreground"
                    )}
                  >{p === "all" ? "Entire" : p}</button>
                ))}
              </div>
            </div>
            <div className="h-4 w-px bg-border" />
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-muted-foreground">From:</span>
              <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)}
                className="h-7 rounded border bg-background px-2 text-xs w-[130px]" />
              <span className="text-xs text-muted-foreground">To:</span>
              <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)}
                className="h-7 rounded border bg-background px-2 text-xs w-[130px]" />
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-muted-foreground">Type:</span>
              <select value={resourceType} onChange={(e) => setResourceType(e.target.value as ResourceType)}
                className="h-7 rounded border bg-background px-2 text-xs">
                <option value="all">All</option>
                <option value="material">Materials</option>
                <option value="labor">Labor</option>
                <option value="equipment">Equipment</option>
                <option value="overhead">Overhead</option>
              </select>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-muted-foreground">Sort:</span>
              <select value={sortKey} onChange={(e) => setSortKey(e.target.value as SortKey)}
                className="h-7 rounded border bg-background px-2 text-xs">
                <option value="totalQty">Total Qty</option>
                <option value="periodQty">Period Qty</option>
                <option value="cost">Cost</option>
                <option value="name">Name</option>
              </select>
            </div>
            <div className="relative flex-1 max-w-xs">
              <Search className="absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
              <input placeholder="Search resources..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
                className="h-7 w-full rounded border bg-background pl-7 pr-2 text-xs" />
            </div>
            <button onClick={exportCsv} disabled={filteredGroups.length === 0}
              className="ml-auto flex items-center gap-1 rounded border px-2.5 py-1 text-xs font-medium hover:bg-muted disabled:opacity-40">
              <Download className="h-3 w-3" />
              Export CSV
            </button>
          </div>
        </div>

        {/* Task filter */}
        <div className="relative" ref={taskPickerRef}>
          <button onClick={() => setTaskPickerOpen(!taskPickerOpen)}
            className="flex items-center gap-1.5 rounded-lg border bg-card px-3 py-1.5 text-xs hover:bg-muted/50">
            <Users className="h-3.5 w-3.5 text-muted-foreground" />
            <span>
              {selectedTaskIds.size === tasks.length
                ? "All tasks"
                : `${selectedTaskIds.size} of ${tasks.length} tasks`} selected
            </span>
            {selectedTaskIds.size !== tasks.length && (
              <button onClick={(e) => { e.stopPropagation(); setSelectedTaskIds(new Set(tasks.map(t => t.id))); }}
                className="text-emerald-600 hover:underline ml-1">Show all</button>
            )}
            <ChevronDown className="h-3 w-3 text-muted-foreground ml-auto" />
          </button>
          {taskPickerOpen && (
            <div className="absolute top-full left-0 mt-1 z-50 w-72 rounded-lg border bg-popover shadow-lg p-2 max-h-80 overflow-y-auto">
              <div className="flex items-center gap-1.5 px-2 py-1 rounded cursor-pointer text-xs hover:bg-muted/50 mb-1"
                onClick={selectAll}>
                <span className={cn("flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded border",
                  selectedTaskIds.size === tasks.length ? "border-emerald-500 bg-emerald-500 text-white" : "border-muted-foreground")}>
                  {selectedTaskIds.size === tasks.length && <Check className="h-2.5 w-2.5" />}
                </span>
                <span className="font-medium">All tasks ({tasks.length})</span>
              </div>
              <div className="border-t pt-1">
                {renderTaskTree(tree, 0)}
              </div>
              <div className="border-t pt-1 mt-1 flex justify-end">
                <button onClick={() => setTaskPickerOpen(false)}
                  className="rounded px-2 py-1 text-xs font-medium bg-emerald-600 text-white hover:bg-emerald-700">Apply</button>
              </div>
            </div>
          )}
        </div>

        {/* Summary bar */}
        {filteredGroups.length > 0 && (
          <div className="flex flex-wrap gap-4 rounded-lg border bg-muted/20 px-4 py-2 text-xs">
            <span className="text-muted-foreground">{summary.count} resource types</span>
            <span className="text-muted-foreground">{formatQty(summary.totalQty)} total qty</span>
            <span className="text-emerald-700 font-medium">{formatQty(summary.periodQty)} this {period === "all" ? "project" : period}</span>
            <span className="text-muted-foreground">{formatNPR(summary.totalCost)} total</span>
            <span className="text-emerald-700 font-medium">{formatNPR(summary.periodCost)} this {period === "all" ? "project" : period}</span>
          </div>
        )}

        {/* Resource tables */}
        <div className="space-y-3">
          {filteredGroups.map((group) => (
            <div key={group.type} className="rounded-lg border bg-card overflow-hidden">
              <button onClick={() => toggleSection(group.type)}
                className="flex w-full items-center gap-2 border-b bg-muted/10 px-4 py-2 text-xs font-semibold text-muted-foreground hover:bg-muted/20 transition-colors">
                {group.icon}
                <span className="flex-1 text-left">{group.label}</span>
                <span className="font-normal">({group.resources.length})</span>
                {expandedSections.has(group.type) ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
              </button>

              {expandedSections.has(group.type) && (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b bg-muted/20 text-muted-foreground">
                        <th className="p-2 text-center w-8">#</th>
                        <th className="p-2 text-left">Resource</th>
                        <th className="p-2 text-left w-12">Unit</th>
                        <th className="p-2 text-right w-20">Rate</th>
                        <th className="p-2 text-right w-20">Total Qty</th>
                        <th className="p-2 text-right w-20">
                          {period === "all" ? "Total Qty" : `Period Qty`}
                        </th>
                        <th className="p-2 text-right w-24">Total Cost</th>
                        <th className="p-2 text-right w-24">
                          {period === "all" ? "Total Cost" : "Period Cost"}
                        </th>
                        <th className="p-2 w-24">Ratio</th>
                      </tr>
                    </thead>
                    <tbody>
                      {group.resources.map((r, i) => {
                        const isExpanded = expandedResource === r.key;
                        const ratio = r.totalQty > 0 ? Math.min(r.periodQty / r.totalQty, 1) : 0;
                        return (
                          <Fragment key={r.key}>
                            <tr className={cn(
                              "border-b cursor-pointer transition-colors hover:bg-muted/20",
                              isExpanded && "bg-muted/10",
                            )} onClick={() => setExpandedResource(isExpanded ? null : r.key)}>
                              <td className="p-2 text-center text-muted-foreground">{i + 1}</td>
                              <td className="p-2 font-medium">{r.name}</td>
                              <td className="p-2 text-muted-foreground">{r.unit}</td>
                              <td className="p-2 text-right font-mono">{formatNPR(r.rate)}</td>
                              <td className="p-2 text-right font-mono">{formatQty(r.totalQty)}</td>
                              <td className="p-2 text-right font-mono text-emerald-700 font-medium">{formatQty(r.periodQty)}</td>
                              <td className="p-2 text-right font-mono">{formatNPR(r.totalCost)}</td>
                              <td className="p-2 text-right font-mono text-emerald-700 font-medium">{formatNPR(r.periodCost)}</td>
                              <td className="p-2">
                                <div className="flex items-center gap-1">
                                  <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                                    <div className="h-full rounded-full bg-emerald-500 transition-all"
                                      style={{ width: `${ratio * 100}%` }} />
                                  </div>
                                  <span className="text-[10px] text-muted-foreground w-8 text-right">
                                    {Math.round(ratio * 100)}%
                                  </span>
                                </div>
                              </td>
                            </tr>
                            {isExpanded && (
                              <tr key={`${r.key}-tasks`}>
                                <td colSpan={9} className="p-0">
                                  <div className="bg-muted/5 border-b px-4 py-2 space-y-1">
                                    <span className="text-[10px] font-medium text-muted-foreground">Source tasks:</span>
                                    {r.sourceTasks.map(s => (
                                      <div key={s.taskId} className="flex items-center gap-2 text-xs pl-2">
                                        {s.taskCode && <span className="font-mono text-[10px] text-muted-foreground">{s.taskCode}</span>}
                                        <span className="flex-1">{s.taskName}</span>
                                        <span className="font-mono text-muted-foreground">{formatQty(s.qty)} {r.unit}</span>
                                        <span className="font-mono text-muted-foreground">{formatNPR(s.cost)}</span>
                                      </div>
                                    ))}
                                  </div>
                                </td>
                              </tr>
                            )}
                          </Fragment>
                        );
                      })}
                      {group.resources.length === 0 && (
                        <tr>
                          <td colSpan={9} className="p-4 text-center text-muted-foreground">
                            No {group.label.toLowerCase()} in this period.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ))}
        </div>

        {filteredGroups.length === 0 && (
          <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
            No resources in this date range. Adjust the period or filter.
          </div>
        )}
      </div>
    </div>
  );
}

