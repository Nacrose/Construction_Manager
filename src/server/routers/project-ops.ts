/**
 * Combined router for Payment, Safety, Quality, and Meeting modules.
 * Each is a separate sub-router for clean separation.
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "@/server/trpc";
import { db } from "@/lib/db";
import { assertProjectMember, assertCanWrite } from "@/lib/authz";
import { audit } from "@/lib/audit";

// ─── Payment Router ─────────────────────────────────────────
const paymentRouter = router({
  list: protectedProcedure
    .input(
      z.object({
        projectId: z.string(),
        payeeType: z.string().optional(),
        category: z.string().optional(),
        subCategory: z.string().optional(),
        allocationType: z.string().optional(),
        accountingSoftware: z.string().optional(),
        fromDate: z.string().optional(),
        toDate: z.string().optional(),
        search: z.string().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      await assertProjectMember(ctx.user, input.projectId);
      const where: any = { projectId: input.projectId };
      if (input.payeeType) where.payeeType = input.payeeType;
      if (input.category) where.category = input.category;
      if (input.subCategory) where.subCategory = input.subCategory;
      if (input.allocationType) where.allocationType = input.allocationType;
      if (input.accountingSoftware) where.accountingSoftware = input.accountingSoftware;

      if (input.fromDate || input.toDate) {
        where.paymentDate = {};
        if (input.fromDate) where.paymentDate.gte = new Date(input.fromDate);
        if (input.toDate) where.paymentDate.lte = new Date(input.toDate);
      }

      if (input.search) {
        where.OR = [
          { payeeName: { contains: input.search, mode: "insensitive" } },
          { partyPan: { contains: input.search, mode: "insensitive" } },
          { accountingVoucherNo: { contains: input.search, mode: "insensitive" } },
          { chequeNo: { contains: input.search, mode: "insensitive" } },
          { notes: { contains: input.search, mode: "insensitive" } },
        ];
      }

      const payments = await db.payment.findMany({
        where,
        include: {
          paymentCategory: {
            select: { name: true, nameNp: true, code: true, color: true, icon: true },
          },
        },
        orderBy: { paymentDate: "desc" },
      });
      return { payments };
    }),

  create: protectedProcedure
    .input(
      z.object({
        projectId: z.string(),
        payeeType: z.string(),
        payeeName: z.string().min(1),
        partyPan: z.string().optional(),
        payeeId: z.string().optional(),
        ipcId: z.string().optional(),
        invoiceNumber: z.string().optional(),
        amount: z.number().positive(),
        tdsDeducted: z.number().default(0),
        vatIncluded: z.number().default(0),
        netPaid: z.number().default(0),
        paymentDate: z.string().optional(),
        paymentMiti: z.string().optional(),
        paymentMode: z.enum(["cash", "bank_transfer", "cheque", "mobile_pay", "connectips"]).default("bank_transfer"),
        chequeNo: z.string().optional(),
        bankRef: z.string().optional(),
        bankAccount: z.string().optional(),
        retentionReleased: z.number().default(0),
        notes: z.string().optional(),
        categoryId: z.string().optional(),
        subCategoryId: z.string().optional(),
        category: z.string().optional(),
        subCategory: z.string().optional(),
        allocationType: z.enum(["specific_payee", "bulk_category", "advance"]).default("specific_payee"),
        accountingSoftware: z.enum(["tally", "swastik", "other"]).optional(),
        accountingVoucherNo: z.string().optional(),
        voucherType: z.enum(["payment", "bank_payment", "cash_payment", "journal"]).optional().default("payment"),
        scannedBillUrl: z.string().optional(),
        scannedBillName: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await assertCanWrite(ctx.user, input.projectId);
      const { projectId, ...data } = input;

      let resolvedCategory = data.category;
      let resolvedSubCategory = data.subCategory;

      if (data.categoryId && !resolvedCategory) {
        const cat = await db.paymentCategory.findUnique({ where: { id: data.categoryId } });
        if (cat) resolvedCategory = cat.name;
      }
      if (data.subCategoryId && !resolvedSubCategory) {
        const sub = await db.paymentCategory.findUnique({ where: { id: data.subCategoryId } });
        if (sub) resolvedSubCategory = sub.name;
      }

      const payment = await db.payment.create({
        data: {
          projectId,
          ...data,
          category: resolvedCategory,
          subCategory: resolvedSubCategory,
          paymentDate: data.paymentDate ? new Date(data.paymentDate) : new Date(),
          netPaid: data.netPaid || (data.amount - data.tdsDeducted),
          isBillAttached: Boolean(data.scannedBillUrl),
          createdById: ctx.user.id,
        },
      });

      // If linked to a Subcontractor Bill, update bill's paidAmount
      if (data.invoiceNumber && data.payeeType === "subcontractor") {
        const subBill = await db.subcontractorBill.findFirst({
          where: { projectId, number: data.invoiceNumber },
        });
        if (subBill) {
          const newPaid = (subBill.paidAmount || 0) + data.amount;
          await db.subcontractorBill.update({
            where: { id: subBill.id },
            data: {
              paidAmount: newPaid,
              status: newPaid >= subBill.netPayable ? "paid" : "approved",
            },
          });
        }
      }

      await audit({
        userId: ctx.user.id,
        projectId,
        action: "payment.create",
        entityType: "payment",
        entityId: payment.id,
        metadata: { amount: data.amount, payeeName: data.payeeName, category: resolvedCategory },
      });
      return { payment };
    }),

  /** Bulk Create / Import Payments from Tally, Swastik, or Excel sheet */
  bulkCreate: protectedProcedure
    .input(
      z.object({
        projectId: z.string(),
        payments: z.array(
          z.object({
            payeeType: z.string().default("vendor"),
            payeeName: z.string().min(1),
            partyPan: z.string().optional(),
            amount: z.number().positive(),
            tdsDeducted: z.number().default(0),
            paymentDate: z.string().optional(),
            paymentMiti: z.string().optional(),
            paymentMode: z.enum(["cash", "bank_transfer", "cheque", "mobile_pay", "connectips"]).default("bank_transfer"),
            chequeNo: z.string().optional(),
            bankAccount: z.string().optional(),
            category: z.string().optional(),
            subCategory: z.string().optional(),
            allocationType: z.enum(["specific_payee", "bulk_category", "advance"]).default("specific_payee"),
            accountingSoftware: z.enum(["tally", "swastik", "other"]).optional(),
            accountingVoucherNo: z.string().optional(),
            voucherType: z.enum(["payment", "bank_payment", "cash_payment", "journal"]).optional().default("payment"),
            notes: z.string().optional(),
          })
        ),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await assertCanWrite(ctx.user, input.projectId);

      const createdPayments: any[] = [];
      for (const p of input.payments) {
        const item = await db.payment.create({
          data: {
            projectId: input.projectId,
            ...p,
            paymentDate: p.paymentDate ? new Date(p.paymentDate) : new Date(),
            netPaid: p.amount - (p.tdsDeducted || 0),
            createdById: ctx.user.id,
          },
        });
        createdPayments.push(item);
      }

      await audit({
        userId: ctx.user.id,
        projectId: input.projectId,
        action: "payment.bulk_import",
        entityType: "payment",
        entityId: input.projectId,
        metadata: { importedCount: createdPayments.length },
      });

      return { count: createdPayments.length, payments: createdPayments };
    }),

  /** Category Summary & Cost Head Breakdown */
  categorySummary: protectedProcedure
    .input(z.object({ projectId: z.string(), fromDate: z.string().optional(), toDate: z.string().optional() }))
    .query(async ({ ctx, input }) => {
      await assertProjectMember(ctx.user, input.projectId);

      const where: any = { projectId: input.projectId, status: "paid" };
      if (input.fromDate || input.toDate) {
        where.paymentDate = {};
        if (input.fromDate) where.paymentDate.gte = new Date(input.fromDate);
        if (input.toDate) where.paymentDate.lte = new Date(input.toDate);
      }

      const payments = await db.payment.findMany({
        where,
        select: {
          amount: true,
          tdsDeducted: true,
          netPaid: true,
          category: true,
          subCategory: true,
          allocationType: true,
          accountingSoftware: true,
        },
      });

      const categories: Record<
        string,
        {
          totalGross: number;
          totalTds: number;
          totalNet: number;
          count: number;
          subcategories: Record<string, { totalGross: number; count: number }>;
        }
      > = {};

      for (const p of payments) {
        const cat = p.category || "Uncategorized";
        const sub = p.subCategory || "General";

        if (!categories[cat]) {
          categories[cat] = {
            totalGross: 0,
            totalTds: 0,
            totalNet: 0,
            count: 0,
            subcategories: {},
          };
        }

        categories[cat].totalGross += p.amount;
        categories[cat].totalTds += p.tdsDeducted;
        categories[cat].totalNet += p.netPaid;
        categories[cat].count += 1;

        if (!categories[cat].subcategories[sub]) {
          categories[cat].subcategories[sub] = { totalGross: 0, count: 0 };
        }
        categories[cat].subcategories[sub].totalGross += p.amount;
        categories[cat].subcategories[sub].count += 1;
      }

      const totalGross = payments.reduce((s, p) => s + p.amount, 0);
      const totalTds = payments.reduce((s, p) => s + p.tdsDeducted, 0);
      const totalNet = payments.reduce((s, p) => s + p.netPaid, 0);

      return {
        totalGross,
        totalTds,
        totalNet,
        count: payments.length,
        breakdown: Object.entries(categories).map(([name, data]) => ({
          category: name,
          ...data,
          subcategories: Object.entries(data.subcategories).map(([subName, subData]) => ({
            name: subName,
            ...subData,
          })),
        })),
      };
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string(), projectId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await assertCanWrite(ctx.user, input.projectId);
      await db.payment.delete({ where: { id: input.id } });
      return { ok: true };
    }),

  /** Attach Scanned Copy of Payment Voucher / Cheque / connectIPS receipt */
  attachScannedBill: protectedProcedure
    .input(
      z.object({
        projectId: z.string(),
        paymentId: z.string(),
        scannedBillUrl: z.string().min(1),
        scannedBillName: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await assertCanWrite(ctx.user, input.projectId);

      await db.payment.update({
        where: { id: input.paymentId },
        data: {
          scannedBillUrl: input.scannedBillUrl,
          scannedBillName: input.scannedBillName || "payment-voucher",
          isBillAttached: true,
        },
      });

      return { success: true };
    }),

  stats: protectedProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ ctx, input }) => {
      await assertProjectMember(ctx.user, input.projectId);
      const payments = await db.payment.findMany({ where: { projectId: input.projectId, status: "paid" }, select: { amount: true, tdsDeducted: true, payeeType: true, retentionReleased: true, category: true, accountingSoftware: true } });
      const totalPaid = payments.reduce((s, p) => s + p.amount, 0);
      const totalTds = payments.reduce((s, p) => s + p.tdsDeducted, 0);
      const totalRetentionReleased = payments.reduce((s, p) => s + p.retentionReleased, 0);
      const byPayeeType: Record<string, number> = {};
      const byCategory: Record<string, number> = {};
      payments.forEach(p => {
        byPayeeType[p.payeeType] = (byPayeeType[p.payeeType] ?? 0) + p.amount;
        const cat = p.category || "Uncategorized";
        byCategory[cat] = (byCategory[cat] ?? 0) + p.amount;
      });
      return { totalPaid, totalTds, totalRetentionReleased, count: payments.length, byPayeeType, byCategory };
    }),

  /**
   * Retention summary — per-subcontractor breakdown of retention held vs released.
   * Also aggregates IPC retention amounts.
   */
  retentionSummary: protectedProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ ctx, input }) => {
      await assertProjectMember(ctx.user, input.projectId);

      // Get all subcontractors with their retention fields
      const subcontractors = await db.subcontractor.findMany({
        where: { projectId: input.projectId },
        select: {
          id: true, name: true, contractValue: true,
          totalRetentionHeld: true, totalRetentionReleased: true,
        },
        orderBy: { name: "asc" },
      });

      // Get IPC retention amounts per subcontractor
      const ipcs = await db.ipc.findMany({
        where: { projectId: input.projectId, subcontractorId: { not: null } },
        select: { subcontractorId: true, retentionAmount: true, status: true },
      });

      const ipcRetentionBySub = new Map<string, number>();
      for (const ipc of ipcs) {
        if (!ipc.subcontractorId) continue;
        ipcRetentionBySub.set(
          ipc.subcontractorId,
          (ipcRetentionBySub.get(ipc.subcontractorId) ?? 0) + ipc.retentionAmount
        );
      }

      // Get retention release payments per subcontractor
      const releasePayments = await db.payment.findMany({
        where: { projectId: input.projectId, payeeType: "subcontractor", retentionReleased: { gt: 0 } },
        select: { payeeId: true, retentionReleased: true, paymentDate: true },
      });
      const releasedBySub = new Map<string, number>();
      for (const p of releasePayments) {
        if (!p.payeeId) continue;
        releasedBySub.set(p.payeeId, (releasedBySub.get(p.payeeId) ?? 0) + p.retentionReleased);
      }

      const rows = subcontractors.map((s) => {
        const ipcRetention = ipcRetentionBySub.get(s.id) ?? 0;
        const released = releasedBySub.get(s.id) ?? s.totalRetentionReleased;
        const held = Math.max(0, ipcRetention - released);
        return {
          subcontractorId: s.id,
          subcontractorName: s.name,
          contractValue: s.contractValue,
          ipcRetention,
          released,
          held,
          releasePercent: s.contractValue > 0 ? (released / s.contractValue) * 100 : 0,
        };
      });

      const totalHeld = rows.reduce((s, r) => s + r.held, 0);
      const totalReleased = rows.reduce((s, r) => s + r.released, 0);
      const totalIpcRetention = rows.reduce((s, r) => s + r.ipcRetention, 0);

      return {
        rows,
        totals: {
          totalHeld,
          totalReleased,
          totalIpcRetention,
          subcontractorCount: rows.length,
        },
      };
    }),

  /**
   * Release retention — record a payment that releases held retention
   * back to a subcontractor. Updates the subcontractor's released total.
   */
  releaseRetention: protectedProcedure
    .input(z.object({
      projectId: z.string(),
      subcontractorId: z.string(),
      amount: z.number().positive(),
      paymentDate: z.string().datetime().optional(),
      paymentMode: z.enum(["cash", "bank_transfer", "cheque", "mobile_pay"]).default("bank_transfer"),
      chequeNo: z.string().optional(),
      bankRef: z.string().optional(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await assertCanWrite(ctx.user, input.projectId);

      const sub = await db.subcontractor.findFirst({
        where: { id: input.subcontractorId, projectId: input.projectId },
        select: { id: true, name: true, totalRetentionHeld: true, totalRetentionReleased: true },
      });
      if (!sub) throw new TRPCError({ code: "NOT_FOUND", message: "Subcontractor not found" });

      // Create payment record
      const payment = await db.payment.create({
        data: {
          projectId: input.projectId,
          payeeType: "subcontractor",
          payeeId: input.subcontractorId,
          payeeName: sub.name,
          amount: input.amount,
          netPaid: input.amount,
          retentionReleased: input.amount,
          paymentDate: input.paymentDate ? new Date(input.paymentDate) : new Date(),
          paymentMode: input.paymentMode,
          chequeNo: input.chequeNo,
          bankRef: input.bankRef,
          notes: input.notes || "Retention release",
          status: "paid",
          createdById: ctx.user.id,
        },
      });

      // Update subcontractor's released total
      await db.subcontractor.update({
        where: { id: input.subcontractorId },
        data: {
          totalRetentionReleased: sub.totalRetentionReleased + input.amount,
        },
      });

      await audit({
        userId: ctx.user.id,
        projectId: input.projectId,
        action: "payment.retention_release",
        entityType: "subcontractor",
        entityId: input.subcontractorId,
        metadata: { amount: input.amount, subcontractorName: sub.name, paymentId: payment.id },
      });

      return { payment };
    }),

  /**
   * Aging report — shows outstanding payments by age bucket
   * (0-30, 31-60, 61-90, 90+ days).
   */
  agingReport: protectedProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ ctx, input }) => {
      await assertProjectMember(ctx.user, input.projectId);

      // Get IPCs that are approved/certified but not yet paid
      const ipcs = await db.ipc.findMany({
        where: {
          projectId: input.projectId,
          status: { in: ["approved", "certified"] },
        },
        select: {
          id: true, number: true, period: true, issueDate: true,
          finalPayable: true, status: true,
          subcontractor: { select: { id: true, name: true } },
        },
        orderBy: { issueDate: "asc" },
      });

      // Get payments linked to IPCs (to subtract what's already paid)
      const ipcPayments = await db.payment.findMany({
        where: {
          projectId: input.projectId,
          ipcId: { not: null },
          status: "paid",
        },
        select: { ipcId: true, amount: true },
      });
      const paidByIpc = new Map<string, number>();
      for (const p of ipcPayments) {
        if (!p.ipcId) continue;
        paidByIpc.set(p.ipcId, (paidByIpc.get(p.ipcId) ?? 0) + p.amount);
      }

      const now = new Date();
      const buckets = { current: 0, d30: 0, d60: 0, d90: 0, d90plus: 0 };
      const rows: Array<{
        ipcId: string;
        ipcNumber: string;
        payeeName: string;
        issueDate: Date | null;
        finalPayable: number;
        paidAmount: number;
        outstanding: number;
        ageDays: number;
        bucket: "current" | "d30" | "d60" | "d90" | "d90plus";
      }> = [];

      for (const ipc of ipcs) {
        const paid = paidByIpc.get(ipc.id) ?? 0;
        const outstanding = (ipc.finalPayable ?? 0) - paid;
        if (outstanding <= 0.01) continue; // skip fully paid

        const ageDays = ipc.issueDate
          ? Math.floor((now.getTime() - new Date(ipc.issueDate).getTime()) / (1000 * 60 * 60 * 24))
          : 0;

        let bucket: "current" | "d30" | "d60" | "d90" | "d90plus";
        if (ageDays <= 30) bucket = "current";
        else if (ageDays <= 60) bucket = "d30";
        else if (ageDays <= 90) bucket = "d60";
        else if (ageDays <= 120) bucket = "d90";
        else bucket = "d90plus";

        buckets[bucket] += outstanding;

        rows.push({
          ipcId: ipc.id,
          ipcNumber: ipc.number,
          payeeName: ipc.subcontractor?.name ?? "General",
          issueDate: ipc.issueDate,
          finalPayable: ipc.finalPayable ?? 0,
          paidAmount: paid,
          outstanding,
          ageDays,
          bucket,
        });
      }

      return {
        rows: rows.sort((a, b) => b.ageDays - a.ageDays),
        buckets,
        totalOutstanding: rows.reduce((s, r) => s + r.outstanding, 0),
      };
    }),
});

