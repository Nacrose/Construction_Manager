import { create } from "zustand";
import { persist } from "zustand/middleware";

export type ThemePalette = "cyber_mint" | "tactical_amber" | "ice_cyan" | "daylight_blueprint";

export const THEME_PALETTES: Record<ThemePalette, {
  name: string;
  primary: string;
  primaryGlow: string;
  border: string;
  borderAccent: string;
  accentForeground: string;
  ring: string;
  dotColor: string;
  previewBg: string;
}> = {
  cyber_mint: {
    name: "Cyber Mint",
    primary: "#34d399",
    primaryGlow: "rgba(52, 211, 153, 0.35)",
    border: "rgba(52, 211, 153, 0.28)",
    borderAccent: "rgba(52, 211, 153, 0.65)",
    accentForeground: "#34d399",
    ring: "#34d399",
    dotColor: "#34d399",
    previewBg: "bg-emerald-500",
  },
  tactical_amber: {
    name: "Tactical Amber",
    primary: "#f59e0b",
    primaryGlow: "rgba(245, 158, 11, 0.35)",
    border: "rgba(245, 158, 11, 0.28)",
    borderAccent: "rgba(245, 158, 11, 0.65)",
    accentForeground: "#f59e0b",
    ring: "#f59e0b",
    dotColor: "#f59e0b",
    previewBg: "bg-amber-500",
  },
  ice_cyan: {
    name: "Ice Cyan",
    primary: "#06b6d4",
    primaryGlow: "rgba(6, 182, 212, 0.35)",
    border: "rgba(6, 182, 212, 0.28)",
    borderAccent: "rgba(6, 182, 212, 0.65)",
    accentForeground: "#06b6d4",
    ring: "#06b6d4",
    dotColor: "#06b6d4",
    previewBg: "bg-cyan-500",
  },
  daylight_blueprint: {
    name: "Daylight Blueprint",
    primary: "#0ea5e9",
    primaryGlow: "rgba(14, 165, 233, 0.25)",
    border: "rgba(14, 165, 233, 0.30)",
    borderAccent: "rgba(14, 165, 233, 0.65)",
    accentForeground: "#0ea5e9",
    ring: "#0ea5e9",
    dotColor: "#0ea5e9",
    previewBg: "bg-sky-500",
  },
};

export function applyThemePalette(palette: ThemePalette) {
  if (typeof document === "undefined") return;
  const p = THEME_PALETTES[palette] || THEME_PALETTES.cyber_mint;
  const root = document.documentElement;
  root.style.setProperty("--primary", p.primary);
  root.style.setProperty("--primary-glow", p.primaryGlow);
  root.style.setProperty("--border", p.border);
  root.style.setProperty("--border-accent", p.borderAccent);
  root.style.setProperty("--accent-foreground", p.accentForeground);
  root.style.setProperty("--ring", p.ring);
  root.style.setProperty("--sidebar-primary", p.primary);
  root.style.setProperty("--sidebar-ring", p.ring);
  root.style.setProperty("--sidebar-border", p.border);
  root.style.setProperty("--chart-1", p.primary);
}

export interface FXState {
  // Theme & Density
  themePalette: ThemePalette;
  tableDensity: "comfortable" | "compact";

  // Visual Toggles
  matrixRainEnabled: boolean;
  stormWindEnabled: boolean;
  waterDropletsEnabled: boolean;
  lightningEnabled: boolean;
  mouseTrailEnabled: boolean;

  // Visual Sliders
  panelOpacity: number; // 0.30 to 1.0 (default 0.65)
  dropletCount: number; // 20 to 160 (default 75)
  matrixSpeed: number; // 1 to 5 (default 3)
  
  // Audio Controls
  soundEnabled: boolean;
  soundVolume: number; // 0.0 to 1.0 (default 0.35)
  keyClicksEnabled: boolean;
  thunderSoundEnabled: boolean;
  ambientRainAudioEnabled: boolean;

  // Actions - Theme & Density
  setThemePalette: (palette: ThemePalette) => void;
  setTableDensity: (density: "comfortable" | "compact") => void;

  // Actions - Visual
  setMatrixRain: (enabled: boolean) => void;
  setStormWind: (enabled: boolean) => void;
  setWaterDroplets: (enabled: boolean) => void;
  setLightning: (enabled: boolean) => void;
  setMouseTrail: (enabled: boolean) => void;
  setPanelOpacity: (opacity: number) => void;
  setDropletCount: (count: number) => void;
  setMatrixSpeed: (speed: number) => void;

  // Actions - Audio
  setSoundEnabled: (enabled: boolean) => void;
  setSoundVolume: (volume: number) => void;
  setKeyClicks: (enabled: boolean) => void;
  setThunderSound: (enabled: boolean) => void;
  setAmbientRainAudio: (enabled: boolean) => void;

  // Presets
  applyPreset: (preset: "heavy_storm" | "rainy_glass" | "matrix_code" | "clean_office") => void;
  disableAllFx: () => void;
}

