import { db } from '@/lib/db';

async function main() {
  const project = await db.project.findUnique({ where: { code: 'ROAD-KTM-01' } });
  if (!project) { console.log('No project'); return; }
  
  const version = await db.ganttVersion.findFirst({ where: { projectId: project.id, isDefault: true } });
  console.log('Default version:', version?.id);
  
  const tasks = await db.ganttTask.findMany({ 
    where: { projectId: project.id },
    select: { id: true, code: true, name: true, versionId: true }
  });
  console.log('Tasks:', tasks.length);
  tasks.forEach(t => console.log(' -', t.code, t.name, 'versionId:', t.versionId));
}

main().catch(console.error).finally(() => process.exit());