// ─── Safety Router ──────────────────────────────────────────
const safetyRouter = router({
  list: protectedProcedure
    .input(z.object({ projectId: z.string(), type: z.string().optional(), status: z.string().optional() }))
    .query(async ({ ctx, input }) => {
      await assertProjectMember(ctx.user, input.projectId);
      const where: any = { projectId: input.projectId };
      if (input.type) where.type = input.type;
      if (input.status) where.status = input.status;
      const incidents = await db.safetyIncident.findMany({ where, orderBy: { date: "desc" } });
      return { incidents };
    }),

  create: protectedProcedure
    .input(z.object({
      projectId: z.string(), type: z.enum(["incident", "near_miss", "toolbox_talk", "observation"]).default("incident"),
      severity: z.enum(["minor", "moderate", "serious", "fatal"]).default("minor"),
      title: z.string().min(1), description: z.string().min(1), location: z.string().optional(),
      reportedBy: z.string().optional(), involvedPersons: z.string().optional(),
      actionTaken: z.string().optional(), rootCause: z.string().optional(), preventiveAction: z.string().optional(),
      photoData: z.string().optional(), photoName: z.string().optional(), photoType: z.string().optional(),
      toolboxTopic: z.string().optional(), toolboxAttendees: z.string().optional(),
      date: z.string().datetime().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await assertCanWrite(ctx.user, input.projectId);
      const { projectId, ...data } = input;
      const incident = await db.safetyIncident.create({ data: { projectId, ...data, date: data.date ? new Date(data.date) : new Date(), createdById: ctx.user.id } });
      await audit({ userId: ctx.user.id, projectId, action: "safety.create", entityType: "safety_incident", entityId: incident.id, metadata: { type: data.type, title: data.title } });
      return { incident };
    }),

  updateStatus: protectedProcedure
    .input(z.object({ id: z.string(), status: z.enum(["reported", "investigating", "resolved", "closed"]), rootCause: z.string().optional(), preventiveAction: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const incident = await db.safetyIncident.findUnique({ where: { id: input.id }, select: { projectId: true } });
      if (!incident) throw new TRPCError({ code: "NOT_FOUND" });
      await assertCanWrite(ctx.user, incident.projectId);
      const updated = await db.safetyIncident.update({ where: { id: input.id }, data: { status: input.status, ...(input.rootCause !== undefined && { rootCause: input.rootCause }), ...(input.preventiveAction !== undefined && { preventiveAction: input.preventiveAction }) } });
      return { incident: updated };
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string(), projectId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await assertCanWrite(ctx.user, input.projectId);
      await db.safetyIncident.delete({ where: { id: input.id } });
      return { ok: true };
    }),

  stats: protectedProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ ctx, input }) => {
      await assertProjectMember(ctx.user, input.projectId);
      const incidents = await db.safetyIncident.findMany({ where: { projectId: input.projectId }, select: { type: true, severity: true, status: true } });
      return {
        total: incidents.length,
        incidents: incidents.filter(i => i.type === "incident").length,
        nearMiss: incidents.filter(i => i.type === "near_miss").length,
        toolbox: incidents.filter(i => i.type === "toolbox_talk").length,
        observations: incidents.filter(i => i.type === "observation").length,
        open: incidents.filter(i => i.status === "reported" || i.status === "investigating").length,
        resolved: incidents.filter(i => i.status === "resolved" || i.status === "closed").length,
        serious: incidents.filter(i => i.severity === "serious" || i.severity === "fatal").length,
      };
    }),
});

