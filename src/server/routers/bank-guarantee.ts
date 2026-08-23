/**
 * Bank Guarantee & Insurance Policy Router (बैंक ग्यारेन्टी तथा बीमा ट्र्याकर).
 * Manages Performance Bonds, APG, CAR Insurance, and Retention Guarantees with automated expiry alerts.
 */
import { z } from "zod";
import { router, protectedProcedure } from "@/server/trpc";
import { db } from "@/lib/db";
import { assertProjectMember, assertProjectManager } from "@/lib/authz";
import { audit } from "@/lib/audit";
import { assertNotLocked } from "@/lib/fiscal-year-lock";
import { adToBs, bsToAd } from "@/lib/nepali-calendar";
import { TRPCError } from "@trpc/server";

export const bankGuaranteeRouter = router({
  /** List all bank guarantees and insurance policies for a project */
  list: protectedProcedure
    .input(
      z.object({
        projectId: z.string(),
        status: z.enum(["all", "active", "extended", "released", "expired"]).optional(),
        type: z.string().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      await assertProjectMember(ctx.user, input.projectId);

      const where: any = { projectId: input.projectId };
      if (input.status && input.status !== "all") {
        where.status = input.status;
      }
      if (input.type && input.type !== "all") {
        where.type = input.type;
      }

      const rawItems = await db.bankGuarantee.findMany({
        where,
        orderBy: { expiryDate: "asc" },
      });

      const now = new Date();

      const items = rawItems.map((g) => {
        const diffMs = new Date(g.expiryDate).getTime() - now.getTime();
        const daysRemaining = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
        const isExpiringSoon = daysRemaining >= 0 && daysRemaining <= 30 && (g.status === "active" || g.status === "extended");
        const isExpired = daysRemaining < 0 && (g.status === "active" || g.status === "extended");

        return {
          ...g,
          daysRemaining,
          isExpiringSoon,
          isExpired,
        };
      });

      // Auto-update expired guarantees: if a guarantee's expiry date has
      // passed but its status is still "active" or "extended", mark it as
      // "expired" in the database. Previously the status was never
      // auto-updated, so expired guarantees continued to show as "active"
      // in reports and inflated the totalActiveExposure KPI.
      const expiredIds = items.filter((g) => g.isExpired).map((g) => g.id);
      if (expiredIds.length > 0) {
        await db.bankGuarantee.updateMany({
          where: { id: { in: expiredIds } },
          data: { status: "expired" },
        });
      }

      // Recompute the active set AFTER marking expired ones — otherwise
      // the just-expired guarantees would still be counted in the KPIs.
      const activeGuarantees = items.filter(
        (g) => (g.status === "active" || g.status === "extended") && !g.isExpired,
      );
      const totalActiveExposure = activeGuarantees.reduce((s, g) => s + g.amount, 0);
      const totalMarginHeld = activeGuarantees.reduce((s, g) => s + g.marginAmount, 0);
      const totalCommissionPaid = items.reduce((s, g) => s + g.commissionPaid, 0);
      const expiringWithin30DaysCount = activeGuarantees.filter((g) => g.daysRemaining <= 30 && g.daysRemaining >= 0).length;
      const expiredCount = items.filter((g) => g.isExpired).length;

      return {
        items,
        kpis: {
          totalActiveExposure,
          totalMarginHeld,
          totalCommissionPaid,
          expiringWithin30DaysCount,
          expiredCount,
          activeCount: activeGuarantees.length,
          totalCount: items.length,
        },
      };
    }),

  /** Cross-project alerts for the main executive dashboard */
  portfolioAlerts: protectedProcedure.query(async ({ ctx }) => {
    const memberships = await db.projectMember.findMany({
      where: { userId: ctx.user.id },
      select: { projectId: true },
    });
    const projectIds = memberships.map((m) => m.projectId);

    if (projectIds.length === 0) {
      return { expiringSoon: [], totalActiveExposure: 0 };
    }

    const now = new Date();
    // 45 days lookahead threshold
    const lookaheadDate = new Date(now.getTime() + 45 * 24 * 60 * 60 * 1000);

    const activeGuarantees = await db.bankGuarantee.findMany({
      where: {
        projectId: { in: projectIds },
        status: { in: ["active", "extended"] },
      },
      include: {
        project: {
          select: { id: true, name: true, code: true },
        },
      },
      orderBy: { expiryDate: "asc" },
    });

    const expiringSoon = activeGuarantees
      .map((g) => {
        const diffMs = new Date(g.expiryDate).getTime() - now.getTime();
        const daysRemaining = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
        return {
          ...g,
          daysRemaining,
        };
      })
      .filter((g) => g.daysRemaining <= 45);

    const totalActiveExposure = activeGuarantees.reduce((s, g) => s + g.amount, 0);

    return {
      expiringSoon,
      totalActiveExposure,
    };
  }),

  /** Create a new Bank Guarantee or Insurance Policy */
  create: protectedProcedure
    .input(
      z.object({
        projectId: z.string(),
        type: z.enum([
          "performance_bond",
          "advance_payment",
          "car_insurance",
          "retention_bond",
          "bid_bond",
          "other",
        ]),
        guaranteeNumber: z.string().min(1, "Guarantee / Policy Number is required"),
        issuingBank: z.string().min(1, "Issuing Bank / Insurer is required"),
        branch: z.string().optional(),
        beneficiary: z.string().min(1, "Beneficiary (Client / Office) is required"),
        amount: z.number().positive("Amount must be greater than 0"),
        issuedDate: z.string(),
        issuedMiti: z.string().optional(),
        expiryDate: z.string(),
        expiryMiti: z.string().optional(),
        claimPeriodDays: z.number().default(30),
        purpose: z.string().optional(),
        marginAmount: z.number().default(0),
        commissionRate: z.number().default(0),
        commissionPaid: z.number().default(0),
        documentUrl: z.string().optional(),
        documentName: z.string().optional(),
        notes: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await assertProjectManager(ctx.user, input.projectId);
      await assertNotLocked(ctx.user.organizationId);

      const issuedD = new Date(input.issuedDate);
      const expiryD = new Date(input.expiryDate);

      if (isNaN(issuedD.getTime()) || isNaN(expiryD.getTime())) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid issued or expiry date format." });
      }

      if (expiryD.getTime() < issuedD.getTime()) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Guarantee expiry date cannot be earlier than issued date." });
      }

      let issuedMiti = input.issuedMiti;
      if (!issuedMiti) {
        try {
          issuedMiti = adToBs(issuedD).formatted;
        } catch {}
      }

      let expiryMiti = input.expiryMiti;
      if (!expiryMiti) {
        try {
          expiryMiti = adToBs(expiryD).formatted;
        } catch {}
      }

      const claimExpiryDate = new Date(expiryD.getTime() + (input.claimPeriodDays || 30) * 24 * 60 * 60 * 1000);

      const guarantee = await db.bankGuarantee.create({
        data: {
          projectId: input.projectId,
          type: input.type,
          guaranteeNumber: input.guaranteeNumber.trim(),
          issuingBank: input.issuingBank.trim(),
          branch: input.branch?.trim() || null,
          beneficiary: input.beneficiary.trim(),
          amount: input.amount,
          issuedDate: issuedD,
          issuedMiti: issuedMiti || null,
          expiryDate: expiryD,
          expiryMiti: expiryMiti || null,
          claimPeriodDays: input.claimPeriodDays,
          claimExpiryDate,
          status: "active",
          purpose: input.purpose?.trim() || null,
          marginAmount: input.marginAmount,
          commissionRate: input.commissionRate,
          commissionPaid: input.commissionPaid,
          documentUrl: input.documentUrl || null,
          documentName: input.documentName || null,
          notes: input.notes?.trim() || null,
        },
      });

      await audit({
        userId: ctx.user.id,
        projectId: input.projectId,
        action: "guarantee.create",
        entityType: "bank_guarantee",
        entityId: guarantee.id,
        metadata: {
          number: guarantee.guaranteeNumber,
          type: guarantee.type,
          amount: guarantee.amount,
        },
      });

      return { guarantee };
    }),

  /** Extend a Bank Guarantee (1-Click Amendment) */
  extend: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        newExpiryDate: z.string(),
        newExpiryMiti: z.string().optional(),
        amendmentLetterRef: z.string().optional(),
        additionalCommission: z.number().default(0),
        remarks: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const existing = await db.bankGuarantee.findUniqueOrThrow({
        where: { id: input.id },
      });
      await assertProjectManager(ctx.user, existing.projectId);

      const newExpiryD = new Date(input.newExpiryDate);
      if (isNaN(newExpiryD.getTime())) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid new expiry date format." });
      }

      if (newExpiryD.getTime() <= existing.expiryDate.getTime()) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "New expiry date must be strictly after current expiry date." });
      }
      let newMiti = input.newExpiryMiti;
      if (!newMiti) {
        try {
          newMiti = adToBs(newExpiryD).formatted;
        } catch {}
      }

      const claimExpiryDate = new Date(newExpiryD.getTime() + (existing.claimPeriodDays || 30) * 24 * 60 * 60 * 1000);

      const amendmentEntry = {
        date: new Date().toISOString(),
        oldExpiryDate: existing.expiryDate.toISOString(),
        oldExpiryMiti: existing.expiryMiti,
        newExpiryDate: newExpiryD.toISOString(),
        newExpiryMiti: newMiti,
        letterNo: input.amendmentLetterRef || null,
        additionalCommission: input.additionalCommission,
        remarks: input.remarks || null,
      };

      const prevAmendments = (existing.amendments as any[]) || [];
      const updatedAmendments = [...prevAmendments, amendmentEntry];

      const guarantee = await db.bankGuarantee.update({
        where: { id: input.id },
        data: {
          expiryDate: newExpiryD,
          expiryMiti: newMiti || null,
          claimExpiryDate,
          status: "extended",
          commissionPaid: existing.commissionPaid + input.additionalCommission,
          amendments: updatedAmendments,
        },
      });

      await audit({
        userId: ctx.user.id,
        projectId: existing.projectId,
        action: "guarantee.extend",
        entityType: "bank_guarantee",
        entityId: guarantee.id,
        metadata: {
          oldExpiryDate: existing.expiryDate,
          newExpiryDate: newExpiryD,
          amendmentLetterRef: input.amendmentLetterRef,
        },
      });

      return { guarantee };
    }),

  /** Mark a Guarantee as Released / Returned */
  release: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        releaseLetterRef: z.string().optional(),
        notes: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const existing = await db.bankGuarantee.findUniqueOrThrow({
        where: { id: input.id },
      });
      await assertProjectManager(ctx.user, existing.projectId);

      const guarantee = await db.bankGuarantee.update({
        where: { id: input.id },
        data: {
          status: "released",
          notes: input.notes
            ? `${existing.notes || ""}\nReleased with Ref: ${input.releaseLetterRef || "N/A"}. ${input.notes}`.trim()
            : existing.notes,
        },
      });

      await audit({
        userId: ctx.user.id,
        projectId: existing.projectId,
        action: "guarantee.release",
        entityType: "bank_guarantee",
        entityId: guarantee.id,
        metadata: {
          releaseLetterRef: input.releaseLetterRef,
        },
      });

      return { guarantee };
    }),

  /** Update guarantee details */
  update: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        guaranteeNumber: z.string().optional(),
        issuingBank: z.string().optional(),
        branch: z.string().optional(),
        beneficiary: z.string().optional(),
        amount: z.number().optional(),
        marginAmount: z.number().optional(),
        commissionRate: z.number().optional(),
        commissionPaid: z.number().optional(),
        documentUrl: z.string().optional(),
        documentName: z.string().optional(),
        notes: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const existing = await db.bankGuarantee.findUniqueOrThrow({
        where: { id: input.id },
      });
      await assertProjectManager(ctx.user, existing.projectId);

      const { id, ...data } = input;
      const guarantee = await db.bankGuarantee.update({
        where: { id },
        data,
      });

      await audit({
        userId: ctx.user.id,
        projectId: existing.projectId,
        action: "guarantee.update",
        entityType: "bank_guarantee",
        entityId: guarantee.id,
        metadata: {
          number: guarantee.guaranteeNumber,
        },
      });

      return { guarantee };
    }),

  /** Delete a Guarantee */
  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const existing = await db.bankGuarantee.findUniqueOrThrow({
        where: { id: input.id },
      });
      await assertProjectManager(ctx.user, existing.projectId);

      await db.bankGuarantee.delete({ where: { id: input.id } });

      await audit({
        userId: ctx.user.id,
        projectId: existing.projectId,
        action: "guarantee.delete",
        entityType: "bank_guarantee",
        entityId: input.id,
      });

      return { ok: true };
    }),
});
