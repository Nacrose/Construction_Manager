// Seed Rate Profile Items with realistic DoR/Market rates
import { PrismaClient } from "@prisma/client";
import { createSeedDb, enableSeedRlsBypass } from "./seed-rls";

const db = createSeedDb(); // single connection — see ./seed-rls (RLS phases 1–2)

async function main() {
  await enableSeedRlsBypass(db); // RLS phases 1–2: seeds write cross-org reference data
  const project = await db.project.findFirst({ where: { code: "BRT-001" } });
  if (!project) {
    console.error("Project BRT-001 not found");
    process.exit(1);
  }
  const profiles = await db.rateProfile.findMany({ where: { projectId: project.id } });

  // Common items with rates per district/market
  const commonItems = [
    // Materials
    { name: "Cement OPC 53", unit: "bag", type: "material" },
    { name: "Cement OPC 43", unit: "bag", type: "material" },
    { name: "Sand (River)", unit: "cum", type: "material" },
    { name: "Sand (Crushed)", unit: "cum", type: "material" },
    { name: "Aggregate 20mm", unit: "cum", type: "material" },
    { name: "Aggregate 40mm", unit: "cum", type: "material" },
    { name: "Aggregate 10mm", unit: "cum", type: "material" },
    { name: "TMT Bar Fe500", unit: "kg", type: "material" },
    { name: "TMT Bar Fe500D", unit: "kg", type: "material" },
    { name: "Binding Wire", unit: "kg", type: "material" },
    { name: "Brick Class A", unit: "no", type: "material" },
    { name: "Brick Class B", unit: "no", type: "material" },
    { name: "Stone", unit: "cum", type: "material" },
    { name: "Boulder", unit: "cum", type: "material" },
    { name: "Gravel", unit: "cum", type: "material" },
    { name: "Water", unit: "ltr", type: "material" },
    { name: "Admixture", unit: "ltr", type: "material" },
    { name: "Curing Compound", unit: "ltr", type: "material" },
    { name: "Formwork Plywood", unit: "sqm", type: "material" },
    { name: "Formwork Timber", unit: "cum", type: "material" },
    { name: "Nails", unit: "kg", type: "material" },
    { name: "Shuttering Oil", unit: "ltr", type: "material" },
    { name: "Paint Primer", unit: "ltr", type: "material" },
    { name: "Emulsion Paint", unit: "ltr", type: "material" },
    { name: "Enamel Paint", unit: "ltr", type: "material" },
    { name: "Putty", unit: "kg", type: "material" },
    { name: "Tile Adhesive", unit: "kg", type: "material" },
    { name: "Grout", unit: "kg", type: "material" },

    // Labor
    { name: "Mason (Skilled)", unit: "day", type: "labor" },
    { name: "Carpenter (Skilled)", unit: "day", type: "labor" },
    { name: "Bar Bender (Skilled)", unit: "day", type: "labor" },
    { name: "Welder (Skilled)", unit: "day", type: "labor" },
    { name: "Plumber (Skilled)", unit: "day", type: "labor" },
    { name: "Electrician (Skilled)", unit: "day", type: "labor" },
    { name: "Painter (Skilled)", unit: "day", type: "labor" },
    { name: "Tile Layer (Skilled)", unit: "day", type: "labor" },
    { name: "Laborer (Unskilled)", unit: "day", type: "labor" },
    { name: "Helper", unit: "day", type: "labor" },
    { name: "Supervisor", unit: "day", type: "labor" },
    { name: "Foreman", unit: "day", type: "labor" },

    // Equipment
    { name: "Concrete Mixer", unit: "day", type: "equipment" },
    { name: "Concrete Pump", unit: "day", type: "equipment" },
    { name: "Vibrator (Needle)", unit: "day", type: "equipment" },
    { name: "Vibrator (Plate)", unit: "day", type: "equipment" },
    { name: "Excavator (JCB)", unit: "day", type: "equipment" },
    { name: "Backhoe Loader", unit: "day", type: "equipment" },
    { name: "Roller (8-10T)", unit: "day", type: "equipment" },
    { name: "Roller (Tandem)", unit: "day", type: "equipment" },
    { name: "Grader", unit: "day", type: "equipment" },
    { name: "Water Tanker", unit: "day", type: "equipment" },
    { name: "Generator", unit: "day", type: "equipment" },
    { name: "Tower Crane", unit: "day", type: "equipment" },
    { name: "Mobile Crane", unit: "day", type: "equipment" },
    { name: "Scaffolding", unit: "day", type: "equipment" },
    { name: "Dewatering Pump", unit: "day", type: "equipment" },

    // Overhead (percentage-based, handled separately)
  ];

  // Rate variations by profile (approximate DoR/Market rates in NPR)
  const rates = {
    "District Rate Kathmandu 2080": {
      "Cement OPC 53": 950, "Cement OPC 43": 900,
      "Sand (River)": 3500, "Sand (Crushed)": 2800,
      "Aggregate 20mm": 2800, "Aggregate 40mm": 2600, "Aggregate 10mm": 3000,
      "TMT Bar Fe500": 125, "TMT Bar Fe500D": 130, "Binding Wire": 150,
      "Brick Class A": 15, "Brick Class B": 12,
      "Stone": 2500, "Boulder": 2000, "Gravel": 2200,
      "Water": 2, "Admixture": 200, "Curing Compound": 150,
      "Formwork Plywood": 1200, "Formwork Timber": 35000, "Nails": 150, "Shuttering Oil": 120,
      "Paint Primer": 450, "Emulsion Paint": 550, "Enamel Paint": 650, "Putty": 40,
      "Tile Adhesive": 35, "Grout": 40,
      "Mason (Skilled)": 1200, "Carpenter (Skilled)": 1200, "Bar Bender (Skilled)": 1300,
      "Welder (Skilled)": 1500, "Plumber (Skilled)": 1400, "Electrician (Skilled)": 1500,
      "Painter (Skilled)": 1200, "Tile Layer (Skilled)": 1300,
      "Laborer (Unskilled)": 800, "Helper": 700, "Supervisor": 2000, "Foreman": 2500,
      "Concrete Mixer": 2500, "Concrete Pump": 8000, "Vibrator (Needle)": 800, "Vibrator (Plate)": 1500,
      "Excavator (JCB)": 12000, "Backhoe Loader": 10000, "Roller (8-10T)": 9000,
      "Roller (Tandem)": 11000, "Grader": 15000, "Water Tanker": 5000,
      "Generator": 3000, "Tower Crane": 25000, "Mobile Crane": 18000,
      "Scaffolding": 500, "Dewatering Pump": 2000,
    },
    "District Rate Lalitpur 2080": {
      "Cement OPC 53": 960, "Cement OPC 43": 910,
      "Sand (River)": 3600, "Sand (Crushed)": 2900,
      "Aggregate 20mm": 2900, "Aggregate 40mm": 2700, "Aggregate 10mm": 3100,
      "TMT Bar Fe500": 127, "TMT Bar Fe500D": 132, "Binding Wire": 155,
      "Brick Class A": 16, "Brick Class B": 13,
      "Stone": 2600, "Boulder": 2100, "Gravel": 2300,
      "Water": 2, "Admixture": 210, "Curing Compound": 160,
      "Formwork Plywood": 1250, "Formwork Timber": 36000, "Nails": 155, "Shuttering Oil": 125,
      "Paint Primer": 460, "Emulsion Paint": 560, "Enamel Paint": 660, "Putty": 42,
      "Tile Adhesive": 36, "Grout": 41,
      "Mason (Skilled)": 1220, "Carpenter (Skilled)": 1220, "Bar Bender (Skilled)": 1320,
      "Welder (Skilled)": 1520, "Plumber (Skilled)": 1420, "Electrician (Skilled)": 1520,
      "Painter (Skilled)": 1220, "Tile Layer (Skilled)": 1320,
      "Laborer (Unskilled)": 820, "Helper": 720, "Supervisor": 2050, "Foreman": 2550,
      "Concrete Mixer": 2600, "Concrete Pump": 8200, "Vibrator (Needle)": 820, "Vibrator (Plate)": 1550,
      "Excavator (JCB)": 12500, "Backhoe Loader": 10500, "Roller (8-10T)": 9500,
      "Roller (Tandem)": 11500, "Grader": 15500, "Water Tanker": 5200,
      "Generator": 3100, "Tower Crane": 26000, "Mobile Crane": 19000,
      "Scaffolding": 520, "Dewatering Pump": 2100,
    },
    "District Rate Bhaktapur 2080": {
      "Cement OPC 53": 970, "Cement OPC 43": 920,
      "Sand (River)": 3700, "Sand (Crushed)": 3000,
      "Aggregate 20mm": 3000, "Aggregate 40mm": 2800, "Aggregate 10mm": 3200,
      "TMT Bar Fe500": 128, "TMT Bar Fe500D": 133, "Binding Wire": 158,
      "Brick Class A": 16, "Brick Class B": 13,
      "Stone": 2700, "Boulder": 2200, "Gravel": 2400,
      "Water": 2, "Admixture": 215, "Curing Compound": 165,
      "Formwork Plywood": 1280, "Formwork Timber": 37000, "Nails": 160, "Shuttering Oil": 130,
      "Paint Primer": 470, "Emulsion Paint": 570, "Enamel Paint": 670, "Putty": 44,
      "Tile Adhesive": 37, "Grout": 42,
      "Mason (Skilled)": 1240, "Carpenter (Skilled)": 1240, "Bar Bender (Skilled)": 1340,
      "Welder (Skilled)": 1540, "Plumber (Skilled)": 1440, "Electrician (Skilled)": 1540,
      "Painter (Skilled)": 1240, "Tile Layer (Skilled)": 1340,
      "Laborer (Unskilled)": 830, "Helper": 730, "Supervisor": 2080, "Foreman": 2600,
      "Concrete Mixer": 2650, "Concrete Pump": 8400, "Vibrator (Needle)": 840, "Vibrator (Plate)": 1580,
      "Excavator (JCB)": 12800, "Backhoe Loader": 10800, "Roller (8-10T)": 9800,
      "Roller (Tandem)": 11800, "Grader": 15800, "Water Tanker": 5400,
      "Generator": 3200, "Tower Crane": 26500, "Mobile Crane": 19500,
      "Scaffolding": 540, "Dewatering Pump": 2200,
    },
    "Market Rate Kathmandu 2081": {
      "Cement OPC 53": 980, "Cement OPC 43": 930,
      "Sand (River)": 3800, "Sand (Crushed)": 3100,
      "Aggregate 20mm": 3100, "Aggregate 40mm": 2900, "Aggregate 10mm": 3300,
      "TMT Bar Fe500": 130, "TMT Bar Fe500D": 135, "Binding Wire": 160,
      "Brick Class A": 17, "Brick Class B": 14,
      "Stone": 2800, "Boulder": 2300, "Gravel": 2500,
      "Water": 2, "Admixture": 220, "Curing Compound": 170,
      "Formwork Plywood": 1300, "Formwork Timber": 38000, "Nails": 165, "Shuttering Oil": 135,
      "Paint Primer": 480, "Emulsion Paint": 580, "Enamel Paint": 680, "Putty": 45,
      "Tile Adhesive": 38, "Grout": 43,
      "Mason (Skilled)": 1260, "Carpenter (Skilled)": 1260, "Bar Bender (Skilled)": 1360,
      "Welder (Skilled)": 1560, "Plumber (Skilled)": 1460, "Electrician (Skilled)": 1560,
      "Painter (Skilled)": 1260, "Tile Layer (Skilled)": 1360,
      "Laborer (Unskilled)": 850, "Helper": 750, "Supervisor": 2100, "Foreman": 2650,
      "Concrete Mixer": 2700, "Concrete Pump": 8600, "Vibrator (Needle)": 860, "Vibrator (Plate)": 1600,
      "Excavator (JCB)": 13000, "Backhoe Loader": 11000, "Roller (8-10T)": 10000,
      "Roller (Tandem)": 12000, "Grader": 16000, "Water Tanker": 5500,
      "Generator": 3300, "Tower Crane": 27000, "Mobile Crane": 20000,
      "Scaffolding": 550, "Dewatering Pump": 2300,
    },
  };

  for (const profile of profiles) {
    const profileRates = rates[profile.name];
    if (!profileRates) continue;

    console.log(`Seeding items for: ${profile.name}`);
    for (const item of commonItems) {
      const rate = profileRates[item.name];
      if (rate === undefined) continue;

      const existing = await db.rateProfileItem.findFirst({
        where: { rateProfileId: profile.id, materialName: item.name },
      });
      if (existing) continue;

      await db.rateProfileItem.create({
        data: {
          rateProfileId: profile.id,
          materialName: item.name,
          unit: item.unit,
          rate: rate,
        },
      });
    }
    console.log(`  ✓ ${profile.name}: items created`);
  }

  console.log("\nDone!");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await db.$disconnect(); });
