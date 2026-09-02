/**
 * tRPC router for rate profiles and their items.
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "@/server/trpc";
import { db } from "@/lib/db";
import { assertProjectMember, assertCanWrite } from "@/lib/authz";

const CATEGORIES = ["district_rate", "supplier_quotation", "contractor_negotiated"] as const;

/**
 * OWNERSHIP GUARD (audit C-1): RateProfile/RateProfileItem/BoqIngredient
 * are child tables with NO organizationId/projectId column and NO RLS
 * coverage — `assertCanWrite` alone authorizes the caller on their OWN
 * project, then the mutation would touch rows by raw cuid. Every item
 * write must therefore resolve the parent profile scoped to
 * `input.projectId` first (the router already did exactly this in
 * batchApply — this helper extends the same pin to every path).
 */
async function assertProfileInProject(profileId: string, projectId: string) {
  const profile = await db.rateProfile.findFirst({
    where: { id: profileId, projectId },
    select: { id: true },
  });
  if (!profile) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Profile not found in this project." });
  }
  return profile;
}

/**
 * OWNERSHIP GUARD for a single item (audit C-1): the item must live under
 * a profile that belongs to the caller's project. Joins
 * RateProfileItem → rateProfile → projectId.
 */
async function assertItemInProject(itemId: string, profileId: string, projectId: string) {
  const item = await db.rateProfileItem.findFirst({
    where: { id: itemId, rateProfileId: profileId, rateProfile: { projectId } },
    select: { id: true },
  });
  if (!item) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Rate item not found in this profile." });
  }
  return item;
}