// ─── Quality Inspection Router ──────────────────────────────
const qualityRouter = router({
  list: protectedProcedure
    .input(z.object({ projectId: z.string(), status: z.string().optional(), type: z.string().optional() }))
    .query(async ({ ctx, input }) => {
      await assertProjectMember(ctx.user, input.projectId);
      const where: any = { projectId: input.projectId };
      if (input.status) where.status = input.status;
      if (input.type) where.inspectionType = input.type;
      const inspections = await db.qualityInspection.findMany({ where, orderBy: { requestedDate: "desc" } });
      return { inspections };
    }),

  create: protectedProcedure
    .input(z.object({
      projectId: z.string(), number: z.string().min(1), title: z.string().min(1),
      inspectionType: z.enum(["work_inspection", "material_test", "ncr", "site_audit"]).default("work_inspection"),
      location: z.string().optional(), boqItemId: z.string().optional(), ganttTaskId: z.string().optional(),
      scheduledDate: z.string().datetime().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await assertCanWrite(ctx.user, input.projectId);
      const { projectId, ...data } = input;
      const inspection = await db.qualityInspection.create({ data: { projectId, ...data, scheduledDate: data.scheduledDate ? new Date(data.scheduledDate) : null, createdById: ctx.user.id } });
      await audit({ userId: ctx.user.id, projectId, action: "quality.create", entityType: "quality_inspection", entityId: inspection.id, metadata: { number: inspection.number } });
      return { inspection };
    }),

  complete: protectedProcedure
    .input(z.object({
      id: z.string(), result: z.enum(["pass", "fail", "conditional_pass"]), remarks: z.string().optional(),
      inspectedBy: z.string().optional(), checklist: z.string().optional(),
      photoData: z.string().optional(), photoName: z.string().optional(), photoType: z.string().optional(),
      ncrNumber: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const qi = await db.qualityInspection.findUnique({ where: { id: input.id }, select: { projectId: true } });
      if (!qi) throw new TRPCError({ code: "NOT_FOUND" });
      await assertCanWrite(ctx.user, qi.projectId);
      const updated = await db.qualityInspection.update({
        where: { id: input.id },
        data: { status: input.result === "fail" ? "ncr_raised" : "completed", result: input.result, remarks: input.remarks, inspectedBy: input.inspectedBy, inspectedDate: new Date(), checklist: input.checklist, photoData: input.photoData, photoName: input.photoName, photoType: input.photoType, ncrNumber: input.ncrNumber },
      });
      return { inspection: updated };
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string(), projectId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await assertCanWrite(ctx.user, input.projectId);
      await db.qualityInspection.delete({ where: { id: input.id } });
      return { ok: true };
    }),

  stats: protectedProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ ctx, input }) => {
      await assertProjectMember(ctx.user, input.projectId);
      const inspections = await db.qualityInspection.findMany({ where: { projectId: input.projectId }, select: { status: true, result: true } });
      return {
        total: inspections.length,
        pending: inspections.filter(i => i.status === "requested" || i.status === "scheduled").length,
        completed: inspections.filter(i => i.status === "completed").length,
        passed: inspections.filter(i => i.result === "pass").length,
        failed: inspections.filter(i => i.result === "fail").length,
        ncr: inspections.filter(i => i.status === "ncr_raised").length,
      };
    }),
});

