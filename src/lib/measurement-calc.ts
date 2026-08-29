/**
 * Central Construction Measurement Sheet & Quantity Takeoff Calculator
 *
 * Implements civil engineering measurement book formulas for:
 * - Rectangular elements (Excavation, RCC footing, beam, slab, brickwork)
 * - Circular elements (Piles, circular columns, pipe culverts)
 * - 2D Area takeoffs (Plaster, tiles, paint, formwork, geotextile)
 * - Structural Deductions (Door/Window openings, column cutouts)
 */

export type MeasurementShape = "rectangle" | "circular" | "area_2d" | "linear";

export interface MeasurementLine {
  id?: string;
  description: string;
  shape?: MeasurementShape;
  nos?: number; // Number of items (default: 1)
  length?: number; // Length (m / ft)
  breadth?: number; // Breadth / Width (m / ft)
  height?: number; // Height / Depth (m / ft)
  diameter?: number; // For circular cross-sections
  isDeduction?: boolean; // True if this line subtracts volume/area
  remarks?: string;
}

export interface CalculatedMeasurementLine extends MeasurementLine {
  quantity: number;
}

export interface MeasurementSheetResult {
  lines: CalculatedMeasurementLine[];
  grossQuantity: number;
  totalDeductions: number;
  netQuantity: number;
}

/**
 * Calculate quantity for a single measurement line
 */
export function calculateLineQuantity(line: MeasurementLine): number {
  const nos = line.nos ?? 1;
  const l = line.length ?? 1;
  const b = line.breadth ?? 1;
  const h = line.height ?? 1;
  const shape = line.shape || "rectangle";

  let baseQty = 0;

  switch (shape) {
    case "rectangle":
      // Volume = Nos * L * B * H
      baseQty = nos * (line.length ?? 1) * (line.breadth ?? 1) * (line.height ?? 1);
      break;

    case "circular":
      // Volume = Nos * (pi * (d/2)^2) * H
      if (line.diameter !== undefined) {
        const radius = line.diameter / 2;
        baseQty = nos * (Math.PI * Math.pow(radius, 2)) * (line.height ?? 1);
      } else {
        baseQty = nos * l * b * h;
      }
      break;

    case "area_2d":
      // Area = Nos * L * B
      baseQty = nos * (line.length ?? 1) * (line.breadth ?? 1);
      break;

    case "linear":
      // Length = Nos * L
      baseQty = nos * (line.length ?? 1);
      break;

    default:
      baseQty = nos * l * b * h;
  }

  return Math.round(baseQty * 1000) / 1000;
}

/**
 * Calculate full Measurement Sheet with deductions rollup
 */
export function calculateMeasurementSheet(lines: MeasurementLine[]): MeasurementSheetResult {
  let grossQuantity = 0;
  let totalDeductions = 0;

  const calculatedLines: CalculatedMeasurementLine[] = lines.map((line) => {
    const qty = calculateLineQuantity(line);
    if (line.isDeduction) {
      totalDeductions += qty;
    } else {
      grossQuantity += qty;
    }
    return { ...line, quantity: qty };
  });

  const netQuantity = Math.max(0, Math.round((grossQuantity - totalDeductions) * 1000) / 1000);

  return {
    lines: calculatedLines,
    grossQuantity: Math.round(grossQuantity * 1000) / 1000,
    totalDeductions: Math.round(totalDeductions * 1000) / 1000,
    netQuantity,
  };
}
