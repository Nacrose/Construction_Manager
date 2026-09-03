"use client";

import { useUserPreferences } from "@/components/user-preferences-provider";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Settings,
  Calendar,
  Sliders,
  PanelBottom,
  PanelTop,
  PanelLeft,
  PanelRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { DockPosition } from "@/components/app-dock";

export default function SettingsPage() {
  const { getPref, setPref } = useUserPreferences();

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
          Customize your navigation dock layout and Nepali Bikram Sambat calendar.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* 1. Dock & Navigation Layout */}
        <Card className="bg-card border-border shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Sliders className="h-4 w-4 text-success/80" /> Navigation Dock Layout
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
                        ? "border-primary bg-primary/10 text-primary font-bold shadow-[0_0_12px_rgba(245,158,11,0.15)]"
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
                    ? "bg-primary text-primary-foreground shadow-[0_0_10px_rgba(245,158,11,0.3)]"
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
              <Calendar className="h-4 w-4 text-info/80" /> Calendar &amp; Date System
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
                    ? "border-info/60 bg-info/10 text-white font-medium shadow-[0_0_12px_rgba(59,130,246,0.15)]"
                    : "border-border/60 bg-muted/30 text-muted-foreground hover:bg-muted/60"
                )}
              >
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-xs text-foreground">{cal.label}</span>
                  {calendarType === cal.id && (
                    <Badge variant="outline" className="bg-info/20 text-info/80 border-info/40 text-[10px]">
                      Active
                    </Badge>
                  )}
                </div>
                <p className="text-[11px] text-muted-foreground mt-1">{cal.desc}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
