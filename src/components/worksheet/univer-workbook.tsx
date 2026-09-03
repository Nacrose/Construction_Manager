"use client";

import { useEffect, useRef } from "react";
import {
  createUniver,
  LocaleType,
  mergeLocales,
  type IWorkbookData,
} from "@univerjs/presets";
import { UniverSheetsCorePreset } from "@univerjs/preset-sheets-core";
import sheetsCoreEnUS from "@univerjs/preset-sheets-core/locales/en-US";
import "@univerjs/preset-sheets-core/lib/index.css";

interface UniverWorkbookProps {
  workbook: IWorkbookData;
  onSnapshotChange: (workbook: IWorkbookData) => void | Promise<void>;
  onReady?: () => void;
  onError?: (error: Error) => void;
}

const SAVE_DELAY_MS = 650;

export function UniverWorkbook({
  workbook,
  onSnapshotChange,
  onReady,
  onError,
}: UniverWorkbookProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const onSnapshotChangeRef = useRef(onSnapshotChange);
  const onReadyRef = useRef(onReady);
  const onErrorRef = useRef(onError);

  useEffect(() => {
    onSnapshotChangeRef.current = onSnapshotChange;
    onReadyRef.current = onReady;
    onErrorRef.current = onError;
  }, [onSnapshotChange, onReady, onError]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let saveTimer: ReturnType<typeof setTimeout> | undefined;
    const mountNode = document.createElement("div");
    mountNode.style.width = "100%";
    mountNode.style.height = "100%";
    mountNode.style.minHeight = "0";
    container.appendChild(mountNode);

    try {
      const { univer, univerAPI } = createUniver({
        locale: LocaleType.EN_US,
        locales: {
          [LocaleType.EN_US]: mergeLocales(sheetsCoreEnUS),
        },
        presets: [
          UniverSheetsCorePreset({
            container: mountNode,
            header: true,
            toolbar: true,
            ribbonType: "simple",
            formulaBar: true,
            footer: {
              sheetBar: true,
              statisticBar: true,
              menus: true,
              zoomSlider: true,
            },
            contextMenu: true,
          }),
        ],
      });

      const activeWorkbook = univerAPI.createWorkbook(workbook);
      const commandSubscription = univerAPI.addEvent(
        univerAPI.Event.CommandExecuted,
        () => {
          if (saveTimer) clearTimeout(saveTimer);
          saveTimer = setTimeout(() => {
            Promise.resolve(onSnapshotChangeRef.current(activeWorkbook.save())).catch(
              (reason: unknown) => {
                onErrorRef.current?.(
                  reason instanceof Error ? reason : new Error("Could not save worksheet")
                );
              }
            );
          }, SAVE_DELAY_MS);
        }
      );

      onReadyRef.current?.();

      return () => {
        if (saveTimer) clearTimeout(saveTimer);
        commandSubscription.dispose();
        // Univer owns an internal React root. Disposing it synchronously while
        // the host React tree is committing triggers a React 19 warning.
        setTimeout(() => {
          univer.dispose();
          mountNode.remove();
        }, 0);
      };
    } catch (reason) {
      mountNode.remove();
      onErrorRef.current?.(
        reason instanceof Error ? reason : new Error("Could not start worksheet engine")
      );
    }
  }, [workbook]);

  return (
    <div
      ref={containerRef}
      className="h-full min-h-0 w-full overflow-hidden bg-white"
      aria-label="Spreadsheet workspace"
    />
  );
}
