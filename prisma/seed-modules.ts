// Seed sample BOQ items, daily reports, and Gantt tasks for the BRT-001 project.
// Run with: bun prisma/seed-modules.ts
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

async function main() {
  const project = await db.project.findFirst({
    where: { code: "BRT-001" },
    include: { members: true },
  });
  if (!project) {
    console.error("BRT-001 project not found. Run prisma/seed.ts first.");
    process.exit(1);
  }
  const pm = project.members.find((m) => m.role === "project_manager");
  if (!pm) {
    console.error("No project manager found on the project.");
    process.exit(1);
  }
  const userId = pm.userId;

  // ─── BOQ items ─────────────────────────────────────────────
  console.log("Seeding BOQ items…");
  const boqSamples = [
    { code: "1.1", description: "Site clearance and grubbing", unit: "sqm", quantity: 5000, rate: 25, category: "Civil" },
    { code: "1.2", description: "Excavation in ordinary soil", unit: "cum", quantity: 1200, rate: 350, category: "Civil" },
    { code: "2.1", description: "PCC 1:4:8 in foundation", unit: "cum", quantity: 85, rate: 8500, category: "Concrete" },
    { code: "2.2", description: "RCC M25 in foundation", unit: "cum", quantity: 145, rate: 18500, category: "Concrete" },
    { code: "2.3", description: "RCC M25 in columns", unit: "cum", quantity: 220, rate: 19500, category: "Concrete" },
    { code: "3.1", description: "Reinforcement steel Fe500", unit: "kg", quantity: 18500, rate: 125, category: "Steel" },
    { code: "4.1", description: "Brickwork in cement mortar 1:6", unit: "cum", quantity: 340, rate: 9500, category: "Masonry" },
    { code: "5.1", description: "Cement plaster 15mm thick", unit: "sqm", quantity: 2800, rate: 450, category: "Finishes" },
    { code: "6.1", description: "Vitrified tile flooring", unit: "sqm", quantity: 850, rate: 2200, category: "Finishes" },
    { code: "7.1", description: "Acrylic emulsion paint", unit: "sqm", quantity: 3200, rate: 280, category: "Finishes" },
  ];

  for (let i = 0; i < boqSamples.length; i++) {
    const s = boqSamples[i];
    const existing = await db.boqItem.findUnique({
      where: { projectId_code: { projectId: project.id, code: s.code } },
    });
    if (existing) continue;
    await db.boqItem.create({
      data: {
        projectId: project.id,
        code: s.code,
        description: s.description,
        unit: s.unit,
        quantity: s.quantity,
        rate: s.rate,
        amount: s.quantity * s.rate,
        category: s.category,
        sortOrder: i,
      },
    });
  }
  console.log(`  ✓ ${boqSamples.length} BOQ items`);

  // Add a few ingredients to the RCC M25 in foundation item (2.2)
  const rccItem = await db.boqItem.findUnique({
    where: { projectId_code: { projectId: project.id, code: "2.2" } },
  });
  if (rccItem) {
    const ingredients = [
      { name: "Cement OPC 53", type: "material", quantity: 7.5, unit: "bag", rate: 950 },
      { name: "Sand (river)", type: "material", quantity: 0.42, unit: "cum", rate: 3500 },
      { name: "Aggregate 20mm", type: "material", quantity: 0.83, unit: "cum", rate: 2800 },
      { name: "Mason", type: "labor", quantity: 0.5, unit: "day", rate: 1200 },
      { name: "Laborer", type: "labor", quantity: 1.5, unit: "day", rate: 800 },
      { name: "Concrete mixer", type: "equipment", quantity: 0.2, unit: "day", rate: 2500 },
    ];
    for (const ing of ingredients) {
      await db.boqIngredient.create({
        data: {
          boqItemId: rccItem.id,
          name: ing.name,
          type: ing.type,
          quantity: ing.quantity,
          unit: ing.unit,
          rate: ing.rate,
          amount: ing.quantity * ing.rate,
        },
      });
    }
    console.log(`  ✓ 6 ingredients added to RCC M25 foundation`);
  }

  // ─── Daily reports ─────────────────────────────────────────
  console.log("Seeding daily reports…");
  const reportSamples = [
    {
      offset: -3,
      weatherMorning: "clear",
      weatherAfternoon: "cloudy",
      maxTempC: 32,
      minTempC: 24,
      rainfallMm: 0,
      problems: "Excavation delayed at chainage 2+100 due to underground utility encountered. Informed utility owner for diversion.",
      safetyNotes: "Toolbox talk on underground utilities. All workers equipped with PPE. No incidents.",
    },
    {
      offset: -2,
      weatherMorning: "rain",
      weatherAfternoon: "rain",
      maxTempC: 28,
      minTempC: 22,
      rainfallMm: 15.5,
      problems: "Work halted from 14:00 due to heavy rainfall. Site dewatering pumps deployed.",
      safetyNotes: "Monsoon safety briefing conducted. Slip hazards highlighted.",
    },
    {
      offset: -1,
      weatherMorning: "overcast",
      weatherAfternoon: "clear",
      maxTempC: 30,
      minTempC: 23,
      rainfallMm: 0,
      problems: "Concrete pour for foundation completed at 60% of planned quantity. Pump breakdown caused 2hr delay.",
      safetyNotes: "Concrete pour safety procedures followed. Curing started.",
    },
  ];

  for (let i = 0; i < reportSamples.length; i++) {
    const s = reportSamples[i];
    const number = `DR-${String(i + 1).padStart(3, "0")}`;
    const existing = await db.dailyReport.findUnique({
      where: { projectId_number: { projectId: project.id, number } },
    });
    if (existing) continue;
    const reportDate = new Date();
    reportDate.setDate(reportDate.getDate() + s.offset);
    await db.dailyReport.create({
      data: {
        projectId: project.id,
        createdById: userId,
        number,
        reportDate,
        dayOfWeek: reportDate.toLocaleDateString("en-US", { weekday: "long" }),
        weatherMorning: s.weatherMorning,
        weatherAfternoon: s.weatherAfternoon,
        maxTempC: s.maxTempC,
        minTempC: s.minTempC,
        rainfallMm: s.rainfallMm,
        problems: s.problems,
        safetyNotes: s.safetyNotes,
        status: i === 0 ? "approved" : i === 1 ? "checked" : "submitted",
        preparedAt: new Date(),
        checkedAt: i < 2 ? new Date() : null,
        approvedAt: i === 0 ? new Date() : null,
      },
    });
  }
  console.log(`  ✓ ${reportSamples.length} daily reports`);

  // ─── Gantt tasks ───────────────────────────────────────────
  console.log("Seeding Gantt tasks…");
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const taskSamples = [
    { code: "1", name: "Mobilization & Site Setup", offset: 0, dur: 15, progress: 100 },
    { code: "2", name: "Earthworks", offset: 10, dur: 45, progress: 65 },
    { code: "3", name: "Foundation Works", offset: 40, dur: 60, progress: 30 },
    { code: "4", name: "Substructure", offset: 90, dur: 75, progress: 0 },
    { code: "5", name: "Superstructure", offset: 155, dur: 120, progress: 0 },
    { code: "6", name: "Finishes", offset: 260, dur: 90, progress: 0 },
    { code: "7", name: "Testing & Commissioning", offset: 340, dur: 30, progress: 0 },
    { code: "8", name: "Handover", offset: 365, dur: 1, progress: 0, milestone: true },
  ];

  for (let i = 0; i < taskSamples.length; i++) {
    const s = taskSamples[i];
    const existing = await db.ganttTask.findFirst({
      where: { projectId: project.id, code: s.code },
    });
    if (existing) continue;
    const start = new Date(today);
    start.setDate(start.getDate() + s.offset);
    const end = new Date(start);
    end.setDate(end.getDate() + s.dur);
    await db.ganttTask.create({
      data: {
        projectId: project.id,
        code: s.code,
        name: s.name,
        startDate: start,
        endDate: end,
        duration: s.dur,
        progress: s.progress,
        isMilestone: s.milestone ?? false,
        sortOrder: i,
      },
    });
  }
  console.log(`  ✓ ${taskSamples.length} Gantt tasks`);

  // ─── Rate profiles ───────────────────────────────────────────
  console.log("Seeding rate profiles…");
  const rateProfileSamples = [
    { name: "District Rate Kathmandu 2080", description: "Official district rate for Kathmandu valley FY 2080/81", category: "district_rate", isDefault: true },
    { name: "District Rate Lalitpur 2080", description: "Official district rate for Lalitpur FY 2080/81", category: "district_rate", isDefault: false },
    { name: "District Rate Bhaktapur 2080", description: "Official district rate for Bhaktapur FY 2080/81", category: "district_rate", isDefault: false },
    { name: "Market Rate Kathmandu 2081", description: "Current market rate survey Kathmandu FY 2081/82", category: "market_rate", isDefault: false },
  ];
  for (const rp of rateProfileSamples) {
    const existing = await db.rateProfile.findFirst({ where: { projectId: project.id, name: rp.name } });
    if (existing) continue;
    await db.rateProfile.create({
      data: {
        projectId: project.id,
        name: rp.name,
        description: rp.description,
        category: rp.category,
        isDefault: rp.isDefault,
      },
    });
  }
  console.log(`  ✓ ${rateProfileSamples.length} rate profiles`);

  // ─── Rate analyses (link to BOQ items) ────────────────────────
  console.log("Seeding rate analyses…");
  const boqItems = await db.boqItem.findMany({ where: { projectId: project.id } });
  let raCount = 0;
  for (const item of boqItems) {
    const existing = await db.rateAnalysis.findFirst({ where: { boqItemId: item.id } });
    if (existing) continue;
    await db.rateAnalysis.create({
      data: {
        boqItemId: item.id,
        name: `Rate Analysis — ${item.code} ${item.description}`,
        batchSize: 1,
        isDefault: true,
        ingredients: {
          create: [
            { boqItemId: item.id, name: "Cement OPC 53", type: "material", calcMode: "fixed", quantity: 7.5, unit: "bag", percentage: 0, pctBase: "", rate: 950, amount: 7125, sortOrder: 1 },
            { boqItemId: item.id, name: "Sand (river)", type: "material", calcMode: "fixed", quantity: 0.42, unit: "cum", percentage: 0, pctBase: "", rate: 3500, amount: 1470, sortOrder: 2 },
            { boqItemId: item.id, name: "Aggregate 20mm", type: "material", calcMode: "fixed", quantity: 0.83, unit: "cum", percentage: 0, pctBase: "", rate: 2800, amount: 2324, sortOrder: 3 },
            { boqItemId: item.id, name: "Mason", type: "labor", calcMode: "fixed", quantity: 0.5, unit: "day", percentage: 0, pctBase: "", rate: 1200, amount: 600, sortOrder: 4 },
            { boqItemId: item.id, name: "Laborer", type: "labor", calcMode: "fixed", quantity: 1.5, unit: "day", percentage: 0, pctBase: "", rate: 800, amount: 1200, sortOrder: 5 },
            { boqItemId: item.id, name: "Concrete Mixer", type: "equipment", calcMode: "fixed", quantity: 0.2, unit: "day", percentage: 0, pctBase: "", rate: 2500, amount: 500, sortOrder: 6 },
            { boqItemId: item.id, name: "Vibrator", type: "equipment", calcMode: "fixed", quantity: 0.15, unit: "day", percentage: 0, pctBase: "", rate: 1500, amount: 225, sortOrder: 7 },
            { boqItemId: item.id, name: "Contractor Profit", type: "overhead", calcMode: "percentage", quantity: 0, unit: "", percentage: 10, pctBase: "all", rate: 0, amount: 1342, sortOrder: 8 },
            { boqItemId: item.id, name: "VAT", type: "overhead", calcMode: "percentage", quantity: 0, unit: "", percentage: 13, pctBase: "all_including_pct", rate: 0, amount: 1744, sortOrder: 9 },
          ],
        },
      },
    });
    raCount++;
  }
  console.log(`  ✓ ${raCount} rate analyses`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await db.$disconnect(); });
