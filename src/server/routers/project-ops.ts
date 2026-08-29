/**
 * Combined router for Payment, Safety, Quality, and Meeting modules.
 * Each is a separate sub-router for clean separation.
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "@/server/trpc";
import { db } from "@/lib/db";
import { assertProjectMember, assertCanWrite, assertOrgBankAccount } from "@/lib/authz";
import { audit } from "@/lib/audit";
import { assertNotLocked } from "@/lib/fiscal-year-lock";
import { createJournalEntry, reverseJournalEntry } from "@/lib/journal-entry";
import { assertDelegation } from "@/lib/delegation";
import { paymentDebitAccountForCategory, accountNameForCode } from "@/server/utils/overhead-account-mapping";

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
        payeeType: z.enum(["vendor", "subcontractor", "supplier", "staff", "other"]),
        payeeName: z.string().min(1),
        partyPan: z.string().optional(),
        payeeId: z.string().optional(),
        ipcId: z.string().optional(),
        invoiceNumber: z.string().optional(),
        amount: z.number().positive(),
        tdsDeducted: z.number().default(0),
        vatIncluded: z.number().default(0),
        netPaid: z.number().optional(),
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
        // Central bank account the payment is drawn on (org-scoped).
        // When set, the account's currentBalance is decremented in the
        // same transaction — matching the central cheque-run path.
        companyBankAccountId: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await assertCanWrite(ctx.user, input.projectId);
      await assertDelegation(ctx.user, "create_payment", input.amount);

      // FISCAL YEAR LOCK: use the payment date (not today) so back-dated
      // payments to locked fiscal years are correctly rejected.
      const paymentDate = input.paymentDate ? new Date(input.paymentDate) : new Date();
      await assertNotLocked(ctx.user.organizationId, paymentDate);

      // AMOUNT CONSISTENCY: verify amount = tdsDeducted + netPaid.
      const computedNet = input.amount - input.tdsDeducted;
      const finalNetPaid = input.netPaid ?? computedNet;
      if (Math.abs(finalNetPaid - computedNet) > 0.01) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Amount inconsistency: amount (${input.amount}) must equal tdsDeducted (${input.tdsDeducted}) + netPaid (${finalNetPaid}). Expected netPaid=${computedNet}.`,
        });
      }

      const { projectId, ...data } = input;

      let resolvedCategory = data.category;
      let resolvedSubCategory = data.subCategory;

      if (data.categoryId && !resolvedCategory) {
        const cat = await db.paymentCategory.findFirst({
          where: { id: data.categoryId, projectId },
        });
        if (cat) resolvedCategory = cat.name;
      }
      if (data.subCategoryId && !resolvedSubCategory) {
        const sub = await db.paymentCategory.findFirst({
          where: { id: data.subCategoryId, projectId },
        });
        if (sub) resolvedSubCategory = sub.name;
      }

      // ── PRE-WRITE RESOLUTION ─────────────────────────────────────
      // Bill linkage is resolved BEFORE any write so that (a) the
      // overpayment check can reject before a Payment row is committed,
      // and (b) the journal entry debits the correct account.
      //
      // Previously: payment + JE were committed first, THEN the bill was
      // looked up — an overpayment error at that point left a committed
      // payment (and posted JE) despite the user seeing a failure toast.
      // Worse, EVERY payment debited Sundry Creditors / Subcontractor
      // Payables even when no bill existed, producing negative payables
      // in the Trial Balance for direct cash/site purchases.
      let linkedVendorBill: { id: string; billNumber: string; paidAmount: number; netPayable: number } | null = null;
      let linkedSubBill: { id: string; number: string; paidAmount: number; netPayable: number } | null = null;

      if (data.invoiceNumber && data.payeeType === "vendor") {
        const vBill = await db.vendorBill.findFirst({
          where: { projectId, billNumber: data.invoiceNumber },
          select: { id: true, billNumber: true, paidAmount: true, netPayable: true },
        });
        if (vBill) {
          const newPaid = (vBill.paidAmount || 0) + data.amount;
          if (newPaid > vBill.netPayable + 0.01) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: `Overpayment: bill ${vBill.billNumber} has remaining balance ${vBill.netPayable - vBill.paidAmount} but payment amount is ${data.amount}.`,
            });
          }
          linkedVendorBill = vBill;
        }
      }

      if (data.invoiceNumber && data.payeeType === "subcontractor") {
        const subBill = await db.subcontractorBill.findFirst({
          where: { projectId, number: data.invoiceNumber },
          select: { id: true, number: true, paidAmount: true, netPayable: true },
        });
        if (subBill) {
          const newPaid = (subBill.paidAmount || 0) + data.amount;
          if (newPaid > subBill.netPayable + 0.01) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: `Overpayment: bill ${subBill.number} has remaining balance ${subBill.netPayable - (subBill.paidAmount || 0)} but payment amount is ${data.amount}.`,
            });
          }
          linkedSubBill = subBill;
        }
      }

      // DEBIT ACCOUNT: settling a known bill debits the payable. An
      // unlinked payment (no bill found / no invoice number) debits the
      // expense account its category maps to via the central
      // paymentDebitAccountForCategory helper — never a payable.
      const debitAccountCode = linkedVendorBill
        ? "2001"
        : linkedSubBill
          ? "2002"
          : paymentDebitAccountForCategory(resolvedCategory, data.payeeType);
      const debitAccountName = accountNameForCode(debitAccountCode) || "Site Expenses";
      const bankCode = data.paymentMode === "cash" ? "1001" : "1010";
      const bankName = data.paymentMode === "cash" ? "Cash" : "Bank";

      // BANK ACCOUNT SCOPE: verify the central bank account belongs to the
      // caller's org BEFORE using it — the raw balance decrement below must
      // never be able to touch another org's account.
      if (data.companyBankAccountId) {
        await assertOrgBankAccount(data.companyBankAccountId, ctx.user.organizationId);
      }

      // ── SINGLE TRANSACTION: payment + JE + bill settle + bank balance ──
      const payment = await db.$transaction(async (tx) => {
        const created = await tx.payment.create({
          data: {
            projectId,
            payeeType: data.payeeType,
            payeeName: data.payeeName,
            partyPan: data.partyPan,
            payeeId: data.payeeId,
            ipcId: data.ipcId,
            invoiceNumber: data.invoiceNumber,
            amount: data.amount,
            tdsDeducted: data.tdsDeducted,
            vatIncluded: data.vatIncluded,
            paymentDate,
            paymentMiti: data.paymentMiti,
            paymentMode: data.paymentMode,
            chequeNo: data.chequeNo,
            bankRef: data.bankRef,
            bankAccount: data.bankAccount,
            retentionReleased: data.retentionReleased,
            notes: data.notes,
            categoryId: data.categoryId,
            subCategoryId: data.subCategoryId,
            category: resolvedCategory,
            subCategory: resolvedSubCategory,
            allocationType: data.allocationType,
            accountingSoftware: data.accountingSoftware,
            accountingVoucherNo: data.accountingVoucherNo,
            voucherType: data.voucherType,
            scannedBillUrl: data.scannedBillUrl,
            scannedBillName: data.scannedBillName,
            companyBankAccountId: data.companyBankAccountId || null,
            // Use ?? (not ||) so a legitimate netPaid=0 (full TDS deduction)
            // is preserved instead of being overridden.
            netPaid: finalNetPaid,
            isBillAttached: Boolean(data.scannedBillUrl),
            createdById: ctx.user.id,
          },
        });

        // JOURNAL ENTRY: Dr <payable-or-expense> / Cr TDS Payable / Cr Bank.
        // Atomic with the payment row — a failure rolls both back.
        await createJournalEntry(tx, {
          source: "payment",
          sourceRefId: created.id,
          sourceRefType: "Payment",
          description: `Payment to ${data.payeeName} — ${data.invoiceNumber || "direct"}`,
          entryDate: paymentDate,
          postedById: ctx.user.id,
          organizationId: ctx.user.organizationId ?? undefined,
          lines: [
            {
              accountCode: debitAccountCode,
              accountName: debitAccountName,
              debit: input.amount,
              credit: 0,
              description: linkedVendorBill || linkedSubBill
                ? `Bill settlement payment to ${data.payeeName}`
                : `Direct payment to ${data.payeeName} (${resolvedCategory || "uncategorized"})`,
              projectId,
              partnerId: data.payeeId || undefined,
            },
            ...(input.tdsDeducted > 0 ? [{
              accountCode: "2020" as const,
              accountName: "TDS Payable",
              debit: 0,
              credit: input.tdsDeducted,
              description: `TDS deducted from ${data.payeeName}`,
              projectId,
            }] : []),
            {
              accountCode: bankCode,
              accountName: bankName,
              debit: 0,
              credit: finalNetPaid,
              description: `Net payment via ${data.paymentMode}`,
              projectId,
            },
          ],
        });

        // Settle the linked Vendor Bill (validated above).
        if (linkedVendorBill) {
          const newPaid = (linkedVendorBill.paidAmount || 0) + data.amount;
          const isFullyPaid = newPaid >= linkedVendorBill.netPayable - 0.01;
          await tx.vendorBill.update({
            where: { id: linkedVendorBill.id },
            data: {
              paidAmount: newPaid,
              status: isFullyPaid ? "paid" : "partially_paid",
            },
          });
          await tx.vendorPayment.create({
            data: {
              projectId,
              vendorBillId: linkedVendorBill.id,
              amount: data.amount,
              paymentDate,
              paymentMethod: data.paymentMode || "bank_transfer",
              referenceNumber: data.chequeNo || data.accountingVoucherNo || null,
              remarks: data.notes || `Payment Voucher settlement`,
              createdById: ctx.user.id,
            },
          });
        }

        // Settle the linked Subcontractor Bill (validated above).
        if (linkedSubBill) {
          const newPaid = (linkedSubBill.paidAmount || 0) + data.amount;
          const isFullyPaid = newPaid >= linkedSubBill.netPayable - 0.01;
          await tx.subcontractorBill.update({
            where: { id: linkedSubBill.id },
            data: {
              paidAmount: newPaid,
              status: isFullyPaid ? "paid" : "certified",
            },
          });
        }

        // Keep the central bank account in sync when the payment is drawn
        // on one (same behavior as the central cheque-run path). Atomic
        // decrement inside the same transaction.
        if (data.companyBankAccountId) {
          await tx.$executeRaw`
            UPDATE "CompanyBankAccount"
            SET "currentBalance" = "currentBalance" - ${finalNetPaid}
            WHERE "id" = ${data.companyBankAccountId}
          `;
        }

        return created;
      });

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
            payeeType: z.enum(["vendor", "subcontractor", "supplier", "staff", "other"]).default("vendor"),
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
      await assertDelegation(ctx.user, "bulk_create_payments");

      // FISCAL YEAR LOCK: use the earliest payment date so back-dated
      // bulk imports to locked fiscal years are correctly rejected.
      const earliestDate = input.payments
        .map((p) => p.paymentDate ? new Date(p.paymentDate) : new Date())
        .sort((a, b) => a.getTime() - b.getTime())[0] ?? new Date();
      await assertNotLocked(ctx.user.organizationId, earliestDate);

      // ALL-OR-NOTHING IMPORT: every payment + its journal entry share one
      // transaction. Previously each pair committed independently — a
      // failure midway (unbalanced line, sequence collision) left half the
      // import posted with the user seeing only an error, and a retry
      // would duplicate the already-committed half.
      //
      // DEBIT ACCOUNT: bulk imports are direct payments (Tally/Swastik
      // vouchers) with no bill linkage, so the debit goes to the
      // category-mapped expense account — never Sundry Creditors, which
      // would create negative payables for vendors we may not owe.
      const createdPayments = await db.$transaction(async (tx) => {
        const results: any[] = [];
        for (const p of input.payments) {
          const paymentDate = p.paymentDate ? new Date(p.paymentDate) : new Date();
          const item = await tx.payment.create({
            data: {
              projectId: input.projectId,
              ...p,
              paymentDate,
              netPaid: p.amount - (p.tdsDeducted || 0),
              createdById: ctx.user.id,
            },
          });
          results.push(item);

          const debitAccountCode = paymentDebitAccountForCategory(p.category, p.payeeType);
          const debitAccountName = accountNameForCode(debitAccountCode) || "Site Expenses";
          const bankCode = p.paymentMode === "cash" ? "1001" : "1010";
          const bankName = p.paymentMode === "cash" ? "Cash" : "Bank";
          const netPaid = p.amount - (p.tdsDeducted || 0);

          await createJournalEntry(tx, {
            source: "payment",
            sourceRefId: item.id,
            sourceRefType: "Payment",
            description: `Bulk payment to ${p.payeeName}`,
            entryDate: paymentDate,
            postedById: ctx.user.id,
            organizationId: ctx.user.organizationId ?? undefined,
            lines: [
              {
                accountCode: debitAccountCode,
                accountName: debitAccountName,
                debit: p.amount,
                credit: 0,
                description: `Bulk import payment to ${p.payeeName} (${p.category || "uncategorized"})`,
                projectId: input.projectId,
              },
              ...((p.tdsDeducted || 0) > 0 ? [{
                accountCode: "2020" as const,
                accountName: "TDS Payable",
                debit: 0,
                credit: p.tdsDeducted,
                description: `TDS deducted from ${p.payeeName}`,
                projectId: input.projectId,
              }] : []),
              {
                accountCode: bankCode,
                accountName: bankName,
                debit: 0,
                credit: netPaid,
                description: `Net payment via ${p.paymentMode}`,
                projectId: input.projectId,
              },
            ],
          });
        }
        return results;
      });

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
      await assertDelegation(ctx.user, "create_payment");

      // IDOR FIX: verify the payment belongs to input.projectId.
      const existing = await db.payment.findFirst({
        where: { id: input.id, projectId: input.projectId },
        select: { id: true, paymentDate: true, amount: true, payeeName: true, companyBankAccountId: true, netPaid: true },
      });
      if (!existing) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Payment not found in this project." });
      }

      // FISCAL YEAR LOCK
      await assertNotLocked(ctx.user.organizationId, existing.paymentDate);

      // JE REVERSAL + DELETE — ATOMIC. Previously deleting a payment left
      // its journal entry permanently orphaned in the GL: the Trial
      // Balance kept reflecting a payment that no longer existed, with no
      // way to reconcile. Now every JE generated from this payment
      // (sourceRefId/sourceRefType) is reversed via the engine's
      // reverseJournalEntry (mirror entry, debits/credits swapped) in the
      // same transaction as the delete.
      await db.$transaction(async (tx) => {
        const linkedEntries = await tx.journalEntry.findMany({
          where: { sourceRefId: input.id, sourceRefType: "Payment" },
          select: { id: true },
        });

        for (const je of linkedEntries) {
          // Skip entries that already have a reversal (idempotency).
          const alreadyReversed = await tx.journalEntry.findFirst({
            where: { reversalOfId: je.id },
            select: { id: true },
          });
          if (!alreadyReversed) {
            await reverseJournalEntry(
              tx,
              je.id,
              `Payment deleted — ${existing.payeeName} (NPR ${existing.amount.toLocaleString()})`,
            );
          }
        }

        // If the payment had drawn on a central bank account, restore the
        // balance (money never left). Receipts (inflows) have
        // voucherType "receipt" and INCREASED the balance.
        if (existing.companyBankAccountId) {
          const receipt = await tx.payment.findUnique({
            where: { id: input.id },
            select: { voucherType: true },
          });
          const isReceipt = receipt?.voucherType === "receipt";
          const delta = existing.netPaid ?? existing.amount;
          await tx.$executeRaw`
            UPDATE "CompanyBankAccount"
            SET "currentBalance" = "currentBalance" + ${isReceipt ? -delta : delta}
            WHERE "id" = ${existing.companyBankAccountId}
          `;
        }

        await tx.payment.delete({ where: { id: input.id } });
      });
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

      // IDOR FIX: verify the payment belongs to input.projectId.
      const existing = await db.payment.findFirst({
        where: { id: input.paymentId, projectId: input.projectId },
        select: { id: true },
      });
      if (!existing) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Payment not found in this project." });
      }

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
   * Outstanding Payables Query — Consolidated view of all unpaid/partially paid Vendor Bills
   * and certified Subcontractor Bills with outstanding balances.
   */
  outstandingPayables: protectedProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ ctx, input }) => {
      await assertProjectMember(ctx.user, input.projectId);

      // 1. Unpaid / Partially Paid Vendor Bills
      const vendorBills = await db.vendorBill.findMany({
        where: {
          projectId: input.projectId,
          status: { in: ["unpaid", "partially_paid"] },
        },
        include: {
          partner: { select: { id: true, name: true, pan: true, phone: true } },
          purchaseOrder: { select: { id: true, number: true } },
        },
        orderBy: { billDate: "desc" },
      });

      // 2. Certified / Submitted Subcontractor Bills with unpaid balances
      const subBills = await db.subcontractorBill.findMany({
        where: {
          projectId: input.projectId,
          status: { in: ["submitted", "verified", "certified", "approved"] },
        },
        include: {
          subcontractor: { select: { id: true, name: true, pan: true, phone: true } },
        },
        orderBy: { billDate: "desc" },
      });

      const activeSubBills = subBills.filter((b) => b.netPayable > (b.paidAmount || 0) + 0.01);

      // 3. Staff Expense Claims / Internal Payables (Logged as VatBill/Expense with pending balance)
      const staffBills = await db.vatBill.findMany({
        where: {
          projectId: input.projectId,
          category: { in: ["site_expense", "office_overhead", "food_mess", "travel_fuel", "staff_claim"] },
        },
        orderBy: { billDate: "desc" },
      });

      // Find matching payments for staff bills
      const staffPayments = await db.payment.findMany({
        where: {
          projectId: input.projectId,
        },
        select: { payeeName: true, amount: true },
      });

      const staffPayables = staffBills.map((sb) => {
        const totalPaidForStaff = staffPayments
          .filter((sp) => sp.payeeName.toLowerCase().trim() === sb.partyName.toLowerCase().trim())
          .reduce((sum, sp) => sum + sp.amount, 0);

        return {
          id: sb.id,
          entityType: "staff" as const,
          entityId: sb.id,
          entityName: sb.partyName || "Site Staff",
          entityPan: sb.partyPan || null,
          entityPhone: null,
          billNumber: sb.billNumber,
          billDate: sb.billDate.toISOString(),
          dueDate: null,
          grossAmount: sb.totalAmount || sb.netPayable,
          vatAmount: sb.vatAmount,
          tdsAmount: sb.tdsAmount,
          tdsPercent: sb.tdsPercent || 0,
          netPayable: sb.netPayable,
          paidAmount: 0,
          balanceDue: sb.netPayable,
          status: "pending",
          poNumber: null,
          category: "Staff Claim",
        };
      });

      // 4. Format unified payables list
      const payables = [
        ...vendorBills.map((b) => ({
          id: b.id,
          entityType: "vendor" as const,
          entityId: b.partnerId,
          entityName: b.partner?.name || "Unknown Supplier",
          entityPan: b.partner?.pan || null,
          entityPhone: b.partner?.phone || null,
          billNumber: b.billNumber,
          billDate: b.billDate.toISOString(),
          dueDate: b.dueDate ? b.dueDate.toISOString() : null,
          grossAmount: b.grossAmount,
          vatAmount: b.vatAmount,
          tdsAmount: b.tdsAmount,
          tdsPercent: 1.5,
          netPayable: b.netPayable,
          paidAmount: b.paidAmount,
          balanceDue: Math.max(0, b.netPayable - b.paidAmount),
          status: b.status,
          poNumber: b.purchaseOrder?.number || null,
          category: "Materials",
        })),
        ...activeSubBills.map((b) => ({
          id: b.id,
          entityType: "subcontractor" as const,
          entityId: b.subcontractorId,
          entityName: b.subcontractor?.name || "Unknown Subcontractor",
          entityPan: b.subcontractor?.pan || null,
          entityPhone: b.subcontractor?.phone || null,
          billNumber: b.number,
          billDate: b.billDate.toISOString(),
          dueDate: null,
          grossAmount: b.grossAmount,
          vatAmount: b.vatAmount,
          tdsAmount: b.tdsAmount,
          tdsPercent: b.tdsPercent || 1.5,
          netPayable: b.netPayable,
          paidAmount: b.paidAmount,
          balanceDue: Math.max(0, b.netPayable - b.paidAmount),
          status: b.status,
          poNumber: null,
          category: "Subcontractor",
        })),
        ...staffPayables,
      ];

      const totalVendorDue = vendorBills.reduce((sum, b) => sum + Math.max(0, b.netPayable - b.paidAmount), 0);
      const totalSubcontractorDue = activeSubBills.reduce((sum, b) => sum + Math.max(0, b.netPayable - (b.paidAmount || 0)), 0);
      const totalStaffDue = staffPayables.reduce((sum, b) => sum + b.balanceDue, 0);
      const totalDue = totalVendorDue + totalSubcontractorDue + totalStaffDue;

      return {
        payables,
        summary: {
          totalVendorDue,
          totalSubcontractorDue,
          totalStaffDue,
          totalDue,
          vendorBillsCount: vendorBills.length,
          subBillsCount: activeSubBills.length,
          staffBillsCount: staffPayables.length,
          totalCount: payables.length,
        },
      };
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

      // Get Subcontractor Bill & IPC retention amounts per subcontractor
      const [ipcs, subBills] = await Promise.all([
        db.ipc.findMany({
          where: { projectId: input.projectId, subcontractorId: { not: null } },
          select: { subcontractorId: true, retentionAmount: true, status: true },
        }),
        db.subcontractorBill.findMany({
          where: {
            projectId: input.projectId,
            status: { in: ["submitted", "verified", "certified", "paid"] },
          },
          select: { subcontractorId: true, retentionAmount: true },
        }),
      ]);

      const ipcRetentionBySub = new Map<string, number>();
      for (const bill of subBills) {
        if (!bill.subcontractorId) continue;
        ipcRetentionBySub.set(
          bill.subcontractorId,
          (ipcRetentionBySub.get(bill.subcontractorId) ?? 0) + bill.retentionAmount
        );
      }
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
      paymentDate: z.string().optional().transform((v) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? `${v}T00:00:00.000Z` : v)),
      paymentMode: z.enum(["cash", "bank_transfer", "cheque", "mobile_pay"]).default("bank_transfer"),
      chequeNo: z.string().optional(),
      bankRef: z.string().optional(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await assertCanWrite(ctx.user, input.projectId);
      await assertDelegation(ctx.user, "release_retention", input.amount);

      const paymentDate = input.paymentDate ? new Date(input.paymentDate) : new Date();

      // FISCAL YEAR LOCK
      await assertNotLocked(ctx.user.organizationId, paymentDate);

      const sub = await db.subcontractor.findFirst({
        where: { id: input.subcontractorId, projectId: input.projectId },
        select: { id: true, name: true, totalRetentionHeld: true, totalRetentionReleased: true },
      });
      if (!sub) throw new TRPCError({ code: "NOT_FOUND", message: "Subcontractor not found" });

      // OVER-RELEASE CHECK: reject if the release would exceed the held
      // retention amount. Without this, a user can release more retention
      // than was ever held, producing negative "held" balances.
      const held = (sub.totalRetentionHeld || 0) - (sub.totalRetentionReleased || 0);
      if (input.amount > held + 0.01) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Cannot release ${input.amount}: only ${held} retention is currently held for ${sub.name}.`,
        });
      }

      // PAYMENT + JE + SUB UPDATE — ONE TRANSACTION. Previously the three
      // writes committed independently: a JE failure after the payment row
      // existed left an un-journaled retention release with no retry, and
      // a failed sub update left the payment posted without the released
      // total being tracked (so the over-release check would drift).
      const payment = await db.$transaction(async (tx) => {
        const created = await tx.payment.create({
          data: {
            projectId: input.projectId,
            payeeType: "subcontractor",
            payeeId: input.subcontractorId,
            payeeName: sub.name,
            amount: input.amount,
            netPaid: input.amount,
            retentionReleased: input.amount,
            paymentDate,
            paymentMode: input.paymentMode,
            chequeNo: input.chequeNo,
            bankRef: input.bankRef,
            notes: input.notes || "Retention release",
            status: "paid",
            createdById: ctx.user.id,
          },
        });

        // JOURNAL ENTRY: retention release to subcontractor.
        // Dr Retention Payable (2010) = amount
        //    Cr Subcontractor Payables (2002) = amount
        await createJournalEntry(tx, {
          source: "retention_release",
          sourceRefId: created.id,
          sourceRefType: "Payment",
          description: `Retention release to ${sub.name}`,
          entryDate: paymentDate,
          postedById: ctx.user.id,
          organizationId: ctx.user.organizationId ?? undefined,
          lines: [
            {
              accountCode: "2010",
              accountName: "Retention Payable (to Subcontractors)",
              debit: input.amount,
              credit: 0,
              description: `Retention released to ${sub.name}`,
              projectId: input.projectId,
              partnerId: input.subcontractorId,
            },
            {
              accountCode: "2002",
              accountName: "Subcontractor Payables",
              debit: 0,
              credit: input.amount,
              description: `Retention now due to ${sub.name}`,
              projectId: input.projectId,
              partnerId: input.subcontractorId,
            },
          ],
        });

        // Update subcontractor's released total
        await tx.subcontractor.update({
          where: { id: input.subcontractorId },
          data: {
            totalRetentionReleased: sub.totalRetentionReleased + input.amount,
          },
        });

        return created;
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
          payeeName: ipc.subcontractor?.name ?? "Client Billing",
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
