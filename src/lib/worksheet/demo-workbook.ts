import type {
  ICellData,
  IObjectMatrixPrimitiveType,
  IStyleData,
  IWorkbookData,
} from "@univerjs/presets";
import {
  WORKSHEET_DOCUMENT_VERSION,
  type WorksheetDocument,
} from "./types";

export const WORKSHEET_LAB_DOCUMENT_ID = "worksheet-lab-generic-v2";

const APP_VERSION = "0.25.1";
const MEASUREMENT_ROWS = 180;
const MEASUREMENT_GROUPS = 6;
const ROWS_PER_GROUP = MEASUREMENT_ROWS / MEASUREMENT_GROUPS;

const styles: Record<string, IStyleData> = {
  title: {
    fs: 13,
    bl: 1,
    bg: { rgb: "#E8D8BE" },
    cl: { rgb: "#3B2F23" },
    vt: 2,
  },
  header: {
    bl: 1,
    bg: { rgb: "#F2E8D8" },
    cl: { rgb: "#493B2E" },
    ht: 2,
    vt: 2,
    tb: 3,
  },
  section: {
    bl: 1,
    bg: { rgb: "#F7F0E6" },
    cl: { rgb: "#765C39" },
  },
  input: {
    bg: { rgb: "#FFFDF8" },
    n: { pattern: "0.000" },
  },
  quantity: {
    bg: { rgb: "#F4F8F1" },
    cl: { rgb: "#315D35" },
    n: { pattern: "0.000" },
  },
  money: {
    n: { pattern: "#,##0.00" },
  },
  total: {
    bl: 1,
    bg: { rgb: "#E8D8BE" },
    n: { pattern: "#,##0.00" },
  },
  note: {
    cl: { rgb: "#6F6256" },
    fs: 9,
  },
};

function put(
  matrix: IObjectMatrixPrimitiveType<ICellData>,
  row: number,
  column: number,
  cell: ICellData
) {
  matrix[row] ??= {};
  matrix[row][column] = cell;
}

function createMeasurementCells(): IObjectMatrixPrimitiveType<ICellData> {
  const cells: IObjectMatrixPrimitiveType<ICellData> = {};

  put(cells, 0, 0, { v: "GENERIC MEASUREMENT WORKSHEET", s: "title" });
  put(cells, 1, 0, {
    v: "A neutral calculation surface: rename sheets and columns for a building, road, bridge, or any other contract.",
    s: "note",
  });

  const headers = [
    "Ref",
    "Description",
    "Unit",
    "Count",
    "Length",
    "Width",
    "Depth / Height",
    "Quantity",
    "Rate",
    "Amount",
    "Notes",
  ];
  headers.forEach((header, column) =>
    put(cells, 3, column, { v: header, s: "header" })
  );

  for (let index = 0; index < MEASUREMENT_ROWS; index += 1) {
    const row = index + 4;
    const excelRow = row + 1;
    const group = Math.floor(index / 30) + 1;
    const item = (index % 30) + 1;
    const count = (index % 4) + 1;
    const length = 1.25 + (index % 11) * 0.35;
    const width = 0.45 + (index % 7) * 0.12;
    const depth = 0.2 + (index % 5) * 0.08;
    const rate = 125 + (index % 13) * 42.5;

    put(cells, row, 0, { v: `G${group}-${String(item).padStart(2, "0")}` });
    put(cells, row, 1, { v: `Measured item ${item}` });
    put(cells, row, 2, { v: "unit" });
    put(cells, row, 3, { v: count, s: "input" });
    put(cells, row, 4, { v: length, s: "input" });
    put(cells, row, 5, { v: width, s: "input" });
    put(cells, row, 6, { v: depth, s: "input" });
    put(cells, row, 7, {
      f: `=D${excelRow}*E${excelRow}*F${excelRow}*G${excelRow}`,
      s: "quantity",
    });
    put(cells, row, 8, { v: rate, s: "money" });
    put(cells, row, 9, { f: `=H${excelRow}*I${excelRow}`, s: "money" });
    put(cells, row, 10, { v: index % 9 === 0 ? "Check dimensions" : "" });
  }

  return cells;
}

