import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const db = new PrismaClient();

async function main() {
  console.log("🚀 Seeding Complete Road Construction Project (ROAD-KTM-01)...");

  // 2. Fetch Users first (so we can reuse their org)
  const pmUser = await db.user.findUnique({ where: { email: "manager@pm.com" } });
  const engUser = await db.user.findUnique({ where: { email: "engineer@pm.com" } });
  const coordUser = await db.user.findUnique({ where: { email: "coordinator@pm.com" } });
  const clientUser = await db.user.findUnique({ where: { email: "client@pm.com" } });

  if (!pmUser || !engUser || !coordUser || !clientUser) {
    console.error("Missing demo users. Run user setup first.");
    process.exit(1);
  }

  // 1. Use the same organization as the demo users (critical: avoids org ID mismatch)
  // Fall back to creating one only if users have no org yet.
  let org = pmUser.organizationId
    ? await db.organization.findUnique({ where: { id: pmUser.organizationId } })
    : null;

  if (!org) {
    org = await db.organization.upsert({
      where: { code: "DOR-CR" },
      update: {},
      create: { name: "Nepal Department of Roads - Central Region", code: "DOR-CR" },
    });
    // Link all demo users to this org
    await db.user.updateMany({
      where: { email: { in: ["manager@pm.com", "engineer@pm.com", "coordinator@pm.com", "client@pm.com"] } },
      data: { organizationId: org.id },
    });
  }

  console.log(`✓ Using organization: ${org.name} (${org.id})`);

  // 3. Create or Reset Project
  const projectCode = "ROAD-KTM-01";
  const existingProject = await db.project.findFirst({ where: { code: projectCode } });
  if (existingProject) {
    console.log(`Deleting existing project ${projectCode} to seed fresh data...`);
    await db.project.delete({ where: { id: existingProject.id } });
  }

  const project = await db.project.create({
    data: {
      code: projectCode,
      name: "Kathmandu–Bhaktapur Road Widening & Upgrading Project (Km 0+000 to Km 4+500)",
      description: "Upgrading 4.5 km 4-lane arterial road section with Asphalt Concrete pavement, double-cell box culvert, GSB, Crusher Run Base, retaining walls, and thermoplastic road markings.",
      client: "Department of Roads (DoR), Ministry of Physical Infrastructure & Transport",
      location: "Kathmandu - Bhaktapur Corridor, Bagmati Province",
      contractValue: 185000000, // 18.5 Crore NPR
      startDate: new Date("2024-01-15"),
      endDate: new Date("2025-07-15"),
      status: "active",
      organizationId: org.id,
      createdById: pmUser.id,
      skilledWageRate: 1500,
      unskilledWageRate: 900,
      supervisorWageRate: 2000,
      ownedEquipRate: 3500,
      hiredEquipRate: 4200,
      fuelPricePerLiter: 175,
      members: {
        create: [
          { userId: pmUser.id, role: "project_manager" },
          { userId: engUser.id, role: "engineer" },
          { userId: coordUser.id, role: "coordinator" },
          { userId: clientUser.id, role: "client" },
        ],
      },
    },
  });

  console.log(`✓ Project created: ${project.name} (ID: ${project.id})`);

  // Ensure standard Analysis Libraries exist
  const clientEstLib = await db.analysisLibrary.upsert({
    where: { projectId_purpose: { projectId: project.id, purpose: "client_estimate" } },
    update: { isDefault: true },
    create: { projectId: project.id, name: "Client's Estimate", purpose: "client_estimate", isDefault: true },
  });
  const contractorBidLib = await db.analysisLibrary.upsert({
    where: { projectId_purpose: { projectId: project.id, purpose: "contractor_bid" } },
    update: { isDefault: false },
    create: { projectId: project.id, name: "Contractor Bid", purpose: "contractor_bid", isDefault: false },
  });
  const contractorActLib = await db.analysisLibrary.upsert({
    where: { projectId_purpose: { projectId: project.id, purpose: "contractor_actual" } },
    update: { isDefault: false },
    create: { projectId: project.id, name: "Contractor's Actual", purpose: "contractor_actual", isDefault: false },
  });

  // 4. Seed Bill of Quantities (BOQ Items)
  console.log("Seeding BOQ items & Rate Breakdowns...");
  const boqItemsData = [
    // Section 100: General & Earthworks
    {
      code: "1.01",
      category: "Section 100: Site Clearance & Earthworks",
      description: "Site clearance, grubbing and removal of topsoil up to 150mm depth",
      unit: "sqm",
      quantity: 25000,
      rate: 45,
      ingredients: [
        { name: "Unskilled labor", type: "labor", quantity: 0.02, unit: "day", rate: 900 },
        { name: "Excavator (JCB 3DX)", type: "equipment", quantity: 0.005, unit: "hr", rate: 3200 },
        { name: "Tipper Truck (10 cum)", type: "equipment", quantity: 0.005, unit: "hr", rate: 2200 },
      ],
    },
    {
      code: "1.02",
      category: "Section 100: Site Clearance & Earthworks",
      description: "Roadway excavation in all types of soil including disposal within 50m lead",
      unit: "cum",
      quantity: 18000,
      rate: 185,
      ingredients: [
        { name: "Heavy Excavator (Komatsu PC210)", type: "equipment", quantity: 0.025, unit: "hr", rate: 4500 },
        { name: "Dump Truck (12 cum)", type: "equipment", quantity: 0.02, unit: "hr", rate: 2400 },
        { name: "Unskilled labor", type: "labor", quantity: 0.03, unit: "day", rate: 900 },
        { name: "Grade Surveyor & Spotter", type: "labor", quantity: 0.005, unit: "day", rate: 1800 },
      ],
    },
    {
      code: "1.03",
      category: "Section 100: Site Clearance & Earthworks",
      description: "Excavation in hard rock requiring blasting and controlled splitting",
      unit: "cum",
      quantity: 4500,
      rate: 620,
      ingredients: [
        { name: "Rock Breaker Hydraulic (20 ton)", type: "equipment", quantity: 0.06, unit: "hr", rate: 6500 },
        { name: "Air Compressor & Jackhammer Drill", type: "equipment", quantity: 0.08, unit: "hr", rate: 1800 },
        { name: "Blaster & Mining Skilled Labor", type: "labor", quantity: 0.05, unit: "day", rate: 1600 },
      ],
    },

    // Section 200: Sub-Base & Base Courses
    {
      code: "2.01",
      category: "Section 200: Pavement Layers",
      description: "Providing, laying and compacting Granular Sub-Base (GSB) grading I in 150mm thickness",
      unit: "cum",
      quantity: 12000,
      rate: 1850,
      ingredients: [
        { name: "Riverbed Gravel / GSB Material", type: "material", quantity: 1.25, unit: "cum", rate: 1100 },
        { name: "Motor Grader (CAT 120K)", type: "equipment", quantity: 0.015, unit: "hr", rate: 5200 },
        { name: "Vibratory Soil Compactor (10-12 ton)", type: "equipment", quantity: 0.02, unit: "hr", rate: 3800 },
        { name: "Water Tanker (6000L)", type: "equipment", quantity: 0.01, unit: "hr", rate: 1800 },
        { name: "Pavement Unskilled Labor", type: "labor", quantity: 0.08, unit: "day", rate: 900 },
      ],
    },
    {
      code: "2.02",
      category: "Section 200: Pavement Layers",
      description: "Crusher Run Wet Mix Macadam (WMM) Base Course 150mm compacted thickness",
      unit: "cum",
      quantity: 9500,
      rate: 2650,
      ingredients: [
        { name: "Crushed Aggregate (40mm down blended)", type: "material", quantity: 1.3, unit: "cum", rate: 1650 },
        { name: "WMM Paver Finisher with Sensor", type: "equipment", quantity: 0.012, unit: "hr", rate: 6500 },
        { name: "Tandem Smooth Drum Vibratory Roller (10 ton)", type: "equipment", quantity: 0.02, unit: "hr", rate: 4200 },
        { name: "Water Tanker (6000L)", type: "equipment", quantity: 0.01, unit: "hr", rate: 1800 },
        { name: "Paving Skilled Labor & Crew", type: "labor", quantity: 0.06, unit: "day", rate: 1200 },
      ],
    },

    // Section 300: Bituminous Pavement
    {
      code: "3.01",
      category: "Section 300: Bituminous Surfacing",
      description: "Applying Bituminous Prime Coat using VG-10 bitumen @ 0.9 kg/sqm over prepared base course",
      unit: "sqm",
      quantity: 36000,
      rate: 185,
      ingredients: [
        { name: "Bitumen VG-10", type: "material", quantity: 0.95, unit: "kg", rate: 125 },
        { name: "Bitumen Distributor Truck", type: "equipment", quantity: 0.003, unit: "hr", rate: 4000 },
        { name: "Skilled labor", type: "labor", quantity: 0.005, unit: "day", rate: 1500 },
      ],
    },
    {
      code: "3.02",
      category: "Section 300: Bituminous Surfacing",
      description: "Applying Bituminous Tack Coat using RS-1 quick setting emulsion @ 0.25 kg/sqm",
      unit: "sqm",
      quantity: 36000,
      rate: 75,
      ingredients: [
        { name: "Bitumen Emulsion RS-1", type: "material", quantity: 0.28, unit: "kg", rate: 140 },
        { name: "Sprayer Equipment", type: "equipment", quantity: 0.002, unit: "hr", rate: 2500 },
        { name: "Labor", type: "labor", quantity: 0.003, unit: "day", rate: 900 },
      ],
    },
    {
      code: "3.03",
      category: "Section 300: Bituminous Surfacing",
      description: "Providing & laying Asphalt Concrete wearing course (50mm thick) using VG-30 Bitumen",
      unit: "sqm",
      quantity: 36000,
      rate: 1850,
      ingredients: [
        { name: "Asphalt Concrete Mix (Plant Mix)", type: "material", quantity: 0.125, unit: "ton", rate: 11500 },
        { name: "Asphalt Paver (Vögele Super 1800-3)", type: "equipment", quantity: 0.008, unit: "hr", rate: 7500 },
        { name: "Pneumatic Tyred Roller (PTR 20-ton)", type: "equipment", quantity: 0.01, unit: "hr", rate: 4200 },
        { name: "Tandem Steel Roller (10-ton)", type: "equipment", quantity: 0.01, unit: "hr", rate: 3800 },
        { name: "Skilled Paving Crew", type: "labor", quantity: 0.02, unit: "day", rate: 1800 },
      ],
    },

    // Section 400: Cross Drainage Structures & Masonry
    {
      code: "4.01",
      category: "Section 400: Structures & Drainage",
      description: "Construction of Double Cell Reinforced Concrete Box Culvert (2x2m internal barrel dimension)",
      unit: "m",
      quantity: 40,
      rate: 245000,
      ingredients: [
        { name: "RCC Concrete M25", type: "material", quantity: 4.8, unit: "cum", rate: 16500 },
        { name: "Fe500 Reinforcement Steel", type: "material", quantity: 450, unit: "kg", rate: 125 },
        { name: "Modular Steel Formwork", type: "material", quantity: 12, unit: "sqm", rate: 850 },
        { name: "Bar Bender & Masons", type: "labor", quantity: 3.5, unit: "day", rate: 1500 },
        { name: "Concrete Pump & Vibrators", type: "equipment", quantity: 0.5, unit: "hr", rate: 3500 },
      ],
    },
    {
      code: "4.02",
      category: "Section 400: Structures & Drainage",
      description: "Providing & laying NP3 RCC Pipe Culverts (900mm internal diameter) with bedding & headwalls",
      unit: "m",
      quantity: 120,
      rate: 18500,
      ingredients: [
        { name: "NP3 RCC Pipe 900mm", type: "material", quantity: 1.02, unit: "m", rate: 11500 },
        { name: "Concrete M15 Bedding", type: "material", quantity: 0.35, unit: "cum", rate: 12500 },
        { name: "Crane / Excavator Lifting", type: "equipment", quantity: 0.15, unit: "hr", rate: 3800 },
        { name: "Masons and Laborers", type: "labor", quantity: 0.6, unit: "day", rate: 1200 },
      ],
    },
    {
      code: "4.03",
      category: "Section 400: Structures & Drainage",
      description: "Gabion structure with double-twisted hexagonal GI wire mesh boxes filled with hard boulders",
      unit: "cum",
      quantity: 3200,
      rate: 4850,
      ingredients: [
        { name: "Gabion GI Mesh Wire Box (10x12cm)", type: "material", quantity: 1.05, unit: "sqm", rate: 850 },
        { name: "Quarry Boulder Stone", type: "material", quantity: 1.15, unit: "cum", rate: 2200 },
        { name: "Lacing Wire", type: "material", quantity: 0.05, unit: "kg", rate: 180 },
        { name: "Gabion Weavers & Laborers", type: "labor", quantity: 0.8, unit: "day", rate: 1100 },
      ],
    },

    // Section 500: Road Safety & Markings
    {
      code: "5.01",
      category: "Section 500: Road Safety & Markings",
      description: "Hot applied Thermoplastic Road Marking paint (2.5mm thick with reflective glass beads)",
      unit: "sqm",
      quantity: 4500,
      rate: 850,
      ingredients: [
        { name: "Thermoplastic Compound Paint", type: "material", quantity: 5.2, unit: "kg", rate: 115 },
        { name: "Reflective Glass Beads", type: "material", quantity: 0.4, unit: "kg", rate: 180 },
        { name: "Thermoplastic Applicator Machine", type: "equipment", quantity: 0.015, unit: "hr", rate: 2200 },
        { name: "Marking Crew", type: "labor", quantity: 0.02, unit: "day", rate: 1400 },
      ],
    },
    {
      code: "5.02",
      category: "Section 500: Road Safety & Markings",
      description: "Retro-reflective High Intensity Grade traffic warning, regulatory & informatory signs with GI posts",
      unit: "no",
      quantity: 45,
      rate: 12500,
      ingredients: [
        { name: "Retro-reflective Signboard Plate", type: "material", quantity: 1, unit: "no", rate: 7500 },
        { name: "75mm GI Support Post (3m length)", type: "material", quantity: 1, unit: "no", rate: 3200 },
        { name: "PCC Foundation Block", type: "material", quantity: 0.1, unit: "cum", rate: 1100 },
        { name: "Fitter & Painter", type: "labor", quantity: 0.25, unit: "day", rate: 1500 },
      ],
    },
  ];

  let totalBoqAmount = 0;
  for (const [i, item] of boqItemsData.entries()) {
    const amount = item.quantity * item.rate;
    totalBoqAmount += amount;

    const createdBoqItem = await db.boqItem.create({
      data: {
        projectId: project.id,
        code: item.code,
        category: item.category,
        description: item.description,
        unit: item.unit,
        quantity: item.quantity,
        rate: item.rate,
        amount,
        sortOrder: i + 1,
      },
    });

    // Create rate analysis for client estimate and link ingredients
    await db.rateAnalysis.create({
      data: {
        boqItemId: createdBoqItem.id,
        libraryId: clientEstLib.id,
        name: clientEstLib.name,
        batchSize: 1,
        isDefault: true,
        ingredients: {
          create: item.ingredients.map((ing, sIdx) => ({
            boqItemId: createdBoqItem.id,
            name: ing.name,
            type: ing.type,
            quantity: ing.quantity,
            unit: ing.unit,
            rate: ing.rate,
            amount: ing.quantity * ing.rate,
            sortOrder: sIdx + 1,
          })),
        },
      },
    });

    // Create empty rate analysis shells for bid and actual libraries
    await db.rateAnalysis.create({
      data: {
        boqItemId: createdBoqItem.id,
        libraryId: contractorBidLib.id,
        name: contractorBidLib.name,
        batchSize: 1,
        isDefault: false,
      },
    });
    await db.rateAnalysis.create({
      data: {
        boqItemId: createdBoqItem.id,
        libraryId: contractorActLib.id,
        name: contractorActLib.name,
        batchSize: 1,
        isDefault: false,
      },
    });
  }

  console.log(`✓ Seeded ${boqItemsData.length} BOQ items. Total BOQ Value: NPR ${totalBoqAmount.toLocaleString()}`);

  // 5. Seed Gantt Tasks / Schedule
  console.log("Seeding Gantt Schedule & Tasks...");
  const tasks = [
    { name: "Site Mobilization & Establishment", start: "2024-01-15", end: "2024-02-15", progress: 100, status: "completed" },
    { name: "Topographical Survey & Joint Measurement", start: "2024-01-20", end: "2024-02-28", progress: 100, status: "completed" },
    { name: "Site Clearing, Grubbing & Earth Excavation", start: "2024-02-15", end: "2024-05-30", progress: 100, status: "completed" },
    { name: "Granular Sub-Base (GSB) Construction", start: "2024-04-01", end: "2024-08-30", progress: 85, status: "in_progress" },
    { name: "Double Cell Box Culvert & Cross Drainage", start: "2024-03-15", end: "2024-09-15", progress: 75, status: "in_progress" },
    { name: "Crusher Run Base Course (WBM/WMM)", start: "2024-06-01", end: "2024-11-30", progress: 50, status: "in_progress" },
    { name: "Gabion Slope Protection & Retaining Walls", start: "2024-05-01", end: "2024-12-15", progress: 60, status: "in_progress" },
    { name: "Bituminous Prime Coat & Tack Coat", start: "2024-10-15", end: "2025-01-15", progress: 15, status: "in_progress" },
    { name: "Asphalt Concrete Wearing Course Paving", start: "2024-11-01", end: "2025-04-30", progress: 0, status: "pending" },
    { name: "Road Safety Furniture & Thermoplastic Markings", start: "2025-04-01", end: "2025-06-30", progress: 0, status: "pending" },
    { name: "Final Inspection & Commissioning", start: "2025-06-15", end: "2025-07-15", progress: 0, status: "pending" },
  ];

  for (let i = 0; i < tasks.length; i++) {
    const t = tasks[i];
    await db.ganttTask.create({
      data: {
        projectId: project.id,
        name: t.name,
        startDate: new Date(t.start),
        endDate: new Date(t.end),
        progress: t.progress,
        sortOrder: i + 1,
      },
    });
  }
  console.log(`✓ Seeded ${tasks.length} Gantt Tasks.`);

  // 6. Seed Materials Inventory
  console.log("Seeding Materials Inventory...");
  const materials = [
    { name: "Bitumen VG-30 Grade", code: "MAT-BIT-01", category: "Bitumen", unit: "drum", currentStock: 180, reorderLevel: 50, minStock: 20 },
    { name: "OPC Cement 53 Grade", code: "MAT-CEM-01", category: "Cement", unit: "bag", currentStock: 1250, reorderLevel: 300, minStock: 100 },
    { name: "TMT Rebar Fe500 (16mm-25mm)", code: "MAT-STL-01", category: "Steel", unit: "kg", currentStock: 18500, reorderLevel: 5000, minStock: 2000 },
    { name: "Crusher Run Aggregate Base", code: "MAT-AGG-01", category: "Aggregate", unit: "cum", currentStock: 450, reorderLevel: 200, minStock: 50 },
    { name: "River Sand (Fine)", code: "MAT-SND-01", category: "Aggregate", unit: "cum", currentStock: 220, reorderLevel: 100, minStock: 30 },
    { name: "Gabion Wire Mesh Boxes (2x1x1m)", code: "MAT-GAB-01", category: "Wire", unit: "no", currentStock: 350, reorderLevel: 100, minStock: 30 },
  ];

  for (const m of materials) {
    await db.material.create({
      data: {
        projectId: project.id,
        ...m,
      },
    });
  }
  console.log(`✓ Seeded ${materials.length} Materials.`);

  // 7. Seed Equipment Fleet & Logs
  console.log("Seeding Equipment Fleet & Daily Logs...");
  const equipmentItems = [
    { name: "CAT 320D Excavator", code: "EQ-EXC-01", type: "excavator", model: "Caterpillar 320D 2022", status: "active", fuelRate: 16 },
    { name: "Vögele Super 1800-3 Asphalt Paver", code: "EQ-PAV-01", type: "paver", model: "Vögele Super 1800-3", status: "active", fuelRate: 22 },
    { name: "HAMM 3411 Tandem Road Roller", code: "EQ-ROL-01", type: "roller", model: "HAMM 3411 (11 ton)", status: "active", fuelRate: 12 },
    { name: "CAT 120M Motor Grader", code: "EQ-GRD-01", type: "grader", model: "Caterpillar 120M", status: "active", fuelRate: 14 },
    { name: "Tata 2518 Tipper Truck (10 cum)", code: "EQ-TRK-01", type: "tipper", model: "Tata 2518 6x4", status: "active", fuelRate: 8 },
  ];

  for (const eq of equipmentItems) {
    const createdEq = await db.equipment.create({
      data: {
        projectId: project.id,
        ...eq,
        unit: "hrs",
      },
    });

    // Add daily log for each equipment
    await db.equipmentLog.create({
      data: {
        equipmentId: createdEq.id,
        projectId: project.id,
        date: new Date(),
        startHours: 1420,
        endHours: 1428,
        workedHours: 8,
        fuelFilled: 85,
        workDescription: "GSB compaction and sub-base leveling between Chainage 2+100 to 2+800",
        operator: "Ram Bahadur Thapa",
      },
    });
  }
  console.log(`✓ Seeded ${equipmentItems.length} Equipment items with logs.`);

  // 8. Seed Interim Payment Certificates (IPCs)
  console.log("Seeding IPCs (Payment Certificates)...");
  const ipc1 = await db.ipc.create({
    data: {
      projectId: project.id,
      number: "IPC-001",
      period: "Jan 2024 - Mar 2024",
      retention: 5,
      advanceRecovery: 18500000, // 10% Advance Recovery
      status: "paid",
      issueDate: new Date("2024-04-10"),
    },
  });

  await db.ipcItem.createMany({
    data: [
      { ipcId: ipc1.id, boqCode: "1.01", description: "Site clearance and grubbing", unit: "sqm", contractQty: 25000, previousQty: 0, thisQty: 25000, cumQty: 25000, rate: 45, amount: 1125000 },
      { ipcId: ipc1.id, boqCode: "1.02", description: "Earthwork excavation in ordinary soil", unit: "cum", contractQty: 18500, previousQty: 0, thisQty: 12000, cumQty: 12000, rate: 385, amount: 4620000 },
    ],
  });

  const ipc2 = await db.ipc.create({
    data: {
      projectId: project.id,
      number: "IPC-002",
      period: "Apr 2024 - Jun 2024",
      retention: 5,
      advanceRecovery: 9250000,
      status: "approved",
      issueDate: new Date("2024-07-15"),
    },
  });

  await db.ipcItem.createMany({
    data: [
      { ipcId: ipc2.id, boqCode: "2.01", description: "Granular Sub-Base (GSB)", unit: "cum", contractQty: 8200, previousQty: 0, thisQty: 4500, cumQty: 4500, rate: 2450, amount: 11025000 },
      { ipcId: ipc2.id, boqCode: "4.01", description: "RC Box Culvert (2x2m)", unit: "m", contractQty: 40, previousQty: 0, thisQty: 25, cumQty: 25, rate: 245000, amount: 6125000 },
    ],
  });

  console.log(`✓ Seeded IPC-001 (Paid) and IPC-002 (Approved).`);

  // 9. Seed RFIs (Site Technical Queries)
  console.log("Seeding Requests For Information (RFIs)...");
  const rfis = [
    {
      number: "RFI-001",
      subject: "Verification of Sub-grade Soil CBR at Ch 2+400 to 2+900",
      question: "Field testing indicates low CBR (4.2%) below formation level at Ch 2+400. Request Consultant confirmation for 300mm geotextile/soil stabilization requirement.",
      answer: "Approved to lay 300mm extra boulder soling with geotextile separator as per DoR standard specifications Section 600.",
      status: "closed",
      priority: "high",
      discipline: "Geotechnical",
    },
    {
      number: "RFI-002",
      subject: "Bitumen Emulsion RS-1 Equivalent Grade Approval",
      question: "Supplier requesting usage of Bitumen Emulsion SS-1 due to local refinery availability. Confirm if acceptable for tack coat.",
      answer: "SS-1 emulsion is approved provided application rate is adjusted to 0.30 kg/sqm.",
      status: "approved",
      priority: "medium",
      discipline: "Pavement",
    },
    {
      number: "RFI-003",
      subject: "Relocation of NEA 11kV High Tension Pole at Ch 1+800",
      question: "High tension electricity pole falls directly inside the proposed left carriageway shoulder. Request DoR / NEA site joint inspection for shifting.",
      answer: "Joint inspection scheduled with NEA engineer on Friday.",
      status: "open",
      priority: "urgent",
      discipline: "Utilities",
    },
  ];

  for (const r of rfis) {
    await db.rfi.create({
      data: {
        projectId: project.id,
        number: r.number,
        subject: r.subject,
        description: r.question,
        status: r.status,
        priority: r.priority,
        discipline: r.discipline,
        createdById: engUser.id,
        responses: r.answer ? {
          create: [
            {
              responderId: pmUser.id,
              response: r.answer,
              decision: r.status === "closed" || r.status === "approved" ? "approved" : "info",
            },
          ],
        } : undefined,
      },
    });
  }
  console.log(`✓ Seeded ${rfis.length} RFIs.`);

  // 10. Seed Daily Site Report
  console.log("Seeding Daily Site Report...");
  await db.dailyReport.create({
    data: {
      projectId: project.id,
      number: "DSR-2024-085",
      reportDate: new Date(),
      weatherMorning: "Clear / Sunny (28°C)",
      remarks: "Compaction of Crusher Run Base Course at Ch 2+200 to 2+600. Steel binding for Box Culvert wing walls completed.",
      status: "approved",
      createdById: engUser.id,
    },
  });
  console.log("✓ Seeded Daily Site Report.");

  // 11. Seed Variation Order (VO-01)
  console.log("Seeding Variation Order (VO-01)...");
  await db.variationOrder.create({
    data: {
      projectId: project.id,
      number: "VO-001",
      title: "Extension of Gabion Slope Protection & Sub-grade Stabilization at Ch 3+100",
      description: "Additional landslide protection works necessitated by monsoon slope failure at Ch 3+100 to 3+250 (NPR 4,250,000 / +30 Days).",
      status: "approved",
      dateApproved: new Date(),
    },
  });
  console.log("✓ Seeded Variation Order VO-001.");

  console.log("\n🎉 Complete Road Project Seeding Finished Successfully!");
}

main()
  .catch((e) => {
    console.error("Error seeding road project:", e);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
