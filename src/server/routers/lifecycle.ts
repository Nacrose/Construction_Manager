/**
 * Lifecycle tRPC Router — the read API over the central lifecycle graph.
 *
 * This is how the UI and routers consume the graph without importing
 * server internals:
 *   - `lifecycle.graph`        → full graph (cache it client-side; small + static)
 *   - `lifecycle.byStatus`     → pure: available transitions for a (model, status, role)
 *   - `lifecycle.transitions`  → entity-aware: fetches the row, asserts membership,
 *                                 returns role-filtered transitions for the current state
 *
 * Phase B+ uses this to render transition buttons from the graph instead of
 * hand-building approve/reject UI per screen.
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { db } from "@/lib/db";
import { protectedProcedure, router } from "@/server/trpc";
import { assertProjectMember, type ProjectRole } from "@/lib/authz";
import {
  LIFECYCLE_GRAPHS,
  availableTransitions,
  canTransition,
  isTerminalState,
  lifecycleStates,
  type GraphRole,
  type LifecycleModel,
} from "@/server/utils/lifecycle-graph";

const lifecycleModelSchema = z.enum([
  "leaveRequest",
  "siteExpense",
  "subcontractorBill",
  "purchaseOrder",
  "purchaseRequisition",
  "variationOrder",
  "dailyReport",
] as const satisfies [LifecycleModel, ...LifecycleModel[]]);

const roleSchema = z.enum([
  "project_manager",
  "engineer",
  "coordinator",
  "client",
  "inspector",
] as const satisfies [GraphRole, ...GraphRole[]]);

export const lifecycleRouter = router({
  /** Full static graph — small, immutable, safe to cache with staleTime: Infinity. */
  graph: protectedProcedure.query(() => LIFECYCLE_GRAPHS),

  /** Pure state query — no db access. Useful for optimistic UI and tests. */
  byStatus: protectedProcedure
    .input(
      z.object({
        model: lifecycleModelSchema,
        status: z.string(),
        role: roleSchema,
      })
    )
    .query(({ input }) => ({
      states: lifecycleStates(input.model),
      terminal: isTerminalState(input.model, input.status),
      transitions: availableTransitions(input.model, input.status, input.role),
    })),

  /**
   * Entity-aware query: current status + role-filtered available transitions.
   * The canonical endpoint for rendering action buttons on a detail row.
   */
  transitions: protectedProcedure
    .input(z.object({ model: lifecycleModelSchema, id: z.string() }))
    .query(async ({ ctx, input }) => {
      const graph = LIFECYCLE_GRAPHS[input.model];
      const delegate = (db as any)[graph.prismaModel];
      if (!delegate || typeof delegate.findUnique !== "function") {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Lifecycle graph misconfiguration: model '${graph.prismaModel}' has no Prisma delegate.`,
        });
      }

      const entity = await delegate.findUnique({
        where: { id: input.id },
        select: { id: true, status: true, projectId: true },
      });
      if (!entity) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Record not found." });
      }

      const role = (await assertProjectMember(ctx.user, entity.projectId)) as ProjectRole;

      return {
        id: entity.id,
        model: input.model,
        currentStatus: String(entity.status ?? graph.initialState),
        terminal: isTerminalState(input.model, String(entity.status ?? graph.initialState)),
        transitions: availableTransitions(input.model, String(entity.status ?? graph.initialState), role as GraphRole),
      };
    }),

  /** Pure check used by routers/clients to validate a hypothetical transition. */
  canTransition: protectedProcedure
    .input(
      z.object({
        model: lifecycleModelSchema,
        from: z.string(),
        to: z.string(),
        role: roleSchema,
      })
    )
    .query(({ input }) => canTransition(input.model, input.from, input.to, input.role)),
});
