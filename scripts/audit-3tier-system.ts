import { db } from "../src/lib/db";
import { Prisma } from "@prisma/client";

async function main() {
  console.log("=== 3-TIER SYSTEM AUDIT SCRIPT ===");

  // 1. Check CatalogMaterial distribution across scopes
  const globalMats = await db.catalogMaterial.count({ where: { scope: "global", isActive: true } });
  const orgMats = await db.catalogMaterial.count({ where: { scope: "org", isActive: true } });
  const projMats = await db.catalogMaterial.count({ where: { scope: "project", isActive: true } });
  console.log("CatalogMaterial Counts:", { globalMats, orgMats, projMats });

  // 2. Check RateBook distribution across scopes
  const globalBooks = await db.rateBook.count({ where: { scope: "global" } });
  const orgBooks = await db.rateBook.count({ where: { scope: "org" } });
  const projBooks = await db.rateBook.count({ where: { scope: "project" } });
  console.log("RateBook Counts:", { globalBooks, orgBooks, projBooks });

  // 3. Check RateEntry distribution
  const totalRates = await db.rateEntry.count();
  console.log("Total RateEntries in DB:", totalRates);

  // 4. Check Uncataloged Materials
  const uncatPending = await db.uncatalogedMaterial.count({ where: { status: "pending" } });
  const uncatMapped = await db.uncatalogedMaterial.count({ where: { status: "mapped" } });
  const uncatPromoted = await db.uncatalogedMaterial.count({ where: { status: "promoted" } });
  const uncatIgnored = await db.uncatalogedMaterial.count({ where: { status: "ignored" } });
  console.log("UncatalogedMaterial Counts:", { uncatPending, uncatMapped, uncatPromoted, uncatIgnored });

  // 5. Integrity check: Orphaned RateEntries
  const orphanedRates = await db.$queryRaw<any[]>(Prisma.sql`
    SELECT count(*)::int as count FROM "CatalogRate" cr
    LEFT JOIN "CatalogMaterial" cm ON cm.id = cr."materialId"
    WHERE cm.id IS NULL
  `);
  console.log("Orphaned RateEntries (missing material):", orphanedRates);

  // 6. Integrity check: Operational materials without catalog links
  const unlinkedOperational = await db.material.count({ where: { catalogMaterialId: null, isActive: true } });
  console.log("Operational Materials without catalogMaterialId:", unlinkedOperational);

  // 7. Check composite normalizedName duplicate collisions
  const duplicateNormalized = await db.$queryRaw<any[]>(Prisma.sql`
    SELECT "normalizedName", "organizationId", "projectId", count(*)::int as cnt
    FROM "CatalogMaterial"
    WHERE "isActive" = true
    GROUP BY "normalizedName", "organizationId", "projectId"
    HAVING count(*) > 1
  `);
  console.log("Duplicate normalizedName conflicts in same scope:", duplicateNormalized);

  // 8. Check parent-child hierarchy link health
  const orgMatsWithValidParent = await db.catalogMaterial.count({
    where: { scope: "org", sourceMaterialId: { not: null }, isActive: true },
  });
  const projMatsWithValidParent = await db.catalogMaterial.count({
    where: { scope: "project", sourceMaterialId: { not: null }, isActive: true },
  });
  console.log("Hierarchy Link Health:", {
    orgMatsTotal: orgMats,
    orgMatsLinkedToGlobal: orgMatsWithValidParent,
    projMatsTotal: projMats,
    projMatsLinkedToParent: projMatsWithValidParent,
  });
}

main().catch(console.error).finally(() => process.exit(0));
