/**
 * Daily report database synchronization and side-effect processing service.
 */
import { db } from "@/lib/db";
import { getLaborWage, getEquipmentRate, resolveProjectRates } from "@/lib/cost-rates";

type Row = { sortOrder: number; [key: string]: any };

function parseArr(str?: string | null): any[] {
  if (!str) return [];
  try {
    const p = JSON.parse(str);
    return Array.isArray(p) ? p : [];
  } catch {
    return [];
  }
}

/**
 * Sync JSON string fields → normalized relation tables.
 * Called after create/update to keep the relation tables in sync.
 */
export async function syncNormalizedTables(
  reportId: string,
  data: {
    workforce?: string | null;
    workProgress?: string | null;
    equipmentUsed?: string | null;
    materialReceived?: string | null;
    materialConsumed?: string | null;
    siteVisits?: string | null;
    meetings?: string | null;
  }
) {
  const workforce = parseArr(data.workforce) as Row[];
  const progress = parseArr(data.workProgress) as Row[];
  const equipment = parseArr(data.equipmentUsed) as Row[];
  const materials = parseArr(data.materialReceived) as Row[];
  const consumed = parseArr(data.materialConsumed) as Row[];
  const visitors = parseArr(data.siteVisits) as Row[];
  const meetings = parseArr(data.meetings) as Row[];

  // Sync workforce
  await db.dailyReportWorkforce.deleteMany({ where: { reportId } });
  if (workforce.length > 0) {
    await db.dailyReportWorkforce.createMany({
      data: workforce.map((r, i) => ({
        reportId,
        company: r.company || "",
        trade: r.trade || "",
        skill: r.skill || "unskilled",
        headcount: r.headcount || 0,
        regHours: r.regHours || 0,
        otHours: r.otHours || 0,
        location: r.location || null,
        sortOrder: r.sortOrder ?? i,
      })),
    });
  }

  // Sync progress
  await db.dailyReportProgress.deleteMany({ where: { reportId } });
  if (progress.length > 0) {
    await db.dailyReportProgress.createMany({
      data: progress.map((r, i) => ({
        reportId,
        rfiId: r.rfiId || null,
        rfiItemId: r.rfiItemId || null,
        ganttTaskId: r.ganttTaskId || null,
        boqItemId: r.boqItemId || null,
        boqCode: r.boqCode || null,
        boqDesc: r.boqDesc || null,
        taskDescription: r.taskDescription || null,
        plannedQty: Number(r.plannedQty) || 0,
        actualQty:
          Number(r.actualQty) || (r.batchedQty !== undefined ? Number(r.batchedQty) : 0),
        batchedQty:
          r.batchedQty !== undefined
            ? Number(r.batchedQty)
            : r.actualQty !== undefined
              ? Number(r.actualQty)
              : 0,
        payableQty:
          r.payableQty !== undefined
            ? Number(r.payableQty)
            : r.actualQty !== undefined
              ? Number(r.actualQty)
              : 0,
        unit: r.unit || null,
        paymentType: r.paymentType || "payable",
        executionStatus: r.executionStatus || "planned",
        delayReason: r.delayReason || null,
        delayNotes: r.delayNotes || null,
        isEotCandidate: r.isEotCandidate || false,
        location: r.location || null,
        remarks: r.remarks || null,
        sortOrder: r.sortOrder ?? i,
      })),
    });
  }

  // Sync equipment & auto-feed EquipmentLog
  await db.dailyReportEquipment.deleteMany({ where: { reportId } });
  if (equipment.length > 0) {
    await db.dailyReportEquipment.createMany({
      data: equipment.map((r, i) => ({
        reportId,
        equipmentId: r.equipmentId || r.id || null,
        name: r.name || "",
        type: r.type || "",
        ownership: r.ownership || "owned",
        workingHours: r.workingHours || 0,
        fuel: r.fuel || 0,
        sortOrder: r.sortOrder ?? i,
      })),
    });

    const reportInfo = await db.dailyReport.findUnique({
      where: { id: reportId },
      select: { projectId: true, reportDate: true, number: true },
    });

    if (reportInfo) {
      for (const eq of equipment) {
        let targetEquipmentId =
          eq.equipmentId || (eq.id && eq.id.startsWith("cm") ? eq.id : null);

        if (!targetEquipmentId && eq.name) {
          const match = await db.equipment.findFirst({
            where: {
              projectId: reportInfo.projectId,
              name: { equals: eq.name, mode: "insensitive" },
            },
            select: { id: true },
          });
          if (match) targetEquipmentId = match.id;
        }

        if (
          targetEquipmentId &&
          ((eq.workingHours && eq.workingHours > 0) || (eq.fuel && eq.fuel > 0))
        ) {
          const existingLog = await db.equipmentLog.findFirst({
            where: {
              projectId: reportInfo.projectId,
              equipmentId: targetEquipmentId,
              date: reportInfo.reportDate,
            },
          });

          const wHours = Number(eq.workingHours) || 0;
          const fFilled = Number(eq.fuel) || 0;

          if (existingLog) {
            await db.equipmentLog.update({
              where: { id: existingLog.id },
              data: {
                workedHours: wHours,
                endHours: existingLog.startHours + wHours,
                fuelFilled: fFilled,
                workDescription:
                  eq.remarks || `Logged via Daily Report ${reportInfo.number}`,
              },
            });
          } else {
            const lastLog = await db.equipmentLog.findFirst({
              where: { equipmentId: targetEquipmentId },
              orderBy: { date: "desc" },
            });
            const startHours = lastLog ? lastLog.endHours : 0;

            await db.equipmentLog.create({
              data: {
                projectId: reportInfo.projectId,
                equipmentId: targetEquipmentId,
                date: reportInfo.reportDate,
                startHours,
                endHours: startHours + wHours,
                workedHours: wHours,
                fuelFilled: fFilled,
                workDescription:
                  eq.remarks || `Logged via Daily Report ${reportInfo.number}`,
              },
            });
          }
        }
      }
    }
  }

  // Sync materials received
  await db.dailyReportMaterial.deleteMany({ where: { reportId } });
  if (materials.length > 0) {
    await db.dailyReportMaterial.createMany({
      data: materials.map((r, i) => ({
        reportId,
        name: r.name || "",
        qty: r.qty || 0,
        unit: r.unit || null,
        supplier: r.supplier || null,
        vehicle: r.vehicle || null,
        testStatus: r.testStatus || "none",
        sortOrder: r.sortOrder ?? i,
      })),
    });
  }

  // Sync consumed
  await db.dailyReportMaterialConsumed.deleteMany({ where: { reportId } });
  if (consumed.length > 0) {
    await db.dailyReportMaterialConsumed.createMany({
      data: consumed.map((r, i) => ({
        reportId,
        materialId: r.materialId || null,
        name: r.name || "",
        quantity: r.quantity || 0,
        unit: r.unit || null,
        sortOrder: r.sortOrder ?? i,
      })),
    });
  }

  // Sync visitors
  await db.dailyReportVisitor.deleteMany({ where: { reportId } });
  if (visitors.length > 0) {
    await db.dailyReportVisitor.createMany({
      data: visitors.map((r, i) => ({
        reportId,
        visitor: r.visitor || "",
        organization: r.organization || null,
        purpose: r.purpose || null,
        time: r.time || null,
        notes: r.notes || null,
        sortOrder: r.sortOrder ?? i,
      })),
    });
  }

  // Sync meetings
  await db.dailyReportMeeting.deleteMany({ where: { reportId } });
  if (meetings.length > 0) {
    await db.dailyReportMeeting.createMany({
      data: meetings.map((r, i) => ({
        reportId,
        topic: r.topic || "",
        attendees: r.attendees || null,
        notes: r.notes || null,
        sortOrder: r.sortOrder ?? i,
      })),
    });
  }
}

