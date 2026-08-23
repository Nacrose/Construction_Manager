/**
 * tRPC router for Site Expenses / Petty Cash.
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "@/server/trpc";
import { db } from "@/lib/db";
import { assertNotLocked } from "@/lib/fiscal-year-lock";
import { assertProjectMember, assertCanWrite, assertProjectAdmin } from "@/lib/authz";
import { audit } from "@/lib/audit";

export const siteExpenseRouter = router({
  /** List expenses for a project, with filters. */
  list: protectedProcedure
    .input(z.object({
      projectId: z.string(),
      category: z.string().optional(),
      status: z.enum(["pending", "approved", "rejected"]).optional(),
      dateFrom: z.string().optional(),
      dateTo: z.string().optional(),
    }))
    .query(async ({ ctx, input }) => {
      await assertProjectMember(ctx.user, input.projectId);

      const where: Record<string, unknown> = { projectId: input.projectId };
      if (input.category) where.category = input.category;
      if (input.status) where.status = input.status;
      if (input.dateFrom || input.dateTo) {
        where.date = {};
        if (input.dateFrom) (where.date as Record<string, unknown>).gte = new Date(input.dateFrom);
        if (input.dateTo) (where.date as Record<string, unknown>).lte = new Date(input.dateTo);
      }

      const expenses = await db.siteExpense.findMany({
        where,
        orderBy: { createdAt: "desc" },
        include: {
          approvedBy: { select: { name: true } },
          createdBy: { select: { name: true } },
        },
      });
      return { expenses };
    }),

  /** Get single expense. */
  get: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const expense = await db.siteExpense.findUnique({
        where: { id: input.id },
        select: { projectId: true },
      });
      if (!expense) throw new TRPCError({ code: "NOT_FOUND", message: "Expense not found." });
      // IDOR guard — see leave.get for rationale.
      await assertProjectMember(ctx.user, expense.projectId);

      const expenseWithIncludes = await db.siteExpense.findUnique({
        where: { id: input.id },
        include: {
          approvedBy: { select: { name: true } },
          createdBy: { select: { name: true } },
        },
      });
      return { expense: expenseWithIncludes };
    }),

  /** Create expense (auto-generate number EXP-{seq}). */
  create: protectedProcedure
    .input(z.object({
      projectId: z.string(),
      date: z.string().optional(),
      category: z.string().default("general"),
      description: z.string().min(1),
      amount: z.number().min(0),
      vatAmount: z.number().min(0).default(0),
      paymentMode: z.string().default("cash"),
      referenceNo: z.string().optional(),
      vendorName: z.string().optional(),
      receiptData: z.string().optional(),
      receiptName: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await assertCanWrite(ctx.user, input.projectId);

      // Auto-generate expense number with collision prevention
      const count = await db.siteExpense.count({ where: { projectId: input.projectId } });
      let seq = count + 1;
      let number = `EXP-${String(seq).padStart(3, "0")}`;
      while (await db.siteExpense.findFirst({ where: { projectId: input.projectId, number } })) {
        seq++;
        number = `EXP-${String(seq).padStart(3, "0")}`;
      }

      const totalAmount = input.amount + input.vatAmount;

      const expense = await db.siteExpense.create({
        data: {
          projectId: input.projectId,
          number,
          date: input.date ? new Date(input.date) : new Date(),
          category: input.category,
          description: input.description,
          amount: input.amount,
          vatAmount: input.vatAmount,
          totalAmount,
          paymentMode: input.paymentMode,
          referenceNo: input.referenceNo,
          vendorName: input.vendorName,
          receiptData: input.receiptData,
          receiptName: input.receiptName,
          createdById: ctx.user.id,
        },
      });

      await audit({
        userId: ctx.user.id,
        projectId: input.projectId,
        action: "site_expense.create",
        entityType: "site_expense",
        entityId: expense.id,
        metadata: { number: expense.number, amount: expense.totalAmount, category: expense.category },
      });

      return { expense };
    }),

  /** Update expense fields. */
  update: protectedProcedure
    .input(z.object({
      id: z.string(),
      date: z.string().optional(),
      category: z.string().optional(),
      description: z.string().optional(),
      amount: z.number().optional(),
      vatAmount: z.number().optional(),
      paymentMode: z.string().optional(),
      referenceNo: z.string().nullable().optional(),
      vendorName: z.string().nullable().optional(),
      receiptData: z.string().nullable().optional(),
      receiptName: z.string().nullable().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;
      const expense = await db.siteExpense.findUnique({
        where: { id },
        select: { projectId: true, status: true },
      });
      if (!expense) throw new TRPCError({ code: "NOT_FOUND", message: "Expense not found." });
      await assertCanWrite(ctx.user, expense.projectId);

      if (expense.status !== "pending") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Only draft/pending expenses can be edited." });
      }

      const updateData: Record<string, unknown> = { ...data };
      if (data.date) updateData.date = new Date(data.date);
      // Recalculate total if amount or vat changed
      if (data.amount !== undefined || data.vatAmount !== undefined) {
        const current = await db.siteExpense.findUnique({ where: { id }, select: { amount: true, vatAmount: true } });
        const amt = data.amount ?? current!.amount;
        const vat = data.vatAmount ?? current!.vatAmount;
        updateData.totalAmount = amt + vat;
      }

      const updated = await db.siteExpense.update({ where: { id }, data: updateData });
      return { expense: updated };
    }),

  /** PM approves expense. */
  approve: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await assertNotLocked(ctx.user.organizationId);
      const expense = await db.siteExpense.findUnique({
        where: { id: input.id },
        select: { projectId: true, status: true },
      });
      if (!expense) throw new TRPCError({ code: "NOT_FOUND", message: "Expense not found." });
      await assertProjectAdmin(ctx.user, expense.projectId);

      if (expense.status !== "pending") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Only pending expenses can be approved." });
      }

      const updated = await db.siteExpense.update({
        where: { id: input.id },
        data: {
          status: "approved",
          approvedById: ctx.user.id,
          approvedAt: new Date(),
        },
      });

      await audit({
        userId: ctx.user.id,
        projectId: expense.projectId,
        action: "site_expense.approve",
        entityType: "site_expense",
        entityId: updated.id,
        metadata: { number: updated.number, totalAmount: updated.totalAmount },
      });

      return { expense: updated };
    }),

  /** PM rejects expense. */
  reject: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const expense = await db.siteExpense.findUnique({
        where: { id: input.id },
        select: { projectId: true, status: true, number: true },
      });
      if (!expense) throw new TRPCError({ code: "NOT_FOUND", message: "Expense not found." });
      await assertProjectAdmin(ctx.user, expense.projectId);

      if (expense.status !== "pending") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Only pending expenses can be rejected." });
      }

      const updated = await db.siteExpense.update({
        where: { id: input.id },
        data: { status: "rejected" },
      });

      await audit({
        userId: ctx.user.id,
        projectId: expense.projectId,
        action: "site_expense.reject",
        entityType: "site_expense",
        entityId: updated.id,
        metadata: { number: updated.number },
      });

      return { expense: updated };
    }),

  /** Delete draft expenses. */
  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const expense = await db.siteExpense.findUnique({
        where: { id: input.id },
        select: { projectId: true, status: true, number: true },
      });
      if (!expense) throw new TRPCError({ code: "NOT_FOUND", message: "Expense not found." });
      await assertCanWrite(ctx.user, expense.projectId);

      if (expense.status !== "pending") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Only draft/pending expenses can be deleted." });
      }

      await db.siteExpense.delete({ where: { id: input.id } });

      await audit({
        userId: ctx.user.id,
        projectId: expense.projectId,
        action: "site_expense.delete",
        entityType: "site_expense",
        entityId: input.id,
        metadata: { number: expense.number },
      });

      return { ok: true };
    }),

  /** Stats: total by category, total pending, total approved. */
  stats: protectedProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ ctx, input }) => {
      await assertProjectMember(ctx.user, input.projectId);

      const allExpenses = await db.siteExpense.findMany({
        where: { projectId: input.projectId },
        select: { category: true, status: true, totalAmount: true },
      });

      const byCategory: Record<string, number> = {};
      let totalPending = 0;
      let totalApproved = 0;
      let totalAll = 0;

      for (const exp of allExpenses) {
        byCategory[exp.category] = (byCategory[exp.category] || 0) + exp.totalAmount;
        totalAll += exp.totalAmount;
        if (exp.status === "pending") totalPending += exp.totalAmount;
        if (exp.status === "approved") totalApproved += exp.totalAmount;
      }

      return {
        byCategory,
        totalPending,
        totalApproved,
        totalAll,
        totalCount: allExpenses.length,
      };
    }),
});
