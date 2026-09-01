/**
 * Exact Money Arithmetic (server-side) — Prisma.Decimal helpers.
 *
 * Float arithmetic on money accumulates rounding error (0.1 + 0.2 !== 0.3)
 * and must never feed ledger totals, balance increments, or JE balance
 * checks. These helpers keep every intermediate step in Prisma.Decimal
 * (exact base-10, rounded half-up to 2dp), converting to float ONLY at the
 * final boundary — exact for any 2-decimal value below 2^53.
 *
 * Client code should NOT import this module (it pulls @prisma/client into
 * the browser bundle); client-side formatting stays in currency.ts.
 */
import { Prisma } from "@prisma/client";

export type MoneyValue = number | string | Prisma.Decimal | null | undefined;

/**
 * Coerce any money-like value into an exact 2dp Decimal.
 * Non-finite numbers and unparseable strings coerce to 0 (fail-soft at the
 * arithmetic layer — callers validate user input via parseNumericInput).
 */
export function toMoney(v: MoneyValue): Prisma.Decimal {
  if (v === null || v === undefined || v === "") return new Prisma.Decimal(0);
  try {
    const d = v instanceof Prisma.Decimal ? v : new Prisma.Decimal(v);
    return d.isFinite() ? d.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP) : new Prisma.Decimal(0);
  } catch {
    return new Prisma.Decimal(0);
  }
}

/** Exact 2dp sum of money values — never accumulates in float. */
export function addMoney(...vals: MoneyValue[]): Prisma.Decimal {
  return vals.reduce<Prisma.Decimal>((s, v) => s.add(toMoney(v)), new Prisma.Decimal(0));
}

/** Exact 2dp difference a - b. */
export function subMoney(a: MoneyValue, b: MoneyValue): Prisma.Decimal {
  return toMoney(a).minus(toMoney(b));
}