// ─── Meeting Router ─────────────────────────────────────────
const meetingRouter = router({
  list: protectedProcedure
    .input(z.object({ projectId: z.string(), status: z.string().optional() }))
    .query(async ({ ctx, input }) => {
      await assertProjectMember(ctx.user, input.projectId);
      const where: any = { projectId: input.projectId };
      if (input.status) where.status = input.status;
      const meetings = await db.meeting.findMany({ where, orderBy: { date: "desc" }, include: { _count: { select: { actionItems: true } } } });
      return { meetings };
    }),

  create: protectedProcedure
    .input(z.object({
      projectId: z.string(), title: z.string().min(1),
      type: z.enum(["site_coordination", "progress_review", "design_coordination", "safety", "other"]).default("site_coordination"),
      date: z.string().datetime().optional(), location: z.string().optional(),
      attendees: z.string().optional(), agenda: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await assertCanWrite(ctx.user, input.projectId);
      const { projectId, ...data } = input;
      const meeting = await db.meeting.create({ data: { projectId, ...data, date: data.date ? new Date(data.date) : new Date(), createdById: ctx.user.id } });
      return { meeting };
    }),

  update: protectedProcedure
    .input(z.object({
      id: z.string(), minutes: z.string().optional(), status: z.enum(["scheduled", "completed", "cancelled"]).optional(),
      attendees: z.string().optional(), agenda: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const m = await db.meeting.findUnique({ where: { id: input.id }, select: { projectId: true } });
      if (!m) throw new TRPCError({ code: "NOT_FOUND" });
      await assertCanWrite(ctx.user, m.projectId);
      const updated = await db.meeting.update({ where: { id: input.id }, data: input });
      return { meeting: updated };
    }),

  addActionItem: protectedProcedure
    .input(z.object({ meetingId: z.string(), description: z.string().min(1), assignedTo: z.string().min(1), dueDate: z.string().datetime().optional() }))
    .mutation(async ({ ctx, input }) => {
      const m = await db.meeting.findUnique({ where: { id: input.meetingId }, select: { projectId: true } });
      if (!m) throw new TRPCError({ code: "NOT_FOUND" });
      await assertCanWrite(ctx.user, m.projectId);
      const item = await db.meetingActionItem.create({ data: { meetingId: input.meetingId, description: input.description, assignedTo: input.assignedTo, dueDate: input.dueDate ? new Date(input.dueDate) : null } });
      return { actionItem: item };
    }),

  updateActionItem: protectedProcedure
    .input(z.object({ id: z.string(), status: z.enum(["open", "in_progress", "completed"]), notes: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const item = await db.meetingActionItem.findUnique({ where: { id: input.id }, include: { meeting: { select: { projectId: true } } } });
      if (!item) throw new TRPCError({ code: "NOT_FOUND" });
      await assertCanWrite(ctx.user, item.meeting.projectId);
      const updated = await db.meetingActionItem.update({ where: { id: input.id }, data: { status: input.status, notes: input.notes, completedDate: input.status === "completed" ? new Date() : null } });
      return { actionItem: updated };
    }),

  get: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const meeting = await db.meeting.findUnique({ where: { id: input.id }, include: { actionItems: { orderBy: { createdAt: "desc" } } } });
      if (!meeting) throw new TRPCError({ code: "NOT_FOUND" });
      await assertProjectMember(ctx.user, meeting.projectId);
      return { meeting };
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string(), projectId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await assertCanWrite(ctx.user, input.projectId);
      await db.meeting.delete({ where: { id: input.id } });
      return { ok: true };
    }),
});

export const projectOpsRouter = router({
  payment: paymentRouter,
  safety: safetyRouter,
  quality: qualityRouter,
  meeting: meetingRouter,
});
