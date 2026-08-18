"use client";

import { useState, useCallback, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { ImagePlus, X } from "lucide-react";

interface DroppedImage {
  id: string;
  dataUrl: string;
  name: string;
  addedAt: number;
}

/**
 * useDroppedImages — hook that manages images dropped from chat or pasted
 * into a textarea. Returns the list, an add function, and a remove function.
 *
 * Images are stored as data URLs (base64-encoded). They persist in React
 * state until the form is submitted — at which point the consumer should
 * attach them to whatever entity they belong to (e.g., via a chat message
 * with linkedEntityType='daily_report').
 */
export function useDroppedImages() {
  const [images, setImages] = useState<DroppedImage[]>([]);

  const addImage = useCallback((dataUrl: string, name?: string) => {
    const img: DroppedImage = {
      id: crypto.randomUUID(),
      dataUrl,
      name: name ?? `image-${Date.now()}.png`,
      addedAt: Date.now(),
    };
    setImages((prev) => [...prev, img]);
  }, []);

  const removeImage = useCallback((id: string) => {
    setImages((prev) => prev.filter((i) => i.id !== id));
  }, []);

  const clearImages = useCallback(() => setImages([]), []);

  return { images, addImage, removeImage, clearImages };
}

/**
 * DropZone — wraps any element to accept dropped images from the chat PiP
 * panel (or any other draggable source providing a data URL).
 *
 * On drop, calls onDropImage with the data URL.
 *
 * Also accepts paste events for images (Ctrl+V) — useful for screenshots.
 */
interface DropZoneProps {
  children: ReactNode;
  onDropImage: (dataUrl: string, name?: string) => void;
  className?: string;
  /** Label shown when dragging over */
  dropLabel?: string;
}

export function DropZone({
  children,
  onDropImage,
  className,
  dropLabel = "Drop images from chat here",
}: DropZoneProps) {
  const [isOver, setIsOver] = useState(false);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    // Allow drop
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
    if (!isOver) setIsOver(true);
  }, [isOver]);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    // Only set false if leaving the container itself, not a child
    if (e.currentTarget === e.target) {
      setIsOver(false);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsOver(false);

    // Try to read data URL from dragged data (from chat)
    const uriList = e.dataTransfer.getData("text/uri-list");
    const plainText = e.dataTransfer.getData("text/plain");

    const dataUrl = uriList || plainText;
    if (dataUrl && dataUrl.startsWith("data:image/")) {
      const name = dataUrl.match(/;name=([^;]+)/)?.[1];
      onDropImage(dataUrl, name ? decodeURIComponent(name) : undefined);
      return;
    }

    // Also support dropped files (from desktop / file manager)
    const files = Array.from(e.dataTransfer.files);
    for (const file of files) {
      if (!file.type.startsWith("image/")) continue;
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result;
        if (typeof result === "string") {
          onDropImage(result, file.name);
        }
      };
      reader.readAsDataURL(file);
    }
  }, [onDropImage]);

  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    const items = Array.from(e.clipboardData.items);
    for (const item of items) {
      if (item.type.startsWith("image/")) {
        const file = item.getAsFile();
        if (!file) continue;
        const reader = new FileReader();
        reader.onload = () => {
          const result = reader.result;
          if (typeof result === "string") {
            onDropImage(result, file.name);
          }
        };
        reader.readAsDataURL(file);
      }
    }
  }, [onDropImage]);

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onPaste={handlePaste}
      className={cn(
        "relative transition-all",
        isOver && "ring-2 ring-amber-500 ring-offset-2 ring-offset-background rounded-lg",
        className
      )}
    >
      {children}
      {isOver && (
        <div className="absolute inset-0 z-10 flex items-center justify-center rounded-lg bg-amber-500/10 backdrop-blur-sm pointer-events-none">
          <div className="flex items-center gap-2 rounded-lg bg-amber-500 px-3 py-2 text-sm font-medium text-black">
            <ImagePlus className="h-4 w-4" />
            {dropLabel}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * DroppedImagePreview — shows a thumbnail of a dropped image with a
 * remove button. Use inside a form to show what's been dropped.
 */
export function DroppedImagePreview({
  images,
  onRemove,
}: {
  images: DroppedImage[];
  onRemove: (id: string) => void;
}) {
  if (images.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2 mt-2">
      {images.map((img) => (
        <div
          key={img.id}
          className="relative group rounded-md border overflow-hidden h-20 w-20"
        >
          <img
            src={img.dataUrl}
            alt={img.name}
            className="h-full w-full object-cover"
          />
          <button
            onClick={() => onRemove(img.id)}
            className="absolute top-0.5 right-0.5 rounded-full bg-black/60 text-white p-0.5 opacity-0 group-hover:opacity-100 transition"
            title="Remove"
          >
            <X className="h-3 w-3" />
          </button>
          <div className="absolute bottom-0 inset-x-0 bg-black/60 text-white text-[9px] px-1 py-0.5 truncate">
            {img.name}
          </div>
        </div>
      ))}
    </div>
  );
}
