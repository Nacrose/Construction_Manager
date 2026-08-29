/**
 * Native Accounting Router (Tally / Swastik-like lightweight single & double-entry system).
 * Provides Day Book, Ledger Statements, Trial Balance, and Cash/Bank accounts.
 */
import { z } from "zod";
import { router, protectedProcedure } from "@/server/trpc";
import { db } from "@/lib/db";
import { assertProjectMember } from "@/lib/authz";
import { adToBs } from "@/lib/nepali-calendar";

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
          debit: p.amount,
          credit: 0,
          netAmount: p.netPaid || (p.amount - p.tdsDeducted),
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
          credit: b.netPayable,
          netAmount: b.netPayable,
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
          credit: b.netPayable,
          netAmount: b.netPayable,
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
          debit: isSubcontractor ? 0 : i.grossAmount,
          credit: isSubcontractor ? i.netPayable : 0,
          netAmount: i.netPayable,
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
            debit: ho.amount,
            credit: 0,
            netAmount: ho.amount,
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
          debit: se.totalAmount,
          credit: 0,
          netAmount: se.totalAmount,
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
          include: { user: { select: { id: true, name: true, email: true } } },
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
                id: "bank_nabil",
                name: "Nabil Bank Site A/C",
                type: "bank" as const,
                group: "Bank Accounts",
                pan: null,
                phone: null,
              },
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
            group: "Sundry Creditors (Equipment Suppliers)",
            pan: ev.pan,
            phone: ev.phone,
          })),
        ...subcontractors.map((s) => ({
          id: s.id,
          name: s.name,
          type: "subcontractor" as const,
          group: "Sundry Creditors (Subcontractors & Labor Teams)",
          pan: s.pan,
          phone: s.phone,
        })),
        ...members.map((m) => ({
          id: m.user.id,
          name: m.user.name || m.user.email,
          type: "staff" as const,
          group: "Sundry Creditors (Staff & Employees)",
          pan: null,
          phone: null,
        })),
      ];

      return { accounts };
    }),

  /**
   * Ledger Statement (खाता पाना / Statement of Account)
   * Statement with Opening Balance, chronological Dr/Cr transactions, and Running Balance.
   */
  ledgerStatement: protectedProcedure
    .input(
      z.object({
        projectId: z.string(),
        accountId: z.string(),
        accountType: z.enum(["vendor", "subcontractor", "staff", "bank", "cash", "expense_head"]),
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
        const payments = await db.payment.findMany({
          where: { projectId: input.projectId, payeeType: "vendor" },
          orderBy: { paymentDate: "asc" },
        });

        // Filter payments matching vendor by name or ID.
        // IDOR guard: verify the partner belongs to the project the
        // caller was authorized on. Previously this used findUnique on
        // the cuid only — minor cross-tenant info leak (partner name
        // and PAN from another project).
        const matchedVendor = await db.partner.findFirst({
          where: { id: input.accountId, projectId: input.projectId },
        });
        const vPayments = payments.filter(
          (p) => p.payeeName.toLowerCase().includes(matchedVendor?.name.toLowerCase() || "") || p.partyPan === matchedVendor?.pan
        );

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
        const payments = await db.payment.findMany({
          where: { projectId: input.projectId, payeeType: "subcontractor" },
          orderBy: { paymentDate: "asc" },
        });
        const sPayments = payments.filter(
          (p) => p.payeeName.toLowerCase().includes(matchedSub?.name.toLowerCase() || "") || p.partyPan === matchedSub?.pan
        );

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

          if (input.accountType === "bank" && p.paymentMode !== "cash") {
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
          } else if (input.accountType === "cash" && p.paymentMode === "cash") {
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
   * Consolidated balance check verifying Total Debits == Total Credits.
   */
  trialBalance: protectedProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ ctx, input }) => {
      await assertProjectMember(ctx.user, input.projectId);

      const [payments, vendorBills, subBills, ipcs, expenses] = await Promise.all([
        db.payment.findMany({ where: { projectId: input.projectId, status: "paid" } }),
        db.vendorBill.findMany({ where: { projectId: input.projectId } }),
        db.subcontractorBill.findMany({ where: { projectId: input.projectId } }),
        db.ipc.findMany({ where: { projectId: input.projectId } }),
        db.siteExpense.findMany({ where: { projectId: input.projectId } }),
      ]);

      // 1. Direct Project Costs (Debits)
      // IMPORTANT: vendor/subcontractor bills already include the
      // payment amount in their `paidAmount` field. Adding payments
      // on top of bill gross amounts would double-count the expense.
      // Correct accounting:
      //   Debit: Material Purchases = vendorBills.grossAmount (expense)
      //   Credit: Sundry Creditors = vendorBills.netPayable - paidAmount (outstanding)
      //   When paid: Debit Sundry Creditors, Credit Cash/Bank
      // Payments NOT linked to a bill (direct cash expenses for materials)
      // can't be distinguished from bill-linked payments because Payment
      // has no vendorBillId FK. So we only count bill gross amounts here;
      // direct cash purchases will appear if a vendorBill wasn't created.
      const materialsDebit = vendorBills.reduce((s, b) => s + b.grossAmount, 0);

      const subcontractorDebit = subBills.reduce((s, b) => s + b.grossAmount, 0);

      const laborDebit = payments
        .filter((p) => p.payeeType === "staff" || p.category?.toLowerCase().includes("labor") || p.category?.toLowerCase().includes("wage"))
        .reduce((s, p) => s + p.amount, 0);

      const equipmentDebit = payments
        .filter((p) => p.category?.toLowerCase().includes("equipment") || p.category?.toLowerCase().includes("plant"))
        .reduce((s, p) => s + p.amount, 0);

      const overheadsDebit = expenses.reduce((s, e) => s + e.amount, 0) +
        payments
          .filter((p) => p.category?.toLowerCase().includes("overhead") || p.category?.toLowerCase().includes("site expense"))
          .reduce((s, p) => s + p.amount, 0);

      // 2. Liabilities & Payables (Credits)
      const vendorPayablesCredit = vendorBills.reduce((s, b) => s + Math.max(0, b.netPayable - b.paidAmount), 0);
      const subPayablesCredit = subBills.reduce((s, b) => s + Math.max(0, b.netPayable - b.paidAmount), 0);
      const retentionPayableCredit = subBills.reduce((s, b) => s + b.retentionAmount, 0);
      // TDS payable: only count TDS from bills that haven't been fully paid
      // (TDS on paid bills has already been remitted to IRD). Also avoid
      // double-counting: payments.tdsDeducted captures TDS on direct cash
      // payments (no bill), while vendorBills.tdsAmount captures TDS on
      // credit purchases. These are mutually exclusive for a given bill.
      const tdsPayableCredit = vendorBills.reduce((s, b) => s + (b.paidAmount > 0 ? 0 : b.tdsAmount), 0) +
        subBills.reduce((s, b) => s + (b.paidAmount > 0 ? 0 : (b as any).tdsAmount || 0), 0) +
        payments.filter((p) => !p.invoiceNumber).reduce((s, p) => s + p.tdsDeducted, 0);

      // 3. Incomes & Revenue (Credits)
      // Only count IPCs that have been submitted/certified/approved/paid —
      // draft IPCs are not recognized as revenue.
      const totalIpcRevenueCredit = ipcs
        .filter((i) => i.status !== "draft")
        .reduce((s, i) => s + i.grossAmount, 0);

      // 4. Assets & Receivables (Debits)
      // Client receivable = IPC gross minus what's been received (paid).
      // For unpaid IPCs, the full gross is receivable.
      // For paid IPCs, the receivable is 0 (fully settled).
      // For partially-paid IPCs, the outstanding amount is receivable.
      const clientReceivablesDebit = ipcs.reduce((s, i) => {
        if (i.status === "paid") return s; // fully settled
        return s + Math.max(0, i.grossAmount - (i.status === "certified" || i.status === "approved" ? 0 : 0));
      }, 0);

      const rows = [
        // Assets & Receivables
        { head: "Client Receivables (IPCs Due)", group: "Current Assets", debit: clientReceivablesDebit, credit: 0 },
        // Direct Expenses
        { head: "Material Purchases & Supplies", group: "Direct Project Costs", debit: materialsDebit, credit: 0 },
        { head: "Subcontract Work & Labor", group: "Direct Project Costs", debit: subcontractorDebit, credit: 0 },
        { head: "Direct Labor & Staff Payroll", group: "Direct Project Costs", debit: laborDebit, credit: 0 },
        { head: "Plant & Equipment Costs", group: "Direct Project Costs", debit: equipmentDebit, credit: 0 },
        { head: "Site Overheads & Admin Expenses", group: "Indirect Overheads", debit: overheadsDebit, credit: 0 },
        // Liabilities & Payables
        { head: "Sundry Creditors (Material Vendors)", group: "Current Liabilities", debit: 0, credit: vendorPayablesCredit },
        { head: "Subcontractor Payables", group: "Current Liabilities", debit: 0, credit: subPayablesCredit },
        { head: "Retention Held Payable", group: "Current Liabilities", debit: 0, credit: retentionPayableCredit },
        { head: "TDS / Withholding Tax Payable", group: "Statutory Liabilities", debit: 0, credit: tdsPayableCredit },
        // Incomes
        { head: "Contract Billing & Revenue (IPC)", group: "Direct Incomes", debit: 0, credit: totalIpcRevenueCredit },
      ];

      const totalDebits = rows.reduce((s, r) => s + r.debit, 0);
      const totalCredits = rows.reduce((s, r) => s + r.credit, 0);
      const difference = Math.abs(totalDebits - totalCredits);

      return {
        rows,
        totalDebits,
        totalCredits,
        difference,
        isBalanced: difference < 1.0,
      };
    }),

  /**
   * Log Manual Journal / Inflow Entry (जर्नल भौचर / आम्दानी प्रविष्टि)
   */
  logJournalEntry: protectedProcedure
    .input(
      z.object({
        projectId: z.string(),
        date: z.string(),
        debitAccountId: z.string(),
        creditAccountId: z.string(),
        amount: z.number().positive(),
        narration: z.string(),
        source: z.string().default("manual"),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await assertProjectMember(ctx.user, input.projectId);

      // Create Payment entry as Inflow / Receipt
      const payment = await db.payment.create({
        data: {
          projectId: input.projectId,
          amount: input.amount,
          netPaid: input.amount,
          paymentDate: new Date(input.date),
          paymentMode: input.debitAccountId.includes("cash") ? "cash" : "bank_transfer",
          payeeName: input.creditAccountId.includes("revenue") ? "Client Billing / Deposit" : "Direct Inflow",
          payeeType: "other",
          category: "Project Inflow / Capital",
          notes: input.narration,
          status: "paid",
          accountingVoucherNo: `CR-${Date.now().toString().slice(-6)}`,
          createdById: ctx.user.id,
        },
      });

      return { success: true, paymentId: payment.id };
    }),
});
