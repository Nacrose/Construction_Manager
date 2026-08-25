import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { DOR_PRESETS } from "../src/lib/dor-norms-data";

const db = new PrismaClient();

async function seedSuperAdmin() {
  const superAdminEmail = process.env.SUPERADMIN_EMAIL?.toLowerCase().trim();
  const superAdminPassword = process.env.SUPERADMIN_PASSWORD;
  const superAdminName = process.env.SUPERADMIN_NAME || "Platform Administrator";

  if (!superAdminEmail || !superAdminPassword) {
    console.log("ℹ️ No SUPERADMIN_EMAIL/SUPERADMIN_PASSWORD in environment. Skipping superadmin provisioning.");
    return;
  }

  const existing = await db.user.findFirst({
    where: { OR: [{ email: superAdminEmail }, { isSuperAdmin: true }] },
  });

  if (existing) {
    console.log(`✓ Superadmin account already exists (${existing.email}).`);
    return;
  }

  const passwordHash = await bcrypt.hash(superAdminPassword, 12);
  const user = await db.user.create({
    data: {
      email: superAdminEmail,
      name: superAdminName,
      passwordHash,
      role: "project_manager",
      isSuperAdmin: true,
      orgRole: "org_admin",
    },
  });

  console.log(`✅ Platform Superadmin created: ${user.email} (${user.name})`);
}

async function main() {
  // 1. Provision Superadmin from Vercel / Environment variables
  await seedSuperAdmin();

  // 2. Seed DoR Norms
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
