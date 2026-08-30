"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  SplitSquareVertical,
  Columns2,
  Sparkles,
  AlertCircle,
} from "lucide-react";

export type DiffMode = "overlay" | "swipe" | "side_by_side";

interface DrawingDiffOverlayProps {
  baseFileData?: string | null;
  baseFileType?: string | null;
  baseRevisionTag?: string;
  _baseIssuedDate?: string | Date | null;
  compareFileData?: string | null;
  compareFileType?: string | null;
  compareRevisionTag?: string;
  _compareIssuedDate?: string | Date | null;
  zoom: number;
  diffMode?: DiffMode;
  onDiffModeChange?: (mode: DiffMode) => void;
}

export function DrawingDiffOverlay({
  baseFileData,
  baseFileType,
  baseRevisionTag = "A",
  compareFileData,
  compareFileType,
  compareRevisionTag = "B",
  zoom,
  diffMode: initialMode = "overlay",
  onDiffModeChange,
}: DrawingDiffOverlayProps) {
  const [mode, setMode] = useState<DiffMode>(initialMode);
  const [sliderPos, setSliderPos] = useState<number>(50); // percentage 0-100
  const [isDragging, setIsDragging] = useState(false);
  const overlayOpacity = 0.85;

  const containerRef = useRef<HTMLDivElement>(null);

  const handleModeChange = (newMode: DiffMode) => {
    setMode(newMode);
    onDiffModeChange?.(newMode);
  };

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!isDragging || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const clientX = e.clientX;
      const newPos = Math.max(0, Math.min(100, ((clientX - rect.left) / rect.width) * 100));
      setSliderPos(newPos);
    },
    [isDragging]
  );

  const handlePointerUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  useEffect(() => {
    if (!isDragging) return;
    const onUp = () => setIsDragging(false);
    window.addEventListener("pointerup", onUp);
    return () => window.removeEventListener("pointerup", onUp);
  }, [isDragging]);

  const baseSrc = baseFileData
    ? `data:${baseFileType || "image/png"};base64,${baseFileData}`
    : null;
  const compareSrc = compareFileData
    ? `data:${compareFileType || "image/png"};base64,${compareFileData}`
    : null;

  if (!baseSrc || !compareSrc) {
    return (
      <div className="flex flex-col items-center justify-center p-8 text-center text-xs text-gray-400 bg-black/40 rounded-xl border border-white/10 font-mono">
        <AlertCircle className="h-8 w-8 text-amber-400 mb-2" />
        <p className="font-semibold text-white">Cannot compare revisions</p>
        <p className="text-gray-400 mt-1">
          Both the Base Revision (Rev {baseRevisionTag}) and Comparison Revision (Rev {compareRevisionTag}) must have previewable drawing files.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col w-full h-full select-none">
      {/* Top Diff Controls Toolbar */}
      <div className="shrink-0 flex items-center justify-between gap-3 px-3 py-2 bg-[#0c1015]/95 border-b border-white/10 backdrop-blur-md z-20">
        <div className="flex items-center gap-1 bg-[#161d26] p-1 rounded-xl border border-white/10">
          <Button
            size="sm"
            variant={mode === "overlay" ? "default" : "ghost"}
            className={cn(
              "h-7 text-xs gap-1.5 font-mono",
              mode === "overlay" ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40" : "text-gray-400"
            )}
            onClick={() => handleModeChange("overlay")}
            title="Chromatic Red/Green Bluebeam Overlay Diff"
          >
            <Sparkles className="h-3.5 w-3.5 text-emerald-400" />
            Red / Green Diff
          </Button>

          <Button
            size="sm"
            variant={mode === "swipe" ? "default" : "ghost"}
            className={cn(
              "h-7 text-xs gap-1.5 font-mono",
              mode === "swipe" ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/40" : "text-gray-400"
            )}
            onClick={() => handleModeChange("swipe")}
            title="Interactive Wipe Curtain Split Slider"
          >
            <SplitSquareVertical className="h-3.5 w-3.5 text-cyan-400" />
            Wipe Curtain
          </Button>

          <Button
            size="sm"
            variant={mode === "side_by_side" ? "default" : "ghost"}
            className={cn(
              "h-7 text-xs gap-1.5 font-mono",
              mode === "side_by_side" ? "bg-blue-500/20 text-blue-300 border border-blue-500/40" : "text-gray-400"
            )}
            onClick={() => handleModeChange("side_by_side")}
            title="Dual Synchronized Side-by-Side View"
          >
            <Columns2 className="h-3.5 w-3.5 text-blue-400" />
            Side-by-Side
          </Button>
        </div>

        {/* Legend / Info Badges */}
        <div className="flex items-center gap-3 text-xs font-mono">
          {mode === "overlay" ? (
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-red-500 inline-block shadow-[0_0_8px_#ef4444]" />
                <span className="text-red-400 font-bold">Rev {baseRevisionTag} (Removed / Baseline)</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-cyan-400 inline-block shadow-[0_0_8px_#22d3ee]" />
                <span className="text-cyan-300 font-bold">Rev {compareRevisionTag} (Added / New)</span>
              </div>
              <div className="flex items-center gap-1.5 text-gray-400">
                <span className="h-2.5 w-2.5 rounded-full bg-gray-600 inline-block" />
                <span>Unchanged (Matched)</span>
              </div>
            </div>
          ) : mode === "swipe" ? (
            <div className="flex items-center gap-2 text-gray-300">
              <span className="text-red-400 font-bold">◄ Left: Rev {baseRevisionTag}</span>
              <span className="text-gray-500">|</span>
              <span className="text-cyan-400 font-bold">Right: Rev {compareRevisionTag} ►</span>
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <span className="text-red-400 font-bold">Left Panel: Rev {baseRevisionTag}</span>
              <span className="text-cyan-400 font-bold">Right Panel: Rev {compareRevisionTag}</span>
            </div>
          )}
        </div>
      </div>

      {/* Main Diff Display Area */}
      <div className="flex-1 overflow-auto bg-[#080b0f] flex items-center justify-center p-4 relative">
        {mode === "overlay" && (
          <div
            style={{ transform: `scale(${zoom})`, transition: "transform 0.15s ease-out" }}
            className="relative inline-block max-w-full max-h-full shadow-2xl rounded border border-white/20 bg-white"
          >
            {/* Base Revision (Rev A - Red filter) */}
            <img
              src={baseSrc}
              alt={`Rev ${baseRevisionTag}`}
              className="max-w-full max-h-full object-contain pointer-events-none filter"
              style={{
                filter: "grayscale(100%) brightness(0.9) drop-shadow(0 0 0 red) invert(0)",
                mixBlendMode: "normal",
              }}
            />
            {/* Tint Overlay for Base: Red */}
            <div
              className="absolute inset-0 pointer-events-none bg-red-600"
              style={{ mixBlendMode: "screen", opacity: 0.85 }}
            />

            {/* Compare Revision (Rev B - Cyan/Green filter with Multiply Blend) */}
            <div
              className="absolute inset-0 pointer-events-none"
              style={{ mixBlendMode: "multiply", opacity: overlayOpacity }}
            >
              <img
                src={compareSrc}
                alt={`Rev ${compareRevisionTag}`}
                className="w-full h-full object-contain pointer-events-none"
                style={{
                  filter: "grayscale(100%) brightness(0.9)",
                }}
              />
              <div
                className="absolute inset-0 bg-cyan-400"
                style={{ mixBlendMode: "screen", opacity: 0.85 }}
              />
            </div>
          </div>
        )}

        {mode === "swipe" && (
          <div
            ref={containerRef}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            style={{ transform: `scale(${zoom})`, transition: "transform 0.15s ease-out" }}
            className="relative inline-block max-w-full max-h-full shadow-2xl rounded border border-white/20 overflow-hidden cursor-ew-resize select-none bg-white"
          >
            {/* Compare Revision (Rev B - Right Layer / Full Background) */}
            <img
              src={compareSrc}
              alt={`Rev ${compareRevisionTag}`}
              className="max-w-full max-h-full object-contain pointer-events-none"
            />
            <div className="absolute top-2 right-2 px-2 py-1 rounded bg-cyan-500/80 backdrop-blur-md text-black font-mono font-bold text-[10px] shadow">
              Rev {compareRevisionTag} (New)
            </div>

            {/* Base Revision (Rev A - Left Layer clipped by sliderPos) */}
            <div
              className="absolute inset-0 overflow-hidden pointer-events-none"
              style={{ clipPath: `polygon(0 0, ${sliderPos}% 0, ${sliderPos}% 100%, 0 100%)` }}
            >
              <img
                src={baseSrc}
                alt={`Rev ${baseRevisionTag}`}
                className="w-full h-full object-contain"
              />
              <div className="absolute top-2 left-2 px-2 py-1 rounded bg-red-500/80 backdrop-blur-md text-white font-mono font-bold text-[10px] shadow">
                Rev {baseRevisionTag} (Baseline)
              </div>
            </div>

            {/* Draggable Divider Line & Grip Handle */}
            <div
              onPointerDown={handlePointerDown}
              className="absolute top-0 bottom-0 w-1 bg-cyan-400 cursor-ew-resize flex items-center justify-center shadow-[0_0_12px_#22d3ee] z-30"
              style={{ left: `${sliderPos}%` }}
            >
              <div className="h-9 w-6 rounded-full bg-cyan-400 border-2 border-black flex items-center justify-center shadow-lg cursor-ew-resize">
                <span className="text-[10px] font-bold text-black select-none">⟷</span>
              </div>
            </div>
          </div>
        )}

        {mode === "side_by_side" && (
          <div
            style={{ transform: `scale(${zoom})`, transition: "transform 0.15s ease-out" }}
            className="grid grid-cols-2 gap-4 max-w-full max-h-full items-center"
          >
            {/* Panel 1: Base Revision */}
            <div className="relative rounded-xl border border-red-500/30 bg-white p-1 shadow-xl overflow-hidden">
              <div className="absolute top-2 left-2 z-10 px-2 py-0.5 rounded bg-red-500/90 text-white font-mono font-bold text-[10px] shadow">
                Rev {baseRevisionTag} (Baseline)
              </div>
              <img
                src={baseSrc}
                alt={`Rev ${baseRevisionTag}`}
                className="max-w-full max-h-[75vh] object-contain"
              />
            </div>

            {/* Panel 2: Compare Revision */}
            <div className="relative rounded-xl border border-cyan-500/30 bg-white p-1 shadow-xl overflow-hidden">
              <div className="absolute top-2 right-2 z-10 px-2 py-0.5 rounded bg-cyan-400/90 text-black font-mono font-bold text-[10px] shadow">
                Rev {compareRevisionTag} (New)
              </div>
              <img
                src={compareSrc}
                alt={`Rev ${compareRevisionTag}`}
                className="max-w-full max-h-[75vh] object-contain"
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
