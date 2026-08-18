import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure } from "@/server/trpc";
import { db } from "@/lib/db";
import { assertProjectMember, assertCanWrite } from "@/lib/authz";

export const CreateMaterialSchema = z.object({
  projectId: z.string(),
  name: z.string().min(1).max(200),
  code: z.string().optional(),
  category: z.string().optional(),
  subCategory: z.string().optional().nullable(),
  materialCatalogId: z.string().optional().nullable(),
  unit: z.string().min(1),
  minStock: z.number().min(0).default(0),
  currentStock: z.number().min(0).default(0),
  reorderLevel: z.number().min(0).default(0),
});

export const UpdateMaterialSchema = z.object({
  itemId: z.string(),
  name: z.string().optional(),
  code: z.string().nullable().optional(),
  category: z.string().nullable().optional(),
  subCategory: z.string().nullable().optional(),
  materialCatalogId: z.string().nullable().optional(),
  unit: z.string().optional(),
  minStock: z.number().optional(),
  currentStock: z.number().optional(),
  reorderLevel: z.number().optional(),
});

export const materialCrudProcedures = {
  list: protectedProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ ctx, input }) => {
      await assertProjectMember(ctx.user, input.projectId);
      const [materials, suppliers, purchaseOrders] = await Promise.all([
        db.material.findMany({
          where: { projectId: input.projectId },
          orderBy: { name: "asc" },
          include: { _count: { select: { transactions: true } } },
        }),
        db.supplier.findMany({
          where: { projectId: input.projectId },
          orderBy: { name: "asc" },
          include: { _count: { select: { purchaseOrders: true } } },
        }),
        db.purchaseOrder.findMany({
          where: { projectId: input.projectId },
          orderBy: { orderDate: "desc" },
          include: {
            supplier: true,
            partner: true,
            items: { include: { material: { select: { name: true, unit: true, code: true } } } },
            _count: { select: { items: true } },
          },
        }),
      ]);
      return { materials, suppliers, purchaseOrders };
    }),

  create: protectedProcedure
    .input(CreateMaterialSchema)
    .mutation(async ({ ctx, input }) => {
      const { projectId, ...data } = input;
      const role = await assertProjectMember(ctx.user, projectId);
      if (role === "client" || role === "inspector") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Read-only role." });
      }
      const item = await db.material.create({ data: { projectId, ...data } });
      return { material: item };
    }),

  update: protectedProcedure
    .input(UpdateMaterialSchema)
    .mutation(async ({ ctx, input }) => {
      const { itemId, ...data } = input;
      const item = await db.material.findUnique({ where: { id: itemId }, select: { projectId: true } });
      if (!item) throw new TRPCError({ code: "NOT_FOUND", message: "Material not found." });
      await assertCanWrite(ctx.user, item.projectId);
      const updated = await db.material.update({ where: { id: itemId }, data });
      return { material: updated };
    }),

  delete: protectedProcedure
    .input(z.object({ itemId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const item = await db.material.findUnique({ where: { id: input.itemId }, select: { projectId: true } });
      if (!item) throw new TRPCError({ code: "NOT_FOUND", message: "Material not found." });
      await assertCanWrite(ctx.user, item.projectId);
      await db.material.delete({ where: { id: input.itemId } });
      return { ok: true };
    }),

  checkProjectDeleteImpact: protectedProcedure
    .input(z.object({ itemIds: z.array(z.string()) }))
    .query(async ({ input }) => {
      const ids = input.itemIds;
      const [transactions, purchaseOrderItems, boqIngredients, requisitionItems] = await Promise.all([
        db.materialTransaction.count({ where: { materialId: { in: ids } } }),
        db.purchaseOrderItem.count({ where: { materialId: { in: ids } } }),
        db.boqIngredient.count({ where: { materialId: { in: ids } } }),
        db.purchaseRequisitionItem.count({ where: { materialId: { in: ids } } }),
      ]);
      return {
        transactions,
        purchaseOrderItems,
        boqIngredients,
        requisitionItems,
        hasImpact: (transactions + purchaseOrderItems + boqIngredients + requisitionItems) > 0,
      };
    }),

  deleteMany: protectedProcedure
    .input(z.object({ itemIds: z.array(z.string()) }))
    .mutation(async ({ ctx, input }) => {
      const items = await db.material.findMany({
        where: { id: { in: input.itemIds } },
        select: { id: true, projectId: true }
      });
      if (items.length === 0) return { ok: true, count: 0 };
      
      const projectId = items[0].projectId;
      await assertCanWrite(ctx.user, projectId);

      await db.material.deleteMany({
        where: { id: { in: input.itemIds } }
      });

      return { ok: true, count: items.length };
    }),
};
