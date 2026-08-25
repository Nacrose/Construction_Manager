"use client";

import { useState, useEffect } from "react";
import { MapPin } from "lucide-react";

export function DrawingPinPreview({ drawingId, pinX, pinY }: { drawingId: string; pinX: number; pinY: number }) {
  const [imageSrc, setImageSrc] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/drawings/${drawingId}/file`)
      .then((r) => r.json())
      .then((d) => {
        if (d.data?.fileData && d.data?.fileType) {
          setImageSrc(`data:${d.data.fileType};base64,${d.data.fileData}`);
        }
      })
      .catch(() => setImageSrc(null));
  }, [drawingId]);

  if (!imageSrc) return null;

  return (
    <div className="ml-[140px] mt-2 border border-border rounded-md overflow-hidden inline-block max-w-64">
      <div className="relative">
        <img src={imageSrc} alt="Drawing with pin" className="max-h-32 object-contain" draggable={false} />
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
      </div>
    </div>
  );
}

