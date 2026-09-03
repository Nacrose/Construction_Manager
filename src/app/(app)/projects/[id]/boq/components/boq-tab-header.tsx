"use client";

import Link from "next/link";
import { Calculator, ChevronDown, FileSpreadsheet, LayoutPanelTop, Search, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { trpc } from "@/lib/trpc-client";
import { toast } from "sonner";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

export function BoqTabHeader({
  id, search, setSearch, tableDensity, setTableDensity, showBaseline, setShowBaseline,
  canWrite, isLocked, onExcelPasteOpen, isInspectorOpen = false, onToggleInspector,
}: {
  id: string;
  search: string;
  setSearch: (value: string) => void;
  tableDensity: "comfortable" | "compact";
  setTableDensity: (value: "comfortable" | "compact") => void;
  showBaseline: boolean;
  setShowBaseline: (value: boolean) => void;
  canWrite: boolean;
  isLocked: boolean;
  onExcelPasteOpen: () => void;
  isInspectorOpen?: boolean;
  onToggleInspector?: () => void;
}) {
  const utils = trpc.useUtils() as any;
  const { data: libraries } = trpc.analysisLibrary.list.useQuery({ projectId: id });
  const setDefaultLibrary = trpc.analysisLibrary.setDefault.useMutation({
    onSuccess: () => {
      utils.analysisLibrary.list.invalidate({ projectId: id });
      utils.rateAnalysis.getResources.invalidate({ projectId: id });
      toast.success("Default rate analysis library updated");
    },
    onError: (error) => toast.error(error.message),
  });

  return (
    <header className="no-print sticky top-0 z-30 border-b border-border/75 bg-background/92 pb-1 pt-0 backdrop-blur-md">
      <div className="flex min-h-9 items-center gap-2">
        <div className="min-w-0 mr-1">
          <h1 className="text-sm font-semibold text-foreground">BOQ & rates</h1>
          <p className="text-[9px] font-mono uppercase tracking-[0.1em] text-muted-foreground">Commercial register</p>
        </div>
        <Link href={`/projects/${id}/gantt`} className="hidden items-center gap-1 text-[10px] font-medium text-muted-foreground hover:text-primary sm:flex" title="Open the project schedule"><LayoutPanelTop className="h-3.5 w-3.5" />Planning</Link>
        <div className="relative min-w-[180px] max-w-sm flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Search code, description…" value={search} onChange={(event) => setSearch(event.target.value)} className="h-7 bg-card pl-8 text-xs shadow-inner" />
        </div>
        <div className="hidden items-center rounded-[4px] border border-border bg-secondary/55 p-0.5 shadow-inner md:flex" title="Table row density">
          {(["comfortable", "compact"] as const).map((density) => <button key={density} type="button" onClick={() => setTableDensity(density)} className={cn("h-6 rounded-[3px] px-2 text-[9px] font-mono font-semibold uppercase transition-all", tableDensity === density ? "bg-card text-primary shadow-[0_1px_1px_rgba(79,62,45,0.12)]" : "text-muted-foreground hover:text-foreground")}>{density === "comfortable" ? "Comfort" : "Compact"}</button>)}
        </div>
        <Button variant={showBaseline ? "default" : "outline"} size="sm" onClick={() => setShowBaseline(!showBaseline)} className="h-7 text-[10px]">Baseline</Button>
        {canWrite && !isLocked && <Button variant="outline" size="sm" onClick={onExcelPasteOpen} className="hidden h-7 gap-1.5 text-[10px] text-primary md:inline-flex"><FileSpreadsheet className="h-3.5 w-3.5" />Paste Excel</Button>}
        <DropdownMenu>
          <DropdownMenuTrigger asChild><Button variant="outline" size="sm" className="h-7 gap-1 text-[10px]"><Sparkles className="h-3.5 w-3.5 text-primary" />Rates<ChevronDown className="h-3 w-3" /></Button></DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56 text-xs"><DropdownMenuLabel className="text-[9px] font-mono uppercase tracking-[0.1em] text-muted-foreground">Default rate analysis library</DropdownMenuLabel><DropdownMenuSeparator />{libraries?.libraries?.map((library) => <DropdownMenuItem key={library.id} onClick={() => setDefaultLibrary.mutate({ projectId: id, libraryId: library.id })} className="cursor-pointer text-xs">{library.name}{libraries.defaultLibraryId === library.id && <span className="ml-auto text-primary">Current</span>}</DropdownMenuItem>)}</DropdownMenuContent>
        </DropdownMenu>
        {onToggleInspector && <Button variant={isInspectorOpen ? "default" : "outline"} size="sm" onClick={onToggleInspector} className="h-7 gap-1 text-[10px]"><Calculator className="h-3.5 w-3.5" /><span className="hidden lg:inline">Inspector</span></Button>}
      </div>
    </header>
  );
}
