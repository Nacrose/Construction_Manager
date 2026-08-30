import { describe, it, expect } from "vitest";
import {
  isModuleEnabled,
  parseEnabledModules,
  buildPresetModules,
  MODULE_DEFINITIONS,
  groupModules,
  PRESET_METADATA,
} from "./project-modules";

describe("Project Modules System (11 Core Pillars & 3 Universal Presets)", () => {
  it("should have all 11 non-negotiable core pillars marked as core", () => {
    const coreKeys = MODULE_DEFINITIONS.filter((m) => m.core).map((m) => m.key);
    expect(coreKeys).toContain("dashboard");
    expect(coreKeys).toContain("boq");
    expect(coreKeys).toContain("accounting");
    expect(coreKeys).toContain("payments");
    expect(coreKeys).toContain("materials");
    expect(coreKeys).toContain("subcontractors");
    expect(coreKeys).toContain("vat");
    expect(coreKeys).toContain("guarantees");
    expect(coreKeys).toContain("correspondence");
    expect(coreKeys).toContain("drawings");
    expect(coreKeys).toContain("documents");
    expect(coreKeys.length).toBe(11);
  });

  it("core modules should ALWAYS be enabled regardless of settings map", () => {
    const disabledSettings = {
      dashboard: false,
      boq: false,
      accounting: false,
      payments: false,
      materials: false,
      subcontractors: false,
      vat: false,
      guarantees: false,
      correspondence: false,
      drawings: false,
      documents: false,
      purchaseOrders: false,
      gantt: false,
    };
    expect(isModuleEnabled(disabledSettings, "dashboard")).toBe(true);
    expect(isModuleEnabled(disabledSettings, "boq")).toBe(true);
    expect(isModuleEnabled(disabledSettings, "accounting")).toBe(true);
    expect(isModuleEnabled(disabledSettings, "payments")).toBe(true);
    expect(isModuleEnabled(disabledSettings, "materials")).toBe(true);
    expect(isModuleEnabled(disabledSettings, "subcontractors")).toBe(true);
    expect(isModuleEnabled(disabledSettings, "vat")).toBe(true);
    expect(isModuleEnabled(disabledSettings, "guarantees")).toBe(true);
    expect(isModuleEnabled(disabledSettings, "correspondence")).toBe(true);
    expect(isModuleEnabled(disabledSettings, "drawings")).toBe(true);
    expect(isModuleEnabled(disabledSettings, "documents")).toBe(true);

    // Non-core modules CAN be disabled
    expect(isModuleEnabled(disabledSettings, "purchaseOrders")).toBe(false);
    expect(isModuleEnabled(disabledSettings, "gantt")).toBe(false);
  });

  it("missing keys should default to enabled (backward compatibility)", () => {
    const emptySettings = {};
    expect(isModuleEnabled(emptySettings, "materials")).toBe(true);
    expect(isModuleEnabled(null, "materials")).toBe(true);
    expect(isModuleEnabled(undefined, "materials")).toBe(true);
  });

  it("should correctly build the 3 scale presets", () => {
    // 1. Pure Record-Keeper Preset
    const recordKeeper = buildPresetModules("record_keeper");
    expect(recordKeeper.gantt).toBe(false);
    expect(recordKeeper.purchaseOrders).toBe(false);
    expect(recordKeeper.requisitions).toBe(false);
    expect(recordKeeper.production).toBe(false);
    expect(recordKeeper.submittals).toBe(false);
    expect(recordKeeper.ipc).toBe(false);
    expect(recordKeeper.variations).toBe(false);
    expect(recordKeeper.hr).toBe(false);
    // Enabled in Record Keeper:
    expect(isModuleEnabled(recordKeeper, "equipment")).toBe(true);
    expect(isModuleEnabled(recordKeeper, "accounting")).toBe(true);
    expect(isModuleEnabled(recordKeeper, "materials")).toBe(true);

    // 2. Lean Builder Preset
    const lean = buildPresetModules("lean");
    expect(isModuleEnabled(lean, "dailyProgramme")).toBe(true);
    expect(isModuleEnabled(lean, "punchList")).toBe(true);
    expect(isModuleEnabled(lean, "equipment")).toBe(true);
    expect(lean.gantt).toBe(false);
    expect(lean.purchaseOrders).toBe(false);

    // 3. Full Enterprise Preset
    const enterprise = buildPresetModules("enterprise");
    expect(Object.keys(enterprise).length).toBe(0); // none disabled
    expect(isModuleEnabled(enterprise, "gantt")).toBe(true);
    expect(isModuleEnabled(enterprise, "purchaseOrders")).toBe(true);
    expect(isModuleEnabled(enterprise, "ipc")).toBe(true);
    expect(isModuleEnabled(enterprise, "production")).toBe(true);
  });

  it("should provide valid PRESET_METADATA", () => {
    expect(PRESET_METADATA.record_keeper.title).toBe("Pure Record-Keeper");
    expect(PRESET_METADATA.lean.title).toBe("Lean Site Builder");
    expect(PRESET_METADATA.enterprise.title).toBe("Full Enterprise & JV");
  });

  it("should correctly parse raw JSON from prisma", () => {
    expect(parseEnabledModules(null)).toEqual({});
    expect(parseEnabledModules(undefined)).toEqual({});
    expect(parseEnabledModules('{"rfi":false}')).toEqual({ rfi: false });
    expect(parseEnabledModules({ rfi: false })).toEqual({ rfi: false });
    expect(parseEnabledModules("invalid json")).toEqual({});
  });

  it("should group modules correctly", () => {
    const groups = groupModules();
    expect(groups.has("Core")).toBe(true);
    expect(groups.has("Contract Management")).toBe(true);
    expect(groups.has("Procurement")).toBe(true);
    expect(groups.has("Site Management")).toBe(true);
    expect(groups.has("Compliance")).toBe(true);
    expect(groups.has("Advanced")).toBe(true);
  });
});