function createCalculationCells(): IObjectMatrixPrimitiveType<ICellData> {
  const cells: IObjectMatrixPrimitiveType<ICellData> = {};
  const lastMeasurementRow = MEASUREMENT_ROWS + 4;

  put(cells, 0, 0, { v: "CALCULATION SHEET", s: "title" });
  put(cells, 2, 0, { v: "Calculation", s: "header" });
  put(cells, 2, 1, { v: "Value", s: "header" });
  put(cells, 2, 2, { v: "Purpose", s: "header" });

  const rows: Array<[string, string, string, string?]> = [
    [
      "Measured quantity",
      "='Quantity Abstract'!F11",
      "Current quantity from the generated abstract",
      "quantity",
    ],
    [
      "Measured amount",
      `=SUM(Measurements!J5:J${lastMeasurementRow})`,
      "Cross-sheet amount total",
      "money",
    ],
    ["Adjustment factor", "=1.05", "Editable example multiplier", "quantity"],
    ["Adjusted amount", "=B5*B6", "Formula using cells on this sheet", "money"],
    ["Rounded value", "=ROUND(B7,2)", "Standard formula-library example", "money"],
    ["Average item value", `=AVERAGE(Measurements!J5:J${lastMeasurementRow})`, "Aggregate example", "money"],
    ["Largest item value", `=MAX(Measurements!J5:J${lastMeasurementRow})`, "Aggregate example", "money"],
    ["Items measured", `=COUNT(Measurements!H5:H${lastMeasurementRow})`, "Count example"],
  ];

  rows.forEach(([label, formula, purpose, style], index) => {
    const row = index + 3;
    put(cells, row, 0, { v: label });
    put(cells, row, 1, { f: formula, s: style });
    put(cells, row, 2, { v: purpose, s: "note" });
  });

  return cells;
}

function createQuantityAbstractCells(): IObjectMatrixPrimitiveType<ICellData> {
  const cells: IObjectMatrixPrimitiveType<ICellData> = {};

  put(cells, 0, 0, { v: "ABSTRACT OF QUANTITY", s: "title" });
  put(cells, 1, 0, {
    v: "Generated bridge between detailed measurement sheets and the bill. Previous quantities will come from approved earlier IPCs when this workspace is connected to a project.",
    s: "note",
  });

  const headers = [
    "BOQ Ref",
    "Description",
    "Unit",
    "Contract Qty",
    "Previous Qty",
    "This Measurement",
    "Up-to-date Qty",
    "Balance Qty",
    "Measurement Source",
  ];
  headers.forEach((header, column) =>
    put(cells, 3, column, { v: header, s: "header" })
  );

  for (let index = 0; index < MEASUREMENT_GROUPS; index += 1) {
    const row = index + 4;
    const excelRow = row + 1;
    const measurementStart = 5 + index * ROWS_PER_GROUP;
    const measurementEnd = measurementStart + ROWS_PER_GROUP - 1;
    const group = index + 1;

    put(cells, row, 0, { v: `G${group}` });
    put(cells, row, 1, { v: `Generic work group ${group}` });
    put(cells, row, 2, { v: "unit" });
    put(cells, row, 3, { v: 500 + index * 125, s: "input" });
    put(cells, row, 4, { v: 0, s: "quantity" });
    put(cells, row, 5, {
      f: `=SUM(Measurements!H${measurementStart}:H${measurementEnd})`,
      s: "quantity",
    });
    put(cells, row, 6, { f: `=E${excelRow}+F${excelRow}`, s: "quantity" });
    put(cells, row, 7, { f: `=D${excelRow}-G${excelRow}`, s: "quantity" });
    put(cells, row, 8, {
      v: `Measurements!A${measurementStart}:H${measurementEnd}`,
      s: "note",
    });
  }

  const totalRow = 10;
  put(cells, totalRow, 0, { v: "TOTAL", s: "total" });
  for (let column = 3; column <= 7; column += 1) {
    const letter = String.fromCharCode(65 + column);
    put(cells, totalRow, column, {
      f: `=SUM(${letter}5:${letter}10)`,
      s: column === 3 ? "total" : "quantity",
    });
  }
  put(cells, 12, 0, { v: "Integration rule", s: "section" });
  put(cells, 13, 0, {
    v: "IPC 1: Previous Qty = 0. IPC 2 onward: Previous Qty is read-only and derived from the cumulative quantities in approved earlier IPCs. The workbook never asks the user to retype it.",
    s: "note",
  });

  return cells;
}

