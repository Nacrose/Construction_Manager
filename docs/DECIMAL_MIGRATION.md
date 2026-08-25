# Decimal Migration Plan

## Status: Documented (NOT yet executed)

The schema (`prisma/schema.prisma`) currently uses `Float` for all 295
monetary / quantity / rate fields. This is a known tech-debt item —
floating-point arithmetic cannot exactly represent decimal fractions
like 0.1 + 0.2, which causes cumulative rounding errors in financial
calculations.

## Why it matters

- Half-cent boundary cases: a calculation like
  `1.005 * 100 / 100` may produce `1.0049999...` instead of `1.005`.
  The existing `decimal-precision.ts` rounding patch (round half to even)
  catches MOST of these, but not all — verified by testing, not just
  code reading.
- Cumulative drift: aggregating thousands of Float amounts over months
  of daily reports produces visible discrepancies in the Trial Balance
  (e.g. a debit sum that's 0.03 different from the corresponding credit
  sum, even though every individual line was "balanced").
- Audit trail: when an auditor asks "why does this JE have a 0.01
  imbalance?", the answer is usually "Float rounding" — which is not a
  satisfying answer.

## Migration plan (deferred — schedule as a dedicated sprint)

1. **Snapshot the production DB** — take a full backup before any
   schema changes. Float → Decimal is a lossless conversion at the
   Postgres level, but verify with a restore test first.

2. **Convert each `Float` field to `Decimal @db.Decimal(18,4)`** in
   `schema.prisma`. The 4-decimal precision is enough for Nepal
   construction accounting (NPR has 2 decimal places; quantity
   calculations may need 3-4 for cubic meters / tonnage).

3. **Run `prisma migrate dev --name decimal-migration`** — Prisma will
   generate a migration that uses `ALTER COLUMN ... TYPE DECIMAL(18,4)`
   for each field. Postgres will automatically cast the existing Float
   values to Decimal (rounding to 4 decimal places).

4. **Audit client-side code for any `Math.round(x * 100) / 100`**
   patterns — these were workarounds for Float imprecision and can be
   removed once the storage layer is exact. Search for
   `Math.round`, `toFixed`, `Number(...).toFixed`, and similar.

5. **Run the existing test suite** — `decimal-precision.test.ts` should
   still pass (it tests the rounding helper, not the storage). Add new
   integration tests that verify a round-trip
   (write 1.005, read 1.005, no drift) for each monetary model.

6. **Update the `decimal-precision.ts` rounding helper** — keep it for
   display purposes (formatting NPR with 2 decimal places), but remove
   the "round half to even" hack that was needed to paper over Float
   imprecision.

## Why this is documented but not executed in this fix

- The migration touches 295 schema fields across ~50 models. Even
  though each change is mechanical, the test surface is huge — every
  router that reads/writes a monetary value needs to be re-verified.
- A partial migration (some fields Decimal, some Float) is WORSE than
  no migration because it creates implicit cast points that can fail
  silently.
- The right time to do this is a dedicated sprint with a full QA pass,
  not as part of a bug-fix batch.

## Tracking

When this migration is executed, update this file with:
- Date of migration
- Migration script name (e.g. `20260824_decimal_migration`)
- Test results (pass/fail counts)
- Any data drift found during the conversion
