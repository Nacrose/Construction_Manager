import { z } from "zod";
import { router, protectedProcedure } from "@/server/trpc";
import { db } from "@/lib/db";

export const userPreferencesRouter = router({
  get: protectedProcedure.query(async ({ ctx }) => {
    const user = await db.user.findUnique({
      where: { id: ctx.user.id },
      select: { preferences: true },
    });
    return (user?.preferences as Record<string, unknown>) ?? {};
  }),

  update: protectedProcedure
    .input(z.object({
      preferences: z.any(),
    }))
    .mutation(async ({ ctx, input }) => {
      await db.user.update({
        where: { id: ctx.user.id },
        data: { preferences: input.preferences },
      });
      return { ok: true };
    }),
});
