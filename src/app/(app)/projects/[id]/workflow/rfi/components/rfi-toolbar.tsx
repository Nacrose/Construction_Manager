"use client";

import { RefObject } from "react";
import { Search, X, Calendar } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
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
  const hasActiveFilters =
    Boolean(search) ||
    statusFilter !== "all" ||
    priorityFilter !== "all" ||
    disciplineFilter !== "all" ||
    Boolean(fromDate) ||
    Boolean(toDate);

  return (
    <div className="rounded border border-border/80 bg-card p-2 space-y-2">
      <div className="flex flex-col md:flex-row gap-2 items-center">
        {/* Search bar */}
        <div className="relative flex-1 min-w-[200px] w-full">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            ref={searchInputRef}
            placeholder="Search RFI #, subject, discipline, task... (press /)"
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

        {/* Status Pills */}
        <div className="flex items-center gap-1 overflow-x-auto no-scrollbar">
          {STATUSES.map((s) => {
            const isSel = statusFilter === s;
            return (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={cn(
                  "h-7 px-2.5 rounded text-[11px] font-mono border transition-all uppercase shrink-0",
                  isSel
                    ? "bg-primary text-primary-foreground font-bold border-primary shadow-sm"
                    : "bg-muted/30 text-muted-foreground border-border/60 hover:text-foreground hover:border-primary/40"
                )}
              >
                {s}
              </button>
            );
          })}
        </div>

        {/* Priority Select */}
        <div className="flex items-center gap-1 shrink-0">
          {PRIORITIES.map((p) => {
            const isSel = priorityFilter === p;
            return (
              <button
                key={p}
                onClick={() => setPriorityFilter(p)}
                className={cn(
                  "h-7 px-2 rounded text-[10px] font-mono border transition-all uppercase",
                  isSel
                    ? p === "urgent"
                      ? "bg-destructive text-destructive-foreground font-bold border-destructive"
                      : "bg-primary text-primary-foreground font-bold border-primary"
                    : "bg-muted/30 text-muted-foreground border-border/60 hover:text-foreground"
                )}
              >
                {p}
              </button>
            );
          })}
        </div>

        {/* Date range popover */}
        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className={cn(
                "h-8 text-xs font-mono border-border/80 gap-1.5 shrink-0",
                (fromDate || toDate) && "border-primary text-primary bg-primary/10"
              )}
            >
              <Calendar className="h-3.5 w-3.5" />
              <span>Date</span>
              {(fromDate || toDate) && <span className="h-1.5 w-1.5 rounded-full bg-primary" />}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-3 font-mono bg-card border-border" align="end">
            <div className="space-y-2">
              <p className="text-xs font-bold text-foreground">Filter Work Date</p>
              <div className="flex items-center gap-2">
                <Input
                  type="date"
                  value={fromDate}
                  onChange={(e) => setFromDate(e.target.value)}
                  className="h-8 text-xs w-[140px] bg-background border-border"
                />
                <span className="text-muted-foreground text-xs">–</span>
                <Input
                  type="date"
                  value={toDate}
                  onChange={(e) => setToDate(e.target.value)}
                  className="h-8 text-xs w-[140px] bg-background border-border"
                />
              </div>
              {(fromDate || toDate) && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs w-full text-muted-foreground hover:text-foreground"
                  onClick={() => {
                    setFromDate("");
                    setToDate("");
                  }}
                >
                  Clear Date Range
                </Button>
              )}
            </div>
          </PopoverContent>
        </Popover>

        {hasActiveFilters && (
          <Button
            variant="ghost"
            size="sm"
            className="h-8 text-xs font-mono text-muted-foreground hover:text-foreground shrink-0"
            onClick={() => {
              setSearch("");
              setStatusFilter("all");
              setPriorityFilter("all");
              setDisciplineFilter("all");
              setFromDate("");
              setToDate("");
            }}
          >
            <X className="h-3.5 w-3.5 mr-1" /> Reset
          </Button>
        )}
      </div>

      {/* Quick Discipline Filter Chips */}
      <div className="flex items-center gap-1.5 overflow-x-auto pt-1 border-t border-border/40 no-scrollbar">
        <span className="text-[10px] uppercase text-muted-foreground tracking-wider shrink-0 mr-1">
          Discipline:
        </span>
        {DISCIPLINES.map((d) => {
          const count = (rfis || []).filter((r) =>
            d === "all" ? true : d === "none" ? !r.discipline : r.discipline === d
          ).length;
          const isSel = disciplineFilter === d;
          return (
            <button
              key={d}
              onClick={() => setDisciplineFilter(d)}
              className={cn(
                "px-2 py-0.5 rounded text-[11px] font-mono border transition-all shrink-0 flex items-center gap-1",
                isSel
                  ? "bg-primary text-primary-foreground font-bold border-primary shadow-sm"
                  : "bg-muted/30 text-muted-foreground border-border/60 hover:border-primary/40 hover:text-foreground"
              )}
            >
              <span className="capitalize">
                {d === "all" ? "All Disciplines" : d === "none" ? "General" : d}
              </span>
              <span
                className={cn(
                  "text-[10px] px-1 rounded",
                  isSel
                    ? "bg-black/20 text-primary-foreground font-bold"
                    : "bg-muted text-muted-foreground"
                )}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
