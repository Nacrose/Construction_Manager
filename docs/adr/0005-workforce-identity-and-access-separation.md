# ADR 0005 — Workforce Identity and Access Separation

- **Status:** Accepted
- **Date:** 2026-09
- **Deciders:** Core engineering

## Context

The `Staff` model is project-scoped: one human on three projects is three
rows with three salaries, three attendance series, and three advance ledgers.
App access and employment are conflated (`User.role` stores a project role;
org membership implies project access; staff assignment implies neither
formally but everything informally). Payroll cannot pay a shared worker
correctly. Vocabulary is also ambiguous: "owner" appears both as the org's
root user and as an external project party.

## Decision

1. **Three independent facts, four models:**

   | Concept | Model | Meaning |
   |---|---|---|
   | Works for the contractor | `Person` | org-wide human identity |
   | Can authenticate | `User` | app account, org-scoped |
   | May access a project | `ProjectMember` | explicit grant, per project |
   | Works on a project | `ProjectStaffAssignment` | dated engagement with pay terms |

   None of these automatically creates another. `Person.linkedUserId` is
   optional and unique when present; linking grants no permission; a staff
   assignment grants no app access; inviting a user never creates a workforce
   record; adding workforce never creates an account.

2. **Assignments carry history.** Transfers, rehires, and concurrent
   assignments are *new rows* (`sourceAssignmentId` chains them). There is no
   `[projectId, personId]` unique constraint — overlap is validated by the
   workforce service (warning → audited override), not blocked by the schema.
   Ending an assignment never destroys attendance, advances, payroll, or leave
   history.

3. **Terminology is locked.** "Owner" means **organization owner**
   (`OrgRole.owner`) — the contractor's root app user with org-wide project
   access. External parties (clients, consultants, inspectors, the
   building-owner side of a contract) **never receive accounts or role
   types**; they exist only as contract-party references on documents
   (`JournalEntryLine.partnerId`, IPC client fields, correspondence).
   The `client`/`inspector` values are removed from every role vocabulary
   (Phase B).

4. **Owner-operated simplicity.** An owner operating alone must never file
   paperwork to themselves: under `owner_led` the approval-shaped actions do
   not exist in the capability map (ADR-0004). Direct purchase and direct
   expense are first-class workflows that are still recorded, audited, costed
   to projects, and financially posted through the same primitives as
   controlled paths — simplified *workflow*, never bypassed *ledger*.

## Consequences

- `Staff` is deleted; consumers re-point to `Person` + `ProjectStaffAssignment`.
- `User.role` (a project role stored on a user-level row) is deprecated and
  removed in Phase B; `ProjectMember.role` becomes the only project-role
  source. `authz.ts` loses the implicit org-member → engineer grant in the
  same phase, with a pre-cutover access report.
- Attendance is logged per assignment (`[assignmentId, date]`); a person with
  two active assignments has two rows per day and the workforce service owns
  the cross-project daily-capacity check.
