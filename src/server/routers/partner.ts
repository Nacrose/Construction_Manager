/**
 * tRPC router for partners (subcontractors and suppliers).
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "@/server/trpc";
import { db } from "@/lib/db";
import { assertProjectMember, assertCanWrite } from "@/lib/authz";
import { paginationInput, pageArgs, pageResult } from "@/lib/pagination";

const SubcontractorSchema = z.object({
  projectId: z.string(),
  name: z.string().min(1).max(200),
  contact: z.string().optional().nullable(),
  phone: z.string().optional().nullable(),
  email: z.string().optional().nullable(),
  pan: z.string().optional().nullable(),
  status: z.enum(["active", "inactive"]).default("active"),
});

const UpdateSubcontractorSchema = z.object({
  projectId: z.string(),
  subId: z.string(),
  name: z.string().optional(),
  contact: z.string().optional().nullable(),
  phone: z.string().optional().nullable(),
  email: z.string().optional().nullable(),
  pan: z.string().optional().nullable(),
  status: z.enum(["active", "inactive"]).optional(),
});

const SupplierSchema = z.object({
  projectId: z.string(),
  name: z.string().min(1).max(200),
  contact: z.string().optional().nullable(),
  phone: z.string().optional().nullable(),
  email: z.string().optional().nullable(),
  address: z.string().optional().nullable(),
  pan: z.string().optional().nullable(),
  rating: z.number().min(0).max(5).default(0),
});

export const partnerRouter = router({
  /** List subcontractors in a project. */
  /** Bounded, cursor-paged directory (financial summary rides the page). */
  listSubcontractors: protectedProcedure
    .input(z.object({ projectId: z.string(), ...paginationInput }))
    .query(async ({ ctx, input }) => {
      await assertProjectMember(ctx.user, input.projectId);
      const page = pageArgs(input, "name", "asc");
      const rows = await db.subcontractor.findMany({
        where: { projectId: input.projectId },
        orderBy: page.orderBy,
        take: page.take,
        ...(page.cursor ? { cursor: page.cursor, skip: page.skip } : {}),
      });
      const { items, hasMore, nextCursor } = pageResult(rows, input);
      return { subcontractors: items, hasMore, nextCursor };
    }),

  /** Get subcontractor details including debits. */
  getSubcontractor: protectedProcedure
    .input(z.object({ projectId: z.string(), subId: z.string() }))
    .query(async ({ ctx, input }) => {
      await assertProjectMember(ctx.user, input.projectId);
      const subcontractor = await db.subcontractor.findFirst({
        where: { id: input.subId, projectId: input.projectId },
      });
      if (!subcontractor) throw new TRPCError({ code: "NOT_FOUND", message: "Subcontractor not found." });

      const debits = await db.materialTransaction.findMany({
        where: {
          projectId: input.projectId,
          subcontractorId: input.subId,
          isDebitable: true,
        },
        include: {
          material: { select: { name: true, code: true, unit: true } },
        },
        orderBy: { date: "desc" },
      });

      const totalDebitAmount = debits.reduce((acc, curr) => {
        const rate = curr.recoveryRate ?? curr.rate;
        return acc + (curr.quantity * rate);
      }, 0);

      return { subcontractor, debits, totalDebitAmount };
    }),

  /**
   * Get all works (tasks) linked to a subcontractor across daily programs.
   * Aggregates: total tasks, planned qty, actual qty, done count, partial count.
   * Used by the subcontractor detail page to show "works-on" tracking.
   */
  getSubcontractorWorks: protectedProcedure
    .input(z.object({ projectId: z.string(), subId: z.string() }))
    .query(async ({ ctx, input }) => {
      await assertProjectMember(ctx.user, input.projectId);

      // Verify subcontractor exists and belongs to project
      const sub = await db.subcontractor.findFirst({
        where: { id: input.subId, projectId: input.projectId },
        select: { id: true, name: true },
      });
      if (!sub) throw new TRPCError({ code: "NOT_FOUND", message: "Subcontractor not found." });

      // Fetch all daily program tasks linked to this subcontractor
      const tasks = await db.dailyProgramTask.findMany({
        where: { subcontractorId: input.subId },
        include: {
          program: { select: { id: true, programDate: true, status: true } },
          rfi: { select: { id: true, number: true, subject: true } },
          ganttTask: { select: { id: true, code: true, name: true } },
          boqItem: { select: { id: true, code: true, description: true, unit: true } },
        },
        orderBy: { program: { programDate: "desc" } },
      });

      // Aggregate stats
      const totalTasks = tasks.length;
      const totalPlannedQty = tasks.reduce((s, t) => s + (t.plannedQty || 0), 0);
      const totalActualQty = tasks.reduce((s, t) => s + (t.actualQty || 0), 0);
      const tasksDone = tasks.filter(t => t.executionStatus === "done").length;
      const tasksPartial = tasks.filter(t => t.executionStatus === "partially_completed").length;
      const tasksNotStarted = tasks.filter(t => t.executionStatus === "planned" || t.executionStatus === "uncompleted").length;

      // Group by date for timeline view
      const byDate: Record<string, typeof tasks> = {};
      for (const t of tasks) {
        const dateKey = t.program?.programDate
          ? new Date(t.program.programDate).toISOString().slice(0, 10)
          : "unknown";
        if (!byDate[dateKey]) byDate[dateKey] = [];
        byDate[dateKey].push(t);
      }

      // Linked RFIs (distinct)
      const rfiIds = new Set(
        tasks.map(t => t.rfiId).filter((id): id is string => !!id)
      );
      const rfis = rfiIds.size > 0
        ? await db.rfi.findMany({
            where: { id: { in: Array.from(rfiIds) } },
            select: { id: true, number: true, subject: true, status: true, workDate: true },
          })
        : [];

      return {
        subcontractor: sub,
        tasks,
        rfis,
        stats: {
          totalTasks,
          totalPlannedQty,
          totalActualQty,
          tasksDone,
          tasksPartial,
          tasksNotStarted,
          completionPct: totalTasks > 0 ? Math.round((tasksDone / totalTasks) * 100) : 0,
        },
        byDate,
      };
    }),

  /** Create a subcontractor. */
  createSubcontractor: protectedProcedure
    .input(SubcontractorSchema)
    .mutation(async ({ ctx, input }) => {
      await assertCanWrite(ctx.user, input.projectId);
      const subcontractor = await db.subcontractor.create({
        data: {
          projectId: input.projectId,
          name: input.name,
          contact: input.contact || null,
          phone: input.phone || null,
          email: input.email || null,
          pan: input.pan || null,
          status: input.status,
        },
      });
      return { subcontractor };
    }),

  /** Update subcontractor. */
  updateSubcontractor: protectedProcedure
    .input(UpdateSubcontractorSchema)
    .mutation(async ({ ctx, input }) => {
      await assertCanWrite(ctx.user, input.projectId);

      const subcontractor = await db.subcontractor.findFirst({
        where: { id: input.subId, projectId: input.projectId },
      });
      if (!subcontractor) throw new TRPCError({ code: "NOT_FOUND", message: "Subcontractor not found." });

      const updated = await db.subcontractor.update({
        where: { id: input.subId },
        data: {
          name: input.name,
          contact: input.contact,
          phone: input.phone,
          email: input.email,
          pan: input.pan,
          status: input.status,
        },
      });
      return { subcontractor: updated };
    }),

  /** Delete subcontractor. */
  deleteSubcontractor: protectedProcedure
    .input(z.object({ projectId: z.string(), subId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await assertCanWrite(ctx.user, input.projectId);

      const subcontractor = await db.subcontractor.findFirst({
        where: { id: input.subId, projectId: input.projectId },
      });
      if (!subcontractor) throw new TRPCError({ code: "NOT_FOUND", message: "Subcontractor not found." });

      const [billsCount, ipcsCount, txnCount] = await Promise.all([
        db.subcontractorBill.count({ where: { subcontractorId: input.subId } }),
        db.ipc.count({ where: { subcontractorId: input.subId } }),
        db.materialTransaction.count({ where: { subcontractorId: input.subId } }),
      ]);

      if (billsCount > 0 || ipcsCount > 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Cannot delete subcontractor with existing billing/IPC records. Please deactivate the subcontractor instead.`,
        });
      }
      if (txnCount > 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Cannot delete subcontractor with active material issues. Please void transactions first.",
        });
      }

      await db.subcontractor.delete({
        where: { id: input.subId },
      });
      return { ok: true };
    }),

  /** List suppliers. */
  /** Bounded, cursor-paged directory. */
  listSuppliers: protectedProcedure
    .input(z.object({ projectId: z.string(), ...paginationInput }))
    .query(async ({ ctx, input }) => {
      await assertProjectMember(ctx.user, input.projectId);
      const page = pageArgs(input, "name", "asc");
      const rows = await db.supplier.findMany({
        where: { projectId: input.projectId },
        orderBy: page.orderBy,
        take: page.take,
        ...(page.cursor ? { cursor: page.cursor, skip: page.skip } : {}),
      });
      const { items, hasMore, nextCursor } = pageResult(rows, input);
      return { suppliers: items, hasMore, nextCursor };
    }),

  /** Create supplier. */
  createSupplier: protectedProcedure
    .input(SupplierSchema)
    .mutation(async ({ ctx, input }) => {
      await assertCanWrite(ctx.user, input.projectId);
      const supplier = await db.supplier.create({
        data: {
          projectId: input.projectId,
          name: input.name,
          contact: input.contact || null,
          phone: input.phone || null,
          email: input.email || null,
          address: input.address || null,
          pan: input.pan || null,
          rating: input.rating,
        },
      });
      return { supplier };
    }),

  // ─────────────────────────────────────────────────────────
  // UNIFIED PARTNER — supersedes Supplier & EquipmentVendor
  // ─────────────────────────────────────────────────────────

  /** List partners by type with financial payable summary. */
  /** Bounded, cursor-paged directory. */
  listPartners: protectedProcedure
    .input(z.object({
      projectId: z.string(),
      type: z.enum(["material_supplier", "equipment_vendor", "both"]).optional(),
      ...paginationInput,
    }))
    .query(async ({ ctx, input }) => {
      await assertProjectMember(ctx.user, input.projectId);
      const where: any = { projectId: input.projectId };
      if (input.type) where.type = input.type;
      const page = pageArgs(input, "name", "asc");
      const rawRows = await db.partner.findMany({
        where,
        orderBy: page.orderBy,
        take: page.take,
        ...(page.cursor ? { cursor: page.cursor, skip: page.skip } : {}),
        include: {
          _count: { select: { purchaseOrders: true, rentals: true, bills: true } },
          bills: {
            select: { grossAmount: true, netPayable: true, paidAmount: true, status: true },
          },
          supplies: {
            orderBy: { materialName: "asc" },
          },
        },
      });
      const { items: rawPartners, hasMore, nextCursor } = pageResult(rawRows, input);

      const partners = rawPartners.map((p) => {
        const totalBilled = p.bills.reduce((s, b) => s + b.netPayable, 0);
        const totalPaid = p.bills.reduce((s, b) => s + b.paidAmount, 0);
        const balanceDue = Math.max(0, totalBilled - totalPaid);
        const unpaidBillsCount = p.bills.filter(
          (b) => b.status === "unpaid" || b.status === "partially_paid"
        ).length;

        return {
          ...p,
          financialSummary: {
            totalBilled,
            totalPaid,
            balanceDue,
            unpaidBillsCount,
          },
        };
      });

      return { partners, hasMore, nextCursor };
    }),

  /** Create a partner. */
  createPartner: protectedProcedure
    .input(z.object({
      projectId: z.string(),
      name: z.string().min(1).max(200),
      type: z.enum(["material_supplier", "equipment_vendor", "both"]).default("material_supplier"),
      code: z.string().optional().nullable(),
      regNumber: z.string().optional().nullable(),
      contact: z.string().optional().nullable(),
      phone: z.string().optional().nullable(),
      email: z.string().optional().nullable(),
      address: z.string().optional().nullable(),
      pan: z.string().optional().nullable(),
      rating: z.number().min(0).max(5).default(0),
      notes: z.string().optional().nullable(),
    }))
    .mutation(async ({ ctx, input }) => {
      await assertCanWrite(ctx.user, input.projectId);

      if (input.code) {
        const existing = await db.partner.findFirst({
          where: { projectId: input.projectId, code: input.code },
        });
        if (existing) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Vendor code "${input.code}" is already in use in this project.`,
          });
        }
      }

      const partner = await db.partner.create({
        data: {
          projectId: input.projectId,
          name: input.name,
          type: input.type,
          code: input.code || null,
          regNumber: input.regNumber || null,
          contact: input.contact || null,
          phone: input.phone || null,
          email: input.email || null,
          address: input.address || null,
          pan: input.pan || null,
          rating: input.rating,
          notes: input.notes || null,
        },
      });
      return { partner };
    }),

  /** Update a partner. */
  updatePartner: protectedProcedure
    .input(z.object({
      partnerId: z.string(),
      name: z.string().optional(),
      type: z.enum(["material_supplier", "equipment_vendor", "both"]).optional(),
      code: z.string().nullable().optional(),
      regNumber: z.string().nullable().optional(),
      contact: z.string().nullable().optional(),
      phone: z.string().nullable().optional(),
      email: z.string().nullable().optional(),
      address: z.string().nullable().optional(),
      pan: z.string().nullable().optional(),
      rating: z.number().optional(),
      status: z.string().optional(),
      notes: z.string().nullable().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const partner = await db.partner.findUnique({ where: { id: input.partnerId } });
      if (!partner) throw new TRPCError({ code: "NOT_FOUND", message: "Partner not found." });
      await assertCanWrite(ctx.user, partner.projectId);

      if (input.code) {
        const existing = await db.partner.findFirst({
          where: {
            projectId: partner.projectId,
            code: input.code,
            id: { not: input.partnerId },
          },
        });
        if (existing) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Vendor code "${input.code}" is already in use in this project.`,
          });
        }
      }

      const { partnerId, ...data } = input;
      const updated = await db.partner.update({
        where: { id: partnerId },
        data: {
          ...(data.name !== undefined && { name: data.name }),
          ...(data.type !== undefined && { type: data.type }),
          ...(data.code !== undefined && { code: data.code || null }),
          ...(data.regNumber !== undefined && { regNumber: data.regNumber || null }),
          ...(data.contact !== undefined && { contact: data.contact }),
          ...(data.phone !== undefined && { phone: data.phone }),
          ...(data.email !== undefined && { email: data.email }),
          ...(data.address !== undefined && { address: data.address }),
          ...(data.pan !== undefined && { pan: data.pan }),
          ...(data.rating !== undefined && { rating: data.rating }),
          ...(data.status !== undefined && { status: data.status }),
          ...(data.notes !== undefined && { notes: data.notes }),
        },
      });
      return { partner: updated };
    }),

  /** Delete a partner. */
  deletePartner: protectedProcedure
    .input(z.object({ partnerId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const partner = await db.partner.findUnique({ where: { id: input.partnerId } });
      if (!partner) throw new TRPCError({ code: "NOT_FOUND", message: "Partner not found." });
      await assertCanWrite(ctx.user, partner.projectId);

      const [linkedPOs, linkedRentals, linkedBills] = await Promise.all([
        db.purchaseOrder.count({ where: { partnerId: input.partnerId } }),
        db.equipmentRental.count({ where: { partnerId: input.partnerId } }),
        db.vendorBill.count({ where: { partnerId: input.partnerId } }),
      ]);
      if (linkedPOs > 0 || linkedRentals > 0 || linkedBills > 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Cannot delete partner with active purchase orders, equipment rentals, or vendor bills.",
        });
      }

      await db.partner.delete({ where: { id: input.partnerId } });
      return { ok: true };
    }),

  /** Create a partner supply item with catalog link, brand & specType. */
  createPartnerSupply: protectedProcedure
    .input(z.object({
      partnerId: z.string(),
      catalogMaterialId: z.string().optional().nullable(),
      materialCatalogId: z.string().optional().nullable(),
      materialName: z.string().min(1),
      brand: z.string().optional().nullable(),
      specType: z.string().optional().nullable(),
      unit: z.string().min(1),
      exFactoryRate: z.number().min(0),
      transportRate: z.number().min(0),
      notes: z.string().optional().nullable(),
    }))
    .mutation(async ({ ctx, input }) => {
      const partner = await db.partner.findUnique({ where: { id: input.partnerId } });
      if (!partner) throw new TRPCError({ code: "NOT_FOUND", message: "Partner not found." });
      await assertCanWrite(ctx.user, partner.projectId);

      const finalCatalogId = input.catalogMaterialId || input.materialCatalogId || null;

      const supply = await db.partnerSupply.create({
        data: {
          partnerId: input.partnerId,
          catalogMaterialId: finalCatalogId,
          materialName: input.materialName,
          brand: input.brand || null,
          specType: input.specType || null,
          unit: input.unit,
          exFactoryRate: input.exFactoryRate,
          transportRate: input.transportRate,
          notes: input.notes || null,
        },
      });
      return { supply };
    }),

  /** Vendor performance scoring — computes delivery, quality, and overall scores. */
  performanceScore: protectedProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ ctx, input }) => {
      await assertProjectMember(ctx.user, input.projectId);

      const partners = await db.partner.findMany({
        where: { projectId: input.projectId },
        include: {
          purchaseOrders: {
            select: {
              id: true,
              number: true,
              orderDate: true,
              expectedDate: true,
              totalAmount: true,
              status: true,
            },
          },
          supplies: {
            select: { materialName: true },
          },
        },
      });

      const partnerIds = partners.map(p => p.id);
      const transactions = partnerIds.length > 0
        ? await db.materialTransaction.findMany({
            where: { projectId: input.projectId },
            select: {
              id: true,
              materialId: true,
              purchaseOrderId: true,
              date: true,
              quantity: true,
              rate: true,
            },
          })
        : [];

      const poIdToPartnerId = new Map<string, string>();
      for (const partner of partners) {
        for (const po of partner.purchaseOrders) {
          poIdToPartnerId.set(po.id, partner.id);
        }
      }

      const scoredPartners = partners.map(partner => {
        const totalOrders = partner.purchaseOrders.length;
        const totalValue = partner.purchaseOrders.reduce((s, po) => s + po.totalAmount, 0);

        const partnerTransactions = transactions.filter(t =>
          t.purchaseOrderId && poIdToPartnerId.get(t.purchaseOrderId) === partner.id
        );

        let onTimeCount = 0;
        let deliveryCount = 0;
        for (const po of partner.purchaseOrders) {
          if (!po.expectedDate) continue;
          deliveryCount += 1;
          const receivedTxn = partnerTransactions.find(t => t.purchaseOrderId === po.id);
          if (receivedTxn) {
            if (new Date(receivedTxn.date) <= new Date(po.expectedDate)) {
              onTimeCount += 1;
            }
          } else if (po.status === "received" || po.status === "partially_received") {
            onTimeCount += 1;
          }
        }

        const deliveryScore = deliveryCount > 0
          ? Math.round((onTimeCount / deliveryCount) * 100)
          : 50;

        const qualityScore = partnerTransactions.length > 0 ? 85 : 50;

        const priceScore = totalOrders > 0 ? Math.min(100, 60 + Math.min(40, totalOrders * 5)) : 30;

        const responsivenessScore = partner.rating > 0
          ? Math.round(partner.rating * 20)
          : 50;

        const overall = Math.round(
          deliveryScore * 0.35 +
          qualityScore * 0.25 +
          priceScore * 0.2 +
          responsivenessScore * 0.2
        );

        return {
          id: partner.id,
          name: partner.name,
          code: partner.code,
          type: partner.type,
          totalOrders,
          totalValue: Math.round(totalValue),
          deliveryScore,
          qualityScore,
          priceScore,
          responsivenessScore,
          overall,
          rating: partner.rating,
          supplyCount: partner.supplies.length,
          overallLabel: overall >= 80 ? "Excellent" : overall >= 60 ? "Good" : overall >= 40 ? "Average" : "Poor",
        };
      });

      return {
        vendors: scoredPartners.sort((a, b) => b.overall - a.overall),
        summary: {
          total: scoredPartners.length,
          excellent: scoredPartners.filter(v => v.overall >= 80).length,
          good: scoredPartners.filter(v => v.overall >= 60 && v.overall < 80).length,
          average: scoredPartners.filter(v => v.overall >= 40 && v.overall < 60).length,
          poor: scoredPartners.filter(v => v.overall < 40).length,
        },
      };
    }),

  /** Delete a partner supply item. */
  deletePartnerSupply: protectedProcedure
    .input(z.object({ supplyId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const supply = await db.partnerSupply.findUnique({ where: { id: input.supplyId }, include: { partner: true } });
      if (!supply) throw new TRPCError({ code: "NOT_FOUND", message: "Supply item not found." });
      await assertCanWrite(ctx.user, supply.partner.projectId);

      await db.partnerSupply.delete({ where: { id: input.supplyId } });
      return { ok: true };
    }),
});
