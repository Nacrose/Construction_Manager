import { describe, it, expect } from "vitest";
import {
  METHOD_CAPABILITY_DEFAULTS,
  OPERATING_METHODS,
  describeCapabilityShortfall,
  methodDefaults,
  operatingMethodSchema,
  parseCapabilities,
  resolveCapabilityMap,
  type OperatingCapabilities,
} from "./capabilities";

const DELEGATED: OperatingCapabilities = METHOD_CAPABILITY_DEFAULTS.delegated;

describe("capabilities — Operating Method & Capability Model (ADR-0004)", () => {
  describe("vocabulary", () => {
    it("exposes exactly three operating methods", () => {
      expect(OPERATING_METHODS).toEqual(["owner_led", "crew_led", "delegated"]);
      for (const method of OPERATING_METHODS) {
        expect(operatingMethodSchema.safeParse(method).success).toBe(true);
      }
      expect(operatingMethodSchema.safeParse("hybrid_workshop_model").success).toBe(false);
    });
  });

  describe("methodDefaults", () => {
    it("returns the owner_led defaults literally specified by ADR-0004 §4", () => {
      expect(methodDefaults("owner_led")).toEqual({
        procurementChain: "none",
        inventoryControl: "none",
        gateRegister: false,
        financeReview: "owner_recorded",
        directPurchase: true,
        directExpense: true,
        workforcePlanning: true,
      });
    });

    it("escalates workflow depth owner_led → crew_led → delegated", () => {
      expect(methodDefaults("crew_led").procurementChain).toBe("quotes");
      expect(methodDefaults("crew_led").inventoryControl).toBe("basic");
      expect(methodDefaults("delegated").procurementChain).toBe("full");
      expect(methodDefaults("delegated").inventoryControl).toBe("controlled");
      expect(methodDefaults("delegated").gateRegister).toBe(true);
      expect(methodDefaults("delegated").financeReview).toBe("delegated_review");
    });

    it("fails loud on unknown methods (no silent degradation)", () => {
      expect(() => methodDefaults("single_project_jv")).toThrow(/Unknown operating method/);
      expect(() => methodDefaults("")).toThrow(/Unknown operating method/);
    });
  });

  describe("parseCapabilities", () => {
    it("accepts a valid map", () => {
      expect(parseCapabilities(DELEGATED)).toEqual(DELEGATED);
    });

    it("rejects unknown enum values, wrong types and missing fields", () => {
      expect(() => parseCapabilities({ ...DELEGATED, procurementChain: "maybe" })).toThrow(/procurementChain/);
      expect(() => parseCapabilities({ ...DELEGATED, gateRegister: "yes" })).toThrow(/gateRegister/);
      // Deliberately incomplete payload — a required key is missing.
      const incomplete: Partial<OperatingCapabilities> = { ...DELEGATED };
      delete incomplete.procurementChain;
      expect(() => parseCapabilities(incomplete)).toThrow(/Invalid capabilities payload/);
    });

    it("rejects null/undefined/non-object payloads", () => {
      expect(() => parseCapabilities(null)).toThrow(/Invalid capabilities payload/);
      expect(() => parseCapabilities(undefined)).toThrow(/Invalid capabilities payload/);
      expect(() => parseCapabilities("full")).toThrow(/Invalid capabilities payload/);
    });
  });

  describe("resolveCapabilityMap", () => {
    it("method defaults pass through untouched without overrides", () => {
      expect(resolveCapabilityMap("owner_led")).toEqual(METHOD_CAPABILITY_DEFAULTS.owner_led);
    });

    it("overrides layer on top of the target method's defaults", () => {
      const map = resolveCapabilityMap("owner_led", { procurementChain: "full", gateRegister: true });
      expect(map.procurementChain).toBe("full");
      expect(map.gateRegister).toBe(true);
      // untouched axes keep the method default
      expect(map.inventoryControl).toBe("none");
      expect(map.financeReview).toBe("owner_recorded");
    });
  });

  describe("describeCapabilityShortfall", () => {
    it("returns null when every requirement is met", () => {
      expect(
        describeCapabilityShortfall(DELEGATED, {
          procurementChain: "full",
          inventoryControl: "controlled",
          gateRegister: true,
          financeReview: "delegated_review",
          directPurchase: true,
          directExpense: true,
          workforcePlanning: true,
        })
      ).toBeNull();
    });

    it("returns null with no requirements", () => {
      expect(describeCapabilityShortfall(METHOD_CAPABILITY_DEFAULTS.owner_led, {})).toBeNull();
    });

    it("uses at-least semantics on the procurement ladder (quotes ≤ full)", () => {
      const caps = { ...DELEGATED, procurementChain: "quotes" as const };
      expect(describeCapabilityShortfall(caps, { procurementChain: "quotes" })).toBeNull();
      const shortfall = describeCapabilityShortfall(caps, { procurementChain: "full" });
      expect(shortfall?.capability).toBe("procurementChain");
      expect(shortfall?.current).toBe("quotes");
      expect(shortfall?.required).toBe("full");
      expect(shortfall?.message).toMatch(/procurementChain/);
    });

    it("blocks the whole chain under none (owner_led: PRs/POs/quotes do not exist)", () => {
      const caps = METHOD_CAPABILITY_DEFAULTS.owner_led;
      expect(describeCapabilityShortfall(caps, { procurementChain: "quotes" })?.capability).toBe("procurementChain");
      expect(describeCapabilityShortfall(caps, { procurementChain: "full" })?.capability).toBe("procurementChain");
    });

    it("uses at-least semantics on the inventory ladder (basic ≤ controlled)", () => {
      const caps = { ...DELEGATED, inventoryControl: "basic" as const };
      expect(describeCapabilityShortfall(caps, { inventoryControl: "basic" })).toBeNull();
      expect(describeCapabilityShortfall(caps, { inventoryControl: "controlled" })?.capability).toBe("inventoryControl");
      expect(describeCapabilityShortfall(caps, { inventoryControl: "none" as never })).toBeNull();
    });

    it("requires boolean capabilities to be exactly true", () => {
      const caps = METHOD_CAPABILITY_DEFAULTS.owner_led;
      expect(describeCapabilityShortfall(caps, { gateRegister: true })?.capability).toBe("gateRegister");
      expect(describeCapabilityShortfall(caps, { directExpense: true })).toBeNull();
      expect(describeCapabilityShortfall(caps, { workforcePlanning: true })).toBeNull();
    });

    it("reports shortfalls in a deterministic field order", () => {
      const caps = METHOD_CAPABILITY_DEFAULTS.owner_led;
      const first = describeCapabilityShortfall(caps, {
        directExpense: true,
        procurementChain: "full",
        inventoryControl: "controlled",
      });
      // procurementChain is declared before inventoryControl and the
      // boolean axes in the check order — the FIRST unmet one wins.
      expect(first?.capability).toBe("procurementChain");
    });
  });
});
