# RLS Phases 3a/3b/3c + Phase 4 — Verification Report

**Verdict: PASS** (30/30 checks) · PostgreSQL: PostgreSQL 16.2 on x86_64-pc-linux-gnu, compiled by gcc (GCC) 10.2.1 20210130 (R

This lab applies the **real** `prisma/migrations` chain (0_init → 20260830070000) to a
scratch embedded PostgreSQL 16 — every assertion below ran against the actual schema.


## A migration chain applies end-to-end

- [PASS] A.1: 0_init → phase-4 chain applied cleanly (SQL valid against the real schema)

## B every covered table is ENABLED + FORCEd + has policies

- [PASS] B.1: 78/78 covered tables (model names, @@map-resolved) have RLS+FORCE+policies
- [PASS] B.2: Project: rls=True forced=True policies=4 (phase 4)

## C tenant matrix (app_user)

- [PASS] C.app_user.same-org: same-org counts Payment/Material/Staff/Rfi/Project = [1, 1, 1, 1, 1]
- [PASS] C.app_user.cross-org: cross-org counts = [0, 0, 0, 0, 0] (all zero)
- [PASS] C.app_user.insert-deny: cross-org INSERT denied: new row violates row-level security policy for table "Payment"
- [PASS] C.app_user.update-delete: cross-org UPDATE=0 DELETE=0
- [PASS] C.app_user.fail-closed: no-context counts = [0, 0, 0, 0, 0]
- [PASS] C.app_user.superadmin: superadmin sees both orgs: [2, 2, 2, 2, 2]

## C tenant matrix (owner_role)

- [PASS] C.owner_role.same-org: same-org counts Payment/Material/Staff/Rfi/Project = [1, 1, 1, 1, 1]
- [PASS] C.owner_role.cross-org: cross-org counts = [0, 0, 0, 0, 0] (all zero)
- [PASS] C.owner_role.insert-deny: cross-org INSERT denied: new row violates row-level security policy for table "Payment"
- [PASS] C.owner_role.update-delete: cross-org UPDATE=0 DELETE=0
- [PASS] C.owner_role.fail-closed: no-context counts = [0, 0, 0, 0, 0]
- [PASS] C.owner_role.superadmin: superadmin sees both orgs: [2, 2, 2, 2, 2]

## D composite tables (Notification/AuditLog/ChatChannel)

- [PASS] D.1: org A sees own notifications (project + org-level): 2/2
- [PASS] D.2: org B recipient notifications invisible: 0
- [PASS] D.3: org A sees own audit rows (project + user-level): 2/2
- [PASS] D.4: org B project audit rows invisible: 0
- [PASS] D.5: org A sees its 3 channels (project/org_order/personal-via-member): 3/3
- [PASS] D.6: org B channels invisible: 0
- [PASS] D.7: AuditLog UPDATE=0/DELETE=0 rows affected (append-only, org context)
- [PASS] D.8: superadmin UPDATE=0/DELETE=0 rows (tamper-evident trail)
- [PASS] D.9: AuditLog INSERT works without org context (after()-hook safe)
- [PASS] D.10: org B personal channel visible via member branch: 1/1
- [PASS] D.11: own-creator org_order insert ok (True); foreign-project channel insert denied (True)

## E/F phase-4 backfill semantics + loud guard

- [PASS] E.1: guard fails loudly on unresolvable NULL-org project: RLS phase-4: 1 projects still have organizationId NULL after the creator backfill (creator missing or org-less). Assign 
- [PASS] E.2: creator backfill assigned P-Y → y-org
- [PASS] E.3: manual fix preserved: P-X → x-org
- [PASS] E.4: NULL-org project retired: org user sees 0, superadmin sees 1

## Summary

- **A** — the complete migration chain (initial schema + 8 RLS migrations) applies cleanly on PG16.
- **B** — all 78 tracker-covered tables end with RLS ENABLED + FORCE + >= 1 policy; Project itself is FORCEd with 4 per-command policies (phase 4).
- **C** — tenant matrix verified in BOTH connection modes (table owner with FORCE — the Prisma production case — and a granted non-owner role): same-org reads work, cross-org reads return 0 rows, cross-org INSERT is denied (42501), cross-org UPDATE/DELETE affect 0 rows, missing context fails CLOSED, superadmin bypasses.
- **D** — composites: Notification (recipient-org branch, NULL-project rows stay visible to the owning org), AuditLog (user-org branch for NULL-project rows; INSERT permissive so after()-hook writes never drop; UPDATE/DELETE denied for everyone incl. superadmin — tamper-evident), ChatChannel (project-EXISTS + creator-org for org_order + member-org for personal/group).
- **E/F** — phase 4: creator-based backfill assigns NULL-org projects; unresolvable rows fail the migration LOUDLY with a count; after phase 4 a NULL-org project is invisible to org users and superadmin-only; §3.2 subqueries over the FORCEd Project stay correct.

Reproduce: `python scripts/rls-phase3abc-lab.py` (needs `pip install pgserver "psycopg[binary]"`).
