import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure } from "@/server/trpc";
import { db } from "@/lib/db";
import { assertProjectMember, assertCanWrite, getProjectRole } from "@/lib/authz";
import { transitionEntityState } from "@/server/utils/state-machine";

/**
 * Idempotent equipment status cascade: flips the machine to the target
 * operating state via the engine graph, but skips the write when it is
 * already there (the equipment graph has no self-loops by design — a
 * no-op flip must not consume a CAS claim or stamp a duplicate date).
 */
async function setEquipmentStatus(
  tx: Parameters<typeof transitionEntityState>[0],
  equipmentId: string,
  targetState: "active" | "maintenance" | "breakdown" | "idle",
  userId: string,
  userName?: string
) {
  const eq = await tx.equipment.findUnique({
    where: { id: equipmentId },
    select: { id: true, status: true, projectId: true },
  });
  if (!eq || eq.status === targetState) return;
  await transitionEntityState(tx, {
    model: "equipment",
    id: eq.id,
    targetState,
    userId,
    userName,
    projectId: eq.projectId,
    skipEventEmit: true, // routine operating-state sync, no notification
  });
}

export const CreateEquipmentSchema = z.object({
  projectId: z.string(),
  name: z.string().min(1).max(200),
  code: z.string().optional(),
  type: z.string().optional(),
  model: z.string().optional(),
  serialNumber: z.string().optional(),
  capacity: z.string().optional(),
  unit: z.string().default("hrs"), // hrs | km | trips | days
  status: z.string().default("active"),
  fuelRate: z.number().min(0).default(0),
  factoryFuelRate: z.number().min(0).default(0),
});

export const UpdateEquipmentSchema = z.object({
  itemId: z.string(),
  name: z.string().optional(),
  code: z.string().nullable().optional(),
  type: z.string().nullable().optional(),
  model: z.string().nullable().optional(),
  serialNumber: z.string().nullable().optional(),
  capacity: z.string().nullable().optional(),
  unit: z.string().optional(),
  status: z.string().optional(),
  fuelRate: z.number().optional(),
  factoryFuelRate: z.number().optional(),
});

const LogSchema = z.object({
  projectId: z.string(),
  equipmentId: z.string().min(1),
  date: z.string().datetime().optional(),
  startHours: z.number().nonnegative().default(0),
  endHours: z.number().nonnegative().default(0),
  workedHours: z.number().nonnegative().optional(),
  fuelFilled: z.number().nonnegative().default(0),
  workDescription: z.string().optional().nullable(),
  operator: z.string().optional().nullable(),
  logMode: z.enum(["meter", "odometer", "direct"]).default("meter"),
  ganttTaskId: z.string().optional().nullable(),
  boqItemId: z.string().optional().nullable(),
  outputQty: z.number().optional().nullable(),
  outputUnit: z.string().optional().nullable(),
  tripCount: z.number().int().optional().nullable(),
});

const MaintenanceSchema = z.object({
  projectId: z.string(),
  equipmentId: z.string().min(1),
  type: z.enum(["routine", "repair", "inspection"]),
  description: z.string().min(1),
  cost: z.number().nonnegative().default(0),
  nextDueHours: z.number().optional().nullable(),
  status: z.enum(["pending", "resolved"]).default("pending"),
});

const ResolveSchema = z.object({
  projectId: z.string(),
  maintId: z.string(),
  resolvedNotes: z.string().min(1),
  cost: z.number().nonnegative(),
});

