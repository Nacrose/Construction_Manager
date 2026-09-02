"use client";

import Link from "next/link";
import { Search, FileSpreadsheet, Calculator, Sparkles, Copy, Layers, ChevronDown, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { trpc } from "@/lib/trpc-client";
import { toast } from "sonner";

export function BoqTabHeader({
  id,
  pathname,
  activeTab,
  search,
  setSearch,
  tableDensity,
  setTableDensity,
  showBaseline,
  setShowBaseline,
  canWrite,
  isLocked,
  onExcelPasteOpen,
  isInspectorOpen = false,
  onToggleInspector,
}: {
  id: string;
  pathname: string;
  activeTab: string;
  search: string;
  setSearch: (val: string) => void;
  tableDensity: "comfortable" | "compact";
  setTableDensity: (val: "comfortable" | "compact") => void;
  showBaseline: boolean;
  setShowBaseline: (val: boolean) => void;
  canWrite: boolean;
  isLocked: boolean;
  onExcelPasteOpen: () => void;
  isInspectorOpen?: boolean;
  onToggleInspector?: () => void;
}) {
  const utils = trpc.useUtils() as any;

  const { data: libsData } = trpc.analysisLibrary.list.useQuery({ projectId: id });
  const setDefaultLib = trpc.analysisLibrary.setDefault.useMutation({
    onSuccess: () => {
      utils.analysisLibrary.list.invalidate({ projectId: id });
      utils.rateAnalysis.getResources.invalidate({ projectId: id });
      utils.gantt.list.invalidate({ projectId: id });
      toast.success("Default analysis library updated for project scheduling");
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <div className="no-print sticky top-0 z-30 -mx-1 flex items-center gap-1.5 overflow-x-auto bg-background/90 px-2 py-1.5 backdrop-blur-md border-b border-border/40">
      {/* Planning module tabs (Links) */}
      <Link
        href={`/projects/${id}/boq`}
        className={cn(
          "px-3 py-1.5 text-sm font-medium border-b-2 -mb-px transition-colors shrink-0",
          pathname === `/projects/${id}/boq` || pathname.startsWith(`/projects/${id}/boq/`)
            ? "border-primary text-foreground"
            : "border-transparent text-muted-foreground hover:text-foreground"
        )}
      >
        BOQ
      </Link>
      <Link
        href={`/projects/${id}/look-ahead`}
        className={cn(
          "px-3 py-1.5 text-sm font-medium border-b-2 -mb-px transition-colors shrink-0",
          pathname === `/projects/${id}/look-ahead` || pathname.startsWith(`/projects/${id}/look-ahead/`)
            ? "border-primary text-foreground"
            : "border-transparent text-muted-foreground hover:text-foreground"
        )}
      >
        Look-Ahead
      </Link>

      {/* Separator */}
      <div className="h-5 w-px bg-border/40 mx-1 shrink-0" />

      {/* BOQ sub-tabs (Radix Tabs) */}
      <TabsList className="shrink-0">
        <TabsTrigger value="boq">BoQ</TabsTrigger>
        <TabsTrigger value="schedule">Schedule</TabsTrigger>
        <TabsTrigger value="resources">Resources</TabsTrigger>
        <TabsTrigger value="scurve">S-Curve</TabsTrigger>
      </TabsList>

      {/* Contextual controls */}
      {activeTab === "boq" && (
        <>
          {/* Search bar */}
          <div className="relative min-w-[140px] flex-1">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search code, description…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-8 pl-8 text-xs"
            />
          </div>

          {/* Density Toggle */}
          <div
            className="flex items-center rounded border border-border/80 bg-muted/40 p-0.5 shrink-0"
            title="Table Row Density"
          >
            <button
              onClick={() => setTableDensity("comfortable")}
              className={cn(
                "px-2 py-1 text-[11px] font-mono rounded transition-colors",
                tableDensity === "comfortable"
                  ? "bg-primary text-primary-foreground font-bold shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
              title="Comfortable row height"
            >
              Comfortable
            </button>
            <button
              onClick={() => setTableDensity("compact")}
              className={cn(
                "px-2 py-1 text-[11px] font-mono rounded transition-colors",
                tableDensity === "compact"
                  ? "bg-primary text-primary-foreground font-bold shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
              title="Dense compact spreadsheet mode"
            >
              Compact
            </button>
          </div>

          {/* Baseline toggle */}
          <Button
            variant={showBaseline ? "default" : "outline"}
            size="sm"
            onClick={() => setShowBaseline(!showBaseline)}
            className="h-8 shrink-0 text-xs"
            title="Show baseline (original contract) quantities and rates"
          >
            Baseline
          </Button>

          {/* Excel Direct Paste */}
          {canWrite && !isLocked && (
            <Button
              variant="outline"
              size="sm"
              onClick={onExcelPasteOpen}
              className="h-8 shrink-0 text-xs gap-1.5 font-mono text-primary border-primary/40 hover:bg-primary/10"
              title="Paste cells directly from Excel or Google Sheets"
            >
              <FileSpreadsheet className="h-3.5 w-3.5" />
              Paste Excel
            </Button>
          )}

          {/* Global Rate Analysis Tools Dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="h-8 shrink-0 text-xs gap-1 font-mono border-border bg-[var(--navy-mid)]/80 hover:bg-[var(--navy-mid)] text-foreground"
              >
                <Sparkles className="h-3.5 w-3.5 text-amber-400" />
                <span>RA Tools</span>
                <ChevronDown className="h-3 w-3 text-muted-foreground/80" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56 bg-[var(--navy-deep)] border-border text-xs">
              <DropdownMenuLabel className="text-[10px] uppercase font-mono text-muted-foreground/80">
                Default Scheduling Library
              </DropdownMenuLabel>
              {libsData?.libraries?.map((lib) => (
                <DropdownMenuItem
                  key={lib.id}
                  onClick={() => setDefaultLib.mutate({ projectId: id, libraryId: lib.id })}
                  className="flex items-center justify-between cursor-pointer text-xs"
                >
                  <span>{lib.name}</span>
                  {libsData.defaultLibraryId === lib.id && <Check className="h-3.5 w-3.5 text-primary" />}
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator className="bg-[var(--navy-mid)]" />
              <DropdownMenuLabel className="text-[10px] uppercase font-mono text-muted-foreground/80">
                Quick Navigation
              </DropdownMenuLabel>
              <DropdownMenuItem asChild>
                <Link href={`/projects/${id}/rate-library`} className="flex items-center gap-1.5 cursor-pointer">
                  <Layers className="h-3.5 w-3.5 text-info/80" />
                  <span>District Rate Catalogs</span>
                </Link>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Rate Analysis Inspector Pane Toggle Button */}
          {onToggleInspector && (
            <Button
              variant={isInspectorOpen ? "default" : "outline"}
              size="sm"
              onClick={onToggleInspector}
              className={cn(
                "h-8 shrink-0 text-xs gap-1.5 font-mono transition-all",
                isInspectorOpen
                  ? "bg-primary text-primary-foreground font-bold shadow-sm"
                  : "border-primary/40 text-primary hover:bg-primary/10"
              )}
              title="Toggle Rate Analysis Inspector Pane (Space)"
            >
              <Calculator className="h-3.5 w-3.5" />
              <span>Inspector</span>
            </Button>
          )}
        </>
      )}

      {activeTab !== "boq" && <div className="flex-1" />}
    </div>
  );
}