/**
 * Report submission side effects.
 * Called when a daily report transitions from draft → submitted.
 */
export async function processReportSubmission({
  reportId,
  projectId,
  userId,
}: {
  reportId: string;
  projectId: string;
  userId: string;
}) {
  const report = await db.dailyReport.findUnique({
    where: { id: reportId },
    include: {
      workProgress: true,
      materialConsumed: true,
      workforce: true,
      equipmentUsed: true,
    },
  });
  if (!report) return;

  const progressItems = report.workProgress;
  if (progressItems.length === 0) return;

  // 1. Inventory deduction with per-task logging
  try {
    await deductInventoryForReport(report, progressItems, projectId, userId);
  } catch (e) {
    console.error("[processReportSubmission] Inventory deduction failed:", e);
  }

  // 2. Backlog tabulation
  try {
    await tabulateBacklog(report, progressItems, projectId, userId);
  } catch (e) {
    console.error("[processReportSubmission] Backlog tabulation failed:", e);
  }

  // 3. Gantt progress update
  try {
    await updateGanttProgress(report, progressItems, projectId);
  } catch (e) {
    console.error("[processReportSubmission] Gantt progress update failed:", e);
  }

  // 4. Auto-capture costs
  try {
    await captureReportCosts(report, progressItems, projectId, userId);
  } catch (e) {
    console.error("[processReportSubmission] Cost capture failed:", e);
  }
}

