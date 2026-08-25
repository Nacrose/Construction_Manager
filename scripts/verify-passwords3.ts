import { db } from '@/lib/db';
import bcrypt from 'bcryptjs';

// Usage: MANAGER_PASSWORD=xxx ENGINEER_PASSWORD=xxx npx tsx scripts/verify-passwords3.ts
const credentials = [
  { email: 'manager@pm.com', password: process.env.MANAGER_PASSWORD || '' },
  { email: 'engineer@pm.com', password: process.env.ENGINEER_PASSWORD || '' },
  { email: 'coordinator@pm.com', password: process.env.COORD_PASSWORD || '' },
  { email: 'client@pm.com', password: process.env.CLIENT_PASSWORD || '' },
];

async function main() {
  const hasAnyPassword = credentials.some(c => c.password);
  if (!hasAnyPassword) {
    console.log('No passwords provided via env vars. Set MANAGER_PASSWORD, ENGINEER_PASSWORD, etc.');
    process.exit(1);
  }

  for (const u of credentials) {
    if (!u.password) continue;
    const user = await db.user.findUnique({ where: { email: u.email } });
    if (user) {
      const valid = await bcrypt.compare(u.password, user.passwordHash);
      console.log(`${u.email}: ${valid ? 'valid' : 'INVALID'}`);
    }
  }
  process.exit(0);
}
