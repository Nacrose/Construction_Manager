"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { MapPin, X } from "lucide-react";

export function DrawingPinSelector({
  drawingId,
  pinX,
  pinY,
  onPinChange,
}: {
  drawingId: string;
  pinX: number | null;
  pinY: number | null;
  onPinChange: (x: number, y: number) => void;
}) {
  const [imageData, setImageData] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!drawingId) return;
    setLoading(true);
    fetch(`/api/drawings/${drawingId}/file`)
      .then((r) => r.json())
      .then((d) => {
        setImageData(d.data ?? null);
      })
      .catch(() => setImageData(null))
      .finally(() => setLoading(false));
  }, [drawingId]);

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const rect = e.currentTarget.getBoundingClientRect();
      const x = (e.clientX - rect.left) / rect.width;
      const y = (e.clientY - rect.top) / rect.height;
      onPinChange(x, y);
    },
    [onPinChange]
  );

  if (loading) {
    return (
      <div className="text-[11px] text-muted-foreground mt-1">Loading drawing preview...</div>
    );
  }
  if (!imageData) return null;

  return (
    <div className="mt-2">
      <p className="text-[11px] text-muted-foreground mb-1 flex items-center gap-1">
        <MapPin className="h-3 w-3" /> Click on drawing to place coordinate pin
        {pinX != null && pinY != null && (
          <button
            type="button"
            className="ml-auto text-[10px] text-muted-foreground hover:text-foreground flex items-center gap-0.5"
            onClick={() => onPinChange(-1, -1)}
          >
            <X className="h-2.5 w-2.5" /> Remove pin
          </button>
        )}
      </p>
      <div
        ref={containerRef}
        className="relative border border-border rounded overflow-hidden cursor-crosshair inline-block max-w-full bg-background"
        onClick={handleClick}
      >
        <img
          src={imageData}
          alt="Drawing preview"
          className="max-h-48 object-contain"
          draggable={false}
        />
        {pinX != null && pinY != null && pinX >= 0 && pinY >= 0 && (
          <div
            className="absolute pointer-events-none"
            style={{
              left: `${pinX * 100}%`,
              top: `${pinY * 100}%`,
              transform: "translate(-50%, -100%)",
            }}
          >
            <MapPin className="h-5 w-5 text-primary fill-primary/30" />
          </div>
        )}
      </div>
    </div>
  );
}
