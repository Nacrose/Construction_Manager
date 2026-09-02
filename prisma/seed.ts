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
      isSuperAdmin: true,
      orgRole: "org_admin",
    },
  });

  console.log(`✅ Platform Superadmin created: ${user.email} (${user.name})`);
}

/**
 * Seed skeleton for the operating-model redesign (ADR-0004/0005/0007).
 *
 * Creates the demo "owner_led" organization with its ACTIVE
 * OrganizationPolicyVersion v1. The capabilities JSON below is the typed
 * OperatingCapabilities map (src/server/policy/capabilities.ts); the owner
 * alone runs every workflow — procurementChain "none" means requisitions,
 * POs, quotes, stores and gate registers DO NOT EXIST for this org, they
 * are not merely hidden. New transactions bind this version; history is
 * never reinterpreted under later settings.
 */
const OWNER_LED_CAPABILITIES = {
  procurementChain: "none",
  inventoryControl: "none",
  gateRegister: false,
  financeReview: "owner_recorded",
  directPurchase: true,
  directExpense: true,
  workforcePlanning: true,
};

async function seedOwnerLedOrg() {
  const orgCode = process.env.DEMO_ORG_CODE?.trim();
  if (!orgCode) {
    console.log("ℹ️ No DEMO_ORG_CODE in environment. Skipping demo org seed.");
    return;
  }
  const orgName = process.env.DEMO_ORG_NAME || `${orgCode} Construction`;
  const ownerEmail = (process.env.DEMO_OWNER_EMAIL || "owner@demo.local").toLowerCase();
  const ownerPassword = process.env.DEMO_OWNER_PASSWORD || "demo-owner-1";

  const existing = await db.organization.findUnique({ where: { code: orgCode } });
  if (existing) {
    console.log(`✓ Demo org already exists (${orgCode}).`);
    return;
  }

  const org = await db.organization.create({
    data: { name: orgName, code: orgCode, operatingMethod: "owner_led" },
  });

  // Policy version v1 — the org's ACTIVE snapshot (prospective-only, ADR-0004)
  const policy = await db.organizationPolicyVersion.create({
    data: {
      organizationId: org.id,
      version: 1,
      operatingMethod: "owner_led",
      capabilities: OWNER_LED_CAPABILITIES,
      notes: "Initial owner_led policy — seeded",
    },
  });
  await db.organization.update({
    where: { id: org.id },
    data: { activePolicyVersionId: policy.id },
  });

  // Owner app account (orgRole "owner") + linked workforce identity.
  // Linking grants no permission and the assignment grants no access —
  // the two facts stay independent (ADR-0005).
  const passwordHash = await bcrypt.hash(ownerPassword, 12);
  const owner = await db.user.create({
    data: {
      email: ownerEmail,
      name: "Owner",
      passwordHash,
      organizationId: org.id,
      orgRole: "owner",
    },
  });

  console.log(`✅ Demo owner-led org created: ${org.name} (${org.code})`);
  console.log(`   Owner login: ${owner.email} / ${ownerPassword}`);
  console.log(`   Active policy: v1 owner_led (policy ${policy.id})`);
}

async function main() {
  await enableSeedRlsBypass(db);
  await seedSuperAdmin();
  await seedOwnerLedOrg();
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
