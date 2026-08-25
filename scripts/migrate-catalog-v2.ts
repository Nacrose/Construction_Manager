/**
 * Migration script: Populate unified CatalogMaterial + CatalogRate models
 * from existing GlobalMaterialCatalog, MaterialCatalog, OrgMaterialEntry,
 * RateCatalogItem, RateCatalogItemRate, OrgRateOverride, ProjectRateOverride.
 *
 * Usage: npx tsx scripts/migrate-catalog-v2.ts
 */
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

const normalize = (s: string) =>
  s.toLowerCase().trim().replace(/[,.()\-]/g, " ").replace(/\s+/g, " ");

async function main() {
  console.log("Starting catalog v2 migration...\n");

  // ── Step 1: Migrate GlobalMaterialCatalog → CatalogMaterial (scope:"global") ──
  console.log("Step 1: Migrating GlobalMaterialCatalog...");
  const globalMaterials = await db.globalMaterialCatalog.findMany({
    where: { isActive: true },
  });

  const globalMaterialMap = new Map<string, string>(); // old ID → new CatalogMaterial ID

  for (const gm of globalMaterials) {
    const existing = await db.catalogMaterial.findFirst({
      where: {
        normalizedName: normalize(gm.name),
        scope: "global",
        organizationId: null,
        projectId: null,
      },
    });

    if (existing) {
      globalMaterialMap.set(gm.id, existing.id);
      continue;
    }

    const created = await db.catalogMaterial.create({
      data: {
        scope: "global",
        organizationId: null,
        projectId: null,
        name: gm.name,
        normalizedName: normalize(gm.name),
        code: gm.code,
        category: gm.category,
        subCategory: gm.subCategory,
        defaultUnit: gm.defaultUnit || "",
        defaultRate: gm.defaultRate || 0,
        aliases: gm.aliases || [],
        isActive: gm.isActive,
      },
    });
    globalMaterialMap.set(gm.id, created.id);
  }
  console.log(`  Migrated ${globalMaterialMap.size} global materials.`);

  // ── Step 2: Migrate MaterialCatalog (global) → CatalogMaterial (scope:"global") ──
  console.log("Step 2: Migrating MaterialCatalog (global)...");
  const globalCatalogItems = await db.materialCatalog.findMany({
    where: { organizationId: null, isActive: true },
  });

  let globalCatalogMigrated = 0;
  let globalCatalogSkipped = 0;

  for (const mc of globalCatalogItems) {
    const norm = normalize(mc.name);
    // Skip if already migrated from GlobalMaterialCatalog
    const alreadyExists = await db.catalogMaterial.findFirst({
      where: { normalizedName: norm, scope: "global", organizationId: null },
    });
    if (alreadyExists) {
      globalCatalogSkipped++;
      continue;
    }

    await db.catalogMaterial.create({
      data: {
        scope: "global",
        organizationId: null,
        projectId: null,
        name: mc.name,
        normalizedName: norm,
        category: mc.category,
        subCategory: mc.subCategory,
        defaultUnit: mc.defaultUnit || "",
        defaultRate: mc.defaultRate || 0,
        aliases: [],
        isActive: mc.isActive,
      },
    });
    globalCatalogMigrated++;
  }
  console.log(`  Migrated ${globalCatalogMigrated} new, skipped ${globalCatalogSkipped} existing.`);

  // ── Step 3: Migrate MaterialCatalog (org) → CatalogMaterial (scope:"org") ──
  console.log("Step 3: Migrating MaterialCatalog (org)...");
  const orgCatalogItems = await db.materialCatalog.findMany({
    where: { organizationId: { not: null }, isActive: true },
  });

  const orgMaterialMap = new Map<string, string>(); // old MaterialCatalog ID → new CatalogMaterial ID
  let orgMigrated = 0;

  for (const mc of orgCatalogItems) {
    const norm = normalize(mc.name);
    const existing = await db.catalogMaterial.findFirst({
      where: {
        normalizedName: norm,
        scope: "org",
        organizationId: mc.organizationId,
      },
    });

    if (existing) {
      orgMaterialMap.set(mc.id, existing.id);
      continue;
    }

    // Try to find the global source material
    let sourceMaterialId: string | null = null;
    const globalMatch = await db.catalogMaterial.findFirst({
      where: { normalizedName: norm, scope: "global" },
    });
    if (globalMatch) sourceMaterialId = globalMatch.id;

    const created = await db.catalogMaterial.create({
      data: {
        scope: "org",
        organizationId: mc.organizationId,
        projectId: null,
        sourceMaterialId,
        name: mc.name,
        normalizedName: norm,
        category: mc.category,
        subCategory: mc.subCategory,
        defaultUnit: mc.defaultUnit || "",
        defaultRate: mc.defaultRate || 0,
        aliases: [],
        isActive: mc.isActive,
      },
    });
    orgMaterialMap.set(mc.id, created.id);
    orgMigrated++;
  }
  console.log(`  Migrated ${orgMigrated} org materials.`);

  // ── Step 4: Migrate OrgMaterialEntry → CatalogMaterial (scope:"org") ──
  console.log("Step 4: Migrating OrgMaterialEntry...");
  const orgEntries = await db.orgMaterialEntry.findMany({
    where: { isActive: true },
  });

  let orgEntryMigrated = 0;
  let orgEntrySkipped = 0;

  for (const oe of orgEntries) {
    const name = oe.localName || "";
    if (!name) { orgEntrySkipped++; continue; }
    const norm = normalize(name);

    const existing = await db.catalogMaterial.findFirst({
      where: {
        normalizedName: norm,
        scope: "org",
        organizationId: oe.organizationId,
      },
    });
    if (existing) {
      orgEntrySkipped++;
      continue;
    }

    // Link to global if available
    let sourceMaterialId: string | null = null;
    if (oe.globalMaterialId) {
      sourceMaterialId = globalMaterialMap.get(oe.globalMaterialId) || null;
    }

    await db.catalogMaterial.create({
      data: {
        scope: "org",
        organizationId: oe.organizationId,
        projectId: null,
        sourceMaterialId,
        name,
        normalizedName: norm,
        category: oe.localCategory || null,
        subCategory: oe.localSubCategory || null,
        defaultUnit: oe.localUnit || "",
        defaultRate: oe.defaultRate || 0,
        aliases: [],
        isActive: oe.isActive,
      },
    });
    orgEntryMigrated++;
  }
  console.log(`  Migrated ${orgEntryMigrated} new, skipped ${orgEntrySkipped} existing.`);

  // ── Step 5: Migrate RateCatalogItem + RateCatalogItemRate → CatalogRate ──
  console.log("Step 5: Migrating RateCatalogItem + Rates → CatalogRate...");
  const rateItems = await db.rateCatalogItem.findMany({
    include: { rates: true, catalog: { select: { scope: true, organizationId: true, projectId: true } } },
  });

  let catalogRateCreated = 0;

  for (const ri of rateItems) {
    // Find the corresponding CatalogMaterial
    let catalogMaterial: { id: string } | null = null;

    if (ri.materialCatalogId) {
      // Try org material first, then global
      catalogMaterial = orgMaterialMap.get(ri.materialCatalogId)
        ? { id: orgMaterialMap.get(ri.materialCatalogId)! }
        : await db.catalogMaterial.findFirst({
            where: { normalizedName: normalize(ri.materialName), scope: "org" },
            select: { id: true },
          });
    }

    if (!catalogMaterial) {
      catalogMaterial = await db.catalogMaterial.findFirst({
        where: { normalizedName: normalize(ri.materialName), scope: "global" },
        select: { id: true },
      });
    }

    if (!catalogMaterial) {
      // Create a minimal catalog material for this rate item
      const scope = ri.catalog.scope || "global";
      const created = await db.catalogMaterial.create({
        data: {
          scope,
          organizationId: ri.catalog.organizationId,
          projectId: ri.catalog.projectId,
          name: ri.materialName,
          normalizedName: normalize(ri.materialName),
          defaultUnit: ri.unit || "",
          defaultRate: 0,
        },
      });
      catalogMaterial = created;
    }

    // Create one CatalogRate per district
    for (const rate of ri.rates) {
      const existing = await db.catalogRate.findFirst({
        where: {
          materialId: catalogMaterial.id,
          rateCatalogId: ri.catalogId,
          district: rate.district,
        },
      });
      if (existing) continue;

      await db.catalogRate.create({
        data: {
          materialId: catalogMaterial.id,
          rateCatalogId: ri.catalogId,
          district: rate.district,
          rate: rate.rate,
        },
      });
      catalogRateCreated++;
    }
  }
  console.log(`  Created ${catalogRateCreated} catalog rate entries.`);

  // ── Step 6: Migrate OrgRateOverride → CatalogRate ──
  console.log("Step 6: Migrating OrgRateOverride...");
  const orgOverrides = await db.orgRateOverride.findMany();

  let orgOverrideMigrated = 0;

  for (const ov of orgOverrides) {
    // Find the org catalog to get its parent global catalog
    const orgCatalog = await db.orgRateCatalog.findUnique({
      where: { id: ov.orgCatalogId },
      select: { parentGlobalCatalogId: true, organizationId: true },
    });
    if (!orgCatalog) continue;

    // Find the CatalogMaterial for this override
    const orgEntry = await db.orgMaterialEntry.findUnique({
      where: { id: ov.orgMaterialEntryId },
      select: { localName: true, globalMaterialId: true },
    });
    if (!orgEntry?.localName) continue;

    let catalogMat = await db.catalogMaterial.findFirst({
      where: {
        normalizedName: normalize(orgEntry.localName),
        scope: "org",
        organizationId: orgCatalog.organizationId,
      },
    });

    if (!catalogMat) continue;

    // Find or create a CatalogRate for the org's rate catalog
    // We need to find the RateCatalog that corresponds to this OrgRateCatalog
    const rateCatalog = await db.rateCatalog.findFirst({
      where: {
        organizationId: orgCatalog.organizationId,
        scope: "org",
        sourceCatalogId: orgCatalog.parentGlobalCatalogId,
      },
    });
    if (!rateCatalog) continue;

    const existing = await db.catalogRate.findFirst({
      where: {
        materialId: catalogMat.id,
        rateCatalogId: rateCatalog.id,
        district: ov.district,
      },
    });

    if (existing) {
      // Update with override rate
      await db.catalogRate.update({
        where: { id: existing.id },
        data: { rate: ov.rate },
      });
    } else {
      // Find source rate from global catalog
      let sourceRateEntryId: string | null = null;
      if (orgEntry.globalMaterialId) {
        const globalMat = globalMaterialMap.get(orgEntry.globalMaterialId);
        if (globalMat) {
          const globalRate = await db.catalogRate.findFirst({
            where: {
              materialId: globalMat,
              district: ov.district,
            },
          });
          sourceRateEntryId = globalRate?.id || null;
        }
      }

      await db.catalogRate.create({
        data: {
          materialId: catalogMat.id,
          rateCatalogId: rateCatalog.id,
          district: ov.district,
          rate: ov.rate,
          sourceRateEntryId,
        },
      });
    }
    orgOverrideMigrated++;
  }
  console.log(`  Migrated ${orgOverrideMigrated} org rate overrides.`);

  // ── Step 7: Migrate ProjectRateOverride → CatalogRate ──
  console.log("Step 7: Migrating ProjectRateOverride...");
  const projOverrides = await db.projectRateOverride.findMany({
    include: { material: { select: { name: true, projectId: true } } },
  });

  let projOverrideMigrated = 0;

  for (const pov of projOverrides) {
    if (!pov.material) continue;

    const catalogMat = await db.catalogMaterial.findFirst({
      where: {
        normalizedName: normalize(pov.material.name),
        scope: "project",
        projectId: pov.projectId,
      },
    });
    if (!catalogMat) continue;

    // Find the project's rate catalog
    const rateCatalog = await db.rateCatalog.findFirst({
      where: { projectId: pov.projectId, scope: "project" },
    });
    if (!rateCatalog) continue;

    const existing = await db.catalogRate.findFirst({
      where: {
        materialId: catalogMat.id,
        rateCatalogId: rateCatalog.id,
        district: "__PROJECT__",
      },
    });

    if (existing) {
      await db.catalogRate.update({
        where: { id: existing.id },
        data: { rate: pov.rate },
      });
    } else {
      await db.catalogRate.create({
        data: {
          materialId: catalogMat.id,
          rateCatalogId: rateCatalog.id,
          district: "__PROJECT__",
          rate: pov.rate,
        },
      });
    }
    projOverrideMigrated++;
  }
  console.log(`  Migrated ${projOverrideMigrated} project rate overrides.`);

  // ── Summary ──
  const totalMaterials = await db.catalogMaterial.count();
  const totalRates = await db.catalogRate.count();
  console.log(`\nMigration complete!`);
  console.log(`  CatalogMaterial: ${totalMaterials} records`);
  console.log(`  CatalogRate: ${totalRates} records`);
}

main()
  .catch((e) => {
    console.error("Migration failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