function createSummaryCells(): IObjectMatrixPrimitiveType<ICellData> {
  const cells: IObjectMatrixPrimitiveType<ICellData> = {};

  put(cells, 0, 0, { v: "WORKBOOK SUMMARY", s: "title" });
  put(cells, 2, 0, { v: "Metric", s: "header" });
  put(cells, 2, 1, { v: "Result", s: "header" });
  put(cells, 2, 2, { v: "Notes", s: "header" });

  put(cells, 3, 0, { v: "Total quantity" });
  put(cells, 3, 1, { f: "=Calculation!B4", s: "quantity" });
  put(cells, 3, 2, { v: "Linked from Calculation" });
  put(cells, 4, 0, { v: "Adjusted amount" });
  put(cells, 4, 1, { f: "=Calculation!B7", s: "money" });
  put(cells, 4, 2, { v: "Linked from Calculation" });
  put(cells, 6, 0, { v: "Notes", s: "section" });
  put(cells, 7, 0, {
    v: "This lab deliberately avoids fixed IPC sections. A future document template may add Cover, Summary, BOQ Abstract, Measurement Abstract, or contract-specific sheets only when needed.",
    s: "note",
  });

  return cells;
}

export function createDemoWorkbook(): IWorkbookData {
  return {
    id: WORKSHEET_LAB_DOCUMENT_ID,
    name: "Generic Worksheet Laboratory",
    appVersion: APP_VERSION,
    locale: "enUS" as IWorkbookData["locale"],
    styles,
    sheetOrder: ["measurements", "quantity-abstract", "calculation", "summary"],
    sheets: {
      measurements: {
        id: "measurements",
        name: "Measurements",
        rowCount: 500,
        columnCount: 24,
        freeze: { xSplit: 0, ySplit: 4, startRow: 4, startColumn: 0 },
        cellData: createMeasurementCells(),
        rowData: { 0: { h: 30 }, 1: { h: 28 }, 3: { h: 34 } },
        columnData: {
          0: { w: 86 },
          1: { w: 220 },
          2: { w: 70 },
          3: { w: 72 },
          4: { w: 80 },
          5: { w: 80 },
          6: { w: 104 },
          7: { w: 96 },
          8: { w: 92 },
          9: { w: 112 },
          10: { w: 180 },
        },
        mergeData: [
          { startRow: 0, endRow: 0, startColumn: 0, endColumn: 10 },
          { startRow: 1, endRow: 1, startColumn: 0, endColumn: 10 },
        ],
        defaultColumnWidth: 88,
        defaultRowHeight: 24,
      },
      "quantity-abstract": {
        id: "quantity-abstract",
        name: "Quantity Abstract",
        rowCount: 240,
        columnCount: 18,
        freeze: { xSplit: 3, ySplit: 4, startRow: 4, startColumn: 3 },
        cellData: createQuantityAbstractCells(),
        rowData: { 0: { h: 30 }, 1: { h: 36 }, 3: { h: 38 }, 13: { h: 48 } },
        columnData: {
          0: { w: 86 },
          1: { w: 230 },
          2: { w: 70 },
          3: { w: 104 },
          4: { w: 104 },
          5: { w: 124 },
          6: { w: 112 },
          7: { w: 104 },
          8: { w: 230 },
        },
        mergeData: [
          { startRow: 0, endRow: 0, startColumn: 0, endColumn: 8 },
          { startRow: 1, endRow: 1, startColumn: 0, endColumn: 8 },
          { startRow: 13, endRow: 13, startColumn: 0, endColumn: 8 },
        ],
        defaultColumnWidth: 90,
        defaultRowHeight: 24,
      },
      calculation: {
        id: "calculation",
        name: "Calculation",
        rowCount: 200,
        columnCount: 16,
        freeze: { xSplit: 0, ySplit: 3, startRow: 3, startColumn: 0 },
        cellData: createCalculationCells(),
        rowData: { 0: { h: 30 }, 2: { h: 30 } },
        columnData: { 0: { w: 210 }, 1: { w: 150 }, 2: { w: 300 } },
        mergeData: [{ startRow: 0, endRow: 0, startColumn: 0, endColumn: 2 }],
        defaultColumnWidth: 90,
        defaultRowHeight: 24,
      },
      summary: {
        id: "summary",
        name: "Summary",
        rowCount: 120,
        columnCount: 14,
        freeze: { xSplit: 0, ySplit: 3, startRow: 3, startColumn: 0 },
        cellData: createSummaryCells(),
        rowData: { 0: { h: 30 }, 2: { h: 30 }, 7: { h: 52 } },
        columnData: { 0: { w: 210 }, 1: { w: 150 }, 2: { w: 460 } },
        mergeData: [{ startRow: 0, endRow: 0, startColumn: 0, endColumn: 2 }],
        defaultColumnWidth: 90,
        defaultRowHeight: 24,
      },
    },
  };
}

