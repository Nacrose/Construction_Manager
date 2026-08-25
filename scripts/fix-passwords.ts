import { db } from '@/lib/db';
import bcrypt from 'bcryptjs';

// Usage: ENGINEER_PASSWORD=xxx COORD_PASSWORD=xxx CLIENT_PASSWORD=xxx npx tsx scripts/fix-passwords.ts
const credentials = [
  { email: 'engineer@pm.com', password: process.env.ENGINEER_PASSWORD || '' },
  { email: 'coordinator@pm.com', password: process.env.COORD_PASSWORD || '' },
  { email: 'client@pm.com', password: process.env.CLIENT_PASSWORD || '' },
];

async function main() {
  const hasAnyPassword = credentials.some(c => c.password);
  if (!hasAnyPassword) {
    console.log('No passwords provided via env vars. Set ENGINEER_PASSWORD, COORD_PASSWORD, CLIENT_PASSWORD.');
    process.exit(1);
  }

  for (const u of credentials) {
    if (!u.password) continue;
    const hash = await bcrypt.hash(u.password, 12);
    await db.user.update({
      where: { email: u.email },
      data: { passwordHash: hash }
    });
    console.log('Updated:', u.email);
  }
  console.log('Done');
}

main().catch(console.error).finally(() => process.exit());
