import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "@/server/trpc";
import { db } from "@/lib/db";
import { findSimilarMaterials, normalizeMaterialName } from "@/lib/fuzzy-match";

export const uncatalogedMaterialRouter = router({
  list: protectedProcedure
    .input(
      z.object({
        level: z.enum(["global", "org"]).default("org"),
        organizationId: z.string().optional(),
        status: z.enum(["pending", "mapped", "promoted", "ignored", "all"]).default("pending"),
        limit: z.number().min(1).max(500).default(100),
      })
    )
    .query(async ({ ctx, input }) => {
      const orgId = input.organizationId ?? ctx.user.organizationId;
      const where: any = { level: input.level };

      if (input.level === "org") {
        if (!orgId) throw new TRPCError({ code: "BAD_REQUEST", message: "Organization ID is required." });
        where.organizationId = orgId;
      }

      if (input.status !== "all") {
        where.status = input.status;
      }

      const items = await db.uncatalogedMaterial.findMany({
        where,
        orderBy: [{ occurrenceCount: "desc" }, { createdAt: "desc" }],
        take: input.limit,
      });

      // Compute live fuzzy suggestions for pending items
      const enriched = await Promise.all(
        items.map(async (item) => {
          if (item.status === "pending") {
            const suggestions = await findSimilarMaterials({
              name: item.rawName,
              scope: input.level === "global" ? "global" : "all",
              organizationId: orgId,
              threshold: 0.35,
              limit: 4,
            });
            return {
              ...item,
              suggestions,
            };
          }
          return {
            ...item,
            suggestions: [],
          };
        })
      );

      return { items: enriched };
    }),

  stats: protectedProcedure
    .input(
      z.object({
        level: z.enum(["global", "org"]).default("org"),
        organizationId: z.string().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const orgId = input.organizationId ?? ctx.user.organizationId;
      const where: any = { level: input.level };
      if (input.level === "org" && orgId) {
        where.organizationId = orgId;
      }

      const [pending, mapped, promoted, ignored] = await Promise.all([
        db.uncatalogedMaterial.count({ where: { ...where, status: "pending" } }),
        db.uncatalogedMaterial.count({ where: { ...where, status: "mapped" } }),
        db.uncatalogedMaterial.count({ where: { ...where, status: "promoted" } }),
        db.uncatalogedMaterial.count({ where: { ...where, status: "ignored" } }),
      ]);

      return { pending, mapped, promoted, ignored, total: pending + mapped + promoted + ignored };
    }),

  mapToExisting: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        targetType: z.enum(["global", "org"]),
        targetId: z.string(), // ID of CatalogMaterial
      })
    )
    .mutation(async ({ ctx, input }) => {
      // IDOR guard: fetch the uncataloged material and verify it
      // belongs to the caller's org (or is global). Previously this
      // used findUnique on the cuid only — a caller could map or
      // manipulate uncataloged entries from another org.
      const uncataloged = await db.uncatalogedMaterial.findUnique({ where: { id: input.id } });
      if (!uncataloged) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Uncataloged material not found." });
      }
      // Enforce org scoping: org-level entries must match the caller's
      // org. Global entries (level="global", organizationId=null) are
      // only mutable by super admins (not enforced here — admin
      // procedures handle that).
      if (uncataloged.organizationId && uncataloged.organizationId !== ctx.user.organizationId) {
        throw new TRPCError({ code: "FORBIDDEN", message: "This uncataloged material belongs to a different organization." });
      }

      const targetMaterial = await db.catalogMaterial.findUnique({ where: { id: input.targetId } });
      if (!targetMaterial) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Target catalog material not found." });
      }
      // Org-scoped catalog targets must belong to the caller's org.
      if (
        targetMaterial.scope === "org" &&
        targetMaterial.organizationId &&
        targetMaterial.organizationId !== ctx.user.organizationId
      ) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Target catalog material belongs to a different organization." });
      }
      // Project-scoped catalog targets must belong to a project the
      // caller is a member of.
      if (
        targetMaterial.scope === "project" &&
        targetMaterial.projectId
      ) {
        // Lazy import to avoid circular dependency on authz.
        const { assertProjectMember } = await import("@/lib/authz");
        try {
          await assertProjectMember(ctx.user, targetMaterial.projectId);
        } catch {
          throw new TRPCError({ code: "FORBIDDEN", message: "Target catalog material belongs to a project you're not a member of." });
        }
      }

      const orgId = uncataloged.organizationId ?? ctx.user.organizationId;
      let finalTargetId = targetMaterial.id;

      // If mapped to global item from org context, ensure org has imported/adopted it
      if (input.targetType === "global" && orgId && targetMaterial.scope === "global") {
        const adopted = await db.catalogMaterial.findFirst({
          where: {
            organizationId: orgId,
            sourceMaterialId: targetMaterial.id,
          },
        });

        if (adopted) {
          finalTargetId = adopted.id;
        } else {
          const newOrgMat = await db.catalogMaterial.create({
            data: {
              scope: "org",
              organizationId: orgId,
              sourceMaterialId: targetMaterial.id,
              name: targetMaterial.name,
              normalizedName: targetMaterial.normalizedName,
              category: targetMaterial.category,
              subCategory: targetMaterial.subCategory,
              defaultUnit: targetMaterial.defaultUnit,
              defaultRate: targetMaterial.defaultRate,
              aliases: [uncataloged.rawName],
              isActive: true,
            },
          });
          finalTargetId = newOrgMat.id;
        }
      }

      // Remap any project Materials with this uncataloged name
      let remappedCount = 0;
      if (uncataloged.sourceProjectId) {
        const updateRes = await db.material.updateMany({
          where: {
            projectId: uncataloged.sourceProjectId,
            name: { equals: uncataloged.rawName, mode: "insensitive" },
          },
          data: { catalogMaterialId: finalTargetId },
        });
        remappedCount = updateRes.count;
      }

      // Auto-learn synonym: append rawName to target material aliases
      try {
        const targetMat = await db.catalogMaterial.findUnique({ where: { id: finalTargetId } });
        if (targetMat && !targetMat.aliases.includes(uncataloged.rawName)) {
          await db.catalogMaterial.update({
            where: { id: finalTargetId },
            data: { aliases: [...targetMat.aliases, uncataloged.rawName] },
          });
        }
      } catch (e) {
        console.error("Failed to append alias on mapToExisting non-fatal", e);
      }

      // Mark uncataloged item as mapped
      const updated = await db.uncatalogedMaterial.update({
        where: { id: input.id },
        data: {
          status: "mapped",
          mappedToId: finalTargetId,
        },
      });

      return { success: true, item: updated, remappedCount };
    }),

  promoteToGlobal: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        canonicalName: z.string().min(1),
        category: z.string().optional().nullable(),
        subCategory: z.string().optional().nullable(),
        defaultUnit: z.string().optional().nullable(),
        defaultRate: z.number().min(0).default(0),
        code: z.string().optional().nullable(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (!ctx.user.isSuperAdmin) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Only SuperAdmins can promote items to Global Catalog." });
      }

      const uncataloged = await db.uncatalogedMaterial.findUnique({ where: { id: input.id } });
      if (!uncataloged) throw new TRPCError({ code: "NOT_FOUND", message: "Item not found." });

      const norm = normalizeMaterialName(input.canonicalName);

      // Check for duplicate by normalizedName
      const existing = await db.catalogMaterial.findFirst({
        where: { scope: "global", normalizedName: norm },
      });
      if (existing) {
        throw new TRPCError({
          code: "CONFLICT",
          message: `A global material with name "${existing.name}" already exists.`,
        });
      }

      // Create Global Material
      const globalItem = await db.catalogMaterial.create({
        data: {
          scope: "global",
          organizationId: null,
          projectId: null,
          name: input.canonicalName.trim(),
          normalizedName: norm,
          code: input.code?.trim() || null,
          category: input.category?.trim() || null,
          subCategory: input.subCategory?.trim() || null,
          defaultUnit: input.defaultUnit?.trim() || "unit",
          defaultRate: input.defaultRate || 0,
          aliases: [uncataloged.rawName],
          isActive: true,
        },
      });

      // Mark uncataloged as promoted
      const updated = await db.uncatalogedMaterial.update({
        where: { id: input.id },
        data: {
          status: "promoted",
          mappedToId: globalItem.id,
        },
      });

      return { globalItem, uncataloged: updated };
    }),

  promoteToOrg: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        name: z.string().min(1),
        category: z.string().optional().nullable(),
        subCategory: z.string().optional().nullable(),
        defaultUnit: z.string().optional().nullable(),
        defaultRate: z.number().min(0).default(0),
        code: z.string().optional().nullable(),
        organizationId: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const orgId = input.organizationId ?? ctx.user.organizationId;
      if (!orgId) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Organization ID is required." });
      }

      if (!ctx.user.isSuperAdmin) {
        if (ctx.user.organizationId !== orgId) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Not authorized for this organization." });
        }
        if (!["admin", "owner"].includes(ctx.user.orgRole?.toLowerCase() || "")) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Admin role required." });
        }
      }

      const uncataloged = await db.uncatalogedMaterial.findUnique({ where: { id: input.id } });
      if (!uncataloged) throw new TRPCError({ code: "NOT_FOUND", message: "Item not found." });

      // IDOR guard: the uncataloged entry must belong to the target org
      // (or be global, in which case it can be promoted into any org).
      // Previously this used findUnique on the cuid only — a caller could
      // promote an uncataloged entry from another org into their own.
      if (uncataloged.organizationId && uncataloged.organizationId !== orgId) {
        throw new TRPCError({ code: "FORBIDDEN", message: "This uncataloged material belongs to a different organization." });
      }

      const baseNorm = normalizeMaterialName(input.name);
      const subNorm = input.subCategory ? normalizeMaterialName(input.subCategory) : "";
      const compositeNorm = subNorm ? `${baseNorm} ${subNorm}` : baseNorm;

      // Check if item with this normalizedName already exists in org catalog
      const existing = await db.catalogMaterial.findFirst({
        where: { scope: "org", organizationId: orgId, normalizedName: compositeNorm },
      });

      let orgItem: any;
      if (existing) {
        orgItem = existing;
      } else {
        // Check if global master item exists to link sourceMaterialId
        const globalMatch =
          (await db.catalogMaterial.findFirst({
            where: { scope: "global", normalizedName: compositeNorm, isActive: true },
          })) ||
          (await db.catalogMaterial.findFirst({
            where: { scope: "global", normalizedName: baseNorm, isActive: true },
          }));

        orgItem = await db.catalogMaterial.create({
          data: {
            scope: "org",
            organizationId: orgId,
            projectId: null,
            sourceMaterialId: globalMatch?.id || null,
            name: input.name.trim(),
            normalizedName: compositeNorm,
            code: input.code?.trim() || null,
            category: input.category?.trim() || null,
            subCategory: input.subCategory?.trim() || null,
            defaultUnit: input.defaultUnit?.trim() || "unit",
            defaultRate: input.defaultRate || 0,
            aliases: [uncataloged.rawName],
            isActive: true,
          },
        });

        // Auto-create rate entries in org active rate books
        try {
          const rateBooks = await db.rateBook.findMany({
            where: { scope: "org", organizationId: orgId, isActive: true },
          });
          for (const rb of rateBooks) {
            const districts = rb.districts?.length ? rb.districts : ["Default"];
            for (const d of districts) {
              await db.rateEntry.upsert({
                where: {
                  materialId_rateCatalogId_district: {
                    materialId: orgItem.id,
                    rateCatalogId: rb.id,
                    district: d,
                  },
                },
                create: {
                  materialId: orgItem.id,
                  rateCatalogId: rb.id,
                  district: d,
                  rate: input.defaultRate || 0,
                },
                update: {},
              });
            }
          }
        } catch (e) {
          console.error("Auto rate entry creation in promoteToOrg non-fatal", e);
        }
      }

      // Link any project materials with matching rawName to this org material
      let remappedCount = 0;
      if (uncataloged.sourceProjectId) {
        const updateRes = await db.material.updateMany({
          where: {
            projectId: uncataloged.sourceProjectId,
            name: { equals: uncataloged.rawName, mode: "insensitive" },
          },
          data: { catalogMaterialId: orgItem.id },
        });
        remappedCount = updateRes.count;

        // Also link project CatalogMaterial sourceMaterialId
        await db.catalogMaterial.updateMany({
          where: {
            projectId: uncataloged.sourceProjectId,
            normalizedName: compositeNorm,
          },
          data: { sourceMaterialId: orgItem.id },
        });
      }

      // Mark uncataloged as promoted
      const updated = await db.uncatalogedMaterial.update({
        where: { id: input.id },
        data: {
          status: "promoted",
          mappedToId: orgItem.id,
        },
      });

      return { orgItem, uncataloged: updated, remappedCount };
    }),

  ignore: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      // IDOR guard: verify the uncataloged material belongs to the
      // caller's org before marking it ignored. Previously this had
      // NO authz check at all — any authed user could mark any
      // uncataloged material as ignored across tenants.
      const existing = await db.uncatalogedMaterial.findUnique({
        where: { id: input.id },
        select: { organizationId: true, level: true },
      });
      if (!existing) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Uncataloged material not found." });
      }
      // Org-scoped entries must belong to the caller's org. Global
      // entries require super admin (consistent with promoteToGlobal).
      if (existing.organizationId && existing.organizationId !== ctx.user.organizationId) {
        throw new TRPCError({ code: "FORBIDDEN", message: "This uncataloged material belongs to a different organization." });
      }
      if (!existing.organizationId && !ctx.user.isSuperAdmin) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Only super admins can ignore global uncataloged materials." });
      }

      const updated = await db.uncatalogedMaterial.update({
        where: { id: input.id },
        data: { status: "ignored" },
      });
      return { item: updated };
    }),

  scanProjects: protectedProcedure
    .input(
      z.object({
        level: z.enum(["global", "org"]).default("org"),
        organizationId: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const orgId = input.organizationId ?? ctx.user.organizationId;
      if (input.level === "org" && !orgId) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Organization ID is required." });
      }

      // Get all projects belonging to the target organization (or all if global)
      const projects = await db.project.findMany({
        where: orgId ? { organizationId: orgId } : {},
        select: { id: true, name: true, organizationId: true },
      });
      const projectIds = projects.map((p) => p.id);

      if (projectIds.length === 0) {
        return { success: true, addedCount: 0 };
      }

      // 1. Get all known normalizedNames in the target catalog
      const catalogWhere: any = input.level === "org"
        ? { scope: "org", organizationId: orgId, isActive: true }
        : { scope: "global", isActive: true };
      const existingCatalogMaterials = await db.catalogMaterial.findMany({
        where: catalogWhere,
        select: { normalizedName: true },
      });
      const knownNormalizedNames = new Set(existingCatalogMaterials.map((m) => m.normalizedName));

      // 2. Find all project-scoped materials in the organization's projects
      const projectMaterials = await db.catalogMaterial.findMany({
        where: {
          scope: "project",
          isActive: true,
          projectId: { in: projectIds },
        },
      });

      // 3. Find operational Material records with null catalogMaterialId
      const unlinkedOperational = await db.material.findMany({
        where: {
          catalogMaterialId: null,
          isActive: true,
          projectId: { in: projectIds },
        },
      });

      let addedCount = 0;

      // Process project catalog materials not yet in Org catalog
      for (const mat of projectMaterials) {
        if (knownNormalizedNames.has(mat.normalizedName)) continue;

        const proj = projects.find((p) => p.id === mat.projectId);
        const itemOrgId = proj?.organizationId ?? orgId;
        const fullName = mat.name.trim() + (mat.subCategory?.trim() ? ` (${mat.subCategory.trim()})` : "");

        const existing = await db.uncatalogedMaterial.findFirst({
          where: {
            normalizedName: mat.normalizedName,
            level: input.level,
            organizationId: input.level === "org" ? itemOrgId : null,
          },
        });

        if (!existing) {
          await db.uncatalogedMaterial.create({
            data: {
              level: input.level,
              organizationId: input.level === "org" ? itemOrgId : null,
              sourceProjectId: mat.projectId,
              sourceType: "project_material",
              rawName: fullName,
              normalizedName: mat.normalizedName,
              unit: mat.defaultUnit || null,
              category: mat.category || null,
              occurrenceCount: 1,
              status: "pending",
            },
          });
          addedCount++;
        }
      }

      // Process unlinked operational materials
      for (const mat of unlinkedOperational) {
        const norm = normalizeMaterialName(mat.name + (mat.subCategory ? ` ${mat.subCategory}` : ""));
        if (knownNormalizedNames.has(norm)) continue;

        const proj = projects.find((p) => p.id === mat.projectId);
        const itemOrgId = proj?.organizationId ?? orgId;
        const fullName = mat.name.trim() + (mat.subCategory?.trim() ? ` (${mat.subCategory.trim()})` : "");

        const existing = await db.uncatalogedMaterial.findFirst({
          where: {
            normalizedName: norm,
            level: input.level,
            organizationId: input.level === "org" ? itemOrgId : null,
          },
        });

        if (!existing) {
          await db.uncatalogedMaterial.create({
            data: {
              level: input.level,
              organizationId: input.level === "org" ? itemOrgId : null,
              sourceProjectId: mat.projectId,
              sourceType: "manual",
              rawName: fullName,
              normalizedName: norm,
              unit: mat.unit || null,
              category: mat.category || null,
              occurrenceCount: 1,
              status: "pending",
            },
          });
          addedCount++;
        }
      }

      return { success: true, addedCount };
    }),
});