async function deductInventoryForReport(
  report: {
    id: string;
    number: string;
    reportDate: Date;
    materialConsumed: Array<{ materialId: string | null; quantity: number }>;
  },
  progressItems: any[],
  projectId: string,
  userId: string
) {
  const hasManualConsumption =
    report.materialConsumed.length > 0 &&
    report.materialConsumed.some((m) => m.materialId && m.quantity > 0);
  if (hasManualConsumption) return;

  const boqCodes = Array.from(
    new Set(
      progressItems
        .filter((p) => p.boqCode && p.actualQty && Number(p.actualQty) > 0)
        .map((p) => p.boqCode as string)
    )
  );

  if (boqCodes.length === 0) return;

  const boqItems = await db.boqItem.findMany({
    where: { projectId, code: { in: boqCodes } },
    include: { ingredients: { where: { type: "material" } } },
  });

  const boqMap = new Map(boqItems.map((b) => [b.code, b]));

  const materialIds = new Set<string>();
  for (const b of boqItems) {
    for (const ing of b.ingredients) {
      if (ing.materialId) materialIds.add(ing.materialId);
    }
  }

  const materials =
    materialIds.size > 0
      ? await db.material.findMany({ where: { id: { in: Array.from(materialIds) } } })
      : [];
  const materialById = new Map(materials.map((m) => [m.id, m]));

  const unmatchedIngredientNames = new Set<string>();
  for (const b of boqItems) {
    for (const ing of b.ingredients) {
      if (!ing.materialId) unmatchedIngredientNames.add(ing.name);
    }
  }
  const materialsByName =
    unmatchedIngredientNames.size > 0
      ? await db.material.findMany({
          where: { projectId, name: { in: Array.from(unmatchedIngredientNames) } },
        })
      : [];
  const materialByName = new Map(materialsByName.map((m) => [m.name.toLowerCase(), m]));

  const transactions: Array<{
    materialId: string;
    quantity: number;
    unit: string;
    remarks: string;
    taskDesc: string;
    boqCode: string;
  }> = [];

  for (const prog of progressItems) {
    const actualQty = Number(prog.actualQty) || 0;
    if (actualQty <= 0) continue;

    const boqCode = prog.boqCode as string;
    const boqItem = boqMap.get(boqCode);
    if (!boqItem) continue;

    const taskDesc = prog.boqDesc || boqItem.description || boqCode;

    for (const ing of boqItem.ingredients) {
      const consumed = ing.quantity * actualQty;
      if (consumed <= 0) continue;

      let material = ing.materialId ? materialById.get(ing.materialId) : null;
      if (!material) {
        material = materialByName.get(ing.name.toLowerCase());
      }
      if (!material) continue;

      transactions.push({
        materialId: material.id,
        quantity: consumed,
        unit: material.unit,
        remarks: `${consumed.toFixed(2)} ${material.unit} of ${material.name} used for ${taskDesc} (BOQ ${boqCode})`,
        taskDesc,
        boqCode,
      });
    }
  }

  if (transactions.length === 0) return;

  await db.$transaction(async (tx) => {
    const byMaterial = new Map<
      string,
      { totalQty: number; entries: typeof transactions }
    >();
    for (const txn of transactions) {
      const existing = byMaterial.get(txn.materialId);
      if (existing) {
        existing.totalQty += txn.quantity;
        existing.entries.push(txn);
      } else {
        byMaterial.set(txn.materialId, { totalQty: txn.quantity, entries: [txn] });
      }
    }

    for (const [materialId, agg] of byMaterial.entries()) {
      const material = await tx.material.findUnique({ where: { id: materialId } });
      if (!material) continue;

      const newStock = Math.max(0, material.currentStock - agg.totalQty);

      for (const entry of agg.entries) {
        await tx.materialTransaction.create({
          data: {
            materialId: entry.materialId,
            projectId,
            type: "issue",
            quantity: entry.quantity,
            unit: entry.unit,
            rate: 0,
            reference: report.number,
            remarks: entry.remarks,
            createdById: userId,
            paymentType: "payable",
          },
        });
      }

      await tx.material.update({
        where: { id: materialId },
        data: { currentStock: newStock },
      });
    }
  });
}

