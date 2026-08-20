// Comprehensive seed: Global Rate Catalog + DoR Rate Analysis Preset Library
// Run: npx tsx prisma/seed-comprehensive.ts
import { PrismaClient } from "@prisma/client";
import { DOR_PRESETS as DOR_RAW_PRESETS } from "../src/lib/dor-norms-data";

const db = new PrismaClient();

// ─── PART 1: Rate Catalog (Ingredients List with Kathmandu District Rates) ───────

const DISTRICT = "Kathmandu";
const FISCAL_YEAR = "2081/82";
const RATE_CATALOG_NAME = `DoR District Rate ${FISCAL_YEAR} — ${DISTRICT}`;

type CatalogItemInput = {
  code: number;
  materialName: string;
  unit: string;
  category: string;
  rate: number;
};

const CATALOG_ITEMS: CatalogItemInput[] = [
  // ── Cement & Binders ──
  { code: 1, materialName: "Cement OPC 53 Grade", unit: "bag", category: "Cement", rate: 980 },
  { code: 2, materialName: "Cement OPC 43 Grade", unit: "bag", category: "Cement", rate: 930 },
  { code: 3, materialName: "Cement PPC", unit: "bag", category: "Cement", rate: 880 },
  { code: 4, materialName: "White Cement", unit: "bag", category: "Cement", rate: 1600 },
  { code: 5, materialName: "Lime (Hydrated)", unit: "kg", category: "Cement", rate: 25 },

  // ── Aggregates & Sand ──
  { code: 6, materialName: "Sand (River)", unit: "cum", category: "Aggregate", rate: 3800 },
  { code: 7, materialName: "Sand (Crushed/Stone Dust)", unit: "cum", category: "Aggregate", rate: 3100 },
  { code: 8, materialName: "Coarse Aggregate 40mm", unit: "cum", category: "Aggregate", rate: 2900 },
  { code: 9, materialName: "Coarse Aggregate 20mm", unit: "cum", category: "Aggregate", rate: 3100 },
  { code: 10, materialName: "Coarse Aggregate 10mm", unit: "cum", category: "Aggregate", rate: 3300 },
  { code: 11, materialName: "Gravel (River)", unit: "cum", category: "Aggregate", rate: 2500 },
  { code: 12, materialName: "Boulder", unit: "cum", category: "Aggregate", rate: 2200 },
  { code: 13, materialName: "Stone (Hard)", unit: "cum", category: "Aggregate", rate: 2800 },
  { code: 14, materialName: "Stone Chips (for ballast)", unit: "cum", category: "Aggregate", rate: 2600 },
  { code: 15, materialName: "Granular Sub-base Material", unit: "cum", category: "Aggregate", rate: 1800 },

  // ── Steel & Reinforcement ──
  { code: 16, materialName: "TMT Bar Fe500 (6mm)", unit: "kg", category: "Steel", rate: 135 },
  { code: 17, materialName: "TMT Bar Fe500 (8mm)", unit: "kg", category: "Steel", rate: 130 },
  { code: 18, materialName: "TMT Bar Fe500 (10mm)", unit: "kg", category: "Steel", rate: 128 },
  { code: 19, materialName: "TMT Bar Fe500 (12mm)", unit: "kg", category: "Steel", rate: 125 },
  { code: 20, materialName: "TMT Bar Fe500 (16-32mm)", unit: "kg", category: "Steel", rate: 125 },
  { code: 21, materialName: "TMT Bar Fe500D (all dia)", unit: "kg", category: "Steel", rate: 130 },
  { code: 22, materialName: "TMT Bar Fe550 (all dia)", unit: "kg", category: "Steel", rate: 135 },
  { code: 23, materialName: "MS Angle", unit: "kg", category: "Steel", rate: 145 },
  { code: 24, materialName: "MS Channel", unit: "kg", category: "Steel", rate: 145 },
  { code: 25, materialName: "MS Beam (I/H)", unit: "kg", category: "Steel", rate: 150 },
  { code: 26, materialName: "MS Plate (6mm-20mm)", unit: "kg", category: "Steel", rate: 155 },
  { code: 27, materialName: "GI Pipe (Medium, per m)", unit: "m", category: "Steel", rate: 850 },
  { code: 28, materialName: "GI Sheet (26 gauge)", unit: "sqm", category: "Steel", rate: 1200 },
  { code: 29, materialName: "Binding Wire (16/18 gauge)", unit: "kg", category: "Steel", rate: 160 },
  { code: 30, materialName: "Welding Electrode", unit: "kg", category: "Steel", rate: 350 },
  { code: 31, materialName: "Barbed Wire", unit: "m", category: "Steel", rate: 85 },
  { code: 32, materialName: "Wire Mesh (GI welded)", unit: "sqm", category: "Steel", rate: 650 },
  { code: 33, materialName: "Expanded Metal", unit: "sqm", category: "Steel", rate: 550 },
  { code: 34, materialName: "PTFE/Bearing Plate", unit: "kg", category: "Steel", rate: 450 },

  // ── Bricks & Blocks ──
  { code: 35, materialName: "Brick Class A (1st Class)", unit: "no", category: "Masonry", rate: 17 },
  { code: 36, materialName: "Brick Class B (2nd Class)", unit: "no", category: "Masonry", rate: 14 },
  { code: 37, materialName: "Brick Class C (3rd Class)", unit: "no", category: "Masonry", rate: 10 },
  { code: 38, materialName: "Concrete Hollow Block (4\")", unit: "no", category: "Masonry", rate: 55 },
  { code: 39, materialName: "Concrete Hollow Block (6\")", unit: "no", category: "Masonry", rate: 70 },
  { code: 40, materialName: "Concrete Hollow Block (8\")", unit: "no", category: "Masonry", rate: 85 },
  { code: 41, materialName: "Interlocking Paver Block (60mm)", unit: "sqm", category: "Masonry", rate: 450 },
  { code: 42, materialName: "Interlocking Paver Block (80mm)", unit: "sqm", category: "Masonry", rate: 550 },
  { code: 43, materialName: "Fire Brick", unit: "no", category: "Masonry", rate: 45 },

  // ── Timber & Formwork ──
  { code: 44, materialName: "Plywood (12mm, Marine)", unit: "sqm", category: "Timber", rate: 1300 },
  { code: 45, materialName: "Plywood (18mm, Marine)", unit: "sqm", category: "Timber", rate: 1800 },
  { code: 46, materialName: "Timber (Sal/Hardwood)", unit: "cum", category: "Timber", rate: 55000 },
  { code: 47, materialName: "Timber (Pine/Softwood)", unit: "cum", category: "Timber", rate: 38000 },
  { code: 48, materialName: "Plywood (6mm, Commercial)", unit: "sqm", category: "Timber", rate: 700 },
  { code: 49, materialName: "Nails (Wire Nails, assorted)", unit: "kg", category: "Timber", rate: 165 },
  { code: 50, materialName: "Shuttering Oil", unit: "ltr", category: "Timber", rate: 135 },
  { code: 51, materialName: "LDPE Sheet (for curing)", unit: "sqm", category: "Timber", rate: 45 },
  { code: 52, materialName: "Scaffolding Pipe (48mm OD)", unit: "m", category: "Timber", rate: 350 },
  { code: 53, materialName: "Scaffolding Clamp", unit: "no", category: "Timber", rate: 180 },
  { code: 54, materialName: "MS Prop (Adjustable)", unit: "no", category: "Timber", rate: 1200 },
  { code: 55, materialName: "Wooden Batten (50x50mm)", unit: "m", category: "Timber", rate: 120 },

  // ── Paints & Finishes ──
  { code: 56, materialName: "Cement Primer", unit: "ltr", category: "Finishes", rate: 450 },
  { code: 57, materialName: "Synthetic Enamel Paint", unit: "ltr", category: "Finishes", rate: 680 },
  { code: 58, materialName: "Emulsion Paint (Interior)", unit: "ltr", category: "Finishes", rate: 550 },
  { code: 59, materialName: "Emulsion Paint (Exterior)", unit: "ltr", category: "Finishes", rate: 650 },
  { code: 60, materialName: "Wall Putty", unit: "kg", category: "Finishes", rate: 45 },
  { code: 61, materialName: "Distemper (Oil)", unit: "kg", category: "Finishes", rate: 120 },
  { code: 62, materialName: "Paint Thinner", unit: "ltr", category: "Finishes", rate: 280 },
  { code: 63, materialName: "Varnish", unit: "ltr", category: "Finishes", rate: 750 },
  { code: 64, materialName: "Wood Primer", unit: "ltr", category: "Finishes", rate: 520 },
  { code: 65, materialName: "Weatherproof Coating", unit: "ltr", category: "Finishes", rate: 850 },
  { code: 66, materialName: "Texture Paint (Roll-on)", unit: "kg", category: "Finishes", rate: 250 },

  // ── Flooring & Tiles ──
  { code: 67, materialName: "Ceramic Floor Tile (300x300mm)", unit: "sqm", category: "Tiles", rate: 550 },
  { code: 68, materialName: "Ceramic Wall Tile (200x300mm)", unit: "sqm", category: "Tiles", rate: 500 },
  { code: 69, materialName: "Vitrified Tile (600x600mm)", unit: "sqm", category: "Tiles", rate: 950 },
  { code: 70, materialName: "Vitrified Tile (800x800mm)", unit: "sqm", category: "Tiles", rate: 1200 },
  { code: 71, materialName: "Marble (Indian, 18mm)", unit: "sqm", category: "Tiles", rate: 2200 },
  { code: 72, materialName: "Marble (Italian, 20mm)", unit: "sqm", category: "Tiles", rate: 4500 },
  { code: 73, materialName: "Granite (20mm, polished)", unit: "sqm", category: "Tiles", rate: 3500 },
  { code: 74, materialName: "Mosaic Tile", unit: "sqm", category: "Tiles", rate: 400 },
  { code: 75, materialName: "Tile Adhesive", unit: "kg", category: "Tiles", rate: 38 },
  { code: 76, materialName: "Grout (Cementitious)", unit: "kg", category: "Tiles", rate: 45 },
  { code: 77, materialName: "Skirting Tile (100mm)", unit: "m", category: "Tiles", rate: 180 },

  // ── Plumbing & Sanitary ──
  { code: 78, materialName: "GI Pipe 15mm (1/2\")", unit: "m", category: "Plumbing", rate: 180 },
  { code: 79, materialName: "GI Pipe 20mm (3/4\")", unit: "m", category: "Plumbing", rate: 250 },
  { code: 80, materialName: "GI Pipe 25mm (1\")", unit: "m", category: "Plumbing", rate: 350 },
  { code: 81, materialName: "GI Pipe 40mm (1.5\")", unit: "m", category: "Plumbing", rate: 550 },
  { code: 82, materialName: "PVC Pipe (uPVC, 110mm)", unit: "m", category: "Plumbing", rate: 320 },
  { code: 83, materialName: "PVC Pipe (uPVC, 75mm)", unit: "m", category: "Plumbing", rate: 180 },
  { code: 84, materialName: "PVC Pipe (uPVC, 50mm)", unit: "m", category: "Plumbing", rate: 110 },
  { code: 85, materialName: "PPR Pipe (25mm)", unit: "m", category: "Plumbing", rate: 220 },
  { code: 86, materialName: "PPR Pipe (32mm)", unit: "m", category: "Plumbing", rate: 320 },
  { code: 87, materialName: "HDPE Pipe (63mm)", unit: "m", category: "Plumbing", rate: 450 },
  { code: 88, materialName: "Gate Valve (GI, 50mm)", unit: "no", category: "Plumbing", rate: 2800 },
  { code: 89, materialName: "Globe Valve (GI, 25mm)", unit: "no", category: "Plumbing", rate: 1200 },
  { code: 90, materialName: "Ball Valve (GI, 20mm)", unit: "no", category: "Plumbing", rate: 650 },
  { code: 91, materialName: "Bib Cock (15mm)", unit: "no", category: "Plumbing", rate: 350 },
  { code: 92, materialName: "Water Meter (15mm)", unit: "no", category: "Plumbing", rate: 2500 },
  { code: 93, materialName: "PVC Solvent Cement", unit: "ltr", category: "Plumbing", rate: 600 },
  { code: 94, materialName: "WC (Commode, European)", unit: "no", category: "Plumbing", rate: 8500 },
  { code: 95, materialName: "Wash Basin (Vitreous China)", unit: "no", category: "Plumbing", rate: 3500 },
  { code: 96, materialName: "C.P. Fittings (Single Lever)", unit: "set", category: "Plumbing", rate: 4500 },
  { code: 97, materialName: "Water Tank (Plastic, 1000L)", unit: "no", category: "Plumbing", rate: 6500 },

  // ── Electrical ──
  { code: 98, materialName: "PVC Conduit Pipe (20mm)", unit: "m", category: "Electrical", rate: 45 },
  { code: 99, materialName: "PVC Conduit Pipe (25mm)", unit: "m", category: "Electrical", rate: 65 },
  { code: 100, materialName: "Wire (1.5 sqmm, FR PVC)", unit: "m", category: "Electrical", rate: 22 },
  { code: 101, materialName: "Wire (2.5 sqmm, FR PVC)", unit: "m", category: "Electrical", rate: 35 },
  { code: 102, materialName: "Wire (4 sqmm, FR PVC)", unit: "m", category: "Electrical", rate: 55 },
  { code: 103, materialName: "Wire (6 sqmm, FR PVC)", unit: "m", category: "Electrical", rate: 80 },
  { code: 104, materialName: "Armored Cable (4Cx16sqmm)", unit: "m", category: "Electrical", rate: 650 },
  { code: 105, materialName: "Armored Cable (4Cx25sqmm)", unit: "m", category: "Electrical", rate: 950 },
  { code: 106, materialName: "MCB (SP, 6-32A)", unit: "no", category: "Electrical", rate: 250 },
  { code: 107, materialName: "MCB (DP, 40A)", unit: "no", category: "Electrical", rate: 550 },
  { code: 108, materialName: "MCB (TP, 63A)", unit: "no", category: "Electrical", rate: 1200 },
  { code: 109, materialName: "Switch (Piano, 6A)", unit: "no", category: "Electrical", rate: 65 },
  { code: 110, materialName: "Socket (5A, 3-pin)", unit: "no", category: "Electrical", rate: 85 },
  { code: 111, materialName: "Socket (15A, 3-pin)", unit: "no", category: "Electrical", rate: 150 },
  { code: 112, materialName: "Distribution Board (8-way)", unit: "no", category: "Electrical", rate: 1800 },
  { code: 113, materialName: "Energy Meter (Single Phase)", unit: "no", category: "Electrical", rate: 2500 },
  { code: 114, materialName: "Energy Meter (Three Phase)", unit: "no", category: "Electrical", rate: 5500 },
  { code: 115, materialName: "LED Panel Light (18W)", unit: "no", category: "Electrical", rate: 850 },
  { code: 116, materialName: "LED Street Light (50W)", unit: "no", category: "Electrical", rate: 3500 },
  { code: 117, materialName: "Copper Earthing Rod", unit: "no", category: "Electrical", rate: 2500 },
  { code: 118, materialName: "Busbar (Copper, per meter)", unit: "m", category: "Electrical", rate: 3200 },
  { code: 119, materialName: "Cable Tray (Perforated, 300mm)", unit: "m", category: "Electrical", rate: 1200 },
  { code: 120, materialName: "Changeover Switch (63A, 4P)", unit: "no", category: "Electrical", rate: 4500 },

  // ── Waterproofing ──
  { code: 121, materialName: "Waterproofing Membrane (Bituminous)", unit: "sqm", category: "Waterproofing", rate: 450 },
  { code: 122, materialName: "Waterproofing Compound (Integral)", unit: "kg", category: "Waterproofing", rate: 180 },
  { code: 123, materialName: "Bitumen (80/100 Grade)", unit: "kg", category: "Waterproofing", rate: 95 },
  { code: 124, materialName: "Bitumen (60/70 Grade)", unit: "kg", category: "Waterproofing", rate: 105 },
  { code: 125, materialName: "Bitumen Emulsion (SS1)", unit: "ltr", category: "Waterproofing", rate: 85 },
  { code: 126, materialName: "Polythene Sheet (500 gauge)", unit: "sqm", category: "Waterproofing", rate: 55 },
  { code: 127, materialName: "Joint Filler (Asphaltic)", unit: "kg", category: "Waterproofing", rate: 150 },
  { code: 128, materialName: "Joint Sealant (Silicone)", unit: "no", category: "Waterproofing", rate: 450 },

  // ── Admixtures & Chemicals ──
  { code: 129, materialName: "Plasticizer (Super)", unit: "ltr", category: "Chemicals", rate: 220 },
  { code: 130, materialName: "Retarder", unit: "ltr", category: "Chemicals", rate: 250 },
  { code: 131, materialName: "Accelerator", unit: "ltr", category: "Chemicals", rate: 280 },
  { code: 132, materialName: "Air Entraining Agent", unit: "ltr", category: "Chemicals", rate: 200 },
  { code: 133, materialName: "Curing Compound (Wax-based)", unit: "ltr", category: "Chemicals", rate: 170 },
  { code: 134, materialName: "Epoxy Grout", unit: "kg", category: "Chemicals", rate: 850 },
  { code: 135, materialName: "Chemical Anchor (Hilti)", unit: "no", category: "Chemicals", rate: 350 },
  { code: 136, materialName: "Anti-termite Chemical", unit: "ltr", category: "Chemicals", rate: 650 },

  // ── Road Works & Paving ──
  { code: 137, materialName: "Bituminous Macadam (BM)", unit: "cum", category: "Road Works", rate: 8500 },
  { code: 138, materialName: "Dense Bituminous Macadam (DBM)", unit: "cum", category: "Road Works", rate: 10500 },
  { code: 139, materialName: "Bituminous Concrete (BC)", unit: "cum", category: "Road Works", rate: 12000 },
  { code: 140, materialName: "Prime Coat (MC-30)", unit: "ltr", category: "Road Works", rate: 110 },
  { code: 141, materialName: "Tack Coat (RC-70)", unit: "ltr", category: "Road Works", rate: 95 },
  { code: 142, materialName: "Emulsion (SS-1)", unit: "ltr", category: "Road Works", rate: 85 },
  { code: 143, materialName: "Granular Sub-base (GSB)", unit: "cum", category: "Road Works", rate: 1800 },
  { code: 144, materialName: "Wet Mix Macadam (WMM)", unit: "cum", category: "Road Works", rate: 2400 },
  { code: 145, materialName: "Crusher Run", unit: "cum", category: "Road Works", rate: 1500 },
  { code: 146, materialName: "Retaining Wall Block (RCC)", unit: "no", category: "Road Works", rate: 850 },
  { code: 147, materialName: "RCC Crash Barrier (M30)", unit: "m", category: "Road Works", rate: 4500 },
  { code: 148, materialName: "GI Corrugated Pipe (900mm)", unit: "m", category: "Road Works", rate: 8500 },
  { code: 149, materialName: "RCC Pipe (NP3, 450mm)", unit: "m", category: "Road Works", rate: 2800 },
  { code: 150, materialName: "RCC Pipe (NP4, 600mm)", unit: "m", category: "Road Works", rate: 4200 },
  { code: 151, materialName: "Manhole Cover (CI, Heavy Duty)", unit: "no", category: "Road Works", rate: 5500 },
  { code: 152, materialName: "Road Stud (Reflective)", unit: "no", category: "Road Works", rate: 350 },
  { code: 153, materialName: "Road Marking Paint (Thermoplastic)", unit: "kg", category: "Road Works", rate: 250 },
  { code: 154, materialName: "Crash Barrier (Metal Beam)", unit: "m", category: "Road Works", rate: 3500 },
  { code: 155, materialName: "Fencing Post (RCC)", unit: "no", category: "Road Works", rate: 1200 },
  { code: 156, materialName: "Chain Link Mesh (Fencing)", unit: "sqm", category: "Road Works", rate: 500 },

  // ── Reinforcement & Fabrication Consumables ──
  { code: 157, materialName: "Welding Rod (Mild Steel)", unit: "kg", category: "Consumables", rate: 350 },
  { code: 158, materialName: "Cutting Disc", unit: "no", category: "Consumables", rate: 180 },
  { code: 159, materialName: "Grinding Disc", unit: "no", category: "Consumables", rate: 220 },
  { code: 160, materialName: "Gas (Oxygen/Acetylene) Set", unit: "set", category: "Consumables", rate: 3500 },
  { code: 161, materialName: "HDPE Geomembrane (1mm)", unit: "sqm", category: "Consumables", rate: 350 },
  { code: 162, materialName: "Geotextile (Non-woven)", unit: "sqm", category: "Consumables", rate: 280 },
  { code: 163, materialName: "Expansion Joint (Bitumen Fiber)", unit: "m", category: "Consumables", rate: 650 },
  { code: 164, materialName: "PVC Waterstop", unit: "m", category: "Consumables", rate: 850 },
  { code: 165, materialName: "Rubber Waterstop", unit: "m", category: "Consumables", rate: 1200 },
  { code: 166, materialName: "Curing Hose (PVC)", unit: "m", category: "Consumables", rate: 45 },
  { code: 167, materialName: "Jute Bag/Sand Bag", unit: "no", category: "Consumables", rate: 35 },

  // ── Skilled Labor ──
  { code: 168, materialName: "Mason (Skilled)", unit: "day", category: "Labor", rate: 1260 },
  { code: 169, materialName: "Carpenter (Skilled)", unit: "day", category: "Labor", rate: 1260 },
  { code: 170, materialName: "Bar Bender/Steel Fixer (Skilled)", unit: "day", category: "Labor", rate: 1360 },
  { code: 171, materialName: "Welder (Skilled)", unit: "day", category: "Labor", rate: 1560 },
  { code: 172, materialName: "Plumber (Skilled)", unit: "day", category: "Labor", rate: 1460 },
  { code: 173, materialName: "Electrician (Skilled)", unit: "day", category: "Labor", rate: 1560 },
  { code: 174, materialName: "Painter (Skilled)", unit: "day", category: "Labor", rate: 1260 },
  { code: 175, materialName: "Tile Layer (Skilled)", unit: "day", category: "Labor", rate: 1360 },
  { code: 176, materialName: "Roofing/Waterproofing (Skilled)", unit: "day", category: "Labor", rate: 1360 },
  { code: 177, materialName: "Foreman", unit: "day", category: "Labor", rate: 2650 },
  { code: 178, materialName: "Supervisor", unit: "day", category: "Labor", rate: 2100 },
  { code: 179, materialName: "Engineer (Site)", unit: "day", category: "Labor", rate: 3500 },
  { code: 180, materialName: "Heavy Equipment Operator", unit: "day", category: "Labor", rate: 2200 },
  { code: 181, materialName: "Surveyor", unit: "day", category: "Labor", rate: 2800 },
  { code: 182, materialName: "Draftsman/Computer Operator", unit: "day", category: "Labor", rate: 1600 },
  { code: 183, materialName: "Store Keeper", unit: "day", category: "Labor", rate: 1400 },
  { code: 184, materialName: "Security Guard", unit: "day", category: "Labor", rate: 900 },

  // ── Semi-Skilled Labor ──
  { code: 185, materialName: "Semi-Skilled (Painting Helper)", unit: "day", category: "Labor", rate: 950 },
  { code: 186, materialName: "Semi-Skilled (Mason Helper)", unit: "day", category: "Labor", rate: 950 },

  // ── Unskilled Labor ──
  { code: 187, materialName: "Laborer (Unskilled)", unit: "day", category: "Labor", rate: 850 },
  { code: 188, materialName: "Helper (General)", unit: "day", category: "Labor", rate: 750 },

  // ── Heavy Equipment ──
  { code: 189, materialName: "Excavator (JCB 3DX)", unit: "hour", category: "Equipment", rate: 1800 },
  { code: 190, materialName: "Excavator (200-220 HP, 20T)", unit: "hour", category: "Equipment", rate: 2800 },
  { code: 191, materialName: "Excavator (300-350 HP, 35T)", unit: "hour", category: "Equipment", rate: 3800 },
  { code: 192, materialName: "Bulldozer (D6/D7)", unit: "hour", category: "Equipment", rate: 3500 },
  { code: 193, materialName: "Bulldozer (D8/D9)", unit: "hour", category: "Equipment", rate: 5000 },
  { code: 194, materialName: "Wheel Loader/Backhoe", unit: "hour", category: "Equipment", rate: 2200 },
  { code: 195, materialName: "Motor Grader", unit: "hour", category: "Equipment", rate: 3500 },
  { code: 196, materialName: "Vibratory Roller (8-10T)", unit: "hour", category: "Equipment", rate: 2500 },
  { code: 197, materialName: "Vibratory Roller (Tandem)", unit: "hour", category: "Equipment", rate: 3000 },
  { code: 198, materialName: "Pneumatic Tyred Roller", unit: "hour", category: "Equipment", rate: 2800 },
  { code: 199, materialName: "Paver Finisher (Hydrostatic)", unit: "hour", category: "Equipment", rate: 5500 },
  { code: 200, materialName: "Paver Finisher (Mechanical)", unit: "hour", category: "Equipment", rate: 4000 },
  { code: 201, materialName: "Asphalt Mixing Plant (60-80 TPH)", unit: "hour", category: "Equipment", rate: 12000 },
  { code: 202, materialName: "Asphalt Mixing Plant (100-120 TPH)", unit: "hour", category: "Equipment", rate: 18000 },
  { code: 203, materialName: "Concrete Batching Plant (30 cum/hr)", unit: "hour", category: "Equipment", rate: 4500 },
  { code: 204, materialName: "Concrete Batching Plant (60 cum/hr)", unit: "hour", category: "Equipment", rate: 7500 },
  { code: 205, materialName: "Transit Mixer (6 cum)", unit: "hour", category: "Equipment", rate: 2800 },
  { code: 206, materialName: "Concrete Pump (Stationary)", unit: "hour", category: "Equipment", rate: 3500 },
  { code: 207, materialName: "Concrete Pump (Boom Pump)", unit: "hour", category: "Equipment", rate: 5500 },
  { code: 208, materialName: "Concrete Mixer (0.5 cum)", unit: "hour", category: "Equipment", rate: 800 },
  { code: 209, materialName: "Concrete Vibrator (Needle)", unit: "hour", category: "Equipment", rate: 350 },
  { code: 210, materialName: "Concrete Vibrator (Table/Plate)", unit: "hour", category: "Equipment", rate: 500 },
  { code: 211, materialName: "Tower Crane (120 T-m)", unit: "hour", category: "Equipment", rate: 4000 },
  { code: 212, materialName: "Mobile Crane (20T)", unit: "hour", category: "Equipment", rate: 4000 },
  { code: 213, materialName: "Mobile Crane (50T)", unit: "hour", category: "Equipment", rate: 7000 },
  { code: 214, materialName: "Mobile Crane (100T)", unit: "hour", category: "Equipment", rate: 12000 },
  { code: 215, materialName: "Dump Truck (10 cum)", unit: "hour", category: "Equipment", rate: 1800 },
  { code: 216, materialName: "Tractor Trolley", unit: "hour", category: "Equipment", rate: 1200 },
  { code: 217, materialName: "Water Tanker (10,000 L)", unit: "hour", category: "Equipment", rate: 1800 },
  { code: 218, materialName: "Air Compressor (185 CFM)", unit: "hour", category: "Equipment", rate: 1200 },
  { code: 219, materialName: "Generator (50 kVA)", unit: "hour", category: "Equipment", rate: 1500 },
  { code: 220, materialName: "Generator (100 kVA)", unit: "hour", category: "Equipment", rate: 2800 },
  { code: 221, materialName: "Generator (250 kVA)", unit: "hour", category: "Equipment", rate: 5000 },
  { code: 222, materialName: "Welding Generator (300A)", unit: "hour", category: "Equipment", rate: 800 },
  { code: 223, materialName: "Dewatering Pump (4\")", unit: "hour", category: "Equipment", rate: 500 },
  { code: 224, materialName: "Dewatering Pump (6\")", unit: "hour", category: "Equipment", rate: 800 },
  { code: 225, materialName: "Scaffolding System (Cuplock)", unit: "sqm-day", category: "Equipment", rate: 25 },
  { code: 226, materialName: "Formwork System (Slab)", unit: "sqm-day", category: "Equipment", rate: 35 },
  { code: 227, materialName: "Hot Mix Plant (Batch Type, 60-90)", unit: "hour", category: "Equipment", rate: 15000 },
  { code: 228, materialName: "Crusher Plant (Primary 200 TPH)", unit: "hour", category: "Equipment", rate: 10000 },
  { code: 229, materialName: "Crusher Plant (Secondary 150 TPH)", unit: "hour", category: "Equipment", rate: 8000 },
  { code: 230, materialName: "Stone Crusher (Jaw, 36x24\")", unit: "hour", category: "Equipment", rate: 4500 },
  { code: 231, materialName: "Vibratory Compactor (Plate)", unit: "hour", category: "Equipment", rate: 600 },
  { code: 232, materialName: "Jackhammer/Drill (Pneumatic)", unit: "hour", category: "Equipment", rate: 400 },
  { code: 233, materialName: "Soil Compactor (Rammer)", unit: "hour", category: "Equipment", rate: 400 },
  { code: 234, materialName: "Chain Saw", unit: "hour", category: "Equipment", rate: 500 },
  { code: 235, materialName: "Smooth Wheeled Roller (8-10T)", unit: "hour", category: "Equipment", rate: 2200 },
  { code: 236, materialName: "Piling Rig (Hydraulic)", unit: "hour", category: "Equipment", rate: 8000 },
  { code: 237, materialName: "Bored Cast-In-Situ Piling Rig", unit: "hour", category: "Equipment", rate: 6500 },
  { code: 238, materialName: "Diaphragm Wall Grabbing Rig", unit: "hour", category: "Equipment", rate: 10000 },
  { code: 239, materialName: "Shotcrete Machine (Guniting)", unit: "hour", category: "Equipment", rate: 2500 },
  { code: 240, materialName: "Grouting Pump", unit: "hour", category: "Equipment", rate: 1800 },
  { code: 241, materialName: "Slipform Paver", unit: "hour", category: "Equipment", rate: 12000 },
  { code: 242, materialName: "Road Marking Machine", unit: "hour", category: "Equipment", rate: 2000 },
  { code: 243, materialName: "Joint Cutting Machine", unit: "hour", category: "Equipment", rate: 1500 },
  { code: 244, materialName: "Core Cutting Machine", unit: "hour", category: "Equipment", rate: 1500 },
  { code: 245, materialName: "Jeep/Pickup (Site Vehicle)", unit: "hour", category: "Equipment", rate: 800 },
  { code: 246, materialName: "Bus/Minibus (Crew Carrier)", unit: "hour", category: "Equipment", rate: 1200 },
];

