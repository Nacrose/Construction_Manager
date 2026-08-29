/**
 * tRPC router for On-Demand / Spot Equipment Hire Tickets & Auto-Vendor Setup.
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure } from "@/server/trpc";
import { db } from "@/lib/db";
import { assertProjectMember, assertCanWrite } from "@/lib/authz";
import { assertNotLocked } from "@/lib/fiscal-year-lock";

const SpotHireTicketSchema = z.object({
  projectId: z.string(),
  vendorName: z.string().min(1),
  vendorPhone: z.string().optional().nullable(),
  machineName: z.string().min(1),
  registrationNo: z.string().optional().nullable(),
  equipmentType: z.enum(["excavator", "crane", "pump", "roller", "tipper", "grader", "loader", "other"]).default("excavator"),
  hireType: z.enum(["hourly", "trip", "daily", "shift", "lump_sum"]).default("hourly"),
  rate: z.number().nonnegative(),
  minCalloutHours: z.number().nonnegative().default(0),
  mobilizationFee: z.number().nonnegative().default(0),
  fuelMode: z.enum(["wet", "dry"]).default("wet"),
  fuelLitersIssued: z.number().nonnegative().default(0),
  fuelUnitCost: z.number().nonnegative().default(0), // must be set per ticket — no hardcoded default
  date: z.string().optional(),
  startTime: z.string().optional().nullable(),
  endTime: z.string().optional().nullable(),
  hoursWorked: z.number().nonnegative().default(0),
  tripCount: z.number().int().nonnegative().default(0),
  operatorName: z.string().optional().nullable(),
  operatorPhone: z.string().optional().nullable(),
  slipNumber: z.string().optional().nullable(),
  remarks: z.string().optional().nullable(),
  ganttTaskId: z.string().optional().nullable(),
  boqItemId: z.string().optional().nullable(),
});

export const equipmentSpotHireProcedures = {
  /** Create Spot Hire Ticket with Automatic Background Vendor Registration */
  createSpotHire: protectedProcedure
    .input(SpotHireTicketSchema)
    .mutation(async ({ ctx, input }) => {
      await assertCanWrite(ctx.user, input.projectId);
      await assertNotLocked(ctx.user.organizationId, input.date ? new Date(input.date) : new Date());

      const ticketDate = input.date ? new Date(input.date) : new Date();

      // 1. Auto-Setup / Match Vendor
      let vendorId: string | null = null;
      let partnerId: string | null = null;

      const trimmedName = input.vendorName.trim();

      // Check EquipmentVendor
      let existingVendor = await db.equipmentVendor.findFirst({
        where: {
          projectId: input.projectId,
          name: { equals: trimmedName, mode: "insensitive" },
        },
      });

      if (!existingVendor) {
        // Auto-create EquipmentVendor
        existingVendor = await db.equipmentVendor.create({
          data: {
            projectId: input.projectId,
            name: trimmedName,
            phone: input.vendorPhone || null,
            contact: input.vendorPhone || null,
            status: "active",
            notes: "Auto-provisioned via on-demand spot hire ticket",
          },
        });
      }
      vendorId = existingVendor.id;

      // Check or create Partner
      let existingPartner = await db.partner.findFirst({
        where: {
          projectId: input.projectId,
          name: { equals: trimmedName, mode: "insensitive" },
        },
      });

      if (!existingPartner) {
        existingPartner = await db.partner.create({
          data: {
            projectId: input.projectId,
            name: trimmedName,
            phone: input.vendorPhone || null,
            type: "equipment_vendor",
            notes: "Auto-provisioned via on-demand spot hire ticket",
          },
        });
      }
      partnerId = existingPartner.id;

      // 2. Financial Calculations
      // Handle all hire types:
      //   - trip: tripCount * rate + mobilizationFee
      //   - hourly: max(hoursWorked, minCalloutHours) * rate + mobilizationFee
      //   - daily: hoursWorked is ignored, rate is per-day; use 1 day if no
      //            date range. For simplicity we treat 'daily' like 'shift'
      //            (1 unit of rate per ticket).
      //   - shift: 1 shift = rate (hoursWorked used for display only)
      //   - lump_sum: rate IS the total (hoursWorked/tripCount ignored)
      let totalGross = 0;
      if (input.hireType === "trip") {
        totalGross = input.tripCount * input.rate + input.mobilizationFee;
      } else if (input.hireType === "hourly") {
        const billedHours = Math.max(input.hoursWorked, input.minCalloutHours);
        totalGross = billedHours * input.rate + input.mobilizationFee;
      } else if (input.hireType === "lump_sum") {
        // Lump sum: rate is the total. Don't multiply by hours/trips.
        totalGross = input.rate + input.mobilizationFee;
      } else {
        // daily / shift: 1 unit of work per ticket.
        totalGross = input.rate + input.mobilizationFee;
      }

      // Look up the project's fuel price for dry-hire fuel deductions.
      // Previously this defaulted to NPR 175/L hardcoded — wrong for any
      // project with a different fuel rate.
      let fuelUnitCost = input.fuelUnitCost;
      if (fuelUnitCost === 0 && input.fuelMode === "dry" && input.fuelLitersIssued > 0) {
        const project = await db.project.findUnique({
          where: { id: input.projectId },
          select: { fuelPricePerLiter: true },
        });
        fuelUnitCost = project?.fuelPricePerLiter ?? 0;
      }

      const fuelDeduction =
        input.fuelMode === "dry" ? input.fuelLitersIssued * fuelUnitCost : 0;
      const netPayable = Math.max(0, totalGross - fuelDeduction);

      // 3. Create Ticket
      const ticket = await db.equipmentSpotHire.create({
        data: {
          projectId: input.projectId,
          vendorId,
          partnerId,
          vendorName: trimmedName,
          vendorPhone: input.vendorPhone || null,
          machineName: input.machineName.trim(),
          registrationNo: input.registrationNo?.trim() || null,
          equipmentType: input.equipmentType,
          hireType: input.hireType,
          rate: input.rate,
          minCalloutHours: input.minCalloutHours,
          mobilizationFee: input.mobilizationFee,
          fuelMode: input.fuelMode,
          fuelLitersIssued: input.fuelLitersIssued,
          fuelUnitCost,
          date: ticketDate,
          startTime: input.startTime || null,
          endTime: input.endTime || null,
          hoursWorked: input.hoursWorked,
          tripCount: input.tripCount,
          totalGross,
          fuelDeduction,
          netPayable,
          operatorName: input.operatorName || null,
          operatorPhone: input.operatorPhone || null,
          slipNumber: input.slipNumber || null,
          remarks: input.remarks || null,
          ganttTaskId: input.ganttTaskId || null,
          boqItemId: input.boqItemId || null,
          createdById: ctx.user.id,
        },
      });

      return { ticket };
    }),

  /** List Spot Hire Tickets with Filters */
  listSpotHires: protectedProcedure
    .input(
      z.object({
        projectId: z.string(),
        vendorName: z.string().optional(),
        isBilled: z.boolean().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      await assertProjectMember(ctx.user, input.projectId);

      const where: any = {
        projectId: input.projectId,
        ...(input.vendorName ? { vendorName: { contains: input.vendorName, mode: "insensitive" } } : {}),
        ...(input.isBilled !== undefined ? { isBilled: input.isBilled } : {}),
      };

      const tickets = await db.equipmentSpotHire.findMany({
        where,
        include: {
          vendor: { select: { id: true, name: true, phone: true } },
          boqItem: { select: { id: true, code: true, description: true, unit: true } },
          ganttTask: { select: { id: true, name: true, code: true } },
        },
        orderBy: { date: "desc" },
      });

      const totalGross = tickets.reduce((s, t) => s + t.totalGross, 0);
      const totalFuelDeductions = tickets.reduce((s, t) => s + t.fuelDeduction, 0);
      const totalNetPayable = tickets.reduce((s, t) => s + t.netPayable, 0);
      const unbilledAmount = tickets.filter((t) => !t.isBilled).reduce((s, t) => s + t.netPayable, 0);

      return {
        tickets,
        summary: {
          totalTickets: tickets.length,
          totalHours: tickets.reduce((s, t) => s + t.hoursWorked, 0),
          totalTrips: tickets.reduce((s, t) => s + t.tripCount, 0),
          totalGross,
          totalFuelDeductions,
          totalNetPayable,
          unbilledAmount,
        },
      };
    }),

  /** Cumulative Statement per Vendor */
  getVendorHireStatement: protectedProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ ctx, input }) => {
      await assertProjectMember(ctx.user, input.projectId);

      const tickets = await db.equipmentSpotHire.findMany({
        where: { projectId: input.projectId },
        orderBy: { date: "desc" },
      });

      const vendorMap = new Map<
        string,
        {
          vendorName: string;
          vendorPhone: string | null;
          ticketCount: number;
          totalHours: number;
          totalTrips: number;
          totalGross: number;
          totalFuelDeductions: number;
          netPayable: number;
          unbilledAmount: number;
          tickets: typeof tickets;
        }
      >();

      for (const t of tickets) {
        const key = t.vendorName.trim().toLowerCase();
        if (!vendorMap.has(key)) {
          vendorMap.set(key, {
            vendorName: t.vendorName,
            vendorPhone: t.vendorPhone,
            ticketCount: 0,
            totalHours: 0,
            totalTrips: 0,
            totalGross: 0,
            totalFuelDeductions: 0,
            netPayable: 0,
            unbilledAmount: 0,
            tickets: [],
          });
        }

        const v = vendorMap.get(key)!;
        v.ticketCount += 1;
        v.totalHours += t.hoursWorked;
        v.totalTrips += t.tripCount;
        v.totalGross += t.totalGross;
        v.totalFuelDeductions += t.fuelDeduction;
        v.netPayable += t.netPayable;
        if (!t.isBilled) {
          v.unbilledAmount += t.netPayable;
        }
        v.tickets.push(t);
      }

      return {
        statements: Array.from(vendorMap.values()).sort((a, b) => b.unbilledAmount - a.unbilledAmount),
      };
    }),

  /** Delete an unbilled Spot Ticket */
  deleteSpotTicket: protectedProcedure
    .input(z.object({ ticketId: z.string(), projectId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await assertCanWrite(ctx.user, input.projectId);

      // IDOR guard: verify the ticket belongs to the project the
      // caller was authorized on — without this, a user with project A
      // access could delete spot tickets in project B by their cuid.
      const ticket = await db.equipmentSpotHire.findFirst({
        where: { id: input.ticketId, projectId: input.projectId },
      });
      if (!ticket) throw new TRPCError({ code: "NOT_FOUND", message: "Spot ticket not found." });
      await assertNotLocked(ctx.user.organizationId, ticket.date);

      if (ticket.isBilled) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Cannot delete a ticket that has already been billed." });
      }

      await db.equipmentSpotHire.delete({ where: { id: input.ticketId } });
      return { success: true };
    }),
};
