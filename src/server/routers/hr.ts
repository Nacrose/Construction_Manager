/**
 * tRPC router for Human Resources (staff and attendance).
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "@/server/trpc";
import { db } from "@/lib/db";
import { assertProjectMember, assertCanWrite } from "@/lib/authz";

const CreateStaffSchema = z.object({
  projectId: z.string(),
  name: z.string().min(1),
  designation: z.string().optional(),
  category: z.string().optional(),
  phone: z.string().optional(),
  dailyWage: z.number().min(0).default(0),
  joinedDate: z.string().datetime().optional(),
});

const UpdateStaffSchema = z.object({
  itemId: z.string(),
  name: z.string().optional(),
  designation: z.string().nullable().optional(),
  category: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
  dailyWage: z.number().optional(),
  status: z.string().optional(),
});

export const hrRouter = router({
  /** List staff or attendance logs. */
  list: protectedProcedure
    .input(z.object({
      projectId: z.string(),
      tab: z.enum(["staff", "attendance"]).default("staff"),
    }))
    .query(async ({ ctx, input }) => {
      await assertProjectMember(ctx.user, input.projectId);

      if (input.tab === "staff") {
        const staff = await db.staff.findMany({
          where: { projectId: input.projectId },
          orderBy: { name: "asc" },
        });
        return { staff, attendance: [] };
      } else {
        const attendance = await db.staffAttendance.findMany({
          where: { projectId: input.projectId },
          orderBy: { date: "desc" },
          include: { staff: { select: { name: true, designation: true } } },
          take: 100,
        });
        return { staff: [], attendance };
      }
    }),

  /** Create new staff member. */
  create: protectedProcedure
    .input(CreateStaffSchema)
    .mutation(async ({ ctx, input }) => {
      const { projectId, ...data } = input;
      await assertCanWrite(ctx.user, projectId);
      const staff = await db.staff.create({
        data: {
          projectId,
          name: data.name,
          designation: data.designation,
          category: data.category,
          phone: data.phone,
          dailyWage: data.dailyWage,
          joinedDate: data.joinedDate ? new Date(data.joinedDate) : null,
        },
      });
      return { staff };
    }),

  /** Update staff member. */
  update: protectedProcedure
    .input(UpdateStaffSchema)
    .mutation(async ({ ctx, input }) => {
      const { itemId, ...data } = input;
      const item = await db.staff.findUnique({ where: { id: itemId }, select: { projectId: true } });
      if (!item) throw new TRPCError({ code: "NOT_FOUND", message: "Staff not found." });
      await assertCanWrite(ctx.user, item.projectId);

      const updated = await db.staff.update({ where: { id: itemId }, data });
      return { staff: updated };
    }),

  /** Delete staff member. */
  delete: protectedProcedure
    .input(z.object({ itemId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const item = await db.staff.findUnique({ where: { id: input.itemId }, select: { projectId: true } });
      if (!item) throw new TRPCError({ code: "NOT_FOUND", message: "Staff not found." });
      await assertCanWrite(ctx.user, item.projectId);

      await db.staff.delete({ where: { id: input.itemId } });
      return { ok: true };
    }),
});
