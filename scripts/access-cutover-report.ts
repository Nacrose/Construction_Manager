/**
 * Phase B cutover report (ADR-0005): enumerate access BEFORE the implicit
 * grant removal lands.
 *
 * What changed in Phase B
 * -----------------------
 * `getProjectRole` no longer grants:
 *   - org member  → engineer   (implicit, removed)
 *   - org admin   → project_manager (implicit, removed)
 * Only the organization owner keeps org-wide project access, and superadmin
 * impersonation keeps its session-scoped support path.
 *
 * What this report answers
 * ------------------------
 * For every organization:
 *   1. Users by orgRole (owner / org_admin / member).
 *   2. Per project: who has explicit ProjectMember rows, and who currently
 *      relies on the implicit grant — i.e. org users WITHOUT a membership
 *      row other than the owner. Those users LOSE project access at cutover.
 *
 * Run this against the production database BEFORE deploying Phase B, decide
 * per user whether to grant an explicit ProjectMember row (project.addMember)
 * or accept the access removal, then deploy.
 *
 * Usage:
 *   npx tsx scripts/access-cutover-report.ts            # console summary
 *   npx tsx scripts/access-cutover-report.ts --json     # machine-readable
 */
import { db } from "../src/lib/db";

type MemberRow = { userId: string; role: string };

async function main() {
  const orgs = await db.organization.findMany({
    where: { status: "active" },
    select: { id: true, name: true, code: true },
    orderBy: { code: "asc" },
  });

  const report: Array<{
    org: { id: string; name: string; code: string };
    usersByRole: Record<string, number>;
    usersWithoutRole: number;
    projects: Array<{
      id: string;
      name: string;
      explicitMembers: MemberRow[];
      losingAccess: Array<{ userId: string; name: string; email: string; orgRole: string }>;
    }>;
  }> = [];

  for (const org of orgs) {
    const users = await db.user.findMany({
      where: { organizationId: org.id, deactivatedAt: null },
      select: { id: true, name: true, email: true, orgRole: true },
    });

    const usersByRole: Record<string, number> = { owner: 0, org_admin: 0, member: 0, other: 0 };
    for (const u of users) {
      if (u.orgRole in usersByRole) usersByRole[u.orgRole] += 1;
      else usersByRole.other += 1;
    }

    const projects = await db.project.findMany({
      where: { organizationId: org.id, status: { in: ["active", "on_hold"] } },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    });

    const projectReports = [];
    for (const project of projects) {
      const members = await db.projectMember.findMany({
        where: { projectId: project.id },
        select: { userId: true, role: true },
      });
      const memberIds = new Set(members.map((m) => m.userId));

      // Everyone in the org without an explicit row loses access at cutover,
      // except the org owner (implicit grant stays) and superadmins that are
      // impersonating (session-scoped support path, not reported).
      const losingAccess = users
        .filter((u) => !memberIds.has(u.id) && u.orgRole !== "owner")
        .map((u) => ({ userId: u.id, name: u.name, email: u.email, orgRole: u.orgRole }));

      projectReports.push({
        id: project.id,
        name: project.name,
        explicitMembers: members,
        losingAccess,
      });
    }

    report.push({
      org,
      usersByRole,
      usersWithoutRole: users.filter((u) => !(u.orgRole in usersByRole)).length,
      projects: projectReports,
    });
  }

  if (process.argv.includes("--json")) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    for (const entry of report) {
      console.log(`\n═══ ${entry.org.name} (${entry.org.code}) ═══`);
      console.log(`  users by orgRole: ${JSON.stringify(entry.usersByRole)}`);
      for (const p of entry.projects) {
        console.log(
          `  project "${p.name}": ${p.explicitMembers.length} explicit member(s), ` +
            `${p.losingAccess.length} lose access at cutover`
        );
        for (const u of p.losingAccess) {
          console.log(`    - [${u.orgRole}] ${u.name} <${u.email}>`);
        }
      }
    }
    const totalLosing = report.reduce(
      (acc, r) => acc + r.projects.reduce((a, p) => a + p.losingAccess.length, 0),
      0
    );
    console.log(`\nTOTAL memberships lost at cutover: ${totalLosing}`);
  }

  await db.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
