"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useState } from "react";
import { FileSpreadsheet, FlaskConical, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  createDemoWorksheetDocument,
  WORKSHEET_LAB_DOCUMENT_ID,
} from "@/lib/worksheet/demo-workbook";
import { LocalWorksheetDocumentStore } from "@/lib/worksheet/local-storage-store";
import type { WorksheetDocument } from "@/lib/worksheet/types";
import type { IWorkbookData } from "@univerjs/presets";

const UniverWorkbook = dynamic(
  () => import("./univer-workbook").then((module) => module.UniverWorkbook),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full items-center justify-center bg-[#fbf8f2] text-xs text-[#74685d]">
        Loading worksheet engine…
      </div>
    ),
  }
);

type SaveState = "loading" | "ready" | "saving" | "saved" | "error";

const SAVE_LABELS: Record<SaveState, string> = {
  loading: "Opening local draft…",
  ready: "Ready",
  saving: "Saving locally…",
  saved: "Saved locally",
  error: "Local save failed",
};

export function WorksheetWorkspace() {
  const [document, setDocument] = useState<WorksheetDocument | null>(null);
  const [engineKey, setEngineKey] = useState(0);
  const [saveState, setSaveState] = useState<SaveState>("loading");

  const store = useMemo(() => {
    if (typeof window === "undefined") return null;
    return new LocalWorksheetDocumentStore(window.localStorage);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function openDocument() {
      if (!store) return;
      const stored = await store.load(WORKSHEET_LAB_DOCUMENT_ID);
      if (cancelled) return;
      setDocument(stored ?? createDemoWorksheetDocument());
      setSaveState(stored ? "saved" : "ready");
    }

    void openDocument();
    return () => {
      cancelled = true;
    };
  }, [store]);

  const saveSnapshot = useCallback(
    async (workbook: IWorkbookData) => {
      if (!document || !store) return;
      setSaveState("saving");
      const nextDocument: WorksheetDocument = {
        ...document,
        updatedAt: new Date().toISOString(),
        workbook,
      };

      try {
        await store.save(nextDocument);
        setSaveState("saved");
      } catch {
        setSaveState("error");
      }
    },
    [document, store]
  );

  const resetDemo = useCallback(async () => {
    if (!store) return;
    await store.remove(WORKSHEET_LAB_DOCUMENT_ID);
    setDocument(createDemoWorksheetDocument());
    setEngineKey((current) => current + 1);
    setSaveState("ready");
  }, [store]);

  return (
    <section className="flex h-[calc(100vh-7.75rem)] min-h-[620px] flex-col overflow-hidden rounded-[6px] border border-[#c8bda9] bg-[#f5efe5] shadow-[0_12px_30px_rgba(68,52,34,0.12)]">
      <header className="flex min-h-12 shrink-0 items-center justify-between gap-3 border-b border-[#d8cdbb] bg-[#f4eadb] px-3 py-2 text-[#42372d]">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="flex size-7 shrink-0 items-center justify-center rounded-[4px] border border-[#bda98a] bg-[#fffaf1] shadow-[0_2px_4px_rgba(70,50,26,0.16)]">
            <FileSpreadsheet className="size-4 text-[#7c6038]" />
          </span>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="truncate text-sm font-semibold">Worksheet Laboratory</h1>
              <span className="hidden rounded-full border border-[#c9b99f] bg-[#fffaf1] px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.12em] text-[#725b3d] sm:inline-flex">
                Isolated
              </span>
            </div>
            <p className="truncate text-[10px] text-[#776b5f]">
              Generic multi-sheet engine · right-click cells for contextual actions
            </p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <span
            className={`hidden text-[10px] sm:inline ${
              saveState === "error" ? "text-red-700" : "text-[#776b5f]"
            }`}
            aria-live="polite"
          >
            {SAVE_LABELS[saveState]}
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void resetDemo()}
            disabled={!document || saveState === "loading"}
            className="border-[#bda98a] bg-[#fffaf1] text-[#59452d] hover:border-[#96764b] hover:bg-[#f8ead4] hover:text-[#3f3020]"
          >
            <RotateCcw className="size-3.5" />
            Reset demo
          </Button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col bg-white">
        {document ? (
          <UniverWorkbook
            key={engineKey}
            workbook={document.workbook}
            onSnapshotChange={saveSnapshot}
            onReady={() => setSaveState((state) => (state === "loading" ? "ready" : state))}
            onError={() => setSaveState("error")}
          />
        ) : (
          <div className="flex h-full items-center justify-center bg-[#fbf8f2] text-xs text-[#74685d]">
            <FlaskConical className="mr-2 size-4" /> Opening worksheet laboratory…
          </div>
        )}
      </div>
    </section>
  );
}