export function createDemoWorksheetDocument(now = new Date()): WorksheetDocument {
  return {
    version: WORKSHEET_DOCUMENT_VERSION,
    documentId: WORKSHEET_LAB_DOCUMENT_ID,
    title: "Generic Worksheet Laboratory",
    updatedAt: now.toISOString(),
    scope: { kind: "standalone" },
    workbook: createDemoWorkbook(),
  };
}

export type IpcWorksheetItem = {
  code: string;
  description: string;
  unit: string;
  contractQty: number;
  previousQty: number;
  rate: number;
};

type IpcWorksheetSeed = {
  projectId: string;
  ipcId: string;
  ipcNumber: string;
  projectName: string;
  items: IpcWorksheetItem[];
};

function createIpcCoverCells(seed: IpcWorksheetSeed): IObjectMatrixPrimitiveType<ICellData> {
  const cells: IObjectMatrixPrimitiveType<ICellData> = {};
  put(cells, 0, 0, { v: "INTERIM PAYMENT CERTIFICATE — WORKING PAPERS", s: "title" });
  put(cells, 2, 0, { v: "Project", s: "header" });
  put(cells, 2, 1, { v: seed.projectName });
  put(cells, 3, 0, { v: "Certificate", s: "header" });
  put(cells, 3, 1, { v: seed.ipcNumber });
  put(cells, 4, 0, { v: "Workbook rule", s: "header" });
  put(cells, 4, 1, { v: "Add or rename detailed measurement sheets as needed. The four standard sheets remain the common bill bridge.", s: "note" });
  put(cells, 6, 0, { v: "This bill quantity", s: "header" });
  put(cells, 6, 1, { f: "=SUM('Measurement Abstract'!E5:E204)", s: "quantity" });
  put(cells, 7, 0, { v: "This bill amount", s: "header" });
  put(cells, 7, 1, { f: "=SUM('BOQ Abstract'!J5:J204)", s: "money" });
  return cells;
}

