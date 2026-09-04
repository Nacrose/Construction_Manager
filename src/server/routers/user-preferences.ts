import { z } from "zod";
import { router, protectedProcedure } from "@/server/trpc";
import { db } from "@/lib/db";

function isObject(item: any): item is Record<string, any> {
  return item && typeof item === "object" && !Array.isArray(item);
}

function deepMerge(target: Record<string, any>, source: Record<string, any>): Record<string, any> {
  const output = { ...target };
  for (const key of Object.keys(source)) {
    if (isObject(source[key])) {
      if (!(key in target) || !isObject(target[key])) {
        output[key] = source[key];
      } else {
        output[key] = deepMerge(target[key], source[key]);
      }
    } else {
      output[key] = source[key];
    }
  }
  return output;
}

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
      const user = await db.user.findUnique({
        where: { id: ctx.user.id },
        select: { preferences: true },
      });
      const current = (user?.preferences as Record<string, unknown>) ?? {};
      const merged = deepMerge(current, input.preferences ?? {});
      await db.user.update({
        where: { id: ctx.user.id },
        data: { preferences: merged },
      });
      return { ok: true, preferences: merged };
    }),
});
