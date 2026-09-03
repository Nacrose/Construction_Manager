import { describe, expect, it } from "vitest";
import {
  createDemoWorkbook,
  createDemoWorksheetDocument,
} from "./demo-workbook";
import { WORKSHEET_DOCUMENT_VERSION } from "./types";

describe("generic worksheet demo", () => {
  it("creates a versioned standalone document", () => {
    const document = createDemoWorksheetDocument(new Date("2026-09-03T00:00:00.000Z"));

    expect(document.version).toBe(WORKSHEET_DOCUMENT_VERSION);
    expect(document.scope).toEqual({ kind: "standalone" });
    expect(document.updatedAt).toBe("2026-09-03T00:00:00.000Z");
  });

  it("contains generic multi-sheet and cross-sheet formulas", () => {
    const workbook = createDemoWorkbook();
    const quantityAbstractCells = workbook.sheets["quantity-abstract"].cellData!;
    const calculationCells = workbook.sheets.calculation.cellData!;
    const summaryCells = workbook.sheets.summary.cellData!;

    expect(workbook.sheetOrder).toEqual([
      "measurements",
      "quantity-abstract",
      "calculation",
      "summary",
    ]);
    expect(quantityAbstractCells[4]?.[5]?.f).toBe("=SUM(Measurements!H5:H34)");
    expect(quantityAbstractCells[9]?.[5]?.f).toBe("=SUM(Measurements!H155:H184)");
    expect(quantityAbstractCells[10]?.[5]?.f).toBe("=SUM(F5:F10)");
    expect(calculationCells[3]?.[1]?.f).toBe("='Quantity Abstract'!F11");
    expect(summaryCells[3]?.[1]?.f).toBe("=Calculation!B4");
  });

  it("ships enough rows to exercise dense office worksheets", () => {
    const workbook = createDemoWorkbook();
    const measurementCells = workbook.sheets.measurements.cellData!;
    const populatedRows = Object.keys(measurementCells).map(Number);

    expect(Math.max(...populatedRows)).toBeGreaterThanOrEqual(183);
    expect(measurementCells[183]?.[7]?.f).toBe("=D184*E184*F184*G184");
    expect(workbook.sheets.measurements.freeze?.ySplit).toBe(4);
  });
});
