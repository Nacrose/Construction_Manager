"use client";

import React, { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import {
  UploadCloud,
  FileText,
  Image as ImageIcon,
  X,
  Eye,
  Loader2,
  CheckCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export interface AttachmentDropzoneProps {
  value?: string | null; // URL or base64
  onChange?: (url: string | null, file?: File) => void;
  label?: string;
  accept?: string;
  maxSizeMb?: number;
  disabled?: boolean;
  className?: string;
}

export function AttachmentDropzone({
  value,
  onChange,
  label = "Upload Scanned Bill / Invoice / Voucher Slip",
  accept = "image/*,application/pdf",
  maxSizeMb = 10,
  disabled = false,
  className,
}: AttachmentDropzoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = (file: File) => {
    setErrorMessage(null);

    // Validate size
    if (file.size > maxSizeMb * 1024 * 1024) {
      setErrorMessage(`File size exceeds maximum allowed ${maxSizeMb}MB.`);
      return;
    }

    setIsUploading(true);

    // Convert file to local preview URL / Base64
    const reader = new FileReader();
    reader.onload = (e) => {
      const result = e.target?.result as string;
      setIsUploading(false);
      onChange?.(result, file);
    };
    reader.onerror = () => {
      setIsUploading(false);
      setErrorMessage("Failed to read file.");
    };
    reader.readAsDataURL(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (disabled || isUploading) return;
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0]);
    }
  };

  const handleRemove = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange?.(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const isPdf = value?.includes("application/pdf") || value?.endsWith(".pdf");

  return (
    <div className={cn("space-y-1.5", className)}>
      {label && <label className="text-xs text-foreground/80 font-medium block">{label}</label>}

      {value ? (
        <div className="relative flex items-center justify-between p-3 rounded-xl bg-card border border-[var(--border)] group">
          <div className="flex items-center gap-3 overflow-hidden">
            <div className="h-10 w-10 shrink-0 rounded-lg bg-success/10 border border-success/20 flex items-center justify-center text-success/80">
              {isPdf ? <FileText className="h-5 w-5" /> : <ImageIcon className="h-5 w-5" />}
            </div>
            <div className="truncate text-xs">
              <div className="font-medium text-foreground flex items-center gap-1.5">
                <CheckCircle className="h-3.5 w-3.5 text-success/80" />
                <span>Attachment Attached</span>
              </div>
              <p className="text-[10px] text-muted-foreground font-mono mt-0.5">
                {isPdf ? "PDF Document" : "Image File"}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setPreviewOpen(true)}
              className="h-8 px-2.5 text-xs gap-1 font-mono bg-transparent border-[var(--border)] text-foreground/80 hover:text-foreground"
            >
              <Eye className="h-3.5 w-3.5 text-success/80" />
              Preview
            </Button>
            {!disabled && (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={handleRemove}
                className="h-8 w-8 p-0 text-red-400 hover:text-red-300 hover:bg-red-500/10"
              >
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      ) : (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          onClick={() => !disabled && fileInputRef.current?.click()}
          className={cn(
            "relative flex flex-col items-center justify-center p-3.5 rounded-xl border-2 border-dashed border-[var(--border)] bg-card hover:border-success/40 hover:bg-card/[0.02] cursor-pointer transition-all text-center",
            isDragging && "border-success bg-success/5",
            disabled && "opacity-50 cursor-not-allowed"
          )}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept={accept}
            className="hidden"
            onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
            disabled={disabled}
          />

          {isUploading ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground font-mono py-2">
              <Loader2 className="h-4 w-4 animate-spin text-success/80" />
              Uploading & Processing Attachment...
            </div>
          ) : (
            <>
              <UploadCloud className="h-6 w-6 text-muted-foreground mb-1 group-hover:text-success/80 transition-colors" />
              <p className="text-xs font-semibold text-foreground">
                Drag &amp; drop file here, or <span className="text-success/80 underline">browse</span>
              </p>
              <p className="text-[10px] text-muted-foreground font-mono mt-0.5">
                Supports PDF, JPG, PNG up to {maxSizeMb}MB
              </p>
            </>
          )}
        </div>
      )}

      {errorMessage && (
        <p className="text-[10px] text-red-400 font-mono mt-1">{errorMessage}</p>
      )}

      {/* Preview Modal */}
      {previewOpen && value && (
        <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
          <DialogContent className="max-w-3xl bg-card border-[var(--border)] text-foreground shadow-2xl">
            <DialogHeader>
              <DialogTitle className="text-sm font-bold">Attachment Preview</DialogTitle>
            </DialogHeader>
            <div className="mt-2 flex items-center justify-center max-h-[70vh] overflow-auto">
              {isPdf ? (
                <iframe src={value} className="w-full h-[65vh] rounded-lg border border-[var(--border)]" />
              ) : (
                 
                <img
                  src={value}
                  alt="Attachment Preview"
                  className="max-h-[65vh] w-auto object-contain rounded-lg border border-[var(--border)]"
                />
              )}
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
