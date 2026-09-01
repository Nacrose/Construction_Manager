/**
 * tRPC router for Central State Machine & Lifecycle Graph Queries.
 */
import { z } from "zod";
import { router, protectedProcedure } from "@/server/trpc";
import {
  canTransition,
  getAllowedTransitions,
  LIFECYCLE_GRAPHS,
  type SupportedLifecycleModel,
} from "@/server/utils/state-machine";

const supportedModelSchema = z.enum([
  "siteExpense",
  "subcontractorBill",
  "purchaseOrder",
  "purchaseRequisition",
  "variationOrder",
  "leave",
  "dailyReport",
  "submittal",
  "punchItem",
  "boqVersion",
  "payrollRun",
  "dailyProgram",
  "ipc",
  "rfi",
  "ganttVersion",
]);

export const lifecycleRouter = router({
  /** Query entire transition graph or for a specific model */
  getGraph: protectedProcedure
    .input(
      z.object({
        model: supportedModelSchema.optional(),
      }).optional()
    )
    .query(({ input }) => {
      if (input?.model) {
        return {
          model: input.model,
          graph: LIFECYCLE_GRAPHS[input.model as SupportedLifecycleModel] || {},
        };
      }
      return { graph: LIFECYCLE_GRAPHS };
    }),

  /** Evaluate if a specific transition from current -> target is valid */
  canTransition: protectedProcedure
    .input(
      z.object({
        model: supportedModelSchema,
        currentState: z.string(),
        targetState: z.string(),
      })
    )
    .query(({ input }) => {
      return canTransition(
        input.model as SupportedLifecycleModel,
        input.currentState,
        input.targetState
      );
    }),

  /** Get list of allowed target states from current state */
  getAllowed: protectedProcedure
    .input(
      z.object({
        model: supportedModelSchema,
        currentState: z.string(),
      })
    )
    .query(({ input }) => {
      const allowed = getAllowedTransitions(
        input.model as SupportedLifecycleModel,
        input.currentState
      );
      return { allowed };
    }),
});
