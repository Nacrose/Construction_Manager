// Seed sample BOQ items + ingredients for the existing BRT-001 project.
// Run with: bun prisma/seed-boq.ts
//
// Idempotent: if BOQ items already exist for BRT-001, the script will
// clear them and re-insert (so re-running keeps the demo consistent).
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

// Each entry: code, description, unit, quantity, rate, category, ingredients[]
type SeedItem = {
  code: string;
  description: string;
  unit: string;
  quantity: number;
  rate: number;
  category: string;
  ingredients: {
    name: string;
    type: "material" | "labor" | "equipment";
    quantity: number;
    unit: string;
    rate: number;
  }[];
};

const SEED: SeedItem[] = [
  {
    code: "1.1",
    description: "Earthwork excavation for foundation in ordinary soil",
    unit: "cum",
    quantity: 480,
    rate: 385,
    category: "Civil",
    ingredients: [
      { name: "Excavator (PC100)", type: "equipment", quantity: 0.04, unit: "hr", rate: 3500 },
      { name: "Skilled labor", type: "labor", quantity: 0.2, unit: "day", rate: 1200 },
      { name: "Unskilled labor", type: "labor", quantity: 0.4, unit: "day", rate: 800 },
      { name: "Disposal truck", type: "equipment", quantity: 0.03, unit: "hr", rate: 1800 },
    ],
  },
  {
    code: "1.2",
    description: "Concrete PCC (1:3:6) in foundation",
    unit: "cum",
    quantity: 95,
    rate: 9450,
    category: "Civil",
    ingredients: [
      { name: "OPC Cement (53 grade)", type: "material", quantity: 240, unit: "kg", rate: 18 },
      { name: "Crushed sand", type: "material", quantity: 0.42, unit: "cum", rate: 3500 },
      { name: "Coarse aggregate 20mm", type: "material", quantity: 0.84, unit: "cum", rate: 2800 },
      { name: "Skilled labor", type: "labor", quantity: 0.5, unit: "day", rate: 1200 },
      { name: "Unskilled labor", type: "labor", quantity: 1.0, unit: "day", rate: 800 },
      { name: "Concrete mixer", type: "equipment", quantity: 0.1, unit: "hr", rate: 1200 },
    ],
  },
  {
    code: "2.1",
    description: "Reinforcement steel (TMT Fe500) for RCC works",
    unit: "kg",
    quantity: 18400,
    rate: 132,
    category: "Structural",
    ingredients: [
      { name: "TMT steel bars Fe500", type: "material", quantity: 1.02, unit: "kg", rate: 115 },
      { name: "Binding wire", type: "material", quantity: 0.012, unit: "kg", rate: 120 },
      { name: "Skilled bar bender", type: "labor", quantity: 0.012, unit: "day", rate: 1400 },
      { name: "Unskilled labor", type: "labor", quantity: 0.018, unit: "day", rate: 800 },
    ],
  },
  {
    code: "2.2",
    description: "Formwork (steel) for RCC columns and beams",
    unit: "sqm",
    quantity: 1240,
    rate: 740,
    category: "Structural",
    ingredients: [
      { name: "Steel formwork (rental)", type: "material", quantity: 1.05, unit: "sqm", rate: 95 },
      { name: "Release agent", type: "material", quantity: 0.05, unit: "litre", rate: 220 },
      { name: "Carpenter (skilled)", type: "labor", quantity: 0.18, unit: "day", rate: 1400 },
      { name: "Unskilled labor", type: "labor", quantity: 0.24, unit: "day", rate: 800 },
    ],
  },
  {
    code: "3.1",
    description: "Brickwork in cement mortar 1:6 in superstructure",
    unit: "cum",
    quantity: 320,
    rate: 11250,
    category: "Civil",
    ingredients: [
      { name: "First-class brick", type: "material", quantity: 500, unit: "no", rate: 14 },
      { name: "OPC Cement", type: "material", quantity: 85, unit: "kg", rate: 18 },
      { name: "Fine sand", type: "material", quantity: 0.34, unit: "cum", rate: 3500 },
      { name: "Mason", type: "labor", quantity: 0.55, unit: "day", rate: 1500 },
      { name: "Unskilled labor", type: "labor", quantity: 0.85, unit: "day", rate: 800 },
    ],
  },
  {
    code: "3.2",
    description: "Cement plaster 15mm thick (1:4) to internal walls",
    unit: "sqm",
    quantity: 2680,
    rate: 410,
    category: "Finishes",
    ingredients: [
      { name: "OPC Cement", type: "material", quantity: 9.5, unit: "kg", rate: 18 },
      { name: "Fine sand", type: "material", quantity: 0.038, unit: "cum", rate: 3500 },
      { name: "Mason", type: "labor", quantity: 0.12, unit: "day", rate: 1500 },
      { name: "Unskilled labor", type: "labor", quantity: 0.16, unit: "day", rate: 800 },
    ],
  },
  {
    code: "4.1",
    description: "Vitrified tile flooring (600x600mm) with bedding",
    unit: "sqm",
    quantity: 1450,
    rate: 1850,
    category: "Finishes",
    ingredients: [
      { name: "Vitrified tile 600x600", type: "material", quantity: 1.05, unit: "sqm", rate: 950 },
      { name: "Tile adhesive", type: "material", quantity: 4.5, unit: "kg", rate: 55 },
      { name: "Cement slurry", type: "material", quantity: 2, unit: "kg", rate: 18 },
      { name: "Tile mason", type: "labor", quantity: 0.22, unit: "day", rate: 1500 },
      { name: "Unskilled labor", type: "labor", quantity: 0.28, unit: "day", rate: 800 },
      { name: "Tile cutter", type: "equipment", quantity: 0.04, unit: "hr", rate: 350 },
    ],
  },
  {
    code: "4.2",
    description: "Acrylic emulsion paint (2 coats) on plastered walls",
    unit: "sqm",
    quantity: 2680,
    rate: 185,
    category: "Finishes",
    ingredients: [
      { name: "Primer coat", type: "material", quantity: 0.1, unit: "litre", rate: 380 },
      { name: "Acrylic emulsion paint", type: "material", quantity: 0.18, unit: "litre", rate: 420 },
      { name: "Painter (skilled)", type: "labor", quantity: 0.08, unit: "day", rate: 1300 },
      { name: "Unskilled labor", type: "labor", quantity: 0.04, unit: "day", rate: 800 },
      { name: "Scaffolding (rental)", type: "equipment", quantity: 0.02, unit: "day", rate: 250 },
    ],
  },
];

