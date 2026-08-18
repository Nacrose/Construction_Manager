/**
 * Material Catalog unrecognized materials management and promotion.
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "@/server/trpc";
import { db } from "@/lib/db";

function normalize(s: string) {
  return s.toLowerCase().trim().replace(/\s+/g, " ");
}

export const materialCatalogUnrecognizedRouter = router({
  unrecognizedList: protectedProcedure
    .input(
      z.object({
        organizationId: z.string().optional(),
        limit: z.number().min(1).max(500).default(100),
      })
    )
    .query(async ({ ctx, input }) => {
      const orgId = input.organizationId ?? ctx.user.organizationId;
      if (!orgId) return { items: [] };
      const items = await db.unrecognizedMaterial.findMany({
        where: { organizationId: orgId },
        orderBy: [{ count: "desc" }, { lastUsedAt: "desc" }],
        take: input.limit,
      });
      return { items };
    }),

  unrecognizedPromote: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        category: z.string().optional(),
        defaultUnit: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const entry = await db.unrecognizedMaterial.findUnique({
        where: { id: input.id },
      });
      if (!entry) throw new TRPCError({ code: "NOT_FOUND" });

      const existing = await db.materialCatalog.findFirst({
        where: {
          organizationId: entry.organizationId,
          normalizedName: entry.normalizedName,
        },
      });
      if (existing) {
        await db.unrecognizedMaterial.delete({ where: { id: input.id } });
        return { item: existing, promoted: false };
      }

      const item = await db.materialCatalog.create({
        data: {
          organizationId: entry.organizationId,
          name: entry.name,
          normalizedName: entry.normalizedName,
          category: input.category ?? entry.category ?? null,
          defaultUnit: input.defaultUnit ?? entry.unit ?? null,
        },
      });
      await db.unrecognizedMaterial.delete({ where: { id: input.id } });
      return { item, promoted: true };
    }),

  unrecognizedDelete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input }) => {
      await db.unrecognizedMaterial.delete({ where: { id: input.id } });
      return { ok: true };
    }),

  unrecognizedCount: protectedProcedure
    .input(z.object({ organizationId: z.string().optional() }))
    .query(async ({ ctx, input }) => {
      const orgId = input.organizationId ?? ctx.user.organizationId;
      if (!orgId) return { count: 0 };
      const count = await db.unrecognizedMaterial.count({
        where: { organizationId: orgId },
      });
      return { count };
    }),

  reportUnrecognized: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1),
        unit: z.string().optional(),
        category: z.string().optional(),
        projectId: z.string().optional(),
        organizationId: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const orgId = input.organizationId ?? ctx.user.organizationId;
      if (!orgId) return { ok: true };
      const normalizedName = normalize(input.name);

      const inCatalog = await db.materialCatalog.findFirst({
        where: { organizationId: orgId, normalizedName },
      });
      if (inCatalog) return { ok: true, known: true };

      const existing = await db.unrecognizedMaterial.findFirst({
        where: { organizationId: orgId, normalizedName },
      });

      if (existing) {
        await db.unrecognizedMaterial.update({
          where: { id: existing.id },
          data: {
            count: existing.count + 1,
            unit: input.unit ?? existing.unit,
            lastUsedAt: new Date(),
          },
        });
      } else {
        await db.unrecognizedMaterial.create({
          data: {
            organizationId: orgId,
            name: input.name,
            normalizedName,
            unit: input.unit ?? null,
            category: input.category ?? null,
            count: 1,
            firstProjectId: input.projectId ?? null,
          },
        });
      }
      return { ok: true, known: false };
    }),
});
