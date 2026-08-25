"use client";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Sparkles, Terminal, CloudRain, Droplets, Zap, Eye, Volume2, VolumeX,
  Keyboard, CloudLightning, Wind, RotateCcw,
} from "lucide-react";
import { useFXStore, THEME_PALETTES, type ThemePalette } from "@/lib/fx-store";
import { cn } from "@/lib/utils";

export function AtmosphericControllerDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const fx = useFXStore();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl p-0 border border-primary/50 bg-card/95 backdrop-blur-3xl shadow-[0_0_50px_var(--primary-glow)] rounded-lg overflow-hidden font-mono">
        {/* Header */}
        <DialogHeader className="p-4 border-b border-border bg-muted/60 flex flex-row items-center justify-between">
          <div>
            <DialogTitle className="flex items-center gap-2 text-sm uppercase text-primary font-bold">
              <Sparkles className="h-4 w-4" /> Matrix OS — System & Visual Control
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground mt-0.5">
              Engineering color palettes, storm atmospheric shaders, and tactile audio telemetry.
            </DialogDescription>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={fx.disableAllFx}
            className="h-7 text-[11px] gap-1 text-muted-foreground hover:text-destructive"
            title="Turn off all animations & sound"
          >
            <RotateCcw className="h-3 w-3" /> Reset / Off
          </Button>
        </DialogHeader>

        <div className="p-4 space-y-5 max-h-[75vh] overflow-y-auto">
          {/* Engineering Theme Palettes */}
          <div className="space-y-1.5">
            <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">
              🎨 Engineering Theme Palettes
            </Label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {(Object.keys(THEME_PALETTES) as ThemePalette[]).map((palKey) => {
                const pal = THEME_PALETTES[palKey];
                const isActive = (fx.themePalette || "cyber_mint") === palKey;
                return (
                  <button
                    key={palKey}
                    onClick={() => fx.setThemePalette(palKey)}
                    className={cn(
                      "p-2.5 rounded border text-left transition-all text-xs font-bold flex flex-col gap-1.5",
                      isActive
                        ? "border-primary bg-primary/10 shadow-[0_0_12px_var(--primary-glow)] text-foreground"
                        : "border-border/80 bg-muted/30 hover:border-primary/40 text-muted-foreground"
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <span className="h-3.5 w-3.5 rounded-full border border-black/40 shadow-sm" style={{ backgroundColor: pal.primary }} />
                      {isActive && <span className="text-[9px] uppercase tracking-wider text-primary font-mono font-bold">ACTIVE</span>}
                    </div>
                    <div className={cn("text-xs", isActive && "text-primary")}>{pal.name}</div>
                  </button>
                );
              })}
            </div>
          </div>
          {/* Quick Scene Presets */}
          <div className="space-y-1.5">
            <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">
              ⚡ Quick Scene Presets
            </Label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <button
                onClick={() => fx.applyPreset("heavy_storm")}
                className="p-2.5 rounded border border-primary/40 bg-primary/10 hover:bg-primary/20 text-left transition-all text-xs font-bold text-primary"
              >
                <div className="text-sm mb-1">⛈️</div>
                <div>Heavy Storm</div>
                <div className="text-[9px] font-normal text-muted-foreground">All FX + Rain Audio</div>
              </button>

              <button
                onClick={() => fx.applyPreset("rainy_glass")}
                className="p-2.5 rounded border border-border/80 bg-muted/30 hover:border-primary/50 text-left transition-all text-xs font-bold"
              >
                <div className="text-sm mb-1">💧</div>
                <div>Rainy Glass</div>
                <div className="text-[9px] font-normal text-muted-foreground">Droplets + 50% Glass</div>
              </button>

              <button
                onClick={() => fx.applyPreset("matrix_code")}
                className="p-2.5 rounded border border-border/80 bg-muted/30 hover:border-primary/50 text-left transition-all text-xs font-bold"
              >
                <div className="text-sm mb-1">💻</div>
                <div>Matrix Code</div>
                <div className="text-[9px] font-normal text-muted-foreground">Glyphs + Key Clicks</div>
              </button>

              <button
                onClick={() => fx.applyPreset("clean_office")}
                className="p-2.5 rounded border border-border/80 bg-muted/30 hover:border-primary/50 text-left transition-all text-xs font-bold"
              >
                <div className="text-sm mb-1">🏢</div>
                <div>Clean Solid</div>
                <div className="text-[9px] font-normal text-muted-foreground">100% Solid Carbon</div>
              </button>
            </div>
          </div>

          {/* Section 1: Glass Transparency Slider */}
          <div className="p-3.5 rounded border border-border bg-muted/30 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <Eye className="h-4 w-4 text-primary" />
                <span className="font-bold uppercase text-foreground">Panel Glass Transparency</span>
              </div>
              <span className="text-primary font-bold text-sm">
                {Math.round(fx.panelOpacity * 100)}%
                <span className="text-[10px] text-muted-foreground font-normal ml-1">
                  {fx.panelOpacity <= 0.45 ? "(Ultra Glass)" : fx.panelOpacity >= 0.95 ? "(Solid Carbon)" : "(Balanced)"}
                </span>
              </span>
            </div>

            <input
              type="range"
              min="30"
              max="100"
              step="1"
              value={Math.round(fx.panelOpacity * 100)}
              onChange={(e) => fx.setPanelOpacity(Number(e.target.value) / 100)}
              className="w-full h-1.5 bg-muted-foreground/30 rounded-lg appearance-none cursor-pointer accent-primary"
            />
            <div className="flex justify-between text-[10px] text-muted-foreground">
              <span>30% (High Glass)</span>
              <span>65% (Default)</span>
              <span>100% (Solid Opaque)</span>
            </div>
          </div>

          {/* Section 2: Visual Atmospheric Shaders */}
          <div className="space-y-2">
            <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">
              🌌 Visual Atmospheric Layers
            </Label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Matrix Rain */}
              <div className="p-3 rounded border border-border/80 bg-muted/20 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Terminal className="h-4 w-4 text-primary" />
                    <div>
                      <div className="text-xs font-bold text-foreground">Matrix Digital Stream</div>
                      <div className="text-[10px] text-muted-foreground">Falling green telemetry</div>
                    </div>
                  </div>
                  <Switch checked={fx.matrixRainEnabled} onCheckedChange={fx.setMatrixRain} />
                </div>
                {fx.matrixRainEnabled && (
                  <div className="pt-1.5 border-t border-border/40 space-y-1">
                    <div className="flex justify-between text-[10px] text-muted-foreground">
                      <span>Fall Speed</span>
                      <span className="text-primary font-bold">{fx.matrixSpeed}x</span>
                    </div>
                    <input
                      type="range"
                      min="1"
                      max="5"
                      step="1"
                      value={fx.matrixSpeed}
                      onChange={(e) => fx.setMatrixSpeed(Number(e.target.value))}
                      className="w-full h-1 bg-muted-foreground/30 rounded appearance-none cursor-pointer accent-primary"
                    />
                  </div>
                )}
              </div>

              {/* Glass Water Droplets */}
              <div className="p-3 rounded border border-border/80 bg-muted/20 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Droplets className="h-4 w-4 text-emerald-400" />
                    <div>
                      <div className="text-xs font-bold text-foreground">Glass Water Droplets</div>
                      <div className="text-[10px] text-muted-foreground">Beads & gravity trickles</div>
                    </div>
                  </div>
                  <Switch checked={fx.waterDropletsEnabled} onCheckedChange={fx.setWaterDroplets} />
                </div>
                {fx.waterDropletsEnabled && (
                  <div className="pt-1.5 border-t border-border/40 space-y-1">
                    <div className="flex justify-between text-[10px] text-muted-foreground">
                      <span>Droplet Density</span>
                      <span className="text-primary font-bold">{fx.dropletCount} drops</span>
                    </div>
                    <input
                      type="range"
                      min="20"
                      max="160"
                      step="5"
                      value={fx.dropletCount}
                      onChange={(e) => fx.setDropletCount(Number(e.target.value))}
                      className="w-full h-1 bg-muted-foreground/30 rounded appearance-none cursor-pointer accent-primary"
                    />
                  </div>
                )}
              </div>

              {/* Storm Wind Streaks */}
              <div className="p-3 rounded border border-border/80 bg-muted/20 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Wind className="h-4 w-4 text-emerald-400" />
                  <div>
                    <div className="text-xs font-bold text-foreground">Storm Wind & Rain</div>
                    <div className="text-[10px] text-muted-foreground">Angled background streaks</div>
                  </div>
                </div>
                <Switch checked={fx.stormWindEnabled} onCheckedChange={fx.setStormWind} />
              </div>

              {/* Lightning Simulator */}
              <div className="p-3 rounded border border-border/80 bg-muted/20 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Zap className="h-4 w-4 text-emerald-300" />
                  <div>
                    <div className="text-xs font-bold text-foreground">Lightning Simulator</div>
                    <div className="text-[10px] text-muted-foreground">Branching bolts & flashes</div>
                  </div>
                </div>
                <Switch checked={fx.lightningEnabled} onCheckedChange={fx.setLightning} />
              </div>
            </div>
          </div>

          {/* Section 3: Cyber Audio Soundscapes */}
          <div className="p-3.5 rounded border border-border bg-muted/30 space-y-3">
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                {fx.soundEnabled ? <Volume2 className="h-4 w-4 text-primary" /> : <VolumeX className="h-4 w-4 text-muted-foreground" />}
                <span className="font-bold uppercase text-foreground">Cyber Audio Soundscapes</span>
              </div>
              <Switch checked={fx.soundEnabled} onCheckedChange={fx.setSoundEnabled} />
            </div>

            {fx.soundEnabled && (
              <div className="space-y-3 pt-2 border-t border-border/40">
                {/* Volume Slider */}
                <div className="space-y-1">
                  <div className="flex justify-between text-[11px]">
                    <span className="text-muted-foreground">Master Volume</span>
                    <span className="text-primary font-bold">{Math.round(fx.soundVolume * 100)}%</span>
                  </div>
                  <input
                    type="range"
                    min="5"
                    max="100"
                    step="5"
                    value={Math.round(fx.soundVolume * 100)}
                    onChange={(e) => fx.setSoundVolume(Number(e.target.value) / 100)}
                    className="w-full h-1.5 bg-muted-foreground/30 rounded-lg appearance-none cursor-pointer accent-primary"
                  />
                </div>

                {/* Sub Audio Toggles */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1 text-xs">
                  <div className="flex items-center justify-between p-2 rounded border border-border/60 bg-background/50">
                    <span className="text-[11px]">⌨️ Key Clicks</span>
                    <Switch checked={fx.keyClicksEnabled} onCheckedChange={fx.setKeyClicks} />
                  </div>
                  <div className="flex items-center justify-between p-2 rounded border border-border/60 bg-background/50">
                    <span className="text-[11px]">⚡ Thunder</span>
                    <Switch checked={fx.thunderSoundEnabled} onCheckedChange={fx.setThunderSound} />
                  </div>
                  <div className="flex items-center justify-between p-2 rounded border border-border/60 bg-background/50">
                    <span className="text-[11px]">🌧️ Rain Audio</span>
                    <Switch checked={fx.ambientRainAudioEnabled} onCheckedChange={fx.setAmbientRainAudio} />
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
