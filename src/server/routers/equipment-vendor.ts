import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure } from "@/server/trpc";
import { db } from "@/lib/db";
import { assertProjectMember, assertCanWrite } from "@/lib/authz";

export const equipmentVendorProcedures = {
  listVendors: protectedProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ ctx, input }) => {
      await assertProjectMember(ctx.user, input.projectId);

      const vendors = await db.equipmentVendor.findMany({
        where: { projectId: input.projectId },
        include: {
          _count: { select: { rentals: true } },
          rentals: {
            where: { status: { in: ["active", "stored_on_site"] } },
            select: { id: true, status: true, rentalRate: true, equipment: { select: { name: true, code: true } } },
          },
        },
        orderBy: { name: "asc" },
      });

      const vendorsWithStats = vendors.map(v => ({
        ...v,
        stats: {
          totalRentals: v._count.rentals,
          activeRentals: v.rentals.length,
          activeEquipment: v.rentals.map(r => r.equipment.name),
        },
      }));

      return { vendors: vendorsWithStats };
    }),

  getVendor: protectedProcedure
    .input(z.object({ vendorId: z.string() }))
    .query(async ({ ctx, input }) => {
      const vendor = await db.equipmentVendor.findUnique({
        where: { id: input.vendorId },
        include: {
          rentals: {
            include: {
              equipment: { select: { id: true, name: true, code: true, type: true } },
              _count: { select: { damages: true, crew: true } },
            },
            orderBy: { startDate: "desc" },
          },
        },
      });
      if (!vendor) throw new TRPCError({ code: "NOT_FOUND", message: "Vendor not found." });
      await assertProjectMember(ctx.user, vendor.projectId);

      const now = new Date();
      let totalBilled = 0;
      let totalDeductions = 0;

      const rentalsWithCost = vendor.rentals.map(r => {
        const start = new Date(r.startDate);
        let end: Date;
        if (r.status === "returned" && r.actualReturnDate) end = new Date(r.actualReturnDate);
        else if (r.status === "stored_on_site" && r.storedFromDate) end = new Date(r.storedFromDate);
        else end = now;

        const billableDays = Math.max(0, Math.round((end.getTime() - start.getTime()) / 86400000));
        const rentalCost = billableDays * r.rentalRate;
        totalBilled += rentalCost;
        totalDeductions += r.totalDeductions;

        return {
          ...r,
          billableDays,
          rentalCost,
          netPayable: rentalCost - r.totalDeductions,
        };
      });

      return {
        vendor: { ...vendor, rentals: rentalsWithCost },
        stats: {
          totalBilled,
          totalDeductions,
          netPayable: totalBilled - totalDeductions,
          totalRentals: vendor.rentals.length,
          activeRentals: vendor.rentals.filter(r => r.status === "active").length,
        },
      };
    }),

  createVendor: protectedProcedure
    .input(z.object({
      projectId: z.string(),
      name: z.string().min(1),
      contact: z.string().optional(),
      phone: z.string().optional(),
      email: z.string().optional(),
      pan: z.string().optional(),
      address: z.string().optional(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await assertCanWrite(ctx.user, input.projectId);
      const vendor = await db.equipmentVendor.create({
        data: {
          projectId: input.projectId,
          name: input.name,
          contact: input.contact || null,
          phone: input.phone || null,
          email: input.email || null,
          pan: input.pan || null,
          address: input.address || null,
          notes: input.notes || null,
        },
      });
      return { vendor };
    }),

  updateVendor: protectedProcedure
    .input(z.object({
      vendorId: z.string(),
      name: z.string().optional(),
      contact: z.string().nullable().optional(),
      phone: z.string().nullable().optional(),
      email: z.string().nullable().optional(),
      pan: z.string().nullable().optional(),
      address: z.string().nullable().optional(),
      status: z.string().optional(),
      notes: z.string().nullable().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const vendor = await db.equipmentVendor.findUnique({ where: { id: input.vendorId } });
      if (!vendor) throw new TRPCError({ code: "NOT_FOUND", message: "Vendor not found." });
      await assertCanWrite(ctx.user, vendor.projectId);

      const { vendorId, ...data } = input;
      const updated = await db.equipmentVendor.update({ where: { id: vendorId }, data });
      return { vendor: updated };
    }),

  uploadAgreement: protectedProcedure
    .input(z.object({
      rentalId: z.string(),
      fileData: z.string(),
      fileName: z.string(),
      fileType: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      const rental = await db.equipmentRental.findUnique({
        where: { id: input.rentalId },
        select: { projectId: true },
      });
      if (!rental) throw new TRPCError({ code: "NOT_FOUND", message: "Rental not found." });
      await assertCanWrite(ctx.user, rental.projectId);

      await db.equipmentRental.update({
        where: { id: input.rentalId },
        data: {
          agreementFileData: input.fileData,
          agreementFileName: input.fileName,
          agreementFileType: input.fileType,
        },
      });

      return { ok: true };
    }),

  updateRentalTerms: protectedProcedure
    .input(z.object({
      rentalId: z.string(),
      maintenanceBy: z.enum(["vendor", "contractor", "shared"]).optional(),
      maintenanceMinContractor: z.number().optional(),
      consumablesBy: z.enum(["vendor", "contractor"]).optional(),
      totalDeductions: z.number().optional(),
      notes: z.string().nullable().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const rental = await db.equipmentRental.findUnique({
        where: { id: input.rentalId },
        select: { projectId: true },
      });
      if (!rental) throw new TRPCError({ code: "NOT_FOUND", message: "Rental not found." });
      await assertCanWrite(ctx.user, rental.projectId);

      const { rentalId, ...data } = input;
      const updated = await db.equipmentRental.update({
        where: { id: rentalId },
        data: {
          ...(data.maintenanceBy !== undefined && { maintenanceBy: data.maintenanceBy }),
          ...(data.maintenanceMinContractor !== undefined && { maintenanceMinContractor: data.maintenanceMinContractor }),
          ...(data.consumablesBy !== undefined && { consumablesBy: data.consumablesBy }),
          ...(data.totalDeductions !== undefined && { totalDeductions: data.totalDeductions }),
          ...(data.notes !== undefined && { notes: data.notes }),
        },
      });

      return { rental: updated };
    }),

  listDamages: protectedProcedure
    .input(z.object({ rentalId: z.string() }))
    .query(async ({ ctx, input }) => {
      const rental = await db.equipmentRental.findUnique({
        where: { id: input.rentalId },
        select: { projectId: true },
      });
      if (!rental) throw new TRPCError({ code: "NOT_FOUND", message: "Rental not found." });
      await assertProjectMember(ctx.user, rental.projectId);

      const damages = await db.equipmentDamage.findMany({
        where: { rentalId: input.rentalId },
        orderBy: { date: "desc" },
      });

      return { damages };
    }),

  reportDamage: protectedProcedure
    .input(z.object({
      rentalId: z.string(),
      date: z.string().datetime().optional(),
      description: z.string().min(1),
      damageType: z.enum(["normal_wear", "negligence", "accident", "force_majeure"]).default("normal_wear"),
      responsibleParty: z.enum(["contractor", "vendor", "shared", "third_party"]).default("contractor"),
      repairCost: z.number().min(0).default(0),
      paidBy: z.enum(["contractor", "vendor", "insurance", "shared"]).default("contractor"),
      contractorShare: z.number().optional(),
      vendorShare: z.number().optional(),
      photoData: z.string().optional(),
      photoName: z.string().optional(),
      photoType: z.string().optional(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const rental = await db.equipmentRental.findUnique({
        where: { id: input.rentalId },
        select: { projectId: true },
      });
      if (!rental) throw new TRPCError({ code: "NOT_FOUND", message: "Rental not found." });
      await assertCanWrite(ctx.user, rental.projectId);

      const damage = await db.equipmentDamage.create({
        data: {
          rentalId: input.rentalId,
          date: input.date ? new Date(input.date) : new Date(),
          description: input.description,
          damageType: input.damageType,
          responsibleParty: input.responsibleParty,
          repairCost: input.repairCost,
          paidBy: input.paidBy,
          contractorShare: input.contractorShare || null,
          vendorShare: input.vendorShare || null,
          photoData: input.photoData || null,
          photoName: input.photoName || null,
          photoType: input.photoType || null,
          resolvedNotes: input.notes || null,
          createdById: ctx.user.id,
        },
      });

      if (input.responsibleParty === "contractor" && input.repairCost > 0) {
        if (input.paidBy === "vendor") {
          await db.equipmentRental.update({
            where: { id: input.rentalId },
            data: { totalDeductions: { increment: input.repairCost } },
          });
        }
      }

      return { damage };
    }),

  resolveDamage: protectedProcedure
    .input(z.object({
      damageId: z.string(),
      status: z.enum(["assessed", "repaired", "disputed"]),
      resolvedNotes: z.string().optional(),
      finalCost: z.number().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const damage = await db.equipmentDamage.findUnique({
        where: { id: input.damageId },
        include: { rental: { select: { projectId: true } } },
      });
      if (!damage) throw new TRPCError({ code: "NOT_FOUND", message: "Damage not found." });
      await assertCanWrite(ctx.user, damage.rental.projectId);

      const updated = await db.equipmentDamage.update({
        where: { id: input.damageId },
        data: {
          status: input.status,
          resolvedDate: new Date(),
          resolvedNotes: input.resolvedNotes || damage.resolvedNotes,
          ...(input.finalCost !== undefined && { repairCost: input.finalCost }),
        },
      });

      return { damage: updated };
    }),
};
