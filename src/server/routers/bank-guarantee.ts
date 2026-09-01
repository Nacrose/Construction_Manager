/**
 * Bank Guarantee & Insurance Policy Router (बैंक ग्यारेन्टी तथा बीमा ट्र्याकर).
 * Manages Performance Bonds, APG, CAR Insurance, and Retention Guarantees with automated expiry alerts.
 */
import { z } from "zod";
import { optionalSafeUrlSchema } from "@/lib/safe-url";
import { router, protectedProcedure } from "@/server/trpc";
import { db } from "@/lib/db";
import { assertProjectMember, assertProjectManager } from "@/lib/authz";
import { audit } from "@/lib/audit";
import { withOrgContext } from "@/lib/rls";
import { assertNotLocked } from "@/lib/fiscal-year-lock";
import { adToBs } from "@/lib/nepali-calendar";
import { TRPCError } from "@trpc/server";

async function assertGuaranteeAccess(
  user: any,
  existing: { projectId: string | null; organizationId: string | null }
) {
  if (user.isSuperAdmin) return;

  if (existing.projectId) {
    await assertProjectManager(user, existing.projectId);
  } else if (existing.organizationId) {
    if (!user.organizationId || existing.organizationId !== user.organizationId) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "You don't have access to this organization's guarantees.",
      });
    }
  } else {
    throw new TRPCError({ code: "FORBIDDEN", message: "Access denied." });
  }
}

