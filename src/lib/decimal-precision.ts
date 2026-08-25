/**
 * Round a number to 2 decimal places (Nepali paisa precision).
 *
 * Used as a defense-in-depth measure against floating-point drift
 * in financial calculations. Even though the DB columns use
 * DOUBLE PRECISION, applying this function at every calculation
 * boundary prevents accumulated rounding errors.
 *
 * For a full fix, the Prisma schema should migrate Float fields
 * to Decimal @db.Decimal(15,2) — but that requires a migration
 * on the production database. This helper provides immediate
 * protection without a schema migration.
 */
export function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Round all numeric values in a financial object to 2 decimal places.
 * Recursively walks the object and rounds any number it finds.
 */
export function roundFinancials<T>(obj: T): T {
  if (typeof obj === "number") {
    return round2(obj) as unknown as T;
  }
  if (Array.isArray(obj)) {
    return obj.map(roundFinancials) as unknown as T;
  }
  if (obj && typeof obj === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      result[key] = roundFinancials(value);
    }
    return result as T;
  }
  return obj;
}
