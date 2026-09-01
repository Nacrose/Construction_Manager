"use client";

import React, { useEffect, useState } from "react";
import { Building2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface AppLoadingScreenProps {
  title?: string;
  message?: string;
  submessage?: string;
  fullscreen?: boolean;
  className?: string;
}

const DEFAULT_STAGES = [
  "Initializing Contractor OS…",
  "Connecting Accounting & Ledger Vault…",
  "Synchronizing Project Telemetry…",
  "Readying Engineering Workspace…",
];

export function AppLoadingScreen({
  title = "CONTRACTOR",
  message,
  submessage,
  fullscreen = true,
  className,
}: AppLoadingScreenProps) {
  const [stageIndex, setStageIndex] = useState(0);

  useEffect(() => {
    if (message) return; // If custom message is provided, don't cycle
    const interval = setInterval(() => {
      setStageIndex((prev) => (prev + 1) % DEFAULT_STAGES.length);
    }, 1800);
    return () => clearInterval(interval);
  }, [message]);

  const activeMessage = message || DEFAULT_STAGES[stageIndex];

  return (
    <div
      className={cn(
        "flex items-center justify-center p-4 relative overflow-hidden select-none bg-[#eef5fc]",
        fullscreen ? "fixed inset-0 z-50 min-h-screen" : "w-full min-h-[360px]",
        className
      )}
    >
      {/* Background blueprint grid accent */}
      <div
        className="absolute inset-0 pointer-events-none opacity-40"
        style={{
          backgroundImage: `
            linear-gradient(to right, #cbdfe8 1px, transparent 1px),
            linear-gradient(to bottom, #cbdfe8 1px, transparent 1px)
          `,
          backgroundSize: "32px 32px",
          maskImage: "radial-gradient(ellipse 60% 50% at 50% 50%, black 30%, transparent 80%)",
          WebkitMaskImage: "radial-gradient(ellipse 60% 50% at 50% 50%, black 30%, transparent 80%)",
        }}
      />

      {/* Main Glass Card */}
      <div className="relative z-10 w-full max-w-sm bg-white/95 backdrop-blur-2xl border border-[#c7d8e8] shadow-[0_16px_40px_-12px_rgba(2,132,199,0.12)] rounded-3xl p-7 text-center transition-all animate-in fade-in zoom-in-95 duration-300">
        
        {/* Brand Icon with Breathing Accent Ring */}
        <div className="relative inline-flex items-center justify-center mb-4">
          <div className="absolute -inset-1.5 bg-gradient-to-r from-[#0284c7] to-amber-500 rounded-3xl opacity-25 blur-sm animate-pulse" />
          <div className="relative flex items-center justify-center h-14 w-14 rounded-2xl bg-gradient-to-br from-[#0284c7] to-[#0369a1] text-white shadow-md ring-4 ring-white">
            <Building2 className="h-7 w-7 text-white animate-pulse" />
          </div>
        </div>

        {/* Title & Subtitle */}
        <div className="space-y-1">
          <h2 className="text-base font-extrabold tracking-wider text-slate-900 uppercase font-sans">
            {title}
          </h2>
          <p className="text-[11px] font-semibold text-[#0284c7] tracking-wider uppercase font-mono">
            Enterprise Construction ERP
          </p>
        </div>

        {/* Progress Bar (Smooth Shimmer Strip) */}
        <div className="my-5 w-full h-1.5 bg-[#e2edf7] rounded-full overflow-hidden relative shadow-inner">
          <div
            className="absolute inset-y-0 h-full rounded-full bg-gradient-to-r from-[#0284c7] via-amber-500 to-[#0284c7]"
            style={{
              width: "60%",
              animation: "shimmerSlide 1.6s ease-in-out infinite",
            }}
          />
        </div>

        {/* Status Line */}
        <div className="space-y-1 min-h-[36px] flex flex-col items-center justify-center">
          <p className="text-xs font-medium text-slate-700 font-sans transition-all duration-300 animate-in fade-in">
            {activeMessage}
          </p>
          {submessage && (
            <p className="text-[11px] text-slate-400 font-mono">
              {submessage}
            </p>
          )}
        </div>

        {/* System Telemetry Pill */}
        <div className="mt-4 pt-4 border-t border-[#eef5fc] flex items-center justify-between text-[10px] font-mono text-slate-500">
          <span className="flex items-center gap-1.5">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500" />
            </span>
            <span className="font-semibold text-slate-600">SYSTEM ACTIVE</span>
          </span>
          <span className="bg-[#f0f6fc] border border-[#c7d8e8] px-2 py-0.5 rounded-md text-slate-600 font-bold">
            v2.0 LIGHT AERO
          </span>
        </div>
      </div>

      <style jsx>{`
        @keyframes shimmerSlide {
          0% {
            left: -60%;
          }
          50% {
            left: 50%;
          }
          100% {
            left: 100%;
          }
        }
      `}</style>
    </div>
  );
}