async function tabulateBacklog(
  report: { id: string; number: string; reportDate: Date },
  progressItems: any[],
  projectId: string,
  userId: string
) {
  const reportDate = new Date(report.reportDate);
  const nextDay = new Date(reportDate);
  nextDay.setDate(nextDay.getDate() + 1);

  const program = await db.dailyProgram.findUnique({
    where: { projectId_programDate: { projectId, programDate: reportDate } },
    include: { tasks: true },
  });

  if (!program) return;

  let nextProgram = await db.dailyProgram.findUnique({
    where: { projectId_programDate: { projectId, programDate: nextDay } },
  });

  for (const prog of progressItems) {
    const actualQty = Number(prog.actualQty) || 0;
    const plannedQty = Number(prog.plannedQty) || 0;
    const boqCode = prog.boqCode as string;
    const boqDesc = prog.boqDesc as string;

    const task = program.tasks.find(
      (t) => t.boqCode === boqCode || t.taskName === boqDesc
    );
    if (!task) continue;

    let executionStatus: string;
    if (actualQty >= plannedQty && actualQty > 0) {
      executionStatus = "done";
    } else if (actualQty > 0 && actualQty < plannedQty) {
      executionStatus = "partially_completed";
    } else {
      executionStatus = "uncompleted";
    }

    await db.dailyProgramTask.update({
      where: { id: task.id },
      data: { actualQty, executionStatus },
    });

    if (actualQty < plannedQty) {
      const remainingQty = plannedQty - actualQty;

      const existingCarryOver = await db.dailyProgramTask.findFirst({
        where: {
          carriedOverFromId: task.id,
          program: { programDate: nextDay },
        },
      });

      if (existingCarryOver) {
        await db.dailyProgramTask.update({
          where: { id: existingCarryOver.id },
          data: { plannedQty: remainingQty, executionStatus: "planned" },
        });
      } else if (nextProgram) {
        await db.dailyProgramTask.create({
          data: {
            programId: nextProgram.id,
            taskName: task.taskName,
            location: task.location,
            boqItemId: task.boqItemId,
            boqCode: task.boqCode,
            boqDesc: task.boqDesc,
            plannedQty: remainingQty,
            unit: task.unit,
            paymentType: task.paymentType,
            assignedTo: task.assignedTo,
            remarks: `Carried over from ${report.number} (incomplete: ${actualQty}/${plannedQty} ${task.unit || ""})`,
            carriedOverFromId: task.id,
            subcontractorId: task.subcontractorId,
            ganttTaskId: task.ganttTaskId,
            rfiId: task.rfiId,
          },
        });
      }
    }
  }
}

