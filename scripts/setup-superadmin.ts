import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const db = new PrismaClient();

async function main() {
  const isProduction = process.env.NODE_ENV === "production" || Boolean(process.env.VERCEL_ENV);

  const email = process.env.SUPERADMIN_EMAIL?.trim()?.toLowerCase();
  const password = process.env.SUPERADMIN_PASSWORD?.trim();

  if (!email || !password) {
    if (isProduction) {
      console.error(
        "[FATAL] SUPERADMIN_EMAIL and SUPERADMIN_PASSWORD environment variables are strictly required in production."
      );
      process.exit(1);
    }
    console.error(
      "[ERROR] Please provide SUPERADMIN_EMAIL and SUPERADMIN_PASSWORD environment variables.\n" +
      "Example: SUPERADMIN_EMAIL=admin@yourdomain.com SUPERADMIN_PASSWORD='StrongPassword123!' npx tsx scripts/setup-superadmin.ts"
    );
    process.exit(1);
  }

  if (password.length < 12) {
    console.error("[FATAL] SUPERADMIN_PASSWORD must be at least 12 characters long for security.");
    process.exit(1);
  }

  const hash = await bcrypt.hash(password, 12);

  // Check if superadmin exists
  const existing = await db.user.findUnique({ where: { email } });

  if (existing) {
    await db.user.update({
      where: { id: existing.id },
      data: {
        passwordHash: hash,
        isSuperAdmin: true,
        role: "admin",
        organizationId: null,
      },
    });
    console.log(`Updated existing user ${email} to Superadmin!`);
  } else {
    await db.user.create({
      data: {
        email,
        name: "Super Admin",
        passwordHash: hash,
        role: "admin",
        isSuperAdmin: true,
        organizationId: null,
      },
    });
    console.log(`Created new Superadmin user ${email}!`);
  }
}

main()
  .catch((e) => {
    console.error("Superadmin setup error:", e);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
