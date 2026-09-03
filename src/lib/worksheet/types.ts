import type { IWorkbookData } from "@univerjs/presets";

export const WORKSHEET_DOCUMENT_VERSION = 1 as const;

export type WorksheetScope =
  | { kind: "standalone" }
  | { kind: "ipc"; projectId: string; ipcId: string }
  | { kind: "variation"; projectId: string; variationId: string };

export interface WorksheetDocument {
  version: typeof WORKSHEET_DOCUMENT_VERSION;
  documentId: string;
  title: string;
  updatedAt: string;
  scope: WorksheetScope;
  workbook: IWorkbookData;
}

/**
 * Storage boundary for the worksheet engine. The lab uses browser storage;
 * project modules can later provide a server-backed implementation.
 */
export interface WorksheetDocumentStore {
  load(documentId: string): Promise<WorksheetDocument | null>;
  save(document: WorksheetDocument): Promise<void>;
  remove(documentId: string): Promise<void>;
}

export interface WorksheetCellContext {
  documentId: string;
  sheetId: string;
  row: number;
  column: number;
}

/**
 * Future domain modules can supply actions such as "Link to BOQ item" without
 * putting IPC- or Variation-specific behavior inside the spreadsheet engine.
 */
export interface WorksheetContextAction {
  id: string;
  label: string;
  isAvailable?: (context: WorksheetCellContext) => boolean;
  run: (context: WorksheetCellContext) => void | Promise<void>;
}

export interface WorksheetIntegrationAdapter {
  scope: WorksheetScope;
  store: WorksheetDocumentStore;
  contextActions?: readonly WorksheetContextAction[];
  onCommit?: (document: WorksheetDocument) => void | Promise<void>;
}

export function isWorksheetDocument(value: unknown): value is WorksheetDocument {
  if (!value || typeof value !== "object") return false;

  const candidate = value as Partial<WorksheetDocument>;
  const workbook = candidate.workbook as Partial<IWorkbookData> | undefined;

  return (
    candidate.version === WORKSHEET_DOCUMENT_VERSION &&
    typeof candidate.documentId === "string" &&
    typeof candidate.title === "string" &&
    typeof candidate.updatedAt === "string" &&
    !!candidate.scope &&
    typeof candidate.scope === "object" &&
    !!workbook &&
    typeof workbook.id === "string" &&
    typeof workbook.name === "string" &&
    Array.isArray(workbook.sheetOrder) &&
    !!workbook.sheets &&
    typeof workbook.sheets === "object"
  );
}
