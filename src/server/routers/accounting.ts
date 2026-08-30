/**
 * Native Accounting Router (Tally / Swastik-like lightweight single & double-entry system).
 * Provides Day Book, Ledger Statements, Trial Balance, and Cash/Bank accounts.
 */
import { z } from "zod";
import { router, protectedProcedure } from "@/server/trpc";
import { db } from "@/lib/db";
import { withOrgContext } from "@/lib/rls";
import { assertProjectMember, assertCanWrite } from "@/lib/authz";
import { assertNotLocked } from "@/lib/fiscal-year-lock";
import { adToBs } from "@/lib/nepali-calendar";
import { createJournalEntry, clientReceiptEntry, type InflowType } from "@/lib/journal-entry";
import { aggregateTrialBalance, assertGlBalanced } from "@/server/utils/gl-trial-balance";

export const accountingRouter = router({
  /**
   * Day Book (दैनिक खाता / रोजकट्टी)
   * Chronological journal of all transactions (Payments, Purchases, Certified Bills, IPCs, Expenses).
   */
  dayBook: protectedProcedure
    .input(
      z.object({
        projectId: z.string().optional().nullable(),
        fromDate: z.string().optional(),
        toDate: z.string().optional(),
        voucherType: z.string().optional(), // all | payment | purchase | work_done | billing | expense | ho_expense
        accountingSoftware: z.string().optional(), // all | tally | swastik | other
        search: z.string().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const user = await db.user.findUniqueOrThrow({
        where: { id: ctx.user.id },
        select: { organizationId: true },
      });

      if (!user.organizationId) {
        return { entries: [], summary: { totalDebit: 0, totalCredit: 0, count: 0 } };
      }

      if (input.projectId) {
        await assertProjectMember(ctx.user, input.projectId);
      }

      const entries: Array<{
        id: string;
        source: "payment" | "vendor_bill" | "subcontractor_bill" | "ipc" | "site_expense" | "head_office_expense";
        voucherNo: string;
        voucherType: string;
        projectCode?: string;
        projectName?: string;
        date: string;
        miti: string;
        accountHead: string;
        particulars: string;
        partyPan?: string | null;
        debit: number;
        credit: number;
        netAmount: number;
        paymentMode?: string | null;
        accountingSoftware?: string | null;
        scannedBillUrl?: string | null;
      }> = [];

      // Fetch project info if specified
      let proj: { code: string; name: string } | null = null;
      if (input.projectId) {
        proj = await db.project.findUnique({
          where: { id: input.projectId },
          select: { code: true, name: true },
        });
      }

      const projectFilter = input.projectId
        ? { projectId: input.projectId }
        : { project: { organizationId: user.organizationId } };

      // 1. Payments / Disbursements
      const payments = await db.payment.findMany({
        where: {
          ...projectFilter,
          ...(input.fromDate || input.toDate
            ? {
                paymentDate: {
                  ...(input.fromDate ? { gte: new Date(input.fromDate) } : {}),
                  ...(input.toDate ? { lte: new Date(input.toDate) } : {}),
                },
              }
            : {}),
          ...(input.accountingSoftware && input.accountingSoftware !== "all"
            ? { accountingSoftware: input.accountingSoftware as any }
            : {}),
        },
        include: { project: { select: { code: true, name: true } } },
        orderBy: { paymentDate: "desc" },
      });

      payments.forEach((p) => {
        let mitiStr = p.paymentMiti;
        if (!mitiStr) {
          try {
            mitiStr = adToBs(new Date(p.paymentDate)).formatted;
          } catch {
            mitiStr = "";
          }
        }

        entries.push({
          id: p.id,
          source: "payment",
          voucherNo: p.accountingVoucherNo || `PV-${p.id.slice(-5).toUpperCase()}`,
          voucherType: (p.voucherType || "payment").toUpperCase(),
          projectCode: p.project?.code || proj?.code || "SITE",
          projectName: p.project?.name || proj?.name || "Project",
          date: p.paymentDate.toISOString(),
          miti: mitiStr || "—",
          accountHead: p.category || "General Expense",
          particulars: `${p.payeeName} ${p.invoiceNumber ? `(Bill #${p.invoiceNumber})` : ""} - ${p.notes || "Payment Disbursement"}`,
          partyPan: p.partyPan,
          debit: Number(p.amount || 0),
          credit: 0,
          netAmount: Number(p.netPaid || (Number(p.amount || 0) - Number(p.tdsDeducted || 0)) || 0),
          paymentMode: p.paymentMode,
          accountingSoftware: p.accountingSoftware,
          scannedBillUrl: p.scannedBillUrl,
        });
      });

      // 2. Vendor Bills (Purchases / Material Accruals)
      const vendorBills = await db.vendorBill.findMany({
        where: {
          ...projectFilter,
          ...(input.fromDate || input.toDate
            ? {
                billDate: {
                  ...(input.fromDate ? { gte: new Date(input.fromDate) } : {}),
                  ...(input.toDate ? { lte: new Date(input.toDate) } : {}),
                },
              }
            : {}),
        },
        include: { partner: true, project: { select: { code: true, name: true } } },
        orderBy: { billDate: "desc" },
      });

      vendorBills.forEach((b) => {
        let mitiStr = "";
        try {
          mitiStr = adToBs(new Date(b.billDate)).formatted;
        } catch {}

        entries.push({
          id: b.id,
          source: "vendor_bill",
          voucherNo: b.billNumber,
          voucherType: "PURCHASE BILL",
          projectCode: b.project?.code || proj?.code || "SITE",
          projectName: b.project?.name || proj?.name || "Project",
          date: b.billDate.toISOString(),
          miti: mitiStr || "—",
          accountHead: "Materials & Supplies",
          particulars: `Purchase from ${b.partner?.name || "Vendor"} (Gross: ${b.grossAmount}, VAT: ${b.vatAmount})`,
          partyPan: b.partner?.pan,
          debit: 0,
          credit: Number(b.netPayable || 0),
          netAmount: Number(b.netPayable || 0),
          paymentMode: "Credit / Bill",
          accountingSoftware: "tally",
          scannedBillUrl: b.fileUrl,
        });
      });

      // 3. Subcontractor Bills (Work Done Accruals)
      const subBills = await db.subcontractorBill.findMany({
        where: {
          ...projectFilter,
          ...(input.fromDate || input.toDate
            ? {
                billDate: {
                  ...(input.fromDate ? { gte: new Date(input.fromDate) } : {}),
                  ...(input.toDate ? { lte: new Date(input.toDate) } : {}),
                },
              }
            : {}),
        },
        include: { subcontractor: true, project: { select: { code: true, name: true } } },
        orderBy: { billDate: "desc" },
      });

      subBills.forEach((b) => {
        let mitiStr = "";
        try {
          mitiStr = adToBs(new Date(b.billDate)).formatted;
        } catch {}

        entries.push({
          id: b.id,
          source: "subcontractor_bill",
          voucherNo: b.number,
          voucherType: "SUB BILL",
          projectCode: b.project?.code || proj?.code || "SITE",
          projectName: b.project?.name || proj?.name || "Project",
          date: b.billDate.toISOString(),
          miti: mitiStr || "—",
          accountHead: "Subcontractor Work",
          particulars: `${b.subcontractor?.name || "Subcontractor"} - Period: ${b.period || "Work Done"}`,
          partyPan: b.subcontractor?.pan,
          debit: 0,
          credit: Number(b.netPayable || 0),
          netAmount: Number(b.netPayable || 0),
          paymentMode: "Certified Bill",
          accountingSoftware: "tally",
          scannedBillUrl: b.scannedBillUrl,
        });
      });

      // 4. Client IPC Billings (Revenue) & Subcontractor IPCs (Payables)
      const ipcs = await db.ipc.findMany({
        where: {
          ...projectFilter,
          ...(input.fromDate || input.toDate
            ? {
                createdAt: {
                  ...(input.fromDate ? { gte: new Date(input.fromDate) } : {}),
                  ...(input.toDate ? { lte: new Date(input.toDate) } : {}),
                },
              }
            : {}),
        },
        include: { subcontractor: { select: { name: true, pan: true } }, project: { select: { code: true, name: true } } },
        orderBy: { createdAt: "desc" },
      });

      ipcs.forEach((i) => {
        let mitiStr = "";
        const entryDate = i.issueDate || i.createdAt;
        try {
          mitiStr = adToBs(new Date(entryDate)).formatted;
        } catch {}

        const isSubcontractor = Boolean(i.subcontractorId);

        entries.push({
          id: i.id,
          source: "ipc",
          voucherNo: i.number,
          voucherType: isSubcontractor ? "SUB IPC" : "CLIENT IPC",
          projectCode: i.project?.code || proj?.code || "SITE",
          projectName: i.project?.name || proj?.name || "Project",
          date: entryDate.toISOString(),
          miti: mitiStr || "—",
          accountHead: isSubcontractor ? "Subcontractor Work (IPC)" : "Project Revenue / IPC",
          particulars: isSubcontractor
            ? `Subcontractor IPC #${i.number} - ${i.subcontractor?.name || "Subcontractor"} (Gross: ${i.grossAmount})`
            : `Client IPC #${i.number} - Client Progress Bill (Gross: ${i.grossAmount})`,
          partyPan: isSubcontractor ? i.subcontractor?.pan : undefined,
          debit: isSubcontractor ? 0 : Number(i.grossAmount || 0),
          credit: isSubcontractor ? Number(i.netPayable || 0) : 0,
          netAmount: Number(i.netPayable || 0),
          paymentMode: isSubcontractor ? "Subcontractor Bill" : "Client Bill",
          accountingSoftware: "tally",
        });
      });

      // 5. Head Office Overhead Expenses (when viewing organization-wide or without project filter)
      if (!input.projectId) {
        const hoExpenses = await db.headOfficeExpense.findMany({
          where: {
            organizationId: user.organizationId,
            ...(input.fromDate || input.toDate
              ? {
                  date: {
                    ...(input.fromDate ? { gte: new Date(input.fromDate) } : {}),
                    ...(input.toDate ? { lte: new Date(input.toDate) } : {}),
                  },
                }
              : {}),
          },
          include: { bankAccount: true },
          orderBy: { date: "desc" },
        });

        hoExpenses.forEach((ho) => {
          let mitiStr = ho.miti;
          if (!mitiStr) {
            try {
              mitiStr = adToBs(new Date(ho.date)).formatted;
            } catch {}
          }

          entries.push({
            id: ho.id,
            source: "head_office_expense",
            voucherNo: ho.voucherNo || `HO-${ho.id.slice(-5).toUpperCase()}`,
            voucherType: "HQ EXPENSE",
            projectCode: "HQ",
            projectName: "Head Office",
            date: ho.date.toISOString(),
            miti: mitiStr || "—",
            accountHead: ho.category,
            particulars: `${ho.particulars} (HQ Overhead)`,
            debit: Number(ho.amount || 0),
            credit: 0,
            netAmount: Number(ho.amount || 0),
            paymentMode: ho.bankAccount ? `${ho.bankAccount.bankName} (${ho.paymentMode})` : ho.paymentMode,
            accountingSoftware: "tally",
          });
        });
      }

      // 6. Site Petty Cash Expenses (approved or recorded)
      const siteExpenses = await db.siteExpense.findMany({
        where: {
          ...projectFilter,
          ...(input.fromDate || input.toDate
            ? {
                date: {
                  ...(input.fromDate ? { gte: new Date(input.fromDate) } : {}),
                  ...(input.toDate ? { lte: new Date(input.toDate) } : {}),
                },
              }
            : {}),
        },
        include: { project: { select: { code: true, name: true } } },
        orderBy: { date: "desc" },
      });

      siteExpenses.forEach((se) => {
        let mitiStr = "";
        try {
          mitiStr = adToBs(new Date(se.date)).formatted;
        } catch {}

        entries.push({
          id: se.id,
          source: "site_expense",
          voucherNo: se.number || `EXP-${se.id.slice(-5).toUpperCase()}`,
          voucherType: "PETTY CASH",
          projectCode: se.project?.code || proj?.code || "SITE",
          projectName: se.project?.name || proj?.name || "Project",
          date: se.date.toISOString(),
          miti: mitiStr || "—",
          accountHead: se.category || "Site Petty Cash",
          particulars: `${se.description} ${se.vendorName ? `(${se.vendorName})` : ""}`,
          partyPan: undefined,
          debit: Number(se.totalAmount || 0),
          credit: 0,
          netAmount: Number(se.totalAmount || 0),
          paymentMode: se.paymentMode,
          accountingSoftware: "tally",
          scannedBillUrl: se.receiptData,
        });
      });

      // Sort combined entries chronologically
      entries.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

      // Filter by search or voucherType if specified
      const filtered = entries.filter((e) => {
        if (input.voucherType && input.voucherType !== "all") {
          if (input.voucherType === "payment" && e.source !== "payment") return false;
          if (input.voucherType === "purchase" && e.source !== "vendor_bill") return false;
          if (input.voucherType === "work_done" && e.source !== "subcontractor_bill") return false;
          if (input.voucherType === "billing" && e.source !== "ipc") return false;
          if (input.voucherType === "expense" && e.source !== "site_expense" && e.source !== "head_office_expense") return false;
          if (input.voucherType === "ho_expense" && e.source !== "head_office_expense") return false;
          if (input.voucherType === "site_expense" && e.source !== "site_expense") return false;
        }
        if (input.search) {
          const q = input.search.toLowerCase();
          const matchVoucher = e.voucherNo.toLowerCase().includes(q);
          const matchParticulars = e.particulars.toLowerCase().includes(q);
          const matchHead = e.accountHead.toLowerCase().includes(q);
          const matchPan = e.partyPan?.toLowerCase().includes(q);
          if (!matchVoucher && !matchParticulars && !matchHead && !matchPan) return false;
        }
        return true;
      });

      const totalDebit = filtered.reduce((s, e) => s + e.debit, 0);
      const totalCredit = filtered.reduce((s, e) => s + e.credit, 0);

      return {
        entries: filtered,
        summary: {
          totalDebit,
          totalCredit,
          count: filtered.length,
        },
      };
    }),

  ledgerAccounts: protectedProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ ctx, input }) => {
      await assertProjectMember(ctx.user, input.projectId);

      const user = await db.user.findUniqueOrThrow({
        where: { id: ctx.user.id },
        select: { organizationId: true },
      });

      const [partners, subcontractors, members, equipmentVendors, orgBanks] = await Promise.all([
        db.partner.findMany({
          where: { projectId: input.projectId },
          select: { id: true, name: true, pan: true, phone: true },
          orderBy: { name: "asc" },
        }),
        db.subcontractor.findMany({
          where: { projectId: input.projectId },
          select: { id: true, name: true, pan: true, phone: true },
          orderBy: { name: "asc" },
        }),
        db.projectMember.findMany({
          where: { projectId: input.projectId },
          include: { user: { select: { id: true, name: true, email: true, role: true } } },
        }),
        db.equipmentVendor.findMany({
          where: { projectId: input.projectId },
          select: { id: true, name: true, pan: true, phone: true },
          orderBy: { name: "asc" },
        }),
        user.organizationId
          ? db.companyBankAccount.findMany({
              where: { organizationId: user.organizationId, status: "active" },
              orderBy: { isDefault: "desc" },
            })
          : Promise.resolve([]),
      ]);

      const bankAccountsList =
        orgBanks.length > 0
          ? orgBanks.map((b) => ({
              id: b.id,
              name: `${b.bankName} (${b.accountNumber})${b.branch ? ` - ${b.branch}` : ""}`,
              type: (b.accountType === "petty_cash" ? "cash" : "bank") as "bank" | "cash",
              group: b.accountType === "petty_cash" ? "Cash-inHand" : "Bank Accounts",
              pan: null,
              phone: null,
            }))
          : [
              {
                id: "cash_petty",
                name: "Site Petty Cash",
                type: "cash" as const,
                group: "Cash-inHand",
                pan: null,
                phone: null,
              },
            ];

      const accounts = [
        ...bankAccountsList,
        ...partners.map((p) => ({
          id: p.id,
          name: p.name,
          type: "vendor" as const,
          group: "Sundry Creditors (Material Suppliers)",
          pan: p.pan,
          phone: p.phone,
        })),
        ...equipmentVendors
          .filter((ev) => !partners.some((p) => p.name.toLowerCase() === ev.name.toLowerCase()))
          .map((ev) => ({
            id: ev.id,
            name: ev.name,
            type: "vendor" as const,
            group: "Sundry Creditors (Equipment Vendors)",
            pan: ev.pan,
            phone: ev.phone,
          })),
        ...subcontractors.map((s) => ({
          id: s.id,
          name: s.name,
          type: "subcontractor" as const,
          group: "Subcontractor Payables",
          pan: s.pan,
          phone: s.phone,
        })),
        ...members.map((m) => ({
          id: m.user.id,
          name: `${m.user.name || m.user.email}${m.user.role ? ` (${m.user.role})` : ""}`,
          type: "staff" as const,
          group: "Staff Imprest / Advances",
          pan: null,
          phone: null,
        })),
      ];

      return { accounts };
    }),

  /** Get Full Account Ledger Statement with Running Balance (खता पाना) */
  ledgerStatement: protectedProcedure
    .input(
      z.object({
        projectId: z.string(),
        accountId: z.string(),
        accountType: z.enum(["vendor", "subcontractor", "staff", "bank", "cash", "expense_head", "general"]),
        accountName: z.string().optional(),
        fromDate: z.string().optional(),
        toDate: z.string().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      await assertProjectMember(ctx.user, input.projectId);

      const txns: Array<{
        id: string;
        date: string;
        miti: string;
        voucherNo: string;
        voucherType: string;
        particulars: string;
        debit: number;
        credit: number;
        runningBalance: number;
      }> = [];

      let openingBalance = 0;

      if (input.accountType === "vendor") {
        // Vendor: Bills are Credits, Payments are Debits
        const bills = await db.vendorBill.findMany({
          where: { projectId: input.projectId, partnerId: input.accountId },
          orderBy: { billDate: "asc" },
        });

        const matchedVendor = await db.partner.findFirst({
          where: { id: input.accountId, projectId: input.projectId },
        });

        // Match payments by direct foreign key (payeeId), exact PAN, or exact name
        const vPayments = await db.payment.findMany({
          where: {
            projectId: input.projectId,
            OR: [
              { payeeId: input.accountId },
              ...(matchedVendor?.pan ? [{ partyPan: matchedVendor.pan }] : []),
              ...(matchedVendor?.name ? [{ payeeName: { equals: matchedVendor.name, mode: "insensitive" as const } }] : []),
            ],
          },
          orderBy: { paymentDate: "asc" },
        });

        bills.forEach((b) => {
          let miti = "";
          try {
            miti = adToBs(new Date(b.billDate)).formatted;
          } catch {}
          txns.push({
            id: b.id,
            date: b.billDate.toISOString(),
            miti,
            voucherNo: b.billNumber,
            voucherType: "Purchase Bill",
            particulars: `Purchase of materials (Gross: ${b.grossAmount}, VAT: ${b.vatAmount}, TDS: ${b.tdsAmount})`,
            debit: 0,
            credit: b.netPayable,
            runningBalance: 0,
          });
        });

        vPayments.forEach((p) => {
          let miti = "";
          try {
            miti = adToBs(new Date(p.paymentDate)).formatted;
          } catch {}
          txns.push({
            id: p.id,
            date: p.paymentDate.toISOString(),
            miti,
            voucherNo: p.accountingVoucherNo || `PV-${p.id.slice(-5)}`,
            voucherType: "Payment Voucher",
            particulars: `Paid via ${p.paymentMode} ${p.chequeNo ? `(Cheque #${p.chequeNo})` : ""} - TDS: ${p.tdsDeducted}`,
            debit: p.amount,
            credit: 0,
            runningBalance: 0,
          });
        });
      } else if (input.accountType === "subcontractor") {
        // Subcontractor: Bills are Credits, Payments are Debits
        const bills = await db.subcontractorBill.findMany({
          where: { projectId: input.projectId, subcontractorId: input.accountId },
          orderBy: { billDate: "asc" },
        });
        const matchedSub = await db.subcontractor.findFirst({
          where: { id: input.accountId, projectId: input.projectId },
        });

        // Match payments by direct foreign key (payeeId), exact PAN, or exact name
        const sPayments = await db.payment.findMany({
          where: {
            projectId: input.projectId,
            payeeType: "subcontractor",
            OR: [
              { payeeId: input.accountId },
              ...(matchedSub?.pan ? [{ partyPan: matchedSub.pan }] : []),
              ...(matchedSub?.name ? [{ payeeName: { equals: matchedSub.name, mode: "insensitive" as const } }] : []),
            ],
          },
          orderBy: { paymentDate: "asc" },
        });

        bills.forEach((b) => {
          let miti = "";
          try {
            miti = adToBs(new Date(b.billDate)).formatted;
          } catch {}
          txns.push({
            id: b.id,
            date: b.billDate.toISOString(),
            miti,
            voucherNo: b.number,
            voucherType: "Subcontractor Bill",
            particulars: `Bill for Period: ${b.period || "Work"} (Gross: ${b.grossAmount}, Retention: ${b.retentionAmount})`,
            debit: 0,
            credit: b.netPayable,
            runningBalance: 0,
          });
        });

        sPayments.forEach((p) => {
          let miti = "";
          try {
            miti = adToBs(new Date(p.paymentDate)).formatted;
          } catch {}
          txns.push({
            id: p.id,
            date: p.paymentDate.toISOString(),
            miti,
            voucherNo: p.accountingVoucherNo || `PV-${p.id.slice(-5)}`,
            voucherType: "Payment Voucher",
            particulars: `Paid via ${p.paymentMode} ${p.chequeNo ? `(Cheque #${p.chequeNo})` : ""}`,
            debit: p.amount,
            credit: 0,
            runningBalance: 0,
          });
        });
      } else if (input.accountType === "staff") {
        // Staff Member: Expense Claims/Bills are Credits, Reimbursements are Debits
        const staffBills = await db.vatBill.findMany({
          where: {
            projectId: input.projectId,
            partyName: { contains: input.accountName || "", mode: "insensitive" },
          },
          orderBy: { billDate: "asc" },
        });

        const payments = await db.payment.findMany({
          where: {
            projectId: input.projectId,
            payeeName: { contains: input.accountName || "", mode: "insensitive" },
          },
          orderBy: { paymentDate: "asc" },
        });

        staffBills.forEach((b) => {
          let miti = "";
          try {
            miti = adToBs(new Date(b.billDate)).formatted;
          } catch {}
          txns.push({
            id: b.id,
            date: b.billDate.toISOString(),
            miti,
            voucherNo: b.billNumber || `EXP-${b.id.slice(-5)}`,
            voucherType: "Expense Claim",
            particulars: `Approved Claim: ${b.description || b.category || "Site Expense"} (Amount: ${b.netPayable})`,
            debit: 0,
            credit: b.netPayable,
            runningBalance: 0,
          });
        });

        payments.forEach((p) => {
          let miti = "";
          try {
            miti = adToBs(new Date(p.paymentDate)).formatted;
          } catch {}
          txns.push({
            id: p.id,
            date: p.paymentDate.toISOString(),
            miti,
            voucherNo: p.accountingVoucherNo || `PV-${p.id.slice(-5)}`,
            voucherType: "Reimbursement",
            particulars: `Reimbursement via ${p.paymentMode} (${p.category})`,
            debit: p.amount,
            credit: 0,
            runningBalance: 0,
          });
        });
      } else {
        // Bank / Expense Head / Cash
        const payments = await db.payment.findMany({
          where: { projectId: input.projectId },
          orderBy: { paymentDate: "asc" },
        });

        payments.forEach((p) => {
          let miti = "";
          try {
            miti = adToBs(new Date(p.paymentDate)).formatted;
          } catch {}

          // INFLOW DIRECTION: receipts (voucherType "receipt", or legacy
          // inflows created before that flag existed with category
          // "Project Inflow / Capital") are money INTO the bank/cash
          // account — they must appear on the DEBIT side of the bank
          // ledger (debit increases the balance, see running-balance
          // loop below). Previously every payment was pushed as a credit,
          // so a deposit reduced the bank balance in the statement.
          const isInflow =
            p.voucherType === "receipt" ||
            p.category === "Project Inflow / Capital";

          if (input.accountType === "bank" && p.paymentMode !== "cash") {
            if (isInflow) {
              txns.push({
                id: p.id,
                date: p.paymentDate.toISOString(),
                miti,
                voucherNo: p.accountingVoucherNo || `BR-${p.id.slice(-5)}`,
                voucherType: "Bank Receipt",
                particulars: `Received from ${p.payeeName} (${p.category})`,
                debit: p.netPaid || p.amount,
                credit: 0,
                runningBalance: 0,
              });
            } else {
              txns.push({
                id: p.id,
                date: p.paymentDate.toISOString(),
                miti,
                voucherNo: p.accountingVoucherNo || `BP-${p.id.slice(-5)}`,
                voucherType: "Bank Payment",
                particulars: `Payment to ${p.payeeName} (${p.category})`,
                debit: 0,
                credit: p.netPaid || p.amount,
                runningBalance: 0,
              });
            }
          } else if (input.accountType === "cash" && p.paymentMode === "cash") {
            if (isInflow) {
              txns.push({
                id: p.id,
                date: p.paymentDate.toISOString(),
                miti,
                voucherNo: p.accountingVoucherNo || `CR-${p.id.slice(-5)}`,
                voucherType: "Cash Receipt",
                particulars: `Cash received from ${p.payeeName} (${p.category})`,
                debit: p.netPaid || p.amount,
                credit: 0,
                runningBalance: 0,
              });
            } else {
              txns.push({
                id: p.id,
                date: p.paymentDate.toISOString(),
                miti,
                voucherNo: p.accountingVoucherNo || `CP-${p.id.slice(-5)}`,
                voucherType: "Cash Payment",
                particulars: `Cash Payment to ${p.payeeName} (${p.category})`,
                debit: 0,
                credit: p.netPaid || p.amount,
                runningBalance: 0,
              });
            }
          } else if (input.accountType === "expense_head") {
            const matchesCat = p.categoryId === input.accountId || (input.accountName && p.category?.toLowerCase() === input.accountName.toLowerCase());
            if (matchesCat) {
              txns.push({
                id: p.id,
                date: p.paymentDate.toISOString(),
                miti,
                voucherNo: p.accountingVoucherNo || `PV-${p.id.slice(-5)}`,
                voucherType: "Expense Voucher",
                particulars: `${p.payeeName} - ${p.subCategory || "Disbursement"}`,
                debit: p.amount,
                credit: 0,
                runningBalance: 0,
              });
            }
          }
        });
      }

      // Sort by date ascending to compute running balances
      txns.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

      let currentBal = openingBalance;
      txns.forEach((t) => {
        if (input.accountType === "vendor" || input.accountType === "subcontractor") {
          // Credit increases payable, Debit decreases payable
          currentBal += t.credit - t.debit;
        } else {
          // Asset/Expense: Debit increases, Credit decreases
          currentBal += t.debit - t.credit;
        }
        t.runningBalance = currentBal;
      });

      const totalDebit = txns.reduce((s, t) => s + t.debit, 0);
      const totalCredit = txns.reduce((s, t) => s + t.credit, 0);

      return {
        openingBalance,
        transactions: txns.reverse(), // reverse to display newest first
        closingBalance: currentBal,
        totalDebit,
        totalCredit,
      };
    }),

  /**
   * Trial Balance (सन्तुलन परीक्षण / वासलात)
   *
   * GL-DRIVEN: aggregates the actual double-entry ledger
   * (JournalEntryLine) for this project — the output of the journal-entry
   * engine, which guarantees every posted entry is balanced at write
   * time. Total Debits == Total Credits by construction.
   *
   * The previous implementation rebuilt the balance from ad-hoc
   * single-entry queries over Payments/Bills/IPCs. That version could
   * never tie out: it had no bank/cash rows (payments reduced nothing),
   * no VAT/TDS double entries, recognized revenue only from IPC status,
   * and contained a dead ternary (`? 0 : 0`) on the receivables line.
   * It reported "balanced" only when a project happened to have no
   * unpaid bills and no money in the bank.
   *
   * Aggregation lives in the central helper `aggregateTrialBalance`
   * (unit-tested in gl-trial-balance.test.ts); this route only enforces
   * access control and fetches the lines.
   */
  trialBalance: protectedProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ ctx, input }) => {
      await assertProjectMember(ctx.user, input.projectId);

      // Posted entries only — drafts are not part of the ledger.
      const lines = await db.journalEntryLine.findMany({
        where: {
          projectId: input.projectId,
          journalEntry: { isPosted: true },
        },
        select: {
          accountCode: true,
          accountName: true,
          debit: true,
          credit: true,
        },
        orderBy: { accountCode: "asc" },
      });

      const result = aggregateTrialBalance(lines);
      assertGlBalanced(result, { organizationId: ctx.user.organizationId });
      return result;
    }),

  /**
   * Log Manual Journal / Inflow Entry (जर्नल भौचर / आम्दानी प्रविष्टि)
   *
   * Records money RECEIVED by the contractor (the "Money In" dialog on
   * the Day Book tab). This is the cash-in side of the GL:
   *
   *   Dr Bank (1010) / Cash (1001)          = amount
   *      Cr <account per inflow nature>     = amount
   *        Client IPC Running Bill → 1100 Client Receivables
   *        Mobilization Advance     → 2050 Mobilization Advance Received
   *        Partner Capital Deposit  → 3000 Owner's Capital
   *        Security Deposit Refund  → 1110 Retention Receivable
   *        Other Site Inflow        → 4100 Other Income
   *
   * Previously this created ONLY a Payment row with no journal entry —
   * the GL had no cash-in side at all, the bank ledger never showed
   * receipts, and the Trial Balance could not balance. The JE is built by
   * the central engine helper `clientReceiptEntry` and posted in the SAME
   * transaction as the Payment row and the CompanyBankAccount balance
   * increment (when a central bank account is selected).
   */
  logJournalEntry: protectedProcedure
    .input(
      z.object({
        projectId: z.string(),
        date: z.string(),
        debitAccountId: z.string(), // CompanyBankAccount id, "cash_petty", or free-text account label
        creditAccountId: z.string().optional(), // legacy free-text field (kept for UI compat, not used for posting)
        inflowType: z.enum([
          "Client IPC Running Bill",
          "Mobilization Advance",
          "Partner Capital Deposit",
          "Security Deposit Refund",
          "Other Site Inflow",
        ]).default("Other Site Inflow"),
        receivedFrom: z.string().min(1).max(200).default("Client"),
        amount: z.number().positive(),
        narration: z.string(),
        source: z.string().default("manual"),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await assertCanWrite(ctx.user, input.projectId);
      await assertNotLocked(ctx.user.organizationId, new Date(input.date));

      const entryDate = new Date(input.date);

      // Resolve the deposit account: a real CompanyBankAccount id (scoped
      // to the caller's org) selects that bank; anything else is cash.
      // Org-less users (no organizationId) can't match a bank account —
      // their inflows are treated as cash.
      const bankAccount = ctx.user.organizationId
        ? await db.companyBankAccount.findFirst({
            where: {
              id: input.debitAccountId,
              organizationId: ctx.user.organizationId,
              status: "active",
            },
            select: { id: true, accountType: true },
          })
        : null;
      const isCash = !bankAccount || bankAccount.accountType === "petty_cash";
      const paymentMode = isCash ? "cash" : "bank_transfer";

      const payment = await db.$transaction(async (tx) => {
        await withOrgContext(tx, ctx.user.organizationId, !!ctx.user.isSuperAdmin);
        const receipt = await tx.payment.create({
          data: {
            projectId: input.projectId,
            amount: input.amount,
            netPaid: input.amount,
            paymentDate: entryDate,
            paymentMode,
            payeeName: input.receivedFrom,
            payeeType: "other",
            category: input.inflowType,
            notes: input.narration,
            status: "paid",
            voucherType: "receipt", // marks the direction for ledgers / day book
            accountingVoucherNo: `CR-${Date.now().toString().slice(-6)}`,
            companyBankAccountId: bankAccount?.id ?? null,
            createdById: ctx.user.id,
          },
        });

        // Balanced cash-in journal entry via the central engine.
        await createJournalEntry(tx, {
          ...clientReceiptEntry({
            receiptId: receipt.id,
            inflowType: input.inflowType as InflowType,
            receivedFrom: input.receivedFrom,
            amount: input.amount,
            paymentMode,
            projectId: input.projectId,
            date: entryDate,
          }),
          postedById: ctx.user.id,
          organizationId: ctx.user.organizationId ?? undefined,
        });

        // Keep the central bank account balance in sync — money in
        // INCREASES the balance (atomic increment, same transaction).
        if (bankAccount && !isCash) {
          await tx.$executeRaw`
            UPDATE "CompanyBankAccount"
            SET "currentBalance" = "currentBalance" + ${input.amount}
            WHERE "id" = ${bankAccount.id}
          `;
        }

        return receipt;
      });

      return { success: true, paymentId: payment.id };
    }),
});
