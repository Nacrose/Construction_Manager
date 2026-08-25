"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Pen, ArrowRight, Type, Eraser, Undo2, Trash2, Download, X, Check,
  Circle, Square, Highlighter, RotateCcw,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type Tool = "pen" | "arrow" | "rect" | "circle" | "text" | "highlight";

interface Annotation {
  type: Tool;
  color: string;
  lineWidth: number;
  points: Array<{ x: number; y: number }>;
  text?: string;
}

interface PhotoAnnotatorProps {
  imageSrc: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (annotatedDataUrl: string) => void;
}

const COLORS = [
  "#ef4444", // red
  "#f59e0b", // amber
  "#10b981", // emerald
  "#3b82f6", // blue
  "#8b5cf6", // purple
  "#ffffff", // white
  "#000000", // black
];

const LINE_WIDTHS = [2, 4, 6, 10];

/**
 * PhotoAnnotator — canvas-based image annotation tool.
 *
 * Lets users draw markers, arrows, rectangles, circles, text, and
 * highlights on top of a photo. The annotated image is returned as
 * a data URL (PNG).
 *
 * Used by:
 *  - ReportImageAttachments (annotate before attaching to a report)
 *  - Could be used by chat image attachments too
 */
function drawAnnotation(ctx: CanvasRenderingContext2D, ann: Annotation) {
  ctx.strokeStyle = ann.color;
  ctx.fillStyle = ann.color;
  ctx.lineWidth = ann.lineWidth;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  if (ann.type === "pen" || ann.type === "highlight") {
    if (ann.type === "highlight") {
      ctx.globalAlpha = 0.3;
    } else {
      ctx.globalAlpha = 1;
    }
    if (ann.points.length < 2) {
      // Single point — draw a dot
      ctx.beginPath();
      ctx.arc(ann.points[0].x, ann.points[0].y, ann.lineWidth / 2, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.beginPath();
      ctx.moveTo(ann.points[0].x, ann.points[0].y);
      for (let i = 1; i < ann.points.length; i++) {
        ctx.lineTo(ann.points[i].x, ann.points[i].y);
      }
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  } else if (ann.type === "arrow" && ann.points.length >= 2) {
    const start = ann.points[0];
    const end = ann.points[ann.points.length - 1];
    ctx.beginPath();
    ctx.moveTo(start.x, start.y);
    ctx.lineTo(end.x, end.y);
    ctx.stroke();
    // Arrowhead
    const angle = Math.atan2(end.y - start.y, end.x - start.x);
    const headLen = 15 + ann.lineWidth * 2;
    ctx.beginPath();
    ctx.moveTo(end.x, end.y);
    ctx.lineTo(
      end.x - headLen * Math.cos(angle - Math.PI / 6),
      end.y - headLen * Math.sin(angle - Math.PI / 6)
    );
    ctx.lineTo(
      end.x - headLen * Math.cos(angle + Math.PI / 6),
      end.y - headLen * Math.sin(angle + Math.PI / 6)
    );
    ctx.closePath();
    ctx.fill();
  } else if (ann.type === "rect" && ann.points.length >= 2) {
    const start = ann.points[0];
    const end = ann.points[ann.points.length - 1];
    ctx.strokeRect(
      Math.min(start.x, end.x),
      Math.min(start.y, end.y),
      Math.abs(end.x - start.x),
      Math.abs(end.y - start.y)
    );
  } else if (ann.type === "circle" && ann.points.length >= 2) {
    const start = ann.points[0];
    const end = ann.points[ann.points.length - 1];
    const radius = Math.sqrt((end.x - start.x) ** 2 + (end.y - start.y) ** 2);
    ctx.beginPath();
    ctx.arc(start.x, start.y, radius, 0, Math.PI * 2);
    ctx.stroke();
  } else if (ann.type === "text" && ann.text) {
    ctx.font = `${14 + ann.lineWidth * 2}px sans-serif`;
    ctx.textBaseline = "top";
    // Draw text background for readability
    const metrics = ctx.measureText(ann.text);
    ctx.globalAlpha = 0.7;
    ctx.fillStyle = "#000";
    ctx.fillRect(ann.points[0].x - 4, ann.points[0].y - 4, metrics.width + 8, 14 + ann.lineWidth * 2 + 8);
    ctx.globalAlpha = 1;
    ctx.fillStyle = ann.color;
    ctx.fillText(ann.text, ann.points[0].x, ann.points[0].y);
  }
}

export function PhotoAnnotator({ imageSrc, open, onOpenChange, onSave }: PhotoAnnotatorProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const [tool, setTool] = useState<Tool>("pen");
  const [color, setColor] = useState(COLORS[0]);
  const [lineWidth, setLineWidth] = useState(4);
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [currentAnnotation, setCurrentAnnotation] = useState<Annotation | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [textInput, setTextInput] = useState<{ x: number; y: number; value: string } | null>(null);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [canvasDimensions, setCanvasDimensions] = useState({ width: 1, height: 1 });

  // Redraw everything (image + all annotations)
  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    const img = imageRef.current;
    if (!canvas || !ctx || !img) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    // Draw all annotations
    for (const ann of annotations) {
      drawAnnotation(ctx, ann);
    }
    // Draw current in-progress annotation
    if (currentAnnotation) {
      drawAnnotation(ctx, currentAnnotation);
    }
  }, [annotations, currentAnnotation]);

  // Load image and set canvas size
  useEffect(() => {
    if (!open || !imageSrc) return;
    const img = new Image();
    img.onload = () => {
      imageRef.current = img;
      const canvas = canvasRef.current;
      if (!canvas) return;
      // Cap canvas size at 1200px wide to keep performance reasonable
      const maxW = 1200;
      const scale = img.width > maxW ? maxW / img.width : 1;
      canvas.width = img.width * scale;
      canvas.height = img.height * scale;
      setCanvasDimensions({ width: canvas.width, height: canvas.height });
      setImageLoaded(true);
      redraw();
    };
    img.src = imageSrc;
  }, [open, imageSrc, redraw]);

  useEffect(() => {
    if (imageLoaded) redraw();
  }, [imageLoaded, redraw]);
  function getCanvasPos(e: React.MouseEvent | React.TouchEvent): { x: number; y: number } {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
    const clientY = "touches" in e ? e.touches[0].clientY : e.clientY;
    return {
      x: ((clientX - rect.left) / rect.width) * canvas.width,
      y: ((clientY - rect.top) / rect.height) * canvas.height,
    };
  }

  function handleStart(e: React.MouseEvent | React.TouchEvent) {
    e.preventDefault();
    if (tool === "text") {
      const pos = getCanvasPos(e);
      setTextInput({ x: pos.x, y: pos.y, value: "" });
      return;
    }
    const pos = getCanvasPos(e);
    setCurrentAnnotation({
      type: tool,
      color,
      lineWidth,
      points: [pos],
    });
    setIsDrawing(true);
  }

  function handleMove(e: React.MouseEvent | React.TouchEvent) {
    if (!isDrawing || !currentAnnotation) return;
    e.preventDefault();
    const pos = getCanvasPos(e);
    setCurrentAnnotation({
      ...currentAnnotation,
      points: [...currentAnnotation.points, pos],
    });
  }

  function handleEnd() {
    if (!isDrawing || !currentAnnotation) return;
    setAnnotations([...annotations, currentAnnotation]);
    setCurrentAnnotation(null);
    setIsDrawing(false);
  }

  function handleUndo() {
    setAnnotations(annotations.slice(0, -1));
  }

  function handleClear() {
    setAnnotations([]);
  }

  function handleTextSubmit() {
    if (!textInput || !textInput.value.trim()) {
      setTextInput(null);
      return;
    }
    setAnnotations([
      ...annotations,
      {
        type: "text",
        color,
        lineWidth,
        points: [{ x: textInput.x, y: textInput.y }],
        text: textInput.value,
      },
    ]);
    setTextInput(null);
  }

  function handleSave() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    // Create a final render with all annotations baked in
    const dataUrl = canvas.toDataURL("image/png");
    onSave(dataUrl);
    onOpenChange(false);
    // Reset
    setAnnotations([]);
    setCurrentAnnotation(null);
  }

  function handleCancel() {
    onOpenChange(false);
    setAnnotations([]);
    setCurrentAnnotation(null);
  }

  const tools: Array<{ type: Tool; icon: React.ComponentType<{ className?: string }>; label: string }> = [
    { type: "pen", icon: Pen, label: "Pen" },
    { type: "arrow", icon: ArrowRight, label: "Arrow" },
    { type: "rect", icon: Square, label: "Rectangle" },
    { type: "circle", icon: Circle, label: "Circle" },
    { type: "text", icon: Type, label: "Text" },
    { type: "highlight", icon: Highlighter, label: "Highlight" },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl w-full">
        <DialogHeader>
          <DialogTitle>Annotate Photo</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          {/* Toolbar */}
          <div className="flex flex-wrap items-center gap-2 border-b pb-3">
            {/* Tools */}
            <div className="flex gap-1">
              {tools.map((t) => (
                <button
                  key={t.type}
                  onClick={() => setTool(t.type)}
                  className={cn(
                    "rounded-md p-2 transition",
                    tool === t.type
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted hover:bg-muted/80"
                  )}
                  title={t.label}
                >
                  <t.icon className="h-4 w-4" />
                </button>
              ))}
            </div>

            <div className="w-px h-8 bg-border mx-1" />

            {/* Colors */}
            <div className="flex gap-1">
              {COLORS.map((c) => (
                <button
                  key={c}
                  onClick={() => setColor(c)}
                  className={cn(
                    "h-7 w-7 rounded-full border-2 transition",
                    color === c ? "border-primary scale-110" : "border-border"
                  )}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>

            <div className="w-px h-8 bg-border mx-1" />

            {/* Line width */}
            <div className="flex gap-1">
              {LINE_WIDTHS.map((w) => (
                <button
                  key={w}
                  onClick={() => setLineWidth(w)}
                  className={cn(
                    "h-7 w-7 rounded-md border flex items-center justify-center transition",
                    lineWidth === w ? "border-primary bg-primary/10" : "border-border"
                  )}
                >
                  <span
                    className="rounded-full bg-foreground"
                    style={{ width: w + 2, height: w + 2 }}
                  />
                </button>
              ))}
            </div>

            <div className="flex-1" />

            {/* Undo / Clear */}
            <Button size="sm" variant="ghost" onClick={handleUndo} disabled={!annotations.length} title="Undo">
              <Undo2 className="h-4 w-4" />
            </Button>
            <Button size="sm" variant="ghost" onClick={handleClear} disabled={!annotations.length} title="Clear all">
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>

          {/* Canvas */}
          <div className="relative bg-muted/30 rounded-lg overflow-auto max-h-[60vh] flex items-center justify-center">
            <canvas
              ref={canvasRef}
              onMouseDown={handleStart}
              onMouseMove={handleMove}
              onMouseUp={handleEnd}
              onMouseLeave={handleEnd}
              onTouchStart={handleStart}
              onTouchMove={handleMove}
              onTouchEnd={handleEnd}
              className="max-w-full touch-none cursor-crosshair"
              style={{ display: imageLoaded ? "block" : "none" }}
            />
            {!imageLoaded && (
              <div className="h-48 flex items-center justify-center text-sm text-muted-foreground">
                Loading image…
              </div>
            )}

            {/* Text input overlay */}
            {textInput && (
              <div
                className="absolute"
                style={{
                  left: `${(textInput.x / canvasDimensions.width) * 100}%`,
                  top: `${(textInput.y / canvasDimensions.height) * 100}%`,
                }}
              >
                <input
                  type="text"
                  value={textInput.value}
                  onChange={(e) => setTextInput({ ...textInput, value: e.target.value })}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleTextSubmit();
                    if (e.key === "Escape") setTextInput(null);
                  }}
                  onBlur={handleTextSubmit}
                  autoFocus
                  placeholder="Type text…"
                  className="rounded border-2 border-primary bg-white px-2 py-1 text-sm shadow-lg"
                  style={{ color }}
                />
              </div>
            )}
          </div>

          {/* Help text */}
          <p className="text-xs text-muted-foreground text-center">
            {tool === "text"
              ? "Click on the image to place text, then type and press Enter"
              : `Click and drag to draw with the ${tool} tool`}
          </p>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={handleCancel}>
            <X className="h-4 w-4 mr-1" />
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!imageLoaded}>
            <Check className="h-4 w-4 mr-1" />
            Save Annotated Photo
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
