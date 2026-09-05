"use client";

import { RefObject } from "react";
import { Search, X, SlidersHorizontal, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export const STATUSES = ["all", "draft", "submitted", "approved", "rejected", "closed"] as const;
export const PRIORITIES = ["all", "urgent", "high", "normal", "low"] as const;
export const DISCIPLINES = [
  "all",
  "civil",
  "structural",
  "electrical",
  "mechanical",
  "architectural",
  "none",
] as const;

export function RfiToolbar({
  search,
  setSearch,
  statusFilter,
  setStatusFilter,
  priorityFilter,
  setPriorityFilter,
  disciplineFilter,
  setDisciplineFilter,
  fromDate,
  setFromDate,
  toDate,
  setToDate,
  rfis,
  searchInputRef,
}: {
  search: string;
  setSearch: (val: string) => void;
  statusFilter: string;
  setStatusFilter: (val: string) => void;
  priorityFilter: string;
  setPriorityFilter: (val: string) => void;
  disciplineFilter: string;
  setDisciplineFilter: (val: string) => void;
  fromDate: string;
  setFromDate: (val: string) => void;
  toDate: string;
  setToDate: (val: string) => void;
  rfis: any[];
  searchInputRef: RefObject<HTMLInputElement | null>;
}) {
  const activeFilterCount =
    (statusFilter !== "all" ? 1 : 0) +
    (priorityFilter !== "all" ? 1 : 0) +
    (disciplineFilter !== "all" ? 1 : 0) +
    (fromDate || toDate ? 1 : 0);

  const resetFilters = () => {
    setStatusFilter("all");
    setPriorityFilter("all");
    setDisciplineFilter("all");
    setFromDate("");
    setToDate("");
  };

  return (
    <div className="flex items-center gap-2 flex-1 min-w-[240px]">
      {/* Search Bar */}
      <div className="relative flex-1">
        <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          ref={searchInputRef}
          placeholder="Search RFI #, subject, discipline... (press /)"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-8 bg-background h-8 text-xs font-mono border-border/80"
        />
        {search && (
          <button
            onClick={() => setSearch("")}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* Consolidated Filters Popover */}
      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className={cn(
              "h-8 text-xs font-mono border-border/80 gap-1.5 shrink-0 transition-colors",
              activeFilterCount > 0 && "border-primary bg-primary/10 text-primary font-bold"
            )}
          >
            <SlidersHorizontal className="h-3.5 w-3.5" />
            <span>Filters</span>
            {activeFilterCount > 0 && (
              <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-primary text-primary-foreground font-bold leading-none">
                {activeFilterCount}
              </span>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-80 p-4 font-mono bg-card border-border shadow-xl space-y-3.5" align="start">
          <div className="flex items-center justify-between border-b border-border pb-2">
            <span className="text-xs font-bold text-foreground">Filter RFIs</span>
            {activeFilterCount > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-[11px] text-muted-foreground hover:text-foreground gap-1"
                onClick={resetFilters}
              >
                <RotateCcw className="h-3 w-3" /> Reset
              </Button>
            )}
          </div>

          {/* Status Filter */}
          <div className="space-y-1.5">
            <Label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              Status
            </Label>
            <div className="flex flex-wrap gap-1">
              {STATUSES.map((s) => (
                <button
                  key={s}
                  onClick={() => setStatusFilter(s)}
                  className={cn(
                    "px-2 py-0.5 rounded text-[10px] uppercase font-mono border transition-all",
                    statusFilter === s
                      ? "bg-primary text-primary-foreground font-bold border-primary shadow-xs"
                      : "bg-background text-muted-foreground border-border hover:border-primary/40 hover:text-foreground"
                  )}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          {/* Priority Filter */}
          <div className="space-y-1.5">
            <Label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              Priority
            </Label>
            <div className="flex flex-wrap gap-1">
              {PRIORITIES.map((p) => (
                <button
                  key={p}
                  onClick={() => setPriorityFilter(p)}
                  className={cn(
                    "px-2 py-0.5 rounded text-[10px] uppercase font-mono border transition-all",
                    priorityFilter === p
                      ? p === "urgent"
                        ? "bg-destructive text-destructive-foreground font-bold border-destructive shadow-xs"
                        : "bg-primary text-primary-foreground font-bold border-primary shadow-xs"
                      : "bg-background text-muted-foreground border-border hover:border-primary/40 hover:text-foreground"
                  )}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>

          {/* Discipline Filter */}
          <div className="space-y-1.5">
            <Label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              Discipline
            </Label>
            <div className="flex flex-wrap gap-1">
              {DISCIPLINES.map((d) => {
                const count = (rfis || []).filter((r) =>
                  d === "all" ? true : d === "none" ? !r.discipline : r.discipline === d
                ).length;
                return (
                  <button
                    key={d}
                    onClick={() => setDisciplineFilter(d)}
                    className={cn(
                      "px-2 py-0.5 rounded text-[10px] font-mono border transition-all flex items-center gap-1",
                      disciplineFilter === d
                        ? "bg-primary text-primary-foreground font-bold border-primary shadow-xs"
                        : "bg-background text-muted-foreground border-border hover:border-primary/40 hover:text-foreground"
                    )}
                  >
                    <span className="capitalize">
                      {d === "all" ? "All" : d === "none" ? "General" : d}
                    </span>
                    <span className="text-[9px] opacity-70">({count})</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Date Range */}
          <div className="space-y-1.5 pt-1 border-t border-border/60">
            <Label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              Work / Logged Date
            </Label>
            <div className="grid grid-cols-2 gap-2">
              <Input
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                className="h-7 text-xs bg-background border-border"
              />
              <Input
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                className="h-7 text-xs bg-background border-border"
              />
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
