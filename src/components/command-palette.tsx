"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { useRouter, usePathname } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Search, FolderKanban, Truck, ReceiptText,
  FileQuestion, Database, Layers, CornerDownLeft,
  Maximize2, FileText, ClipboardList, Loader2,
} from "lucide-react";
import { fetchWithAuth } from "@/lib/client-auth";
import { cn } from "@/lib/utils";

interface CommandItem {
  id: string;
  category: "Search Results" | "Navigation" | "Actions";
  title: string;
  subtitle?: string;
  icon: React.ComponentType<{ className?: string }>;
  action: () => void;
  keywords?: string[];
}

interface SearchResults {
  projects: Array<{ id: string; name: string; code: string; status: string; href: string }>;
  rfis: Array<{ id: string; number: string; subject: string; status: string; project: { code: string }; href: string }>;
  reports: Array<{ id: string; number: string; status: string; reportDate: string; project: { code: string }; href: string }>;
}

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [searchResults, setSearchResults] = useState<SearchResults | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const router = useRouter();
  const pathname = usePathname();

  const projectId = useMemo(() => {
    const m = pathname?.match(/^\/projects\/([^/]+)/);
    return m?.[1] ?? null;
  }, [pathname]);

  // Global Cmd+K / Ctrl+K listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Debounced live search against /api/search
  const runSearch = useCallback(async (q: string) => {
    if (q.length < 2) {
      setSearchResults(null);
      return;
    }
    setIsSearching(true);
    try {
      const res = await fetchWithAuth(`/api/search?q=${encodeURIComponent(q)}`);
      if (res.ok) {
        const json = await res.json();
        setSearchResults(json.data ?? json);
      }
    } catch {
      // Silently ignore — search is best-effort
    } finally {
      setIsSearching(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => runSearch(query), 250);
    return () => clearTimeout(timer);
  }, [query, runSearch]);

  // Reset on close
  useEffect(() => {
    if (!open) {
      setQuery("");
      setSearchResults(null);
      setSelectedIndex(0);
    }
  }, [open]);

  // Build live search result commands
  const searchResultCommands: CommandItem[] = useMemo(() => {
    if (!searchResults) return [];
    const items: CommandItem[] = [];

    searchResults.projects?.forEach((p) =>
      items.push({
        id: `sr-project-${p.id}`,
        category: "Search Results",
        title: p.name,
        subtitle: `Project · ${p.code} · ${p.status}`,
        icon: FolderKanban,
        action: () => router.push(p.href),
      })
    );

    searchResults.rfis?.forEach((r) =>
      items.push({
        id: `sr-rfi-${r.id}`,
        category: "Search Results",
        title: `${r.number} — ${r.subject}`,
        subtitle: `RFI · ${r.project.code} · ${r.status}`,
        icon: FileQuestion,
        action: () => router.push(r.href),
      })
    );

    searchResults.reports?.forEach((r) =>
      items.push({
        id: `sr-report-${r.id}`,
        category: "Search Results",
        title: `Daily Report ${r.number}`,
        subtitle: `Report · ${r.project.code} · ${r.reportDate?.slice(0, 10) ?? ""}`,
        icon: ClipboardList,
        action: () => router.push(r.href),
      })
    );

    return items;
  }, [searchResults, router]);

  // Static command list
  const staticCommands: CommandItem[] = useMemo(() => {
    const list: CommandItem[] = [
      {
        id: "app-fullscreen-toggle",
        category: "Actions",
        title: "Toggle True Fullscreen",
        subtitle: "Enter or exit complete immersive fullscreen desktop mode",
        icon: Maximize2,
        action: () => {
          if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen().catch(() => {});
          } else {
            document.exitFullscreen().catch(() => {});
          }
        },
        keywords: ["fullscreen", "full", "screen", "hide", "browser"],
      },
      // Navigation
      {
        id: "nav-dashboard",
        category: "Navigation",
        title: "Jump to Main Dashboard",
        subtitle: "/dashboard",
        icon: FolderKanban,
        action: () => router.push("/dashboard"),
        keywords: ["home", "dashboard"],
      },
      {
        id: "nav-projects",
        category: "Navigation",
        title: "Jump to All Projects",
        subtitle: "/projects",
        icon: FolderKanban,
        action: () => router.push("/projects"),
        keywords: ["projects", "list"],
      },
      {
        id: "nav-drawings",
        category: "Navigation",
        title: "Jump to Drawings Vault (Master Blueprints)",
        subtitle: "/drawings",
        icon: Layers,
        action: () => router.push("/drawings"),
        keywords: ["drawings", "blueprints", "cad", "revisions", "plans"],
      },
      {
        id: "nav-correspondence",
        category: "Navigation",
        title: "Jump to Correspondence Register (Letters)",
        subtitle: "/correspondence",
        icon: FileText,
        action: () => router.push("/correspondence"),
        keywords: ["letters", "correspondence", "notices", "eot", "chalan", "darta"],
      },
      {
        id: "nav-inventory",
        category: "Navigation",
        title: "Jump to Multi-Project Inventory Matrix",
        subtitle: "/inventory",
        icon: Truck,
        action: () => router.push("/inventory"),
        keywords: ["inventory", "stock", "materials", "warehouse"],
      },
      {
        id: "nav-finance",
        category: "Navigation",
        title: "Jump to Finance & Accounts Hub",
        subtitle: "/finance",
        icon: ReceiptText,
        action: () => router.push("/finance"),
        keywords: ["finance", "accounting", "daybook", "cashbook", "guarantees"],
      },
    ];

    if (projectId) {
      list.push(
        {
          id: "nav-proj-boq",
          category: "Navigation",
          title: "Jump to Bill of Quantities (BOQ)",
          subtitle: `/projects/${projectId}/boq`,
          icon: ReceiptText,
          action: () => router.push(`/projects/${projectId}/boq`),
          keywords: ["boq", "quantities", "rate", "analysis"],
        },
        {
          id: "nav-proj-production",
          category: "Navigation",
          title: "Jump to Plant & Production Batch Tickets",
          subtitle: `/projects/${projectId}/production`,
          icon: Truck,
          action: () => router.push(`/projects/${projectId}/production`),
          keywords: ["production", "concrete", "asphalt", "batch", "ticket", "chalan"],
        },
        {
          id: "nav-proj-drawings",
          category: "Navigation",
          title: "Jump to Blueprint Drawing Center",
          subtitle: `/projects/${projectId}/drawings`,
          icon: Layers,
          action: () => router.push(`/projects/${projectId}/drawings`),
          keywords: ["drawings", "blueprint", "cad", "pdf"],
        },
        {
          id: "nav-proj-materials",
          category: "Navigation",
          title: "Jump to Material Management & Inventory",
          subtitle: `/projects/${projectId}/materials`,
          icon: Database,
          action: () => router.push(`/projects/${projectId}/materials`),
          keywords: ["materials", "inventory", "stock", "grn"],
        },
        {
          id: "nav-proj-rfis",
          category: "Navigation",
          title: "Jump to Requests for Information (RFIs)",
          subtitle: `/projects/${projectId}/rfis`,
          icon: FileQuestion,
          action: () => router.push(`/projects/${projectId}/rfis`),
          keywords: ["rfi", "rfis", "questions"],
        },
        {
          id: "nav-proj-accounting",
          category: "Navigation",
          title: "Jump to Day Book & Accounting",
          subtitle: `/projects/${projectId}/accounting`,
          icon: FileText,
          action: () => router.push(`/projects/${projectId}/accounting`),
          keywords: ["accounting", "day book", "ledger", "gl", "journal"],
        }
      );
    }

    return list;
  }, [projectId, router]);

  // All items: live search results first, then static filtered
  const allItems: CommandItem[] = useMemo(() => {
    if (searchResults && searchResultCommands.length > 0) {
      return searchResultCommands;
    }
    if (!query.trim()) return staticCommands;
    const lower = query.toLowerCase();
    return staticCommands.filter((item) => {
      const matchTitle = item.title.toLowerCase().includes(lower);
      const matchSubtitle = item.subtitle?.toLowerCase().includes(lower);
      const matchKeywords = item.keywords?.some((k) => k.toLowerCase().includes(lower));
      return matchTitle || matchSubtitle || matchKeywords;
    });
  }, [query, searchResults, searchResultCommands, staticCommands]);

  const handleSelect = useCallback(
    (cmd: CommandItem) => {
      setOpen(false);
      cmd.action();
    },
    []
  );

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((prev) => (prev + 1) % (allItems.length || 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((prev) => (prev - 1 + (allItems.length || 1)) % (allItems.length || 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (allItems[selectedIndex]) {
        handleSelect(allItems[selectedIndex]);
      }
    }
  };

  // Group by category
  const grouped = useMemo(() => {
    const map = new Map<string, CommandItem[]>();
    for (const item of allItems) {
      const group = map.get(item.category) ?? [];
      group.push(item);
      map.set(item.category, group);
    }
    return map;
  }, [allItems]);

  // Flat index for keyboard nav
  let flatIndex = 0;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-xl p-0 border border-[#c7d8e8] bg-white text-slate-900 shadow-2xl rounded-2xl overflow-hidden gap-0">
        <DialogTitle className="sr-only">Command Palette</DialogTitle>

        {/* Header */}
        <div className="flex items-center gap-2 px-4 py-3 border-b border-[#e2edf7] bg-[#f8fbfe]">
          <Search className="h-4 w-4 text-[#0284c7]" />
          <span className="text-xs font-mono font-bold text-slate-800 uppercase tracking-wider">
            Quick Navigation & Search [Cmd+K]
          </span>
          {isSearching && (
            <Loader2 className="h-3.5 w-3.5 text-[#0284c7] animate-spin ml-1" />
          )}
          <div className="ml-auto flex items-center gap-1 text-[10px] font-mono text-slate-500">
            <span className="px-1.5 py-0.5 rounded border border-[#c7d8e8] bg-[#e5eef7] text-slate-700 font-bold">ESC</span> to exit
          </div>
        </div>

        {/* Search Input */}
        <div className="flex items-center px-4 py-2.5 border-b border-[#e2edf7] bg-white">
          <Search className="h-4 w-4 text-slate-400 mr-2 shrink-0" />
          <Input
            autoFocus
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
            onKeyDown={handleKeyDown}
            placeholder="Search projects, RFIs, reports — or type a destination..."
            className="h-8 border-none bg-transparent font-sans text-xs text-slate-900 focus-visible:ring-0 focus-visible:ring-offset-0 px-0 placeholder:text-slate-400"
          />
        </div>

        {/* Results List */}
        <div className="max-h-[420px] overflow-y-auto p-2">
          {allItems.length === 0 && !isSearching ? (
            <div className="py-8 text-center text-xs font-sans text-slate-500">
              {query.length >= 2
                ? `No results found for "${query}"`
                : "No matching destination found"}
            </div>
          ) : (
            Array.from(grouped.entries()).map(([category, items]) => (
              <div key={category} className="mb-2">
                {/* Category label */}
                <div className="px-2 py-1 text-[10px] font-mono font-bold uppercase tracking-wider text-slate-500">
                  {category}
                </div>
                {items.map((cmd) => {
                  const idx = flatIndex++;
                  const isSelected = idx === selectedIndex;
                  const Icon = cmd.icon;
                  return (
                    <div
                      key={cmd.id}
                      onClick={() => handleSelect(cmd)}
                      onMouseEnter={() => setSelectedIndex(idx)}
                      className={cn(
                        "flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer transition-all text-xs font-sans",
                        isSelected
                          ? "bg-[#e5eef7] text-[#0284c7] border border-[#c7d8e8] font-bold shadow-xs"
                          : "text-slate-700 hover:bg-slate-50"
                      )}
                    >
                      <Icon className={cn("h-4 w-4 shrink-0", isSelected ? "text-[#0284c7]" : "text-slate-400")} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate">{cmd.title}</p>
                        {cmd.subtitle && (
                          <p className="text-[10px] text-slate-500 font-mono truncate">{cmd.subtitle}</p>
                        )}
                      </div>
                      {isSelected && <CornerDownLeft className="h-3.5 w-3.5 text-[#0284c7] shrink-0" />}
                    </div>
                  );
                })}
              </div>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
