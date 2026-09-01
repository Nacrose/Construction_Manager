import { createSeedDb, enableSeedRlsBypass } from "./seed-rls";
import bcrypt from "bcryptjs";

const db = createSeedDb();

async function seedSuperAdmin() {
  const superAdminEmail = process.env.SUPERADMIN_EMAIL?.toLowerCase().trim();
  const superAdminPassword = process.env.SUPERADMIN_PASSWORD;
  const superAdminName = process.env.SUPERADMIN_NAME || "Platform Administrator";

  if (!superAdminEmail || !superAdminPassword) {
    console.log("ℹ️ No SUPERADMIN_EMAIL/SUPERADMIN_PASSWORD in environment. Skipping superadmin provisioning.");
    return;
  }

  const existing = await db.user.findFirst({
    where: { OR: [{ email: superAdminEmail }, { isSuperAdmin: true }] },
  });

  if (existing) {
    console.log(`✓ Superadmin account already exists (${existing.email}).`);
    return;
  }

  const passwordHash = await bcrypt.hash(superAdminPassword, 12);
  const user = await db.user.create({
    data: {
      email: superAdminEmail,
      name: superAdminName,
      passwordHash,
      role: "project_manager",
      isSuperAdmin: true,
      orgRole: "org_admin",
    },
  });

  console.log(`✅ Platform Superadmin created: ${user.email} (${user.name})`);
}

async function main() {
  await enableSeedRlsBypass(db);
  await seedSuperAdmin();
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
