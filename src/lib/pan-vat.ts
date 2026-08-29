/**
 * Nepal Inland Revenue Department (IRD) PAN / VAT Number Validator & Formatter
 *
 * Validates 9-digit Permanent Account Numbers (PAN / VAT) used across Nepal.
 */

export type PanEntityType = "corporate" | "proprietorship" | "individual" | "government" | "unknown";

export type PanValidationResult = {
  isValid: boolean;
  cleanPan: string;
  formattedPan: string;
  entityType: PanEntityType;
  error?: string;
};

/**
 * Validate and parse a Nepal PAN/VAT Number
 */
export function validateNepalPan(input?: string | number | null): PanValidationResult {
  if (!input) {
    return {
      isValid: false,
      cleanPan: "",
      formattedPan: "",
      entityType: "unknown",
      error: "PAN number is required.",
    };
  }

  const clean = String(input).replace(/[^0-9]/g, "");

  if (clean.length !== 9) {
    return {
      isValid: false,
      cleanPan: clean,
      formattedPan: clean,
      entityType: "unknown",
      error: `PAN must be exactly 9 digits (found ${clean.length} digits).`,
    };
  }

  // Detect Entity Type based on IRD prefix conventions:
  // 1: Government / Semi-Govt Bodies
  // 2: Diplomatic / Missions
  // 3: Proprietorship / Individual Businesses
  // 6: Private Limited / Public Limited / JV Corporate Entities
  let entityType: PanEntityType = "unknown";
  const firstDigit = clean[0];
  if (firstDigit === "6") {
    entityType = "corporate";
  } else if (firstDigit === "3") {
    entityType = "proprietorship";
  } else if (firstDigit === "1") {
    entityType = "government";
  } else {
    entityType = "individual";
  }

  // Formatted as XXX-XXX-XXX
  const formatted = `${clean.slice(0, 3)}-${clean.slice(3, 6)}-${clean.slice(6, 9)}`;

  return {
    isValid: true,
    cleanPan: clean,
    formattedPan: formatted,
    entityType,
  };
}

/**
 * Format PAN with standard hyphen delimiters (XXX-XXX-XXX)
 */
export function formatPan(input?: string | number | null): string {
  const result = validateNepalPan(input);
  return result.isValid ? result.formattedPan : String(input || "—");
}
