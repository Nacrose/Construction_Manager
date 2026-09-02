/**
 * Single-Firm Managed Joint Venture (JV) Partner Commission Router
 *
 * In Nepal construction, non-operating JV partners provide bidding/turnover capacity
 * and receive a fixed commission fee (e.g. 1.0% - 2.5% of Certified IPC Gross),
 * while the Lead Managing Partner executes 100% of site work.
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createDomainRouter, financialGuard } from "@/server/trpc";
import { db } from "@/lib/db";
import { assertOrgBankAccount } from "@/lib/authz";
import { withOrgContext } from "@/lib/rls";
import { decrementBankBalanceInTx } from "@/lib/bank-balance";
import { audit } from "@/lib/audit";
import {
  createJournalEntry,
  reverseJournalEntry,
  jvPayoutEntry,
} from "@/lib/journal-entry";
import { getNextSequenceNumber } from "@/server/utils/sequence-generator";
import { normalizeDateMiti } from "@/server/utils/date-miti";

/**
 * JV Partner router.
 * Phase E: declarative authz via createDomainRouter; recordPayout rides the
 * strict financialGuard (fiscal lock + delegation + org bank-account
 * isolation with explicitly named input fields).
 */
const { router, proc } = createDomainRouter();

export const jvPartnerRouter = router({
  /** Get JV partner agreement & statement for a project */
  getAgreement: proc.member
    .input(z.object({ projectId: z.string() }))
    .query(async ({ input }) => {
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
          subcontractorId: null, // Client IPC turnover only
          status: { in: ["certified", "approved", "paid"] },
        },
        select: {
          id: true,
          number: true,
          period: true,
          grossAmount: true,
          status: true,
          issueDate: true,
        },
        orderBy: { number: "asc" },
         take: 1000, // bounded (pagination sweep) — see src/lib/pagination.ts
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
  saveAgreement: proc.manager
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
  recordPayout: proc.write
    .use(financialGuard({
      action: "record_jv_payout",
      dateField: "payoutDate",
      amountFields: ["grossAmount"],
      bankAccountFields: ["bankAccountId"],
    }))
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
      const agreement = await db.jvPartnerAgreement.findUnique({
        where: { projectId: input.projectId },
      });

      if (!agreement) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "JV Partner Agreement not configured for this project.",
        });
      }

      // ── Commission integrity guards ─────────────────────────────────────
      // Accrue commission exactly like getAgreement does: fixed rate on
      // certified client IPC gross. Without these two checks a payout could
      // (a) exceed the commission actually earned, or (b) pay the same IPC's
      // commission twice — both drain the org's bank account for money that
      // was never owed to the JV partner.
      const certifiedIpcs = await db.ipc.findMany({
        where: {
          projectId: input.projectId,
          subcontractorId: null, // client IPC turnover only
          status: { in: ["certified", "approved", "paid"] },
        },
        select: { grossAmount: true },
      });
      const totalCertifiedTurnover = certifiedIpcs.reduce((s, i) => s + i.grossAmount, 0);
      const totalCommissionAccrued =
        (totalCertifiedTurnover * agreement.commissionRate) / 100;

      const priorPayouts = await db.jvCommissionPayout.findMany({
        where: { agreementId: agreement.id },
        select: { grossAmount: true, ipcId: true },
      });
      const totalCommissionPaid = priorPayouts.reduce((s, p) => s + p.grossAmount, 0);
      const balanceDue = totalCommissionAccrued - totalCommissionPaid;

      if (input.grossAmount > balanceDue) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Payout of NPR ${input.grossAmount.toLocaleString()} exceeds the outstanding JV commission balance of NPR ${balanceDue.toLocaleString()}.`,
        });
      }

      // One payout per certified IPC — the same commission source must not
      // be disbursed twice.
      if (input.ipcId && priorPayouts.some((p) => p.ipcId === input.ipcId)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "A commission payout has already been recorded for this IPC.",
        });
      }

      const dateInfo = normalizeDateMiti({ adDate: ctx.fiscalDate, bsMiti: input.payoutMiti });
      const tdsAmount = (input.grossAmount * input.tdsPercent) / 100;
      const netAmount = input.grossAmount - tdsAmount;

      // ── Atomic money movement ───────────────────────────────────────
      // Payout row, bank decrement, and the double-entry journal entry
      // all happen inside ONE transaction with the tenant RLS context
      // pinned. Previously these were separate writes: a crash between
      // them left a payout with no bank decrement, and the GL never saw
      // JV payouts at all.
      const partnerName = agreement.partnerName;
      const payout = await db.$transaction(async (tx) => {
        await withOrgContext(tx, ctx.user.organizationId, !!ctx.user.isSuperAdmin);

        const voucherNo = await getNextSequenceNumber(
          "jv_payout",
          { agreementId: agreement.id },
          tx,
        );

        const payout = await tx.jvCommissionPayout.create({
          data: {
            agreementId: agreement.id,
            ipcId: input.ipcId || null,
            voucherNo,
            payoutDate: dateInfo.adDate,
            payoutMiti: dateInfo.bsMiti,
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

        // Deduct net payment from central company bank account (atomic
        // single-statement decrement inside the tx). P2 item 30: guarded —
        // rejects an overdraw atomically.
        if (input.bankAccountId) {
          await decrementBankBalanceInTx(tx, input.bankAccountId, netAmount);
        }

        // Double-entry: Dr JV Partner Commission (gross)
        //               Cr TDS Payable (tds) / Cr Bank or Cash (net)
        const jeInput = jvPayoutEntry({
          payoutId: payout.id,
          voucherNo,
          partnerName,
          grossAmount: input.grossAmount,
          tdsAmount,
          netAmount,
          paymentMode: input.paymentMode,
          projectId: input.projectId,
          date: dateInfo.adDate,
          miti: dateInfo.bsMiti,
        });
        await createJournalEntry(tx, {
          ...jeInput,
          postedById: ctx.user.id,
          organizationId: ctx.user.organizationId ?? undefined,
        });

        return payout;
      });

      await audit({
        userId: ctx.user.id,
        projectId: input.projectId,
        action: "jv.record_payout",
        entityType: "jv_payout",
        entityId: payout.id,
        metadata: {
          voucherNo: payout.voucherNo,
          grossAmount: input.grossAmount,
          netAmount,
          bankAccountId: input.bankAccountId,
          journalEntry: "jv_payout",
        },
      });

      return { payout };
    }),

  /** Delete a commission payout record */
  deletePayout: proc.manager
    .input(
      z.object({
        projectId: z.string(),
        payoutId: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const payout = await db.jvCommissionPayout.findFirst({
        where: {
          id: input.payoutId,
          agreement: { projectId: input.projectId },
        },
      });

      if (!payout) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Payout record not found for this project.",
        });
      }

      // Restore bank account balance if previously deducted (verifying org
      // ownership). Resolved BEFORE the tx — an invalid bank id should not
      // block deleting an erroneous record.
      const bank = payout.bankAccountId
        ? await assertOrgBankAccount(payout.bankAccountId, ctx.user.organizationId).catch(() => null)
        : null;

      // ── Atomic reversal ──────────────────────────────────────────
      // Bank restore, GL reversal, and payout delete happen in ONE
      // transaction. Previously the bank increment was a swallowed
      // best-effort write and the GL was never touched — deleting a
      // payout left phantom commission expense in the ledger.
      await db.$transaction(async (tx) => {
        await withOrgContext(tx, ctx.user.organizationId, !!ctx.user.isSuperAdmin);

        if (bank) {
          await tx.companyBankAccount.update({
            where: { id: payout.bankAccountId! },
            data: { currentBalance: { increment: payout.netAmount } },
          });
        }

        // Reverse the payout's journal entry (payouts recorded before the
        // v1.1 ledger fix have none — skip cleanly for legacy rows).
        const je = await tx.journalEntry.findFirst({
          where: { source: "jv_payout", sourceRefId: payout.id },
          select: { id: true, entryNumber: true },
        });
        if (je) {
          await reverseJournalEntry(tx, je.id, `JV payout ${payout.voucherNo} deleted`);
        }

        await tx.jvCommissionPayout.delete({
          where: { id: input.payoutId },
        });
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
