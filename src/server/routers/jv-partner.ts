/**
 * Single-Firm Managed Joint Venture (JV) Partner Commission Router
 *
 * In Nepal construction, non-operating JV partners provide bidding/turnover capacity
 * and receive a fixed commission fee (e.g. 1.0% - 2.5% of Certified IPC Gross),
 * while the Lead Managing Partner executes 100% of site work.
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "@/server/trpc";
import { db } from "@/lib/db";
import { assertProjectMember, assertProjectManager } from "@/lib/authz";
import { audit } from "@/lib/audit";
import { assertNotLocked } from "@/lib/fiscal-year-lock";
import { adToBs } from "@/lib/nepali-calendar";
import { format } from "date-fns";

export const jvPartnerRouter = router({
  /** Get JV partner agreement & statement for a project */
  getAgreement: protectedProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ ctx, input }) => {
      await assertProjectMember(ctx.user, input.projectId);

      const agreement = await db.jvPartnerAgreement.findUnique({
        where: { projectId: input.projectId },
        include: {
          payouts: {
            orderBy: { payoutDate: "desc" },
          },
        },
      });

      // Fetch certified IPCs to compute total turnover and accrued commission
      const ipcs = await db.ipc.findMany({
        where: {
          projectId: input.projectId,
          status: { in: ["certified", "approved", "paid"] },
        },
        select: {
          id: true,
          number: true,
          period: true,
          grossAmount: true,
          status: true,
          certifiedAt: true,
          paidAt: true,
        },
        orderBy: { number: "asc" },
      });

      const totalCertifiedTurnover = ipcs.reduce((sum, ipc) => sum + ipc.grossAmount, 0);
      const commissionRate = agreement?.commissionRate ?? 1.5;
      const totalCommissionAccrued = (totalCertifiedTurnover * commissionRate) / 100;

      const totalCommissionPaid = agreement?.payouts.reduce((sum, p) => sum + p.grossAmount, 0) ?? 0;
      const totalTdsDeducted = agreement?.payouts.reduce((sum, p) => sum + p.tdsAmount, 0) ?? 0;
      const totalNetDisbursed = agreement?.payouts.reduce((sum, p) => sum + p.netAmount, 0) ?? 0;
      const balanceDue = totalCommissionAccrued - totalCommissionPaid;

      // Itemized IPC commission list
      const ipcBreakdown = ipcs.map((ipc) => {
        const accruedCommission = (ipc.grossAmount * commissionRate) / 100;
        const linkedPayout = agreement?.payouts.find((p) => p.ipcId === ipc.id);

        return {
          ipcId: ipc.id,
          number: ipc.number,
          period: ipc.period,
          grossAmount: ipc.grossAmount,
          status: ipc.status,
          accruedCommission,
          paidAmount: linkedPayout?.grossAmount ?? 0,
          isPaid: !!linkedPayout,
        };
      });

      return {
        agreement,
        summary: {
          totalCertifiedTurnover,
          commissionRate,
          totalCommissionAccrued,
          totalCommissionPaid,
          totalTdsDeducted,
          totalNetDisbursed,
          balanceDue,
          ipcCount: ipcs.length,
        },
        ipcBreakdown,
        payouts: agreement?.payouts ?? [],
      };
    }),

  /** Save / Update JV Partner Agreement */
  saveAgreement: protectedProcedure
    .input(
      z.object({
        projectId: z.string(),
        partnerName: z.string().min(1, "Partner name is required"),
        partnerPan: z.string().optional().nullable(),
        commissionRate: z.number().min(0).max(100).default(1.5),
        leadPartnerShare: z.number().min(0).max(100).default(100.0),
        contactPerson: z.string().optional().nullable(),
        phone: z.string().optional().nullable(),
        email: z.string().optional().nullable(),
        bankName: z.string().optional().nullable(),
        bankAccountNumber: z.string().optional().nullable(),
        branch: z.string().optional().nullable(),
        notes: z.string().optional().nullable(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await assertProjectManager(ctx.user, input.projectId);

      const agreement = await db.jvPartnerAgreement.upsert({
        where: { projectId: input.projectId },
        create: {
          projectId: input.projectId,
          partnerName: input.partnerName.trim(),
          partnerPan: input.partnerPan?.trim() || null,
          commissionRate: input.commissionRate,
          leadPartnerShare: input.leadPartnerShare,
          contactPerson: input.contactPerson?.trim() || null,
          phone: input.phone?.trim() || null,
          email: input.email?.trim() || null,
          bankName: input.bankName?.trim() || null,
          bankAccountNumber: input.bankAccountNumber?.trim() || null,
          branch: input.branch?.trim() || null,
          notes: input.notes?.trim() || null,
        },
        update: {
          partnerName: input.partnerName.trim(),
          partnerPan: input.partnerPan?.trim() || null,
          commissionRate: input.commissionRate,
          leadPartnerShare: input.leadPartnerShare,
          contactPerson: input.contactPerson?.trim() || null,
          phone: input.phone?.trim() || null,
          email: input.email?.trim() || null,
          bankName: input.bankName?.trim() || null,
          bankAccountNumber: input.bankAccountNumber?.trim() || null,
          branch: input.branch?.trim() || null,
          notes: input.notes?.trim() || null,
        },
      });

      await audit({
        userId: ctx.user.id,
        projectId: input.projectId,
        action: "jv.save_agreement",
        entityType: "jv_agreement",
        entityId: agreement.id,
        metadata: {
          partnerName: agreement.partnerName,
          commissionRate: agreement.commissionRate,
        },
      });

      return { agreement };
    }),

  /** Record a Commission Payout to the JV Partner */
  recordPayout: protectedProcedure
    .input(
      z.object({
        projectId: z.string(),
        ipcId: z.string().optional().nullable(),
        grossAmount: z.number().positive("Gross amount must be positive"),
        tdsPercent: z.number().min(0).max(100).default(1.5),
        paymentMode: z.enum(["bank_transfer", "cheque", "connectips", "cash"]).default("bank_transfer"),
        chequeNo: z.string().optional().nullable(),
        bankAccountId: z.string().optional().nullable(),
        payoutDate: z.string().optional(),
        payoutMiti: z.string().optional(),
        remarks: z.string().optional().nullable(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await assertProjectManager(ctx.user, input.projectId);
      await assertNotLocked(ctx.user.organizationId, input.payoutDate ? new Date(input.payoutDate) : new Date());

      const agreement = await db.jvPartnerAgreement.findUnique({
        where: { projectId: input.projectId },
      });

      if (!agreement) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "JV Partner Agreement not configured for this project.",
        });
      }

      const pDate = input.payoutDate ? new Date(input.payoutDate) : new Date();
      let pMiti = input.payoutMiti;
      if (!pMiti) {
        try {
          pMiti = adToBs(pDate).formatted;
        } catch {}
      }

      const tdsAmount = (input.grossAmount * input.tdsPercent) / 100;
      const netAmount = input.grossAmount - tdsAmount;

      // Count existing payouts to generate clean voucher number
      const count = await db.jvCommissionPayout.count({
        where: { agreementId: agreement.id },
      });
      const voucherNo = `JV-COMM-${String(count + 1).padStart(3, "0")}`;

      const payout = await db.jvCommissionPayout.create({
        data: {
          agreementId: agreement.id,
          ipcId: input.ipcId || null,
          voucherNo,
          payoutDate: pDate,
          payoutMiti: pMiti || null,
          grossAmount: input.grossAmount,
          tdsPercent: input.tdsPercent,
          tdsAmount,
          netAmount,
          paymentMode: input.paymentMode,
          chequeNo: input.chequeNo?.trim() || null,
          bankAccountId: input.bankAccountId || null,
          remarks: input.remarks?.trim() || null,
        },
      });

      // If bank account is specified, deduct net payment from central company bank account
      if (input.bankAccountId) {
        const bank = await db.companyBankAccount.findUnique({
          where: { id: input.bankAccountId },
        });
        if (bank) {
          await db.companyBankAccount.update({
            where: { id: input.bankAccountId },
            data: { currentBalance: { decrement: netAmount } },
          });
        }
      }

      await audit({
        userId: ctx.user.id,
        projectId: input.projectId,
        action: "jv.record_payout",
        entityType: "jv_payout",
        entityId: payout.id,
        metadata: {
          voucherNo: payout.voucherNo,
          grossAmount: payout.grossAmount,
          netAmount: payout.netAmount,
          partnerName: agreement.partnerName,
        },
      });

      return { payout };
    }),

  /** Delete a commission payout record */
  deletePayout: protectedProcedure
    .input(
      z.object({
        projectId: z.string(),
        payoutId: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await assertProjectManager(ctx.user, input.projectId);

      const payout = await db.jvCommissionPayout.findUniqueOrThrow({
        where: { id: input.payoutId },
      });

      // Restore bank account balance if previously deducted
      if (payout.bankAccountId) {
        await db.companyBankAccount.update({
          where: { id: payout.bankAccountId },
          data: { currentBalance: { increment: payout.netAmount } },
        }).catch(() => {});
      }

      await db.jvCommissionPayout.delete({
        where: { id: input.payoutId },
      });

      await audit({
        userId: ctx.user.id,
        projectId: input.projectId,
        action: "jv.delete_payout",
        entityType: "jv_payout",
        entityId: input.payoutId,
        metadata: { voucherNo: payout.voucherNo },
      });

      return { success: true };
    }),
});
