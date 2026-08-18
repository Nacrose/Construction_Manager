"use client";

import { useState, useEffect, useRef } from "react";
import { useForm, useWatch } from "react-hook-form";
import { trpc } from "@/lib/trpc-client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, CheckCircle2, MessageSquare, MapPin } from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";

export function DrawingPinPreview({ drawingId, pinX, pinY }: { drawingId: string; pinX: number; pinY: number }) {
  const [imageData, setImageData] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/drawings/${drawingId}/file`)
      .then((r) => r.json())
      .then((d) => setImageData(d.data ?? null))
      .catch(() => setImageData(null));
  }, [drawingId]);

  if (!imageData) return null;

  return (
    <div className="ml-[140px] mt-2 border border-border rounded-md overflow-hidden inline-block max-w-64">
      <div className="relative">
        <img src={imageData} alt="Drawing with pin" className="max-h-32 object-contain" draggable={false} />
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