function createIpcBoqAbstractCells(seed: IpcWorksheetSeed): IObjectMatrixPrimitiveType<ICellData> {
  const cells: IObjectMatrixPrimitiveType<ICellData> = {};
  put(cells, 0, 0, { v: "BOQ ABSTRACT", s: "title" });
  put(cells, 1, 0, { v: "Previous quantity is supplied from the IPC register. This bill quantity is read from the measurement abstract; do not type it here.", s: "note" });
  const headers = ["BOQ Ref", "Description", "Unit", "Contract Qty", "Previous Qty", "This Bill", "Up-to-date Qty", "Balance Qty", "Rate", "This Amount"];
  headers.forEach((header, column) => put(cells, 3, column, { v: header, s: "header" }));
  seed.items.forEach((item, index) => {
    const row = index + 4;
    const excelRow = row + 1;
    put(cells, row, 0, { v: item.code });
    put(cells, row, 1, { v: item.description });
    put(cells, row, 2, { v: item.unit });
    put(cells, row, 3, { v: item.contractQty, s: "input" });
    put(cells, row, 4, { v: item.previousQty, s: "quantity" });
    put(cells, row, 5, { f: `='Measurement Abstract'!E${excelRow}`, s: "quantity" });
    put(cells, row, 6, { f: `=E${excelRow}+F${excelRow}`, s: "quantity" });
    put(cells, row, 7, { f: `=D${excelRow}-G${excelRow}`, s: "quantity" });
    put(cells, row, 8, { v: item.rate, s: "money" });
    put(cells, row, 9, { f: `=F${excelRow}*I${excelRow}`, s: "money" });
  });
  const totalRow = Math.max(seed.items.length + 4, 5);
  put(cells, totalRow, 0, { v: "TOTAL", s: "total" });
  [3, 4, 5, 6, 7, 9].forEach((column) => {
    const letter = String.fromCharCode(65 + column);
    put(cells, totalRow, column, { f: `=SUM(${letter}5:${letter}${totalRow})`, s: column === 9 ? "total" : "quantity" });
  });
  return cells;
}

function createIpcMeasurementAbstractCells(seed: IpcWorksheetSeed): IObjectMatrixPrimitiveType<ICellData> {
  const cells: IObjectMatrixPrimitiveType<ICellData> = {};
  put(cells, 0, 0, { v: "MEASUREMENT ABSTRACT", s: "title" });
  put(cells, 1, 0, { v: "Rows calculate themselves from every detailed measurement sheet row bearing the same BOQ reference.", s: "note" });
  const headers = ["BOQ Ref", "Description", "Unit", "Previous Qty", "This Measurement", "Up-to-date Qty", "Measurement Source"];
  headers.forEach((header, column) => put(cells, 3, column, { v: header, s: "header" }));
  seed.items.forEach((item, index) => {
    const row = index + 4;
    const excelRow = row + 1;
    put(cells, row, 0, { v: item.code });
    put(cells, row, 1, { v: item.description });
    put(cells, row, 2, { v: item.unit });
    put(cells, row, 3, { f: `='BOQ Abstract'!E${excelRow}`, s: "quantity" });
    put(cells, row, 4, { f: `=SUMIF(Measurements!A$5:A$204,A${excelRow},Measurements!I$5:I$204)`, s: "quantity" });
    put(cells, row, 5, { f: `=D${excelRow}+E${excelRow}`, s: "quantity" });
    put(cells, row, 6, { v: "Measurements!A:I", s: "note" });
  });
  return cells;
}

function createIpcMeasurementsCells(): IObjectMatrixPrimitiveType<ICellData> {
  const cells: IObjectMatrixPrimitiveType<ICellData> = {};
  put(cells, 0, 0, { v: "MEASUREMENTS", s: "title" });
  put(cells, 1, 0, { v: "Enter detailed dimensions here. To add another measurement sheet use the + beside the sheet tabs, then use the same BOQ Ref and Quantity column convention.", s: "note" });
  const headers = ["BOQ Ref", "Reference", "Description", "Unit", "Nos", "Length", "Width", "Depth / Height", "Quantity", "Remarks"];
  headers.forEach((header, column) => put(cells, 3, column, { v: header, s: "header" }));
  for (let index = 0; index < 200; index += 1) {
    const row = index + 4;
    const excelRow = row + 1;
    put(cells, row, 8, { f: `=E${excelRow}*F${excelRow}*G${excelRow}*H${excelRow}`, s: "quantity" });
  }
  return cells;
}

