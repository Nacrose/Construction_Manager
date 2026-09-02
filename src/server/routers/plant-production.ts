import { z } from "zod";
import { router, protectedProcedure } from "@/server/trpc";
import { db } from "@/lib/db";
import { TRPCError } from "@trpc/server";
import { assertProjectMember, assertCanWrite, assertProjectAdmin } from "@/lib/authz";
import { paginationInput, pageArgs, pageResult } from "@/lib/pagination";
import { audit } from "@/lib/audit";
import { format } from "date-fns";

const PlantTypeEnum = z.enum(["concrete_batching", "asphalt_hot_mix", "wmm_wet_mix", "crusher"]);
const PlantStatusEnum = z.enum(["active", "maintenance", "idle", "decommissioned"]);
const TicketStatusEnum = z.enum(["dispatched", "in_transit", "delivered", "rejected", "cancelled"]);

export const plantProductionRouter = router({
  /**
   * List all plants for a project with statistics
   */
  listPlants: protectedProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ ctx, input }) => {
      await assertProjectMember(ctx.user, input.projectId);

      const plants = await db.plant.findMany({
        where: { projectId: input.projectId },
        include: {
          equipment: { select: { id: true, name: true, code: true, model: true } },
          _count: {
            select: {
              batchTickets: true,
              mixDesigns: true,
              silos: true,
              dailyLogs: true,
            },
          },
          silos: {
            select: {
              id: true,
              name: true,
              materialType: true,
              capacity: true,
              currentStock: true,
              unit: true,
              minAlertLevel: true,
            },
          },
        },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        take: 500, // plants per project are few; cap is a safety net
      });

      // Fetch today's output per plant
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const todayEnd = new Date();
      todayEnd.setHours(23, 59, 59, 999);

      const todayTickets = await db.plantBatchTicket.groupBy({
        by: ["plantId"],
        where: {
          projectId: input.projectId,
          dispatchDate: { gte: todayStart, lte: todayEnd },
          status: { notIn: ["rejected", "cancelled"] },
        },
        _sum: { dispatchedQty: true },
        _count: { id: true },
      });

      const todayMap = new Map(
        todayTickets.map((t) => [t.plantId, { totalQty: t._sum.dispatchedQty ?? 0, ticketCount: t._count.id }])
      );

      return {
        plants: plants.map((p) => ({
          ...p,
          todayOutput: todayMap.get(p.id)?.totalQty ?? 0,
          todayTickets: todayMap.get(p.id)?.ticketCount ?? 0,
        })),
      };
    }),

  /**
   * Create a new plant with default silos
   */
  createPlant: protectedProcedure
    .input(
      z.object({
        projectId: z.string(),
        name: z.string().min(1),
        code: z.string().optional(),
        type: PlantTypeEnum.default("concrete_batching"),
        makeModel: z.string().optional(),
        capacityValue: z.number().optional(),
        capacityUnit: z.string().default("cum/hr"),
        location: z.string().optional(),
        status: PlantStatusEnum.default("active"),
        equipmentId: z.string().optional(),
        notes: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await assertCanWrite(ctx.user, input.projectId);

      const plant = await db.plant.create({
        data: {
          projectId: input.projectId,
          name: input.name,
          code: input.code,
          type: input.type,
          makeModel: input.makeModel,
          capacityValue: input.capacityValue,
          capacityUnit: input.capacityUnit,
          location: input.location,
          status: input.status,
          equipmentId: input.equipmentId || null,
          notes: input.notes,
        },
      });

      // Auto-populate standard silos based on plant type
      if (input.type === "concrete_batching") {
        await db.plantSilo.createMany({
          data: [
            { plantId: plant.id, name: "Cement Silo 1 (OPC 53)", materialType: "cement", capacity: 100, currentStock: 75, unit: "MT", minAlertLevel: 15 },
            { plantId: plant.id, name: "Cement Silo 2 (PPC)", materialType: "cement", capacity: 60, currentStock: 40, unit: "MT", minAlertLevel: 10 },
            { plantId: plant.id, name: "Sand Bunker (River Sand)", materialType: "sand", capacity: 200, currentStock: 140, unit: "cum", minAlertLevel: 30 },
            { plantId: plant.id, name: "10mm Aggregate Bin", materialType: "aggregate_10mm", capacity: 150, currentStock: 110, unit: "cum", minAlertLevel: 25 },
            { plantId: plant.id, name: "20mm Aggregate Bin", materialType: "aggregate_20mm", capacity: 180, currentStock: 130, unit: "cum", minAlertLevel: 30 },
            { plantId: plant.id, name: "Admixture Storage Tank", materialType: "admixture", capacity: 2000, currentStock: 1500, unit: "liter", minAlertLevel: 300 },
          ],
        });
      } else if (input.type === "asphalt_hot_mix") {
        await db.plantSilo.createMany({
          data: [
            { plantId: plant.id, name: "Bitumen Tank 1 (VG-30)", materialType: "bitumen", capacity: 50, currentStock: 35, unit: "MT", minAlertLevel: 8 },
            { plantId: plant.id, name: "Bitumen Tank 2 (60/70)", materialType: "bitumen", capacity: 50, currentStock: 25, unit: "MT", minAlertLevel: 8 },
            { plantId: plant.id, name: "Filler / Stone Dust Silo", materialType: "filler", capacity: 40, currentStock: 28, unit: "MT", minAlertLevel: 6 },
            { plantId: plant.id, name: "Crushed Sand Bin", materialType: "sand", capacity: 150, currentStock: 95, unit: "cum", minAlertLevel: 20 },
            { plantId: plant.id, name: "10mm Grit Bin", materialType: "aggregate_10mm", capacity: 120, currentStock: 80, unit: "cum", minAlertLevel: 15 },
            { plantId: plant.id, name: "20mm Coarse Bin", materialType: "aggregate_20mm", capacity: 160, currentStock: 110, unit: "cum", minAlertLevel: 25 },
          ],
        });
      } else if (input.type === "wmm_wet_mix") {
        await db.plantSilo.createMany({
          data: [
            { plantId: plant.id, name: "Graded Aggregate 40mm-down", materialType: "aggregate_40mm", capacity: 300, currentStock: 220, unit: "cum", minAlertLevel: 40 },
            { plantId: plant.id, name: "Stone Dust / Filler Bin", materialType: "filler", capacity: 100, currentStock: 70, unit: "cum", minAlertLevel: 15 },
          ],
        });
      }

      await audit({
        userId: ctx.user.id,
        projectId: input.projectId,
        action: "plant.create",
        entityType: "plant",
        entityId: plant.id,
        metadata: { name: plant.name, type: plant.type },
      });

      return { plant };
    }),

  /**
   * Update plant details
   */
  updatePlant: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        name: z.string().min(1).optional(),
        code: z.string().optional(),
        type: PlantTypeEnum.optional(),
        makeModel: z.string().optional(),
        capacityValue: z.number().optional(),
        capacityUnit: z.string().optional(),
        location: z.string().optional(),
        status: PlantStatusEnum.optional(),
        equipmentId: z.string().nullable().optional(),
        notes: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const existing = await db.plant.findUnique({ where: { id: input.id } });
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Plant not found." });

      await assertCanWrite(ctx.user, existing.projectId);

      const plant = await db.plant.update({
        where: { id: input.id },
        data: {
          name: input.name,
          code: input.code,
          type: input.type,
          makeModel: input.makeModel,
          capacityValue: input.capacityValue,
          capacityUnit: input.capacityUnit,
          location: input.location,
          status: input.status,
          equipmentId: input.equipmentId !== undefined ? input.equipmentId : undefined,
          notes: input.notes,
        },
      });

      return { plant };
    }),

  /**
   * Delete plant
   */
  deletePlant: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const existing = await db.plant.findUnique({ where: { id: input.id } });
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Plant not found." });

      await assertProjectAdmin(ctx.user, existing.projectId);

      await db.plant.delete({ where: { id: input.id } });

      await audit({
        userId: ctx.user.id,
        projectId: existing.projectId,
        action: "plant.delete",
        entityType: "plant",
        entityId: input.id,
        metadata: { name: existing.name },
      });

      return { ok: true };
    }),

  /**
   * List Mix Designs (JMF Recipes)
   */
  listMixDesigns: protectedProcedure
    .input(
      z.object({
        projectId: z.string(),
        plantId: z.string().optional(),
        type: z.string().optional(),
        ...paginationInput,
      })
    )
    .query(async ({ ctx, input }) => {
      await assertProjectMember(ctx.user, input.projectId);

      const where: any = { projectId: input.projectId };
      if (input.plantId) where.plantId = input.plantId;
      if (input.type) where.type = input.type;

      const page = pageArgs(input, "code", "asc");
      const rows = await db.plantMixDesign.findMany({
        where,
        include: {
          plant: { select: { id: true, name: true, type: true } },
          boqItem: { select: { id: true, code: true, description: true } },
          _count: { select: { batchTickets: true } },
        },
        orderBy: page.orderBy,
        take: page.take,
        ...(page.cursor ? { cursor: page.cursor, skip: page.skip } : {}),
      });
      const { items, hasMore, nextCursor } = pageResult(rows, input);

      return {
        hasMore,
        nextCursor,
        mixDesigns: items.map((m) => {
          let parsedIngredients: any[] = [];
          if (m.ingredients) {
            try {
              parsedIngredients = JSON.parse(m.ingredients);
            } catch {}
          }
          return {
            ...m,
            ingredientsList: parsedIngredients,
          };
        }),
      };
    }),

  /**
   * Create or Update Mix Design
   */
  createMixDesign: protectedProcedure
    .input(
      z.object({
        projectId: z.string(),
        plantId: z.string(),
        code: z.string().min(1),
        name: z.string().min(1),
        type: z.string().default("concrete"),
        targetSlumpMm: z.number().optional(),
        targetTempC: z.number().optional(),
        waterCementRatio: z.number().optional(),
        bitumenContentPct: z.number().optional(),
        unit: z.string().default("cum"),
        status: z.string().default("approved"),
        boqItemId: z.string().optional(),
        ingredients: z.string().optional(),
        notes: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await assertCanWrite(ctx.user, input.projectId);

      const mix = await db.plantMixDesign.create({
        data: {
          projectId: input.projectId,
          plantId: input.plantId,
          code: input.code,
          name: input.name,
          type: input.type,
          targetSlumpMm: input.targetSlumpMm,
          targetTempC: input.targetTempC,
          waterCementRatio: input.waterCementRatio,
          bitumenContentPct: input.bitumenContentPct,
          unit: input.unit,
          status: input.status,
          boqItemId: input.boqItemId || null,
          ingredients: input.ingredients,
          notes: input.notes,
        },
      });

      return { mix };
    }),

  updateMixDesign: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        code: z.string().optional(),
        name: z.string().optional(),
        type: z.string().optional(),
        targetSlumpMm: z.number().optional(),
        targetTempC: z.number().optional(),
        waterCementRatio: z.number().optional(),
        bitumenContentPct: z.number().optional(),
        unit: z.string().optional(),
        status: z.string().optional(),
        boqItemId: z.string().nullable().optional(),
        ingredients: z.string().optional(),
        notes: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const existing = await db.plantMixDesign.findUnique({ where: { id: input.id } });
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Mix design not found." });

      await assertCanWrite(ctx.user, existing.projectId);

      const mix = await db.plantMixDesign.update({
        where: { id: input.id },
        data: {
          code: input.code,
          name: input.name,
          type: input.type,
          targetSlumpMm: input.targetSlumpMm,
          targetTempC: input.targetTempC,
          waterCementRatio: input.waterCementRatio,
          bitumenContentPct: input.bitumenContentPct,
          unit: input.unit,
          status: input.status,
          boqItemId: input.boqItemId !== undefined ? input.boqItemId : undefined,
          ingredients: input.ingredients,
          notes: input.notes,
        },
      });

      return { mix };
    }),

  deleteMixDesign: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const existing = await db.plantMixDesign.findUnique({ where: { id: input.id } });
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Mix design not found." });

      await assertCanWrite(ctx.user, existing.projectId);
      await db.plantMixDesign.delete({ where: { id: input.id } });
      return { ok: true };
    }),

  /**
   * List Batch & Dispatch Tickets (Chalan)
   */
  listBatchTickets: protectedProcedure
    .input(
      z.object({
        projectId: z.string(),
        plantId: z.string().optional(),
        date: z.string().optional(),
        status: z.string().optional(),
        q: z.string().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      await assertProjectMember(ctx.user, input.projectId);

      const where: any = { projectId: input.projectId };
      if (input.plantId) where.plantId = input.plantId;
      if (input.status && input.status !== "all") where.status = input.status;

      if (input.date) {
        const d = new Date(input.date);
        const start = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0);
        const end = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59);
        where.dispatchDate = { gte: start, lte: end };
      }

      if (input.q) {
        where.OR = [
          { ticketNumber: { contains: input.q, mode: "insensitive" } },
          { transitVehicleNo: { contains: input.q, mode: "insensitive" } },
          { driverName: { contains: input.q, mode: "insensitive" } },
          { siteLocation: { contains: input.q, mode: "insensitive" } },
          { targetStructure: { contains: input.q, mode: "insensitive" } },
        ];
      }

      const tickets = await db.plantBatchTicket.findMany({
        where,
        include: {
          plant: { select: { id: true, name: true, type: true, code: true } },
          mixDesign: { select: { id: true, code: true, name: true, type: true, targetSlumpMm: true, targetTempC: true } },
          rfi: { select: { id: true, number: true, subject: true } },
        },
        orderBy: { dispatchDate: "desc" },
        take: 100,
      });

      return { tickets };
    }),

  /**
   * Create a new Batch Ticket (Chalan dispatch)
   */
  createBatchTicket: protectedProcedure
    .input(
      z.object({
        projectId: z.string(),
        plantId: z.string(),
        mixDesignId: z.string().optional(),
        ticketNumber: z.string().optional(),
        dispatchDate: z.string().optional(),
        transitVehicleNo: z.string().min(1),
        driverName: z.string().optional(),
        driverPhone: z.string().optional(),
        orderedQty: z.number().default(0),
        dispatchedQty: z.number().min(0.01),
        receivedQty: z.number().optional(),
        unit: z.string().default("cum"),
        slumpMm: z.number().optional(),
        temperatureC: z.number().optional(),
        siteLocation: z.string().optional(),
        targetStructure: z.string().optional(),
        rfiId: z.string().optional(),
        dailyReportId: z.string().optional(),
        status: TicketStatusEnum.default("dispatched"),
        remarks: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await assertCanWrite(ctx.user, input.projectId);

      const dispatchDateTime = input.dispatchDate ? new Date(input.dispatchDate) : new Date();

      // Auto-generate ticket number if missing
      let ticketNum = input.ticketNumber;
      if (!ticketNum) {
        const datePrefix = format(dispatchDateTime, "yyyyMMdd");
        const count = await db.plantBatchTicket.count({
          where: {
            projectId: input.projectId,
            dispatchDate: {
              gte: new Date(dispatchDateTime.getFullYear(), dispatchDateTime.getMonth(), dispatchDateTime.getDate(), 0, 0, 0),
              lte: new Date(dispatchDateTime.getFullYear(), dispatchDateTime.getMonth(), dispatchDateTime.getDate(), 23, 59, 59),
            },
          },
        });
        let nextTicketIndex = count + 1;
        ticketNum = `BT-${datePrefix}-${String(nextTicketIndex).padStart(3, "0")}`;
        while (await db.plantBatchTicket.findFirst({ where: { projectId: input.projectId, ticketNumber: ticketNum } })) {
          nextTicketIndex++;
          ticketNum = `BT-${datePrefix}-${String(nextTicketIndex).padStart(3, "0")}`;
        }
      }

      const ticket = await db.plantBatchTicket.create({
        data: {
          projectId: input.projectId,
          plantId: input.plantId,
          mixDesignId: input.mixDesignId || null,
          ticketNumber: ticketNum,
          dispatchDate: dispatchDateTime,
          transitVehicleNo: input.transitVehicleNo,
          driverName: input.driverName,
          driverPhone: input.driverPhone,
          orderedQty: input.orderedQty || input.dispatchedQty,
          dispatchedQty: input.dispatchedQty,
          receivedQty: input.receivedQty !== undefined ? input.receivedQty : input.dispatchedQty,
          unit: input.unit,
          slumpMm: input.slumpMm,
          temperatureC: input.temperatureC,
          siteLocation: input.siteLocation,
          targetStructure: input.targetStructure,
          rfiId: input.rfiId || null,
          dailyReportId: input.dailyReportId || null,
          status: input.status,
          remarks: input.remarks,
          createdById: ctx.user.id,
        },
      });

      // Optionally deduct theoretical ingredients from Silos if mix design is linked
      if (input.mixDesignId) {
        const mix = await db.plantMixDesign.findUnique({
          where: { id: input.mixDesignId },
        });
        if (mix?.ingredients) {
          try {
            const ingList = JSON.parse(mix.ingredients);
            const silos = await db.plantSilo.findMany({ where: { plantId: input.plantId } });
            for (const ing of ingList) {
              const dosage = (Number(ing.dosagePerUnit) || 0) * input.dispatchedQty;
              if (dosage <= 0) continue;
              // Find matching silo by materialType or name
              const targetSilo = silos.find(
                (s) =>
                  s.materialType === ing.type ||
                  s.name.toLowerCase().includes(ing.name.toLowerCase()) ||
                  ing.name.toLowerCase().includes(s.materialType.toLowerCase())
              );
              if (targetSilo) {
                const deduction = ing.unit === "kg" && targetSilo.unit === "MT" ? dosage / 1000 : dosage;
                const newStock = Math.max(0, targetSilo.currentStock - deduction);
                await db.plantSilo.update({
                  where: { id: targetSilo.id },
                  data: { currentStock: Math.round(newStock * 100) / 100 },
                });
              }
            }
          } catch {}
        }
      }

      await audit({
        userId: ctx.user.id,
        projectId: input.projectId,
        action: "plant.batch_ticket.create",
        entityType: "batch_ticket",
        entityId: ticket.id,
        metadata: { ticketNumber: ticket.ticketNumber, qty: ticket.dispatchedQty },
      });

      return { ticket };
    }),

  /**
   * Update Batch Ticket Status (e.g. In Transit -> Delivered / Rejected)
   */
  updateBatchTicket: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        status: TicketStatusEnum.optional(),
        receivedQty: z.number().optional(),
        slumpMm: z.number().optional(),
        temperatureC: z.number().optional(),
        rejectionReason: z.string().optional(),
        remarks: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const existing = await db.plantBatchTicket.findUnique({ where: { id: input.id } });
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Ticket not found." });

      await assertCanWrite(ctx.user, existing.projectId);

      const ticket = await db.plantBatchTicket.update({
        where: { id: input.id },
        data: {
          status: input.status,
          receivedQty: input.receivedQty,
          slumpMm: input.slumpMm,
          temperatureC: input.temperatureC,
          rejectionReason: input.rejectionReason,
          remarks: input.remarks,
        },
      });

      return { ticket };
    }),

  /**
   * Delete Batch Ticket
   */
  deleteBatchTicket: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const existing = await db.plantBatchTicket.findUnique({ where: { id: input.id } });
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Ticket not found." });

      await assertCanWrite(ctx.user, existing.projectId);
      await db.plantBatchTicket.delete({ where: { id: input.id } });
      return { ok: true };
    }),

  /**
   * List Silos for a plant
   */
  listSilos: protectedProcedure
    .input(z.object({ plantId: z.string() }))
    .query(async ({ ctx, input }) => {
      const plant = await db.plant.findUnique({ where: { id: input.plantId } });
      if (!plant) throw new TRPCError({ code: "NOT_FOUND", message: "Plant not found." });

      await assertProjectMember(ctx.user, plant.projectId);

      const silos = await db.plantSilo.findMany({
        where: { plantId: input.plantId },
        orderBy: { name: "asc" },
      });

      return { silos };
    }),

  /**
   * Update Silo or record manual stock/dip level
   */
  updateSiloStock: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        currentStock: z.number().min(0),
        lastDipValue: z.number().optional(),
        lastDipDate: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const existing = await db.plantSilo.findUnique({
        where: { id: input.id },
        include: { plant: true },
      });
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Silo not found." });

      await assertCanWrite(ctx.user, existing.plant.projectId);

      const silo = await db.plantSilo.update({
        where: { id: input.id },
        data: {
          currentStock: input.currentStock,
          lastDipValue: input.lastDipValue !== undefined ? input.lastDipValue : input.currentStock,
          lastDipDate: input.lastDipDate ? new Date(input.lastDipDate) : new Date(),
        },
      });

      return { silo };
    }),

  /**
   * List and Upsert Daily Plant Operations Logs
   */
  listDailyLogs: protectedProcedure
    .input(
      z.object({
        projectId: z.string(),
        plantId: z.string().optional(),
        limit: z.number().default(30),
      })
    )
    .query(async ({ ctx, input }) => {
      await assertProjectMember(ctx.user, input.projectId);

      const where: any = { projectId: input.projectId };
      if (input.plantId) where.plantId = input.plantId;

      const logs = await db.plantDailyLog.findMany({
        where,
        include: { plant: { select: { id: true, name: true, type: true } } },
        orderBy: { logDate: "desc" },
        take: input.limit,
      });

      return { logs };
    }),

  upsertDailyLog: protectedProcedure
    .input(
      z.object({
        projectId: z.string(),
        plantId: z.string(),
        logDate: z.string(),
        totalBatches: z.number().default(0),
        totalProduced: z.number().default(0),
        unit: z.string().default("cum"),
        operatingHours: z.number().default(0),
        idleHours: z.number().default(0),
        breakdownHours: z.number().default(0),
        electricityUnitsKwh: z.number().optional(),
        dieselLitres: z.number().optional(),
        downtimeReason: z.string().optional(),
        operatorName: z.string().optional(),
        remarks: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await assertCanWrite(ctx.user, input.projectId);

      const logDateObj = new Date(input.logDate);
      logDateObj.setHours(0, 0, 0, 0);

      const log = await db.plantDailyLog.upsert({
        where: {
          plantId_logDate: {
            plantId: input.plantId,
            logDate: logDateObj,
          },
        },
        create: {
          projectId: input.projectId,
          plantId: input.plantId,
          logDate: logDateObj,
          totalBatches: input.totalBatches,
          totalProduced: input.totalProduced,
          unit: input.unit,
          operatingHours: input.operatingHours,
          idleHours: input.idleHours,
          breakdownHours: input.breakdownHours,
          electricityUnitsKwh: input.electricityUnitsKwh,
          dieselLitres: input.dieselLitres,
          downtimeReason: input.downtimeReason,
          operatorName: input.operatorName,
          remarks: input.remarks,
        },
        update: {
          totalBatches: input.totalBatches,
          totalProduced: input.totalProduced,
          unit: input.unit,
          operatingHours: input.operatingHours,
          idleHours: input.idleHours,
          breakdownHours: input.breakdownHours,
          electricityUnitsKwh: input.electricityUnitsKwh,
          dieselLitres: input.dieselLitres,
          downtimeReason: input.downtimeReason,
          operatorName: input.operatorName,
          remarks: input.remarks,
        },
      });

      return { log };
    }),

  /**
   * Analytics: High-level KPI Summary for Plant Operations
   */
  getProductionSummary: protectedProcedure
    .input(
      z.object({
        projectId: z.string(),
        date: z.string().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      await assertProjectMember(ctx.user, input.projectId);

      const d = input.date ? new Date(input.date) : new Date();
      const startOfDay = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0);
      const endOfDay = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59);

      // 1. Total Plants
      const plants = await db.plant.findMany({
        where: { projectId: input.projectId },
        select: { id: true, name: true, type: true, status: true, capacityValue: true, capacityUnit: true },
      });

      // 2. Today's Tickets
      const todayTickets = await db.plantBatchTicket.findMany({
        where: {
          projectId: input.projectId,
          dispatchDate: { gte: startOfDay, lte: endOfDay },
        },
        include: {
          mixDesign: { select: { code: true, name: true, type: true } },
          plant: { select: { name: true, type: true } },
        },
      });

      let concreteToday = 0;
      let asphaltToday = 0;
      let wmmToday = 0;
      let inTransitCount = 0;

      const mixBreakdown: Record<string, { code: string; qty: number; unit: string; count: number }> = {};

      for (const t of todayTickets) {
        if (t.status === "rejected" || t.status === "cancelled") continue;
        if (t.status === "in_transit" || t.status === "dispatched") inTransitCount++;

        const qty = t.dispatchedQty || 0;
        const pType = t.plant?.type;

        if (pType === "concrete_batching" || t.unit === "cum") concreteToday += qty;
        else if (pType === "asphalt_hot_mix" || t.unit === "ton") asphaltToday += qty;
        else if (pType === "wmm_wet_mix") wmmToday += qty;

        const mixCode = t.mixDesign?.code || "Standard / General";
        if (!mixBreakdown[mixCode]) {
          mixBreakdown[mixCode] = { code: mixCode, qty: 0, unit: t.unit, count: 0 };
        }
        mixBreakdown[mixCode].qty += qty;
        mixBreakdown[mixCode].count += 1;
      }

      // 3. Cumulative Production All Time
      const cumulativeConcrete = await db.plantBatchTicket.aggregate({
        where: {
          projectId: input.projectId,
          plant: { type: "concrete_batching" },
          status: { notIn: ["rejected", "cancelled"] },
        },
        _sum: { dispatchedQty: true },
        _count: { id: true },
      });

      const cumulativeAsphalt = await db.plantBatchTicket.aggregate({
        where: {
          projectId: input.projectId,
          plant: { type: "asphalt_hot_mix" },
          status: { notIn: ["rejected", "cancelled"] },
        },
        _sum: { dispatchedQty: true },
        _count: { id: true },
      });

      // 4. Low Stock Silos Alert
      const lowStockSilos = await db.plantSilo.findMany({
        where: {
          plant: { projectId: input.projectId },
          minAlertLevel: { not: null },
        },
        include: { plant: { select: { name: true } } },
      });

      const activeAlerts = lowStockSilos.filter(
        (s) => s.minAlertLevel !== null && s.currentStock <= s.minAlertLevel
      );

      return {
        activePlantsCount: plants.filter((p) => p.status === "active").length,
        totalPlantsCount: plants.length,
        concreteToday: Math.round(concreteToday * 100) / 100,
        asphaltToday: Math.round(asphaltToday * 100) / 100,
        wmmToday: Math.round(wmmToday * 100) / 100,
        inTransitCount,
        todayTotalTickets: todayTickets.length,
        cumulativeConcrete: Math.round((cumulativeConcrete._sum.dispatchedQty ?? 0) * 100) / 100,
        cumulativeAsphalt: Math.round((cumulativeAsphalt._sum.dispatchedQty ?? 0) * 100) / 100,
        mixBreakdown: Object.values(mixBreakdown),
        lowStockAlerts: activeAlerts.map((s) => ({
          siloId: s.id,
          siloName: s.name,
          plantName: s.plant.name,
          currentStock: s.currentStock,
          minAlert: s.minAlertLevel,
          unit: s.unit,
        })),
      };
    }),
});
