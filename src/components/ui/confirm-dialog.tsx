"use client";

import React from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { AlertTriangle, CheckCircle, Info, Loader2, ShieldAlert } from "lucide-react";
import { cn } from "@/lib/utils";

export interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string | React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "destructive" | "default" | "warning" | "success";
  isLoading?: boolean;
  onConfirm: () => void | Promise<void>;
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  variant = "destructive",
  isLoading = false,
  onConfirm,
}: ConfirmDialogProps) {
  const getIcon = () => {
    switch (variant) {
      case "destructive":
        return <ShieldAlert className="h-5 w-5 text-rose-400 shrink-0 mt-0.5" />;
      case "warning":
        return <AlertTriangle className="h-5 w-5 text-amber-400 shrink-0 mt-0.5" />;
      case "success":
        return <CheckCircle className="h-5 w-5 text-emerald-400 shrink-0 mt-0.5" />;
      default:
        return <Info className="h-5 w-5 text-info/80 shrink-0 mt-0.5" />;
    }
  };

  const getButtonClass = () => {
    switch (variant) {
      case "destructive":
        return "bg-rose-600 hover:bg-rose-700 text-foreground font-bold";
      case "warning":
        return "bg-amber-600 hover:bg-amber-700 text-foreground font-bold";
      case "success":
        return "bg-emerald-600 hover:bg-emerald-700 text-foreground font-bold";
      default:
        return "bg-primary hover:bg-primary/90 text-primary-foreground font-bold";
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="bg-card border border-[var(--border)] text-foreground shadow-2xl max-w-md p-6 backdrop-blur-md shadow-2xl">
        <AlertDialogHeader>
          <div className="flex items-start gap-3">
            {getIcon()}
            <div className="space-y-1 text-left">
              <AlertDialogTitle className="text-base font-bold text-foreground leading-snug">
                {title}
              </AlertDialogTitle>
              {description && (
                <AlertDialogDescription className="text-xs text-foreground/80 leading-relaxed">
                  {description}
                </AlertDialogDescription>
              )}
            </div>
          </div>
        </AlertDialogHeader>

        <AlertDialogFooter className="gap-2 pt-3 border-t border-[var(--border)] mt-2">
          <AlertDialogCancel
            disabled={isLoading}
            className="text-xs bg-transparent border-[var(--border)] text-foreground/80 hover:text-foreground hover:bg-muted/60 h-8 px-3"
          >
            {cancelLabel}
          </AlertDialogCancel>
          <Button
            type="button"
            disabled={isLoading}
            onClick={async (e) => {
              e.preventDefault();
              await onConfirm();
            }}
            className={cn("text-xs h-8 px-4", getButtonClass())}
          >
            {isLoading && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
            {confirmLabel}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
