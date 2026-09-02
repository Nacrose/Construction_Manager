/**
 * Patch generated Prisma client type declarations: Decimal → number.
 *
 * WHY: The database now stores exact DECIMAL(15,2)/(15,4) columns and
 * src/lib/decimal-extension.ts converts Prisma Decimal objects → JS numbers
 * at the client boundary (runtime). But the generated TypeScript types still
 * declare those fields as `Decimal`, which breaks arithmetic/rendering code
 * app-wide and cannot cross the tRPC superjson boundary. Prisma result
 * extensions can only ADD fields, not override existing ones — so instead we
 * post-process the generated d.ts so the declared types match the runtime
 * reality (plain numbers).
 *
 * MUST run after every `prisma generate` (wired into postinstall / build /
 * db:generate in package.json).
 *
 * What it does: for every field in prisma/schema.prisma declared as
 * `Decimal @db.Decimal(15, …)`, rewrite `field: Decimal` (and
 * `field: Decimal | null`, and input positions `field?: Decimal | number`)
 * to `number` in node_modules/.prisma/client/index.d.ts.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const SCHEMA = path.join(ROOT, "prisma/schema.prisma");
const DTS = path.join(ROOT, "node_modules/.prisma/client/index.d.ts");

const schema = fs.readFileSync(SCHEMA, "utf8");
const fieldNames = new Set();
// Tolerant collection: `field Decimal [attrs...] @db.Decimal(p, s)` — the
// @default may appear before or after @db.Decimal, and precision may be
// (15, x) or any other (e.g. (5, 2) percent shares). The runtime decimal
// boundary converts EVERY Decimal to number, so every declared Decimal
// field must have its type patched, whatever the attribute order.
for (const m of schema.matchAll(/^\s+(\w+)\s+Decimal\??\b.*@db\.Decimal\(\d+,\s*\d+\)/gm)) {
  fieldNames.add(m[1]);
}
if (fieldNames.size === 0) {
  console.log("[patch-prisma-types] no Decimal fields found in schema — nothing to do");
  process.exit(0);
}

if (!fs.existsSync(DTS)) {
  console.error(`[patch-prisma-types] ${DTS} not found — run \`prisma generate\` first`);
  process.exit(1);
}

let dts = fs.readFileSync(DTS, "utf8");
let total = 0;
const perField = {};

// Sort longest-first so overlapping names (e.g. `amount` vs `netAmount`)
// never partially shadow each other in the word-boundary regex.
const names = [...fieldNames].sort((a, b) => b.length - a.length);
for (const name of names) {
  // Matches result/payload positions in BOTH spellings the generator emits:
  // `field: Decimal`, `field: Prisma.Decimal`, `field: Decimal | null`,
  // `field?: Prisma.Decimal | number` (input positions collapse to number —
  // harmless, the app only ever passes numbers).
  // Does NOT touch select objects (`field?: true`) or filter input types
  // (`DecimalFilter<...> | Decimal | ...` — the Decimal there follows `|`).
  const re = new RegExp(`(\\b${name}(\\?)?\\s*:\\s*)(?:Prisma\\.)?Decimal\\b`, "g");
  dts = dts.replace(re, (_full, prefix) => {
    total++;
    perField[name] = (perField[name] || 0) + 1;
    return `${prefix}number`;
  });
}

fs.writeFileSync(DTS, dts);
console.log(
  `[patch-prisma-types] rewrote ${total} Decimal→number type positions ` +
    `across ${Object.keys(perField).length}/${names.length} fields in ${path.relative(ROOT, DTS)}`,
);

// Sentinel check — a known migrated field must now be typed number.
const sentinel = names[0];
const probe = new RegExp(`\\b${sentinel}\\s*:\\s*number`);
if (!probe.test(dts)) {
  console.error(`[patch-prisma-types] WARNING: sentinel field "${sentinel}" not found as number — investigate`);
  process.exit(1);
}
