/**
 * tRPC router for Store Locations and Sub-Store Inventory / Inter-Store Transfers.
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure, capabilityGuard } from "@/server/trpc";
import { db } from "@/lib/db";
import { assertProjectMember, assertCanWrite } from "@/lib/authz";
import { withOrgContext } from "@/lib/rls";

const CreateStoreLocationSchema = z.object({
  projectId: z.string(),
  name: z.string().min(1),
  code: z.string().optional().nullable(),
  isDefault: z.boolean().optional().default(false),
  address: z.string().optional().nullable(),
  incharge: z.string().optional().nullable(),
  phone: z.string().optional().nullable(),
});

const UpdateStoreLocationSchema = z.object({
  id: z.string(),
  name: z.string().min(1).optional(),
  code: z.string().optional().nullable(),
  isDefault: z.boolean().optional(),
  address: z.string().optional().nullable(),
  incharge: z.string().optional().nullable(),
  phone: z.string().optional().nullable(),
  status: z.enum(["active", "inactive"]).optional(),
});

const TransferStockSchema = z.object({
  projectId: z.string(),
  materialId: z.string().min(1),
  fromStoreId: z.string().min(1),
  toStoreId: z.string().min(1),
  quantity: z.number().positive(),
  reference: z.string().optional().nullable(),
  remarks: z.string().optional().nullable(),
  date: z.string().optional(),
});

export const storeLocationRouter = router({
  /** List all store locations for a project with current stock count. */
  list: protectedProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ ctx, input }) => {
      await assertProjectMember(ctx.user, input.projectId);

      // Auto-ensure default "Main Project Store" exists if no stores exist yet
      const existingCount = await db.storeLocation.count({
        where: { projectId: input.projectId },
      });

      if (existingCount === 0) {
        await db.storeLocation.create({
          data: {
            projectId: input.projectId,
            name: "Main Site Store",
            code: "ST-MAIN",
            isDefault: true,
            status: "active",
          },
        });
      }

      const locations = await db.storeLocation.findMany({
        where: { projectId: input.projectId },
        include: {
          stocks: {
            include: {
              material: {
                select: { id: true, name: true, code: true, unit: true, category: true, subCategory: true },
              },
            },
          },
        },
        orderBy: [{ isDefault: "desc" }, { name: "asc" }],
         take: 1000, // bounded (pagination sweep) — see src/lib/pagination.ts
       });

      return { locations };
    }),

  /** Get stock breakdown by material across all stores. */
  materialStockBreakdown: protectedProcedure
    .input(z.object({ projectId: z.string(), materialId: z.string() }))
    .query(async ({ ctx, input }) => {
      await assertProjectMember(ctx.user, input.projectId);

      const storeStocks = await db.materialStoreStock.findMany({
        where: {
          materialId: input.materialId,
          storeLocation: { projectId: input.projectId, status: "active" },
        },
        include: {
          storeLocation: true,
        },
        orderBy: { storeLocation: { name: "asc" } },
         take: 1000, // bounded (pagination sweep) — see src/lib/pagination.ts
       });

      return { storeStocks };
    }),

  /** Create a new store location. */
  create: protectedProcedure
    .use(capabilityGuard({ inventoryControl: "basic" })) // ADR-0004: stores require inventory control
    .input(CreateStoreLocationSchema)
    .mutation(async ({ ctx, input }) => {
      await assertCanWrite(ctx.user, input.projectId);

      if (input.isDefault) {
        // Unset other defaults
        await db.storeLocation.updateMany({
          where: { projectId: input.projectId, isDefault: true },
          data: { isDefault: false },
        });
      }

      const location = await db.storeLocation.create({
        data: {
          projectId: input.projectId,
          name: input.name.trim(),
          code: input.code?.trim() || null,
          isDefault: input.isDefault || false,
          address: input.address?.trim() || null,
          incharge: input.incharge?.trim() || null,
          phone: input.phone?.trim() || null,
        },
      });

      return { location };
    }),

  /** Update a store location. */
  update: protectedProcedure
    .use(capabilityGuard({ inventoryControl: "basic" }))
    .input(UpdateStoreLocationSchema)
    .mutation(async ({ ctx, input }) => {
      const existing = await db.storeLocation.findUnique({
        where: { id: input.id },
      });

      if (!existing) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Store location not found." });
      }

      await assertCanWrite(ctx.user, existing.projectId);

      if (input.isDefault) {
        await db.storeLocation.updateMany({
          where: { projectId: existing.projectId, isDefault: true, id: { not: input.id } },
          data: { isDefault: false },
        });
      }

      const location = await db.storeLocation.update({
        where: { id: input.id },
        data: {
          ...(input.name !== undefined ? { name: input.name.trim() } : {}),
          ...(input.code !== undefined ? { code: input.code?.trim() || null } : {}),
          ...(input.isDefault !== undefined ? { isDefault: input.isDefault } : {}),
          ...(input.address !== undefined ? { address: input.address?.trim() || null } : {}),
          ...(input.incharge !== undefined ? { incharge: input.incharge?.trim() || null } : {}),
          ...(input.phone !== undefined ? { phone: input.phone?.trim() || null } : {}),
          ...(input.status !== undefined ? { status: input.status } : {}),
        },
      });

      return { location };
    }),

  /** Inter-store stock transfer. */
  transferStock: protectedProcedure
    .use(capabilityGuard({ inventoryControl: "basic" }))
    .input(TransferStockSchema)
    .mutation(async ({ ctx, input }) => {
      await assertCanWrite(ctx.user, input.projectId);

      if (input.fromStoreId === input.toStoreId) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Source and destination stores must be different.",
        });
      }

      const material = await db.material.findFirst({
        where: { id: input.materialId, projectId: input.projectId },
      });

      if (!material) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Material not found." });
      }

      const fromStore = await db.storeLocation.findFirst({
        where: { id: input.fromStoreId, projectId: input.projectId },
      });
      const toStore = await db.storeLocation.findFirst({
        where: { id: input.toStoreId, projectId: input.projectId },
      });

      if (!fromStore || !toStore) {
        throw new TRPCError({ code: "NOT_FOUND", message: "One or both store locations not found." });
      }

      if (fromStore.status === "inactive" || toStore.status === "inactive") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Cannot transfer stock to or from an inactive store location.",
        });
      }

      // Check source store balance
      const sourceStock = await db.materialStoreStock.findUnique({
        where: {
          materialId_storeLocationId: {
            materialId: input.materialId,
            storeLocationId: input.fromStoreId,
          },
        },
      });

      const availableSourceQty = sourceStock ? sourceStock.currentStock : 0;
      if (availableSourceQty < input.quantity - 0.0001) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Insufficient stock at ${fromStore.name}. Available: ${availableSourceQty} ${material.unit}, Requested: ${input.quantity} ${material.unit}.`,
        });
      }

      const transferDate = input.date ? new Date(input.date) : new Date();

      const result = await db.$transaction(async (tx) => {
        await withOrgContext(tx, ctx.user.organizationId, !!ctx.user.isSuperAdmin); // RLS: phase-3m MISS: MaterialTransaction is FORCE-scoped since 20260830030000
        // 1. Deduct from source store
        await tx.materialStoreStock.upsert({
          where: {
            materialId_storeLocationId: {
              materialId: input.materialId,
              storeLocationId: input.fromStoreId,
            },
          },
          update: {
            currentStock: { decrement: input.quantity },
          },
          create: {
            materialId: input.materialId,
            storeLocationId: input.fromStoreId,
            currentStock: -input.quantity,
          },
        });

        // 2. Add to target store
        await tx.materialStoreStock.upsert({
          where: {
            materialId_storeLocationId: {
              materialId: input.materialId,
              storeLocationId: input.toStoreId,
            },
          },
          update: {
            currentStock: { increment: input.quantity },
          },
          create: {
            materialId: input.materialId,
            storeLocationId: input.toStoreId,
            currentStock: input.quantity,
          },
        });

        // 3. Log MaterialTransaction of type "transfer"
        const txn = await tx.materialTransaction.create({
          data: {
            projectId: input.projectId,
            materialId: input.materialId,
            type: "transfer",
            quantity: input.quantity,
            unit: material.unit,
            reference: input.reference?.trim() || `TRF-${fromStore.code || "SRC"}->${toStore.code || "DST"}`,
            remarks: input.remarks || `Transferred from ${fromStore.name} to ${toStore.name}`,
            date: transferDate,
            createdById: ctx.user.id,
            storeLocationId: input.fromStoreId,
            targetStoreLocationId: input.toStoreId,
          },
        });

        return { txn };
      });

      return { success: true, transaction: result.txn };
    }),
});
