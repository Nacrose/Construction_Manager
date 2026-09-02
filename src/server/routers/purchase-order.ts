/**
 * tRPC router for Purchase Orders.
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "@/server/trpc";
import { db } from "@/lib/db";
import { invalidateProjectCache } from "@/lib/cache";
import { assertProjectMember, assertCanWrite, getProjectRole } from "@/lib/authz";
import { withOrgContext } from "@/lib/rls";
import { getNextSequenceNumber } from "@/server/utils/sequence-generator";
import { canTransition, transitionEntityState } from "@/server/utils/state-machine";
import { emitDomainEvent } from "@/server/utils/domain-events";


const PurchaseOrderItemSchema = z.object({
  materialId: z.string().min(1),
  quantity: z.number().positive(),
  rate: z.number().min(0),
  requisitionItemId: z.string().optional().nullable(),
});

const CreatePurchaseOrderSchema = z.object({
  projectId: z.string(),
  number: z.string().min(1).max(50).optional(),
  partnerId: z.string().optional().nullable(),
  supplierId: z.string().optional().nullable(),
  expectedDate: z.string().optional().nullable(),
  deliveryTerms: z.string().optional().nullable(),
  paymentTerms: z.string().optional().nullable(),
  vatPercent: z.number().nonnegative().optional().default(13),
  remarks: z.string().optional().nullable(),
  items: z.array(PurchaseOrderItemSchema).min(1),
});

const UpdatePOStatusSchema = z.object({
  projectId: z.string(),
  poId: z.string(),
  status: z.enum(["draft", "issued", "received", "cancelled"]),
});

export const purchaseOrderRouter = router({
  /** List all purchase orders for a project. */
  list: protectedProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ ctx, input }) => {
      await assertProjectMember(ctx.user, input.projectId);
      const purchaseOrders = await db.purchaseOrder.findMany({
        where: { projectId: input.projectId },
        orderBy: { orderDate: "desc" },
        include: {
          partner: { select: { id: true, name: true, phone: true, email: true, pan: true, contact: true } },
          supplier: { select: { id: true, name: true, phone: true, email: true, pan: true } },
          items: {
            include: {
              material: { select: { id: true, name: true, unit: true, code: true } },
            },
          },
          bills: {
            select: { id: true, billNumber: true, status: true, paidAmount: true, netPayable: true },
          },
        },
         take: 1000, // bounded (pagination sweep) — see src/lib/pagination.ts
       });
      return { purchaseOrders };
    }),

  /** Get purchase order details for print/view. */
  get: protectedProcedure
    .input(z.object({ projectId: z.string(), poId: z.string() }))
    .query(async ({ ctx, input }) => {
      await assertProjectMember(ctx.user, input.projectId);
      const po = await db.purchaseOrder.findFirst({
        where: { id: input.poId, projectId: input.projectId },
        include: {
          partner: true,
          supplier: true,
          project: {
            select: { id: true, name: true, code: true, client: true, location: true },
          },
          items: {
            include: {
              material: true,
            },
          },
          requisition: {
            select: { id: true, number: true, createdAt: true },
          },
          bills: true,
          transactions: {
            include: {
              gateEntry: true,
            },
          },
        },
      });
      if (!po) throw new TRPCError({ code: "NOT_FOUND", message: "Purchase Order not found." });
      return { purchaseOrder: po };
    }),

  /** Create purchase order. */
  create: protectedProcedure
    .input(CreatePurchaseOrderSchema)
    .mutation(async ({ ctx, input }) => {
      await assertCanWrite(ctx.user, input.projectId);

      let targetPartnerId = input.partnerId;
      let targetSupplierId = input.supplierId;

      if (targetPartnerId) {
        const partner = await db.partner.findFirst({
          where: { id: targetPartnerId, projectId: input.projectId },
        });
        if (!partner) throw new TRPCError({ code: "BAD_REQUEST", message: "Partner not found." });

        // Ensure legacy supplier record exists
        let supplier = await db.supplier.findFirst({
          where: { projectId: input.projectId, name: partner.name },
        });
        if (!supplier) {
          supplier = await db.supplier.create({
            data: {
              projectId: input.projectId,
              name: partner.name,
              contact: partner.contact,
              phone: partner.phone,
              email: partner.email,
              address: partner.address,
              pan: partner.pan,
            },
          });
        }
        targetSupplierId = supplier.id;
      } else if (targetSupplierId) {
        const supplier = await db.supplier.findFirst({
          where: { id: targetSupplierId, projectId: input.projectId },
        });
        if (!supplier) throw new TRPCError({ code: "BAD_REQUEST", message: "Supplier not found." });

        // Find or create matching partner
        let partner = await db.partner.findFirst({
          where: { projectId: input.projectId, name: supplier.name },
        });
        if (!partner) {
          partner = await db.partner.create({
            data: {
              projectId: input.projectId,
              name: supplier.name,
              type: "material_supplier",
              contact: supplier.contact,
              phone: supplier.phone,
              email: supplier.email,
              address: supplier.address,
              pan: supplier.pan,
            },
          });
        }
        targetPartnerId = partner.id;
      } else {
        throw new TRPCError({ code: "BAD_REQUEST", message: "A vendor/partner must be selected." });
      }

      const itemsData: { materialId: string; quantity: number; unit: string; rate: number; amount: number; requisitionItemId?: string | null }[] = [];
      let totalAmount = 0;

      for (const item of input.items) {
        const material = await db.material.findFirst({
          where: { id: item.materialId, projectId: input.projectId },
        });
        if (!material) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Material with ID ${item.materialId} not found in this project.`,
          });
        }
        const amount = item.quantity * item.rate;
        totalAmount += amount;
        itemsData.push({
          materialId: item.materialId,
          quantity: item.quantity,
          unit: material.unit,
          rate: item.rate,
          amount,
          requisitionItemId: item.requisitionItemId || null,
        });
      }

      let poNumber = input.number;
      if (!poNumber) {
        poNumber = await getNextSequenceNumber("purchase_order", { projectId: input.projectId });
      }

      const duplicate = await db.purchaseOrder.findFirst({
        where: { projectId: input.projectId, number: poNumber },
      });
      if (duplicate) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Purchase Order number ${poNumber} already exists in this project.`,
        });
      }

      const vatPercent = input.vatPercent ?? 13;
      const vatAmount = (totalAmount * vatPercent) / 100;
      const netAmount = totalAmount + vatAmount;

      const order = await db.$transaction(async (tx) => {
        await withOrgContext(tx, ctx.user.organizationId, !!ctx.user.isSuperAdmin); // RLS: phase-3m tables are FORCE-scoped
        const po = await tx.purchaseOrder.create({
          data: {
            projectId: input.projectId,
            number: poNumber!,
            supplierId: targetSupplierId,
            partnerId: targetPartnerId,
            status: "draft",
            expectedDate: input.expectedDate ? new Date(input.expectedDate) : null,
            deliveryTerms: input.deliveryTerms?.trim() || null,
            paymentTerms: input.paymentTerms?.trim() || null,
            vatPercent,
            vatAmount,
            netAmount,
            totalAmount,
            remarks: input.remarks || null,
          },
        });

        await tx.purchaseOrderItem.createMany({
          data: itemsData.map((it) => ({
            purchaseOrderId: po.id,
            ...it,
          })),
        });

        return tx.purchaseOrder.findUnique({
          where: { id: po.id },
          include: {
            partner: true,
            supplier: true,
            items: {
              include: {
                material: { select: { name: true, unit: true, code: true } },
              },
            },
          },
        });
      });

      return { purchaseOrder: order };
    }),

  /** Update status of a Purchase Order (Admin role only for issued/received). */
  updateStatus: protectedProcedure
    .input(UpdatePOStatusSchema)
    .mutation(async ({ ctx, input }) => {
      await assertCanWrite(ctx.user, input.projectId);

      const po = await db.purchaseOrder.findFirst({
        where: { id: input.poId, projectId: input.projectId },
        include: { items: true },
      });
      if (!po) throw new TRPCError({ code: "NOT_FOUND", message: "Purchase Order not found." });

      if (po.status === input.status) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Status is already set to this value." });
      }

      const transitionCheck = canTransition("purchaseOrder", po.status, input.status);
      if (!transitionCheck.allowed) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: transitionCheck.reason || "Cannot modify a closed or cancelled Purchase Order.",
        });
      }

      if (input.status === "issued" || input.status === "received") {
        const role = await getProjectRole(ctx.user.id, input.projectId);
        if (role !== "project_manager" && role !== "coordinator") {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Only Project Managers or Coordinators can transition Purchase Orders to issued or received status.",
          });
        }
      }


      const updated = await db.$transaction(async (tx) => {
        await withOrgContext(tx, ctx.user.organizationId, !!ctx.user.isSuperAdmin); // RLS: phase-3m tables are FORCE-scoped
        if (input.status === "received") {
          for (const item of po.items) {
            const remainingToReceive = Math.max(0, item.quantity - item.receivedQty);
            if (remainingToReceive > 0) {
              const material = await tx.material.findUnique({
                where: { id: item.materialId },
              });
              if (material) {
                // H-12 FIX: atomic increment — was a read-modify-write
                // absolute write (lost updates under concurrency).
                await tx.material.update({
                  where: { id: item.materialId },
                  data: { currentStock: { increment: remainingToReceive } },
                });

                await tx.materialTransaction.create({
                  data: {
                    materialId: item.materialId,
                    projectId: input.projectId,
                    purchaseOrderId: po.id,
                    type: "receive",
                    quantity: remainingToReceive,
                    unit: item.unit,
                    rate: item.rate,
                    reference: po.number,
                    remarks: `Received from Purchase Order ${po.number}`,
                    createdById: ctx.user.id,
                  },
                });

                await tx.purchaseOrderItem.update({
                  where: { id: item.id },
                  data: { receivedQty: item.quantity },
                });
              }
            }
          }
        }

        // Engine transition: CAS on the status we validated above — a
        // concurrent flip rolls back the receive side effects instead of
        // double-crediting stock. The manual domain event after the tx keeps
        // the PO-numbered notification title, so the engine's generic event
        // is suppressed here.
        await transitionEntityState(tx, {
          model: "purchaseOrder",
          id: input.poId,
          projectId: input.projectId,
          targetState: input.status,
          userId: ctx.user.id,
          userName: ctx.user.name,
          skipEventEmit: true,
        });

        const refreshed = await tx.purchaseOrder.findUnique({
          where: { id: input.poId },
          include: {
            supplier: { select: { name: true } },
            items: {
              include: {
                material: { select: { name: true, unit: true, code: true } },
              },
            },
          },
        });
        if (!refreshed) throw new TRPCError({ code: "NOT_FOUND", message: "Purchase Order not found." });

        // AUTO-CAPTURE (committed cost): issuing a PO commits its budget —
        // record it in the cost ledger (ProjectCost, source
        // "purchase_order"). The cost schema documents four sources —
        // manual | daily_report | ipc | purchase_order — but only the
        // first two were ever written, so committed procurement spend was
        // invisible to cost stats and the cash flow forecast. Actuals keep
        // flowing through material transactions / vendor bills; this row
        // is the commitment itself (netAmount — the PO math's full net
        // payable, incl. VAT per the create pins).
        // Existence-checked so a draft → issued → (reopen path) re-issue
        // cannot double-capture.
        if (input.status === "issued" && refreshed.netAmount > 0) {
          const existingCost = await tx.projectCost.findFirst({
            where: { source: "purchase_order", sourceRefId: refreshed.id },
            select: { id: true },
          });
          if (!existingCost) {
            await tx.projectCost.create({
              data: {
                projectId: input.projectId,
                date: refreshed.orderDate,
                amount: refreshed.netAmount,
                category: "material",
                subcategory: "Purchase Order (committed)",
                description: `Committed cost — PO ${refreshed.number}${refreshed.supplier?.name ? ` (${refreshed.supplier.name})` : ""}`,
                source: "purchase_order",
                sourceRef: refreshed.number,
                sourceRefId: refreshed.id,
                vendor: refreshed.supplier?.name ?? null,
                createdById: ctx.user.id,
              },
            });
          }
        }

        // Cancelling the PO dissolves the commitment — remove its cost
        // ledger row so the committed figure doesn't linger. Real received
        // value is unaffected (material transactions / vendor bills).
        if (input.status === "cancelled") {
          await tx.projectCost.deleteMany({
            where: { source: "purchase_order", sourceRefId: refreshed.id },
          });
        }

        return refreshed;
      });

      emitDomainEvent({
        type: "lifecycle.transitioned",
        projectId: input.projectId,
        actorUserId: ctx.user.id,
        title: `Purchase Order ${input.status === "issued" ? "Issued" : input.status === "received" ? "Received" : "Status Updated"} (${po.number || "PO"})`,
        message: `Purchase Order ${po.number} marked as ${input.status} by ${ctx.user.name || "User"}.`,
        entityType: "purchaseOrder",
        entityId: updated.id,
        metadata: { model: "purchaseOrder", from: po.status, to: input.status },
      });

      // Issue/cancel moves the committed-cost picture.
      await invalidateProjectCache(input.projectId, ["cashflow"]);
      return { purchaseOrder: updated };

    }),

  /** Delete a draft Purchase Order. */
  delete: protectedProcedure
    .input(z.object({ projectId: z.string(), poId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await assertCanWrite(ctx.user, input.projectId);

      const po = await db.purchaseOrder.findFirst({
        where: { id: input.poId, projectId: input.projectId },
      });
      if (!po) throw new TRPCError({ code: "NOT_FOUND", message: "Purchase Order not found." });

      if (po.status !== "draft") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Only draft Purchase Orders can be deleted." });
      }

      await db.purchaseOrder.delete({
        where: { id: input.poId },
      });

      return { ok: true };
    }),
});
