import { describe, it, expect } from "vitest";
import {
  isModuleEnabled,
  parseEnabledModules,
  buildPresetModules,
  MODULE_DEFINITIONS,
  groupModules,
} from "./project-modules";

describe("Project Modules System", () => {
  it("should have all expected core modules marked as core", () => {
    const coreKeys = MODULE_DEFINITIONS.filter((m) => m.core).map((m) => m.key);
    expect(coreKeys).toContain("dashboard");
    expect(coreKeys).toContain("boq");
    expect(coreKeys).toContain("payments");
  });

  it("core modules should always be enabled regardless of settings", () => {
    const disabledSettings = {
      dashboard: false,
      boq: false,
      payments: false,
      purchaseOrders: false,
    };
    expect(isModuleEnabled(disabledSettings, "dashboard")).toBe(true);
    expect(isModuleEnabled(disabledSettings, "boq")).toBe(true);
    expect(isModuleEnabled(disabledSettings, "payments")).toBe(true);
    expect(isModuleEnabled(disabledSettings, "purchaseOrders")).toBe(false);
  });

  it("missing keys should default to enabled (backward compatibility)", () => {
    const emptySettings = {};
    expect(isModuleEnabled(emptySettings, "materials")).toBe(true);
    expect(isModuleEnabled(null, "materials")).toBe(true);
    expect(isModuleEnabled(undefined, "materials")).toBe(true);
  });

  it("should correctly build presets", () => {
    const simple = buildPresetModules("simple");
    expect(simple.purchaseOrders).toBe(false);
    expect(simple.rfi).toBe(false);
    expect(simple.dailyProgramme).toBe(false);
    expect(simple.subcontractors).toBe(false);
    // enabled in simple:
    expect(isModuleEnabled(simple, "materials")).toBe(true);
    expect(isModuleEnabled(simple, "gantt")).toBe(true);
    expect(isModuleEnabled(simple, "hr")).toBe(true);

    const standard = buildPresetModules("standard");
    expect(isModuleEnabled(standard, "subcontractors")).toBe(true);
    expect(isModuleEnabled(standard, "ipc")).toBe(true);
    expect(isModuleEnabled(standard, "variations")).toBe(true);
    expect(standard.purchaseOrders).toBe(false);
    expect(standard.rfi).toBe(false);

    const full = buildPresetModules("full");
    expect(Object.keys(full).length).toBe(0); // none disabled
    expect(isModuleEnabled(full, "purchaseOrders")).toBe(true);
    expect(isModuleEnabled(full, "rfi")).toBe(true);
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
