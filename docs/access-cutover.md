# Phase B Access Cutover — Implicit Project Access Removal

- **ADR:** 0005 (Workforce Identity and Access Separation), §3 and Consequences
- **Phase:** B — Access & Roles
- **Status:** Implemented; cutover procedure below is mandatory at deploy time

## What changed

Before Phase B, `getProjectRole` in `src/lib/authz.ts` resolved project access
in three tiers:

1. An explicit `ProjectMember` row won and returned its role.
2. Otherwise, any user whose organization owned the project received access:
   `org_admin`/`owner` were treated as `project_manager`, everyone else as
   `engineer`.
3. Superadmin impersonation received `project_manager`.

Phase B removes tier 2 for everyone **except the organization owner**:

| Caller (no explicit membership) | Before | After |
|---|---|---|
| org `owner` | project_manager | project_manager (unchanged — the one implicit grant, ADR-0005 §3) |
| org `org_admin` | project_manager | **no access** — grant explicit `ProjectMember` if needed |
| org `member` | engineer | **no access** — grant explicit `ProjectMember` if needed |
| superadmin impersonating | project_manager | project_manager (unchanged, session-scoped support path) |

Additional vocabulary changes in the same phase:

- `ProjectRole` is now the closed triad
  `project_manager | engineer | coordinator`. The `client` and `inspector`
  values are removed from every type, router check, and UI expression —
  external parties never receive accounts or roles (ADR-0005 §3).
- `assertCanWrite` no longer rejects read-only roles (none exist); it remains
  as a named alias so write paths keep declaring intent.
- Stale `org_owner` comparisons in the resolver are gone (`owner` is the only
  valid vocabulary; `org_admin`/`member` are the others).

## Why the pre-cutover report exists

Users who silently relied on tier 2 lose access the moment this ships. That
must be a *decision*, not a surprise: the report enumerates every (org,
project, user) triple that changes behavior so memberships can be granted
explicitly before deploy.

## Cutover procedure

1. **Run the report against production** before deploying:

   ```bash
   npx tsx scripts/access-cutover-report.ts          # human-readable
   npx tsx scripts/access-cutover-report.ts --json > pre-cutover.json
   ```

2. **Review every "loses access" entry.** For each user that must keep
   working on a project, add an explicit membership with the real role:

   ```ts
   await db.projectMember.create({
     data: { projectId, userId, role: "engineer" }, // or project_manager / coordinator
   });
   ```

   (Or use the project members UI as an org owner.)

3. **Deploy Phase B.** From this point, `org_admin` and `member` users see
   exactly the projects where an explicit `ProjectMember` row exists.

4. **Post-deploy spot check:** the report's "explicit member(s)" counts per
   project should now cover everyone who still has access.

## Verification performed in-repo (test database)

- `src/lib/authz.test.ts` re-written against the new resolver: explicit row
  wins; owner implicit inside org only; org_admin/member implicit grants
  removed; impersonation scoped to tenant; triad-only vocabulary.
- Full unit suite, `tsc --noEmit`, eslint, and `next build` green (see the
  Phase B commit message for counts).
