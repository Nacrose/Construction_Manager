import { db } from '@/lib/db';

async function main() {
  await db.project.deleteMany({ where: { code: 'ROAD-KTM-01' } });
  console.log('Deleted project');
  process.exit(0);
}

main().catch(console.error).finally(() => process.exit());