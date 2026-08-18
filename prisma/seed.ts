// Seed DoR norms as global presets.
// Run with: npm run db:seed
import { PrismaClient } from "@prisma/client";
import { DOR_PRESETS } from "../src/lib/dor-norms-data";

const db = new PrismaClient();

async function main() {
  const existingCount = await db.globalPresetAnalysis.count({
    where: { source: "DoR 2075" },
  });

  if (existingCount > 0) {
    console.log(`DoR presets already exist (${existingCount} found), skipping seed.`);
    console.log("To re-seed, delete existing presets first:");
    console.log('  DELETE FROM "GlobalPresetAnalysis" WHERE source = \'DoR 2075\';');
    return;
  }

  console.log(`Seeding ${DOR_PRESETS.length} DoR norm presets...`);

  let count = 0;
  for (const preset of DOR_PRESETS) {
    try {
      await db.globalPresetAnalysis.create({
        data: {
          name: preset.name,
          source: preset.source,
          category: preset.category,
          batchSize: preset.batchSize,
          ingredients: {
            create: preset.ingredients.map((ing, i) => ({
              name: ing.name,
              type: ing.type,
              calcMode: ing.calcMode,
              quantity: ing.quantity ?? 0,
              unit: ing.unit ?? "",
              percentage: ing.percentage ?? 0,
              pctBase: ing.pctBase ?? "",
              rate: 0,
              amount: 0,
              sortOrder: i + 1,
            })),
          },
        },
      });
      count++;
      if (count % 20 === 0) {
        console.log(`  ✓ Seeded ${count}/${DOR_PRESETS.length}...`);
      }
    } catch (e) {
      console.error(`  ✗ Failed: ${preset.name.slice(0, 60)}... — ${e instanceof Error ? e.message : "unknown"}`);
    }
  }

  console.log(`\nDone. Seeded ${count} of ${DOR_PRESETS.length} presets.`);
  console.log(`Total ingredients: ${DOR_PRESETS.reduce((s, p) => s + p.ingredients.length, 0)}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
