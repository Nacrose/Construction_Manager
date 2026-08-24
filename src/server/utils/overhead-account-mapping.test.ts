/**
 * Unit tests for the overhead account-code mapping helpers.
 *
 * Covers the fix for audit issue #8 (site expense journal entries ignore
 * the actual expense category — hardcoded to "6006"). These tests pin
 * the mapping so a regression would be caught immediately.
 */
import { describe, it, expect } from "vitest";
import {
  siteOverheadCodeForCategory,
  hoOverheadCodeForCategory,
  accountNameForCode,
} from "./overhead-account-mapping";

describe("Overhead Account Mapping", () => {
  describe("siteOverheadCodeForCategory", () => {
    it("maps rent → 6001 (Site Overhead - Rent)", () => {
      expect(siteOverheadCodeForCategory("rent")).toBe("6001");
    });

    it("maps utility / utilities → 6002 (Site Overhead - Utilities)", () => {
      expect(siteOverheadCodeForCategory("utility")).toBe("6002");
      expect(siteOverheadCodeForCategory("utilities")).toBe("6002");
    });

    it("maps fuel / vehicle → 6003 (Site Overhead - Fuel & Vehicle)", () => {
      expect(siteOverheadCodeForCategory("fuel")).toBe("6003");
      expect(siteOverheadCodeForCategory("vehicle")).toBe("6003");
    });

    it("maps food / mess / accommodation → 6004 (Site Overhead - Food & Mess)", () => {
      expect(siteOverheadCodeForCategory("food")).toBe("6004");
      expect(siteOverheadCodeForCategory("mess")).toBe("6004");
      expect(siteOverheadCodeForCategory("accommodation")).toBe("6004");
    });

    it("maps safety → 6005 (Site Overhead - Safety Equipment)", () => {
      expect(siteOverheadCodeForCategory("safety")).toBe("6005");
    });

    it("maps misc / general / other / unknown → 6006 (Site Overhead - Misc)", () => {
      expect(siteOverheadCodeForCategory("misc")).toBe("6006");
      expect(siteOverheadCodeForCategory("general")).toBe("6006");
      expect(siteOverheadCodeForCategory("other")).toBe("6006");
      // Unknown categories fall back to Misc — preserves the previous
      // behavior for any category string not in the lookup table.
      expect(siteOverheadCodeForCategory("unknown-category")).toBe("6006");
    });

    it("is case-insensitive and trims whitespace", () => {
      expect(siteOverheadCodeForCategory("Rent")).toBe("6001");
      expect(siteOverheadCodeForCategory("  RENT  ")).toBe("6001");
      expect(siteOverheadCodeForCategory("Food")).toBe("6004");
    });

    it("returns 6006 for null / undefined / empty string", () => {
      expect(siteOverheadCodeForCategory(null)).toBe("6006");
      expect(siteOverheadCodeForCategory(undefined)).toBe("6006");
      expect(siteOverheadCodeForCategory("")).toBe("6006");
      expect(siteOverheadCodeForCategory("   ")).toBe("6006");
    });

    it("regression: no longer always returns 6006 for non-misc categories", () => {
      // This is the test that would have caught the original bug —
      // every site expense ledgered as 6006 regardless of category.
      // Now rent → 6001, fuel → 6003, etc.
      expect(siteOverheadCodeForCategory("rent")).not.toBe("6006");
      expect(siteOverheadCodeForCategory("fuel")).not.toBe("6006");
      expect(siteOverheadCodeForCategory("safety")).not.toBe("6006");
    });
  });

  describe("hoOverheadCodeForCategory", () => {
    it("maps rent → 6100 (Head Office - Rent)", () => {
      expect(hoOverheadCodeForCategory("rent")).toBe("6100");
    });

    it("maps utility / utilities → 6102 (Head Office - Utilities)", () => {
      expect(hoOverheadCodeForCategory("utility")).toBe("6102");
      expect(hoOverheadCodeForCategory("utilities")).toBe("6102");
    });

    it("maps fuel / vehicle → 6103 (Head Office - Vehicle/Fuel)", () => {
      expect(hoOverheadCodeForCategory("fuel")).toBe("6103");
      expect(hoOverheadCodeForCategory("vehicle")).toBe("6103");
    });

    it("maps other categories → 6199 (Head Office - Misc fallback)", () => {
      expect(hoOverheadCodeForCategory("food")).toBe("6199");
      expect(hoOverheadCodeForCategory("safety")).toBe("6199");
      expect(hoOverheadCodeForCategory("misc")).toBe("6199");
      expect(hoOverheadCodeForCategory("unknown")).toBe("6199");
    });

    it("is case-insensitive and handles null", () => {
      expect(hoOverheadCodeForCategory("RENT")).toBe("6100");
      expect(hoOverheadCodeForCategory(null)).toBe("6199");
      expect(hoOverheadCodeForCategory(undefined)).toBe("6199");
      expect(hoOverheadCodeForCategory("")).toBe("6199");
    });
  });

  describe("accountNameForCode", () => {
    it("returns the account name for a known code", () => {
      expect(accountNameForCode("6001")).toBe("Site Overhead - Rent");
      expect(accountNameForCode("6006")).toBe("Site Overhead - Misc");
      expect(accountNameForCode("6100")).toBe("Head Office - Rent");
    });

    it("returns null for an unknown code", () => {
      expect(accountNameForCode("9999")).toBeNull();
      expect(accountNameForCode("")).toBeNull();
    });
  });
});