export const useFXStore = create<FXState>()(
  persist(
    (set) => ({
      // Defaults
      themePalette: "cyber_mint",
      tableDensity: "comfortable",

      matrixRainEnabled: true,
      stormWindEnabled: true,
      waterDropletsEnabled: true,
      lightningEnabled: true,
      mouseTrailEnabled: true,

      panelOpacity: 0.65,
      dropletCount: 75,
      matrixSpeed: 3,

      soundEnabled: false,
      soundVolume: 0.35,
      keyClicksEnabled: true,
      thunderSoundEnabled: true,
      ambientRainAudioEnabled: false,

      // Theme Setters
      setThemePalette: (palette) => {
        applyThemePalette(palette);
        set({ themePalette: palette });
      },
      setTableDensity: (density) => set({ tableDensity: density }),

      // Visual Setters
      setMatrixRain: (enabled) => set({ matrixRainEnabled: enabled }),
      setStormWind: (enabled) => set({ stormWindEnabled: enabled }),
      setWaterDroplets: (enabled) => set({ waterDropletsEnabled: enabled }),
      setLightning: (enabled) => set({ lightningEnabled: enabled }),
      setMouseTrail: (enabled) => set({ mouseTrailEnabled: enabled }),
      setPanelOpacity: (opacity) => {
        const clamped = Math.max(0.25, Math.min(1.0, opacity));
        if (typeof document !== "undefined") {
          document.documentElement.style.setProperty("--panel-alpha", String(clamped));
        }
        set({ panelOpacity: clamped });
      },
      setDropletCount: (count) => set({ dropletCount: Math.max(20, Math.min(160, count)) }),
      setMatrixSpeed: (speed) => set({ matrixSpeed: Math.max(1, Math.min(5, speed)) }),

      // Audio Setters
      setSoundEnabled: (enabled) => set({ soundEnabled: enabled }),
      setSoundVolume: (volume) => set({ soundVolume: Math.max(0, Math.min(1, volume)) }),
      setKeyClicks: (enabled) => set({ keyClicksEnabled: enabled }),
      setThunderSound: (enabled) => set({ thunderSoundEnabled: enabled }),
      setAmbientRainAudio: (enabled) => set({ ambientRainAudioEnabled: enabled }),

      // Preset Applicator
      applyPreset: (preset) => {
        if (preset === "heavy_storm") {
          if (typeof document !== "undefined") {
            document.documentElement.style.setProperty("--panel-alpha", "0.55");
          }
          set({
            matrixRainEnabled: true,
            stormWindEnabled: true,
            waterDropletsEnabled: true,
            lightningEnabled: true,
            mouseTrailEnabled: true,
            panelOpacity: 0.55,
            dropletCount: 110,
            soundEnabled: true,
            thunderSoundEnabled: true,
            keyClicksEnabled: true,
            ambientRainAudioEnabled: true,
          });
        } else if (preset === "rainy_glass") {
          if (typeof document !== "undefined") {
            document.documentElement.style.setProperty("--panel-alpha", "0.50");
          }
          set({
            matrixRainEnabled: false,
            stormWindEnabled: true,
            waterDropletsEnabled: true,
            lightningEnabled: false,
            mouseTrailEnabled: true,
            panelOpacity: 0.50,
            dropletCount: 90,
            ambientRainAudioEnabled: true,
          });
        } else if (preset === "matrix_code") {
          if (typeof document !== "undefined") {
            document.documentElement.style.setProperty("--panel-alpha", "0.65");
          }
          set({
            matrixRainEnabled: true,
            stormWindEnabled: false,
            waterDropletsEnabled: false,
            lightningEnabled: false,
            mouseTrailEnabled: true,
            panelOpacity: 0.65,
            keyClicksEnabled: true,
            ambientRainAudioEnabled: false,
          });
        } else if (preset === "clean_office") {
          if (typeof document !== "undefined") {
            document.documentElement.style.setProperty("--panel-alpha", "1.0");
          }
          set({
            matrixRainEnabled: false,
            stormWindEnabled: false,
            waterDropletsEnabled: false,
            lightningEnabled: false,
            mouseTrailEnabled: false,
            panelOpacity: 1.0,
            soundEnabled: false,
            ambientRainAudioEnabled: false,
          });
        }
      },

      disableAllFx: () => {
        if (typeof document !== "undefined") {
          document.documentElement.style.setProperty("--panel-alpha", "1.0");
        }
        set({
          matrixRainEnabled: false,
          stormWindEnabled: false,
          waterDropletsEnabled: false,
          lightningEnabled: false,
          mouseTrailEnabled: false,
          panelOpacity: 1.0,
          soundEnabled: false,
          ambientRainAudioEnabled: false,
        });
      },
    }),
    {
      name: "cm_fx_preferences",
      onRehydrateStorage: () => (state) => {
        if (state && typeof document !== "undefined") {
          document.documentElement.style.setProperty("--panel-alpha", String(state.panelOpacity));
          if (state.themePalette) {
            applyThemePalette(state.themePalette);
          }
        }
      },
    }
  )
);
