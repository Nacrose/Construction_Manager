"use client";

import { useState, useRef, useCallback } from "react";
import { Upload, X, FileIcon, Loader2, Download } from "lucide-react";
import { cn } from "@/lib/utils";

export function FileDropzone({
  onUpload,
  uploading,
}: {
  onUpload: (file: { fileName: string; fileType: string; fileSize: number; data: string }) => void;
  uploading: boolean;
}) {
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(async (file: File) => {
    if (file.size > 10 * 1024 * 1024) return;
    const data = await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.readAsDataURL(file);
    });
    onUpload({
      fileName: file.name,
      fileType: file.type,
      fileSize: file.size,
      data,
    });
  }, [onUpload]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  }, [handleFile]);

  return (
    <div
      className={cn(
        "relative border-2 border-dashed rounded-md p-3 transition-colors cursor-pointer text-center",
        dragOver ? "border-primary bg-primary/5" : "border-muted-foreground/30 hover:border-muted-foreground/60",
      )}
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
      onClick={() => inputRef.current?.click()}
    >
      <input ref={inputRef} type="file" className="hidden" onChange={handleChange} accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png,.zip" />
      {uploading ? (
        <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Uploading...
        </div>
      ) : (
        <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
          <Upload className="h-4 w-4" />
          <span>Drop file here or click to browse</span>
        </div>
      )}
    </div>
  );
}

export function AttachmentBadge({
  file,
  onRemove,
  downloadable = true,
}: {
  file: { id?: string; fileName: string; fileSize: number; data?: string };
  onRemove: () => void;
  downloadable?: boolean;
}) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const isImage = file.fileName.match(/\.(jpg|jpeg|png|gif|webp)$/i);
  const preview = file.data && isImage ? file.data : null;

  const handleDownload = () => {
    if (!file.data) return;
    const a = document.createElement("a");
    a.href = file.data;
    a.download = file.fileName;
    a.click();
  };

  return (
    <div className="group flex items-center gap-2 bg-muted/50 rounded-md px-2 py-1 text-xs">
      {preview ? (
        <img
          src={preview}
          alt={file.fileName}
          className="h-6 w-6 rounded object-cover cursor-pointer"
          onClick={() => setPreviewUrl(preview)}
        />
      ) : (
        <FileIcon className="h-4 w-4 text-muted-foreground shrink-0" />
      )}
      <span className="truncate max-w-[120px] cursor-pointer" onClick={downloadable && file.data ? handleDownload : undefined} style={downloadable && file.data ? { textDecoration: "underline" } : {}}>
        {file.fileName}
      </span>
      {downloadable && file.data && <button type="button" onClick={handleDownload} title="Download" className="p-1 text-muted-foreground hover:text-foreground shrink-0"><Download className="h-3 w-3" /></button>}
      <span className="text-[10px] text-muted-foreground shrink-0">{(file.fileSize / 1024).toFixed(0)} KB</span>
      <button type="button" onClick={onRemove} className="shrink-0 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity">
        <X className="h-3 w-3" />
      </button>
      {previewUrl && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setPreviewUrl(null)}>
          <img src={previewUrl} alt="" className="max-h-full max-w-full rounded" />
        </div>
      )}
    </div>
  );
}
