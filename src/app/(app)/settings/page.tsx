"use client";

import { useState } from "react";
import { useUserPreferences } from "@/components/user-preferences-provider";
import { useFXStore } from "@/lib/fx-store";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Settings,
  Calendar,
  Sparkles,
  Terminal,
  CloudRain,
  Wind,
  Zap,
  Sliders,
  PanelBottom,
  PanelTop,
  PanelLeft,
  PanelRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { DockPosition } from "@/components/app-dock";
import { AtmosphericControllerDialog } from "@/components/fx/atmospheric-controller-dialog";

export default function SettingsPage() {
  const { getPref, setPref } = useUserPreferences();
  const fx = useFXStore();
  const [fxDialogOpen, setFxDialogOpen] = useState(false);

  const dockPosition = getPref<DockPosition>("dockPosition", "bottom");
  const calendarType = getPref<string>("calendarType", "BS");
  const autoHide = getPref<boolean>("dockAutoHide", false);

  return (
    <div className="space-y-6 pb-12 max-w-5xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Settings className="h-6 w-6 text-primary" /> Application Settings &amp; Preferences
        </h1>
        <p className="text-sm text-muted-foreground">
          Customize your navigation dock layout, Nepali Bikram Sambat calendar, and atmospheric effects.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* 1. Dock & Navigation Layout */}
        <Card className="bg-card border-border shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Sliders className="h-4 w-4 text-emerald-400" /> Navigation Dock Layout
            </CardTitle>
            <CardDescription className="text-xs">
              Choose dock screen positioning and auto-hide behavior.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label className="text-xs font-semibold">Dock Screen Position</Label>
              <div className="grid grid-cols-2 gap-2.5">
                {[
                  { pos: "bottom", label: "Bottom Dock", icon: PanelBottom },
                  { pos: "top", label: "Top Bar", icon: PanelTop },
                  { pos: "left", label: "Left Sidebar", icon: PanelLeft },
                  { pos: "right", label: "Right Sidebar", icon: PanelRight },
                ].map(({ pos, label, icon: Icon }) => (
                  <button
                    key={pos}
                    type="button"
                    onClick={() => setPref("dockPosition", pos as DockPosition)}
                    className={cn(
                      "flex items-center gap-2.5 p-3 rounded-xl border text-xs font-medium transition-all text-left",
                      dockPosition === pos
                        ? "border-primary bg-primary/10 text-primary font-bold shadow-[0_0_12px_rgba(0,255,102,0.15)]"
                        : "border-border/60 bg-muted/30 text-muted-foreground hover:bg-muted/60"
                    )}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    <span>{label}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="pt-3 border-t border-border/50 flex items-center justify-between">
              <div>
                <Label className="text-xs font-semibold">Auto-hide Dock</Label>
                <p className="text-[11px] text-muted-foreground">Hide dock until hovering near the edge</p>
              </div>
              <button
                type="button"
                onClick={() => setPref("dockAutoHide", !autoHide)}
                className={cn(
                  "px-3 py-1.5 rounded-lg text-xs font-bold font-mono transition-all",
                  autoHide
                    ? "bg-primary text-primary-foreground shadow-[0_0_10px_rgba(0,255,102,0.3)]"
                    : "bg-muted text-muted-foreground hover:bg-muted/80"
                )}
              >
                {autoHide ? "ENABLED" : "DISABLED"}
              </button>
            </div>
          </CardContent>
        </Card>

        {/* 2. Calendar System */}
        <Card className="bg-card border-border shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Calendar className="h-4 w-4 text-blue-400" /> Calendar &amp; Date System
            </CardTitle>
            <CardDescription className="text-xs">
              Select date display format for invoices, Day Book, and site logs.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {[
              {
                id: "BS",
                label: "Nepali (Bikram Sambat)",
                desc: "Standard official dates across all project schedules & reports (वि.सं. २०८३)",
              },
              {
                id: "DUAL",
                label: "Dual Calendar (BS + AD)",
                desc: "Shows Nepali Bikram Sambat alongside Gregorian AD dates.",
              },
              {
                id: "AD",
                label: "Gregorian (AD)",
                desc: "International calendar standard (YYYY-MM-DD).",
              },
            ].map((cal) => (
              <div
                key={cal.id}
                onClick={() => setPref("calendarType", cal.id)}
                className={cn(
                  "p-3 rounded-xl border cursor-pointer transition-all",
                  calendarType === cal.id
                    ? "border-blue-500 bg-blue-500/10 text-white font-medium shadow-[0_0_12px_rgba(59,130,246,0.15)]"
                    : "border-border/60 bg-muted/30 text-muted-foreground hover:bg-muted/60"
                )}
              >
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-xs text-foreground">{cal.label}</span>
                  {calendarType === cal.id && (
                    <Badge variant="outline" className="bg-blue-500/20 text-blue-400 border-blue-500/30 text-[10px]">
                      Active
                    </Badge>
                  )}
                </div>
                <p className="text-[11px] text-muted-foreground mt-1">{cal.desc}</p>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* 3. Atmospheric Visual Effects (Matrix OS) */}
        <Card className="bg-card border-border shadow-sm md:col-span-2">
          <CardHeader className="pb-3 flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-amber-400" /> Atmospheric Matrix FX &amp; Glass Visuals
              </CardTitle>
              <CardDescription className="text-xs">
                Real-time particle shaders, glass raindrops, soundscapes, and lightning simulator.
              </CardDescription>
            </div>
            <Button
              onClick={() => setFxDialogOpen(true)}
              variant="outline"
              className="border-primary/40 text-primary text-xs font-bold gap-1.5"
            >
              <Sliders className="h-3.5 w-3.5" /> Open Sliders &amp; Audio Studio
            </Button>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                {
                  id: "matrixRain",
                  label: "Matrix Stream",
                  icon: Terminal,
                  active: fx.matrixRainEnabled,
                  toggle: () => fx.setMatrixRain(!fx.matrixRainEnabled),
                },
                {
                  id: "waterDroplets",
                  label: "Glass Droplets",
                  icon: CloudRain,
                  active: fx.waterDropletsEnabled,
                  toggle: () => fx.setWaterDroplets(!fx.waterDropletsEnabled),
                },
                {
                  id: "stormWind",
                  label: "Storm Wind",
                  icon: Wind,
                  active: fx.stormWindEnabled,
                  toggle: () => fx.setStormWind(!fx.stormWindEnabled),
                },
                {
                  id: "lightning",
                  label: "Lightning Storm",
                  icon: Zap,
                  active: fx.lightningEnabled,
                  toggle: () => fx.setLightning(!fx.lightningEnabled),
                },
              ].map(({ id, label, icon: Icon, active, toggle }) => (
                <button
                  key={id}
                  type="button"
                  onClick={toggle}
                  className={cn(
                    "flex flex-col items-center justify-center p-4 rounded-xl border text-xs font-medium transition-all gap-2",
                    active
                      ? "border-primary bg-primary/10 text-primary font-bold shadow-[0_0_14px_rgba(0,255,102,0.18)]"
                      : "border-border/60 bg-muted/30 text-muted-foreground hover:bg-muted/60"
                  )}
                >
                  <Icon className="h-5 w-5 shrink-0" />
                  <span>{label}</span>
                  <span className={cn("text-[9px] px-1.5 py-0.5 rounded font-mono font-bold", active ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground")}>
                    {active ? "ON" : "OFF"}
                  </span>
                </button>
              ))}
            </div>

            <div className="pt-3 border-t border-border/50 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <Label className="font-semibold">Glass Backdrop Transparency</Label>
                <span className="font-mono text-primary font-bold">{Math.round(fx.panelOpacity * 100)}%</span>
              </div>
              <input
                type="range"
                min="30"
                max="100"
                step="1"
                value={Math.round(fx.panelOpacity * 100)}
                onChange={(e) => fx.setPanelOpacity(Number(e.target.value) / 100)}
                className="w-full h-2 bg-muted rounded-lg appearance-none cursor-pointer accent-primary"
              />
            </div>
          </CardContent>
        </Card>
      </div>

      <AtmosphericControllerDialog open={fxDialogOpen} onOpenChange={setFxDialogOpen} />
    </div>
  );
}