export const rateProfileRouter = router({
  /** List all rate profiles for a project. */
  list: protectedProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ ctx, input }) => {
      await assertProjectMember(ctx.user, input.projectId);
      const profiles = await db.rateProfile.findMany({
        where: { projectId: input.projectId },
        orderBy: { createdAt: "asc" },
        include: { _count: { select: { items: true } } },
         take: 1000, // bounded (pagination sweep) — see src/lib/pagination.ts
       });
      return { profiles };
    }),

  /** Search all items across all rate profiles for a project. */
  searchItems: protectedProcedure
    .input(z.object({ projectId: z.string(), search: z.string().optional() }))
    .query(async ({ ctx, input }) => {
      await assertProjectMember(ctx.user, input.projectId);
      const profiles = await db.rateProfile.findMany({
        where: { projectId: input.projectId },
        include: { items: { orderBy: { materialName: "asc" } } },
        orderBy: { createdAt: "asc" },
         take: 1000, // bounded (pagination sweep) — see src/lib/pagination.ts
       });
      const items = profiles.flatMap((p) =>
        p.items.map((item) => ({
          materialName: item.materialName,
          unit: item.unit,
          rate: item.rate,
          source: "profile" as const,
          profileId: p.id,
          profileName: p.name,
        }))
      );
      const search = (input.search ?? "").toLowerCase().trim();
      const filtered = search ? items.filter((i) => i.materialName.toLowerCase().includes(search)) : items;
      return { items: filtered };
    }),

  /** Get a single rate profile with all its items. */
  get: protectedProcedure
    .input(z.object({ projectId: z.string(), profileId: z.string() }))
    .query(async ({ ctx, input }) => {
      await assertProjectMember(ctx.user, input.projectId);
      const profile = await db.rateProfile.findUnique({
        where: { id: input.profileId },
        include: { items: { orderBy: { materialName: "asc" } } },
      });
      if (!profile || profile.projectId !== input.projectId) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Profile not found." });
      }
      return { profile };
    }),

  /** Create a new rate profile. */
  create: protectedProcedure
    .input(z.object({
      projectId: z.string(),
      name: z.string().min(1).max(100),
      description: z.string().optional(),
      category: z.enum(CATEGORIES).default("district_rate"),
      isDefault: z.boolean().default(false),
    }))
    .mutation(async ({ ctx, input }) => {
      await assertCanWrite(ctx.user, input.projectId);
      const profile = await db.rateProfile.create({
        data: {
          projectId: input.projectId,
          name: input.name,
          description: input.description,
          category: input.category,
          isDefault: input.isDefault,
        },
      });
      return { profile };
    }),

  /** Update a rate profile. */
  update: protectedProcedure
    .input(z.object({
      projectId: z.string(),
      profileId: z.string(),
      name: z.string().optional(),
      description: z.string().optional(),
      category: z.enum(CATEGORIES).optional(),
      isDefault: z.boolean().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { projectId, profileId, ...data } = input;
      await assertCanWrite(ctx.user, projectId);
      const profile = await db.rateProfile.findUnique({ where: { id: profileId }, select: { projectId: true } });
      if (!profile || profile.projectId !== projectId) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Profile not found." });
      }
      const updated = await db.rateProfile.update({ where: { id: profileId }, data });
      return { profile: updated };
    }),

  /** Delete a rate profile. */
  delete: protectedProcedure
    .input(z.object({ projectId: z.string(), profileId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await assertCanWrite(ctx.user, input.projectId);
      const profile = await db.rateProfile.findUnique({ where: { id: input.profileId }, select: { projectId: true } });
      if (!profile || profile.projectId !== input.projectId) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Profile not found." });
      }
      await db.rateProfile.delete({ where: { id: input.profileId } });
      return { ok: true };
    }),

  /** Add an item to a rate profile. */
  addItem: protectedProcedure
    .input(z.object({
      projectId: z.string(),
      profileId: z.string(),
      materialName: z.string().min(1),
      category: z.string().optional(),
      subCategory: z.string().optional(),
      unit: z.string().default(""),
      rate: z.number().min(0).default(0),
    }))
    .mutation(async ({ ctx, input }) => {
      await assertCanWrite(ctx.user, input.projectId);
      // C-1: verify the profile belongs to the caller's project before
      // attaching an item to it (was: raw profileId insert).
      await assertProfileInProject(input.profileId, input.projectId);
      const item = await db.rateProfileItem.create({
        data: {
          rateProfileId: input.profileId,
          materialName: input.materialName,
          category: input.category || null,
          subCategory: input.subCategory || null,
          unit: input.unit,
          rate: input.rate,
        },
      });
      return { item };
    }),

  /** Update a rate profile item. */
  updateItem: protectedProcedure
    .input(z.object({
      projectId: z.string(),
      profileId: z.string(),
      itemId: z.string(),
      materialName: z.string().optional(),
      category: z.string().optional(),
      subCategory: z.string().optional(),
      unit: z.string().optional(),
      rate: z.number().min(0).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { projectId, profileId, itemId, ...data } = input;
      await assertCanWrite(ctx.user, projectId);
      // C-1: the item must live under the caller's project's profile
      // (was: update by raw itemId — cross-tenant write).
      await assertItemInProject(itemId, profileId, projectId);
      const updated = await db.rateProfileItem.update({ where: { id: itemId }, data });
      return { item: updated };
    }),

  /** Delete a rate profile item. */
  deleteItem: protectedProcedure
    .input(z.object({ projectId: z.string(), profileId: z.string(), itemId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await assertCanWrite(ctx.user, input.projectId);
      // C-1: ownership pin before delete (was: delete by raw itemId).
      await assertItemInProject(input.itemId, input.profileId, input.projectId);
      await db.rateProfileItem.delete({ where: { id: input.itemId } });
      return { ok: true };
    }),

  /**
   * Quotation averaging tool: enter up to 3 supplier rates and create a profile item
   * with the average rate. Also supports naming the item.
   */
  addAveragedItem: protectedProcedure
    .input(z.object({
      projectId: z.string(),
      profileId: z.string(),
      materialName: z.string().min(1),
      unit: z.string().default(""),
      rate1: z.number().min(0),
      rate2: z.number().min(0),
      rate3: z.number().min(0).optional(),
      supplier1: z.string().optional(),
      supplier2: z.string().optional(),
      supplier3: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await assertCanWrite(ctx.user, input.projectId);
      // C-1: ownership pin before create (same as addItem).
      await assertProfileInProject(input.profileId, input.projectId);

      const rates = [input.rate1, input.rate2];
      if (input.rate3 !== undefined) rates.push(input.rate3);
      const avg = rates.reduce((s, r) => s + r, 0) / rates.length;

      const item = await db.rateProfileItem.create({
        data: {
          rateProfileId: input.profileId,
          materialName: input.materialName,
          unit: input.unit,
          rate: Math.round(avg * 100) / 100,
        },
      });
      return { item, average: Math.round(avg * 100) / 100, ratesCount: rates.length };
    }),

  /**
   * Batch-apply profile rates to an analysis's ingredients,
   * recording provenance (which RateProfileItem supplied each rate).
   */
  batchApply: protectedProcedure
    .input(z.object({ projectId: z.string(), profileId: z.string(), rateAnalysisId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await assertCanWrite(ctx.user, input.projectId);

      const profile = await db.rateProfile.findFirst({
        where: { id: input.profileId, projectId: input.projectId },
        include: { items: true },
      });
      if (!profile) throw new TRPCError({ code: "NOT_FOUND", message: "Profile not found in this project." });

      // C-1 (batchApply half): the target analysis must belong to this
      // project too — ingredients were previously fetched by raw
      // rateAnalysisId, letting a guessed cuid rewrite ANOTHER org's
      // BoqIngredient rates. Join RateAnalysis → boqItem → projectId.
      const analysis = await db.rateAnalysis.findFirst({
        where: { id: input.rateAnalysisId, boqItem: { projectId: input.projectId } },
        select: { id: true },
      });
      if (!analysis) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Rate analysis not found in this project." });
      }

      // Build lookup: lowercase material name -> item
      const lookup = new Map<string, { id: string; unit: string; rate: number }>();
      profile.items.forEach((item) => {
        lookup.set(item.materialName.toLowerCase().trim(), { id: item.id, unit: item.unit, rate: item.rate });
      });

      // Find ingredients in this analysis
      const ingredients = await db.boqIngredient.findMany({
        where: { rateAnalysisId: input.rateAnalysisId },
      });

      let updated = 0;
      for (const ing of ingredients) {
        const match = lookup.get(ing.name.toLowerCase().trim());
        if (match && match.rate !== ing.rate) {
          const newAmount = ing.calcMode === "fixed"
            ? (ing.quantity + (ing.quantity * ing.percentage) / 100) * match.rate
            : ing.amount;
          await db.boqIngredient.update({
            where: { id: ing.id },
            data: {
              rate: match.rate,
              unit: match.unit,
              amount: newAmount,
              rateProfileItemId: match.id, // record provenance
            },
          });
          updated++;
        }
      }

      return { updated, total: ingredients.length, profileName: profile.name };
    }),
});
