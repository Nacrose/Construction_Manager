import { describe, it, expect } from "vitest";
import { generateMSPXML, type MSPTask } from "./msp-export";
import { parseMSPXML } from "./msp-import";

describe("MS Project XML (MSPDI) Generator & Parser Engine", () => {
  describe("XML Structural & Schema Validity", () => {
    it("generates valid XML header, namespace, and root Project element", () => {
      const xml = generateMSPXML([], "Highway Package 1");
      expect(xml).toContain(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`);
      expect(xml).toContain(`<Project xmlns="http://schemas.microsoft.com/project"`);
      expect(xml).toContain(`<Name>Highway Package 1</Name>`);
      expect(xml).toContain(`</Project>`);
    });

    it("escapes special XML characters in task names, notes, and project titles", () => {
      const task: MSPTask = {
        id: "t_special",
        name: "Excavation & Shoring <Phase 1> & \"Subgrade\"",
        code: "1.1",
        startDate: new Date("2026-05-01T08:00:00.000Z"),
        endDate: new Date("2026-05-10T17:00:00.000Z"),
        duration: 9,
        progress: 0,
        parentId: null,
        isMilestone: false,
        sortOrder: 1,
        plannedCost: 50000,
        notes: "Danger: High voltage cables > 2m depth & 'fragile' water pipes",
        dependencies: [],
      };

      const xml = generateMSPXML([task], "Bridge & Culvert <PKG 02>");
      expect(xml).toContain("Bridge &amp; Culvert &lt;PKG 02&gt;");
      expect(xml).toContain("Excavation &amp; Shoring &lt;Phase 1&gt; &amp; &quot;Subgrade&quot;");
      expect(xml).toContain("Danger: High voltage cables &gt; 2m depth &amp; &apos;fragile&apos; water pipes");
    });
  });

  describe("Single Task Parameterized Matrix (50 distinct task configurations)", () => {
    const taskConfigs = Array.from({ length: 50 }, (_, i) => {
      const duration = (i % 20) + 1;
      const progress = (i * 2) % 100;
      const cost = (i + 1) * 25000;
      const isMilestone = i % 10 === 0;
      const priority = 100 + ((i * 18) % 900);
      return {
        id: `task_cfg_${i}`,
        name: `Construction Activity ${i + 1}`,
        code: `ACT.${i + 1}`,
        startDate: new Date(2026, 3, 1 + (i % 25)),
        endDate: new Date(2026, 3, 1 + (i % 25) + duration),
        duration: isMilestone ? 0 : duration,
        progress,
        parentId: null,
        isMilestone,
        sortOrder: i + 1,
        plannedCost: cost,
        priority,
        workHours: duration * 8,
        dependencies: [],
      };
    });

    it.each(taskConfigs)("generates correct MSPDI task element for $name (code $code)", (task) => {
      const xml = generateMSPXML([task], "Parametric Project");
      expect(xml).toContain(`<UID>1</UID>`);
      expect(xml).toContain(`<ID>1</ID>`);
      expect(xml).toContain(`<PercentComplete>${task.progress}</PercentComplete>`);
      expect(xml).toContain(`<Cost>${task.plannedCost.toFixed(2)}</Cost>`);
      expect(xml).toContain(`<Milestone>${task.isMilestone ? 1 : 0}</Milestone>`);
      expect(xml).toContain(`<OutlineLevel>1</OutlineLevel>`);
    });
  });

  describe("Hierarchical WBS Outline Tree Depth (40 hierarchy structures)", () => {
    const treeScenarios = Array.from({ length: 40 }, (_, idx) => {
      const depth = (idx % 5) + 2; // Depth 2 to 6
      const tasks: MSPTask[] = [];
      let parentId: string | null = null;

      for (let d = 1; d <= depth; d++) {
        const id = `t_tree_${idx}_lvl_${d}`;
        tasks.push({
          id,
          name: `Level ${d} Item`,
          code: `WBS.${idx}.${d}`,
          startDate: new Date(2026, 1, 1),
          endDate: new Date(2026, 1, 20),
          duration: 19,
          progress: 50,
          parentId,
          isMilestone: false,
          sortOrder: d,
          plannedCost: 100000 / d,
          dependencies: [],
        });
        parentId = id; // Child of previous
      }

      return {
        id: `tree_${idx}`,
        depth,
        tasks,
      };
    });

    it.each(treeScenarios)("generates correct outline levels 1 through $depth in scenario $id", ({ depth, tasks }) => {
      const xml = generateMSPXML(tasks, "WBS Project");
      for (let d = 1; d <= depth; d++) {
        expect(xml).toContain(`<OutlineLevel>${d}</OutlineLevel>`);
      }
    });
  });

  describe("Dependency Link Matrix (40 dependency combinations)", () => {
    const depTypes = ["FS", "SS", "FF", "SF"];
    const depScenarios = Array.from({ length: 40 }, (_, i) => {
      const type = depTypes[i % depTypes.length];
      const offset = (i % 15) - 3; // -3 to +11 lag/lead days
      return {
        id: `dep_${i}`,
        type,
        offset,
        expectedTypeStr: type === "FS" ? "1" : type === "SS" ? "3" : type === "FF" ? "0" : "2",
      };
    });

    it.each(depScenarios)("generates PredecessorLink element with Type=$type and offset=$offset in $id", ({ type, offset, expectedTypeStr }) => {
      const task1: MSPTask = {
        id: "pred_t1",
        name: "Substructure Complete",
        code: "PRED.01",
        startDate: new Date("2026-05-01"),
        endDate: new Date("2026-05-15"),
        duration: 14,
        progress: 100,
        parentId: null,
        isMilestone: false,
        sortOrder: 1,
        plannedCost: 200000,
        dependencies: [],
      };

      const task2: MSPTask = {
        id: "succ_t2",
        name: "Superstructure Girders",
        code: "SUCC.02",
        startDate: new Date("2026-05-16"),
        endDate: new Date("2026-05-30"),
        duration: 14,
        progress: 0,
        parentId: null,
        isMilestone: false,
        sortOrder: 2,
        plannedCost: 350000,
        dependencies: [
          { predecessorCode: "PRED.01", type, offset },
        ],
      };

      const xml = generateMSPXML([task1, task2], "Dependency Project");
      expect(xml).toContain("<PredecessorLink>");
      expect(xml).toContain("<PredecessorUID>1</PredecessorUID>");
      expect(xml).toContain(`<Type>${expectedTypeStr}</Type>`);
      if (offset !== 0) {
        expect(xml).toContain(`<LinkLag>${offset * 4800}</LinkLag>`);
      }
    });
  });

  describe("Constraint Type Code Mapping (16 scenarios)", () => {
    const constraints = [
      { type: "alap", code: 1 },
      { type: "snet", code: 4 },
      { type: "snlt", code: 5 },
      { type: "fnet", code: 6 },
      { type: "fnlt", code: 7 },
      { type: "mso", code: 2 },
      { type: "mfo", code: 3 },
    ];

    it.each(constraints)("maps non-asap constraint '$type' to MS Project numeric code $code", ({ type, code }) => {
      const task: MSPTask = {
        id: `c_${type}`,
        name: `Task with ${type}`,
        code: "C.1",
        startDate: new Date("2026-06-01T00:00:00"),
        endDate: new Date("2026-06-10T00:00:00"),
        duration: 9,
        progress: 0,
        parentId: null,
        isMilestone: false,
        sortOrder: 1,
        plannedCost: 50000,
        constraintType: type,
        constraintDate: new Date("2026-06-01T00:00:00"),
        dependencies: [],
      };

      const xml = generateMSPXML([task], "Constraint Project");
      expect(xml).toContain(`<ConstraintType>${code}</ConstraintType>`);
      expect(xml).toContain(`<ConstraintDate>2026-06-01T00:00:00</ConstraintDate>`);
    });

    it("defaults asap constraint to ConstraintType 0 without date", () => {
      const task: MSPTask = {
        id: "c_asap",
        name: "Task with ASAP",
        code: "C.ASAP",
        startDate: new Date("2026-06-01T00:00:00"),
        endDate: new Date("2026-06-10T00:00:00"),
        duration: 9,
        progress: 0,
        parentId: null,
        isMilestone: false,
        sortOrder: 1,
        plannedCost: 50000,
        constraintType: "asap",
        dependencies: [],
      };

      const xml = generateMSPXML([task], "Constraint Project");
      expect(xml).toContain("<ConstraintType>0</ConstraintType>");
    });
  });

  describe("Roundtrip Export and Import Verification (10 end-to-end projects)", () => {
    const roundtripProjects = Array.from({ length: 10 }, (_, i) => ({
      name: `Roundtrip Project Package ${i + 1}`,
      tasks: [
        {
          id: `rt_${i}_1`,
          name: "Site Survey and Setting Out",
          code: `RT.${i}.1`,
          startDate: new Date("2026-03-01T00:00:00.000Z"),
          endDate: new Date("2026-03-05T00:00:00.000Z"),
          duration: 4,
          progress: 100,
          parentId: null,
          isMilestone: false,
          sortOrder: 1,
          plannedCost: 50000,
          dependencies: [],
        },
        {
          id: `rt_${i}_2`,
          name: "Culvert Foundation Concrete",
          code: `RT.${i}.2`,
          startDate: new Date("2026-03-06T00:00:00.000Z"),
          endDate: new Date("2026-03-15T00:00:00.000Z"),
          duration: 9,
          progress: 50,
          parentId: null,
          isMilestone: false,
          sortOrder: 2,
          plannedCost: 150000,
          dependencies: [
            { predecessorCode: `RT.${i}.1`, type: "FS", offset: 1 },
          ],
        },
      ],
    }));

    it.each(roundtripProjects)("successfully exports and parses back $name", ({ name, tasks }) => {
      const xml = generateMSPXML(tasks, name);
      const parsed = parseMSPXML(xml);

      expect(parsed.projectName).toBe(name);
      expect(parsed.tasks.length).toBe(tasks.length);
      expect(parsed.tasks[0].name).toBe(tasks[0].name);
      expect(parsed.tasks[1].name).toBe(tasks[1].name);
      expect(parsed.tasks[0].progress).toBe(100);
      expect(parsed.tasks[1].progress).toBe(50);
      expect(parsed.tasks[1].predecessors.length).toBe(1);
      expect(parsed.tasks[1].predecessors[0].type).toBe("FS");
    });
  });
});
