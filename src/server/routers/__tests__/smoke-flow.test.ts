/**
 * Full-stack smoke flow (live database, real routers).
 *
 * Skipped unless TEST_DATABASE_URL is set — the CI `rls` job provides a
 * scratch Postgres. Where rls-integration.test.ts verifies the TENANT
 * ISOLATION CONTRACT through raw SQL, this file drives the ACTUAL tRPC
 * router code end-to-end (createCaller → router → withTenantTx → Prisma →
 * RLS-armed Postgres). It exists to catch the bug class unit tests cannot
 * see: wiring that silently no-ops under RLS (the store-location transfer
 * that wrote 0 rows, the pooled CPM cascade that saw 0 tasks, the @@map
 * policy that never applied).
 *
 * Flow under test (the Gantt scheduling spine):
 *   1. create task A (user-authored dates)
 *   2. create task B, add FS dependency B ← A      → B reschedules after A
 *   3. update A's start (+7d)                        → cascade RE-PERSISTS B
 *      in the database through withTenantTx + recalculateProjectSchedule(tx)
 *      — the exact path that silently no-oped on the pooled client when
 *      the session-level org GUC was lost.
 *   4. calculateAll                                   → critical path (backward
 *      pass) is reported through the router, A & B on it.
 *   5. DB-backed login rate limiter: 5 failures → blocked (LoginAttempt table).
 *   6. Holiday table is authoritative for the working-day calendar.
 *   7. Cross-org denial: the same caller cannot see org B's project tasks.
 *
 * The db module is mocked to a REAL PrismaClient with connection_limit=1 —
 * a single physical connection, so the session-level org GUC behaves like
 * the production intent (set once per request) while the withTenantTx
 * paths still pin their own transaction-scoped context.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;

vi.mock("@/lib/db", async () => {
  // Connect as the NON-SUPERUSER table owner (see ./live-db.ts): a
  // superuser connection bypasses RLS entirely, which would make every
  // tenant-isolation behavior in this suite vacuous.
  const { ownerUrl } = await import("./live-db");
  // Without TEST_DATABASE_URL the suite is skipped (describe.skipIf) —
  // build a throwaway URL so the hoisted mock never crashes module load.
  const adminUrl = process.env.TEST_DATABASE_URL;
  const url = adminUrl
    ? ownerUrl(adminUrl)
    : "postgresql://skipped:skipped@127.0.0.1:1/skipped";
  const { PrismaClient } = await import("@prisma/client");
  const sep = url.includes("?") ? "&" : "?";
  const db = new PrismaClient({
    datasources: {
      db: { url: `${url}${sep}connection_limit=1` },
    },
  });
  return { db, getFreshDb: () => db };
});

// Stub next/server `after()` — no request context exists in tests; the
// audit helper tolerates it (try/catch), but a loud stub is cleaner.
vi.mock("next/server", () => ({ after: (_fn: unknown) => undefined }));

import { db } from "@/lib/db";
import { setOrgContext } from "@/lib/rls";
import { ganttTasksRouter } from "../gantt-tasks";
import { ganttDependenciesRouter } from "../gantt-dependencies";

const ORG = "smoke-org";
const ORG_OTHER = "smoke-org-other";
const PROJECT = "smoke-project";
const USER_ID = "smoke-user";
const TASK_PREFIX = "smoke-task-";

const anyDb = db as any;

describe.skipIf(!TEST_DATABASE_URL)("Full-stack smoke flow (live database)", () => {
  beforeAll(async () => {
    // 1. Provision the non-superuser owner role and deploy the FULL
    //    migration chain AS that owner (superuser connections bypass RLS,
    //    so the suite must run owner+FORCE — the production mode).
    const { provisionOwnerAndDeploy } = await import("./live-db");
    await provisionOwnerAndDeploy(TEST_DATABASE_URL!);

    // 2. Seed fixtures with the superadmin GUC armed on the OWNER client.
    await anyDb.$executeRawUnsafe(
      "SELECT set_config('app.is_superadmin','true', false)",
    );
    await anyDb.$executeRawUnsafe(`
      INSERT INTO "Organization" ("id","name","code","updatedAt") VALUES
      ('${ORG}','Smoke Org','SMK',NOW()), ('${ORG_OTHER}','Other Org','OTH',NOW())
      ON CONFLICT (id) DO NOTHING`);
    await anyDb.$executeRawUnsafe(`
      INSERT INTO "User" ("id","email","name","passwordHash","organizationId","isSuperAdmin","updatedAt")
      VALUES ('${USER_ID}','smoke@test.local','Smoke','x','${ORG}',false,NOW())
      ON CONFLICT (id) DO NOTHING`);
    await anyDb.$executeRawUnsafe(`
      INSERT INTO "User" ("id","email","name","passwordHash","organizationId","isSuperAdmin","updatedAt")
      VALUES ('smoke-other','other@test.local','Other','x','${ORG_OTHER}',false,NOW())
      ON CONFLICT (id) DO NOTHING`);
    await anyDb.$executeRawUnsafe(`
      INSERT INTO "Project" ("id","organizationId","name","code","createdById","updatedAt")
      VALUES ('${PROJECT}','${ORG}','Smoke Project','SMK','${USER_ID}',NOW())
      ON CONFLICT (id) DO NOTHING`);
    await anyDb.$executeRawUnsafe(`
      INSERT INTO "ProjectMember" ("id","projectId","userId","role")
      VALUES ('smoke-member','${PROJECT}','${USER_ID}','project_manager')
      ON CONFLICT (id) DO NOTHING`);

    // Clean any previous run's tasks (cascade removes dependencies).
    await anyDb.$executeRawUnsafe(
      `DELETE FROM "GanttTask" WHERE "projectId" = '${PROJECT}' OR "id" LIKE '${TASK_PREFIX}%'`,
    );
    await anyDb.$executeRawUnsafe(
      `DELETE FROM "LoginAttempt" WHERE "email" = 'brute@test.local'`,
    );

    // 3. Drop superuser context; act as the org-A member for the flow.
    await setOrgContext(db, ORG, false);
  }, 240_000);

  afterAll(async () => {
    if (db) {
      try {
        await anyDb.$executeRawUnsafe(
          "SELECT set_config('app.is_superadmin','true', false)",
        );
        await anyDb.$executeRawUnsafe(
          `DELETE FROM "GanttTask" WHERE "projectId" = '${PROJECT}' OR "id" LIKE '${TASK_PREFIX}%'`,
        );
        for (const t of ["LoginAttempt", "ProjectMember", "Project", "User", "Organization"]) {
          await anyDb.$executeRawUnsafe(
            `DELETE FROM "${t}" WHERE "id" LIKE 'smoke-%'`,
          );
        }
        await anyDb.$executeRawUnsafe(
          `DELETE FROM "Holiday" WHERE "id" LIKE 'smoke-holiday%'`,
        );
      } finally {
        await db.$disconnect();
      }
    }
  });

  const ctx = {
    user: {
      id: USER_ID,
      email: "smoke@test.local",
      name: "Smoke",
      role: "project_manager",
      organizationId: ORG,
      isSuperAdmin: false,
    },
  };

  function tasksCaller() {
    return ganttTasksRouter.createCaller(ctx as any);
  }
  function depsCaller() {
    return ganttDependenciesRouter.createCaller(ctx as any);
  }

  it("cascade persists through the full stack: A slides → B follows (the silent-noop regression)", async () => {
    const caller = tasksCaller();

    // Task A: Mon 2026-11-02, 3d, no deps (user-authored dates are kept).
    const { task: taskA } = await caller.create({
      projectId: PROJECT,
      name: "Excavation",
      startDate: "2026-11-02",
      endDate: "2026-11-05",
      duration: 3,
      progress: 0,
      plannedValue: 0,
      laborCount: 0,
      isMilestone: false,
    });
    expect(taskA.id).toBeTruthy();

    // Task B: any dates — the FS dependency will re-derive them.
    const { task: taskB } = await caller.create({
      projectId: PROJECT,
      name: "Foundation",
      startDate: "2026-11-06",
      endDate: "2026-11-09",
      duration: 3,
      progress: 0,
      plannedValue: 0,
      laborCount: 0,
      isMilestone: false,
    });

    // FS dependency B ← A. addDependency runs its own CPM cascade through
    // recalculateProjectScheduleForUser (context-pinned transaction).
    const depCaller = depsCaller();
    await depCaller.addDependency({
      taskId: taskB.id,
      predecessorId: taskA.id,
      type: "FS",
      offset: 0,
    });

    // Verify B was rescheduled to A.end in the DATABASE. NOTE: the API's
    // isoEndDate convention stores authored ends as 23:59:59, so A.end
    // (input "2026-11-05") is 2026-11-05T23:59:59Z and B starts exactly
    // there (calendar-aware cascade keeps the time component).
    let b = await anyDb.ganttTask.findUnique({ where: { id: taskB.id } });
    expect(new Date(b.startDate).toISOString()).toBe(
      new Date("2026-11-05T23:59:59.000Z").toISOString(),
    );

    // THE regression: slide A a full week. gantt.update must cascade inside
    // its withTenantTx and PERSIST B's new dates.
    await caller.update({
      taskId: taskA.id,
      startDate: "2026-11-09",
      endDate: "2026-11-12",
    });

    // A: start 2026-11-09T00:00:00Z, end 2026-11-12T23:59:59Z (input
    // "2026-11-12"). Nov 12 2026 is BHAI TIKA (Tihar Day 5) — a non-working
    // day — so the calendar-aware cascade snaps B's start to the next
    // working day: Nov 13 (Fri). B.end = +3 working days (skip Sat Nov 14,
    // Sun 15, Mon 16, Tue 17) = Nov 17 23:59:59. This is the Nepal
    // calendar doing its job, not an off-by-one.
    b = await anyDb.ganttTask.findUnique({ where: { id: taskB.id } });
    expect(new Date(b.startDate).toISOString()).toBe(
      new Date("2026-11-13T23:59:59.000Z").toISOString(),
    );
    expect(new Date(b.endDate).toISOString()).toBe(
      new Date("2026-11-17T23:59:59.000Z").toISOString(),
    );
  }, 60_000);

  it("calculateAll reports the critical path (backward pass wired end-to-end)", async () => {
    const caller = tasksCaller();
    const result = await caller.calculateAll({ projectId: PROJECT });

    // The two-task FS chain A → B is the whole network → both critical.
    expect(result.criticalPath).toBeDefined();
    const names = result.criticalPath.map((t: { name: string }) => t.name);
    expect(names).toContain("Excavation");
    expect(names).toContain("Foundation");
  });

  it("DB-backed login limiter blocks after 5 failures (durable across instances)", async () => {
    const { checkLoginRate, recordLoginAttempt } = await import(
      "@/lib/login-rate-limit"
    );
    // Separate Prisma context is unnecessary — the limiter shares the same
    // (single-connection) client, which is the production wiring.
    const email = "brute@test.local";
    const ip = "203.0.113.7";

    for (let i = 0; i < 5; i++) {
      await recordLoginAttempt(email, ip, false);
    }
    const verdict = await checkLoginRate(email, ip);
    expect(verdict.allowed).toBe(false);
    expect(verdict.retryAfterSec).toBeGreaterThan(0);

    // A different email from the same IP is still allowed (per-email wall).
    const other = await checkLoginRate("fresh@test.local", ip);
    expect(other.allowed).toBe(true);

    // A successful login clears that email's failure pressure.
    await recordLoginAttempt(email, ip, true);
    const after = await checkLoginRate(email, ip);
    expect(after.allowed).toBe(true);
  });

  it("Holiday table rows override the working-day calendar (DB authority)", async () => {
    const { isWorkingDay, refreshHolidayCache, __setHolidayCacheForTests } =
      await import("@/server/utils/nepal-calendar");
    // 2026-11-16 (Mon) — a normal working day in the compiled constant.
    expect(isWorkingDay(new Date("2026-11-16T00:00:00Z"))).toBe(true);

    // Admin declares it a holiday (direct insert = the admin router path).
    await anyDb.holiday.create({
      data: { id: "smoke-holiday-1", date: "2026-11-16", name: "Smoke Closure", type: "public" },
    });
    try {
      await refreshHolidayCache(0);
      expect(isWorkingDay(new Date("2026-11-16T00:00:00Z"))).toBe(false);
    } finally {
      // Restore the in-process cache for other tests.
      await anyDb.holiday.delete({ where: { id: "smoke-holiday-1" } }).catch(() => {});
      __setHolidayCacheForTests(null);
      await refreshHolidayCache(0);
    }
    expect(isWorkingDay(new Date("2026-11-16T00:00:00Z"))).toBe(true);
  });

  it("cross-org access is denied at BOTH layers (app guard + RLS)", async () => {
    // Seed a task in org B's project (superuser context, then restore).
    await anyDb.$executeRawUnsafe(
      "SELECT set_config('app.is_superadmin','true', false)",
    );
    await anyDb.$executeRawUnsafe(`
      INSERT INTO "Project" ("id","organizationId","name","code","createdById","updatedAt")
      VALUES ('smoke-project-b','${ORG_OTHER}','Other','OTH','smoke-other',NOW())
      ON CONFLICT (id) DO NOTHING`);
    await anyDb.$executeRawUnsafe(`
      INSERT INTO "GanttTask" ("id","projectId","name","startDate","endDate","duration","progress","sortOrder","updatedAt")
      VALUES ('smoke-task-other','smoke-project-b','Their Task','2026-11-02','2026-11-05',3,0,1,NOW())
      ON CONFLICT (id) DO NOTHING`);
    await setOrgContext(db, ORG, false);

    // Layer 1 (app): the router's membership guard rejects before any
    // tenant data is touched — even though the project id is known.
    const caller = tasksCaller();
    await expect(
      caller.list({ projectId: "smoke-project-b" })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    // Layer 2 (DB): even with a direct query under org-A context, RLS
    // hides org B's task (the guard cannot save us from a raw-query bug).
    const rows = await anyDb.$queryRawUnsafe(
      `SELECT count(*)::int AS n FROM "GanttTask" WHERE "projectId" = 'smoke-project-b'`,
    );
    expect(rows[0].n).toBe(0);

    // And org A's own project still returns its tasks through the router.
    const mine = await caller.list({ projectId: PROJECT });
    expect(mine.tasks.length).toBeGreaterThanOrEqual(2);
  });
});
