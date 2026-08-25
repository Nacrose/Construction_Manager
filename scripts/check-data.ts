import { db } from '@/lib/db';

async function main() {
  const project = await db.project.findUnique({ where: { code: 'ROAD-KTM-01' } });
  if (!project) { console.log('No project'); return; }
  
  const version = await db.ganttVersion.findFirst({ where: { projectId: project.id, isActive: true } });
  console.log('Active version:', version?.id, version?.versionNumber, version?.status, version?.isActive);
  
  const tasks = await db.ganttTask.findMany({ 
    where: { projectId: project.id },
    select: { id: true, code: true, name: true, versionId: true, progress: true, baseProgress: true, isProgressEdited: true, baseProgress: true }
  });
  console.log('Tasks:', tasks.length);
  for (const t of tasks) {
    console.log(' -', t.code, t.name, 'progress:', t.progress, 'baseProgress:', t.baseProgress, 'edited:', t.isProgressEdited, 'baseVersionId:', t.baseVersionId);
  }
  process.exit(0);
}

main().catch(console.error).finally(() => process.exit());