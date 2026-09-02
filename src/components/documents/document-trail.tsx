"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc-client";
import {
  Card, CardContent, CardHeader, CardTitle, CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  FileText, Upload, Download, Trash2, Loader2, FileSignature,
  FileCheck2, FilePlus2, Clock, ChevronDown, ChevronUp,
} from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { UploadSignedCopyDialog } from "./upload-signed-copy-dialog";

type Props = {
  projectId: string;
  entityType: string;
  entityId: string;
  /** Show the "Upload Document" button (default: true) */
  allowUpload?: boolean;
  /** Lock uploaded docs to a specific type (e.g. "signed_hardcopy") */
  fixedDocumentType?: "generated_pdf" | "signed_hardcopy" | "supporting_doc";
  /** Pre-fill the "signed by" field */
  defaultSignedBy?: string;
  /** Compact mode: only show the most recent 3 documents */
  compact?: boolean;
  /** Title override */
  title?: string;
};

const DOC_TYPE_CONFIG = {
  generated_pdf: {
    label: "Generated PDF",
    icon: FileText,
    color: "text-info",
    bg: "bg-info/10 dark:bg-[var(--navy-deep)]/30",
    border: "border-info/30 dark:border-info/30",
  },
  signed_hardcopy: {
    label: "Signed Hardcopy",
    icon: FileSignature,
    color: "text-emerald-600",
    bg: "bg-emerald-50 dark:bg-emerald-950/30",
    border: "border-emerald-200 dark:border-emerald-900",
  },
  supporting_doc: {
    label: "Supporting Document",
    icon: FilePlus2,
    color: "text-amber-600",
    bg: "bg-amber-50 dark:bg-amber-950/30",
    border: "border-amber-200 dark:border-amber-900",
  },
};

