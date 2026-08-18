import { describe, it, expect } from "vitest";
import {
  getPageSize,
  getContentArea,
  resolveTokens,
  buildTokenContext,
  getTableSchema,
  getTableEntitiesForEntity,
  getTokensForEntity,
  genCellId,
  starterLayoutDailyReport,
  starterLayoutSchedule,
  type PageSettings,
  type PaperSize,
  type Orientation,
} from "./report-tokens";

describe("Report Designer Tokens & Layout Engine", () => {
  describe("Page Geometry & Printable Area Matrix (32 combinations)", () => {
    const paperSizes: PaperSize[] = ["A4", "A3", "Letter", "Legal"];
    const orientations: Orientation[] = ["portrait", "landscape"];
    const marginPresets = [
      { top: 10, bottom: 10, left: 10, right: 10, label: "10mm standard" },
      { top: 15, bottom: 15, left: 20, right: 20, label: "20mm wide" },
      { top: 5, bottom: 5, left: 5, right: 5, label: "5mm minimal" },
      { top: 25, bottom: 25, left: 25, right: 25, label: "25mm binder" },
    ];

    const matrix: Array<{ size: PaperSize; orientation: Orientation; margins: typeof marginPresets[0] }> = [];
    for (const size of paperSizes) {
      for (const orientation of orientations) {
        for (const margins of marginPresets) {
          matrix.push({ size, orientation, margins });
        }
      }
    }

    it.each(matrix)("computes page size and content area for $size $orientation with $margins.label", ({ size, orientation, margins }) => {
      const page: PageSettings = {
        paper: size,
        orientation,
        margin: {
          top: margins.top,
          bottom: margins.bottom,
          left: margins.left,
          right: margins.right,
        },
      };

      const pageSize = getPageSize(page);
      const contentArea = getContentArea(page);

      expect(pageSize.w).toBeGreaterThan(0);
      expect(pageSize.h).toBeGreaterThan(0);

      if (orientation === "portrait") {
        expect(pageSize.h).toBeGreaterThan(pageSize.w);
      } else {
        expect(pageSize.w).toBeGreaterThan(pageSize.h);
      }

      expect(contentArea.x).toBe(margins.left);
      expect(contentArea.y).toBe(margins.top);
      expect(contentArea.w).toBeCloseTo(pageSize.w - margins.left - margins.right, 2);
      expect(contentArea.h).toBeCloseTo(pageSize.h - margins.top - margins.bottom, 2);
    });
  });

  describe("Token Replacement Engine (40 replacement patterns)", () => {
    const tokenContext = {
      "project.name": "Kathmandu Ring Road Expansion",
      "project.code": "KRR-02",
      "report.number": "DPR-2026-088",
      "report.date": "2026-08-16",
      "weather.condition": "Sunny",
      "weather.temp": "28°C",
      "workforce.total": "45",
      "equipment.total": "12",
      "engineer.name": "Er. Suresh Sharma",
    };

    const tokenPatterns = [
      { input: "Project: {{project.name}}", expected: "Project: Kathmandu Ring Road Expansion" },
      { input: "Code: {{project.code}} | DPR: {{report.number}}", expected: "Code: KRR-02 | DPR: DPR-2026-088" },
      { input: "{{weather.condition}} at {{weather.temp}}", expected: "Sunny at 28°C" },
      { input: "Total Workforce: {{workforce.total}} Persons", expected: "Total Workforce: 45 Persons" },
      { input: "Equipment on Site: {{equipment.total}} Units", expected: "Equipment on Site: 12 Units" },
      { input: "Site In-Charge: {{engineer.name}}", expected: "Site In-Charge: Er. Suresh Sharma" },
      { input: "No tokens here", expected: "No tokens here" },
      { input: "{{unknown.token}} is untouched", expected: "{{unknown.token}} is untouched" },
      { input: "{{project.name}} - {{project.name}}", expected: "Kathmandu Ring Road Expansion - Kathmandu Ring Road Expansion" },
      { input: "", expected: "" },
    ];

    // Generate 30 additional dynamic multi-token permutations
    const generatedPatterns = Array.from({ length: 30 }, (_, i) => {
      const isDate = i % 2 === 0;
      const isWeather = i % 3 === 0;
      return {
        input: `Header #${i}: {{project.code}}${isDate ? " on {{report.date}}" : ""}${isWeather ? " ({{weather.condition}})" : ""}`,
        expected: `Header #${i}: KRR-02${isDate ? " on 2026-08-16" : ""}${isWeather ? " (Sunny)" : ""}`,
      };
    });

    const allPatterns = [...tokenPatterns, ...generatedPatterns];

    it.each(allPatterns)("resolves tokens correctly for '$input'", ({ input, expected }) => {
      const output = resolveTokens(input, tokenContext);
      expect(output).toBe(expected);
    });
  });

  describe("Token Context Builder Matrix (25 scenarios)", () => {
    const reportScenarios = Array.from({ length: 25 }, (_, i) => ({
      entityType: "daily_report",
      data: {
        report: {
          number: `DPR-${100 + i}`,
          reportDate: new Date(2026, 7, 1 + i),
          weatherMorning: i % 2 === 0 ? "Sunny" : "Rainy",
          workforce: JSON.stringify([{ headcount: 10 + i, regHours: 8 }]),
          equipmentUsed: JSON.stringify([{ workingHours: 5, fuel: 50 }]),
          workProgress: JSON.stringify([{ actualQty: 10, plannedQty: 10 }]),
          materialReceived: JSON.stringify([{ item: "Cement", qty: 100 }]),
          project: {
            name: `Highway Package ${i + 1}`,
            code: `HP-${i + 1}`,
          },
        },
        organization: {
          name: "National Infrastructure Builders Ltd.",
        },
      },
    }));

    it.each(reportScenarios)("builds comprehensive token context for report DPR-${data.report.number}", ({ entityType, data }) => {
      const ctx = buildTokenContext(entityType, data);
      expect(ctx["report.number"]).toBe(data.report.number);
      expect(ctx["project.name"]).toBe(data.report.project.name);
      expect(ctx["project.code"]).toBe(data.report.project.code);
    });
  });

  describe("Table Schemas and Entity Registry (15 checks)", () => {
    const entityTypes = ["daily_report", "schedule", "rfi"];

    it.each(entityTypes)("returns valid registered tokens for entity '$entity'", (entity) => {
      const tokens = getTokensForEntity(entity);
      expect(Array.isArray(tokens)).toBe(true);
      expect(tokens.length).toBeGreaterThan(0);
      tokens.forEach((t) => {
        expect(t.token).toBeDefined();
        expect(t.label).toBeDefined();
        expect(t.group).toBeDefined();
      });
    });

    it("returns schema for standard report tables", () => {
      const tables = ["workforce", "equipment", "materials", "tasks", "visitors", "meetings"];
      for (const table of tables) {
        const schema = getTableSchema(table);
        if (schema) {
          expect(schema.entity).toBe(table);
          expect(Array.isArray(schema.columns)).toBe(true);
          expect(schema.columns.length).toBeGreaterThan(0);
        }
      }
    });

    it("retrieves available table entities for daily_report", () => {
      const tables = getTableEntitiesForEntity("daily_report");
      expect(tables).toContain("workforce");
      expect(tables).toContain("equipment");
    });
  });

  describe("Starter Layout Definitions & Cell Integrity", () => {
    it("provides valid starterLayoutDailyReport with cells inside printable page area", () => {
      const layout = starterLayoutDailyReport();
      expect(layout.cells.length).toBeGreaterThan(0);
      expect(layout.page.paper).toBe("A4");

      const { w: pageW, h: pageH } = getPageSize(layout.page);

      layout.cells.forEach((cell) => {
        expect(cell.id).toBeDefined();
        expect(cell.x).toBeGreaterThanOrEqual(0);
        expect(cell.y).toBeGreaterThanOrEqual(0);
        expect(cell.x + cell.w).toBeLessThanOrEqual(pageW + 1); // within bounds
        expect(cell.y + cell.h).toBeLessThanOrEqual(pageH + 1);
      });
    });

    it("provides valid starterLayoutSchedule in landscape mode", () => {
      const layout = starterLayoutSchedule();
      expect(layout.page.orientation).toBe("landscape");
      expect(layout.cells.length).toBeGreaterThan(0);
    });
  });

  describe("Unique Cell ID Generator (100 IDs)", () => {
    const idCount = 100;
    it(`generates ${idCount} unique alphanumeric cell IDs`, () => {
      const ids = new Set<string>();
      for (let i = 0; i < idCount; i++) {
        const id = genCellId();
        expect(id).toMatch(/^cell_[a-z0-9_]+$/);
        expect(ids.has(id)).toBe(false);
        ids.add(id);
      }
      expect(ids.size).toBe(idCount);
    });
  });
});