async function ensureBankGuaranteeTable(): Promise<void> {
  try {
    await db.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "BankGuarantee" (
        "id" TEXT NOT NULL,
        "organizationId" TEXT,
        "projectId" TEXT,
        "type" TEXT NOT NULL,
        "guaranteeNumber" TEXT NOT NULL,
        "issuingBank" TEXT NOT NULL,
        "branch" TEXT,
        "beneficiary" TEXT NOT NULL,
        "amount" DECIMAL(15, 2) NOT NULL,
        "currency" TEXT NOT NULL DEFAULT 'NPR',
        "issuedDate" TIMESTAMPTZ NOT NULL,
        "issuedMiti" TEXT,
        "expiryDate" TIMESTAMPTZ NOT NULL,
        "expiryMiti" TEXT,
        "claimPeriodDays" INTEGER NOT NULL DEFAULT 30,
        "claimExpiryDate" TIMESTAMPTZ,
        "status" TEXT NOT NULL DEFAULT 'active',
        "purpose" TEXT,
        "marginAmount" DECIMAL(15, 2) NOT NULL DEFAULT 0,
        "commissionRate" DECIMAL(15, 4) NOT NULL DEFAULT 0,
        "commissionPaid" DECIMAL(15, 2) NOT NULL DEFAULT 0,
        "documentUrl" TEXT,
        "documentName" TEXT,
        "amendments" JSONB NOT NULL DEFAULT '[]',
        "notes" TEXT,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "BankGuarantee_pkey" PRIMARY KEY ("id")
      );
      CREATE INDEX IF NOT EXISTS "BankGuarantee_organizationId_status_expiryDate_idx" ON "BankGuarantee"("organizationId", "status", "expiryDate");
      CREATE INDEX IF NOT EXISTS "BankGuarantee_projectId_status_expiryDate_idx" ON "BankGuarantee"("projectId", "status", "expiryDate");
    `);
  } catch (err) {
    console.error("[BankGuarantee] ensureTable error:", err);
  }
}

export const bankGuaranteeRouter = router({
  /** List all bank guarantees (Organization wide or Project scoped) */
  list: protectedProcedure
    .input(
      z.object({
        projectId: z.string().optional(),
        organizationId: z.string().optional(),
        status: z.enum(["all", "active", "extended", "released", "expired"]).optional(),
        type: z.string().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const orgId = ctx.user.role === "superadmin" && input.organizationId ? input.organizationId : ctx.user.organizationId;
      if (input.projectId) {
        await assertProjectMember(ctx.user, input.projectId);
      } else if (!orgId) {
        return {
          items: [],
          kpis: {
            totalActiveExposure: 0,
            totalMarginHeld: 0,
            totalCommissionPaid: 0,
            expiringWithin30DaysCount: 0,
            expiredCount: 0,
            activeCount: 0,
            totalCount: 0,
          },
        };
      }

      const where: any = {};
      if (input.projectId) {
        where.projectId = input.projectId;
      } else if (orgId) {
        where.OR = [
          { organizationId: orgId },
          { project: { organizationId: orgId } },
        ];
      }

      if (input.status && input.status !== "all") {
        where.status = input.status;
      }
      if (input.type && input.type !== "all") {
        where.type = input.type;
      }

      let rawItems;
      try {
        rawItems = await db.bankGuarantee.findMany({
          where,
          include: {
            project: {
              select: { id: true, name: true, code: true },
            },
          },
          orderBy: { expiryDate: "asc" },
        });
      } catch (err) {
        console.error("[bankGuarantee.list] List failed, ensuring table and retrying:", err);
        await ensureBankGuaranteeTable();
        rawItems = await db.bankGuarantee.findMany({
          where,
          include: {
            project: {
              select: { id: true, name: true, code: true },
            },
          },
          orderBy: { expiryDate: "asc" },
        });
      }

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

      // Auto-update expired guarantees
      const expiredIds = items.filter((g) => g.isExpired).map((g) => g.id);
      if (expiredIds.length > 0) {
        await db.bankGuarantee.updateMany({
          where: { id: { in: expiredIds } },
          data: { status: "expired" },
        });
      }

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
    const hasOrg = Boolean(ctx.user.organizationId);
    if (projectIds.length === 0 && !hasOrg) {
      return { expiringSoon: [], totalActiveExposure: 0 };
    }

    const activeGuarantees = await db.bankGuarantee.findMany({
      where: {
        OR: [
          ...(projectIds.length > 0 ? [{ projectId: { in: projectIds } }] : []),
          ...(hasOrg ? [{ organizationId: ctx.user.organizationId! }] : []),
        ],
        status: { in: ["active", "extended"] },
      },
      include: {
        project: {
          select: { id: true, name: true, code: true },
        },
      },
      orderBy: { expiryDate: "asc" },
    });

    const now = new Date();
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
        projectId: z.string().optional(),
        organizationId: z.string().optional(),
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
        documentUrl: optionalSafeUrlSchema,
        documentName: z.string().nullish().transform((v) => v || undefined),
        notes: z.string().nullish().transform((v) => v || undefined),
        postToDayBook: z.boolean().optional(),
        bankAccountId: z.string().optional(),
        voucherDate: z.string().optional(),
        voucherMiti: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      let orgId = ctx.user.organizationId ?? null;

      if (input.projectId) {
        await assertProjectManager(ctx.user, input.projectId);
        const project = await db.project.findUnique({
          where: { id: input.projectId },
          select: { organizationId: true },
        });
        if (project?.organizationId) {
          orgId = project.organizationId;
        }
      } else if (!ctx.user.organizationId && !ctx.user.isSuperAdmin) {
        throw new TRPCError({ code: "FORBIDDEN", message: "User has no organization assigned." });
      }

      if (!orgId && ctx.user.isSuperAdmin) {
        if (input.organizationId) {
          orgId = input.organizationId;
        } else {
          const firstOrg = await db.organization.findFirst({ select: { id: true } });
          orgId = firstOrg?.id ?? null;
        }
      }

      if (!orgId) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Valid organization required to register guarantee." });
      }

      const issuedD = new Date(input.issuedDate);
      const expiryD = new Date(input.expiryDate);

      if (isNaN(issuedD.getTime()) || isNaN(expiryD.getTime())) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid issued or expiry date format." });
      }

      if (expiryD.getTime() < issuedD.getTime()) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Guarantee expiry date cannot be earlier than issued date." });
      }

      await assertNotLocked(orgId, issuedD);

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

      let guarantee;
      try {
        guarantee = await db.$transaction(async (tx) => {
          await withOrgContext(tx, orgId, !!ctx.user.isSuperAdmin);
          const bg = await tx.bankGuarantee.create({
            data: {
              organizationId: orgId,
              projectId: input.projectId || null,
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

          // Post to Day Book & Debit Company Bank Account if requested
          if (input.postToDayBook && input.bankAccountId && input.commissionPaid > 0) {
            const vDate = input.voucherDate ? new Date(input.voucherDate) : issuedD;
            let vMiti = input.voucherMiti;
            if (!vMiti) {
              try {
                vMiti = adToBs(vDate).formatted;
              } catch {}
            }

            await tx.headOfficeExpense.create({
              data: {
                organizationId: orgId,
                date: vDate,
                miti: vMiti || issuedMiti || null,
                category: "Bank Charges & Guarantee Fees",
                particulars: `Bank Guarantee Commission: #${input.guaranteeNumber.trim()} (${input.issuingBank.trim()}) - ${input.beneficiary.trim()}`,
                amount: input.commissionPaid,
                paymentMode: "bank_transfer",
                bankAccountId: input.bankAccountId,
                voucherNo: `BG-COMM-${input.guaranteeNumber.trim()}`,
                notes: `Auto-posted from Bank Guarantee register (BG_ID: ${bg.id})`,
              },
            });

            await tx.companyBankAccount.update({
              where: { id: input.bankAccountId },
              data: { currentBalance: { decrement: input.commissionPaid } },
            });
          }

          return bg;
        });
      } catch (err: any) {
        console.error("[bankGuarantee.create] Transaction error details:", {
          orgId,
          projectId: input.projectId,
          userId: ctx.user.id,
          isSuperAdmin: ctx.user.isSuperAdmin,
          error: err?.message || err,
        });
        throw err;
      }

      await audit({
        userId: ctx.user.id,
        projectId: input.projectId || undefined,
        action: "guarantee.create",
        entityType: "bank_guarantee",
        entityId: guarantee.id,
        metadata: {
          number: guarantee.guaranteeNumber,
          type: guarantee.type,
          amount: Number(guarantee.amount),
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
      await assertGuaranteeAccess(ctx.user, existing);

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

      const targetOrg = existing.organizationId || ctx.user.organizationId;
      const guarantee = await db.$transaction(async (tx) => {
        await withOrgContext(tx, targetOrg, !!ctx.user.isSuperAdmin);
        return tx.bankGuarantee.update({
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
      });

      await audit({
        userId: ctx.user.id,
        projectId: existing.projectId || undefined,
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
      await assertGuaranteeAccess(ctx.user, existing);

      const targetOrg = existing.organizationId || ctx.user.organizationId;
      const guarantee = await db.$transaction(async (tx) => {
        await withOrgContext(tx, targetOrg, !!ctx.user.isSuperAdmin);
        return tx.bankGuarantee.update({
          where: { id: input.id },
          data: {
            status: "released",
            notes: input.notes
              ? `${existing.notes || ""}\nReleased with Ref: ${input.releaseLetterRef || "N/A"}. ${input.notes}`.trim()
              : existing.notes,
          },
        });
      });

      await audit({
        userId: ctx.user.id,
        projectId: existing.projectId || undefined,
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
        type: z.enum([
          "performance_bond",
          "advance_payment",
          "car_insurance",
          "retention_bond",
          "bid_bond",
          "other",
        ]).optional(),
        guaranteeNumber: z.string().min(1).optional(),
        issuingBank: z.string().min(1).optional(),
        branch: z.string().optional(),
        beneficiary: z.string().min(1).optional(),
        amount: z.number().positive().optional(),
        issuedDate: z.string().optional(),
        issuedMiti: z.string().optional(),
        expiryDate: z.string().optional(),
        expiryMiti: z.string().optional(),
        claimPeriodDays: z.number().optional(),
        purpose: z.string().optional(),
        marginAmount: z.number().nonnegative().optional(),
        commissionRate: z.number().min(0).max(100).optional(),
        commissionPaid: z.number().nonnegative().optional(),
        documentUrl: optionalSafeUrlSchema,
        documentName: z.string().nullish().transform((v) => v || undefined),
        notes: z.string().nullish().transform((v) => v || undefined),
        postToDayBook: z.boolean().optional(),
        bankAccountId: z.string().optional(),
        voucherDate: z.string().optional(),
        voucherMiti: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const existing = await db.bankGuarantee.findUniqueOrThrow({
        where: { id: input.id },
      });
      await assertGuaranteeAccess(ctx.user, existing);

      const targetOrg = existing.organizationId || ctx.user.organizationId;
      if (!targetOrg) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Valid organization required." });
      }

      const issuedD = input.issuedDate ? new Date(input.issuedDate) : existing.issuedDate;
      const expiryD = input.expiryDate ? new Date(input.expiryDate) : existing.expiryDate;
      const claimDays = input.claimPeriodDays ?? existing.claimPeriodDays ?? 30;
      const claimExpiryDate = new Date(expiryD.getTime() + claimDays * 24 * 60 * 60 * 1000);

      let issuedMiti = input.issuedMiti ?? existing.issuedMiti;
      if (input.issuedDate && !input.issuedMiti) {
        try {
          issuedMiti = adToBs(issuedD).formatted;
        } catch {}
      }

      let expiryMiti = input.expiryMiti ?? existing.expiryMiti;
      if (input.expiryDate && !input.expiryMiti) {
        try {
          expiryMiti = adToBs(expiryD).formatted;
        } catch {}
      }

      const { id, postToDayBook, bankAccountId, voucherDate, voucherMiti, ...updateFields } = input;

      const guarantee = await db.$transaction(async (tx) => {
        await withOrgContext(tx, targetOrg, !!ctx.user.isSuperAdmin);

        const updatedBg = await tx.bankGuarantee.update({
          where: { id },
          data: {
            ...updateFields,
            issuedDate: issuedD,
            issuedMiti,
            expiryDate: expiryD,
            expiryMiti,
            claimPeriodDays: claimDays,
            claimExpiryDate,
          },
        });

        // Find any existing linked Day Book expense
        const linkedExpense = await tx.headOfficeExpense.findFirst({
          where: {
            organizationId: targetOrg,
            OR: [
              { notes: { contains: `BG_ID: ${id}` } },
              { voucherNo: `BG-COMM-${existing.guaranteeNumber}` },
            ],
          },
        });

        const newCommission = input.commissionPaid !== undefined ? input.commissionPaid : Number(existing.commissionPaid);
        const newGuarNumber = (input.guaranteeNumber || existing.guaranteeNumber).trim();
        const newBankName = (input.issuingBank || existing.issuingBank).trim();
        const newBeneficiary = (input.beneficiary || existing.beneficiary).trim();

        if (linkedExpense) {
          // Restore prior bank account balance
          if (linkedExpense.bankAccountId && Number(linkedExpense.amount) > 0) {
            await tx.companyBankAccount.update({
              where: { id: linkedExpense.bankAccountId },
              data: { currentBalance: { increment: Number(linkedExpense.amount) } },
            });
          }

          if (newCommission > 0 && (bankAccountId || linkedExpense.bankAccountId) && postToDayBook !== false) {
            const targetBankAccountId = bankAccountId || linkedExpense.bankAccountId!;
            const vDate = voucherDate ? new Date(voucherDate) : (input.issuedDate ? new Date(input.issuedDate) : linkedExpense.date);
            let vMiti = voucherMiti;
            if (!vMiti) {
              try {
                vMiti = adToBs(vDate).formatted;
              } catch {}
            }

            await tx.headOfficeExpense.update({
              where: { id: linkedExpense.id },
              data: {
                bankAccountId: targetBankAccountId,
                amount: newCommission,
                date: vDate,
                miti: vMiti || linkedExpense.miti || null,
                particulars: `Bank Guarantee Commission: #${newGuarNumber} (${newBankName}) - ${newBeneficiary}`,
                voucherNo: `BG-COMM-${newGuarNumber}`,
                notes: `Auto-posted from Bank Guarantee register (BG_ID: ${id})`,
              },
            });

            await tx.companyBankAccount.update({
              where: { id: targetBankAccountId },
              data: { currentBalance: { decrement: newCommission } },
            });
          } else {
            // Commission removed or set to 0
            await tx.headOfficeExpense.delete({ where: { id: linkedExpense.id } });
          }
        } else if (postToDayBook && bankAccountId && newCommission > 0) {
          // Create new linked expense
          const vDate = voucherDate ? new Date(voucherDate) : issuedD;
          let vMiti = voucherMiti;
          if (!vMiti) {
            try {
              vMiti = adToBs(vDate).formatted;
            } catch {}
          }

          await tx.headOfficeExpense.create({
            data: {
              organizationId: targetOrg,
              date: vDate,
              miti: vMiti || issuedMiti || null,
              category: "Bank Charges & Guarantee Fees",
              particulars: `Bank Guarantee Commission: #${newGuarNumber} (${newBankName}) - ${newBeneficiary}`,
              amount: newCommission,
              paymentMode: "bank_transfer",
              bankAccountId,
              voucherNo: `BG-COMM-${newGuarNumber}`,
              notes: `Auto-posted from Bank Guarantee register (BG_ID: ${id})`,
            },
          });

          await tx.companyBankAccount.update({
            where: { id: bankAccountId },
            data: { currentBalance: { decrement: newCommission } },
          });
        }

        return updatedBg;
      });

      await audit({
        userId: ctx.user.id,
        projectId: existing.projectId || undefined,
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
      await assertGuaranteeAccess(ctx.user, existing);

      const targetOrg = existing.organizationId || ctx.user.organizationId;
      await db.$transaction(async (tx) => {
        await withOrgContext(tx, targetOrg, !!ctx.user.isSuperAdmin);

        // Find and clean up any linked Day Book expense
        if (targetOrg) {
          const linkedExpense = await tx.headOfficeExpense.findFirst({
            where: {
              organizationId: targetOrg,
              OR: [
                { notes: { contains: `BG_ID: ${input.id}` } },
                { voucherNo: `BG-COMM-${existing.guaranteeNumber}` },
              ],
            },
          });

          if (linkedExpense) {
            if (linkedExpense.bankAccountId && Number(linkedExpense.amount) > 0) {
              await tx.companyBankAccount.update({
                where: { id: linkedExpense.bankAccountId },
                data: { currentBalance: { increment: Number(linkedExpense.amount) } },
              });
            }
            await tx.headOfficeExpense.delete({ where: { id: linkedExpense.id } });
          }
        }

        await tx.bankGuarantee.delete({ where: { id: input.id } });
      });

      await audit({
        userId: ctx.user.id,
        projectId: existing.projectId || undefined,
        action: "guarantee.delete",
        entityType: "bank_guarantee",
        entityId: input.id,
        metadata: {
          number: existing.guaranteeNumber,
        },
      });

      return { ok: true };
    }),
});