async function updateGanttProgress(
  report: { id: string; number: string; reportDate: Date },
  progressItems: any[],
  projectId: string
) {
  const directGanttTaskIds = progressItems
    .map((p) => p.ganttTaskId)
    .filter((id): id is string => Boolean(id));

  const boqCodes = Array.from(
    new Set(
      progressItems
        .filter((p) => p.boqCode && (p.actualQty || p.payableQty || p.batchedQty))
        .map((p) => p.boqCode as string)
    )
  );

  let tasksWithGantt: Array<{ ganttTaskId: string | null; boqCode: string | null }> = [];
  if (boqCodes.length > 0) {
    tasksWithGantt = await db.dailyProgramTask.findMany({
      where: {
        boqCode: { in: boqCodes },
        ganttTaskId: { not: null },
        program: { projectId },
      },
      select: { ganttTaskId: true, boqCode: true },
    });
  }

  const allGanttTaskIds = Array.from(
    new Set([
      ...directGanttTaskIds,
      ...tasksWithGantt.map((t) => t.ganttTaskId).filter((id): id is string => Boolean(id)),
    ])
  );

  if (allGanttTaskIds.length === 0) return;

  const approvedProgressRows = await db.dailyReportProgress.findMany({
    where: {
      report: {
        projectId,
        status: { in: ["submitted", "approved", "checked", "archived"] },
      },
      OR: [
        { ganttTaskId: { in: allGanttTaskIds } },
        ...(boqCodes.length > 0 ? [{ boqCode: { in: boqCodes } }] : []),
      ],
    },
    select: {
      ganttTaskId: true,
      boqCode: true,
      actualQty: true,
      payableQty: true,
      batchedQty: true,
    },
  });

  for (const ganttTaskId of allGanttTaskIds) {
    const ganttTask = await db.ganttTask.findUnique({
      where: { id: ganttTaskId },
      include: {
        boqLinks: { include: { boqItem: { select: { code: true, quantity: true } } } },
      },
    });

    if (!ganttTask) continue;

    const totalPlanned = ganttTask.boqLinks.reduce(
      (sum, link) => sum + (link.quantity || link.boqItem?.quantity || 0),
      0
    );

    if (totalPlanned <= 0) continue;

    const taskBoqCodes = new Set(
      ganttTask.boqLinks.map((l) => l.boqItem?.code).filter(Boolean)
    );

    const matchingRows = approvedProgressRows.filter(
      (r) =>
        r.ganttTaskId === ganttTaskId || (r.boqCode && taskBoqCodes.has(r.boqCode))
    );

    const totalActual = matchingRows.reduce(
      (sum, r) => sum + (r.payableQty ?? r.actualQty ?? r.batchedQty ?? 0),
      0
    );

    const progressPct = Math.min(
      100,
      Math.max(0, Math.round((totalActual / totalPlanned) * 100))
    );

    if (Math.abs(progressPct - ganttTask.progress) >= 1) {
      await db.ganttTask.update({
        where: { id: ganttTaskId },
        data: {
          progress: progressPct,
        },
      });
    }
  }
}

