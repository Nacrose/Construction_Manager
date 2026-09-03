/**
 * tRPC router for Leave Management.
 *
 * ADR-0005 grain: leave REQUESTS carry the requesting project as context,
 * but the person is the org-wide workforce identity and balances are
 * org-grain per person per leave type per year.
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createDomainRouter, protectedProcedure, capabilityGuard } from "@/server/trpc";
import { db } from "@/lib/db";
import { assertProjectMember, assertProjectAdmin } from "@/lib/authz";
import { withOrgContext } from "@/lib/rls";
import { engineContextFromTrpc } from "@/server/engine/context";
import { executeAction } from "@/server/engine/execute";

const { router, proc } = createDomainRouter();

export const leaveRouter = router({
  /** List leave requests for a project, with optional status filter. */
  list: proc.member
    .input(z.object({
      projectId: z.string(),
      status: z.enum(["pending", "approved", "rejected"]).optional(),
    }))
    .query(async ({ input }) => {
      const where: Record<string, unknown> = { projectId: input.projectId };
      if (input.status) where.status = input.status;

      const leaves = await db.leaveRequest.findMany({
        where,
        orderBy: { createdAt: "desc" },
        include: {
          person: { select: { displayName: true, category: true } },
          approvedBy: { select: { name: true } },
          createdBy: { select: { name: true } },
        },
         take: 1000, // bounded (pagination sweep) — see src/lib/pagination.ts
       });
      return { leaves };
    }),

  /** Get single leave request. */
  get: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const leave = await db.leaveRequest.findUnique({
        where: { id: input.id },
        select: { projectId: true, personId: true, leaveType: true, startDate: true, endDate: true, totalDays: true, reason: true, status: true, approvedById: true, createdById: true },
      });
      if (!leave) throw new TRPCError({ code: "NOT_FOUND", message: "Leave request not found." });
      // IDOR guard: verify the caller is a member of the project the
      // leave belongs to. Previously this procedure returned leave data
      // to ANY authenticated user — leaking HR-sensitive PII (person
      // name, leave type, dates, reason) across tenants.
      await assertProjectMember(ctx.user, leave.projectId);

      // Re-fetch with includes for the response shape (now that we've
      // verified the caller is authorized).
      const leaveWithIncludes = await db.leaveRequest.findUnique({
        where: { id: input.id },
        include: {
          person: { select: { displayName: true, category: true } },
          approvedBy: { select: { name: true } },
          createdBy: { select: { name: true } },
        },
      });
      return { leave: leaveWithIncludes };
    }),

  /** Create leave request. Auto-calculate totalDays from date difference. */
  create: proc.write
    .input(z.object({
      projectId: z.string(),
      personId: z.string(), // workforce identity (ADR-0005)
      leaveType: z.string().default("casual"),
      startDate: z.string(),
      endDate: z.string(),
      reason: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      // Cross-project guard: the leave must be filed for a person with an
      // ACTIVE assignment on THIS project — without this, a caller with
      // write access to project A could file leaves for people in project
      // B (leaking their names/dates via the project leave list).
      const assignment = await db.projectStaffAssignment.findFirst({
        where: { personId: input.personId, projectId: input.projectId, status: "active" },
        select: { id: true },
      });
      if (!assignment) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Person has no active assignment on this project." });
      }

      const start = new Date(input.startDate);
      const end = new Date(input.endDate);
      const diffMs = end.getTime() - start.getTime();
      const totalDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24)) + 1; // inclusive of both start and end

      if (totalDays <= 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "End date must be on or after start date." });
      }

      const leave = await db.leaveRequest.create({
        data: {
          projectId: input.projectId,
          personId: input.personId,
          leaveType: input.leaveType,
          startDate: start,
          endDate: end,
          totalDays,
          reason: input.reason,
          createdById: ctx.user.id,
        },
      });
      return { leave };
    }),

  /** PM approves leave request. */
  approve: protectedProcedure
    .use(capabilityGuard({ workforcePlanning: true })) // policy snapshot for the engine context (ADR-0006 §4)
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const leave = await db.leaveRequest.findUnique({
        where: { id: input.id },
        select: { projectId: true, status: true, personId: true, totalDays: true, leaveType: true, createdById: true, project: { select: { organizationId: true } } },
      });
      if (!leave) throw new TRPCError({ code: "NOT_FOUND", message: "Leave request not found." });

      // Segregation of duties: Creator cannot approve their own leave request
      if (leave.createdById && leave.createdById === ctx.user.id && !ctx.user.isSuperAdmin) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Segregation of duties violation: you cannot approve a leave request you created.",
        });
      }

      await assertProjectAdmin(ctx.user, leave.projectId);

      const currentYear = new Date().getFullYear();
      // Balances are org-grain (ADR-0005) — the owning org comes from the
      // requesting project.
      const orgId = leave.project.organizationId;
      if (!orgId) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Project has no organization; leave balances require an org scope." });
      }

      // STATUS UPDATE (typed action, ADR-0006 §3) + LEAVE BALANCE UPSERT —
      // ONE TRANSACTION. The action resolves leave.approve → pending →
      // approved and claims the row via compare-and-swap, so a concurrent
      // approval fails with CONFLICT instead of double-counting the balance.
      const updated = await db.$transaction(async (tx) => {
        await withOrgContext(tx, ctx.user.organizationId, !!ctx.user.isSuperAdmin);

        const engineCtx = await engineContextFromTrpc(ctx, tx, { projectId: leave.projectId });
        const result = await executeAction(engineCtx, "leave.approve", {
          id: input.id,
          skipEventEmit: true, // leave has no event consumers today
        });

        // Update LeaveBalance: increment taken, decrement remaining
        await tx.leaveBalance.upsert({
          where: {
            organizationId_personId_leaveType_year: {
              organizationId: orgId,
              personId: leave.personId,
              leaveType: leave.leaveType,
              year: currentYear,
            },
          },
          update: {
            taken: { increment: leave.totalDays },
            remaining: { decrement: leave.totalDays },
          },
          create: {
            organizationId: orgId,
            personId: leave.personId,
            leaveType: leave.leaveType,
            year: currentYear,
            totalAllowed: 0,
            taken: leave.totalDays,
            remaining: -leave.totalDays,
          },
        });

        return result.entity;
      });

      return { leave: updated };
    }),

  /** PM/coordinator rejects leave request. */
  reject: protectedProcedure
    .use(capabilityGuard({ workforcePlanning: true })) // policy snapshot for the engine context (ADR-0006 §4)
    .input(z.object({ id: z.string(), rejectionReason: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const leave = await db.leaveRequest.findUnique({
        where: { id: input.id },
        select: { projectId: true, status: true },
      });
      if (!leave) throw new TRPCError({ code: "NOT_FOUND", message: "Leave request not found." });
      await assertProjectAdmin(ctx.user, leave.projectId);

      // Typed engine action: resolves leave.reject → pending → rejected,
      // CAS-claims the row, and attributes rejectionReason from `notes`. A
      // concurrent approve/reject surfaces as CONFLICT instead of a silent
      // overwrite.
      const engineCtx = await engineContextFromTrpc(ctx, db, { projectId: leave.projectId });
      const result = await executeAction(engineCtx, "leave.reject", {
        id: input.id,
        notes: input.rejectionReason,
        skipEventEmit: true, // leave has no event consumers today
      });
      return { leave: result.entity };
    }),

  /** Get leave balances for a person (org-grain, by year).
   * projectId authorizes (project HR screen) but does NOT scope the
   * balance — balances are org-grain per person (ADR-0005). */
  getBalances: proc.member
    .input(z.object({
      projectId: z.string(),
      personId: z.string(),
      year: z.number().optional(),
    }))
    .query(async ({ input }) => {
      const year = input.year || new Date().getFullYear();

      const balances = await db.leaveBalance.findMany({
        where: {
          personId: input.personId,
          year,
        },
        orderBy: { leaveType: "asc" },
         take: 1000, // bounded (pagination sweep) — see src/lib/pagination.ts
       });
      return { balances };
    }),

  /** Org admin sets annual leave allowances (creates/updates LeaveBalance records).
   * projectId authorizes (project HR screen) but does NOT scope the row —
   * balances are org-grain per person (ADR-0005). */
  updateBalances: proc.admin
    .input(z.object({
      projectId: z.string(),
      personId: z.string(),
      leaveType: z.string(),
      year: z.number(),
      totalAllowed: z.number().min(0),
    }))
    .mutation(async ({ ctx, input }) => {
      if (!ctx.user.organizationId) {
        throw new TRPCError({ code: "FORBIDDEN", message: "You don't belong to an organization." });
      }
      const organizationId = ctx.user.organizationId;

      const existing = await db.leaveBalance.findUnique({
        where: {
          organizationId_personId_leaveType_year: {
            organizationId,
            personId: input.personId,
            leaveType: input.leaveType,
            year: input.year,
          },
        },
      });

      const taken = existing?.taken ?? 0;
      const balance = await db.leaveBalance.upsert({
        where: {
          organizationId_personId_leaveType_year: {
            organizationId,
            personId: input.personId,
            leaveType: input.leaveType,
            year: input.year,
          },
        },
        update: {
          totalAllowed: input.totalAllowed,
          remaining: input.totalAllowed - taken,
        },
        create: {
          organizationId,
          personId: input.personId,
          leaveType: input.leaveType,
          year: input.year,
          totalAllowed: input.totalAllowed,
          taken: 0,
          remaining: input.totalAllowed,
        },
      });
      return { balance };
    }),
});