// ─── PART 2: DoR Rate Analysis Presets ──────────────────────────────────────────

type IngredientInput = {
  name: string;
  type: string;
  quantity: number;
  unit: string;
};

type PresetInput = {
  name: string;
  source: string;
  category: string;
  description: string;
  batchSize: number;
  ingredients: IngredientInput[];
};

const CURATED_PRESETS: PresetInput[] = [
  // ── Section 200: Site Clearance ──
  {
    name: "2.1 Clearing and Grubbing (Light, per 10,000 sqm)",
    source: "DoR 2075",
    category: "Site Clearance",
    description: "Clearing and grubbing road land including uprooting grass, bushes, shrubs, stumps and removal",
    batchSize: 10000,
    ingredients: [
      { name: "Laborer (Unskilled)", type: "labor", quantity: 200, unit: "day" },
      { name: "Dozer/Excavator", type: "equipment", quantity: 12, unit: "hour" },
    ],
  },
  {
    name: "2.2 Cutting of Trees (per tree, girth > 600mm)",
    source: "DoR 2075",
    category: "Site Clearance",
    description: "Cutting trees including trunks, branches, removal of stumps and roots",
    batchSize: 1,
    ingredients: [
      { name: "Laborer (Unskilled)", type: "labor", quantity: 25, unit: "day" },
      { name: "Tractor Trolley", type: "equipment", quantity: 6, unit: "hour" },
      { name: "Chain Saw", type: "equipment", quantity: 3, unit: "hour" },
    ],
  },
  {
    name: "2.3 Clearing Grass & Top Soil (per 10,000 sqm)",
    source: "DoR 2075",
    category: "Site Clearance",
    description: "Clearing grass and removal of rubbish, dressing and leveling construction surface",
    batchSize: 10000,
    ingredients: [
      { name: "Laborer (Unskilled)", type: "labor", quantity: 100, unit: "day" },
    ],
  },
  {
    name: "2.4 Dismantling of Structures (per 10 cum)",
    source: "DoR 2075",
    category: "Site Clearance",
    description: "Dismantling existing structures like culverts, bridges, retaining walls, etc.",
    batchSize: 10,
    ingredients: [
      { name: "Mason (Skilled)", type: "labor", quantity: 1, unit: "day" },
      { name: "Laborer (Unskilled)", type: "labor", quantity: 24, unit: "day" },
      { name: "Tractor Trolley", type: "equipment", quantity: 6, unit: "hour" },
      { name: "Jackhammer/Drill (Pneumatic)", type: "equipment", quantity: 6, unit: "hour" },
      { name: "Air Compressor (185 CFM)", type: "equipment", quantity: 6, unit: "hour" },
    ],
  },
  {
    name: "2.5 Dismantling Flexible Pavement (per 20 sqm)",
    source: "DoR 2075",
    category: "Site Clearance",
    description: "Dismantling flexible pavements and disposal",
    batchSize: 20,
    ingredients: [
      { name: "Mason (Skilled)", type: "labor", quantity: 1, unit: "day" },
      { name: "Laborer (Unskilled)", type: "labor", quantity: 15, unit: "day" },
      { name: "Tractor Trolley", type: "equipment", quantity: 6, unit: "hour" },
    ],
  },
  {
    name: "2.6 Dismantling CC Pavement (per 10 sqm)",
    source: "DoR 2075",
    category: "Site Clearance",
    description: "Dismantling cement concrete pavement by mechanical means",
    batchSize: 10,
    ingredients: [
      { name: "Mason (Skilled)", type: "labor", quantity: 1, unit: "day" },
      { name: "Semi-Skilled (Mason Helper)", type: "labor", quantity: 8, unit: "day" },
      { name: "Laborer (Unskilled)", type: "labor", quantity: 8, unit: "day" },
      { name: "Air Compressor (185 CFM)", type: "equipment", quantity: 6, unit: "hour" },
      { name: "Tractor Trolley", type: "equipment", quantity: 6, unit: "hour" },
      { name: "Joint Cutting Machine", type: "equipment", quantity: 6, unit: "hour" },
    ],
  },

  // ── Section 300: Earthwork ──
  {
    name: "3.1 Excavation in Ordinary Soil (per cum)",
    source: "DoR 2075",
    category: "Earthwork",
    description: "Earthwork excavation in ordinary soil including disposal up to 50m lead",
    batchSize: 1,
    ingredients: [
      { name: "Laborer (Unskilled)", type: "labor", quantity: 0.3, unit: "day" },
      { name: "Excavator (200-220 HP, 20T)", type: "equipment", quantity: 0.02, unit: "hour" },
    ],
  },
  {
    name: "3.2 Excavation in Hard Soil/Murrum (per cum)",
    source: "DoR 2075",
    category: "Earthwork",
    description: "Earthwork excavation in hard soil/murrum including disposal up to 50m lead",
    batchSize: 1,
    ingredients: [
      { name: "Laborer (Unskilled)", type: "labor", quantity: 0.5, unit: "day" },
      { name: "Excavator (200-220 HP, 20T)", type: "equipment", quantity: 0.03, unit: "hour" },
    ],
  },
  {
    name: "3.3 Excavation in Weathered Rock (per cum)",
    source: "DoR 2075",
    category: "Earthwork",
    description: "Excavation in disintegrated/weathered rock including drilling and blasting if required",
    batchSize: 1,
    ingredients: [
      { name: "Laborer (Unskilled)", type: "labor", quantity: 1.0, unit: "day" },
      { name: "Excavator (300-350 HP, 35T)", type: "equipment", quantity: 0.05, unit: "hour" },
      { name: "Jackhammer/Drill (Pneumatic)", type: "equipment", quantity: 0.5, unit: "hour" },
      { name: "Air Compressor (185 CFM)", type: "equipment", quantity: 0.5, unit: "hour" },
    ],
  },
  {
    name: "3.4 Excavation in Hard Rock (per cum)",
    source: "DoR 2075",
    category: "Earthwork",
    description: "Excavation in hard rock requiring drilling and blasting",
    batchSize: 1,
    ingredients: [
      { name: "Technician (Skilled Driller)", type: "labor", quantity: 0.5, unit: "day" },
      { name: "Laborer (Unskilled)", type: "labor", quantity: 2.0, unit: "day" },
      { name: "Jackhammer/Drill (Pneumatic)", type: "equipment", quantity: 1.0, unit: "hour" },
      { name: "Air Compressor (185 CFM)", type: "equipment", quantity: 1.0, unit: "hour" },
      { name: "Excavator (300-350 HP, 35T)", type: "equipment", quantity: 0.08, unit: "hour" },
    ],
  },
  {
    name: "3.5 Embankment Fill (per cum)",
    source: "DoR 2075",
    category: "Earthwork",
    description: "Embankment fill with approved material including compaction to 95% MDD",
    batchSize: 1,
    ingredients: [
      { name: "Laborer (Unskilled)", type: "labor", quantity: 0.15, unit: "day" },
      { name: "Excavator (200-220 HP, 20T)", type: "equipment", quantity: 0.01, unit: "hour" },
      { name: "Dump Truck (10 cum)", type: "equipment", quantity: 0.02, unit: "hour" },
      { name: "Vibratory Roller (8-10T)", type: "equipment", quantity: 0.01, unit: "hour" },
      { name: "Water Tanker (10,000 L)", type: "equipment", quantity: 0.01, unit: "hour" },
    ],
  },
  {
    name: "3.6 Excavation for Foundation (per cum)",
    source: "DoR 2075",
    category: "Earthwork",
    description: "Excavation for foundation in ordinary soil including dewatering and shoring",
    batchSize: 1,
    ingredients: [
      { name: "Carpenter (Skilled)", type: "labor", quantity: 0.1, unit: "day" },
      { name: "Laborer (Unskilled)", type: "labor", quantity: 1.0, unit: "day" },
      { name: "Timber (Sal/Hardwood)", type: "material", quantity: 0.01, unit: "cum" },
      { name: "Dewatering Pump (4\")", type: "equipment", quantity: 0.5, unit: "hour" },
    ],
  },
  {
    name: "3.7 Backfilling (per cum)",
    source: "DoR 2075",
    category: "Earthwork",
    description: "Backfilling with selected material including watering and compaction",
    batchSize: 1,
    ingredients: [
      { name: "Laborer (Unskilled)", type: "labor", quantity: 0.5, unit: "day" },
      { name: "Vibratory Compactor (Plate)", type: "equipment", quantity: 0.1, unit: "hour" },
      { name: "Water", type: "material", quantity: 50, unit: "ltr" },
    ],
  },
  {
    name: "3.8 Sand Filling (per cum)",
    source: "DoR 2075",
    category: "Earthwork",
    description: "Sand filling under floors including compaction",
    batchSize: 1,
    ingredients: [
      { name: "Sand (River)", type: "material", quantity: 1.2, unit: "cum" },
      { name: "Laborer (Unskilled)", type: "labor", quantity: 0.4, unit: "day" },
      { name: "Water", type: "material", quantity: 30, unit: "ltr" },
    ],
  },

  // ── Section 400: Sub-base & Base ──
  {
    name: "4.1 Granular Sub-base (GSB, per cum)",
    source: "DoR 2075",
    category: "Sub-base & Base",
    description: "Granular sub-base (GSB) material spreading and compaction as per spec",
    batchSize: 1,
    ingredients: [
      { name: "Granular Sub-base Material", type: "material", quantity: 1.25, unit: "cum" },
      { name: "Laborer (Unskilled)", type: "labor", quantity: 0.2, unit: "day" },
      { name: "Motor Grader", type: "equipment", quantity: 0.02, unit: "hour" },
      { name: "Vibratory Roller (8-10T)", type: "equipment", quantity: 0.02, unit: "hour" },
      { name: "Water Tanker (10,000 L)", type: "equipment", quantity: 0.02, unit: "hour" },
    ],
  },
  {
    name: "4.2 Wet Mix Macadam (WMM, per cum)",
    source: "DoR 2075",
    category: "Sub-base & Base",
    description: "Wet mix macadam base course including mixing, spreading and compaction",
    batchSize: 1,
    ingredients: [
      { name: "Wet Mix Macadam (WMM)", type: "material", quantity: 1.25, unit: "cum" },
      { name: "Laborer (Unskilled)", type: "labor", quantity: 0.15, unit: "day" },
      { name: "Paver Finisher (Mechanical)", type: "equipment", quantity: 0.01, unit: "hour" },
      { name: "Vibratory Roller (8-10T)", type: "equipment", quantity: 0.02, unit: "hour" },
      { name: "Water Tanker (10,000 L)", type: "equipment", quantity: 0.02, unit: "hour" },
    ],
  },
  {
    name: "4.3 Water Bound Macadam (WBM, per cum)",
    source: "DoR 2075",
    category: "Sub-base & Base",
    description: "Water bound macadam base course with screenings and consolidation",
    batchSize: 1,
    ingredients: [
      { name: "Coarse Aggregate 40mm", type: "material", quantity: 1.1, unit: "cum" },
      { name: "Stone Chips (for ballast)", type: "material", quantity: 0.3, unit: "cum" },
      { name: "Laborer (Unskilled)", type: "labor", quantity: 0.5, unit: "day" },
      { name: "Vibratory Roller (8-10T)", type: "equipment", quantity: 0.03, unit: "hour" },
      { name: "Water Tanker (10,000 L)", type: "equipment", quantity: 0.03, unit: "hour" },
    ],
  },

  // ── Section 500: Pavement (Bituminous) ──
  {
    name: "5.1 Prime Coat (per sqm)",
    source: "DoR 2075",
    category: "Bituminous Pavement",
    description: "Prime coat application with MC-30 on prepared granular base",
    batchSize: 1,
    ingredients: [
      { name: "Prime Coat (MC-30)", type: "material", quantity: 1.2, unit: "ltr" },
      { name: "Laborer (Unskilled)", type: "labor", quantity: 0.002, unit: "day" },
    ],
  },
  {
    name: "5.2 Tack Coat (per sqm)",
    source: "DoR 2075",
    category: "Bituminous Pavement",
    description: "Tack coat application with RC-70 on existing bituminous surface",
    batchSize: 1,
    ingredients: [
      { name: "Tack Coat (RC-70)", type: "material", quantity: 0.5, unit: "ltr" },
      { name: "Laborer (Unskilled)", type: "labor", quantity: 0.001, unit: "day" },
    ],
  },
  {
    name: "5.3 Bituminous Macadam (BM, per cum)",
    source: "DoR 2075",
    category: "Bituminous Pavement",
    description: "Bituminous macadam base course with hot mix application",
    batchSize: 1,
    ingredients: [
      { name: "Bituminous Macadam (BM)", type: "material", quantity: 1.15, unit: "cum" },
      { name: "Laborer (Unskilled)", type: "labor", quantity: 0.1, unit: "day" },
      { name: "Paver Finisher (Hydrostatic)", type: "equipment", quantity: 0.01, unit: "hour" },
      { name: "Vibratory Roller (8-10T)", type: "equipment", quantity: 0.015, unit: "hour" },
      { name: "Pneumatic Tyred Roller", type: "equipment", quantity: 0.015, unit: "hour" },
    ],
  },
  {
    name: "5.4 Dense Bituminous Macadam (DBM, per cum)",
    source: "DoR 2075",
    category: "Bituminous Pavement",
    description: "Dense bituminous macadam binder course",
    batchSize: 1,
    ingredients: [
      { name: "Dense Bituminous Macadam (DBM)", type: "material", quantity: 1.15, unit: "cum" },
      { name: "Laborer (Unskilled)", type: "labor", quantity: 0.15, unit: "day" },
      { name: "Paver Finisher (Hydrostatic)", type: "equipment", quantity: 0.012, unit: "hour" },
      { name: "Vibratory Roller (8-10T)", type: "equipment", quantity: 0.02, unit: "hour" },
      { name: "Pneumatic Tyred Roller", type: "equipment", quantity: 0.02, unit: "hour" },
    ],
  },
  {
    name: "5.5 Bituminous Concrete (BC, per cum)",
    source: "DoR 2075",
    category: "Bituminous Pavement",
    description: "Bituminous concrete wearing course",
    batchSize: 1,
    ingredients: [
      { name: "Bituminous Concrete (BC)", type: "material", quantity: 1.15, unit: "cum" },
      { name: "Laborer (Unskilled)", type: "labor", quantity: 0.2, unit: "day" },
      { name: "Paver Finisher (Hydrostatic)", type: "equipment", quantity: 0.015, unit: "hour" },
      { name: "Vibratory Roller (8-10T)", type: "equipment", quantity: 0.025, unit: "hour" },
      { name: "Pneumatic Tyred Roller", type: "equipment", quantity: 0.025, unit: "hour" },
    ],
  },
  {
    name: "5.6 Seal Coat (per sqm)",
    source: "DoR 2075",
    category: "Bituminous Pavement",
    description: "Seal coat of bitumen and screening on bituminous surface",
    batchSize: 1,
    ingredients: [
      { name: "Bitumen (80/100 Grade)", type: "material", quantity: 0.6, unit: "kg" },
      { name: "Stone Chips (for ballast)", type: "material", quantity: 0.005, unit: "cum" },
      { name: "Laborer (Unskilled)", type: "labor", quantity: 0.003, unit: "day" },
    ],
  },

  // ── Section 600: Cement Concrete Pavement ──
  {
    name: "6.1 PQC M40 (per cum)",
    source: "DoR 2075",
    category: "Concrete Pavement",
    description: "Pavement quality concrete M40 per cum including all materials and finishing",
    batchSize: 1,
    ingredients: [
      { name: "Cement OPC 53 Grade", type: "material", quantity: 8.5, unit: "bag" },
      { name: "Sand (River)", type: "material", quantity: 0.38, unit: "cum" },
      { name: "Coarse Aggregate 20mm", type: "material", quantity: 0.45, unit: "cum" },
      { name: "Coarse Aggregate 10mm", type: "material", quantity: 0.38, unit: "cum" },
      { name: "Mason (Skilled)", type: "labor", quantity: 0.5, unit: "day" },
      { name: "Laborer (Unskilled)", type: "labor", quantity: 2.0, unit: "day" },
      { name: "Concrete Mixer (0.5 cum)", type: "equipment", quantity: 0.15, unit: "hour" },
      { name: "Concrete Vibrator (Needle)", type: "equipment", quantity: 0.2, unit: "hour" },
      { name: "Joint Cutting Machine", type: "equipment", quantity: 0.05, unit: "hour" },
    ],
  },
  {
    name: "6.2 Dry Lean Concrete (DLC, per cum)",
    source: "DoR 2075",
    category: "Concrete Pavement",
    description: "Dry lean concrete sub-base for concrete pavement",
    batchSize: 1,
    ingredients: [
      { name: "Cement OPC 43 Grade", type: "material", quantity: 3.5, unit: "bag" },
      { name: "Sand (River)", type: "material", quantity: 0.45, unit: "cum" },
      { name: "Coarse Aggregate 20mm", type: "material", quantity: 0.85, unit: "cum" },
      { name: "Laborer (Unskilled)", type: "labor", quantity: 1.0, unit: "day" },
      { name: "Concrete Mixer (0.5 cum)", type: "equipment", quantity: 0.1, unit: "hour" },
    ],
  },

  // ── Section 700: Structures (Concrete, Steel, Formwork) ──
  {
    name: "7.1 RCC M30 (1:1:3) per cum",
    source: "DoR 2075",
    category: "Concrete",
    description: "RCC M30 grade concrete in superstructure per cum",
    batchSize: 1,
    ingredients: [
      { name: "Cement OPC 53 Grade", type: "material", quantity: 8.0, unit: "bag" },
      { name: "Sand (River)", type: "material", quantity: 0.4, unit: "cum" },
      { name: "Coarse Aggregate 20mm", type: "material", quantity: 0.85, unit: "cum" },
      { name: "Mason (Skilled)", type: "labor", quantity: 0.5, unit: "day" },
      { name: "Laborer (Unskilled)", type: "labor", quantity: 1.5, unit: "day" },
      { name: "Concrete Mixer (0.5 cum)", type: "equipment", quantity: 0.15, unit: "hour" },
      { name: "Concrete Vibrator (Needle)", type: "equipment", quantity: 0.2, unit: "hour" },
    ],
  },
  {
    name: "7.2 RCC M25 (1:1:2) per cum",
    source: "DoR 2075",
    category: "Concrete",
    description: "RCC M25 grade concrete for structural elements per cum",
    batchSize: 1,
    ingredients: [
      { name: "Cement OPC 53 Grade", type: "material", quantity: 7.5, unit: "bag" },
      { name: "Sand (River)", type: "material", quantity: 0.42, unit: "cum" },
      { name: "Coarse Aggregate 20mm", type: "material", quantity: 0.83, unit: "cum" },
      { name: "Mason (Skilled)", type: "labor", quantity: 0.5, unit: "day" },
      { name: "Laborer (Unskilled)", type: "labor", quantity: 1.5, unit: "day" },
      { name: "Concrete Mixer (0.5 cum)", type: "equipment", quantity: 0.15, unit: "hour" },
      { name: "Concrete Vibrator (Needle)", type: "equipment", quantity: 0.2, unit: "hour" },
    ],
  },
  {
    name: "7.3 RCC M20 (1:1.5:3) per cum",
    source: "DoR 2075",
    category: "Concrete",
    description: "RCC M20 grade concrete for general structural works per cum",
    batchSize: 1,
    ingredients: [
      { name: "Cement OPC 53 Grade", type: "material", quantity: 6.5, unit: "bag" },
      { name: "Sand (River)", type: "material", quantity: 0.46, unit: "cum" },
      { name: "Coarse Aggregate 20mm", type: "material", quantity: 0.91, unit: "cum" },
      { name: "Mason (Skilled)", type: "labor", quantity: 0.5, unit: "day" },
      { name: "Laborer (Unskilled)", type: "labor", quantity: 1.5, unit: "day" },
      { name: "Concrete Mixer (0.5 cum)", type: "equipment", quantity: 0.15, unit: "hour" },
      { name: "Concrete Vibrator (Needle)", type: "equipment", quantity: 0.15, unit: "hour" },
    ],
  },
  {
    name: "7.4 PCC M15 (1:2:4) per cum",
    source: "DoR 2075",
    category: "Concrete",
    description: "Plain cement concrete M15 for foundations, flooring, etc.",
    batchSize: 1,
    ingredients: [
      { name: "Cement OPC 43 Grade", type: "material", quantity: 5.0, unit: "bag" },
      { name: "Sand (River)", type: "material", quantity: 0.45, unit: "cum" },
      { name: "Coarse Aggregate 20mm", type: "material", quantity: 0.9, unit: "cum" },
      { name: "Laborer (Unskilled)", type: "labor", quantity: 1.5, unit: "day" },
      { name: "Concrete Mixer (0.5 cum)", type: "equipment", quantity: 0.12, unit: "hour" },
      { name: "Concrete Vibrator (Plate)", type: "equipment", quantity: 0.1, unit: "hour" },
    ],
  },
  {
    name: "7.5 PCC 1:4:8 per cum",
    source: "DoR 2075",
    category: "Concrete",
    description: "Plain cement concrete 1:4:8 for foundation/lean concrete",
    batchSize: 1,
    ingredients: [
      { name: "Cement OPC 43 Grade", type: "material", quantity: 3.5, unit: "bag" },
      { name: "Sand (River)", type: "material", quantity: 0.44, unit: "cum" },
      { name: "Coarse Aggregate 40mm", type: "material", quantity: 0.89, unit: "cum" },
      { name: "Laborer (Unskilled)", type: "labor", quantity: 1.0, unit: "day" },
      { name: "Concrete Mixer (0.5 cum)", type: "equipment", quantity: 0.1, unit: "hour" },
    ],
  },
  {
    name: "7.6 PCC 1:3:6 per cum",
    source: "DoR 2075",
    category: "Concrete",
    description: "Plain cement concrete 1:3:6 for foundations/blinding",
    batchSize: 1,
    ingredients: [
      { name: "Cement OPC 43 Grade", type: "material", quantity: 4.0, unit: "bag" },
      { name: "Sand (River)", type: "material", quantity: 0.44, unit: "cum" },
      { name: "Coarse Aggregate 40mm", type: "material", quantity: 0.88, unit: "cum" },
      { name: "Laborer (Unskilled)", type: "labor", quantity: 1.0, unit: "day" },
      { name: "Concrete Mixer (0.5 cum)", type: "equipment", quantity: 0.1, unit: "hour" },
    ],
  },
  {
    name: "7.7 M20 Pumped Concrete per cum (small quantity)",
    source: "DoR 2075",
    category: "Concrete",
    description: "RCC M20 grade concrete placed by concrete pump",
    batchSize: 1,
    ingredients: [
      { name: "Cement OPC 53 Grade", type: "material", quantity: 6.5, unit: "bag" },
      { name: "Sand (River)", type: "material", quantity: 0.46, unit: "cum" },
      { name: "Coarse Aggregate 20mm", type: "material", quantity: 0.91, unit: "cum" },
      { name: "Plasticizer (Super)", type: "material", quantity: 3.0, unit: "ltr" },
      { name: "Mason (Skilled)", type: "labor", quantity: 0.3, unit: "day" },
      { name: "Laborer (Unskilled)", type: "labor", quantity: 1.0, unit: "day" },
      { name: "Concrete Pump (Stationary)", type: "equipment", quantity: 0.1, unit: "hour" },
      { name: "Transit Mixer (6 cum)", type: "equipment", quantity: 0.15, unit: "hour" },
    ],
  },
  {
    name: "7.8 Mass Concrete (per cum)",
    source: "DoR 2075",
    category: "Concrete",
    description: "Mass concrete for retaining walls, abutments, etc.",
    batchSize: 1,
    ingredients: [
      { name: "Cement OPC 43 Grade", type: "material", quantity: 5.0, unit: "bag" },
      { name: "Sand (River)", type: "material", quantity: 0.45, unit: "cum" },
      { name: "Coarse Aggregate 40mm", type: "material", quantity: 0.9, unit: "cum" },
      { name: "Boulder", type: "material", quantity: 0.4, unit: "cum" },
      { name: "Laborer (Unskilled)", type: "labor", quantity: 2.0, unit: "day" },
      { name: "Concrete Mixer (0.5 cum)", type: "equipment", quantity: 0.15, unit: "hour" },
      { name: "Concrete Vibrator (Needle)", type: "equipment", quantity: 0.15, unit: "hour" },
    ],
  },
  {
    name: "7.9 Reinforcement Steel Fe500 (per kg)",
    source: "DoR 2075",
    category: "Steel",
    description: "Steel reinforcement Fe500 including cutting, bending, binding and placing",
    batchSize: 1,
    ingredients: [
      { name: "TMT Bar Fe500 (12mm)", type: "material", quantity: 1.03, unit: "kg" },
      { name: "Binding Wire (16/18 gauge)", type: "material", quantity: 0.02, unit: "kg" },
      { name: "Bar Bender/Steel Fixer (Skilled)", type: "labor", quantity: 0.01, unit: "day" },
      { name: "Laborer (Unskilled)", type: "labor", quantity: 0.01, unit: "day" },
    ],
  },
  {
    name: "7.10 Formwork for Slab (per sqm)",
    source: "DoR 2075",
    category: "Formwork",
    description: "Formwork for RCC slabs including centering, shuttering and removal",
    batchSize: 1,
    ingredients: [
      { name: "Plywood (18mm, Marine)", type: "material", quantity: 0.15, unit: "sqm" },
      { name: "Timber (Sal/Hardwood)", type: "material", quantity: 0.005, unit: "cum" },
      { name: "Wooden Batten (50x50mm)", type: "material", quantity: 1.5, unit: "m" },
      { name: "Nails (Wire Nails, assorted)", type: "material", quantity: 0.15, unit: "kg" },
      { name: "Shuttering Oil", type: "material", quantity: 0.05, unit: "ltr" },
      { name: "Carpenter (Skilled)", type: "labor", quantity: 0.15, unit: "day" },
      { name: "Laborer (Unskilled)", type: "labor", quantity: 0.15, unit: "day" },
    ],
  },
  {
    name: "7.11 Formwork for Beam (per sqm)",
    source: "DoR 2075",
    category: "Formwork",
    description: "Formwork for RCC beams including centering, shuttering and removal",
    batchSize: 1,
    ingredients: [
      { name: "Plywood (18mm, Marine)", type: "material", quantity: 0.2, unit: "sqm" },
      { name: "Timber (Sal/Hardwood)", type: "material", quantity: 0.008, unit: "cum" },
      { name: "MS Prop (Adjustable)", type: "equipment", quantity: 0.05, unit: "no" },
      { name: "Nails (Wire Nails, assorted)", type: "material", quantity: 0.2, unit: "kg" },
      { name: "Shuttering Oil", type: "material", quantity: 0.06, unit: "ltr" },
      { name: "Carpenter (Skilled)", type: "labor", quantity: 0.2, unit: "day" },
      { name: "Laborer (Unskilled)", type: "labor", quantity: 0.2, unit: "day" },
    ],
  },
  {
    name: "7.12 Formwork for Column (per sqm)",
    source: "DoR 2075",
    category: "Formwork",
    description: "Formwork for RCC columns including shuttering, bracing and removal",
    batchSize: 1,
    ingredients: [
      { name: "Plywood (18mm, Marine)", type: "material", quantity: 0.2, unit: "sqm" },
      { name: "Timber (Sal/Hardwood)", type: "material", quantity: 0.006, unit: "cum" },
      { name: "Nails (Wire Nails, assorted)", type: "material", quantity: 0.15, unit: "kg" },
      { name: "Shuttering Oil", type: "material", quantity: 0.05, unit: "ltr" },
      { name: "Carpenter (Skilled)", type: "labor", quantity: 0.25, unit: "day" },
      { name: "Laborer (Unskilled)", type: "labor", quantity: 0.15, unit: "day" },
    ],
  },
  {
    name: "7.13 Formwork for Wall (per sqm)",
    source: "DoR 2075",
    category: "Formwork",
    description: "Formwork for RCC walls including shuttering, bracing and removal",
    batchSize: 1,
    ingredients: [
      { name: "Plywood (18mm, Marine)", type: "material", quantity: 0.18, unit: "sqm" },
      { name: "Timber (Sal/Hardwood)", type: "material", quantity: 0.005, unit: "cum" },
      { name: "Nails (Wire Nails, assorted)", type: "material", quantity: 0.12, unit: "kg" },
      { name: "Shuttering Oil", type: "material", quantity: 0.05, unit: "ltr" },
      { name: "Carpenter (Skilled)", type: "labor", quantity: 0.2, unit: "day" },
      { name: "Laborer (Unskilled)", type: "labor", quantity: 0.15, unit: "day" },
    ],
  },

  // ── Section 800: Masonry ──
  {
    name: "8.1 Brickwork 1:4 (Cement Mortar, per cum)",
    source: "DoR 2075",
    category: "Masonry",
    description: "Brickwork in 1:4 cement mortar for superstructure",
    batchSize: 1,
    ingredients: [
      { name: "Brick Class A (1st Class)", type: "material", quantity: 500, unit: "no" },
      { name: "Cement OPC 43 Grade", type: "material", quantity: 1.75, unit: "bag" },
      { name: "Sand (River)", type: "material", quantity: 0.28, unit: "cum" },
      { name: "Mason (Skilled)", type: "labor", quantity: 0.8, unit: "day" },
      { name: "Laborer (Unskilled)", type: "labor", quantity: 1.2, unit: "day" },
    ],
  },
  {
    name: "8.2 Brickwork 1:5 (Cement Mortar, per cum)",
    source: "DoR 2075",
    category: "Masonry",
    description: "Brickwork in 1:5 cement mortar for general works",
    batchSize: 1,
    ingredients: [
      { name: "Brick Class A (1st Class)", type: "material", quantity: 500, unit: "no" },
      { name: "Cement OPC 43 Grade", type: "material", quantity: 1.5, unit: "bag" },
      { name: "Sand (River)", type: "material", quantity: 0.3, unit: "cum" },
      { name: "Mason (Skilled)", type: "labor", quantity: 0.8, unit: "day" },
      { name: "Laborer (Unskilled)", type: "labor", quantity: 1.2, unit: "day" },
    ],
  },
  {
    name: "8.3 Brickwork 1:6 (Cement Mortar, per cum)",
    source: "DoR 2075",
    category: "Masonry",
    description: "Brickwork in 1:6 cement mortar for foundation/plinth",
    batchSize: 1,
    ingredients: [
      { name: "Brick Class A (1st Class)", type: "material", quantity: 500, unit: "no" },
      { name: "Cement OPC 43 Grade", type: "material", quantity: 1.25, unit: "bag" },
      { name: "Sand (River)", type: "material", quantity: 0.3, unit: "cum" },
      { name: "Mason (Skilled)", type: "labor", quantity: 0.8, unit: "day" },
      { name: "Laborer (Unskilled)", type: "labor", quantity: 1.2, unit: "day" },
    ],
  },
  {
    name: "8.4 Concrete Block Masonry (4\" block, per sqm)",
    source: "DoR 2075",
    category: "Masonry",
    description: "Concrete hollow block masonry in cement mortar 1:6",
    batchSize: 1,
    ingredients: [
      { name: "Concrete Hollow Block (4\")", type: "material", quantity: 12, unit: "no" },
      { name: "Cement OPC 43 Grade", type: "material", quantity: 0.15, unit: "bag" },
      { name: "Sand (River)", type: "material", quantity: 0.025, unit: "cum" },
      { name: "Mason (Skilled)", type: "labor", quantity: 0.12, unit: "day" },
      { name: "Laborer (Unskilled)", type: "labor", quantity: 0.12, unit: "day" },
    ],
  },
  {
    name: "8.5 Concrete Block Masonry (6\" block, per sqm)",
    source: "DoR 2075",
    category: "Masonry",
    description: "Concrete hollow block masonry in cement mortar 1:6",
    batchSize: 1,
    ingredients: [
      { name: "Concrete Hollow Block (6\")", type: "material", quantity: 10, unit: "no" },
      { name: "Cement OPC 43 Grade", type: "material", quantity: 0.18, unit: "bag" },
      { name: "Sand (River)", type: "material", quantity: 0.03, unit: "cum" },
      { name: "Mason (Skilled)", type: "labor", quantity: 0.12, unit: "day" },
      { name: "Laborer (Unskilled)", type: "labor", quantity: 0.12, unit: "day" },
    ],
  },
  {
    name: "8.6 Stone Masonry (Random Rubble, per cum)",
    source: "DoR 2075",
    category: "Masonry",
    description: "Random rubble stone masonry in cement mortar 1:6",
    batchSize: 1,
    ingredients: [
      { name: "Stone (Hard)", type: "material", quantity: 1.2, unit: "cum" },
      { name: "Cement OPC 43 Grade", type: "material", quantity: 2.0, unit: "bag" },
      { name: "Sand (River)", type: "material", quantity: 0.35, unit: "cum" },
      { name: "Mason (Skilled)", type: "labor", quantity: 1.5, unit: "day" },
      { name: "Laborer (Unskilled)", type: "labor", quantity: 2.0, unit: "day" },
    ],
  },
  {
    name: "8.7 Stone Masonry (Coursed Rubble, per cum)",
    source: "DoR 2075",
    category: "Masonry",
    description: "Coursed rubble stone masonry in cement mortar 1:6",
    batchSize: 1,
    ingredients: [
      { name: "Stone (Hard)", type: "material", quantity: 1.15, unit: "cum" },
      { name: "Cement OPC 43 Grade", type: "material", quantity: 2.5, unit: "bag" },
      { name: "Sand (River)", type: "material", quantity: 0.4, unit: "cum" },
      { name: "Mason (Skilled)", type: "labor", quantity: 2.0, unit: "day" },
      { name: "Laborer (Unskilled)", type: "labor", quantity: 2.5, unit: "day" },
    ],
  },
  {
    name: "8.8 Damp Proof Course (DPC, per sqm)",
    source: "DoR 2075",
    category: "Masonry",
    description: "Cement concrete DPC 1:2:4 with waterproofing compound",
    batchSize: 1,
    ingredients: [
      { name: "Cement OPC 43 Grade", type: "material", quantity: 0.4, unit: "bag" },
      { name: "Sand (River)", type: "material", quantity: 0.035, unit: "cum" },
      { name: "Coarse Aggregate 10mm", type: "material", quantity: 0.07, unit: "cum" },
      { name: "Waterproofing Compound (Integral)", type: "material", quantity: 0.1, unit: "kg" },
      { name: "Mason (Skilled)", type: "labor", quantity: 0.08, unit: "day" },
      { name: "Laborer (Unskilled)", type: "labor", quantity: 0.08, unit: "day" },
    ],
  },

  // ── Section 900: Finishes ──
  {
    name: "9.1 Cement Plaster 12mm (1:4, per sqm)",
    source: "DoR 2075",
    category: "Finishes",
    description: "12mm thick cement plaster 1:4 on walls",
    batchSize: 1,
    ingredients: [
      { name: "Cement OPC 43 Grade", type: "material", quantity: 0.2, unit: "bag" },
      { name: "Sand (River)", type: "material", quantity: 0.02, unit: "cum" },
      { name: "Mason (Skilled)", type: "labor", quantity: 0.1, unit: "day" },
      { name: "Laborer (Unskilled)", type: "labor", quantity: 0.15, unit: "day" },
    ],
  },
  {
    name: "9.2 Cement Plaster 20mm (1:4, per sqm)",
    source: "DoR 2075",
    category: "Finishes",
    description: "20mm thick cement plaster 1:4 on walls",
    batchSize: 1,
    ingredients: [
      { name: "Cement OPC 43 Grade", type: "material", quantity: 0.34, unit: "bag" },
      { name: "Sand (River)", type: "material", quantity: 0.034, unit: "cum" },
      { name: "Mason (Skilled)", type: "labor", quantity: 0.12, unit: "day" },
      { name: "Laborer (Unskilled)", type: "labor", quantity: 0.18, unit: "day" },
    ],
  },
  {
    name: "9.3 Cement Plaster 20mm (1:6, per sqm)",
    source: "DoR 2075",
    category: "Finishes",
    description: "20mm thick cement plaster 1:6 on walls",
    batchSize: 1,
    ingredients: [
      { name: "Cement OPC 43 Grade", type: "material", quantity: 0.25, unit: "bag" },
      { name: "Sand (River)", type: "material", quantity: 0.04, unit: "cum" },
      { name: "Mason (Skilled)", type: "labor", quantity: 0.12, unit: "day" },
      { name: "Laborer (Unskilled)", type: "labor", quantity: 0.18, unit: "day" },
    ],
  },
  {
    name: "9.4 Neat Cement Punishing (per sqm)",
    source: "DoR 2075",
    category: "Finishes",
    description: "Neat cement punning/rendering on concrete surface",
    batchSize: 1,
    ingredients: [
      { name: "Cement OPC 43 Grade", type: "material", quantity: 0.1, unit: "bag" },
      { name: "Mason (Skilled)", type: "labor", quantity: 0.05, unit: "day" },
      { name: "Laborer (Unskilled)", type: "labor", quantity: 0.05, unit: "day" },
    ],
  },
  {
    name: "9.5 White Washing (3 coats, per sqm)",
    source: "DoR 2075",
    category: "Finishes",
    description: "White washing with lime/cement paint 3 coats",
    batchSize: 1,
    ingredients: [
      { name: "White Cement", type: "material", quantity: 0.1, unit: "bag" },
      { name: "Laborer (Unskilled)", type: "labor", quantity: 0.04, unit: "day" },
    ],
  },
  {
    name: "9.6 Cement Primer + Emulsion Paint (2 coats, per sqm)",
    source: "DoR 2075",
    category: "Finishes",
    description: "One coat cement primer and two coats emulsion paint on walls",
    batchSize: 1,
    ingredients: [
      { name: "Cement Primer", type: "material", quantity: 0.15, unit: "ltr" },
      { name: "Emulsion Paint (Interior)", type: "material", quantity: 0.25, unit: "ltr" },
      { name: "Wall Putty", type: "material", quantity: 0.15, unit: "kg" },
      { name: "Painter (Skilled)", type: "labor", quantity: 0.04, unit: "day" },
      { name: "Semi-Skilled (Painting Helper)", type: "labor", quantity: 0.04, unit: "day" },
    ],
  },
  {
    name: "9.7 Oil Paint on Wood (2 coats, per sqm)",
    source: "DoR 2075",
    category: "Finishes",
    description: "Oil/enamel paint 2 coats on wood surface including primer",
    batchSize: 1,
    ingredients: [
      { name: "Wood Primer", type: "material", quantity: 0.12, unit: "ltr" },
      { name: "Synthetic Enamel Paint", type: "material", quantity: 0.12, unit: "ltr" },
      { name: "Paint Thinner", type: "material", quantity: 0.02, unit: "ltr" },
      { name: "Painter (Skilled)", type: "labor", quantity: 0.05, unit: "day" },
      { name: "Semi-Skilled (Painting Helper)", type: "labor", quantity: 0.03, unit: "day" },
    ],
  },
  {
    name: "9.8 Enamel Paint on Steel (2 coats, per sqm)",
    source: "DoR 2075",
    category: "Finishes",
    description: "Enamel paint 2 coats on steel/iron surface including primer and wire brushing",
    batchSize: 1,
    ingredients: [
      { name: "Cement Primer", type: "material", quantity: 0.1, unit: "ltr" },
      { name: "Synthetic Enamel Paint", type: "material", quantity: 0.12, unit: "ltr" },
      { name: "Paint Thinner", type: "material", quantity: 0.02, unit: "ltr" },
      { name: "Painter (Skilled)", type: "labor", quantity: 0.05, unit: "day" },
      { name: "Laborer (Unskilled)", type: "labor", quantity: 0.03, unit: "day" },
    ],
  },
  {
    name: "9.9 Flooring with Ceramic Tile (per sqm)",
    source: "DoR 2075",
    category: "Finishes",
    description: "Ceramic floor tile laying with cement mortar bedding",
    batchSize: 1,
    ingredients: [
      { name: "Ceramic Floor Tile (300x300mm)", type: "material", quantity: 1.05, unit: "sqm" },
      { name: "Cement OPC 43 Grade", type: "material", quantity: 0.3, unit: "bag" },
      { name: "Sand (River)", type: "material", quantity: 0.03, unit: "cum" },
      { name: "Tile Adhesive", type: "material", quantity: 0.5, unit: "kg" },
      { name: "Grout (Cementitious)", type: "material", quantity: 0.1, unit: "kg" },
      { name: "Tile Layer (Skilled)", type: "labor", quantity: 0.12, unit: "day" },
      { name: "Laborer (Unskilled)", type: "labor", quantity: 0.08, unit: "day" },
    ],
  },
  {
    name: "9.10 Flooring with Vitrified Tile (per sqm)",
    source: "DoR 2075",
    category: "Finishes",
    description: "Vitrified floor tile fixing with tile adhesive",
    batchSize: 1,
    ingredients: [
      { name: "Vitrified Tile (600x600mm)", type: "material", quantity: 1.05, unit: "sqm" },
      { name: "Cement OPC 43 Grade", type: "material", quantity: 0.2, unit: "bag" },
      { name: "Tile Adhesive", type: "material", quantity: 0.6, unit: "kg" },
      { name: "Grout (Cementitious)", type: "material", quantity: 0.1, unit: "kg" },
      { name: "Tile Layer (Skilled)", type: "labor", quantity: 0.1, unit: "day" },
      { name: "Laborer (Unskilled)", type: "labor", quantity: 0.08, unit: "day" },
    ],
  },

  // ── Section 1000: Road Furniture & Drainage ──
  {
    name: "10.1 RCC Hume Pipe (NP3, 450mm, per m)",
    source: "DoR 2075",
    category: "Drainage",
    description: "RCC NP3 pipe for culverts including laying and jointing",
    batchSize: 1,
    ingredients: [
      { name: "RCC Pipe (NP3, 450mm)", type: "material", quantity: 1.0, unit: "m" },
      { name: "Cement OPC 43 Grade", type: "material", quantity: 0.1, unit: "bag" },
      { name: "Sand (River)", type: "material", quantity: 0.01, unit: "cum" },
      { name: "Mason (Skilled)", type: "labor", quantity: 0.05, unit: "day" },
      { name: "Laborer (Unskilled)", type: "labor", quantity: 0.2, unit: "day" },
      { name: "Excavator (200-220 HP, 20T)", type: "equipment", quantity: 0.02, unit: "hour" },
      { name: "Mobile Crane (20T)", type: "equipment", quantity: 0.02, unit: "hour" },
    ],
  },
  {
    name: "10.2 RCC Hume Pipe (NP4, 600mm, per m)",
    source: "DoR 2075",
    category: "Drainage",
    description: "RCC NP4 pipe for culverts including laying and jointing",
    batchSize: 1,
    ingredients: [
      { name: "RCC Pipe (NP4, 600mm)", type: "material", quantity: 1.0, unit: "m" },
      { name: "Cement OPC 43 Grade", type: "material", quantity: 0.15, unit: "bag" },
      { name: "Sand (River)", type: "material", quantity: 0.015, unit: "cum" },
      { name: "Mason (Skilled)", type: "labor", quantity: 0.05, unit: "day" },
      { name: "Laborer (Unskilled)", type: "labor", quantity: 0.3, unit: "day" },
      { name: "Excavator (200-220 HP, 20T)", type: "equipment", quantity: 0.03, unit: "hour" },
      { name: "Mobile Crane (20T)", type: "equipment", quantity: 0.03, unit: "hour" },
    ],
  },
  {
    name: "10.3 RCC Box Culvert (per cum concrete)",
    source: "DoR 2075",
    category: "Drainage",
    description: "RCC box culvert construction including concrete, reinforcement and formwork",
    batchSize: 1,
    ingredients: [
      { name: "Cement OPC 53 Grade", type: "material", quantity: 7.5, unit: "bag" },
      { name: "Sand (River)", type: "material", quantity: 0.42, unit: "cum" },
      { name: "Coarse Aggregate 20mm", type: "material", quantity: 0.83, unit: "cum" },
      { name: "TMT Bar Fe500 (12mm)", type: "material", quantity: 85, unit: "kg" },
      { name: "Binding Wire (16/18 gauge)", type: "material", quantity: 1.7, unit: "kg" },
      { name: "Plywood (18mm, Marine)", type: "material", quantity: 2.5, unit: "sqm" },
      { name: "Nails (Wire Nails, assorted)", type: "material", quantity: 1.5, unit: "kg" },
      { name: "Mason (Skilled)", type: "labor", quantity: 2.0, unit: "day" },
      { name: "Carpenter (Skilled)", type: "labor", quantity: 0.5, unit: "day" },
      { name: "Bar Bender/Steel Fixer (Skilled)", type: "labor", quantity: 1.0, unit: "day" },
      { name: "Laborer (Unskilled)", type: "labor", quantity: 4.0, unit: "day" },
      { name: "Concrete Mixer (0.5 cum)", type: "equipment", quantity: 0.2, unit: "hour" },
      { name: "Concrete Vibrator (Needle)", type: "equipment", quantity: 0.3, unit: "hour" },
    ],
  },
  {
    name: "10.4 Metal Beam Crash Barrier (per m)",
    source: "DoR 2075",
    category: "Road Furniture",
    description: "Metal beam crash barrier including posts, rail, fittings and installation",
    batchSize: 1,
    ingredients: [
      { name: "Crash Barrier (Metal Beam)", type: "material", quantity: 1.0, unit: "m" },
      { name: "Cement OPC 43 Grade", type: "material", quantity: 0.15, unit: "bag" },
      { name: "Sand (River)", type: "material", quantity: 0.015, unit: "cum" },
      { name: "Coarse Aggregate 20mm", type: "material", quantity: 0.03, unit: "cum" },
      { name: "Mason (Skilled)", type: "labor", quantity: 0.02, unit: "day" },
      { name: "Laborer (Unskilled)", type: "labor", quantity: 0.1, unit: "day" },
    ],
  },
  {
    name: "10.5 RCC Crash Barrier (M30, per m)",
    source: "DoR 2075",
    category: "Road Furniture",
    description: "RCC M30 crash barrier including concrete and reinforcement",
    batchSize: 1,
    ingredients: [
      { name: "RCC Crash Barrier (M30)", type: "material", quantity: 1.0, unit: "m" },
      { name: "Cement OPC 53 Grade", type: "material", quantity: 2.5, unit: "bag" },
      { name: "Sand (River)", type: "material", quantity: 0.12, unit: "cum" },
      { name: "Coarse Aggregate 20mm", type: "material", quantity: 0.25, unit: "cum" },
      { name: "TMT Bar Fe500 (12mm)", type: "material", quantity: 25, unit: "kg" },
      { name: "Mason (Skilled)", type: "labor", quantity: 0.15, unit: "day" },
      { name: "Bar Bender/Steel Fixer (Skilled)", type: "labor", quantity: 0.2, unit: "day" },
      { name: "Laborer (Unskilled)", type: "labor", quantity: 0.3, unit: "day" },
      { name: "Concrete Mixer (0.5 cum)", type: "equipment", quantity: 0.05, unit: "hour" },
    ],
  },
  {
    name: "10.6 Road Marking (Thermoplastic, per sqm)",
    source: "DoR 2075",
    category: "Road Furniture",
    description: "Road marking with thermoplastic paint including all materials",
    batchSize: 1,
    ingredients: [
      { name: "Road Marking Paint (Thermoplastic)", type: "material", quantity: 3.0, unit: "kg" },
      { name: "Glass Beads (Reflective)", type: "material", quantity: 0.3, unit: "kg" },
      { name: "Laborer (Unskilled)", type: "labor", quantity: 0.02, unit: "day" },
      { name: "Road Marking Machine", type: "equipment", quantity: 0.02, unit: "hour" },
    ],
  },
  {
    name: "10.7 Road Marking (Paint, per sqm)",
    source: "DoR 2075",
    category: "Road Furniture",
    description: "Road marking with ordinary paint (non-thermoplastic)",
    batchSize: 1,
    ingredients: [
      { name: "Road Marking Paint (Thermoplastic)", type: "material", quantity: 0.4, unit: "kg" },
      { name: "Laborer (Unskilled)", type: "labor", quantity: 0.01, unit: "day" },
    ],
  },
  {
    name: "10.8 Supply & Fix Road Sign (per no)",
    source: "DoR 2075",
    category: "Road Furniture",
    description: "Road sign board including post, foundation and fixing",
    batchSize: 1,
    ingredients: [
      { name: "MS Angle", type: "material", quantity: 12, unit: "kg" },
      { name: "GI Sheet (26 gauge)", type: "material", quantity: 0.5, unit: "sqm" },
      { name: "Cement OPC 43 Grade", type: "material", quantity: 0.3, unit: "bag" },
      { name: "Sand (River)", type: "material", quantity: 0.03, unit: "cum" },
      { name: "Coarse Aggregate 20mm", type: "material", quantity: 0.06, unit: "cum" },
      { name: "Welder (Skilled)", type: "labor", quantity: 0.2, unit: "day" },
      { name: "Painter (Skilled)", type: "labor", quantity: 0.1, unit: "day" },
      { name: "Laborer (Unskilled)", type: "labor", quantity: 0.3, unit: "day" },
    ],
  },
  {
    name: "10.9 Granite Kerb Stone (per m)",
    source: "DoR 2075",
    category: "Road Furniture",
    description: "Granite/CC kerb stone including foundation concrete and fixing",
    batchSize: 1,
    ingredients: [
      { name: "Cement OPC 43 Grade", type: "material", quantity: 0.2, unit: "bag" },
      { name: "Sand (River)", type: "material", quantity: 0.02, unit: "cum" },
      { name: "Coarse Aggregate 10mm", type: "material", quantity: 0.04, unit: "cum" },
      { name: "Mason (Skilled)", type: "labor", quantity: 0.06, unit: "day" },
      { name: "Laborer (Unskilled)", type: "labor", quantity: 0.06, unit: "day" },
    ],
  },
  {
    name: "10.10 Chain Link Fencing (per sqm)",
    source: "DoR 2075",
    category: "Road Furniture",
    description: "Chain link mesh fencing with RCC posts and barbed wire",
    batchSize: 1,
    ingredients: [
      { name: "Chain Link Mesh (Fencing)", type: "material", quantity: 1.1, unit: "sqm" },
      { name: "Fencing Post (RCC)", type: "material", quantity: 0.2, unit: "no" },
      { name: "Barbed Wire", type: "material", quantity: 1.5, unit: "m" },
      { name: "Cement OPC 43 Grade", type: "material", quantity: 0.1, unit: "bag" },
      { name: "Sand (River)", type: "material", quantity: 0.01, unit: "cum" },
      { name: "Laborer (Unskilled)", type: "labor", quantity: 0.1, unit: "day" },
    ],
  },
  {
    name: "10.11 Gabion Wall (per cum)",
    source: "DoR 2075",
    category: "Retaining Works",
    description: "Gabion wire mesh boxes filled with stone for retaining wall/protection",
    batchSize: 1,
    ingredients: [
      { name: "Boulder", type: "material", quantity: 1.2, unit: "cum" },
      { name: "Wire Mesh (GI welded)", type: "material", quantity: 4.0, unit: "sqm" },
      { name: "Laborer (Unskilled)", type: "labor", quantity: 1.5, unit: "day" },
    ],
  },
  {
    name: "10.12 Rip Rap / Stone Pitching (per cum)",
    source: "DoR 2075",
    category: "Retaining Works",
    description: "Stone pitching on slope for protection works",
    batchSize: 1,
    ingredients: [
      { name: "Boulder", type: "material", quantity: 1.15, unit: "cum" },
      { name: "Laborer (Unskilled)", type: "labor", quantity: 1.5, unit: "day" },
    ],
  },
  {
    name: "10.13 Turfing/Sodding (per sqm)",
    source: "DoR 2075",
    category: "Retaining Works",
    description: "Turfing on embankment slope for erosion control",
    batchSize: 1,
    ingredients: [
      { name: "Laborer (Unskilled)", type: "labor", quantity: 0.05, unit: "day" },
      { name: "Water", type: "material", quantity: 5, unit: "ltr" },
    ],
  },

  // ── Additional Bridge Items ──
  {
    name: "15.1 Bearing (Elastomeric, per no)",
    source: "DoR 2075",
    category: "Bridge",
    description: "Elastomeric bearing pad for bridge girder",
    batchSize: 1,
    ingredients: [
      { name: "PTFE/Bearing Plate", type: "material", quantity: 1.0, unit: "no" },
      { name: "Mason (Skilled)", type: "labor", quantity: 0.5, unit: "day" },
      { name: "Laborer (Unskilled)", type: "labor", quantity: 1.0, unit: "day" },
      { name: "Mobile Crane (20T)", type: "equipment", quantity: 0.5, unit: "hour" },
    ],
  },
  {
    name: "15.2 Expansion Joint (Bitumen Fiber, per m)",
    source: "DoR 2075",
    category: "Bridge",
    description: "Bitumen fiber expansion joint for bridge deck",
    batchSize: 1,
    ingredients: [
      { name: "Expansion Joint (Bitumen Fiber)", type: "material", quantity: 1.05, unit: "m" },
      { name: "Mason (Skilled)", type: "labor", quantity: 0.1, unit: "day" },
      { name: "Laborer (Unskilled)", type: "labor", quantity: 0.1, unit: "day" },
    ],
  },
  {
    name: "15.3 Waterproofing for Bridge Deck (per sqm)",
    source: "DoR 2075",
    category: "Bridge",
    description: "Waterproofing membrane on bridge deck including primer",
    batchSize: 1,
    ingredients: [
      { name: "Waterproofing Membrane (Bituminous)", type: "material", quantity: 1.15, unit: "sqm" },
      { name: "Bitumen (80/100 Grade)", type: "material", quantity: 0.5, unit: "kg" },
      { name: "Laborer (Unskilled)", type: "labor", quantity: 0.04, unit: "day" },
    ],
  },
  {
    name: "15.4 Pile Foundation (Bored Cast-In-Situ, per m)",
    source: "DoR 2075",
    category: "Bridge",
    description: "Bored cast-in-situ RCC pile including boring, concrete and reinforcement per meter length",
    batchSize: 1,
    ingredients: [
      { name: "Cement OPC 53 Grade", type: "material", quantity: 6.0, unit: "bag" },
      { name: "Sand (River)", type: "material", quantity: 0.35, unit: "cum" },
      { name: "Coarse Aggregate 20mm", type: "material", quantity: 0.65, unit: "cum" },
      { name: "TMT Bar Fe500 (16-32mm)", type: "material", quantity: 100, unit: "kg" },
      { name: "Laborer (Unskilled)", type: "labor", quantity: 2.0, unit: "day" },
      { name: "Bored Cast-In-Situ Piling Rig", type: "equipment", quantity: 0.5, unit: "hour" },
      { name: "Mobile Crane (20T)", type: "equipment", quantity: 0.3, unit: "hour" },
      { name: "Concrete Pump (Stationary)", type: "equipment", quantity: 0.15, unit: "hour" },
    ],
  },
  {
    name: "15.5 Prestressed Concrete Girder (M45, per cum)",
    source: "DoR 2075",
    category: "Bridge",
    description: "PSC M45 grade concrete for bridge superstructure girder",
    batchSize: 1,
    ingredients: [
      { name: "Cement OPC 53 Grade", type: "material", quantity: 9.0, unit: "bag" },
      { name: "Sand (River)", type: "material", quantity: 0.35, unit: "cum" },
      { name: "Coarse Aggregate 20mm", type: "material", quantity: 0.75, unit: "cum" },
      { name: "Plasticizer (Super)", type: "material", quantity: 4.5, unit: "ltr" },
      { name: "Mason (Skilled)", type: "labor", quantity: 0.5, unit: "day" },
      { name: "Laborer (Unskilled)", type: "labor", quantity: 2.0, unit: "day" },
      { name: "Concrete Mixer (0.5 cum)", type: "equipment", quantity: 0.2, unit: "hour" },
      { name: "Concrete Vibrator (Needle)", type: "equipment", quantity: 0.3, unit: "hour" },
    ],
  },
  {
    name: "15.6 HT Strand (per kg)",
    source: "DoR 2075",
    category: "Bridge",
    description: "High tensile steel strand for prestressing including stressing",
    batchSize: 1,
    ingredients: [
      { name: "TMT Bar Fe500D (all dia)", type: "material", quantity: 1.05, unit: "kg" },
      { name: "Welder (Skilled)", type: "labor", quantity: 0.005, unit: "day" },
      { name: "Laborer (Unskilled)", type: "labor", quantity: 0.005, unit: "day" },
    ],
  },
  {
    name: "15.7 Hand Rail (MS/CI, per m)",
    source: "DoR 2075",
    category: "Bridge",
    description: "MS hand rail including fabrication, fixing and painting",
    batchSize: 1,
    ingredients: [
      { name: "MS Pipe/Hand Rail", type: "material", quantity: 1.05, unit: "m" },
      { name: "Welding Electrode", type: "material", quantity: 0.15, unit: "kg" },
      { name: "Synthetic Enamel Paint", type: "material", quantity: 0.15, unit: "ltr" },
      { name: "Welder (Skilled)", type: "labor", quantity: 0.08, unit: "day" },
      { name: "Painter (Skilled)", type: "labor", quantity: 0.05, unit: "day" },
      { name: "Laborer (Unskilled)", type: "labor", quantity: 0.08, unit: "day" },
    ],
  },
  {
    name: "15.8 Approach Slab (RCC M30, per cum)",
    source: "DoR 2075",
    category: "Bridge",
    description: "RCC M30 approach slab at bridge abutment including concrete and reinforcement",
    batchSize: 1,
    ingredients: [
      { name: "Cement OPC 53 Grade", type: "material", quantity: 8.0, unit: "bag" },
      { name: "Sand (River)", type: "material", quantity: 0.4, unit: "cum" },
      { name: "Coarse Aggregate 20mm", type: "material", quantity: 0.85, unit: "cum" },
      { name: "TMT Bar Fe500 (12mm)", type: "material", quantity: 80, unit: "kg" },
      { name: "Mason (Skilled)", type: "labor", quantity: 0.8, unit: "day" },
      { name: "Bar Bender/Steel Fixer (Skilled)", type: "labor", quantity: 0.8, unit: "day" },
      { name: "Laborer (Unskilled)", type: "labor", quantity: 2.0, unit: "day" },
      { name: "Concrete Mixer (0.5 cum)", type: "equipment", quantity: 0.15, unit: "hour" },
      { name: "Concrete Vibrator (Needle)", type: "equipment", quantity: 0.2, unit: "hour" },
    ],
  },
];