async function captureReportCosts(
  report: {
    id: string;
    number: string;
    reportDate: Date;
    workProgress: any[];
    workforce: any[];
    equipmentUsed: any[];
  },
  progressItems: any[],
  projectId: string,
  userId: string
) {
  const costsToCreate: Array<{
    amount: number;
    category: string;
    subcategory: string | null;
    description: string;
    boqItemId: string | null;
    ganttTaskId: string | null;
  }> = [];

  const boqCodes = Array.from(
    new Set(
      progressItems
        .filter((p) => p.boqCode && p.actualQty && Number(p.actualQty) > 0)
        .map((p) => p.boqCode as string)
    )
  );

  if (boqCodes.length > 0) {
    const boqItems = await db.boqItem.findMany({
      where: { projectId, code: { in: boqCodes } },
      include: {
        ingredients: { where: { type: "material" } },
        dailyProgramTasks: {
          where: { program: { projectId } },
          take: 1,
          select: { ganttTaskId: true },
        },
      },
    });
    const boqMap = new Map(boqItems.map((b) => [b.code, b]));

    for (const prog of progressItems) {
      const actualQty = Number(prog.actualQty) || 0;
      if (actualQty <= 0) continue;

      const boqItem = boqMap.get(prog.boqCode);
      if (!boqItem) continue;

      const taskDesc = prog.boqDesc || boqItem.description || prog.boqCode;
      const ganttTaskId = boqItem.dailyProgramTasks[0]?.ganttTaskId ?? null;

      let taskMaterialCost = 0;
      for (const ing of boqItem.ingredients) {
        const consumed = ing.quantity * actualQty;
        const rate = ing.rate || ing.amount / (ing.quantity || 1);
        taskMaterialCost += consumed * rate;
      }

      if (taskMaterialCost > 0) {
        costsToCreate.push({
          amount: taskMaterialCost,
          category: "material",
          subcategory: boqItem.ingredients[0]?.name || null,
          description: `Material cost for ${taskDesc} (${actualQty} ${prog.unit || ""})`,
          boqItemId: boqItem.id,
          ganttTaskId,
        });
      }
    }
  }

  const project = await db.project.findUnique({
    where: { id: projectId },
    select: {
      skilledWageRate: true,
      unskilledWageRate: true,
      supervisorWageRate: true,
      ownedEquipRate: true,
      hiredEquipRate: true,
      fuelPricePerLiter: true,
    },
  });
  const projectRates = resolveProjectRates(project);

  if (report.workforce && report.workforce.length > 0) {
    try {
      const staffIds = report.workforce
        .filter((w: any) => w.staffId)
        .map((w: any) => w.staffId);
      const staffMap = new Map<
        string,
        { dailyWage: number; name: string; category: string | null }
      >();
      if (staffIds.length > 0) {
        const staff = await db.staff.findMany({
          where: { id: { in: staffIds } },
          select: { id: true, name: true, dailyWage: true, category: true },
        });
        for (const s of staff)
          staffMap.set(s.id, {
            dailyWage: s.dailyWage,
            name: s.name,
            category: s.category,
          });
      }

      let totalLaborCost = 0;
      let totalHeadcount = 0;
      for (const w of report.workforce) {
        const headcount = Number(w.headcount) || 0;
        const regHours = Number(w.regHours) || 0;
        const otHours = Number(w.otHours) || 0;
        totalHeadcount += headcount;

        let dailyWage = getLaborWage(
          w.staffId ? staffMap.get(w.staffId)?.dailyWage : null,
          w.skill,
          staffMap.get(w.staffId)?.category ?? undefined,
          projectRates
        );

        const hourlyRate = dailyWage / 8;
        const otRate = hourlyRate * 1.5;

        const laborCost = headcount * (regHours * hourlyRate + otHours * otRate);
        totalLaborCost += laborCost;
      }

      if (totalLaborCost > 0) {
        costsToCreate.push({
          amount: totalLaborCost,
          category: "labor",
          subcategory: "Site Workforce",
          description: `Labor cost for ${totalHeadcount} workers (${report.workforce.length} crews)`,
          boqItemId: null,
          ganttTaskId: null,
        });
      }
    } catch {
      /* ignore */
    }
  }

  if (report.equipmentUsed && report.equipmentUsed.length > 0) {
    try {
      const equipIds = report.equipmentUsed
        .filter((e: any) => e.equipmentId)
        .map((e: any) => e.equipmentId);
      const equipMap = new Map<string, { fuelRate: number; name: string }>();
      if (equipIds.length > 0) {
        const equips = await db.equipment.findMany({
          where: { id: { in: equipIds } },
          select: { id: true, name: true, fuelRate: true },
        });
        for (const e of equips) equipMap.set(e.id, { fuelRate: e.fuelRate, name: e.name });
      }

      let totalEquipCost = 0;
      let totalFuelCost = 0;
      const FUEL_PRICE_PER_LITER = projectRates.equipment.fuelPricePerLiter;

      for (const e of report.equipmentUsed) {
        const workingHours = Number(e.workingHours) || 0;
        const fuel = Number(e.fuel) || 0;

        let hourlyRate = getEquipmentRate(e.ownership, projectRates);
        if (fuel > 0) {
          totalFuelCost += fuel * FUEL_PRICE_PER_LITER;
        }

        totalEquipCost += workingHours * hourlyRate;
      }

      totalEquipCost += totalFuelCost;

      if (totalEquipCost > 0) {
        costsToCreate.push({
          amount: totalEquipCost,
          category: "equipment",
          subcategory: "Site Equipment",
          description: `Equipment cost for ${report.equipmentUsed.length} units (incl. fuel)`,
          boqItemId: null,
          ganttTaskId: null,
        });
      }
    } catch {
      /* ignore */
    }
  }

  if (costsToCreate.length === 0) return;

  await db.projectCost.deleteMany({
    where: {
      projectId,
      source: "daily_report",
      sourceRefId: report.id,
    },
  });

  await db.projectCost.createMany({
    data: costsToCreate.map((c) => ({
      projectId,
      date: new Date(report.reportDate),
      amount: c.amount,
      category: c.category,
      subcategory: c.subcategory,
      description: c.description,
      boqItemId: c.boqItemId,
      ganttTaskId: c.ganttTaskId,
      source: "daily_report",
      sourceRef: report.number,
      sourceRefId: report.id,
      createdById: userId,
    })),
  });
}
