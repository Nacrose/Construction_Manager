"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { Palette, Check, Sparkles, Sliders, Layout, Eye, Calendar } from "lucide-react";
import { useUserPreferences } from "@/components/user-preferences-provider";

import { toast } from "sonner";

export type StylesSettingsViewProps = {
  projectId: string;
};

const THEME_PRESETS = [
  { id: "omniplan", name: "OmniPlan Classic", primary: "#2563eb", critical: "#dc2626", complete: "#10b981", bg: "#f8fafc" },
  { id: "emerald", name: "Construction Emerald", primary: "#059669", critical: "#dc2626", complete: "#16a34a", bg: "#f0fdf4" },
  { id: "slate", name: "Modern Industrial Slate", primary: "#475569", critical: "#e11d48", complete: "#0d9488", bg: "#f8fafc" },
  { id: "amber", name: "High-Visibility Amber", primary: "#d97706", critical: "#b91c1c", complete: "#059669", bg: "#fffbeb" },
];

export function StylesSettingsView({ projectId: _projectId }: StylesSettingsViewProps) {
  const { getPref, setPref } = useUserPreferences();
  const selectedTheme = getPref<string>("ganttTheme", "omniplan");
  const compactDensity = getPref<boolean>("ganttCompactDensity", true);
  const showCriticalHighlight = getPref<boolean>("ganttShowCritHighlight", true);
  const showBaselineStripes = getPref<boolean>("ganttShowBaselineStripes", true);
  const barRadius = getPref<string>("ganttBarRadius", "rounded") as "rounded" | "sharp" | "pill";
  const showHolidays = getPref<boolean>("ganttShowHolidays", true);
  const showWeekends = getPref<boolean>("ganttShowWeekends", true);

  const handleSelectTheme = (themeId: string, themeName: string) => {
    setPref("ganttTheme", themeId);
    toast.success(`Active theme switched to ${themeName}`);
  };

  const handleBarRadius = (mode: "rounded" | "sharp" | "pill") => {
    setPref("ganttBarRadius", mode);
    toast.success(`Bar corners set to ${mode}`);
  };

  const handleDensityToggle = () => {
    const next = !compactDensity;
    setPref("ganttCompactDensity", next);
    toast.success(next ? "Switched to Compact (24px row height)" : "Switched to Comfortable (36px row height)");
  };

  const handleCritToggle = () => {
    const next = !showCriticalHighlight;
    setPref("ganttShowCritHighlight", next);
    toast.success(next ? "Critical path glow enabled" : "Critical path glow disabled");
  };

  const handleBaselineToggle = () => {
    const next = !showBaselineStripes;
    setPref("ganttShowBaselineStripes", next);
    toast.success(next ? "Striped baseline overlay enabled" : "Dashed baseline overlay enabled");
  };

  const handleHolidaysToggle = () => {
    const next = !showHolidays;
    setPref("ganttShowHolidays", next);
    toast.success(next ? "Public holidays highlighted on timeline" : "Public holidays hidden on timeline");
  };

  const handleWeekendsToggle = () => {
    const next = !showWeekends;
    setPref("ganttShowWeekends", next);
    toast.success(next ? "Weekend shading enabled on timeline" : "Weekend shading disabled on timeline");
  };

  return (
    <div className="flex h-full flex-col bg-background font-sans select-none overflow-y-auto matrix-scrollbar p-6">
      <div className="max-w-4xl mx-auto w-full space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border pb-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-secondary text-primary border border-border">
              <Palette className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-base font-bold text-foreground tracking-tight">Schedule Appearance & Styles</h1>
              <p className="text-xs text-muted-foreground">Customize Gantt bar styling, color palettes, typography density, and visual hierarchy</p>
            </div>
          </div>
          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-muted text-muted-foreground border border-border">
            OmniPlan 4 Styling Engine
          </span>
        </div>

        {/* Theme Presets */}
        <div className="space-y-3">
          <div className="flex items-center gap-1.5 text-xs font-bold text-foreground uppercase tracking-wider">
            <Sparkles className="h-3.5 w-3.5 text-amber-500" /> Color Themes
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {THEME_PRESETS.map((preset) => (
              <button
                key={preset.id}
                type="button"
                onClick={() => handleSelectTheme(preset.id, preset.name)}
                className={cn(
                  "flex flex-col gap-2 p-3 rounded-lg border text-left transition-all relative overflow-hidden",
                  selectedTheme === preset.id
                    ? "border-primary bg-primary/5 ring-1 ring-primary shadow-xs"
                    : "border-border bg-card hover:border-border/80 hover:bg-muted/30"
                )}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-foreground">{preset.name}</span>
                  {selectedTheme === preset.id && (
                    <span className="flex h-4 w-4 items-center justify-center rounded-full bg-primary text-primary-foreground">
                      <Check className="h-2.5 w-2.5" />
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1.5 pt-1">
                  <div className="h-3.5 flex-1 rounded-[2px]" style={{ backgroundColor: preset.primary }} title="Standard Bar" />
                  <div className="h-3.5 flex-1 rounded-[2px]" style={{ backgroundColor: preset.critical }} title="Critical Path" />
                  <div className="h-3.5 flex-1 rounded-[2px]" style={{ backgroundColor: preset.complete }} title="Completed" />
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Gantt Bar Styles & Shape */}
        <div className="rounded-lg border border-border bg-card p-4 space-y-4">
          <div className="flex items-center gap-1.5 text-xs font-bold text-foreground uppercase tracking-wider">
            <Sliders className="h-3.5 w-3.5 text-primary" /> Bar Geometry & Indicators
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
            <div className="space-y-1.5">
              <label className="text-[11px] font-medium text-muted-foreground">Bar Corner Style</label>
              <div className="grid grid-cols-3 gap-1 border border-border rounded p-0.5 bg-muted/20">
                {(["rounded", "sharp", "pill"] as const).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => handleBarRadius(mode)}
                    className={cn(
                      "py-1 text-center text-[10px] font-semibold capitalize rounded transition-colors",
                      barRadius === mode ? "bg-card text-foreground shadow-2xs font-bold" : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {mode}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-[11px] font-medium text-muted-foreground">Critical Path Bar Accent</label>
              <div
                onClick={handleCritToggle}
                className="flex items-center justify-between p-2 rounded border border-border bg-muted/20 cursor-pointer hover:bg-muted/40 transition-colors"
              >
                <span className="text-[11px] font-medium">Glow Critical Activities</span>
                <span className={cn("text-[10px] font-bold px-1.5 py-0.5 rounded", showCriticalHighlight ? "bg-destructive/15 text-destructive" : "text-muted-foreground")}>
                  {showCriticalHighlight ? "ON" : "OFF"}
                </span>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-[11px] font-medium text-muted-foreground">Baseline Comparison</label>
              <div
                onClick={handleBaselineToggle}
                className="flex items-center justify-between p-2 rounded border border-border bg-muted/20 cursor-pointer hover:bg-muted/40 transition-colors"
              >
                <span className="text-[11px] font-medium">Striped Baseline Shadow</span>
                <span className={cn("text-[10px] font-bold px-1.5 py-0.5 rounded", showBaselineStripes ? "bg-primary/15 text-primary" : "text-muted-foreground")}>
                  {showBaselineStripes ? "ON" : "OFF"}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Layout & Typography Density */}
        <div className="rounded-lg border border-border bg-card p-4 space-y-4">
          <div className="flex items-center gap-1.5 text-xs font-bold text-foreground uppercase tracking-wider">
            <Layout className="h-3.5 w-3.5 text-emerald-600" /> Grid Density & Typography
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-medium">Row Height & Spacing</span>
                <button
                  type="button"
                  onClick={handleDensityToggle}
                  className={cn("text-[10px] font-bold px-2 py-0.5 rounded border border-border", compactDensity ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground")}
                >
                  {compactDensity ? "Compact (24px)" : "Comfortable (32px)"}
                </button>
              </div>
              <p className="text-[10px] text-muted-foreground">Compact mode allows viewing up to 35 activities simultaneously without scrolling.</p>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-medium">Font Family</span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-muted text-foreground">
                  JetBrains Mono / Inter Sans
                </span>
              </div>
              <p className="text-[10px] text-muted-foreground">Tabular numbers and monospace alignment enabled for date, float, and cost columns.</p>
            </div>
          </div>
        </div>

        {/* Calendar & Non-Working Days */}
        <div className="rounded-lg border border-border bg-card p-4 space-y-4">
          <div className="flex items-center gap-1.5 text-xs font-bold text-foreground uppercase tracking-wider">
            <Calendar className="h-3.5 w-3.5 text-primary" /> Non-Working Days & Calendar Demarcation
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            <div className="space-y-1.5">
              <div
                onClick={handleHolidaysToggle}
                className="flex items-center justify-between p-2.5 rounded border border-border bg-muted/20 cursor-pointer hover:bg-muted/40 transition-colors"
              >
                <div className="pr-3">
                  <div className="text-[11px] font-semibold text-foreground">Show Public Holidays</div>
                  <div className="text-[10px] text-muted-foreground mt-0.5">Highlight Nepal gazetted holidays with rose column shading and red day indicators</div>
                </div>
                <span className={cn("text-[10px] font-bold px-2 py-0.5 rounded shrink-0", showHolidays ? "bg-rose-500/15 text-rose-600 border border-rose-500/30" : "bg-muted text-muted-foreground")}>
                  {showHolidays ? "VISIBLE" : "HIDDEN"}
                </span>
              </div>
            </div>

            <div className="space-y-1.5">
              <div
                onClick={handleWeekendsToggle}
                className="flex items-center justify-between p-2.5 rounded border border-border bg-muted/20 cursor-pointer hover:bg-muted/40 transition-colors"
              >
                <div className="pr-3">
                  <div className="text-[11px] font-semibold text-foreground">Show Weekend Rest Days</div>
                  <div className="text-[10px] text-muted-foreground mt-0.5">Shade non-working Saturdays across the schedule timeline grid</div>
                </div>
                <span className={cn("text-[10px] font-bold px-2 py-0.5 rounded shrink-0", showWeekends ? "bg-primary/15 text-primary border border-primary/30" : "bg-muted text-muted-foreground")}>
                  {showWeekends ? "VISIBLE" : "HIDDEN"}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Live Preview Box */}
        {(() => {
          const activePreset = THEME_PRESETS.find((p) => p.id === selectedTheme) ?? THEME_PRESETS[0];
          const radiusClass = barRadius === "sharp" ? "rounded-none" : barRadius === "pill" ? "rounded-full" : "rounded-[4px]";

          return (
            <div className="rounded-lg border border-border bg-card p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-xs font-bold text-foreground uppercase tracking-wider">
                  <Eye className="h-3.5 w-3.5 text-info" /> Appearance Preview ({activePreset.name})
                </div>
                <span className="text-[10px] text-muted-foreground font-mono">
                  {barRadius.toUpperCase()} · {compactDensity ? "COMPACT" : "COMFORTABLE"}
                </span>
              </div>
              <div className="rounded border border-border/80 bg-background p-4 space-y-3">
                {/* Standard Bar */}
                <div className="flex items-center gap-3 text-xs">
                  <span className="w-32 truncate text-muted-foreground font-medium">Standard Task:</span>
                  <div
                    style={{ borderColor: activePreset.primary, height: compactDensity ? "18px" : "24px" }}
                    className={cn("flex-1 border relative overflow-hidden flex items-center px-2 shadow-xs transition-all", radiusClass)}
                  >
                    <div
                      style={{ backgroundColor: activePreset.primary }}
                      className="absolute inset-y-0 left-0 w-[65%] opacity-90 transition-all"
                    />
                    <span className="relative z-10 text-[9px] font-mono font-bold text-white drop-shadow-xs">
                      65% · 14d
                    </span>
                  </div>
                </div>

                {/* Critical Path Bar */}
                <div className="flex items-center gap-3 text-xs">
                  <span className="w-32 truncate text-muted-foreground font-medium">Critical Path:</span>
                  <div
                    style={{
                      borderColor: activePreset.critical,
                      height: compactDensity ? "18px" : "24px",
                      boxShadow: showCriticalHighlight ? `0 0 10px ${activePreset.critical}80` : undefined,
                    }}
                    className={cn("flex-1 border relative overflow-hidden flex items-center px-2 shadow-xs transition-all", radiusClass)}
                  >
                    <div
                      style={{ backgroundColor: activePreset.critical }}
                      className="absolute inset-y-0 left-0 w-[40%] opacity-90 transition-all"
                    />
                    <span className="relative z-10 text-[9px] font-mono font-bold text-white drop-shadow-xs">
                      40% · Zero Float
                    </span>
                  </div>
                </div>

                {/* Baseline Overlay */}
                <div className="flex items-center gap-3 text-xs">
                  <span className="w-32 truncate text-muted-foreground font-medium">Baseline Overlay:</span>
                  <div
                    style={{ height: compactDensity ? "14px" : "18px" }}
                    className={cn(
                      "flex-1 border border-muted-foreground/50 relative overflow-hidden transition-all",
                      radiusClass,
                      showBaselineStripes
                        ? "bg-[repeating-linear-gradient(45deg,transparent,transparent_4px,rgba(100,116,139,0.3)_4px,rgba(100,116,139,0.3)_8px)]"
                        : "border-dashed bg-muted-foreground/20"
                    )}
                  />
                </div>

                {/* Milestone Diamond */}
                <div className="flex items-center gap-3 text-xs">
                  <span className="w-32 truncate text-muted-foreground font-medium">Milestone:</span>
                  <div className="flex items-center gap-2">
                    <div
                      style={{ backgroundColor: "#f59e0b", borderColor: "#d97706" }}
                      className="h-3.5 w-3.5 rotate-45 border shadow-[0_0_6px_rgba(245,158,11,0.5)]"
                    />
                    <span className="text-[10px] text-muted-foreground font-medium">Project Handover (Day 180)</span>
                  </div>
                </div>
              </div>
            </div>
          );
        })()}
      </div>
    </div>
  );
}
