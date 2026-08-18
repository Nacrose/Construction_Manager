import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const db = new PrismaClient();

async function main() {
  const email = "admin@pm.com";
  const password = "password123";
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