// ─── PART 3: Material Catalog (all unique materials from items) ─────────────────

function buildMaterialCatalogEntries(items: CatalogItemInput[]) {
  const seen = new Set<string>();
  const entries: { name: string; normalizedName: string; category: string; unit: string; aliases: string[] }[] = [];
  for (const item of items) {
    const key = item.materialName.toLowerCase().trim();
    if (seen.has(key)) continue;
    seen.add(key);
    entries.push({
      name: item.materialName,
      normalizedName: key,
      category: item.category,
      unit: item.unit,
      aliases: [],
    });
  }
  return entries;
}

// ─── Main ───────────────────────────────────────────────────────────────────────

async function main() {
  console.log("═══ Comprehensive Seed: Rate Catalog + DoR Presets ═══\n");

  // ── Part A: Global Rate Catalog ──
  console.log("─ Part 1: Rate Catalog ────────────────────────────");

  const existingCatalog = await db.rateCatalog.findFirst({
    where: {
      name: RATE_CATALOG_NAME,
      scope: "global",
      isActive: true,
    },
  });

  if (existingCatalog) {
    console.log(`Rate catalog "${RATE_CATALOG_NAME}" already exists. Skipping.`);
    console.log("To re-seed, delete it first.");
  } else {
    // Build material catalog entries
    const materialEntries = buildMaterialCatalogEntries(CATALOG_ITEMS);
    console.log(`Building ${materialEntries.length} material catalog entries...`);

    // Create main material catalog
    const materialCatalog = await db.materialCatalog.create({
      data: {
        organizationId: null,
        name: "Nepal Construction Materials",
        normalizedName: "nepal construction materials",
        category: "Master",
        defaultUnit: "each",
        isGlobal: true,
      },
    });
    console.log(`  ✓ MaterialCatalog: ${materialCatalog.name}`);

    const materialMap = new Map<string, string>(); // normalizedName -> id
    for (const entry of materialEntries) {
      const mc = await db.materialCatalog.create({
        data: {
          organizationId: null,
          name: entry.name,
          normalizedName: entry.normalizedName,
          category: entry.category,
          defaultUnit: entry.unit,
          aliases: entry.aliases,
          isGlobal: true,
        },
      });
      materialMap.set(entry.normalizedName, mc.id);
    }
    console.log(`  ✓ ${materialEntries.length} materials created`);

    // Create rate catalog
    const catalog = await db.rateCatalog.create({
      data: {
        organizationId: null,
        name: RATE_CATALOG_NAME,
        fiscalYear: FISCAL_YEAR,
        scope: "global",
        districts: [DISTRICT],
        isActive: true,
      },
    });
    console.log(`  ✓ RateCatalog: ${catalog.name}`);

    // Create items with rates
    let itemCount = 0;
    for (const entry of CATALOG_ITEMS) {
      const materialCatalogId = materialMap.get(entry.materialName.toLowerCase().trim()) ?? null;
      await db.rateCatalogItem.create({
        data: {
          catalogId: catalog.id,
          code: entry.code,
          materialName: entry.materialName,
          materialCatalogId: materialCatalogId,
          unit: entry.unit,
          sortOrder: entry.code,
          rates: {
            create: {
              district: DISTRICT,
              rate: entry.rate,
            },
          },
        },
      });
      itemCount++;
    }
    console.log(`  ✓ ${itemCount} items with rates for district "${DISTRICT}"`);
  }

  // ── Part B: DoR Presets (209 raw + 42 curated) ──
  console.log("\n─ Part 2: DoR Rate Analysis Presets ────────────────");

  const ALL_DOR_PRESETS = [
    ...CURATED_PRESETS,
    ...DOR_RAW_PRESETS.map((p) => ({
      name: p.name,
      source: p.source,
      category: p.category,
      description: "",
      batchSize: p.batchSize,
      ingredients: p.ingredients,
    })),
  ];

  const existingPresetCount = await db.globalPresetAnalysis.count({
    where: { source: "DoR 2075" },
  });

  if (existingPresetCount > 0) {
    console.log(`DoR presets already exist (${existingPresetCount} found). Skipping.`);
    console.log("To re-seed, delete existing presets first.");
    console.log('  DELETE FROM "GlobalPresetAnalysis" WHERE source = \'DoR 2075\';');
  } else {
    let successCount = 0;
    for (const preset of ALL_DOR_PRESETS) {
      try {
        await db.globalPresetAnalysis.create({
          data: {
            name: preset.name,
            source: preset.source,
            category: preset.category,
            description: preset.description,
            batchSize: preset.batchSize,
            scope: "global",
            ingredients: {
              create: preset.ingredients.map((ing, i) => ({
                name: ing.name,
                type: ing.type,
                calcMode: "fixed",
                quantity: ing.quantity,
                unit: ing.unit,
                percentage: 0,
                pctBase: "",
                rate: 0,
                amount: 0,
                sortOrder: i + 1,
              })),
            },
          },
        });
        successCount++;
        if (successCount % 10 === 0) {
          process.stdout.write(`  ✓ ${successCount}/${ALL_DOR_PRESETS.length}...\n`);
        }
      } catch (e) {
        console.error(`  ✗ Failed: ${preset.name.slice(0, 60)} — ${e instanceof Error ? e.message : "unknown"}`);
      }
    }
    console.log(`  ✓ ${successCount} of ${ALL_DOR_PRESETS.length} presets seeded`);
    const totalIngredients = ALL_DOR_PRESETS.reduce((s, p) => s + p.ingredients.length, 0);
    console.log(`  ✓ ${totalIngredients} total ingredients`);
  }

  // ── Part 3: Populate v2 CatalogMaterial + CatalogRate ──
  console.log("\n─ Part 3: v2 Catalog (CatalogMaterial + CatalogRate) ──");

  const existingV2Count = await db.catalogMaterial.count({ where: { scope: "global" } });
  if (existingV2Count > 0) {
    console.log(`  ↳ ${existingV2Count} v2 global materials already exist, skipping`);
  } else {
    // Seed CatalogMaterial from CATALOG_ITEMS
    let v2MaterialCount = 0;
    for (const entry of CATALOG_ITEMS) {
      const norm = entry.materialName.toLowerCase().trim();
      await db.catalogMaterial.create({
        data: {
          scope: "global",
          organizationId: null,
          projectId: null,
          name: entry.materialName,
          normalizedName: norm,
          category: entry.category,
          defaultUnit: entry.unit,
          defaultRate: entry.rate,
        },
      });
      v2MaterialCount++;
    }
    console.log(`  ✓ ${v2MaterialCount} CatalogMaterial (global) created`);

    // Seed CatalogRate from the rate catalog
    const v2Catalog = await db.rateCatalog.findFirst({ where: { scope: "global", organizationId: null } });
    if (v2Catalog) {
      let v2RateCount = 0;
      const v2Materials = await db.catalogMaterial.findMany({ where: { scope: "global" } });
      const v2MaterialMap = new Map(v2Materials.map((m) => [m.normalizedName, m.id]));

      for (const entry of CATALOG_ITEMS) {
        const matId = v2MaterialMap.get(entry.materialName.toLowerCase().trim());
        if (!matId) continue;
        await db.catalogRate.create({
          data: {
            materialId: matId,
            rateCatalogId: v2Catalog.id,
            district: DISTRICT,
            rate: entry.rate,
          },
        });
        v2RateCount++;
      }
      console.log(`  ✓ ${v2RateCount} CatalogRate entries created`);
    }
  }

  console.log("\n═══ Seed complete ═══");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