export function DocumentTrail({
  projectId,
  entityType,
  entityId,
  allowUpload = true,
  fixedDocumentType,
  defaultSignedBy,
  compact = false,
  title = "Document Trail",
}: Props) {
  const utils = trpc.useUtils();
  const [uploadOpen, setUploadOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const { data, isLoading } = trpc.approvedDocument.list.useQuery({
    projectId,
    entityType,
    entityId,
  });

  const deleteMut = trpc.approvedDocument.delete.useMutation({
    onSuccess: () => {
      utils.approvedDocument.list.invalidate({ projectId, entityType, entityId });
      toast.success("Document deleted");
    },
    onError: (e) => toast.error(e.message),
  });

  const handleDownload = async (docId: string, fileName: string) => {
    try {
      const result = await utils.approvedDocument.get.fetch({ id: docId, projectId });
      if (!result?.document) throw new Error("Document not found");
      // Reconstruct the file from base64
      const byteChars = atob(result.document.data);
      const byteNumbers = new Array(byteChars.length);
      for (let i = 0; i < byteChars.length; i++) {
        byteNumbers[i] = byteChars.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], { type: result.document.fileType });
      const url = URL.createObjectURL(blob);
      const a = window.document.createElement("a");
      a.href = url;
      a.download = fileName;
      window.document.body.appendChild(a);
      a.click();
      window.document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e: any) {
      toast.error(e.message ?? "Download failed");
    }
  };

  const handleDelete = (docId: string, fileName: string) => {
    if (confirm(`Delete "${fileName}"? This cannot be undone.`)) {
      deleteMut.mutate({ id: docId, projectId });
    }
  };

  const documents = data?.documents ?? [];
  const visibleDocs = compact && !expanded ? documents.slice(0, 3) : documents;

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <FileCheck2 className="h-4 w-4" /> {title}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-24" />
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-sm flex items-center gap-2">
                <FileCheck2 className="h-4 w-4" /> {title}
              </CardTitle>
              <CardDescription className="text-xs">
                {documents.length === 0
                  ? "No documents archived yet."
                  : `${documents.length} document${documents.length !== 1 ? "s" : ""} archived`}
              </CardDescription>
            </div>
            {allowUpload && (
              <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => setUploadOpen(true)}>
                <Upload className="h-3 w-3" /> Upload
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          {documents.length === 0 ? (
            <div className="text-center py-6 text-xs text-muted-foreground">
              <FileText className="h-8 w-8 mx-auto mb-2 opacity-30" />
              <p>No documents archived yet.</p>
              {allowUpload && (
                <p className="mt-1">
                  Click <strong>Upload</strong> to add a signed hardcopy,
                  generated PDF, or supporting document.
                </p>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              {/* Timeline */}
              <div className="relative">
                {visibleDocs.map((doc, idx) => {
                  const cfg = DOC_TYPE_CONFIG[doc.documentType as keyof typeof DOC_TYPE_CONFIG] ?? DOC_TYPE_CONFIG.supporting_doc;
                  const Icon = cfg.icon;
                  const isLast = idx === visibleDocs.length - 1;
                  return (
                    <div key={doc.id} className="relative flex gap-3 pb-3">
                      {/* Timeline line */}
                      {!isLast && (
                        <div className="absolute left-[15px] top-8 bottom-0 w-px bg-border" />
                      )}
                      {/* Icon */}
                      <div className={cn("shrink-0 h-8 w-8 rounded-full flex items-center justify-center border", cfg.bg, cfg.border)}>
                        <Icon className={cn("h-4 w-4", cfg.color)} />
                      </div>
                      {/* Content */}
                      <div className="flex-1 min-w-0 pb-1">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-xs font-medium truncate">{doc.fileName}</span>
                              <span className={cn("rounded px-1 text-[9px] font-medium uppercase", cfg.bg, cfg.color)}>
                                {cfg.label}
                              </span>
                            </div>
                            <div className="text-[10px] text-muted-foreground mt-0.5">
                              Uploaded by {doc.uploadedBy?.name ?? "—"} · {format(new Date(doc.uploadedAt), "dd MMM yyyy, HH:mm")}
                            </div>
                            {/* Signed hardcopy metadata */}
                            {doc.documentType === "signed_hardcopy" && (doc.signedBy || doc.signedAt || doc.receivedAt) && (
                              <div className="text-[10px] text-muted-foreground mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
                                {doc.signedBy && <span>✍️ Signed by: <strong>{doc.signedBy}</strong></span>}
                                {doc.signedAt && <span>📅 Signed: {format(new Date(doc.signedAt), "dd MMM yyyy")}</span>}
                                {doc.receivedAt && <span>📦 Received: {format(new Date(doc.receivedAt), "dd MMM yyyy")}</span>}
                              </div>
                            )}
                            {doc.notes && (
                              <div className="text-[10px] text-muted-foreground mt-1 italic">
                                "{doc.notes}"
                              </div>
                            )}
                          </div>
                          {/* Actions */}
                          <div className="flex items-center gap-0.5 shrink-0">
                            <button
                              onClick={() => handleDownload(doc.id, doc.fileName)}
                              className="h-6 w-6 rounded border hover:bg-muted flex items-center justify-center"
                              title="Download"
                            >
                              <Download className="h-3 w-3" />
                            </button>
                            <button
                              onClick={() => handleDelete(doc.id, doc.fileName)}
                              className="h-6 w-6 rounded border hover:bg-destructive hover:text-destructive-foreground flex items-center justify-center"
                              title="Delete"
                              disabled={deleteMut.isPending}
                            >
                              <Trash2 className="h-3 w-3" />
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Show more / less */}
              {compact && documents.length > 3 && (
                <button
                  onClick={() => setExpanded(!expanded)}
                  className="w-full text-center text-[10px] text-muted-foreground hover:text-foreground py-1 flex items-center justify-center gap-1"
                >
                  {expanded ? <><ChevronUp className="h-3 w-3" /> Show less</> : <><ChevronDown className="h-3 w-3" /> Show {documents.length - 3} more</>}
                </button>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Upload dialog */}
      <UploadSignedCopyDialog
        open={uploadOpen}
        onOpenChange={setUploadOpen}
        projectId={projectId}
        entityType={entityType}
        entityId={entityId}
        fixedDocumentType={fixedDocumentType}
        defaultSignedBy={defaultSignedBy}
      />
    </>
  );
}
