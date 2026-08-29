import { describe, it, expect } from "vitest";
import { formatNpr, amountInWords } from "./currency";

describe("Central South Asian / Nepali Currency Engine", () => {
  describe("formatNpr", () => {
    it("formats standard NPR amounts with South Asian comma grouping (2,2,3)", () => {
      expect(formatNpr(12345678.5)).toBe("1,23,45,678.50");
      expect(formatNpr(12345678.5, { prefix: "NPR" })).toBe("NPR 1,23,45,678.50");
      expect(formatNpr(12345678.5, { prefix: "Rs." })).toBe("Rs. 1,23,45,678.50");
    });

    it("supports 0 decimals for whole amount displays", () => {
      expect(formatNpr(5420000, { decimals: 0, prefix: "NPR" })).toBe("NPR 54,20,000");
    });

    it("supports compact notations (Cr, L, k)", () => {
      expect(formatNpr(25000000, { compact: true, decimals: 1, prefix: "NPR" })).toBe("NPR 2.5 Cr");
      expect(formatNpr(450000, { compact: true, decimals: 1, prefix: "Rs." })).toBe("Rs. 4.5 L");
      expect(formatNpr(12500, { compact: true, decimals: 0 })).toBe("13 k");
    });

    it("handles negative numbers and signs correctly", () => {
      expect(formatNpr(-5000, { prefix: "NPR" })).toBe("-NPR 5,000.00");
      expect(formatNpr(5000, { showSign: true, prefix: "NPR" })).toBe("+NPR 5,000.00");
    });
  });

  describe("amountInWords", () => {
    it("converts amounts to English words (Rupees & Paisa)", () => {
      expect(amountInWords(100)).toBe("One Hundred Rupees Only.");
      expect(amountInWords(1250)).toBe("One Thousand Two Hundred Fifty Rupees Only.");
      expect(amountInWords(12345678.50)).toBe(
        "One Crore Twenty Three Lakh Forty Five Thousand Six Hundred Seventy Eight Rupees and Fifty Paisa Only."
      );
    });

    it("converts amounts to Nepali Devanagari words (अक्षरूपी)", () => {
      expect(amountInWords(100, "np")).toBe("एक सय रुपैयाँ मात्र।");
      expect(amountInWords(1250, "np")).toBe("एक हजार दुई सय पचास रुपैयाँ मात्र।");
      expect(amountInWords(12345678.50, "np")).toBe(
        "एक करोड तेइस लाख पैंतालीस हजार छ सय अठहत्तर रुपैयाँ पचास पैसा मात्र।"
      );
    });

    it("handles 0 amount edge cases", () => {
      expect(amountInWords(0, "en")).toBe("Zero Rupees Only.");
      expect(amountInWords(0, "np")).toBe("शून्य रुपैयाँ मात्र।");
    });
  });
});
