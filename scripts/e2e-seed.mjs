/**
 * E2E seed: minimal deterministic dataset for the Playwright smoke suite.
 *
 * Run with DATABASE_URL pointing at the scratch e2e Postgres (see
 * scripts/e2e-run.py). Idempotent — safe to re-run against the same DB.
 *
 * Seeds:
 *   Organization  code "E2E-ORG"
 *   User          pm@e2e.test (org member, project_manager) — NOT superadmin
 *   Project       "E2E Highway Bridge Project" (code E2E-P1)
 *   ProjectMember the PM as project_manager (unlocks expense approve UI)
 *   SiteExpense   EXP-001 "E2E cement delivery to site", NPR 12,500.50, pending
 *
 * The smoke suite asserts on these exact strings — change them here and in
 * tests/e2e/smoke.spec.ts together.
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const EMAIL = process.env.E2E_LOGIN_EMAIL || "pm@e2e.test";
const PASSWORD = process.env.E2E_LOGIN_PASSWORD || "E2eTest!Pass2026";
const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL || "admin@e2e.test";
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD || "E2eAdmin!Pass2026";
const PROJECT_NAME = "E2E Highway Bridge Project";
const EXPENSE_NUMBER = "EXP-001";

const db = new PrismaClient();

async function main() {
  const org = await db.organization.upsert({
    where: { code: "E2E-ORG" },
    create: { code: "E2E-ORG", name: "E2E Construction Pvt Ltd" },
    update: { name: "E2E Construction Pvt Ltd" },
  });

  const passwordHash = await bcrypt.hash(PASSWORD, 12);
  const user = await db.user.upsert({
    where: { email: EMAIL },
    create: {
      email: EMAIL,
      name: "E2E Project Manager",
      passwordHash,
      role: "project_manager",
      organizationId: org.id,
      orgRole: "member",
      isSuperAdmin: false,
    },
    update: { passwordHash, organizationId: org.id, deactivatedAt: null, deactivatedReason: null },
  });

  // Project.code is not unique in the schema — find by code, then create/update.
  let project = await db.project.findFirst({ where: { code: "E2E-P1" } });
  if (!project) {
    project = await db.project.create({
      data: {
        name: PROJECT_NAME,
        code: "E2E-P1",
        client: "E2E Test Client",
        location: "Kathmandu",
        status: "active",
        createdById: user.id,
        organizationId: org.id,
        startDate: new Date("2026-01-05T00:00:00Z"),
        contractValue: 125000000,
      },
    });
  } else {
    project = await db.project.update({
      where: { id: project.id },
      data: { name: PROJECT_NAME, organizationId: org.id, status: "active", createdById: user.id },
    });
  }

  const member = await db.projectMember.findFirst({
    where: { projectId: project.id, userId: user.id },
  });
  if (!member) {
    await db.projectMember.create({
      data: { projectId: project.id, userId: user.id, role: "project_manager" },
    });
  }

  // One fresh PENDING expense per run (delete stale copies first).
  await db.siteExpense.deleteMany({ where: { projectId: project.id, number: EXPENSE_NUMBER } });
  const expense = await db.siteExpense.create({
    data: {
      projectId: project.id,
      number: EXPENSE_NUMBER,
      date: new Date("2026-08-28T04:00:00Z"),
      category: "material",
      description: "E2E cement delivery to site",
      amount: 12500.5,
      vatAmount: 0,
      totalAmount: 12500.5,
      paymentMode: "cash",
      status: "pending",
      createdById: user.id,
    },
  });

  // Platform superadmin for the admin-plane tests (admin login + holiday CRUD).
  // NOTE: a superadmin CANNOT log in via the customer /api/auth/login (by
  // design) — /api/auth/admin-login creates the kind="admin" session.
  const adminHash = await bcrypt.hash(ADMIN_PASSWORD, 12);
  await db.user.upsert({
    where: { email: ADMIN_EMAIL },
    create: {
      email: ADMIN_EMAIL,
      name: "E2E Platform Admin",
      passwordHash: adminHash,
      role: "project_manager",
      isSuperAdmin: true,
      orgRole: "org_admin",
    },
    update: { passwordHash: adminHash, isSuperAdmin: true, deactivatedAt: null, deactivatedReason: null },
  });

  // Fresh slate for the holiday CRUD test (delete leftovers from prior runs).
  await db.holiday.deleteMany({ where: { date: "2026-12-25" } });

  console.log(JSON.stringify({
    ok: true,
    orgId: org.id,
    userId: user.id,
    projectId: project.id,
    expenseId: expense.id,
    email: EMAIL,
    adminEmail: ADMIN_EMAIL,
    projectName: PROJECT_NAME,
  }));
}

main()
  .catch((err) => {
    console.error("E2E seed failed:", err);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
