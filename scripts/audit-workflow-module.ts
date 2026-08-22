import { db } from "../src/lib/db";
import { Prisma } from "@prisma/client";

async function main() {
  console.log("=== WORKFLOW MODULE DEEP AUDIT ===");

  // 1. Daily Programs & Tasks
  const totalDailyPrograms = await db.dailyProgram.count();
  const totalDailyProgramTasks = await db.dailyProgramTask.count();
  const orphanedProgramTasks = await db.$queryRaw<any[]>(Prisma.sql`
    SELECT count(*)::int as count FROM "DailyProgramTask" dpt
    LEFT JOIN "DailyProgram" dp ON dp.id = dpt."programId"
    WHERE dp.id IS NULL
  `);
  console.log("Daily Programs:", {
    totalDailyPrograms,
    totalDailyProgramTasks,
    orphanedProgramTasks,
  });

  // 2. Daily Site Reports & Subsections
  const totalDailyReports = await db.dailyReport.count();
  const totalProgressRows = await db.dailyReportProgress.count();
  const totalWorkforceRows = await db.dailyReportWorkforce.count();
  const totalEquipmentRows = await db.dailyReportEquipment.count();
  const totalMaterialRows = await db.dailyReportMaterial.count();
  const totalMaterialConsumedRows = await db.dailyReportMaterialConsumed.count();
  const totalVisitorRows = await db.dailyReportVisitor.count();
  const totalMeetingRows = await db.dailyReportMeeting.count();

  const orphanedProgress = await db.$queryRaw<any[]>(Prisma.sql`
    SELECT count(*)::int as count FROM "DailyReportProgress" drp
    LEFT JOIN "DailyReport" dr ON dr.id = drp."reportId"
    WHERE dr.id IS NULL
  `);

  console.log("Daily Site Reports:", {
    totalDailyReports,
    totalProgressRows,
    totalWorkforceRows,
    totalEquipmentRows,
    totalMaterialRows,
    totalMaterialConsumedRows,
    totalVisitorRows,
    totalMeetingRows,
    orphanedProgress,
  });

  // 3. RFIs (Request for Information)
  const totalRfis = await db.rfi.count();
  const openRfis = await db.rfi.count({ where: { status: "OPEN" } });
  const pendingReviewRfis = await db.rfi.count({ where: { status: "UNDER_REVIEW" } });
  const closedRfis = await db.rfi.count({ where: { status: "CLOSED" } });
  const totalRfiComments = await db.rfiComment.count();
  const totalRfiItems = await db.rfiItem.count();
  const totalRfiAttachments = await db.rfiAttachment.count();
  console.log("RFIs Overview:", {
    totalRfis,
    openRfis,
    pendingReviewRfis,
    closedRfis,
    totalRfiComments,
    totalRfiItems,
    totalRfiAttachments,
  });

  // 4. Submittals
  const totalSubmittals = await db.submittal.count();
  const draftSubmittals = await db.submittal.count({ where: { status: "draft" } });
  const submittedSubmittals = await db.submittal.count({ where: { status: "submitted" } });
  const approvedSubmittals = await db.submittal.count({ where: { status: "approved" } });
  console.log("Submittals Overview:", {
    totalSubmittals,
    draftSubmittals,
    submittedSubmittals,
    approvedSubmittals,
  });

  // 5. Punch Lists
  const totalPunchItems = await db.punchItem.count();
  const openPunchItems = await db.punchItem.count({ where: { status: "open" } });
  const completedPunchItems = await db.punchItem.count({ where: { status: "completed" } });
  console.log("Punch List Items:", {
    totalPunchItems,
    openPunchItems,
    completedPunchItems,
  });

  // 6. Correspondences & Letters
  const totalCorrespondences = await db.correspondence.count();
  const incomingLetters = await db.correspondence.count({ where: { direction: "incoming" } });
  const outgoingLetters = await db.correspondence.count({ where: { direction: "outgoing" } });
  console.log("Correspondences & Formal Letters:", {
    totalCorrespondences,
    incomingLetters,
    outgoingLetters,
  });

  // 7. Variation Orders
  const totalVariationOrders = await db.variationOrder.count();
  const totalVariationItems = await db.variationOrderItem.count();
  console.log("Variation Orders:", {
    totalVariationOrders,
    totalVariationItems,
  });

  // 8. Projects Check
  const activeProjects = await db.project.findMany({
    select: { id: true, name: true, code: true },
    take: 5,
  });

  for (const proj of activeProjects) {
    const rfiCount = await db.rfi.count({ where: { projectId: proj.id } });
    const reportCount = await db.dailyReport.count({ where: { projectId: proj.id } });
    const programCount = await db.dailyProgram.count({ where: { projectId: proj.id } });
    const submittalCount = await db.submittal.count({ where: { projectId: proj.id } });
    const punchCount = await db.punchItem.count({ where: { projectId: proj.id } });
    const letterCount = await db.correspondence.count({ where: { projectId: proj.id } });
    const voCount = await db.variationOrder.count({ where: { projectId: proj.id } });
    console.log(`Project "${proj.name}" (${proj.code}):`, {
      dailyReports: reportCount,
      dailyPrograms: programCount,
      rfis: rfiCount,
      submittals: submittalCount,
      punchItems: punchCount,
      letters: letterCount,
      variationOrders: voCount,
    });
  }
}

main().catch(console.error).finally(() => process.exit(0));
