// Seed sample data for all remaining modules.
// Run with: bun prisma/seed-all.ts
import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();

async function main() {
  const project = await db.project.findFirst({
    where: { code: "BRT-001" },
    include: { members: true },
  });
  if (!project) { console.error("BRT-001 not found"); process.exit(1); }

  // ─── Materials ────────────────────────────────────────
  console.log("Seeding materials…");
  const materialSamples = [
    { name: "OPC Cement 53 Grade", code: "MAT-001", category: "Cement", unit: "bag", currentStock: 450, reorderLevel: 100, minStock: 50 },
    { name: "TMT Steel Bar Fe500", code: "MAT-002", category: "Steel", unit: "kg", currentStock: 8500, reorderLevel: 2000, minStock: 500 },
    { name: "River Sand", code: "MAT-003", category: "Aggregate", unit: "cum", currentStock: 35, reorderLevel: 15, minStock: 5 },
    { name: "Coarse Aggregate 20mm", code: "MAT-004", category: "Aggregate", unit: "cum", currentStock: 8, reorderLevel: 15, minStock: 5 },
    { name: "Brick Class A", code: "MAT-005", category: "Masonry", unit: "no", currentStock: 12000, reorderLevel: 5000, minStock: 1000 },
  ];
  for (const s of materialSamples) {
    const exists = await db.material.findFirst({ where: { projectId: project.id, code: s.code } });
    if (exists) continue;
    await db.material.create({ data: { projectId: project.id, ...s } });
  }
  console.log(`  ✓ ${materialSamples.length} materials`);

  // ─── Equipment ────────────────────────────────────────
  console.log("Seeding equipment…");
  const equipSamples = [
    { name: "JCB 3DX Backhoe Loader", code: "EQ-001", type: "excavator", model: "JCB 3DX 2022", status: "active", fuelRate: 12 },
    { name: "Concrete Mixer", code: "EQ-002", type: "mixer", model: "Schwing Stetter CM1500", status: "active", fuelRate: 5 },
    { name: "Concrete Pump", code: "EQ-003", type: "pump", model: "Putzmeister BSA1409", status: "maintenance", fuelRate: 8 },
    { name: "Tower Crane", code: "EQ-004", type: "crane", model: "Potain Igo T85", status: "active", fuelRate: 15 },
  ];
  for (const s of equipSamples) {
    const exists = await db.equipment.findFirst({ where: { projectId: project.id, code: s.code } });
    if (exists) continue;
    const eq = await db.equipment.create({ data: { projectId: project.id, ...s, unit: "hrs" } });
    // Add a sample log
    await db.equipmentLog.create({
      data: {
        equipmentId: eq.id, projectId: project.id, date: new Date(),
        startHours: 1200, endHours: 1208, workedHours: 8, fuelFilled: 50,
        workDescription: "Excavation at chainage 3+500", operator: "Ram Bahadur",
      },
    });
  }
  console.log(`  ✓ ${equipSamples.length} equipment`);

  // ─── Documents ────────────────────────────────────────
  console.log("Seeding documents…");
  const docSamples = [
    { number: "DOC-001", title: "Contract Agreement", type: "contract", discipline: null, revision: "A" },
    { number: "DOC-002", title: "Geotechnical Investigation Report", type: "report", discipline: "civil", revision: "B" },
    { number: "DOC-003", title: "Quality Assurance Plan", type: "spec", discipline: null, revision: "A" },
    { number: "DOC-004", title: "Environmental Clearance Letter", type: "letter", discipline: null, revision: "A" },
  ];
  for (const s of docSamples) {
    const exists = await db.document.findUnique({ where: { projectId_number: { projectId: project.id, number: s.number } } });
    if (exists) continue;
    await db.document.create({ data: { projectId: project.id, ...s, issuedDate: new Date(), receivedFrom: "Client" } });
  }
  console.log(`  ✓ ${docSamples.length} documents`);

  // ─── Drawings ─────────────────────────────────────────
  console.log("Seeding drawings…");
  const drawingSamples = [
    { number: "DWG-C-001", title: "Site Layout Plan", discipline: "civil", revision: "A" },
    { number: "DWG-S-001", title: "Foundation Reinforcement Details", discipline: "structural", revision: "B" },
    { number: "DWG-S-002", title: "Column Schedule", discipline: "structural", revision: "A" },
    { number: "DWG-E-001", title: "Electrical Layout — Station 1", discipline: "electrical", revision: "A" },
    { number: "DWG-A-001", title: "Architectural Elevation", discipline: "architectural", revision: "C" },
  ];
  for (const s of drawingSamples) {
    const exists = await db.drawing.findUnique({ where: { projectId_number: { projectId: project.id, number: s.number } } });
    if (exists) continue;
    await db.drawing.create({ data: { projectId: project.id, ...s, issuedDate: new Date() } });
  }
  console.log(`  ✓ ${drawingSamples.length} drawings`);

  // ─── IPC ──────────────────────────────────────────────
  console.log("Seeding IPCs…");
  const ipcSamples = [
    { number: "IPC-001", period: "Sep 2024", retention: 5, advanceRecovery: 0, status: "paid" },
    { number: "IPC-002", period: "Oct 2024", retention: 5, advanceRecovery: 0, status: "approved" },
    { number: "IPC-003", period: "Nov 2024", retention: 5, advanceRecovery: 50000, status: "certified" },
    { number: "IPC-004", period: "Dec 2024", retention: 5, advanceRecovery: 50000, status: "submitted" },
  ];
  for (const s of ipcSamples) {
    const exists = await db.ipc.findUnique({ where: { projectId_number: { projectId: project.id, number: s.number } } });
    if (exists) continue;
    const ipc = await db.ipc.create({ data: { projectId: project.id, ...s, issueDate: s.status === "paid" || s.status === "approved" ? new Date() : null } });
    // Add a couple of line items
    await db.ipcItem.createMany({
      data: [
        { ipcId: ipc.id, boqCode: "2.2", description: "RCC M25 in foundation", unit: "cum", contractQty: 145, previousQty: 60, thisQty: 40, cumQty: 100, rate: 18500, amount: 40 * 18500 },
        { ipcId: ipc.id, boqCode: "3.1", description: "Reinforcement steel Fe500", unit: "kg", contractQty: 18500, previousQty: 5000, thisQty: 3000, cumQty: 8000, rate: 125, amount: 3000 * 125 },
      ],
    });
    // Recalc totals
    const items = await db.ipcItem.findMany({ where: { ipcId: ipc.id } });
    const gross = items.reduce((s, i) => s + i.amount, 0);
    const retentionAmount = (gross * s.retention) / 100;
    const netPayable = gross - retentionAmount - s.advanceRecovery;
    await db.ipc.update({ where: { id: ipc.id }, data: { grossAmount: gross, retentionAmount, netPayable } });
  }
  console.log(`  ✓ ${ipcSamples.length} IPCs`);

  // ─── Staff ────────────────────────────────────────────
  console.log("Seeding staff…");
  const staffSamples = [
    { name: "Ram Bahadur Thapa", designation: "Site Supervisor", category: "supervisor", phone: "9801234567", dailyWage: 2500 },
    { name: "Hari Gurung", designation: "Mason", category: "skilled", phone: "9802345678", dailyWage: 1500 },
    { name: "Sita Magar", designation: "Laborer", category: "unskilled", phone: "9803456789", dailyWage: 800 },
    { name: "Krishna Tamang", designation: "Steel Fixer", category: "skilled", phone: "9804567890", dailyWage: 1600 },
    { name: "Gita Sharma", designation: "Office Staff", category: "staff", phone: "9805678901", dailyWage: 1200 },
  ];
  for (const s of staffSamples) {
    const exists = await db.staff.findFirst({ where: { projectId: project.id, name: s.name } });
    if (exists) continue;
    const staff = await db.staff.create({ data: { projectId: project.id, ...s, joinedDate: new Date("2024-09-01") } });
    // Add attendance for today
    await db.staffAttendance.create({
      data: {
        staffId: staff.id, projectId: project.id, date: new Date(),
        status: "present", hours: 8, overtime: 0,
      },
    });
  }
  console.log(`  ✓ ${staffSamples.length} staff`);

  // ─── Daily Programs ───────────────────────────────────
  console.log("Seeding daily programs…");
  const today = new Date();
  const existingProg = await db.dailyProgram.findUnique({
    where: { projectId_programDate: { projectId: project.id, programDate: today } },
  });
  if (!existingProg) {
    await db.dailyProgram.create({
      data: {
        projectId: project.id, programDate: today, status: "draft",
        notes: "Focus on foundation works at Station 3-4. Coordinate concrete pour with batching plant.",
        tasks: {
          create: [
            { taskName: "PCC casting at Station 3 foundation", location: "Station 3", boqCode: "2.1", plannedQty: 15, unit: "cum", assignedTo: "Hari Gurung" },
            { taskName: "Reinforcement fabrication for columns", location: "Rebar yard", boqCode: "3.1", plannedQty: 500, unit: "kg", assignedTo: "Krishna Tamang" },
            { taskName: "Formwork erection for plinth beams", location: "Station 2", boqCode: "2.2", plannedQty: 80, unit: "sqm", assignedTo: "Masonry team" },
          ],
        },
      },
    });
    console.log("  ✓ 1 daily program with 3 tasks");
  } else {
    console.log("  – daily program already exists");
  }

  console.log("\nDone. All modules seeded.");
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(async () => { await db.$disconnect(); });