export const equipmentCoreProcedures = {
  list: protectedProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ ctx, input }) => {
      await assertProjectMember(ctx.user, input.projectId);
      const equipment = await db.equipment.findMany({
        where: { projectId: input.projectId },
        orderBy: { name: "asc" },
        include: {
          _count: { select: { logs: true, maintenance: true } },
          logs: {
            orderBy: { date: "desc" },
            take: 1,
            select: { endHours: true, date: true },
          },
          maintenance: {
            where: { nextDueHours: { not: null } },
            orderBy: { date: "desc" },
            take: 1,
            select: { nextDueHours: true, description: true, type: true, status: true },
          },
        },
      });

      const formatted = equipment.map((e) => {
        const currentMeter = e.logs[0]?.endHours || 0;
        const upcomingMaint = e.maintenance[0];
        const nextDueHours = upcomingMaint?.nextDueHours || null;
        const hoursUntilService = nextDueHours !== null ? nextDueHours - currentMeter : null;
        const isServiceDue = hoursUntilService !== null && hoursUntilService <= 25;
        const isServiceOverdue = hoursUntilService !== null && hoursUntilService < 0;

        return {
          id: e.id,
          projectId: e.projectId,
          name: e.name,
          code: e.code,
          type: e.type,
          model: e.model,
          serialNumber: e.serialNumber,
          capacity: e.capacity,
          unit: e.unit,
          status: e.status,
          fuelRate: e.fuelRate,
          factoryFuelRate: e.factoryFuelRate,
          createdAt: e.createdAt,
          updatedAt: e.updatedAt,
          _count: e._count,
          currentMeter,
          nextDueHours,
          hoursUntilService: hoursUntilService !== null ? Math.round(hoursUntilService * 10) / 10 : null,
          isServiceDue,
          isServiceOverdue,
          dueServiceDescription: upcomingMaint?.description || null,
        };
      });

      return { equipment: formatted };
    }),

  create: protectedProcedure
    .input(CreateEquipmentSchema)
    .mutation(async ({ ctx, input }) => {
      const { projectId, ...data } = input;
      await assertCanWrite(ctx.user, projectId);
      const item = await db.equipment.create({ data: { projectId, ...data } });
      return { equipment: item };
    }),

  update: protectedProcedure
    .input(UpdateEquipmentSchema)
    .mutation(async ({ ctx, input }) => {
      const { itemId, ...data } = input;
      const item = await db.equipment.findUnique({ where: { id: itemId }, select: { projectId: true } });
      if (!item) throw new TRPCError({ code: "NOT_FOUND", message: "Equipment not found." });
      await assertCanWrite(ctx.user, item.projectId);

      const updated = await db.equipment.update({ where: { id: itemId }, data });
      return { equipment: updated };
    }),

  updateStatus: protectedProcedure
    .input(z.object({
      projectId: z.string(),
      equipId: z.string(),
      status: z.enum(["active", "maintenance", "breakdown", "idle"]),
    }))
    .mutation(async ({ ctx, input }) => {
      await assertCanWrite(ctx.user, input.projectId);
      const equip = await db.equipment.findFirst({
        where: { id: input.equipId, projectId: input.projectId },
      });
      if (!equip) throw new TRPCError({ code: "NOT_FOUND", message: "Equipment not found." });

      const updated = await db.equipment.update({
        where: { id: input.equipId },
        data: { status: input.status },
      });
      return { equipment: updated };
    }),

  delete: protectedProcedure
    .input(z.object({ itemId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const item = await db.equipment.findUnique({
        where: { id: input.itemId },
        select: {
          projectId: true,
          name: true,
          _count: { select: { logs: true, maintenance: true, rentals: true } },
        },
      });
      if (!item) throw new TRPCError({ code: "NOT_FOUND", message: "Equipment not found." });
      await assertCanWrite(ctx.user, item.projectId);

      // Protect against accidental loss of historical records
      if (item._count.logs > 0 || item._count.maintenance > 0 || item._count.rentals > 0) {
        const role = await getProjectRole(ctx.user.id, item.projectId);
        if (role !== "project_manager") {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: `Cannot delete machine "${item.name}" with existing run logs (${item._count.logs}) or maintenance records (${item._count.maintenance}). Only a Project Manager can authorize deleting active fleet records.`,
          });
        }
      }

      await db.equipment.delete({ where: { id: input.itemId } });
      return { ok: true };
    }),

  listLogs: protectedProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ ctx, input }) => {
      await assertProjectMember(ctx.user, input.projectId);
      const logs = await db.equipmentLog.findMany({
        where: { projectId: input.projectId },
        include: {
          equipment: { select: { name: true, code: true, type: true, unit: true } },
          ganttTask: { select: { id: true, name: true, code: true } },
          boqItem: { select: { id: true, code: true, description: true, unit: true } },
        },
        orderBy: { date: "desc" },
      });
      return { logs };
    }),

  createLog: protectedProcedure
    .input(LogSchema)
    .mutation(async ({ ctx, input }) => {
      await assertCanWrite(ctx.user, input.projectId);

      const logDate = input.date ? new Date(input.date) : new Date();

      // Calculate actual worked duration / distance
      let calculatedWorkedHours = input.workedHours ?? 0;
      if (input.logMode !== "direct" && input.endHours > input.startHours) {
        calculatedWorkedHours = input.endHours - input.startHours;
      } else if (input.logMode !== "direct" && input.endHours < input.startHours) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "End meter reading cannot be less than start meter reading.",
        });
      }

      // Smart De-duplication & Overlap Prevention Guard
      if (input.logMode !== "direct" && input.startHours > 0 && input.endHours > 0) {
        const startOfDay = new Date(logDate);
        startOfDay.setHours(0, 0, 0, 0);
        const endOfDay = new Date(logDate);
        endOfDay.setHours(23, 59, 59, 999);

        const overlappingLog = await db.equipmentLog.findFirst({
          where: {
            equipmentId: input.equipmentId,
            date: { gte: startOfDay, lte: endOfDay },
            logMode: { not: "direct" },
            OR: [
              {
                startHours: { lte: input.startHours },
                endHours: { gte: input.endHours },
              },
              {
                startHours: { gte: input.startHours, lt: input.endHours },
              },
              {
                endHours: { gt: input.startHours, lte: input.endHours },
              },
            ],
          },
        });

        if (overlappingLog) {
          throw new TRPCError({
            code: "CONFLICT",
            message: `A run log with reading (${overlappingLog.startHours.toFixed(1)} to ${overlappingLog.endHours.toFixed(1)}) has already been recorded for this machine on this date.`,
          });
        }
      }

      const log = await db.equipmentLog.create({
        data: {
          projectId: input.projectId,
          equipmentId: input.equipmentId,
          date: logDate,
          startHours: input.startHours,
          endHours: input.endHours,
          workedHours: calculatedWorkedHours,
          fuelFilled: input.fuelFilled,
          workDescription: input.workDescription || null,
          operator: input.operator || null,
          logMode: input.logMode,
          ganttTaskId: input.ganttTaskId || null,
          boqItemId: input.boqItemId || null,
          outputQty: input.outputQty || null,
          outputUnit: input.outputUnit || null,
          tripCount: input.tripCount || null,
        },
      });

      // Update rolling fuel rate benchmark
      const hist = await db.equipmentLog.aggregate({
        where: { equipmentId: input.equipmentId },
        _sum: { fuelFilled: true, workedHours: true },
      });
      const totalFuel = hist._sum.fuelFilled || 0;
      const totalHours = hist._sum.workedHours || 0;
      const newRate = totalHours > 0 ? totalFuel / totalHours : 0;

      await db.equipment.update({
        where: { id: input.equipmentId },
        data: { fuelRate: newRate },
      });

      return { log };
    }),

  /** Aggregates equipment fleet hours, trips, output volume and cost per Gantt Task / BOQ item */
  getTaskEquipmentStats: protectedProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ ctx, input }) => {
      await assertProjectMember(ctx.user, input.projectId);

      const logs = await db.equipmentLog.findMany({
        where: { projectId: input.projectId },
        include: {
          equipment: { select: { id: true, name: true, code: true, type: true } },
          ganttTask: { select: { id: true, name: true, code: true } },
          boqItem: { select: { id: true, code: true, description: true, unit: true } },
        },
        orderBy: { date: "desc" },
      });

      const taskMap = new Map<string, {
        taskId: string;
        taskName: string;
        taskCode: string | null;
        totalHours: number;
        totalFuel: number;
        totalTrips: number;
        totalOutput: number;
        outputUnit: string | null;
        logCount: number;
        machinesUsed: Set<string>;
      }>();

      for (const log of logs) {
        const key = log.ganttTaskId || (log.boqItemId ? `boq-${log.boqItemId}` : "unassigned");
        const taskName = log.ganttTask?.name || (log.boqItem ? `${log.boqItem.code} - ${log.boqItem.description}` : "General Site Work (Unassigned)");
        const taskCode = log.ganttTask?.code || log.boqItem?.code || null;

        if (!taskMap.has(key)) {
          taskMap.set(key, {
            taskId: key,
            taskName,
            taskCode,
            totalHours: 0,
            totalFuel: 0,
            totalTrips: 0,
            totalOutput: 0,
            outputUnit: log.outputUnit || log.boqItem?.unit || null,
            logCount: 0,
            machinesUsed: new Set<string>(),
          });
        }

        const rec = taskMap.get(key)!;
        rec.totalHours += log.workedHours || 0;
        rec.totalFuel += log.fuelFilled || 0;
        rec.totalTrips += log.tripCount || 0;
        rec.totalOutput += log.outputQty || 0;
        rec.logCount += 1;
        rec.machinesUsed.add(log.equipment.name);
      }

      const taskStats = Array.from(taskMap.values()).map((t) => ({
        ...t,
        machineCount: t.machinesUsed.size,
        machines: Array.from(t.machinesUsed),
        productivityRate: t.totalHours > 0 && t.totalOutput > 0 ? (t.totalOutput / t.totalHours) : null,
      }));

      return {
        taskStats: taskStats.sort((a, b) => b.totalHours - a.totalHours),
      };
    }),

  getEfficiencyStats: protectedProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ ctx, input }) => {
      await assertProjectMember(ctx.user, input.projectId);

      const equipment = await db.equipment.findMany({
        where: { projectId: input.projectId },
        select: { id: true, name: true, code: true, factoryFuelRate: true, fuelRate: true, unit: true },
      });

      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const stats = await Promise.all(
        equipment.map(async (e) => {
          // 30-day logs
          const recentLogs = await db.equipmentLog.aggregate({
            where: {
              equipmentId: e.id,
              date: { gte: thirtyDaysAgo },
            },
            _sum: { fuelFilled: true, workedHours: true },
          });

          const recentFuel = recentLogs._sum.fuelFilled || 0;
          const recentHours = recentLogs._sum.workedHours || 0;
          const currEfficiency = recentHours > 0 ? recentFuel / recentHours : 0;

          // All-time logs
          const allLogs = await db.equipmentLog.aggregate({
            where: { equipmentId: e.id },
            _sum: { fuelFilled: true, workedHours: true },
          });

          const totalFuel = allLogs._sum.fuelFilled || 0;
          const totalHours = allLogs._sum.workedHours || 0;
          const histEfficiency = totalHours > 0 ? totalFuel / totalHours : (e.fuelRate || 0);

          const factoryRate = e.factoryFuelRate || 0;
          const isHighConsumption = factoryRate > 0 && currEfficiency > factoryRate * 1.05;

          return {
            equipmentId: e.id,
            name: e.name,
            code: e.code,
            unit: e.unit,
            factoryFuelRate: factoryRate,
            histEfficiency,
            currEfficiency,
            isHighConsumption,
          };
        })
      );

      return { stats };
    }),

  utilizationReport: protectedProcedure
    .input(z.object({
      projectId: z.string(),
      startDate: z.string(),
      endDate: z.string(),
    }))
    .query(async ({ ctx, input }) => {
      await assertProjectMember(ctx.user, input.projectId);

      const start = new Date(input.startDate);
      const end = new Date(input.endDate);
      end.setHours(23, 59, 59, 999);

      const daysInRange = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / 86400000));
      const availableHoursPerDay = 8;

      const equipment = await db.equipment.findMany({
        where: { projectId: input.projectId },
        select: { id: true, name: true, code: true, type: true, unit: true },
      });

      const logs = await db.equipmentLog.findMany({
        where: {
          projectId: input.projectId,
          date: { gte: start, lte: end },
        },
        select: {
          equipmentId: true,
          workedHours: true,
          fuelFilled: true,
          date: true,
        },
      });

      const equipMap = new Map<string, {
        id: string;
        name: string;
        code: string | null;
        type: string | null;
        unit: string;
        totalHours: number;
        totalFuel: number;
        daysUsed: Set<string>;
      }>();

      for (const e of equipment) {
        equipMap.set(e.id, {
          id: e.id,
          name: e.name,
          code: e.code,
          type: e.type,
          unit: e.unit,
          totalHours: 0,
          totalFuel: 0,
          daysUsed: new Set(),
        });
      }

      for (const log of logs) {
        const rec = equipMap.get(log.equipmentId);
        if (!rec) continue;
        rec.totalHours += log.workedHours || 0;
        rec.totalFuel += log.fuelFilled || 0;
        if (log.date) {
          rec.daysUsed.add(new Date(log.date).toISOString().slice(0, 10));
        }
      }

      const report = Array.from(equipMap.values()).map(e => {
        const daysUsed = e.daysUsed.size;
        const availableHours = daysInRange * availableHoursPerDay;
        const utilizationRate = availableHours > 0 ? Math.round((e.totalHours / availableHours) * 10000) / 100 : 0;
        return {
          id: e.id,
          name: e.name,
          code: e.code,
          type: e.type,
          unit: e.unit,
          totalHours: Math.round(e.totalHours * 100) / 100,
          totalFuel: Math.round(e.totalFuel * 100) / 100,
          daysUsed,
          avgHoursPerDay: daysUsed > 0 ? Math.round((e.totalHours / daysUsed) * 100) / 100 : 0,
          utilizationRate,
          utilizationLevel: utilizationRate > 70 ? "high" : utilizationRate > 40 ? "medium" : "low",
        };
      });

      return {
        report: report.sort((a, b) => b.utilizationRate - a.utilizationRate),
        dateRange: { start: input.startDate, end: input.endDate, daysInRange },
      };
    }),

  listMaintenance: protectedProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ ctx, input }) => {
      await assertProjectMember(ctx.user, input.projectId);
      const maintenance = await db.equipmentMaintenance.findMany({
        where: { projectId: input.projectId },
        include: {
          equipment: { select: { name: true, code: true, type: true } },
        },
        orderBy: { date: "desc" },
      });
      return { maintenance };
    }),

  createMaintenance: protectedProcedure
    .input(MaintenanceSchema)
    .mutation(async ({ ctx, input }) => {
      await assertCanWrite(ctx.user, input.projectId);
      const maint = await db.equipmentMaintenance.create({
        data: {
          projectId: input.projectId,
          equipmentId: input.equipmentId,
          type: input.type,
          description: input.description,
          cost: input.cost,
          nextDueHours: input.nextDueHours,
          status: input.status,
        },
      });

      if (input.type === "repair" && input.status === "pending") {
        // Engine cascade: active/idle/maintenance → breakdown (guarded skip)
        await setEquipmentStatus(db, input.equipmentId, "breakdown", ctx.user.id, ctx.user.name);
      } else if (input.type === "routine" && input.status === "pending") {
        // Engine cascade: active/idle/breakdown → maintenance (guarded skip)
        await setEquipmentStatus(db, input.equipmentId, "maintenance", ctx.user.id, ctx.user.name);
      }

      return { maintenance: maint };
    }),

  resolveMaintenance: protectedProcedure
    .input(ResolveSchema)
    .mutation(async ({ ctx, input }) => {
      await assertCanWrite(ctx.user, input.projectId);
      const maint = await db.equipmentMaintenance.findUnique({
        where: { id: input.maintId },
        select: { equipmentId: true, projectId: true },
      });
      if (!maint) throw new TRPCError({ code: "NOT_FOUND", message: "Maintenance record not found." });
      await assertCanWrite(ctx.user, maint.projectId);

      // Engine transition: pending→resolved, CAS-claimed — resolving an
      // already-resolved work order fails loudly instead of restamping
      // resolvedDate and re-applying cost. resolvedNotes/resolvedDate/
      // resolvedBy are engine-populated from notes + actor; cost rides
      // additionalData.
      const { entity: updated } = await transitionEntityState(db, {
        model: "equipmentMaintenance",
        id: input.maintId,
        targetState: "resolved",
        userId: ctx.user.id,
        userName: ctx.user.name,
        projectId: maint.projectId,
        notes: input.resolvedNotes,
        additionalData: { cost: input.cost },
        skipEventEmit: true, // routine operating-state sync, no notification
      });

      // Back to service once the work order closes (guarded skip)
      await setEquipmentStatus(db, maint.equipmentId, "active", ctx.user.id, ctx.user.name);

      return { maintenance: updated };
    }),
};
