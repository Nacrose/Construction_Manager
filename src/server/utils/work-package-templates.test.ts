import { describe, it, expect } from "vitest";
import { BUILT_IN_TEMPLATES } from "./work-package-templates";

describe("Work Package Templates Library", () => {
  it("should contain standard civil engineering templates", () => {
    expect(BUILT_IN_TEMPLATES.length).toBeGreaterThanOrEqual(8);
    const boxCulvert = BUILT_IN_TEMPLATES.find((t) => t.id === "builtin-dor-box-culvert-2cell");
    expect(boxCulvert).toBeDefined();
    expect(boxCulvert?.subtasks.length).toBe(8);
    expect(boxCulvert?.totalDurationDays).toBe(33);
  });

  it("should have valid dependency references in each template", () => {
    for (const template of BUILT_IN_TEMPLATES) {
      const validTempIds = new Set(template.subtasks.map((st) => st.tempId));
      for (const st of template.subtasks) {
        if (st.predecessorTempIds) {
          for (const pred of st.predecessorTempIds) {
            expect(validTempIds.has(pred.tempId)).toBe(true);
            expect(["FS", "SS", "FF", "SF"]).toContain(pred.type);
          }
        }
      }
    }
  });

  it("should have mandatory curing elapsed lag on concrete elements", () => {
    const boxCulvert = BUILT_IN_TEMPLATES.find((t) => t.id === "builtin-dor-box-culvert-2cell");
    const curingTask = boxCulvert?.subtasks.find((st) => st.taskType === "elapsed_curing");
    expect(curingTask).toBeDefined();
    expect(curingTask?.duration).toBeGreaterThanOrEqual(7);
  });

  it("should have 24/7 continuous drilling on bored pile template", () => {
    const pile = BUILT_IN_TEMPLATES.find((t) => t.id === "builtin-bored-pile-group");
    const continuousTask = pile?.subtasks.find((st) => st.taskType === "continuous_24_7");
    expect(continuousTask).toBeDefined();
    expect(continuousTask?.duration).toBe(6);
  });
});