export function createIpcWorksheetDocument(seed: IpcWorksheetSeed, now = new Date()): WorksheetDocument {
  const documentId = `ipc:${seed.ipcId}:worksheet`;
  const baseSheet = {
    rowCount: 240,
    columnCount: 18,
    defaultColumnWidth: 90,
    defaultRowHeight: 24,
  };
  const measurementColumns = { 0: { w: 90 }, 1: { w: 120 }, 2: { w: 220 }, 3: { w: 70 }, 4: { w: 70 }, 5: { w: 82 }, 6: { w: 82 }, 7: { w: 110 }, 8: { w: 100 }, 9: { w: 180 } };
  return {
    version: WORKSHEET_DOCUMENT_VERSION,
    documentId,
    title: `${seed.ipcNumber} Working Papers`,
    updatedAt: now.toISOString(),
    scope: { kind: "ipc", projectId: seed.projectId, ipcId: seed.ipcId },
    workbook: {
      id: documentId,
      name: `${seed.ipcNumber} Working Papers`,
      appVersion: APP_VERSION,
      locale: "enUS" as IWorkbookData["locale"],
      styles,
      sheetOrder: ["cover", "boq-abstract", "measurement-abstract", "measurements"],
      sheets: {
        cover: { ...baseSheet, id: "cover", name: "Cover", cellData: createIpcCoverCells(seed), rowData: { 0: { h: 30 }, 4: { h: 44 } }, columnData: { 0: { w: 180 }, 1: { w: 560 } }, mergeData: [{ startRow: 0, endRow: 0, startColumn: 0, endColumn: 6 }, { startRow: 4, endRow: 4, startColumn: 1, endColumn: 6 }] },
        "boq-abstract": { ...baseSheet, id: "boq-abstract", name: "BOQ Abstract", cellData: createIpcBoqAbstractCells(seed), freeze: { xSplit: 3, ySplit: 4, startRow: 4, startColumn: 3 }, rowData: { 0: { h: 30 }, 1: { h: 36 }, 3: { h: 34 } }, columnData: { 0: { w: 84 }, 1: { w: 250 }, 2: { w: 64 }, 3: { w: 96 }, 4: { w: 96 }, 5: { w: 96 }, 6: { w: 106 }, 7: { w: 96 }, 8: { w: 96 }, 9: { w: 112 } }, mergeData: [{ startRow: 0, endRow: 0, startColumn: 0, endColumn: 9 }, { startRow: 1, endRow: 1, startColumn: 0, endColumn: 9 }] },
        "measurement-abstract": { ...baseSheet, id: "measurement-abstract", name: "Measurement Abstract", cellData: createIpcMeasurementAbstractCells(seed), freeze: { xSplit: 3, ySplit: 4, startRow: 4, startColumn: 3 }, rowData: { 0: { h: 30 }, 1: { h: 36 }, 3: { h: 34 } }, columnData: { 0: { w: 84 }, 1: { w: 250 }, 2: { w: 64 }, 3: { w: 96 }, 4: { w: 116 }, 5: { w: 106 }, 6: { w: 180 } }, mergeData: [{ startRow: 0, endRow: 0, startColumn: 0, endColumn: 6 }, { startRow: 1, endRow: 1, startColumn: 0, endColumn: 6 }] },
        measurements: { ...baseSheet, id: "measurements", name: "Measurements", cellData: createIpcMeasurementsCells(), freeze: { xSplit: 0, ySplit: 4, startRow: 4, startColumn: 0 }, rowData: { 0: { h: 30 }, 1: { h: 38 }, 3: { h: 34 } }, columnData: measurementColumns, mergeData: [{ startRow: 0, endRow: 0, startColumn: 0, endColumn: 9 }, { startRow: 1, endRow: 1, startColumn: 0, endColumn: 9 }] },
      },
    },
  };
}
