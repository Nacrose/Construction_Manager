// Seed global rate analysis presets — common Nepal construction items.
// Run with: bun prisma/seed-presets.ts
import { PrismaClient } from "@prisma/client";
import { createSeedDb, enableSeedRlsBypass } from "./seed-rls";
const db = createSeedDb(); // single connection — see ./seed-rls (RLS phases 1–2)

async function main() {
  await enableSeedRlsBypass(db); // RLS phases 1–2: seeds write cross-org reference data
  const presets = [
    {
      name: "RCC M25 (1:1:2)",
      source: "DoR",
      category: "Concrete",
      batchSize: 1,
      description: "RCC M25 per cum — standard mix design",
      ingredients: [
        { name: "Cement OPC 53", type: "material", quantity: 7.5, unit: "bag", percentage: 2, rate: 950, calcMode: "fixed", pctBase: "" },
        { name: "Sand (river)", type: "material", quantity: 0.42, unit: "cum", percentage: 5, rate: 3500, calcMode: "fixed", pctBase: "" },
        { name: "Aggregate 20mm", type: "material", quantity: 0.83, unit: "cum", percentage: 5, rate: 2800, calcMode: "fixed", pctBase: "" },
        { name: "Mason", type: "labor", quantity: 0.5, unit: "day", percentage: 0, rate: 1200, calcMode: "fixed", pctBase: "" },
        { name: "Laborer", type: "labor", quantity: 1.5, unit: "day", percentage: 0, rate: 800, calcMode: "fixed", pctBase: "" },
        { name: "Concrete Mixer", type: "equipment", quantity: 0.2, unit: "day", percentage: 0, rate: 2500, calcMode: "fixed", pctBase: "" },
        { name: "Vibrator", type: "equipment", quantity: 0.15, unit: "day", percentage: 0, rate: 1500, calcMode: "fixed", pctBase: "" },
        { name: "Contractor Profit", type: "overhead", calcMode: "percentage", percentage: 10, pctBase: "all", quantity: 0, unit: "", rate: 0 },
        { name: "VAT", type: "overhead", calcMode: "percentage", percentage: 13, pctBase: "all_including_pct", quantity: 0, unit: "", rate: 0 },
      ],
    },
    {
      name: "RCC M20 (1:1.5:3)",
      source: "DoR",
      category: "Concrete",
      batchSize: 1,
      description: "RCC M20 per cum",
      ingredients: [
        { name: "Cement OPC 53", type: "material", quantity: 6.5, unit: "bag", percentage: 2, rate: 950, calcMode: "fixed", pctBase: "" },
        { name: "Sand (river)", type: "material", quantity: 0.46, unit: "cum", percentage: 5, rate: 3500, calcMode: "fixed", pctBase: "" },
        { name: "Aggregate 20mm", type: "material", quantity: 0.91, unit: "cum", percentage: 5, rate: 2800, calcMode: "fixed", pctBase: "" },
        { name: "Mason", type: "labor", quantity: 0.5, unit: "day", percentage: 0, rate: 1200, calcMode: "fixed", pctBase: "" },
        { name: "Laborer", type: "labor", quantity: 1.5, unit: "day", percentage: 0, rate: 800, calcMode: "fixed", pctBase: "" },
        { name: "Concrete Mixer", type: "equipment", quantity: 0.2, unit: "day", percentage: 0, rate: 2500, calcMode: "fixed", pctBase: "" },
        { name: "Contractor Profit", type: "overhead", calcMode: "percentage", percentage: 10, pctBase: "all", quantity: 0, unit: "", rate: 0 },
      ],
    },
    {
      name: "PCC 1:4:8",
      source: "DoR",
      category: "Concrete",
      batchSize: 1,
      description: "Plain Cement Concrete 1:4:8 per cum",
      ingredients: [
        { name: "Cement", type: "material", quantity: 3.5, unit: "bag", percentage: 2, rate: 950, calcMode: "fixed", pctBase: "" },
        { name: "Sand", type: "material", quantity: 0.44, unit: "cum", percentage: 5, rate: 3500, calcMode: "fixed", pctBase: "" },
        { name: "Aggregate 40mm", type: "material", quantity: 0.89, unit: "cum", percentage: 5, rate: 2500, calcMode: "fixed", pctBase: "" },
        { name: "Mason", type: "labor", quantity: 0.3, unit: "day", percentage: 0, rate: 1200, calcMode: "fixed", pctBase: "" },
        { name: "Laborer", type: "labor", quantity: 1.0, unit: "day", percentage: 0, rate: 800, calcMode: "fixed", pctBase: "" },
        { name: "Concrete Mixer", type: "equipment", quantity: 0.15, unit: "day", percentage: 0, rate: 2500, calcMode: "fixed", pctBase: "" },
        { name: "Contractor Profit", type: "overhead", calcMode: "percentage", percentage: 10, pctBase: "all", quantity: 0, unit: "", rate: 0 },
      ],
    },
    {
      name: "Brickwork 1:6 (Cement Mortar)",
      source: "Standard",
      category: "Masonry",
      batchSize: 1,
      description: "Brickwork in 1:6 cement mortar per cum",
      ingredients: [
        { name: "Brick Class A", type: "material", quantity: 500, unit: "no", percentage: 3, rate: 15, calcMode: "fixed", pctBase: "" },
        { name: "Cement", type: "material", quantity: 1.25, unit: "bag", percentage: 2, rate: 950, calcMode: "fixed", pctBase: "" },
        { name: "Sand", type: "material", quantity: 0.3, unit: "cum", percentage: 5, rate: 3500, calcMode: "fixed", pctBase: "" },
        { name: "Mason", type: "labor", quantity: 0.8, unit: "day", percentage: 0, rate: 1200, calcMode: "fixed", pctBase: "" },
        { name: "Laborer", type: "labor", quantity: 1.2, unit: "day", percentage: 0, rate: 800, calcMode: "fixed", pctBase: "" },
        { name: "Contractor Profit", type: "overhead", calcMode: "percentage", percentage: 10, pctBase: "all", quantity: 0, unit: "", rate: 0 },
      ],
    },
    {
      name: "Plastering 12mm (1:4)",
      source: "Standard",
      category: "Finishes",
      batchSize: 1,
      description: "12mm thick cement plaster 1:4 per sqm",
      ingredients: [
        { name: "Cement", type: "material", quantity: 0.2, unit: "bag", percentage: 2, rate: 950, calcMode: "fixed", pctBase: "" },
        { name: "Sand", type: "material", quantity: 0.02, unit: "cum", percentage: 5, rate: 3500, calcMode: "fixed", pctBase: "" },
        { name: "Mason", type: "labor", quantity: 0.1, unit: "day", percentage: 0, rate: 1200, calcMode: "fixed", pctBase: "" },
        { name: "Laborer", type: "labor", quantity: 0.15, unit: "day", percentage: 0, rate: 800, calcMode: "fixed", pctBase: "" },
        { name: "Scaffolding", type: "equipment", quantity: 0.05, unit: "day", percentage: 0, rate: 500, calcMode: "fixed", pctBase: "" },
        { name: "Contractor Profit", type: "overhead", calcMode: "percentage", percentage: 10, pctBase: "all", quantity: 0, unit: "", rate: 0 },
      ],
    },
    {
      name: "Excavation (Ordinary Soil)",
      source: "Standard",
      category: "Earthwork",
      batchSize: 1,
      description: "Earthwork excavation in ordinary soil per cum",
      ingredients: [
        { name: "Laborer", type: "labor", quantity: 0.3, unit: "day", percentage: 0, rate: 800, calcMode: "fixed", pctBase: "" },
        { name: "JCB Excavator", type: "equipment", quantity: 0.02, unit: "day", percentage: 0, rate: 12000, calcMode: "fixed", pctBase: "" },
        { name: "Contractor Profit", type: "overhead", calcMode: "percentage", percentage: 10, pctBase: "all", quantity: 0, unit: "", rate: 0 },
      ],
    },
    {
      name: "Reinforcement Steel (Fe500)",
      source: "Standard",
      category: "Steel",
      batchSize: 1,
      description: "Steel reinforcement per kg including fabrication",
      ingredients: [
        { name: "TMT Bar Fe500", type: "material", quantity: 1.0, unit: "kg", percentage: 3, rate: 125, calcMode: "fixed", pctBase: "" },
        { name: "Binding Wire", type: "material", quantity: 0.02, unit: "kg", percentage: 0, rate: 150, calcMode: "fixed", pctBase: "" },
        { name: "Steel Fixer", type: "labor", quantity: 0.01, unit: "day", percentage: 0, rate: 1600, calcMode: "fixed", pctBase: "" },
        { name: "Laborer", type: "labor", quantity: 0.01, unit: "day", percentage: 0, rate: 800, calcMode: "fixed", pctBase: "" },
        { name: "Gas Cutting", type: "equipment", quantity: 0.005, unit: "day", percentage: 0, rate: 2000, calcMode: "fixed", pctBase: "" },
        { name: "Contractor Profit", type: "overhead", calcMode: "percentage", percentage: 10, pctBase: "all", quantity: 0, unit: "", rate: 0 },
      ],
    },
  ];

  for (const p of presets) {
    const existing = await db.globalPresetAnalysis.findFirst({ where: { name: p.name } });
    if (existing) { console.log(`  skip: ${p.name} (exists)`); continue; }

    // Calculate amounts for fixed ingredients
    const ingredients = p.ingredients.map((ing, i) => {
      let amount = 0;
      if (ing.calcMode === "fixed") {
        const qtyWithPct = ing.quantity + (ing.quantity * ing.percentage) / 100;
        amount = qtyWithPct * ing.rate;
      }
      return { ...ing, amount, sortOrder: i };
    });

    // Calculate % provision amounts
    const fixed = ingredients.filter((i) => i.calcMode === "fixed");
    const matTotal = fixed.filter((i) => i.type === "material").reduce((s, i) => s + i.amount, 0);
    const labTotal = fixed.filter((i) => i.type === "labor").reduce((s, i) => s + i.amount, 0);
    const eqpTotal = fixed.filter((i) => i.type === "equipment").reduce((s, i) => s + i.amount, 0);
    const allFixed = matTotal + labTotal + eqpTotal;
    let runningPct = 0;
    for (const ing of ingredients) {
      if (ing.calcMode === "percentage") {
        let base = allFixed;
        switch (ing.pctBase) {
          case "material": base = matTotal; break;
          case "labor": base = labTotal; break;
          case "equipment": base = eqpTotal; break;
          case "all_including_pct": base = allFixed + runningPct; break;
        }
        ing.amount = (base * ing.percentage) / 100;
        runningPct += ing.amount;
      }
    }

    await db.globalPresetAnalysis.create({
      data: {
        name: p.name,
        source: p.source,
        category: p.category,
        description: p.description,
        batchSize: p.batchSize,
        ingredients: { create: ingredients },
      },
    });
    console.log(`  ✓ ${p.name} (${ingredients.length} ingredients)`);
  }

  console.log(`\nDone. ${presets.length} presets seeded.`);
}

main().catch(console.error).finally(async () => { await db.$disconnect(); });
