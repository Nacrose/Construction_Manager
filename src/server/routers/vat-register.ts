/**
 * tRPC router for Nepal Statutory VAT Registers:
 * - Schedule 8 (खरिद खाता - Purchase Register)
 * - Schedule 9 (बिक्री खाता - Sales Register)
 * - Schedule 10 (मूल्य अभिवृद्धि कर विवरण - VAT Return & Reconciliation)
 * - Standalone VAT Bill Entry & Scanned Copy Management
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "@/server/trpc";
import { db } from "@/lib/db";
import { assertProjectMember, assertCanWrite } from "@/lib/authz";
import { audit } from "@/lib/audit";
import { format } from "date-fns";

const DirectVatBillSchema = z.object({
  projectId: z.string(),
  billType: z.enum(["purchase", "sales", "expense", "capital_goods", "import"]).default("purchase"),
  billNumber: z.string().min(1),
  billDate: z.string().optional(),
  billMiti: z.string().optional().nullable(),
  partyName: z.string().min(1),
  partyPan: z.string().optional().nullable(),
  partyAddress: z.string().optional().nullable(),
  taxableAmount: z.number().nonnegative().default(0),
  exemptAmount: z.number().nonnegative().default(0),
  vatPercent: z.number().min(0).max(100).default(13),
  tdsPercent: z.number().min(0).max(100).default(0),
  category: z.string().optional().nullable(),
  description: z.string().optional().nullable(),
  scannedBillUrl: z.string().optional().nullable(),
  scannedBillName: z.string().optional().nullable(),
});

export const vatRegisterRouter = router({
  /** Schedule 8: Purchase Register (खरिद खाता) */
  getPurchaseRegister: protectedProcedure
    .input(
      z.object({
        projectId: z.string(),
        fromDate: z.string().optional(),
        toDate: z.string().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      await assertProjectMember(ctx.user, input.projectId);

      const dateFilter: any = {};
      if (input.fromDate) dateFilter.gte = new Date(input.fromDate);
      if (input.toDate) dateFilter.lte = new Date(input.toDate);

      const hasDateFilter = input.fromDate || input.toDate;

      // 1. Material Inwards (GRNs)
      const materialTxns = await db.materialTransaction.findMany({
        where: {
          projectId: input.projectId,
          type: "receive",
          ...(hasDateFilter ? { date: dateFilter } : {}),
        },
        include: {
          material: { select: { name: true, code: true, unit: true } },
        },
        orderBy: { date: "desc" },
      });

      // 2. Subcontractor Bills
      const subBills = await db.subcontractorBill.findMany({
        where: {
          projectId: input.projectId,
          status: { in: ["approved", "paid", "submitted"] },
          ...(hasDateFilter ? { billDate: dateFilter } : {}),
        },
        include: {
          subcontractor: { select: { name: true, pan: true } },
        },
        orderBy: { billDate: "desc" },
      });

      // 3. Equipment Spot Hires
      const spotHires = await db.equipmentSpotHire.findMany({
        where: {
          projectId: input.projectId,
          ...(hasDateFilter ? { date: dateFilter } : {}),
        },
        include: {
          partner: { select: { name: true, pan: true } },
          vendor: { select: { name: true, pan: true } },
        },
        orderBy: { date: "desc" },
      });

      // 4. Standalone Direct VAT Bills
      const directBills = await db.vatBill.findMany({
        where: {
          projectId: input.projectId,
          billType: { in: ["purchase", "expense", "capital_goods", "import"] },
          ...(hasDateFilter ? { billDate: dateFilter } : {}),
        },
        orderBy: { billDate: "desc" },
      });

      // Unified Purchase Rows
      const rows: Array<{
        id: string;
        source: "material_grn" | "subcontractor_bill" | "equipment_spot" | "direct_bill";
        sourceRefId: string;
        date: Date;
        invoiceNo: string;
        partyName: string;
        partyPan: string;
        taxableLocal: number;
        exemptAmount: number;
        capitalGoods: number;
        importAmount: number;
        vatAmount: number;
        totalAmount: number;
        tdsAmount: number;
        netPayable: number;
        description: string;
        isBillAttached: boolean;
        scannedBillUrl: string | null;
      }> = [];

      for (const m of materialTxns) {
        const baseAmt = m.quantity * m.rate;
        // Use ?? instead of || so that 0 (legitimately VAT-exempt) is respected.
        const vatAmt = m.vatAmount ?? (baseAmt * (m.vatPercent || 13)) / 100;
        const isExempt = m.vatPercent === 0 || m.vatAmount === 0;

        rows.push({
          id: `mat-${m.id}`,
          source: "material_grn",
          sourceRefId: m.id,
          date: m.date,
          invoiceNo: m.supplierInvoiceNo || m.reference || `GRN-${m.id.slice(-4)}`,
          partyName: m.supplierPan ? `Material Supplier (PAN: ${m.supplierPan})` : "Local Material Supplier",
          partyPan: m.supplierPan || "—",
          taxableLocal: isExempt ? 0 : baseAmt,
          exemptAmount: isExempt ? baseAmt : 0,
          capitalGoods: 0,
          importAmount: 0,
          vatAmount: isExempt ? 0 : vatAmt,
          totalAmount: isExempt ? baseAmt : baseAmt + vatAmt,
          tdsAmount: m.tdsAmount || 0,
          netPayable: m.netPayable || (baseAmt + vatAmt - (m.tdsAmount || 0)),
          description: `${m.material.name} (${m.quantity} ${m.unit})`,
          isBillAttached: Boolean(m.scannedBillUrl || m.isBillAttached),
          scannedBillUrl: m.scannedBillUrl || null,
        });
      }

      for (const s of subBills) {
        const taxable = s.grossAmount;
        const vatAmt = s.vatAmount || (taxable * 0.13);
        rows.push({
          id: `sub-${s.id}`,
          source: "subcontractor_bill",
          sourceRefId: s.id,
          date: s.billDate,
          invoiceNo: s.number,
          partyName: s.subcontractor?.name || "Subcontractor",
          partyPan: s.subcontractor?.pan || "—",
          taxableLocal: taxable,
          exemptAmount: 0,
          capitalGoods: 0,
          importAmount: 0,
          vatAmount: vatAmt,
          totalAmount: taxable + vatAmt,
          tdsAmount: s.tdsAmount || 0,
          netPayable: s.netPayable,
          description: `Subcontractor Bill: ${s.number}`,
          isBillAttached: Boolean(s.scannedBillUrl),
          scannedBillUrl: s.scannedBillUrl || null,
        });
      }

      for (const sp of spotHires) {
        const base = sp.totalGross;
        const pan = sp.partner?.pan || sp.vendor?.pan || null;
        const hasPan = Boolean(pan);
        const vatAmt = hasPan ? base * 0.13 : 0;
        rows.push({
          id: `spot-${sp.id}`,
          source: "equipment_spot",
          sourceRefId: sp.id,
          date: sp.date,
          invoiceNo: sp.slipNumber || `SPOT-${sp.id.slice(-4)}`,
          partyName: sp.vendorName,
          partyPan: pan || "—",
          taxableLocal: hasPan ? base : 0,
          exemptAmount: hasPan ? 0 : base,
          capitalGoods: 0,
          importAmount: 0,
          vatAmount: vatAmt,
          totalAmount: base + vatAmt,
          tdsAmount: 0,
          netPayable: sp.netPayable,
          description: `${sp.machineName} (${sp.hireType === "trip" ? `${sp.tripCount} trips` : `${sp.hoursWorked} hrs`})`,
          isBillAttached: false,
          scannedBillUrl: null,
        });
      }

      for (const d of directBills) {
        rows.push({
          id: `dir-${d.id}`,
          source: "direct_bill",
          sourceRefId: d.id,
          date: d.billDate,
          invoiceNo: d.billNumber,
          partyName: d.partyName,
          partyPan: d.partyPan || "—",
          taxableLocal: d.billType === "capital_goods" || d.billType === "import" ? 0 : d.taxableAmount,
          exemptAmount: d.exemptAmount,
          capitalGoods: d.billType === "capital_goods" ? d.taxableAmount : 0,
          importAmount: d.billType === "import" ? d.taxableAmount : 0,
          vatAmount: d.vatAmount,
          totalAmount: d.totalAmount,
          tdsAmount: d.tdsAmount,
          netPayable: d.netPayable,
          description: d.description || d.category || "Direct Expense",
          isBillAttached: Boolean(d.scannedBillUrl || d.isBillAttached),
          scannedBillUrl: d.scannedBillUrl || null,
        });
      }

      rows.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

      const totals = {
        totalTaxableLocal: rows.reduce((s, r) => s + r.taxableLocal, 0),
        totalExempt: rows.reduce((s, r) => s + r.exemptAmount, 0),
        totalCapitalGoods: rows.reduce((s, r) => s + r.capitalGoods, 0),
        totalImport: rows.reduce((s, r) => s + r.importAmount, 0),
        totalInputVat: rows.reduce((s, r) => s + r.vatAmount, 0),
        totalVatAmount: rows.reduce((s, r) => s + r.vatAmount, 0),
        totalGrossPurchases: rows.reduce((s, r) => s + r.totalAmount, 0),
        totalGross: rows.reduce((s, r) => s + r.totalAmount, 0),
        totalTdsDeducted: rows.reduce((s, r) => s + r.tdsAmount, 0),
        totalTds: rows.reduce((s, r) => s + r.tdsAmount, 0),
        totalNetPayable: rows.reduce((s, r) => s + r.netPayable, 0),
        missingScansCount: rows.filter((r) => !r.isBillAttached).length,
      };

      return { rows, totals };
    }),

  /** Schedule 9: Sales Register (बिक्री खाता) */
  getSalesRegister: protectedProcedure
    .input(
      z.object({
        projectId: z.string(),
        fromDate: z.string().optional(),
        toDate: z.string().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      await assertProjectMember(ctx.user, input.projectId);

      const project = await db.project.findUnique({
        where: { id: input.projectId },
        select: { name: true, client: true, location: true },
      });

      const dateFilter: any = {};
      if (input.fromDate) dateFilter.gte = new Date(input.fromDate);
      if (input.toDate) dateFilter.lte = new Date(input.toDate);

      const hasDateFilter = input.fromDate || input.toDate;

      // 1. Client IPCs (Statutory certified/approved/paid only)
      const ipcs = await db.ipc.findMany({
        where: {
          projectId: input.projectId,
          status: { in: ["certified", "approved", "paid"] },
          subcontractorId: null, // Client IPCs only
          ...(hasDateFilter ? { issueDate: dateFilter } : {}),
        },
        orderBy: { issueDate: "desc" },
      });

      // 2. Direct Sales Invoices
      const directSales = await db.vatBill.findMany({
        where: {
          projectId: input.projectId,
          billType: "sales",
          ...(hasDateFilter ? { billDate: dateFilter } : {}),
        },
        orderBy: { billDate: "desc" },
      });

      const rows: Array<{
        id: string;
        source: "client_ipc" | "direct_sales";
        sourceRefId: string;
        date: Date;
        invoiceNo: string;
        clientName: string;
        clientPan: string;
        taxableSales: number;
        exemptSales: number;
        zeroRatedSales: number;
        vatAmount: number;
        totalAmount: number;
        tdsAmount: number;
        netReceived: number;
        description: string;
        isBillAttached: boolean;
        scannedBillUrl: string | null;
      }> = [];

      for (const i of ipcs) {
        const taxable = i.grossAmount;
        const vatAmt = i.vatAmount || (taxable * 0.13);
        const tdsAmt = i.tdsAmount || (taxable * 0.015);
        const total = i.totalWithVat || (taxable + vatAmt);

        rows.push({
          id: `ipc-${i.id}`,
          source: "client_ipc",
          sourceRefId: i.id,
          date: i.issueDate || i.createdAt,
          invoiceNo: i.taxInvoiceNo || `IPC-${i.number}`,
          clientName: i.clientName || project?.client || "Employer / Client",
          clientPan: i.clientPan || "—",
          taxableSales: taxable,
          exemptSales: 0,
          zeroRatedSales: 0,
          vatAmount: vatAmt,
          totalAmount: total,
          tdsAmount: tdsAmt,
          netReceived: i.finalPayable || (total - tdsAmt - i.retentionAmount - i.advanceRecovery),
          description: `Interim Payment Certificate: IPC-${i.number}`,
          isBillAttached: Boolean(i.scannedBillUrl || i.isBillAttached),
          scannedBillUrl: i.scannedBillUrl || null,
        });
      }

      for (const s of directSales) {
        rows.push({
          id: `sale-${s.id}`,
          source: "direct_sales",
          sourceRefId: s.id,
          date: s.billDate,
          invoiceNo: s.billNumber,
          clientName: s.partyName,
          clientPan: s.partyPan || "—",
          taxableSales: s.taxableAmount,
          exemptSales: s.exemptAmount,
          zeroRatedSales: 0,
          vatAmount: s.vatAmount,
          totalAmount: s.totalAmount,
          tdsAmount: s.tdsAmount,
          netReceived: s.netPayable,
          description: s.description || "Direct Sales / Scrap / Miscellaneous",
          isBillAttached: Boolean(s.scannedBillUrl || s.isBillAttached),
          scannedBillUrl: s.scannedBillUrl || null,
        });
      }

      rows.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

      const totals = {
        totalTaxableSales: rows.reduce((s, r) => s + r.taxableSales, 0),
        totalExemptSales: rows.reduce((s, r) => s + r.exemptSales, 0),
        totalZeroRated: rows.reduce((s, r) => s + r.zeroRatedSales, 0),
        totalOutputVat: rows.reduce((s, r) => s + r.vatAmount, 0),
        totalGrossSales: rows.reduce((s, r) => s + r.totalAmount, 0),
        totalTdsWithheld: rows.reduce((s, r) => s + r.tdsAmount, 0),
        totalNetReceived: rows.reduce((s, r) => s + r.netReceived, 0),
        missingScansCount: rows.filter((r) => !r.isBillAttached).length,
      };

      return { rows, totals };
    }),

  /** Schedule 10: VAT Return & Reconciliation (मूल्य अभिवृद्धि कर विवरण) */
  getVatReturnSchedule10: protectedProcedure
    .input(
      z.object({
        projectId: z.string(),
        fromDate: z.string().optional(),
        toDate: z.string().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      await assertProjectMember(ctx.user, input.projectId);

      const dateFilter: any = {};
      if (input.fromDate) dateFilter.gte = new Date(input.fromDate);
      if (input.toDate) dateFilter.lte = new Date(input.toDate);
      const hasDateFilter = input.fromDate || input.toDate;

      // 1. Fetch Material Purchases (GRNs)
      const materialTxns = await db.materialTransaction.findMany({
        where: {
          projectId: input.projectId,
          type: "receive",
          ...(hasDateFilter ? { date: dateFilter } : {}),
        },
        select: {
          quantity: true,
          rate: true,
          vatAmount: true,
          vatPercent: true,
        },
      });

      let matTaxable = 0;
      let matExempt = 0;
      let matVat = 0;

      for (const m of materialTxns) {
        const base = m.quantity * m.rate;
        const isExempt = m.vatPercent === 0 || m.vatAmount === 0;
        if (isExempt) {
          matExempt += base;
        } else {
          matTaxable += base;
          matVat += m.vatAmount ?? (base * (m.vatPercent || 13)) / 100;
        }
      }

      // 2. Fetch Subcontractor Bills
      const subRes = await db.subcontractorBill.aggregate({
        where: {
          projectId: input.projectId,
          status: { in: ["approved", "paid", "certified"] },
          ...(hasDateFilter ? { billDate: dateFilter } : {}),
        },
        _sum: { vatAmount: true, grossAmount: true },
      });

      // 3. Fetch Spot Equipment Hires (with PAN check)
      const spotHires = await db.equipmentSpotHire.findMany({
        where: {
          projectId: input.projectId,
          ...(hasDateFilter ? { date: dateFilter } : {}),
        },
        include: {
          partner: { select: { pan: true } },
          vendor: { select: { pan: true } },
        },
      });

      let spotTaxable = 0;
      let spotExempt = 0;
      let spotVat = 0;

      for (const sp of spotHires) {
        const base = sp.totalGross;
        const hasPan = Boolean(sp.partner?.pan || sp.vendor?.pan);
        if (hasPan) {
          spotTaxable += base;
          spotVat += base * 0.13;
        } else {
          spotExempt += base;
        }
      }

      // 4. Fetch Direct Bills
      const dirP = await db.vatBill.aggregate({
        where: {
          projectId: input.projectId,
          billType: { in: ["purchase", "expense", "capital_goods", "import"] },
          ...(hasDateFilter ? { billDate: dateFilter } : {}),
        },
        _sum: { vatAmount: true, taxableAmount: true, exemptAmount: true },
      });

      // 5. Fetch Sales (Client IPCs + Direct Sales)
      // Note: only statutory certified/approved/paid IPCs count
      const ipcRes = await db.ipc.aggregate({
        where: {
          projectId: input.projectId,
          subcontractorId: null,
          status: { in: ["certified", "approved", "paid"] },
          ...(hasDateFilter ? { issueDate: dateFilter } : {}),
        },
        _sum: { vatAmount: true, grossAmount: true },
      });

      const dirS = await db.vatBill.aggregate({
        where: {
          projectId: input.projectId,
          billType: "sales",
          ...(hasDateFilter ? { billDate: dateFilter } : {}),
        },
        _sum: { vatAmount: true, taxableAmount: true, exemptAmount: true },
      });

      const outputVat = (ipcRes._sum.vatAmount || 0) + (dirS._sum.vatAmount || 0);
      const totalTaxableSales = (ipcRes._sum.grossAmount || 0) + (dirS._sum.taxableAmount || 0);
      const totalExemptSales = dirS._sum.exemptAmount || 0;

      const inputVat = matVat + (subRes._sum.vatAmount || 0) + spotVat + (dirP._sum.vatAmount || 0);
      const totalTaxablePurchases = matTaxable + (subRes._sum.grossAmount || 0) + spotTaxable + (dirP._sum.taxableAmount || 0);
      const totalExemptPurchases = matExempt + spotExempt + (dirP._sum.exemptAmount || 0);

      const netVatPayable = outputVat - inputVat;

      return {
        sales: {
          taxable: totalTaxableSales,
          exempt: totalExemptSales,
          outputVat,
        },
        purchases: {
          taxable: totalTaxablePurchases,
          exempt: totalExemptPurchases,
          inputVat,
        },
        reconciliation: {
          outputVat,
          inputVat,
          netVatPayable: netVatPayable > 0 ? netVatPayable : 0,
          netVatCredit: netVatPayable < 0 ? Math.abs(netVatPayable) : 0,
        },
      };
    }),

  /** Create a Direct Standalone VAT Bill Entry */
  createDirectVatBill: protectedProcedure
    .input(DirectVatBillSchema)
    .mutation(async ({ ctx, input }) => {
      await assertCanWrite(ctx.user, input.projectId);

      const billDate = input.billDate ? new Date(input.billDate) : new Date();
      const vatAmount = (input.taxableAmount * (input.vatPercent || 13)) / 100;
      const totalAmount = input.taxableAmount + input.exemptAmount + vatAmount;
      const tdsAmount = (input.taxableAmount * (input.tdsPercent || 0)) / 100;
      const netPayable = Math.max(0, totalAmount - tdsAmount);

      const bill = await db.vatBill.create({
        data: {
          projectId: input.projectId,
          billType: input.billType,
          billNumber: input.billNumber.trim(),
          billDate,
          billMiti: input.billMiti || null,
          partyName: input.partyName.trim(),
          partyPan: input.partyPan?.trim() || null,
          partyAddress: input.partyAddress?.trim() || null,
          taxableAmount: input.taxableAmount,
          exemptAmount: input.exemptAmount,
          vatPercent: input.vatPercent,
          vatAmount,
          totalAmount,
          tdsPercent: input.tdsPercent,
          tdsAmount,
          netPayable,
          category: input.category || null,
          description: input.description || null,
          scannedBillUrl: input.scannedBillUrl || null,
          scannedBillName: input.scannedBillName || null,
          isBillAttached: Boolean(input.scannedBillUrl),
          createdById: ctx.user.id,
        },
      });

      await audit({
        userId: ctx.user.id,
        projectId: input.projectId,
        action: "vat_bill.create",
        entityType: "vat_bill",
        entityId: bill.id,
        metadata: {
          billNumber: bill.billNumber,
          billType: bill.billType,
          totalAmount: bill.totalAmount,
          partyName: bill.partyName,
        },
      });

      return { bill };
    }),

  /** Attach Scanned Copy to any transaction or bill */
  attachScannedBill: protectedProcedure
    .input(
      z.object({
        projectId: z.string(),
        targetType: z.enum(["material_grn", "client_ipc", "subcontractor_bill", "direct_bill", "direct_sales", "equipment_spot"]),
        targetId: z.string(),
        scannedBillUrl: z.string().min(1),
        scannedBillName: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await assertCanWrite(ctx.user, input.projectId);

      // IDOR guard: every target record must be verified to belong to
      // input.projectId before mutating. Previously this used
      // update({where:{id: input.targetId}}) directly — a caller
      // authorized on project A could mutate scannedBillUrl on records
      // in project B by their cuid.
      if (input.targetType === "material_grn") {
        const txn = await db.materialTransaction.findFirst({
          where: { id: input.targetId, projectId: input.projectId },
          select: { id: true },
        });
        if (!txn) throw new TRPCError({ code: "NOT_FOUND", message: "Material transaction not found in this project." });
        await db.materialTransaction.update({
          where: { id: input.targetId },
          data: {
            scannedBillUrl: input.scannedBillUrl,
            scannedBillName: input.scannedBillName || "invoice-scan",
            isBillAttached: true,
          },
        });
      } else if (input.targetType === "client_ipc") {
        const ipc = await db.ipc.findFirst({
          where: { id: input.targetId, projectId: input.projectId },
          select: { id: true },
        });
        if (!ipc) throw new TRPCError({ code: "NOT_FOUND", message: "IPC not found in this project." });
        await db.ipc.update({
          where: { id: input.targetId },
          data: {
            scannedBillUrl: input.scannedBillUrl,
            scannedBillName: input.scannedBillName || "ipc-certificate-scan",
            isBillAttached: true,
          },
        });
      } else if (input.targetType === "subcontractor_bill") {
        const sb = await db.subcontractorBill.findFirst({
          where: { id: input.targetId, projectId: input.projectId },
          select: { id: true },
        });
        if (!sb) throw new TRPCError({ code: "NOT_FOUND", message: "Subcontractor bill not found in this project." });
        await db.subcontractorBill.update({
          where: { id: input.targetId },
          data: {
            scannedBillUrl: input.scannedBillUrl,
          },
        });
      } else if (input.targetType === "direct_bill" || input.targetType === "direct_sales") {
        const vb = await db.vatBill.findFirst({
          where: { id: input.targetId, projectId: input.projectId },
          select: { id: true },
        });
        if (!vb) throw new TRPCError({ code: "NOT_FOUND", message: "VAT bill not found in this project." });
        await db.vatBill.update({
          where: { id: input.targetId },
          data: {
            scannedBillUrl: input.scannedBillUrl,
            scannedBillName: input.scannedBillName || "bill-scan",
            isBillAttached: true,
          },
        });
      } else if (input.targetType === "equipment_spot") {
        const sh = await db.equipmentSpotHire.findFirst({
          where: { id: input.targetId, projectId: input.projectId },
          select: { id: true },
        });
        if (!sh) throw new TRPCError({ code: "NOT_FOUND", message: "Spot hire ticket not found in this project." });
        await db.equipmentSpotHire.update({
          where: { id: input.targetId },
          data: {
            remarks: `[Scanned Attached: ${input.scannedBillName || "spot-slip"}]`,
          },
        });
      }

      return { success: true };
    }),
});
