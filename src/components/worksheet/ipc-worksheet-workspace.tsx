"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowLeft, FileSpreadsheet, Save } from "lucide-react";
import { trpc } from "@/lib/trpc-client";
import {
  createIpcWorksheetDocument,
  type IpcWorksheetItem,
} from "@/lib/worksheet/demo-workbook";
import { isWorksheetDocument, type WorksheetDocument } from "@/lib/worksheet/types";
import type { IWorkbookData } from "@univerjs/presets";

const UniverWorkbook = dynamic(
  () => import("./univer-workbook").then((module) => module.UniverWorkbook),
  { ssr: false, loading: () => <div className="flex h-full items-center justify-center bg-[#fbf8f2] text-xs text-[#74685d]">Opening workbook…</div> }
);

type SaveState = "loading" | "ready" | "saving" | "saved" | "error";

export function IpcWorksheetWorkspace({ projectId, ipcId }: { projectId: string; ipcId: string }) {
  const documentKey = `ipc:${ipcId}:worksheet`;
  const [saveState, setSaveState] = useState<SaveState>("loading");
  const { data: saved, isLoading: loadingSaved } = trpc.worksheet.get.useQuery({ projectId, documentKey });
  const { data: ipcData, isLoading: loadingIpc } = trpc.ipc.listItems.useQuery({ ipcId });
  const { data: projectInfo } = trpc.project.get.useQuery({ id: projectId }, { staleTime: 300_000 });
  const save = trpc.worksheet.save.useMutation({
    onSuccess: () => setSaveState("saved"),
    onError: () => setSaveState("error"),
  });

  const document = useMemo<WorksheetDocument | null>(() => {
    const stored = saved?.document;
    if (stored) {
      const candidate = {
        version: 1,
        documentId: stored.documentKey,
        title: stored.title,
        updatedAt: stored.updatedAt.toISOString(),
        scope: stored.scope,
        workbook: stored.workbook,
      };
      if (isWorksheetDocument(candidate)) return candidate;
    }
    if (!ipcData) return null;
    const items: IpcWorksheetItem[] = ipcData.items.map((item) => ({
      code: item.boqCode || item.id,
      description: item.description,
      unit: item.unit,
      contractQty: Number(item.contractQty),
      previousQty: Number(item.previousQty),
      rate: Number(item.rate),
    }));
    return createIpcWorksheetDocument({
      projectId,
      ipcId,
      ipcNumber: ipcData.ipc.number,
      projectName: projectInfo?.project?.name || "Project",
      items,
    });
  }, [ipcData, ipcId, projectId, projectInfo?.project?.name, saved?.document]);

  const saveSnapshot = (workbook: IWorkbookData) => {
    if (!document) return;
    setSaveState("saving");
    save.mutate({
      projectId,
      documentKey,
      title: document.title,
      scope: { kind: "ipc", projectId, ipcId },
      workbook,
    });
  };

  const stateLabel = saveState === "saving" ? "Saving…" : saveState === "saved" ? "Saved" : saveState === "error" ? "Save failed" : "Ready";

  return (
    <section className="flex h-[calc(100vh-5.6rem)] min-h-[620px] flex-col overflow-hidden border border-[#c8bda9] bg-[#f5efe5] shadow-[0_12px_30px_rgba(68,52,34,0.12)]">
      <header className="flex min-h-12 shrink-0 items-center justify-between gap-3 border-b border-[#d8cdbb] bg-[#f4eadb] px-3 py-2 text-[#42372d]">
        <div className="flex min-w-0 items-center gap-2.5">
          <Link href={`/projects/${projectId}/ipc/${ipcId}`} className="rounded p-1 text-[#725b3d] hover:bg-[#eadcc7]" title="Back to certificate"><ArrowLeft className="size-4" /></Link>
          <span className="flex size-7 shrink-0 items-center justify-center rounded-[4px] border border-[#bda98a] bg-[#fffaf1] shadow-[0_2px_4px_rgba(70,50,26,0.16)]"><FileSpreadsheet className="size-4 text-[#7c6038]" /></span>
          <div className="min-w-0">
            <h1 className="truncate text-sm font-semibold">IPC working papers</h1>
            <p className="truncate text-[10px] text-[#776b5f]">Cover · BOQ Abstract · Measurement Abstract · detailed measurement sheets</p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2 text-[10px] text-[#776b5f]" aria-live="polite">
          <Save className="size-3.5" /> {stateLabel}
        </div>
      </header>
      <div className="min-h-0 flex-1 bg-white">
        {loadingSaved || loadingIpc || !document ? (
          <div className="flex h-full items-center justify-center text-xs text-[#74685d]">Opening workbook…</div>
        ) : (
          <UniverWorkbook workbook={document.workbook} onSnapshotChange={saveSnapshot} onReady={() => setSaveState("ready")} onError={() => setSaveState("error")} />
        )}
      </div>
    </section>
  );
}
