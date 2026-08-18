/**
 * tRPC router for Purchase Requisitions / Quotation Comparisons & PO Generation.
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "@/server/trpc";
import { db } from "@/lib/db";
import { assertProjectMember, assertCanWrite, assertProjectAdmin } from "@/lib/authz";

const RequisitionItemQuoteSchema = z.object({
  partnerId: z.string().min(1),
  exFactoryRate: z.number().nonnegative(),
  transportRate: z.number().nonnegative(),
  notes: z.string().optional().nullable(),
});

const RequisitionItemSchema = z.object({
  materialId: z.string().min(1),
  quantity: z.number().positive(),
  unit: z.string().min(1),
  selectedPartnerId: z.string().min(1),
  justification: z.string().optional().nullable(),
  fileUrl: z.string().optional().nullable(),
  quotes: z.array(RequisitionItemQuoteSchema).min(3, { message: "Each item must have quotes from at least 3 vendors." }),
});

const CreateRequisitionSchema = z.object({
  projectId: z.string(),
  remarks: z.string().optional().nullable(),
  items: z.array(RequisitionItemSchema).min(1),
});

const UpdateRequisitionStatusSchema = z.object({
  projectId: z.string(),
  requisitionId: z.string(),
  status: z.enum(["approved", "rejected"]),
  rejectionReason: z.string().optional().nullable(),
});

const GeneratePOsSchema = z.object({
  projectId: z.string(),
  items: z.array(
    z.object({
      requisitionItemId: z.string().min(1),
      quantityToOrder: z.number().positive(),
    })
  ).min(1),
  remarks: z.string().optional().nullable(),
});

async function executeGeneratePOs(
  user: any,
  input: { projectId: string; items: { requisitionItemId: string; quantityToOrder: number }[]; remarks?: string | null }
) {
  await assertCanWrite(user, input.projectId);

  // Fetch details for all requested requisition items
  const reqItemIds = input.items.map((i) => i.requisitionItemId);
  const reqItems = await db.purchaseRequisitionItem.findMany({
    where: {
      id: { in: reqItemIds },
      requisition: { projectId: input.projectId, status: { in: ["approved", "partially_ordered"] } },
    },
    include: {
      requisition: true,
      material: true,
      quotes: true,
      poItems: {
        include: {
          purchaseOrder: { select: { status: true } },
        },
      },
    },
  });

  if (reqItems.length === 0) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "No valid approved requisition items found for ordering.",
    });
  }

  // Map requested quantities and validate limits
  const itemMap = new Map<string, { dbItem: (typeof reqItems)[0]; qtyToOrder: number }>();
  for (const reqInput of input.items) {
    const dbItem = reqItems.find((i) => i.id === reqInput.requisitionItemId);
    if (!dbItem) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: `Requisition item ${reqInput.requisitionItemId} is not in an approved state.`,
      });
    }

    const currentOrderedQty = dbItem.poItems.reduce((sum, poi) => {
      return poi.purchaseOrder.status !== "cancelled" ? sum + poi.quantity : sum;
    }, 0);
    const remainingQty = Math.max(0, dbItem.quantity - currentOrderedQty);

    if (reqInput.quantityToOrder > remainingQty + 0.0001) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: `Order quantity (${reqInput.quantityToOrder} ${dbItem.unit}) exceeds remaining quantity (${remainingQty} ${dbItem.unit}) for material ${dbItem.material.name}.`,
      });
    }

    itemMap.set(dbItem.id, { dbItem, qtyToOrder: reqInput.quantityToOrder });
  }

  // Group items strictly by selected vendor (partnerId)
  const itemsByVendor: Record<string, { dbItem: (typeof reqItems)[0]; qtyToOrder: number }[]> = {};
  for (const val of itemMap.values()) {
    const partnerId = val.dbItem.selectedPartnerId;
    if (!itemsByVendor[partnerId]) {
      itemsByVendor[partnerId] = [];
    }
    itemsByVendor[partnerId].push(val);
  }

  const generatedPOs: any[] = [];
  const affectedRequisitionIds = new Set<string>();

  await db.$transaction(async (tx) => {
    for (const [partnerId, group] of Object.entries(itemsByVendor)) {
      // Fetch partner details
      const partner = await tx.partner.findUnique({
        where: { id: partnerId },
      });
      if (!partner) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Selected vendor not found in partner registry.",
        });
      }

      // Sync or create Supplier record
      let supplier = await tx.supplier.findFirst({
        where: { projectId: input.projectId, name: partner.name },
      });
      if (!supplier) {
        supplier = await tx.supplier.create({
          data: {
            projectId: input.projectId,
            name: partner.name,
            contact: partner.contact || null,
            phone: partner.phone || null,
            email: partner.email || null,
            address: partner.address || null,
            pan: partner.pan || null,
          },
        });
      }

      let totalAmount = 0;
      const poItemsData: any[] = [];

      for (const { dbItem, qtyToOrder } of group) {
        affectedRequisitionIds.add(dbItem.requisitionId);

        const selectedQuote = dbItem.quotes.find((q) => q.partnerId === partnerId);
        if (!selectedQuote) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Quoted rate for vendor ${partner.name} not found on item ${dbItem.material.name}.`,
          });
        }

        const rate = selectedQuote.exFactoryRate + selectedQuote.transportRate;
        const amount = qtyToOrder * rate;
        totalAmount += amount;

        poItemsData.push({
          materialId: dbItem.materialId,
          requisitionItemId: dbItem.id,
          quantity: qtyToOrder,
          unit: dbItem.unit,
          rate,
          amount,
        });
      }

      // Generate PO number
      const poCount = await tx.purchaseOrder.count({
        where: { projectId: input.projectId },
      });
      const poNumber = `PO-${(poCount + 1).toString().padStart(4, "0")}`;

      // Get single requisitionId if all items belong to 1 PR, else null for multi-PR batch
      const uniquePrIds = Array.from(new Set(group.map((g) => g.dbItem.requisitionId)));
      const primaryPrId = uniquePrIds.length === 1 ? uniquePrIds[0] : null;

      const po = await tx.purchaseOrder.create({
        data: {
          projectId: input.projectId,
          number: poNumber,
          supplierId: supplier.id,
          partnerId: partner.id,
          status: "draft",
          totalAmount,
          remarks: input.remarks || `Generated from approved requisition items`,
          requisitionId: primaryPrId,
        },
      });

      // Create PO items linked to requisitionItemId
      await tx.purchaseOrderItem.createMany({
        data: poItemsData.map((poi) => ({
          purchaseOrderId: po.id,
          ...poi,
        })),
      });

      generatedPOs.push(po);
    }

    // Update PR statuses for all affected requisitions
    for (const prId of affectedRequisitionIds) {
      const prWithItems = await tx.purchaseRequisition.findUnique({
        where: { id: prId },
        include: {
          items: {
            include: {
              poItems: {
                include: {
                  purchaseOrder: { select: { status: true } },
                },
              },
            },
          },
        },
      });

      if (prWithItems) {
        let allFullyOrdered = true;
        let anyOrdered = false;

        for (const item of prWithItems.items) {
          const totalOrdered = item.poItems.reduce((sum, poi) => {
            return poi.purchaseOrder.status !== "cancelled" ? sum + poi.quantity : sum;
          }, 0);

          if (totalOrdered < item.quantity) {
            allFullyOrdered = false;
          }
          if (totalOrdered > 0) {
            anyOrdered = true;
          }
        }

        const newStatus = allFullyOrdered ? "ordered" : anyOrdered ? "partially_ordered" : "approved";
        await tx.purchaseRequisition.update({
          where: { id: prId },
          data: { status: newStatus },
        });
      }
    }
  });

  return { success: true, count: generatedPOs.length, poIds: generatedPOs.map((p) => p.id) };
}

export const requisitionRouter = router({
  /** List all purchase requisitions for a project with line-item ordering stats. */
  list: protectedProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ ctx, input }) => {
      await assertProjectMember(ctx.user, input.projectId);
      const requisitions = await db.purchaseRequisition.findMany({
        where: { projectId: input.projectId },
        orderBy: { createdAt: "desc" },
        include: {
          createdBy: { select: { name: true } },
          approvedBy: { select: { name: true } },
          items: {
            include: {
              material: { select: { name: true, unit: true, code: true } },
              quotes: {
                include: {
                  partner: { select: { name: true } },
                },
              },
              poItems: {
                include: {
                  purchaseOrder: { select: { id: true, number: true, status: true } },
                },
              },
            },
          },
        },
      });

      const formattedRequisitions = requisitions.map((pr) => {
        let totalItems = pr.items.length;
        let fullyOrderedCount = 0;
        let partiallyOrderedCount = 0;

        const itemsWithStats = pr.items.map((item) => {
          const orderedQty = item.poItems.reduce((sum, poi) => {
            return poi.purchaseOrder.status !== "cancelled" ? sum + poi.quantity : sum;
          }, 0);
          const remainingQty = Math.max(0, item.quantity - orderedQty);
          let itemStatus: "unordered" | "partially_ordered" | "fully_ordered" = "unordered";
          if (orderedQty >= item.quantity) {
            itemStatus = "fully_ordered";
            fullyOrderedCount++;
          } else if (orderedQty > 0) {
            itemStatus = "partially_ordered";
            partiallyOrderedCount++;
          }
          return {
            ...item,
            orderedQty,
            remainingQty,
            itemStatus,
          };
        });

        return {
          ...pr,
          items: itemsWithStats,
          stats: {
            totalItems,
            fullyOrderedCount,
            partiallyOrderedCount,
            unorderedCount: totalItems - fullyOrderedCount - partiallyOrderedCount,
          },
        };
      });

      return { requisitions: formattedRequisitions };
    }),

  /** Get details of a single requisition with ordering progress. */
  getDetails: protectedProcedure
    .input(z.object({ projectId: z.string(), requisitionId: z.string() }))
    .query(async ({ ctx, input }) => {
      await assertProjectMember(ctx.user, input.projectId);
      const req = await db.purchaseRequisition.findFirst({
        where: { id: input.requisitionId, projectId: input.projectId },
        include: {
          createdBy: { select: { name: true } },
          approvedBy: { select: { name: true } },
          items: {
            include: {
              material: true,
              quotes: {
                include: {
                  partner: true,
                },
              },
              poItems: {
                include: {
                  purchaseOrder: { select: { id: true, number: true, status: true } },
                },
              },
            },
          },
        },
      });

      if (!req) throw new TRPCError({ code: "NOT_FOUND", message: "Purchase Requisition not found." });

      const itemsWithProgress = req.items.map((item) => {
        const orderedQty = item.poItems.reduce((sum, poi) => {
          return poi.purchaseOrder.status !== "cancelled" ? sum + poi.quantity : sum;
        }, 0);
        const remainingQty = Math.max(0, item.quantity - orderedQty);
        let itemStatus: "unordered" | "partially_ordered" | "fully_ordered" = "unordered";
        if (orderedQty >= item.quantity) {
          itemStatus = "fully_ordered";
        } else if (orderedQty > 0) {
          itemStatus = "partially_ordered";
        }

        const linkedPOs = item.poItems
          .filter((poi) => poi.purchaseOrder.status !== "cancelled")
          .map((poi) => ({
            poId: poi.purchaseOrder.id,
            poNumber: poi.purchaseOrder.number,
            quantity: poi.quantity,
          }));

        return {
          ...item,
          orderedQty,
          remainingQty,
          itemStatus,
          linkedPOs,
        };
      });

      return {
        requisition: {
          ...req,
          items: itemsWithProgress,
        },
      };
    }),

  /** List pending approved requisition items for Material-First and Vendor-First procurement. */
  listPendingItems: protectedProcedure
    .input(
      z.object({
        projectId: z.string(),
        materialId: z.string().optional(),
        partnerId: z.string().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      await assertProjectMember(ctx.user, input.projectId);

      const items = await db.purchaseRequisitionItem.findMany({
        where: {
          requisition: {
            projectId: input.projectId,
            status: { in: ["approved", "partially_ordered"] },
          },
          ...(input.materialId ? { materialId: input.materialId } : {}),
          ...(input.partnerId ? { selectedPartnerId: input.partnerId } : {}),
        },
        include: {
          requisition: { select: { id: true, number: true, createdAt: true, status: true } },
          material: { select: { id: true, name: true, code: true, unit: true, category: true } },
          quotes: {
            include: {
              partner: { select: { id: true, name: true, phone: true, email: true } },
            },
          },
          poItems: {
            include: {
              purchaseOrder: { select: { id: true, number: true, status: true } },
            },
          },
        },
        orderBy: { requisition: { createdAt: "desc" } },
      });

      const pendingItems = items
        .map((item) => {
          const orderedQty = item.poItems.reduce((sum, poi) => {
            return poi.purchaseOrder.status !== "cancelled" ? sum + poi.quantity : sum;
          }, 0);
          const remainingQty = Math.max(0, item.quantity - orderedQty);
          const selectedQuote = item.quotes.find((q) => q.partnerId === item.selectedPartnerId);
          const rate = selectedQuote ? selectedQuote.exFactoryRate + selectedQuote.transportRate : 0;
          const selectedPartner = selectedQuote ? selectedQuote.partner : null;

          return {
            id: item.id,
            requisitionId: item.requisition.id,
            requisitionNumber: item.requisition.number,
            requisitionDate: item.requisition.createdAt,
            materialId: item.material.id,
            materialName: item.material.name,
            materialCategory: item.material.category,
            unit: item.unit,
            requiredQty: item.quantity,
            orderedQty,
            remainingQty,
            partnerId: item.selectedPartnerId,
            partnerName: selectedPartner ? selectedPartner.name : "Unknown",
            rate,
            estimatedAmount: remainingQty * rate,
          };
        })
        .filter((item) => item.remainingQty > 0);

      return { pendingItems };
    }),

  /** Create a purchase requisition with quotation comparisons. */
  create: protectedProcedure.input(CreateRequisitionSchema).mutation(async ({ ctx, input }) => {
    await assertCanWrite(ctx.user, input.projectId);

    // Validate selected rates and justification
    for (const item of input.items) {
      if (item.quotes.length < 3) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Comparison statement requires at least 3 vendor quotes for each item.",
        });
      }

      let minTotal = Infinity;
      let selectedTotal = 0;
      for (const q of item.quotes) {
        const total = q.exFactoryRate + q.transportRate;
        if (total < minTotal) minTotal = total;
        if (q.partnerId === item.selectedPartnerId) {
          selectedTotal = total;
        }
      }

      if (selectedTotal > minTotal && (!item.justification || item.justification.trim() === "")) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Justification is required since a higher priced vendor is selected.",
        });
      }
    }

    const count = await db.purchaseRequisition.count({
      where: { projectId: input.projectId },
    });
    const number = `PR-${(count + 1).toString().padStart(4, "0")}`;

    const requisition = await db.$transaction(async (tx) => {
      const pr = await tx.purchaseRequisition.create({
        data: {
          projectId: input.projectId,
          number,
          status: "pending_approval",
          remarks: input.remarks || null,
          createdById: ctx.user.id,
        },
      });

      for (const item of input.items) {
        const pri = await tx.purchaseRequisitionItem.create({
          data: {
            requisitionId: pr.id,
            materialId: item.materialId,
            quantity: item.quantity,
            unit: item.unit,
            selectedPartnerId: item.selectedPartnerId,
            justification: item.justification || null,
            fileUrl: item.fileUrl || null,
          },
        });

        await tx.requisitionItemQuote.createMany({
          data: item.quotes.map((q) => ({
            requisitionItemId: pri.id,
            partnerId: q.partnerId,
            exFactoryRate: q.exFactoryRate,
            transportRate: q.transportRate,
            notes: q.notes || null,
          })),
        });
      }

      return pr;
    });

    return { requisition };
  }),

  /** Approve or Reject a requisition. */
  updateStatus: protectedProcedure
    .input(UpdateRequisitionStatusSchema)
    .mutation(async ({ ctx, input }) => {
      await assertProjectAdmin(ctx.user, input.projectId);

      const pr = await db.purchaseRequisition.findFirst({
        where: { id: input.requisitionId, projectId: input.projectId },
      });
      if (!pr) throw new TRPCError({ code: "NOT_FOUND", message: "Purchase Requisition not found." });

      if (pr.status === "ordered") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Cannot change the status of an already ordered requisition.",
        });
      }

      if (input.status === "rejected" && (!input.rejectionReason || !input.rejectionReason.trim())) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Please provide a reason when rejecting a requisition.",
        });
      }

      const updated = await db.purchaseRequisition.update({
        where: { id: input.requisitionId },
        data: {
          status: input.status,
          approvedById: ctx.user.id,
          rejectionReason: input.status === "rejected" ? input.rejectionReason?.trim() : null,
        },
      });

      return { requisition: updated };
    }),

  /** Check budget allowance and variance for materials before requisition submission. */
  checkBudgetVariance: protectedProcedure
    .input(
      z.object({
        projectId: z.string(),
        items: z.array(
          z.object({
            materialId: z.string(),
            quantity: z.number().nonnegative(),
          })
        ),
      })
    )
    .query(async ({ ctx, input }) => {
      await assertProjectMember(ctx.user, input.projectId);

      const materials = await db.material.findMany({
        where: { id: { in: input.items.map((i) => i.materialId) }, projectId: input.projectId },
      });

      // Get BOQ planned demands
      const boqItems = await db.boqItem.findMany({
        where: { projectId: input.projectId },
        include: {
          ingredients: { where: { type: "material" } },
        },
      });

      const boqIngredientsList: { name: string; totalPlanned: number }[] = [];
      const plannedDemandMap = new Map<string, number>();

      for (const item of boqItems) {
        for (const ing of item.ingredients) {
          const key = ing.name.toLowerCase().trim();
          const planned = item.quantity * ing.quantity;
          plannedDemandMap.set(key, (plannedDemandMap.get(key) ?? 0) + planned);
        }
      }

      for (const [nameKey, totalPlanned] of plannedDemandMap.entries()) {
        boqIngredientsList.push({ name: nameKey, totalPlanned });
      }

      // Get already ordered/requisitioned quantities
      const existingReqItems = await db.purchaseRequisitionItem.findMany({
        where: {
          materialId: { in: input.items.map((i) => i.materialId) },
          requisition: { projectId: input.projectId, status: { in: ["approved", "ordered", "pending_approval"] } },
        },
        select: { materialId: true, quantity: true },
      });

      const alreadyProcuredMap = new Map<string, number>();
      for (const req of existingReqItems) {
        alreadyProcuredMap.set(req.materialId, (alreadyProcuredMap.get(req.materialId) ?? 0) + req.quantity);
      }

      const results = input.items.map((reqItem) => {
        const mat = materials.find((m) => m.id === reqItem.materialId);
        if (!mat) return null;

        const matNameKey = mat.name.toLowerCase().trim();
        const catKey = (mat.category || "").toLowerCase().trim();
        const fullSpec = (mat.subCategory ? `${mat.name} ${mat.subCategory}` : mat.name).toLowerCase().trim();

        // 1. Exact name match
        let plannedQty = plannedDemandMap.get(matNameKey) ?? 0;

        // 2. Full spec match if exact name had no match
        if (plannedQty === 0) {
          plannedQty = plannedDemandMap.get(fullSpec) ?? 0;
        }

        // 3. Substring / Token matching against BOQ ingredients
        if (plannedQty === 0) {
          for (const boqIng of boqIngredientsList) {
            if (
              matNameKey.includes(boqIng.name) ||
              boqIng.name.includes(matNameKey) ||
              fullSpec.includes(boqIng.name) ||
              boqIng.name.includes(fullSpec)
            ) {
              plannedQty += boqIng.totalPlanned;
            }
          }
        }

        // 4. Category fallback
        if (plannedQty === 0 && catKey) {
          plannedQty = plannedDemandMap.get(catKey) ?? 0;
        }

        const alreadyProcured = alreadyProcuredMap.get(mat.id) ?? 0;
        const totalAfterThis = alreadyProcured + reqItem.quantity;
        const remainingAllowance = Math.max(0, plannedQty - alreadyProcured);
        const isOverBudget = plannedQty > 0 && totalAfterThis > plannedQty;
        const variancePercent = plannedQty > 0 ? ((totalAfterThis - plannedQty) / plannedQty) * 100 : 0;

        return {
          materialId: mat.id,
          materialName: mat.name,
          unit: mat.unit,
          plannedQty,
          alreadyProcured,
          requestedQty: reqItem.quantity,
          remainingAllowance,
          totalAfterThis,
          isOverBudget,
          variancePercent: Math.round(variancePercent * 10) / 10,
        };
      }).filter(Boolean);

      return { results };
    }),

  /** Generate Vendor-Isolated Purchase Orders (supporting 3-way entry: Requisition-First, Material-First, Vendor-First). */
  generatePOs: protectedProcedure.input(GeneratePOsSchema).mutation(async ({ ctx, input }) => {
    return await executeGeneratePOs(ctx.user, input);
  }),

  /** Legacy procedure maintained for backward compatibility */
  generatePO: protectedProcedure
    .input(z.object({ projectId: z.string(), requisitionId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await assertCanWrite(ctx.user, input.projectId);

      const prItems = await db.purchaseRequisitionItem.findMany({
        where: { requisitionId: input.requisitionId, requisition: { status: { in: ["approved", "partially_ordered"] } } },
        include: { poItems: { include: { purchaseOrder: { select: { status: true } } } } },
      });

      if (prItems.length === 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Approved requisition items not found." });
      }

      const itemsToOrder = prItems
        .map((item) => {
          const orderedQty = item.poItems.reduce((sum, poi) => (poi.purchaseOrder.status !== "cancelled" ? sum + poi.quantity : sum), 0);
          const remainingQty = Math.max(0, item.quantity - orderedQty);
          return { requisitionItemId: item.id, quantityToOrder: remainingQty };
        })
        .filter((i) => i.quantityToOrder > 0);

      if (itemsToOrder.length === 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "All items in this requisition have already been ordered." });
      }

      return await executeGeneratePOs(ctx.user, {
        projectId: input.projectId,
        items: itemsToOrder,
        remarks: `Generated from approved Requisition`,
      });
    }),
});