async function main() {
  console.log("Locating project BRT-001…");
  const project = await db.project.findFirst({ where: { code: "BRT-001" } });
  if (!project) {
    throw new Error(
      "BRT-001 project not found. Run `bun prisma/seed.ts` first to seed the demo project."
    );
  }

  // Idempotent: clear existing BOQ items for this project.
  const existing = await db.boqItem.count({ where: { projectId: project.id } });
  if (existing > 0) {
    console.log(`Clearing ${existing} existing BOQ items for ${project.code}…`);
    await db.boqItem.deleteMany({ where: { projectId: project.id } });
  }

  console.log(`Seeding ${SEED.length} BOQ items with ingredients…`);
  let totalAmount = 0;
  for (let i = 0; i < SEED.length; i++) {
    const s = SEED[i];
    const amount = s.quantity * s.rate;
    totalAmount += amount;

    // Build ingredient create rows with their own amount pre-calculated.
    const ingredients = s.ingredients.map((ing) => ({
      name: ing.name,
      type: ing.type,
      quantity: ing.quantity,
      unit: ing.unit,
      rate: ing.rate,
      amount: ing.quantity * ing.rate,
    }));

    await db.boqItem.create({
      data: {
        projectId: project.id,
        code: s.code,
        description: s.description,
        unit: s.unit,
        quantity: s.quantity,
        rate: s.rate,
        amount,
        category: s.category,
        sortOrder: i,
        ingredients: { create: ingredients },
      },
    });

    console.log(
      `  ${s.code.padEnd(5)} ${s.description.slice(0, 60).padEnd(62)} ${s.quantity
        .toString()
        .padStart(8)} ${s.unit.padEnd(4)} NPR ${s.rate
        .toLocaleString()
        .padStart(8)}  → NPR ${amount.toLocaleString()}`
    );
  }

  console.log(
    `\nSeeded ${SEED.length} items. Grand total = NPR ${totalAmount.toLocaleString()}`
  );
  console.log("Done.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
