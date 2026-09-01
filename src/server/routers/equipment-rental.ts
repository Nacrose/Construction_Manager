import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure } from "@/server/trpc";
import { db } from "@/lib/db";
import { assertProjectMember, assertCanWrite } from "@/lib/authz";
import { assertNotLocked } from "@/lib/fiscal-year-lock";
import { transitionEntityState } from "@/server/utils/state-machine";

/**
 * Idempotent equipment operating-state cascade (see equipment-core).
 * Skips the write when the machine is already in the target state —
 * the equipment graph has no self-loops by design.
 */
async function setEquipmentStatus(
  equipmentId: string,
  targetState: "active" | "maintenance" | "breakdown" | "idle",
  userId: string,
  userName?: string
) {
  const eq = await db.equipment.findUnique({
    where: { id: equipmentId },
    select: { id: true, status: true, projectId: true },
  });
  if (!eq || eq.status === targetState) return;
  await transitionEntityState(db, {
    model: "equipment",
    id: eq.id,
    targetState,
    userId,
    userName,
    projectId: eq.projectId,
    skipEventEmit: true, // routine operating-state sync, no notification
  });
}

export const equipmentRentalProcedures = {
  listRentals: protectedProcedure
    .input(z.object({
      projectId: z.string(),
      status: z.string().optional(),
    }))
    .query(async ({ ctx, input }) => {
      await assertProjectMember(ctx.user, input.projectId);

      const where: any = { projectId: input.projectId };
      if (input.status) where.status = input.status;

      const rentals = await db.equipmentRental.findMany({
        where,
        include: {
          equipment: { select: { id: true, name: true, code: true, type: true, model: true } },
          crew: { where: { endDate: null }, orderBy: { role: "asc" } },
        },
        orderBy: { startDate: "desc" },
      });

      const now = new Date();
      const rentalsWithCalc = rentals.map(r => {
        const start = new Date(r.startDate);
        let end: Date;

        if (r.status === "returned" && r.actualReturnDate) {
          end = new Date(r.actualReturnDate);
        } else if (r.status === "stored_on_site" && r.storedFromDate) {
          end = new Date(r.storedFromDate);
        } else {
          end = now;
        }

        const billableDays = Math.max(0, Math.round((end.getTime() - start.getTime()) / 86400000));
        const machineCost = billableDays * r.rentalRate;

        let crewDailyCost = 0;
        let crewDailyCostVendor = 0;
        for (const c of r.crew) {
          const salaryDaily = c.salaryType === "daily" ? c.salaryRate
            : c.salaryType === "monthly" ? c.salaryRate / 30
            : c.salaryType === "hourly" ? c.salaryRate * 8
            : 0;
          if (c.salaryPaidBy === "project") crewDailyCost += salaryDaily;
          else crewDailyCostVendor += salaryDaily;

          const allowanceDaily = c.allowanceType === "daily" ? c.allowanceRate
            : c.allowanceType === "monthly" ? c.allowanceRate / 30
            : 0;
          if (c.allowancePaidBy === "project") crewDailyCost += allowanceDaily;
          else crewDailyCostVendor += allowanceDaily;

          const lodgingDaily = c.lodgingType === "monthly_reimburse" ? c.lodgingRate / 30
            : c.lodgingType === "per_diem" ? c.lodgingRate
            : 0;
          if (c.lodgingPaidBy === "project") crewDailyCost += lodgingDaily;
          else crewDailyCostVendor += lodgingDaily;

          const foodingDaily = c.foodingType === "daily_allowance" ? c.foodingRate : 0;
          if (c.foodingPaidBy === "project") crewDailyCost += foodingDaily;
          else crewDailyCostVendor += foodingDaily;
        }

        const totalProjectCost = machineCost + (crewDailyCost * billableDays);
        const totalDailyRate = r.rentalRate + crewDailyCost;

        let daysStored = 0;
        if (r.status === "stored_on_site" && r.storedFromDate) {
          daysStored = Math.round((now.getTime() - new Date(r.storedFromDate).getTime()) / 86400000);
        }

        let daysOverdue = 0;
        if (r.scheduledEndDate && r.status !== "returned" && new Date(r.scheduledEndDate) < now) {
          daysOverdue = Math.round((now.getTime() - new Date(r.scheduledEndDate).getTime()) / 86400000);
        }

        return {
          ...r,
          billableDays,
          machineCost,
          crewDailyCost,
          crewDailyCostVendor,
          totalProjectCost,
          totalDailyRate,
          daysStored,
          daysOverdue,
          isCurrentlyAccruing: r.status === "active",
        };
      });

      return { rentals: rentalsWithCalc };
    }),

  createRental: protectedProcedure
    .input(z.object({
      equipmentId: z.string(),
      projectId: z.string(),
      isExternal: z.boolean().default(false),
      vendorId: z.string().optional(),
      vendorName: z.string().optional(),
      vendorPhone: z.string().optional(),
      rentalType: z.enum(["daily", "hourly", "monthly", "lump_sum"]).default("daily"),
      rentalRate: z.number().min(0).default(0),
      startDate: z.string().datetime().optional(),
      scheduledEndDate: z.string().datetime().optional(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await assertCanWrite(ctx.user, input.projectId);
      await assertNotLocked(ctx.user.organizationId, input.startDate ? new Date(input.startDate) : new Date());

      // Cross-project guard: the equipment must belong to the rental's
      // project — without this, a caller with write access to project A
      // could rent (and flip the status of) equipment belonging to
      // project B.
      const equipment = await db.equipment.findFirst({
        where: { id: input.equipmentId, projectId: input.projectId },
        select: { id: true },
      });
      if (!equipment) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Equipment not found in this project." });
      }

      const existing = await db.equipmentRental.findFirst({
        where: {
          equipmentId: input.equipmentId,
          projectId: input.projectId,
          status: { in: ["active", "stored_on_site"] },
        },
      });
      if (existing) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Equipment already has an active rental on this project. Return it first.",
        });
      }

      const rental = await db.equipmentRental.create({
        data: {
          equipmentId: input.equipmentId,
          projectId: input.projectId,
          isExternal: input.isExternal,
          vendorId: input.vendorId || null,
          vendorName: input.vendorName || null,
          vendorPhone: input.vendorPhone || null,
          rentalType: input.rentalType,
          rentalRate: input.rentalRate,
          startDate: input.startDate ? new Date(input.startDate) : new Date(),
          scheduledEndDate: input.scheduledEndDate ? new Date(input.scheduledEndDate) : null,
          notes: input.notes || null,
          createdById: ctx.user.id,
        },
      });

      // Put the machine back to work (guarded skip when already active)
      await setEquipmentStatus(input.equipmentId, "active", ctx.user.id, ctx.user.name);

      return { rental };
    }),

  markStored: protectedProcedure
    .input(z.object({
      rentalId: z.string(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const rental = await db.equipmentRental.findUnique({
        where: { id: input.rentalId },
        include: { equipment: { select: { projectId: true } } },
      });
      if (!rental) throw new TRPCError({ code: "NOT_FOUND", message: "Rental not found." });
      await assertCanWrite(ctx.user, rental.projectId);

      if (rental.status !== "active") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Only active rentals can be marked as stored." });
      }

      const billableDays = Math.max(0, Math.round((Date.now() - new Date(rental.startDate).getTime()) / 86400000));
      const totalCost = billableDays * rental.rentalRate;

      // Engine transition: active→stored_on_site, CAS-claimed — a double
      // markStored race fails CONFLICT instead of re-deriving billableDays
      // from an already-moved startDate. Rent accrual stops at storedFromDate.
      const { entity: updated } = await transitionEntityState(db, {
        model: "equipmentRental",
        id: input.rentalId,
        targetState: "stored_on_site",
        userId: ctx.user.id,
        userName: ctx.user.name,
        projectId: rental.projectId,
        additionalData: {
          storedFromDate: new Date(),
          totalBillableDays: billableDays,
          totalRentalCost: totalCost,
          notes: input.notes ? `${rental.notes ?? ""}\n[Stored] ${input.notes}`.trim() : rental.notes,
        },
        skipEventEmit: true, // routine operating-state sync, no notification
      });

      // Machine comes off hire (guarded skip when already idle)
      await setEquipmentStatus(rental.equipmentId, "idle", ctx.user.id, ctx.user.name);

      return { rental: updated };
    }),

  markReturned: protectedProcedure
    .input(z.object({
      rentalId: z.string(),
      actualReturnDate: z.string().datetime().optional(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const rental = await db.equipmentRental.findUnique({
        where: { id: input.rentalId },
      });
      if (!rental) throw new TRPCError({ code: "NOT_FOUND", message: "Rental not found." });
      await assertCanWrite(ctx.user, rental.projectId);

      // State machine: a returned rental is a closed record — re-returning
      // it would overwrite actualReturnDate/totalRentalCost (settled money
      // figures) after the fact.
      if (rental.status === "returned") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Rental has already been returned." });
      }

      const returnDate = input.actualReturnDate ? new Date(input.actualReturnDate) : new Date();

      const billableEnd = rental.storedFromDate ? new Date(rental.storedFromDate) : returnDate;
      const billableDays = Math.max(0, Math.round((billableEnd.getTime() - new Date(rental.startDate).getTime()) / 86400000));
      const totalCost = billableDays * rental.rentalRate;

      // Engine transition: active|stored_on_site → returned (terminal).
      // The CAS claim makes a re-return race fail CONFLICT instead of
      // overwriting actualReturnDate/totalRentalCost — settled money figures.
      const { entity: updated } = await transitionEntityState(db, {
        model: "equipmentRental",
        id: input.rentalId,
        targetState: "returned",
        userId: ctx.user.id,
        userName: ctx.user.name,
        projectId: rental.projectId,
        additionalData: {
          actualReturnDate: returnDate,
          totalBillableDays: billableDays,
          totalRentalCost: totalCost,
          notes: input.notes ? `${rental.notes ?? ""}\n[Returned] ${input.notes}`.trim() : rental.notes,
        },
        skipEventEmit: true, // routine operating-state sync, no notification
      });

      // Back to service (guarded skip when already active)
      await setEquipmentStatus(rental.equipmentId, "active", ctx.user.id, ctx.user.name);

      return { rental: updated };
    }),

  reactivate: protectedProcedure
    .input(z.object({
      rentalId: z.string(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const rental = await db.equipmentRental.findUnique({
        where: { id: input.rentalId },
      });
      if (!rental) throw new TRPCError({ code: "NOT_FOUND", message: "Rental not found." });
      await assertCanWrite(ctx.user, rental.projectId);

      if (rental.status !== "stored_on_site") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Only stored rentals can be reactivated." });
      }

      // Recalculate the billable days up to the stored date (the period
      // that was already billed when the rental was marked stored).
      // Previously the billable days were frozen at markStored time but
      // the totalRentalCost wasn't recalculated — if the rental rate
      // changed between markStored and reactivate, the stored cost was
      // stale.
      const storedDate = rental.storedFromDate ? new Date(rental.storedFromDate) : new Date();
      const billableDays = Math.max(0, Math.round((storedDate.getTime() - new Date(rental.startDate).getTime()) / 86400000));
      const totalCost = billableDays * rental.rentalRate;

      // Engine transition: stored_on_site → active (reactivation edge).
      // CAS-claimed so a reactivate/markReturned race fails loudly instead
      // of double-recomputing the billed period.
      const { entity: updated } = await transitionEntityState(db, {
        model: "equipmentRental",
        id: input.rentalId,
        targetState: "active",
        userId: ctx.user.id,
        userName: ctx.user.name,
        projectId: rental.projectId,
        additionalData: {
          totalBillableDays: billableDays,
          totalRentalCost: totalCost,
          notes: input.notes ? `${rental.notes ?? ""}\n[Reactivated] ${input.notes}`.trim() : rental.notes,
        },
        skipEventEmit: true, // routine operating-state sync, no notification
      });

      // Machine is back on hire (guarded skip when already active)
      await setEquipmentStatus(rental.equipmentId, "active", ctx.user.id, ctx.user.name);

      return { rental: updated };
    }),

  rentalStats: protectedProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ ctx, input }) => {
      await assertProjectMember(ctx.user, input.projectId);

      const rentals = await db.equipmentRental.findMany({
        where: { projectId: input.projectId },
        include: { equipment: { select: { name: true, code: true } } },
      });

      const now = new Date();
      let totalRentalCost = 0;
      let activeCount = 0;
      let storedCount = 0;
      let returnedCount = 0;
      let dailyAccruing = 0;
      const storedTooLong: any[] = [];

      for (const r of rentals) {
        const start = new Date(r.startDate);
        let end: Date;

        if (r.status === "returned" && r.actualReturnDate) {
          end = new Date(r.actualReturnDate);
        } else if (r.status === "stored_on_site" && r.storedFromDate) {
          end = new Date(r.storedFromDate);
        } else {
          end = now;
        }

        const billableDays = Math.max(0, Math.round((end.getTime() - start.getTime()) / 86400000));
        totalRentalCost += billableDays * r.rentalRate;

        if (r.status === "active") {
          activeCount++;
          dailyAccruing += r.rentalRate;
        } else if (r.status === "stored_on_site") {
          storedCount++;
          const daysStored = Math.round((now.getTime() - new Date(r.storedFromDate!).getTime()) / 86400000);
          if (daysStored > 7) {
            storedTooLong.push({
              id: r.id,
              equipmentName: r.equipment.name,
              daysStored,
              dailyRate: r.rentalRate,
              potentialSavings: daysStored * r.rentalRate,
            });
          }
        } else if (r.status === "returned") {
          returnedCount++;
        }
      }

      return {
        totalRentalCost,
        activeCount,
        storedCount,
        returnedCount,
        dailyAccruing,
        storedTooLong,
      };
    }),

  addCrew: protectedProcedure
    .input(z.object({
      rentalId: z.string(),
      name: z.string().min(1),
      role: z.enum(["operator", "driver", "helper", "mechanic"]).default("operator"),
      phone: z.string().optional(),
      salaryType: z.enum(["daily", "hourly", "monthly", "lump_sum"]).default("daily"),
      salaryRate: z.number().min(0).default(0),
      salaryPaidBy: z.enum(["vendor", "project"]).default("project"),
      allowanceType: z.enum(["daily", "monthly", "none"]).default("daily"),
      allowanceRate: z.number().min(0).default(0),
      allowancePaidBy: z.enum(["vendor", "project"]).default("project"),
      lodgingType: z.enum(["project_provided", "monthly_reimburse", "per_diem", "none"]).default("none"),
      lodgingRate: z.number().min(0).default(0),
      lodgingPaidBy: z.enum(["vendor", "project"]).default("project"),
      foodingType: z.enum(["project_provided", "daily_allowance", "none"]).default("none"),
      foodingRate: z.number().min(0).default(0),
      foodingPaidBy: z.enum(["vendor", "project"]).default("project"),
      notes: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const rental = await db.equipmentRental.findUnique({
        where: { id: input.rentalId },
        select: { projectId: true },
      });
      if (!rental) throw new TRPCError({ code: "NOT_FOUND", message: "Rental not found." });
      await assertCanWrite(ctx.user, rental.projectId);

      const crew = await db.equipmentCrew.create({
        data: {
          rentalId: input.rentalId,
          name: input.name,
          role: input.role,
          phone: input.phone || null,
          salaryType: input.salaryType,
          salaryRate: input.salaryRate,
          salaryPaidBy: input.salaryPaidBy,
          allowanceType: input.allowanceType,
          allowanceRate: input.allowanceRate,
          allowancePaidBy: input.allowancePaidBy,
          lodgingType: input.lodgingType,
          lodgingRate: input.lodgingRate,
          lodgingPaidBy: input.lodgingPaidBy,
          foodingType: input.foodingType,
          foodingRate: input.foodingRate,
          foodingPaidBy: input.foodingPaidBy,
          notes: input.notes || null,
        },
      });

      return { crew };
    }),

  listCrew: protectedProcedure
    .input(z.object({ rentalId: z.string() }))
    .query(async ({ ctx, input }) => {
      const rental = await db.equipmentRental.findUnique({
        where: { id: input.rentalId },
        select: { projectId: true },
      });
      if (!rental) throw new TRPCError({ code: "NOT_FOUND", message: "Rental not found." });
      await assertProjectMember(ctx.user, rental.projectId);

      const crew = await db.equipmentCrew.findMany({
        where: { rentalId: input.rentalId },
        orderBy: { role: "asc" },
      });

      return { crew };
    }),

  updateCrew: protectedProcedure
    .input(z.object({
      crewId: z.string(),
      name: z.string().optional(),
      role: z.enum(["operator", "driver", "helper", "mechanic"]).optional(),
      phone: z.string().nullable().optional(),
      salaryType: z.enum(["daily", "hourly", "monthly", "lump_sum"]).optional(),
      salaryRate: z.number().optional(),
      salaryPaidBy: z.enum(["vendor", "project"]).optional(),
      allowanceType: z.enum(["daily", "monthly", "none"]).optional(),
      allowanceRate: z.number().optional(),
      allowancePaidBy: z.enum(["vendor", "project"]).optional(),
      lodgingType: z.enum(["project_provided", "monthly_reimburse", "per_diem", "none"]).optional(),
      lodgingRate: z.number().optional(),
      lodgingPaidBy: z.enum(["vendor", "project"]).optional(),
      foodingType: z.enum(["project_provided", "daily_allowance", "none"]).optional(),
      foodingRate: z.number().optional(),
      foodingPaidBy: z.enum(["vendor", "project"]).optional(),
      endDate: z.string().datetime().nullable().optional(),
      notes: z.string().nullable().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const crew = await db.equipmentCrew.findUnique({
        where: { id: input.crewId },
        include: { rental: { select: { projectId: true } } },
      });
      if (!crew) throw new TRPCError({ code: "NOT_FOUND", message: "Crew member not found." });
      await assertCanWrite(ctx.user, crew.rental.projectId);

      const { crewId, ...data } = input;
      const updated = await db.equipmentCrew.update({
        where: { id: crewId },
        data: {
          ...(data.name !== undefined && { name: data.name }),
          ...(data.role !== undefined && { role: data.role }),
          ...(data.phone !== undefined && { phone: data.phone }),
          ...(data.salaryType !== undefined && { salaryType: data.salaryType }),
          ...(data.salaryRate !== undefined && { salaryRate: data.salaryRate }),
          ...(data.salaryPaidBy !== undefined && { salaryPaidBy: data.salaryPaidBy }),
          ...(data.allowanceType !== undefined && { allowanceType: data.allowanceType }),
          ...(data.allowanceRate !== undefined && { allowanceRate: data.allowanceRate }),
          ...(data.allowancePaidBy !== undefined && { allowancePaidBy: data.allowancePaidBy }),
          ...(data.lodgingType !== undefined && { lodgingType: data.lodgingType }),
          ...(data.lodgingRate !== undefined && { lodgingRate: data.lodgingRate }),
          ...(data.lodgingPaidBy !== undefined && { lodgingPaidBy: data.lodgingPaidBy }),
          ...(data.foodingType !== undefined && { foodingType: data.foodingType }),
          ...(data.foodingRate !== undefined && { foodingRate: data.foodingRate }),
          ...(data.foodingPaidBy !== undefined && { foodingPaidBy: data.foodingPaidBy }),
          ...(data.endDate !== undefined && { endDate: data.endDate ? new Date(data.endDate) : null }),
          ...(data.notes !== undefined && { notes: data.notes }),
        },
      });

      return { crew: updated };
    }),

  removeCrew: protectedProcedure
    .input(z.object({ crewId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const crew = await db.equipmentCrew.findUnique({
        where: { id: input.crewId },
        include: { rental: { select: { projectId: true } } },
      });
      if (!crew) throw new TRPCError({ code: "NOT_FOUND", message: "Crew member not found." });
      await assertCanWrite(ctx.user, crew.rental.projectId);

      await db.equipmentCrew.delete({ where: { id: input.crewId } });
      return { ok: true };
    }),
};
