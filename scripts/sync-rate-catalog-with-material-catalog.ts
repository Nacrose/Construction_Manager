import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

async function main() {
  console.log("Fetching all Global & Organization MaterialCatalog items...");
  const globalMaterials = await db.materialCatalog.findMany({
    where: { OR: [{ isGlobal: true }, { organizationId: null }] },
    orderBy: { name: "asc" },
  });

  console.log(`Found ${globalMaterials.length} Global Master MaterialCatalog items.`);

  console.log("Fetching RateCatalogs...");
  let catalogs = await db.rateCatalog.findMany();

  if (catalogs.length === 0) {
    console.log("No RateCatalogs found. Creating default Master Infrastructure Rate Catalog 2081/82...");
    const masterCatalog = await db.rateCatalog.create({
      data: {
        name: "Infrastructure Master Rate Catalog 2081/82",
        fiscalYear: "2081/82",
        scope: "global",
        districts: ["Morang", "Kathmandu", "Sunsari", "Jhapa", "Kaski"],
        isActive: true,
      },
    });
    catalogs = [masterCatalog];
  }

  for (const catalog of catalogs) {
    console.log(`Syncing catalog "${catalog.name}" (ID: ${catalog.id})...`);

    // Clear old unlinked items if needed or update existing items
    await db.rateCatalogItem.deleteMany({
      where: { catalogId: catalog.id },
    });

    let codeCounter = 1;
    const districts = catalog.districts.length > 0 ? catalog.districts : ["Morang", "Kathmandu", "Sunsari"];

    for (const mat of globalMaterials) {
      const baseRate = mat.defaultRate || 100;

      // Create RateCatalogItem linked directly to MaterialCatalog
      const rateItem = await db.rateCatalogItem.create({
        data: {
          catalogId: catalog.id,
          code: codeCounter++,
          materialCatalogId: mat.id,
          materialName: mat.name,
          unit: mat.defaultUnit || "unit",
          sortOrder: codeCounter,
        },
      });

      // Create realistic regional district rates with minor district variance multipliers
      const districtRateEntries = districts.map((district, idx) => {
        let multiplier = 1.0;
        const dLower = district.toLowerCase();
        if (dLower.includes("kathmandu") || dLower.includes("kaski")) multiplier = 1.12; // Capital / Hill transport premium
        else if (dLower.includes("morang") || dLower.includes("sunsari") || dLower.includes("jhapa")) multiplier = 1.0; // Terai baseline

        // Add slight variance per index
        multiplier += (idx * 0.02);

        const calculatedRate = Math.round(baseRate * multiplier * 100) / 100;

        return {
          itemId: rateItem.id,
          district,
          rate: calculatedRate,
        };
      });

      await db.rateCatalogItemRate.createMany({
        data: districtRateEntries,
      });
    }

    console.log(`Synced ${globalMaterials.length} material items into RateCatalog "${catalog.name}".`);
  }

  console.log("Rate Catalog sync completed successfully!");
}

main()
  .catch((e) => {
    console.error("Rate catalog sync failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
