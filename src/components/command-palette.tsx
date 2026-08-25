"use client";

import { useEffect, useState, useMemo } from "react";
import { useRouter, usePathname } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Terminal, Search, Sparkles, FolderKanban, Truck, ReceiptText,
  FileQuestion, Users, Database, Layers, Flame, Calculator,
  Zap, CloudRain, Eye, ArrowRight, CornerDownLeft, Maximize2,
} from "lucide-react";
import { useFXStore } from "@/lib/fx-store";
import { cyberAudio } from "@/lib/cyber-audio";
import { cn } from "@/lib/utils";

interface CommandItem {
  id: string;
  category: "Navigation" | "FX & Terminal" | "Calculators" | "Actions";
  title: string;
  subtitle?: string;
  icon: React.ComponentType<{ className?: string }>;
  action: () => void;
  keywords?: string[];
}

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const router = useRouter();
  const pathname = usePathname();

  const fx = useFXStore();

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
        if (fx.soundEnabled) cyberAudio.playCommandChime(fx.soundVolume);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [fx.soundEnabled, fx.soundVolume]);

  const commands: CommandItem[] = useMemo(() => {
    const list: CommandItem[] = [
      // FX & Terminal Controls
      {
        id: "app-fullscreen-toggle",
        category: "FX & Terminal",
        title: "Toggle True Fullscreen (Hide Browser Header)",
        subtitle: "Enter or exit complete immersive fullscreen desktop mode",
        icon: Maximize2,
        action: () => {
          if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen().catch(() => {});
          } else {
            document.exitFullscreen().catch(() => {});
          }
        },
        keywords: ["fullscreen", "full", "screen", "hide", "browser", "firefox", "tabs"],
      },
      {
        id: "fx-droplets-toggle",
        category: "FX & Terminal",
        title: `Glass Water Droplets: ${fx.waterDropletsEnabled ? "DISABLE" : "ENABLE"}`,
        subtitle: `Surface water beads and sliding gravity trickles (${fx.dropletCount} drops)`,
        icon: CloudRain,
        action: () => fx.setWaterDroplets(!fx.waterDropletsEnabled),
        keywords: ["water", "droplets", "glass", "beads", "trickle"],
      },
      {
        id: "fx-storm-toggle",
        category: "FX & Terminal",
        title: `Storm Wind Streaks: ${fx.stormWindEnabled ? "DISABLE" : "ENABLE"}`,
        subtitle: "Angled wind drift and falling storm rain streaks",
        icon: CloudRain,
        action: () => fx.setStormWind(!fx.stormWindEnabled),
        keywords: ["storm", "wind", "rain", "streaks"],
      },
      {
        id: "fx-matrix-toggle",
        category: "FX & Terminal",
        title: `Matrix Digital Stream: ${fx.matrixRainEnabled ? "DISABLE" : "ENABLE"}`,
        subtitle: "Toggle green falling code characters",
        icon: Terminal,
        action: () => fx.setMatrixRain(!fx.matrixRainEnabled),
        keywords: ["matrix", "code", "green", "glyphs"],
      },
      {
        id: "fx-lightning-toggle",
        category: "FX & Terminal",
        title: `Lightning Simulator: ${fx.lightningEnabled ? "DISABLE" : "ENABLE"}`,
        subtitle: "Toggle electric bolts and horizon thunder flashes",
        icon: Zap,
        action: () => fx.setLightning(!fx.lightningEnabled),
        keywords: ["lightning", "thunder", "flash", "storm"],
      },
      {
        id: "fx-sound-toggle",
        category: "FX & Terminal",
        title: `Cyber Audio Soundscapes: ${fx.soundEnabled ? "MUTE" : "UNMUTE"}`,
        subtitle: `Mechanical key clicks, thunder, and rain audio (${Math.round(fx.soundVolume * 100)}% vol)`,
        icon: Sparkles,
        action: () => fx.setSoundEnabled(!fx.soundEnabled),
        keywords: ["sound", "audio", "mute", "click", "keystroke", "volume"],
      },
      {
        id: "fx-preset-heavy-storm",
        category: "FX & Terminal",
        title: "Preset: Heavy Cyber Storm",
        subtitle: "Matrix Rain + Storm Wind + Water Droplets + Lightning + Rain Audio",
        icon: Sparkles,
        action: () => fx.applyPreset("heavy_storm"),
        keywords: ["preset", "heavy", "storm", "max"],
      },
      {
        id: "fx-preset-rainy-glass",
        category: "FX & Terminal",
        title: "Preset: Rainy Glass",
        subtitle: "Condensing water droplets with 50% glass transparency",
        icon: CloudRain,
        action: () => fx.applyPreset("rainy_glass"),
        keywords: ["preset", "rainy", "glass", "droplets"],
      },
      {
        id: "fx-preset-clean-office",
        category: "FX & Terminal",
        title: "Preset: Clean Office Solid",
        subtitle: "100% Solid Carbon panels, 0% FX for distraction-free focus",
        icon: Eye,
        action: () => fx.applyPreset("clean_office"),
        keywords: ["preset", "clean", "office", "solid", "off"],
      },
    ];

    // Navigation
    list.push(
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
      }
    );

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
        }
      );
    }

    return list;
  }, [fx, projectId, router]);

  const filteredCommands = useMemo(() => {
    if (!query.trim()) return commands;
    const q = query.toLowerCase();
    return commands.filter((cmd) => {
      return (
        cmd.title.toLowerCase().includes(q) ||
        cmd.subtitle?.toLowerCase().includes(q) ||
        cmd.category.toLowerCase().includes(q) ||
        cmd.keywords?.some((k) => k.toLowerCase().includes(q))
      );
    });
  }, [commands, query]);

  const handleSelect = (cmd: CommandItem) => {
    cmd.action();
    setOpen(false);
    setQuery("");
    if (fx.soundEnabled) cyberAudio.playCommandChime(fx.soundVolume);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((prev) => (prev + 1) % Math.max(1, filteredCommands.length));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((prev) => (prev - 1 + filteredCommands.length) % Math.max(1, filteredCommands.length));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (filteredCommands[selectedIndex]) {
        handleSelect(filteredCommands[selectedIndex]);
      }
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-xl p-0 border border-primary/40 bg-card/90 backdrop-blur-2xl shadow-[0_0_40px_rgba(0,255,102,0.25)] rounded-lg overflow-hidden gap-0">
        <DialogTitle className="sr-only">Matrix HUD Command Palette</DialogTitle>
        
        {/* Terminal Header */}
        <div className="flex items-center gap-2 px-3 py-2.5 border-b border-border bg-muted/80">
          <Terminal className="h-4 w-4 text-primary animate-pulse" />
          <span className="text-xs font-mono font-bold text-primary uppercase tracking-wider">
            MATRIX COMMAND TERMINAL [Cmd+K]
          </span>
          <div className="ml-auto flex items-center gap-1 text-[10px] font-mono text-muted-foreground">
            <span className="px-1 py-0.5 rounded border border-border bg-muted">ESC</span> to exit
          </div>
        </div>

        {/* Search Input */}
        <div className="flex items-center px-3 py-2 border-b border-border/60 bg-background/60">
          <Search className="h-4 w-4 text-muted-foreground mr-2" />
          <Input
            autoFocus
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
            onKeyDown={handleKeyDown}
            placeholder="Type a command, FX toggle, or navigation jump..."
            className="h-8 border-none bg-transparent font-mono text-xs text-foreground focus-visible:ring-0 focus-visible:ring-offset-0 px-0 placeholder:text-muted-foreground"
          />
        </div>

        {/* Results List */}
        <div className="max-h-80 overflow-y-auto p-1.5 space-y-1">
          {filteredCommands.length === 0 ? (
            <div className="py-8 text-center text-xs font-mono text-muted-foreground">
              No matching command found for &quot;{query}&quot;
            </div>
          ) : (
            filteredCommands.map((cmd, idx) => {
              const Icon = cmd.icon;
              const isSelected = idx === selectedIndex;
              return (
                <div
                  key={cmd.id}
                  onClick={() => handleSelect(cmd)}
                  onMouseEnter={() => setSelectedIndex(idx)}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2 rounded cursor-pointer transition-all text-xs font-mono",
                    isSelected
                      ? "bg-primary/20 text-primary border border-primary/50 shadow-[0_0_12px_rgba(0,255,102,0.2)]"
                      : "text-foreground hover:bg-muted/60"
                  )}
                >
                  <Icon className={cn("h-4 w-4 shrink-0", isSelected ? "text-primary" : "text-muted-foreground")} />
                  <div className="min-w-0 flex-1">
                    <p className="font-bold truncate">{cmd.title}</p>
                    {cmd.subtitle && (
                      <p className="text-[10px] text-muted-foreground truncate">{cmd.subtitle}</p>
                    )}
                  </div>
                  <span className="text-[9px] uppercase px-1.5 py-0.5 rounded border border-border text-muted-foreground shrink-0">
                    {cmd.category}
                  </span>
                  {isSelected && <CornerDownLeft className="h-3 w-3 text-primary shrink-0" />}
                </div>
              );
            })
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
