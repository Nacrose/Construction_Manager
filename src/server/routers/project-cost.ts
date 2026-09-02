/**
 * tRPC router for Project Costs — the cost ledger.
 *
 * Procore-style architecture: field data capture, NOT double-entry accounting.
 * Costs come from two sources:
 *   1. Auto-captured: daily report submission (material, labor, equipment),
 *      IPC creation (subcontractor billing), purchase orders (committed costs)
 *   2. Manual entry: PM enters cash expenses (tea, transport, fuel, etc.)
 *
 * All costs are linked to: project, date, category, optional BOQ task/Gantt task,
 * optional vendor/subcontractor. This enables variance analysis per task without
 * the overhead of a general ledger.
 *
 * For accounting: use the export endpoint to generate CSV for Tally/QuickBooks.
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "@/server/trpc";
import { db } from "@/lib/db";
import { invalidateProjectCache } from "@/lib/cache";
import { assertProjectMember, assertCanWrite } from "@/lib/authz";
import { assertNotLocked } from "@/lib/fiscal-year-lock";
import { audit } from "@/lib/audit";

const MAX_RECEIPT_SIZE = 5 * 1024 * 1024; // 5MB for receipt photos

const safeDateSchema = z.string().transform((v) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? `${v}T00:00:00.000Z` : v)).pipe(z.string().datetime());

const CreateExpenseSchema = z.object({
  projectId: z.string(),
  date: safeDateSchema.optional(),
  amount: z.number().positive(),
  category: z.enum(["material", "labor", "equipment", "subcontractor", "overhead"]),
  subcategory: z.string().max(100).optional(),
  description: z.string().max(500).optional(),
  boqItemId: z.string().optional(),
  ganttTaskId: z.string().optional(),
  subcontractorId: z.string().optional(),
  vendor: z.string().max(200).optional(),
  paymentMode: z.enum(["cash", "bank_transfer", "cheque", "mobile_pay"]).optional(),
  receiptData: z.string().optional(), // base64
  receiptFileType: z.string().optional(),
  notes: z.string().max(1000).optional(),
});

export const projectCostRouter = router({
  /** List costs for a project with optional filters. */
  list: protectedProcedure
    .input(z.object({
      projectId: z.string(),
      startDate: safeDateSchema.optional(),
      endDate: safeDateSchema.optional(),
      category: z.string().optional(),
      source: z.string().optional(), // manual | daily_report | ipc | purchase_order
      boqItemId: z.string().optional(),
      limit: z.number().min(1).max(500).default(100),
    }))
    .query(async ({ ctx, input }) => {
      await assertProjectMember(ctx.user, input.projectId);

      const where: any = { projectId: input.projectId };
      if (input.startDate || input.endDate) {
        where.date = {};
        if (input.startDate) where.date.gte = new Date(input.startDate);
        if (input.endDate) where.date.lte = new Date(input.endDate);
      }
      if (input.category) where.category = input.category;
      if (input.source) where.source = input.source;
      if (input.boqItemId) where.boqItemId = input.boqItemId;

      const costs = await db.projectCost.findMany({
        where,
        orderBy: { date: "desc" },
        take: input.limit,
        include: {
          boqItem: { select: { id: true, code: true, description: true } },
          ganttTask: { select: { id: true, code: true, name: true } },
          subcontractor: { select: { id: true, name: true } },
          createdBy: { select: { id: true, name: true } },
        },
      });

      return { costs };
    }),

  /** Get cost summary statistics for dashboards. */
  stats: protectedProcedure
    .input(z.object({
      projectId: z.string(),
      startDate: safeDateSchema.optional(),
      endDate: safeDateSchema.optional(),
    }))
    .query(async ({ ctx, input }) => {
      await assertProjectMember(ctx.user, input.projectId);

      const where: any = { projectId: input.projectId };
      if (input.startDate || input.endDate) {
        where.date = {};
        if (input.startDate) where.date.gte = new Date(input.startDate);
        if (input.endDate) where.date.lte = new Date(input.endDate);
      }

      // Fetch all costs in range (for aggregation)
      const costs = await db.projectCost.findMany({
        where,
        select: {
          amount: true,
          category: true,
          source: true,
          date: true,
          boqItemId: true,
        },
         take: 1000, // bounded (pagination sweep) — see src/lib/pagination.ts
       });

      // Total
      const total = costs.reduce((s, c) => s + c.amount, 0);

      // By category
      const byCategory: Record<string, number> = {};
      for (const c of costs) {
        byCategory[c.category] = (byCategory[c.category] ?? 0) + c.amount;
      }

      // By source
      const bySource: Record<string, number> = {};
      for (const c of costs) {
        bySource[c.source] = (bySource[c.source] ?? 0) + c.amount;
      }

      // By date (daily totals)
      const byDate: Record<string, number> = {};
      for (const c of costs) {
        const dateKey = new Date(c.date).toISOString().slice(0, 10);
        byDate[dateKey] = (byDate[dateKey] ?? 0) + c.amount;
      }

      // By BOQ item (for variance analysis)
      const byBoqItem: Record<string, number> = {};
      for (const c of costs) {
        if (c.boqItemId) {
          byBoqItem[c.boqItemId] = (byBoqItem[c.boqItemId] ?? 0) + c.amount;
        }
      }

      return {
        total,
        count: costs.length,
        byCategory,
        bySource,
        byDate,
        byBoqItem,
      };
    }),

  /** Create a manual expense entry. */
  create: protectedProcedure
    .input(CreateExpenseSchema)
    .mutation(async ({ ctx, input }) => {
      await assertCanWrite(ctx.user, input.projectId);
      // FISCAL LOCK FIX (audit §4): project costs had NO lock — a
      // back-dated cost distorted the actuals of a closed fiscal year.
      // Check the cost's own date (defaults to today).
      await assertNotLocked(ctx.user.organizationId, input.date ? new Date(input.date) : new Date());

      // Validate receipt size if provided
      if (input.receiptData) {
        const estimatedBytes = Math.ceil((input.receiptData.length * 3) / 4);
        if (estimatedBytes > MAX_RECEIPT_SIZE) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Receipt image too large. Max ${MAX_RECEIPT_SIZE / 1024 / 1024}MB.`,
          });
        }
      }

      const cost = await db.projectCost.create({
        data: {
          projectId: input.projectId,
          date: input.date ? new Date(input.date) : new Date(),
          amount: input.amount,
          category: input.category,
          subcategory: input.subcategory || null,
          description: input.description || null,
          boqItemId: input.boqItemId || null,
          ganttTaskId: input.ganttTaskId || null,
          subcontractorId: input.subcontractorId || null,
          source: "manual",
          vendor: input.vendor || null,
          paymentMode: input.paymentMode || null,
          receiptData: input.receiptData || null,
          receiptFileType: input.receiptFileType || null,
          notes: input.notes || null,
          createdById: ctx.user.id,
        },
      });

      await audit({
        userId: ctx.user.id,
        projectId: input.projectId,
        action: "project_cost.create",
        entityType: "project_cost",
        entityId: cost.id,
        metadata: {
          amount: cost.amount,
          category: cost.category,
          subcategory: cost.subcategory,
          date: cost.date.toISOString(),
        },
      });

      await invalidateProjectCache(input.projectId, ["cashflow"]);
      return { cost };
    }),

  /** Delete a manual expense (auto-captured costs can't be deleted from here). */
  delete: protectedProcedure
    .input(z.object({ id: z.string(), projectId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await assertCanWrite(ctx.user, input.projectId);

      const existing = await db.projectCost.findFirst({
        where: { id: input.id, projectId: input.projectId },
      });
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Cost entry not found." });
      if (existing.source !== "manual") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Auto-captured costs can't be deleted. Edit the source (daily report, IPC, etc.) instead.",
        });
      }

      await db.projectCost.delete({ where: { id: input.id } });

      await audit({
        userId: ctx.user.id,
        projectId: input.projectId,
        action: "project_cost.delete",
        entityType: "project_cost",
        entityId: input.id,
        metadata: { amount: existing.amount, category: existing.category },
      });

      await invalidateProjectCache(input.projectId, ["cashflow"]);
      return { ok: true };
    }),

  /** Export costs as CSV for Tally/QuickBooks import. */
  exportCsv: protectedProcedure
    .input(z.object({
      projectId: z.string(),
      startDate: safeDateSchema.optional(),
      endDate: safeDateSchema.optional(),
    }))
    .query(async ({ ctx, input }) => {
      await assertProjectMember(ctx.user, input.projectId);

      const where: any = { projectId: input.projectId };
      if (input.startDate || input.endDate) {
        where.date = {};
        if (input.startDate) where.date.gte = new Date(input.startDate);
        if (input.endDate) where.date.lte = new Date(input.endDate);
      }

      const costs = await db.projectCost.findMany({
        where,
        orderBy: { date: "asc" },
        include: {
          boqItem: { select: { code: true, description: true } },
          ganttTask: { select: { code: true, name: true } },
          subcontractor: { select: { name: true } },
        },
         take: 1000, // bounded (pagination sweep) — see src/lib/pagination.ts
       });

      // Build CSV
      const headers = [
        "Date", "Amount", "Category", "Subcategory", "Description",
        "BOQ Code", "BOQ Description", "Task Code", "Task Name",
        "Vendor/Payee", "Payment Mode", "Source", "Source Ref", "Notes",
      ];
      const rows = costs.map(c => [
        new Date(c.date).toLocaleDateString("en-GB"),
        c.amount.toFixed(2),
        c.category,
        c.subcategory || "",
        c.description || "",
        c.boqItem?.code || "",
        c.boqItem?.description || "",
        c.ganttTask?.code || "",
        c.ganttTask?.name || "",
        c.vendor || "",
        c.paymentMode || "",
        c.source,
        c.sourceRef || "",
        c.notes || "",
      ]);

      const csv = [
        headers.join(","),
        ...rows.map(r => r.map(field => `"${String(field).replace(/"/g, '""')}"`).join(",")),
      ].join("\n");

      return { csv, count: costs.length };
    }),
});
