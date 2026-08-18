import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

function normalize(s: string) {
  return s.toLowerCase().trim().replace(/\s+/g, " ");
}

interface SeedItem {
  category: string;
  name: string;
  subCategory: string;
  defaultUnit: string;
  defaultRate: number;
  rateSource: string;
}

const INFRASTRUCTURE_MATERIALS: SeedItem[] = [
  // ─── ROADS & HIGHWAY CONSTRUCTION ───
  { category: "Roads & Highways", name: "Bitumen", subCategory: "VG-30 Grade", defaultUnit: "kg", defaultRate: 110, rateSource: "Morang 2080/81" },
  { category: "Roads & Highways", name: "Bitumen", subCategory: "VG-40 Grade", defaultUnit: "kg", defaultRate: 118, rateSource: "Morang 2080/81" },
  { category: "Roads & Highways", name: "Bitumen Emulsion", subCategory: "Rapid Setting (RS-1)", defaultUnit: "ltr", defaultRate: 95, rateSource: "Morang 2080/81" },
  { category: "Roads & Highways", name: "Bitumen Emulsion", subCategory: "Slow Setting (SS-1)", defaultUnit: "ltr", defaultRate: 92, rateSource: "Morang 2080/81" },
  { category: "Roads & Highways", name: "Asphalt Concrete", subCategory: "Wearing Course (40mm)", defaultUnit: "cum", defaultRate: 14500, rateSource: "Morang 2080/81" },
  { category: "Roads & Highways", name: "Dense Bituminous Macadam", subCategory: "DBM (50mm - 75mm)", defaultUnit: "cum", defaultRate: 13200, rateSource: "Morang 2080/81" },
  { category: "Roads & Highways", name: "Aggregate Base Course", subCategory: "ABC Crusher Run (0-40mm)", defaultUnit: "cum", defaultRate: 2400, rateSource: "Morang 2080/81" },
  { category: "Roads & Highways", name: "Sub-Base Material", subCategory: "Granular Soil/Gravel (0-75mm)", defaultUnit: "cum", defaultRate: 1800, rateSource: "Morang 2080/81" },
  { category: "Roads & Highways", name: "Gabion Wire Mesh", subCategory: "Heavy Galvanized Hexagonal (8x10cm)", defaultUnit: "sqm", defaultRate: 480, rateSource: "Morang 2080/81" },
  { category: "Roads & Highways", name: "Geotextile Fabric", subCategory: "Non-Woven Polypropylene (200 GSM)", defaultUnit: "sqm", defaultRate: 220, rateSource: "Morang 2080/81" },
  { category: "Roads & Highways", name: "Geotextile Fabric", subCategory: "Non-Woven Polypropylene (400 GSM)", defaultUnit: "sqm", defaultRate: 380, rateSource: "Morang 2080/81" },
  { category: "Roads & Highways", name: "Guard Rail", subCategory: "W-Beam Galvanized Steel Railing", defaultUnit: "rmt", defaultRate: 4200, rateSource: "Morang 2080/81" },
  { category: "Roads & Highways", name: "Road Marking Paint", subCategory: "Thermoplastic White/Yellow", defaultUnit: "kg", defaultRate: 260, rateSource: "Morang 2080/81" },
  { category: "Roads & Highways", name: "Cat Eyes / Road Studs", subCategory: "Aluminum Solar Reflective", defaultUnit: "nos", defaultRate: 850, rateSource: "Morang 2080/81" },

  // ─── HYDROPOWER & TUNNELING CONSTRUCTION ───
  { category: "Hydropower & Tunneling", name: "Micro-Silica / Silica Fume", subCategory: "High Performance Additive", defaultUnit: "kg", defaultRate: 45, rateSource: "Hydropower Standard 2026" },
  { category: "Hydropower & Tunneling", name: "Shotcrete Admixture", subCategory: "Liquid Alkali-Free Accelerator", defaultUnit: "kg", defaultRate: 160, rateSource: "Hydropower Standard 2026" },
  { category: "Hydropower & Tunneling", name: "Rock Bolt", subCategory: "Self-Drilling Anchor (SDA 32mm)", defaultUnit: "rmt", defaultRate: 1850, rateSource: "Hydropower Standard 2026" },
  { category: "Hydropower & Tunneling", name: "Rock Bolt", subCategory: "Expandable Friction Bolt (Swellex 24mm)", defaultUnit: "rmt", defaultRate: 1450, rateSource: "Hydropower Standard 2026" },
  { category: "Hydropower & Tunneling", name: "Rock Bolt", subCategory: "Resin Grouted TMT Bolt (25mm dia)", defaultUnit: "rmt", defaultRate: 980, rateSource: "Hydropower Standard 2026" },
  { category: "Hydropower & Tunneling", name: "Steel Arch Rib", subCategory: "ISMB 150 Structural Steel", defaultUnit: "kg", defaultRate: 125, rateSource: "Hydropower Standard 2026" },
  { category: "Hydropower & Tunneling", name: "Steel Arch Rib", subCategory: "ISMB 250 Heavy Steel Support", defaultUnit: "kg", defaultRate: 132, rateSource: "Hydropower Standard 2026" },
  { category: "Hydropower & Tunneling", name: "Penstock Steel Plate", subCategory: "High Tensile Fe 510 Grade", defaultUnit: "kg", defaultRate: 145, rateSource: "Hydropower Standard 2026" },
  { category: "Hydropower & Tunneling", name: "Penstock Steel Plate", subCategory: "Fe 410 Structural Grade", defaultUnit: "kg", defaultRate: 130, rateSource: "Hydropower Standard 2026" },
  { category: "Hydropower & Tunneling", name: "Tunnel Waterproofing", subCategory: "PVC Sheet Membrane (2.0mm)", defaultUnit: "sqm", defaultRate: 650, rateSource: "Hydropower Standard 2026" },
  { category: "Hydropower & Tunneling", name: "Forepoling Pipe", subCategory: "Perforated Steel Pipe (76mm dia)", defaultUnit: "rmt", defaultRate: 1600, rateSource: "Hydropower Standard 2026" },
  { category: "Hydropower & Tunneling", name: "Weldmesh", subCategory: "Heavy Tunnel Mesh (100x100x6mm)", defaultUnit: "sqm", defaultRate: 340, rateSource: "Hydropower Standard 2026" },
  { category: "Hydropower & Tunneling", name: "Non-Shrink Grout", subCategory: "High-Strength Precision Grout", defaultUnit: "bag", defaultRate: 1250, rateSource: "Hydropower Standard 2026" },

  // ─── CIVIL & CONCRETE ───
  { category: "Civil & Concrete", name: "Cement", subCategory: "OPC 53 Grade", defaultUnit: "bag", defaultRate: 750, rateSource: "Morang 2080/81" },
  { category: "Civil & Concrete", name: "Cement", subCategory: "OPC 43 Grade", defaultUnit: "bag", defaultRate: 710, rateSource: "Morang 2080/81" },
  { category: "Civil & Concrete", name: "Cement", subCategory: "PPC (Pozzolana Portland)", defaultUnit: "bag", defaultRate: 640, rateSource: "Morang 2080/81" },
  { category: "Civil & Concrete", name: "Sand", subCategory: "Washed River Sand", defaultUnit: "cum", defaultRate: 2800, rateSource: "Morang 2080/81" },
  { category: "Civil & Concrete", name: "Sand", subCategory: "Crusher Manufactured Sand", defaultUnit: "cum", defaultRate: 2600, rateSource: "Morang 2080/81" },
  { category: "Civil & Concrete", name: "Aggregate", subCategory: "10mm Crushed Stone", defaultUnit: "cum", defaultRate: 2400, rateSource: "Morang 2080/81" },
  { category: "Civil & Concrete", name: "Aggregate", subCategory: "20mm Crushed Stone", defaultUnit: "cum", defaultRate: 2650, rateSource: "Morang 2080/81" },
  { category: "Civil & Concrete", name: "Aggregate", subCategory: "40mm Crushed Stone", defaultUnit: "cum", defaultRate: 2200, rateSource: "Morang 2080/81" },
  { category: "Civil & Concrete", name: "Aggregate", subCategory: "Boulders / Heavy Riprap", defaultUnit: "cum", defaultRate: 1950, rateSource: "Morang 2080/81" },
  { category: "Civil & Concrete", name: "Fly Ash", subCategory: "Grade I Pozzolanic", defaultUnit: "bag", defaultRate: 320, rateSource: "Market Standard 2026" },

  // ─── STEEL & REBAR ───
  { category: "Steel & Rebar", name: "Rebar", subCategory: "Fe500D TMT (8mm)", defaultUnit: "kg", defaultRate: 98, rateSource: "Morang 2080/81" },
  { category: "Steel & Rebar", name: "Rebar", subCategory: "Fe500D TMT (10mm)", defaultUnit: "kg", defaultRate: 96, rateSource: "Morang 2080/81" },
  { category: "Steel & Rebar", name: "Rebar", subCategory: "Fe500D TMT (12mm)", defaultUnit: "kg", defaultRate: 95, rateSource: "Morang 2080/81" },
  { category: "Steel & Rebar", name: "Rebar", subCategory: "Fe500D TMT (16mm)", defaultUnit: "kg", defaultRate: 94, rateSource: "Morang 2080/81" },
  { category: "Steel & Rebar", name: "Rebar", subCategory: "Fe500D TMT (20mm)", defaultUnit: "kg", defaultRate: 94, rateSource: "Morang 2080/81" },
  { category: "Steel & Rebar", name: "Rebar", subCategory: "Fe500D TMT (25mm)", defaultUnit: "kg", defaultRate: 95, rateSource: "Morang 2080/81" },
  { category: "Steel & Rebar", name: "Rebar", subCategory: "Fe500D TMT (32mm)", defaultUnit: "kg", defaultRate: 97, rateSource: "Morang 2080/81" },
  { category: "Steel & Rebar", name: "Binding Wire", subCategory: "20 SWG Annealed Wire", defaultUnit: "kg", defaultRate: 140, rateSource: "Morang 2080/81" },
  { category: "Steel & Rebar", name: "Structural Steel", subCategory: "MS Plate (10mm - 25mm)", defaultUnit: "kg", defaultRate: 110, rateSource: "Morang 2080/81" },

  // ─── PLUMBING & DRAINAGE ───
  { category: "Plumbing & Sanitary", name: "RCC Pipe", subCategory: "NP3 Heavy Drain (300mm dia)", defaultUnit: "rmt", defaultRate: 1450, rateSource: "Morang 2080/81" },
  { category: "Plumbing & Sanitary", name: "RCC Pipe", subCategory: "NP3 Heavy Drain (600mm dia)", defaultUnit: "rmt", defaultRate: 2800, rateSource: "Morang 2080/81" },
  { category: "Plumbing & Sanitary", name: "RCC Pipe", subCategory: "NP4 High Load Culvert (1000mm dia)", defaultUnit: "rmt", defaultRate: 6500, rateSource: "Morang 2080/81" },
  { category: "Plumbing & Sanitary", name: "HDPE Pipe", subCategory: "PN-10 Pressure Pipe (110mm dia)", defaultUnit: "rmt", defaultRate: 620, rateSource: "Morang 2080/81" },
  { category: "Plumbing & Sanitary", name: "HDPE Pipe", subCategory: "PN-10 Pressure Pipe (200mm dia)", defaultUnit: "rmt", defaultRate: 1850, rateSource: "Morang 2080/81" },

  // ─── LABOR (SPECIALIZED & GENERAL) ───
  { category: "Labor", name: "Tunnel Miner", subCategory: "Hydro Specialist", defaultUnit: "day", defaultRate: 1800, rateSource: "Morang 2080/81" },
  { category: "Labor", name: "Blaster", subCategory: "Licensed Explosive Specialist", defaultUnit: "day", defaultRate: 2200, rateSource: "Morang 2080/81" },
  { category: "Labor", name: "Shotcrete Operator", subCategory: "Robotic Spray Operator", defaultUnit: "day", defaultRate: 1600, rateSource: "Morang 2080/81" },
  { category: "Labor", name: "Heavy Equipment Operator", subCategory: "Excavator/Grader/Roller", defaultUnit: "day", defaultRate: 1500, rateSource: "Morang 2080/81" },
  { category: "Labor", name: "Mason", subCategory: "Skilled Stone/Gabion Mason", defaultUnit: "day", defaultRate: 1200, rateSource: "Morang 2080/81" },
  { category: "Labor", name: "Bar Bender", subCategory: "Skilled Rebar Specialist", defaultUnit: "day", defaultRate: 1150, rateSource: "Morang 2080/81" },
  { category: "Labor", name: "Unskilled Labourer", subCategory: "General Labourer", defaultUnit: "day", defaultRate: 850, rateSource: "Morang 2080/81" },

  // ─── EQUIPMENT & MACHINERY ───
  { category: "Equipment & Machinery", name: "Excavator", subCategory: "1.2 cum Heavy Duty", defaultUnit: "hour", defaultRate: 3500, rateSource: "Morang 2080/81" },
  { category: "Equipment & Machinery", name: "Motor Grader", subCategory: "140 HP Heavy Duty", defaultUnit: "hour", defaultRate: 4200, rateSource: "Morang 2080/81" },
  { category: "Equipment & Machinery", name: "Vibratory Roller", subCategory: "10-12 Ton Soil/Asphalt", defaultUnit: "hour", defaultRate: 2800, rateSource: "Morang 2080/81" },
  { category: "Equipment & Machinery", name: "Asphalt Paver", subCategory: "Hydrostatic Sensor Paver", defaultUnit: "hour", defaultRate: 6500, rateSource: "Morang 2080/81" },
  { category: "Equipment & Machinery", name: "Hot Mix Plant", subCategory: "80-100 TPH Batch Plant", defaultUnit: "hour", defaultRate: 18000, rateSource: "Morang 2080/81" },
  { category: "Equipment & Machinery", name: "Aggregate Crusher", subCategory: "100 TPH Jaw/Cone Crusher", defaultUnit: "hour", defaultRate: 15000, rateSource: "Morang 2080/81" },
  { category: "Equipment & Machinery", name: "Concrete Batching Plant", subCategory: "60 cum/hr Automatic", defaultUnit: "hour", defaultRate: 8500, rateSource: "Morang 2080/81" },
  { category: "Equipment & Machinery", name: "Robotic Shotcrete Rig", subCategory: "Wet Mix Spray Robot", defaultUnit: "hour", defaultRate: 9500, rateSource: "Hydropower Standard 2026" },
  { category: "Equipment & Machinery", name: "Jumbo Drill Rig", subCategory: "Two-Boom Electro-Hydraulic", defaultUnit: "hour", defaultRate: 14000, rateSource: "Hydropower Standard 2026" },
  { category: "Equipment & Machinery", name: "Tipper Truck", subCategory: "16-Ton Tri-Axle", defaultUnit: "hour", defaultRate: 2200, rateSource: "Morang 2080/81" },
  { category: "Equipment & Machinery", name: "Transit Mixer", subCategory: "6 cum Concrete Carrier", defaultUnit: "hour", defaultRate: 2600, rateSource: "Morang 2080/81" },
];

async function seed() {
  console.log("Cleaning up existing Superuser/Global MaterialCatalog items...");

  // Delete all global master catalog items (organizationId: null or isGlobal: true)
  const deletedCount = await db.materialCatalog.deleteMany({
    where: {
      OR: [{ organizationId: null }, { isGlobal: true }],
    },
  });
  console.log(`Deleted ${deletedCount.count} existing Global MaterialCatalog items.`);

  console.log("Seeding new Roads & Hydropower Infrastructure Material Catalog...");

  let createdCount = 0;
  for (const item of INFRASTRUCTURE_MATERIALS) {
    const fullName = item.subCategory ? `${item.name} ${item.subCategory}` : item.name;
    const normalizedName = normalize(fullName);

    await db.materialCatalog.create({
      data: {
        organizationId: null, // Superuser / Global Master
        name: item.name,
        normalizedName,
        category: item.category,
        subCategory: item.subCategory,
        defaultUnit: item.defaultUnit,
        defaultRate: item.defaultRate,
        rateSource: item.rateSource,
        isGlobal: true,
      },
    });
    createdCount++;
  }

  console.log(`Successfully seeded ${createdCount} Global Infrastructure Material Catalog items!`);
}

seed()
  .catch((e) => {
    console.error("Seeding failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
