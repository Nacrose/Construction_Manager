import { db } from '@/lib/db';

async function check() {
  const project = await db.project.findUnique({ where: { code: 'ROAD-KTM-01' } });
  if (!project) { console.log('No project'); return; }
  
  const [boqCount, analysisCount, taskCount, libCount, rfiCount, dailyCount, matCount, equipCount] = await Promise.all([
    db.boqItem.count({ where: { projectId: project.id } }),
    db.rateAnalysis.count({ where: { boqItem: { projectId: project.id } } }),
    db.ganttTask.count({ where: { projectId: project.id } }),
    db.analysisLibrary.count({ where: { projectId: project.id } }),
    db.rfi.count({ where: { projectId: project.id } }),
    db.dailyReport.count({ where: { projectId: project.id } }),
    db.material.count({ where: { projectId: project.id } }),
    db.equipment.count({ where: { projectId: project.id } }),
  ]);
  
  console.log('BOQ Items:', boqCount);
  console.log('Rate Analyses:', analysisCount);
  console.log('Gantt Tasks:', taskCount);
  console.log('Analysis Libraries:', taskCount);
  console.log('RFIs:', rfiCount);
  console.log('Daily Reports:', dailyCount);
  console.log('Materials:', matCount);
  console.log('Equipment:', equipCount);
}

check().catch(console.error).finally(() => process.exit());
