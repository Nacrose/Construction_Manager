"use client";

import { useState, useRef, useCallback } from "react";
import { trpc } from "@/lib/trpc-client";
import { format } from "date-fns";
import { Upload, X, Loader2 } from "lucide-react";
import { toast } from "sonner";

/**
 * MSPImportButton — hidden file input + modal that:
 *  1. Reads the selected .xml file
 *  2. Calls gantt.previewImport to show what will be imported
 *  3. On confirm, calls gantt.commitImport to write tasks to the DB
 *
 * Mode options:
 *  - Merge (default): only add/update tasks from the file; leave others untouched
 *  - Replace: delete existing tasks not present in the import file
 */
export function MSPImportButton({
  projectId,
  versionId,
  renderTrigger,
}: {
  projectId: string;
  versionId: string | null | undefined;
  renderTrigger?: (onClick: () => void) => React.ReactNode;
}) {
  const utils = trpc.useUtils();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [xmlContent, setXmlContent] = useState<string | null>(null);
  const [fileName, setFileName] = useState("");
  const [mode, setMode] = useState<"merge" | "replace">("merge");
  const [updateExisting, setUpdateExisting] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [showResult, setShowResult] = useState(false);

  const previewMut = trpc.gantt.previewImport.useMutation({
    onError: (e) => {
      toast.error(e.message);
      setShowModal(false);
    },
  });

  const commitMut = trpc.gantt.commitImport.useMutation({
    onSuccess: () => {
      utils.gantt.list.invalidate();
      utils.gantt.listVersions.invalidate({ projectId });
    },
    onError: (e) => toast.error(e.message),
  });

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.name.endsWith(".xml")) {
      toast.error("Please select an MS Project XML (.xml) file");
      return;
    }
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = () => {
      const content = reader.result;
      if (typeof content !== "string") {
        toast.error("Could not read file");
        return;
      }
      setXmlContent(content);
      if (versionId) {
        previewMut.mutate({ xml: content, versionId });
        setShowModal(true);
      } else {
        toast.error("No active version selected — create a version first");
      }
    };
    reader.readAsText(file);
    // Reset input so the same file can be selected again
    e.target.value = "";
  }

  function handleCommit() {
    if (!xmlContent || !versionId) return;
    commitMut.mutate(
      { xml: xmlContent, versionId, mode, updateExisting },
      {
        onSuccess: (data) => {
          toast.success(
            `Imported: ${data.created} new, ${data.updated} updated, ${data.dependenciesCreated} deps` +
              (data.assignmentsCreated > 0 ? `, ${data.assignmentsCreated} assignments` : "") +
              (data.deleted > 0 ? `, ${data.deleted} deleted` : "")
          );
          setShowResult(true);
        },
      }
    );
  }

  const preview = previewMut.data;
  const result = commitMut.data;
  const inputId = `msp-import-${projectId}`;
  const handleTriggerClick = useCallback(() => {
    const el = document.getElementById(inputId) as HTMLInputElement | null;
    el?.click();
  }, [inputId]);

  return (
    <>
      <input
        id={inputId}
        ref={fileInputRef}
        type="file"
        accept=".xml"
        onChange={handleFileSelect}
        className="hidden"
      />
      {renderTrigger ? (
        renderTrigger(handleTriggerClick)
      ) : (
        <button
          onClick={handleTriggerClick}
          className="flex items-center gap-1 rounded border border-border px-2 py-1 text-[10px] font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
          title="Import from MS Project XML file"
        >
          <Upload className="h-3 w-3" />
          Import
        </button>
      )}

      {/* Preview / Confirm modal */}
      {showModal && preview && !showResult && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="max-w-lg w-full rounded-lg bg-card border border-border shadow-2xl">
            <div className="border-b px-4 py-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold">Import MS Project — Preview</h3>
              <button
                onClick={() => {
                  setShowModal(false);
                  setXmlContent(null);
                  setFileName("");
                }}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="p-4 space-y-3 text-sm">
              <div className="rounded border bg-muted/30 p-3 space-y-1">
                <p className="text-xs text-muted-foreground">File</p>
                <p className="font-medium truncate">{fileName}</p>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded border p-2 text-center">
                  <p className="text-lg font-bold text-foreground">{preview.taskCount}</p>
                  <p className="text-[10px] text-muted-foreground uppercase">Total Tasks</p>
                </div>
                <div className="rounded border p-2 text-center">
                  <p className="text-lg font-bold text-emerald-600">{preview.newCount}</p>
                  <p className="text-[10px] text-muted-foreground uppercase">New</p>
                </div>
                <div className="rounded border p-2 text-center">
                  <p className="text-lg font-bold text-amber-600">{preview.existingCount}</p>
                  <p className="text-[10px] text-muted-foreground uppercase">Existing</p>
                </div>
              </div>
              {(preview.resourceCount > 0 || preview.assignmentCount > 0) && (
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded border p-2 text-center">
                    <p className="text-lg font-bold text-info">{preview.resourceCount}</p>
                    <p className="text-[10px] text-muted-foreground uppercase">Resources</p>
                  </div>
                  <div className="rounded border p-2 text-center">
                    <p className="text-lg font-bold text-purple-600">
                      {preview.assignmentCount}
                    </p>
                    <p className="text-[10px] text-muted-foreground uppercase">Assignments</p>
                  </div>
                </div>
              )}
              <div className="rounded border bg-muted/30 p-3 space-y-1">
                <p className="text-xs text-muted-foreground">Project name from file</p>
                <p className="font-medium">{preview.projectName}</p>
                {preview.startDate && (
                  <p className="text-xs text-muted-foreground">
                    {format(new Date(preview.startDate), "dd MMM yyyy")} —{" "}
                    {preview.finishDate ? format(new Date(preview.finishDate), "dd MMM yyyy") : "—"}
                  </p>
                )}
              </div>
              {preview.previewTasks.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1">
                    Sample tasks:
                  </p>
                  <div className="max-h-32 overflow-y-auto rounded border divide-y">
                    {preview.previewTasks.map((t, i) => (
                      <div key={i} className="flex items-center gap-2 px-2 py-1 text-xs">
                        <span className="font-mono text-muted-foreground w-12">
                          {t.wbs ?? "—"}
                        </span>
                        <span className="flex-1 truncate">{t.name}</span>
                        {t.isMilestone && (
                          <span className="text-amber-600 text-[10px]">◆</span>
                        )}
                        <span className="text-muted-foreground">{t.duration}d</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {preview.warnings.length > 0 && (
                <div className="rounded border border-amber-300 bg-amber-50 dark:bg-amber-950/20 p-2 text-xs text-amber-700 dark:text-amber-400">
                  {preview.warnings.map((w, i) => (
                    <p key={i}>⚠ {w}</p>
                  ))}
                </div>
              )}
              <div className="space-y-2 border-t pt-3">
                <label className="flex items-center gap-2 text-xs">
                  <input
                    type="radio"
                    checked={mode === "merge"}
                    onChange={() => setMode("merge")}
                  />
                  <span>
                    <strong>Merge</strong> — add/update tasks from file; leave others untouched
                  </span>
                </label>
                <label className="flex items-center gap-2 text-xs">
                  <input
                    type="radio"
                    checked={mode === "replace"}
                    onChange={() => setMode("replace")}
                  />
                  <span className="text-red-600">
                    <strong>Replace</strong> — delete tasks not in the import file
                  </span>
                </label>
                <label className="flex items-center gap-2 text-xs">
                  <input
                    type="checkbox"
                    checked={updateExisting}
                    onChange={(e) => setUpdateExisting(e.target.checked)}
                  />
                  <span>Update existing tasks (matched by WBS code)</span>
                </label>
              </div>
            </div>
            <div className="border-t px-4 py-3 flex items-center justify-end gap-2">
              <button
                onClick={() => {
                  setShowModal(false);
                  setXmlContent(null);
                  setFileName("");
                }}
                className="rounded border px-3 py-1 text-xs hover:bg-muted"
              >
                Cancel
              </button>
              <button
                onClick={handleCommit}
                disabled={commitMut.isPending}
                className="rounded bg-amber-500 px-3 py-1 text-xs font-medium text-black hover:bg-amber-400 disabled:opacity-50"
              >
                {commitMut.isPending ? (
                  <>
                    <Loader2 className="inline h-3 w-3 mr-1 animate-spin" /> Importing…
                  </>
                ) : mode === "replace" ? (
                  "Replace Schedule"
                ) : (
                  "Import Tasks"
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Result modal */}
      {showModal && result && showResult && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="max-w-md w-full rounded-lg bg-card border border-border shadow-2xl">
            <div className="border-b px-4 py-3">
              <h3 className="text-sm font-semibold text-emerald-600">Import Successful</h3>
            </div>
            <div className="p-4 space-y-2 text-sm">
              <p>
                Imported <strong>{result.totalTasks}</strong> tasks from{" "}
                <strong>{result.projectName}</strong>
              </p>
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded border p-2 text-center">
                  <p className="text-lg font-bold text-emerald-600">{result.created}</p>
                  <p className="text-[10px] text-muted-foreground uppercase">Created</p>
                </div>
                <div className="rounded border p-2 text-center">
                  <p className="text-lg font-bold text-amber-600">{result.updated}</p>
                  <p className="text-[10px] text-muted-foreground uppercase">Updated</p>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                {result.dependenciesCreated} dependencies created
                {result.deleted > 0 && `, ${result.deleted} tasks deleted`}
              </p>
              {result.assignmentsCreated > 0 && (
                <p className="text-xs text-muted-foreground">
                  {result.assignmentsCreated} resource assignments created
                  {result.assignmentsSkipped > 0 &&
                    ` (${result.assignmentsSkipped} skipped — no matching staff)`}
                </p>
              )}
            </div>
            <div className="border-t px-4 py-3 flex justify-end">
              <button
                onClick={() => {
                  setShowModal(false);
                  setShowResult(false);
                  setXmlContent(null);
                  setFileName("");
                }}
                className="rounded bg-primary px-3 py-1 text-xs font-medium text-primary-foreground"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
