"use client";

import React from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

export interface FormDialogEngineProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: React.ReactNode;
  description?: React.ReactNode;
  badge?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  maxWidth?: "sm" | "md" | "lg" | "xl" | "2xl" | "3xl" | "4xl" | "5xl" | "6xl";
  aspectRatio?: "16/10" | "auto";
}

const maxWidthClasses = {
  sm: "sm:max-w-sm",
  md: "sm:max-w-md",
  lg: "sm:max-w-lg",
  xl: "sm:max-w-xl",
  "2xl": "sm:max-w-2xl",
  "3xl": "sm:max-w-3xl",
  "4xl": "sm:max-w-4xl",
  "5xl": "sm:max-w-5xl",
  "6xl": "sm:max-w-6xl",
};

/**
 * Standard Widescreen Landscape Form Dialog Engine
 *
 * Enforces:
 * - 16:10 Landscape Widescreen aspect ratio preference
 * - Dark Glass Backdrop Blur (backdrop-blur-md bg-black/85 border-white/10)
 * - Clean zero-scroll responsive layout
 */
export function FormDialogEngine({
  open,
  onOpenChange,
  title,
  description,
  badge,
  children,
  className,
  maxWidth = "4xl",
  aspectRatio = "16/10",
}: FormDialogEngineProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          "w-full bg-[#f8fbfe] border border-[var(--border)] shadow-2xl p-0 overflow-hidden rounded-2xl",
          maxWidthClasses[maxWidth],
          aspectRatio === "16/10" && "aspect-[16/10] max-h-[92vh] flex flex-col",
          className
        )}
      >
        {/* Header */}
        <DialogHeader className="px-6 py-4 border-b border-[var(--border)] bg-white/80 shrink-0 flex flex-row items-center justify-between gap-4">
          <div className="space-y-0.5">
            <div className="flex items-center gap-2.5">
              <DialogTitle className="text-base font-bold text-foreground font-sans tracking-tight">
                {title}
              </DialogTitle>
              {badge}
            </div>
            {description && (
              <DialogDescription className="text-xs text-muted-foreground font-normal">
                {description}
              </DialogDescription>
            )}
          </div>
        </DialogHeader>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {children}
        </div>
      </DialogContent>
    </Dialog>
  );
}
