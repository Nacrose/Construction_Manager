"use client";

import { Button } from "@/components/ui/button";
import { Maximize2 } from "lucide-react";

export function GanttFullscreenPrompt({
  onDismiss,
  onEnterFullscreen,
}: {
  onDismiss: () => void;
  onEnterFullscreen: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50">
      <div className="w-80 rounded-lg bg-background p-5 shadow-xl text-center">
        <div className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-amber-gradient">
          <Maximize2 className="h-5 w-5 text-white" />
        </div>
        <h3 className="mb-1 text-sm font-semibold">Fullscreen Recommended</h3>
        <p className="mb-4 text-xs text-muted-foreground leading-relaxed">
          The schedule is best viewed in fullscreen mode for the full Gantt chart experience.
        </p>
        <div className="flex justify-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-xs"
            onClick={onDismiss}
          >
            Stay here
          </Button>
          <Button
            size="sm"
            className="h-8 text-xs bg-navy-gradient text-white border-0"
            onClick={onEnterFullscreen}
          >
            <Maximize2 className="mr-1 h-3 w-3" />
            Enter Fullscreen
          </Button>
        </div>
      </div>
    </div>
  );
}
