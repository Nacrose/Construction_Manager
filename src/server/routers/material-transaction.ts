import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure } from "@/server/trpc";
import { db } from "@/lib/db";
import { assertProjectMember, assertCanWrite } from "@/lib/authz";

export const TxnSchema = z.object({
  projectId: z.string(),
  materialId: z.string().min(1),
  type: z.enum(["receive", "issue", "transfer", "adjustment"]),
  quantity: z.number().positive(),
  rate: z.number().nonnegative().default(0),
  reference: z.string().optional().nullable(),
  remarks: z.string().optional().nullable(),
  gateEntryId: z.string().optional().nullable(),
  purchaseOrderId: z.string().optional().nullable(),
  catalogMaterialId: z.string().optional().nullable(),
  materialCatalogId: z.string().optional().nullable(),
  storeLocationId: z.string().optional().nullable(),
  targetStoreLocationId: z.string().optional().nullable(),
  weighbridgeGross: z.number().optional().nullable(),
  weighbridgeTare: z.number().optional().nullable(),
  densityFactor: z.number().optional().nullable(),
  isDebitable: z.boolean().default(false),
  subcontractorId: z.string().optional().nullable(),
  recoveryRate: z.number().nonnegative().optional().nullable(),
  paymentType: z.enum(["payable", "unpayable", "temporary"]).default("payable"),
  vatPercent: z.number().min(0).max(100).optional().default(0),
  tdsPercent: z.number().min(0).max(100).optional().default(0),
  supplierInvoiceNo: z.string().optional().nullable(),
  supplierPan: z.string().optional().nullable(),
  override: z.boolean().default(false).optional(),
});

export const GateEntrySchema = z.object({
  projectId: z.string(),
  number: z.string().min(1).max(50).optional(),
  vehicleNo: z.string().min(1).max(50),
  driverName: z.string().optional().nullable(),
  challanNo: z.string().optional().nullable(),
  description: z.string().optional().nullable(),
  estQty: z.number().optional().nullable(),
  grossWeight: z.number().optional().nullable(),
  tareWeight: z.number().optional().nullable(),
  netWeight: z.number().optional().nullable(),
  unit: z.string().optional().nullable(),
  fileUrl: z.string().optional().nullable(),
});

export const materialTransactionProcedures = {
  listTransactions: protectedProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ ctx, input }) => {
      await assertProjectMember(ctx.user, input.projectId);
      const transactions = await db.materialTransaction.findMany({
        where: { projectId: input.projectId },
        include: {
          material: { select: { name: true, code: true, unit: true } },
          createdBy: { select: { name: true } },
          gateEntry: true,
          storeLocation: { select: { id: true, name: true, code: true } },
          targetStoreLocation: { select: { id: true, name: true, code: true } },
          purchaseOrder: {
            include: {
              requisition: { select: { id: true, number: true } },
              supplier: { select: { name: true } },
              partner: { select: { name: true } },
            },
          },
          catalogMaterial: { select: { id: true, name: true, category: true } },
        },
        orderBy: { date: "desc" },
      });
      return { transactions };
    }),

  createTransaction: protectedProcedure
    .input(TxnSchema)
    .mutation(async ({ ctx, input }) => {
      await assertCanWrite(ctx.user, input.projectId);
      const material = await db.material.findFirst({
        where: { id: input.materialId, projectId: input.projectId },
      });
      if (!material) throw new TRPCError({ code: "NOT_FOUND", message: "Material not found in this project." });

      const delta = input.type === "receive" || input.type === "adjustment" ? input.quantity : -input.quantity;
      const newStock = material.currentStock + delta;
      if (newStock < 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Insufficient stock level for this transaction." });
      }

      let warningMessage: string | null = null;

      if (input.type === "issue" || input.type === "transfer") {
        const boqItems = await db.boqItem.findMany({
          where: { projectId: input.projectId },
          include: { ingredients: true },
        });
        let projectPlannedQty = 0;
        for (const item of boqItems) {
          const ing = item.ingredients.find(
            (ig) => ig.type === "material" && ig.name.toLowerCase() === material.name.toLowerCase()
          );
          if (ing) {
            projectPlannedQty += item.quantity * ing.quantity;
          }
        }

        const totalIssuedAgg = await db.materialTransaction.aggregate({
          where: { projectId: input.projectId, materialId: input.materialId, type: { in: ["issue", "transfer"] } },
          _sum: { quantity: true },
        });
        const totalIssued = totalIssuedAgg._sum.quantity || 0;

        if (projectPlannedQty > 0 && totalIssued + input.quantity > projectPlannedQty * 1.05) {
          if (!input.override) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: `OVER_ISSUE: This issue of ${input.quantity} ${material.unit} will push total issued quantities (${(totalIssued + input.quantity).toFixed(1)}) past the total project design limit (${projectPlannedQty.toFixed(1)}) by more than 5%. Check override to bypass.`,
            });
          } else {
            warningMessage = `OVER_ISSUE_BYPASSED: Total issued quantity exceeds project design limit (${projectPlannedQty.toFixed(1)} ${material.unit}) with override approval.`;
          }
        }

        if (input.subcontractorId && material.name.toLowerCase().includes("wire")) {
          const subTxns = await db.materialTransaction.findMany({
            where: {
              projectId: input.projectId,
              subcontractorId: input.subcontractorId,
              type: { in: ["issue", "transfer"] },
            },
            include: { material: { select: { name: true } } },
          });

          const totalWire =
            subTxns
              .filter((t) => t.materialId === input.materialId)
              .reduce((sum, curr) => sum + curr.quantity, 0) + input.quantity;

          const totalGabions = subTxns
            .filter((t) => t.material.name.toLowerCase().includes("gabion"))
            .reduce((sum, curr) => sum + curr.quantity, 0);

          if (totalGabions > 0) {
            const ratio = totalWire / totalGabions;
            if (ratio < 0.4 || ratio > 0.8) {
              const ratioWarn = `RATIO_ANOMALY: GI Wire ratio is ${ratio.toFixed(2)} kg/box. Standard engineering norm is 0.5 to 0.7 kg/box for binding gabions.`;
              warningMessage = warningMessage ? `${warningMessage} | ${ratioWarn}` : ratioWarn;
            }
          }
        }
      }

      const finalCatalogId = input.catalogMaterialId || input.materialCatalogId || null;

      const result = await db.$transaction(async (tx) => {
        const baseAmount = input.quantity * input.rate;
        const isReceive = input.type === "receive";
        const vatPercent = isReceive ? input.vatPercent ?? 0 : 0;
        const tdsPercent = isReceive ? input.tdsPercent ?? 0 : 0;
        const vatAmount = (baseAmount * vatPercent) / 100;
        const tdsAmount = (baseAmount * tdsPercent) / 100;
        const totalWithVat = baseAmount + vatAmount;
        const netPayable = totalWithVat - tdsAmount;

        const txn = await tx.materialTransaction.create({
          data: {
            materialId: input.materialId,
            projectId: input.projectId,
            type: input.type,
            quantity: input.quantity,
            unit: material.unit,
            rate: input.rate,
            reference: input.reference || null,
            remarks: input.remarks || null,
            createdById: ctx.user.id,
            gateEntryId: input.gateEntryId || null,
            purchaseOrderId: input.purchaseOrderId || null,
            catalogMaterialId: finalCatalogId,
            isDebitable: input.isDebitable,
            subcontractorId: input.subcontractorId || null,
            recoveryRate: input.recoveryRate || null,
            paymentType: input.paymentType,
            vatPercent,
            vatAmount,
            tdsPercent,
            tdsAmount,
            totalWithVat,
            netPayable,
            supplierInvoiceNo: isReceive ? input.supplierInvoiceNo || null : null,
            supplierPan: isReceive ? input.supplierPan || null : null,
            storeLocationId: input.storeLocationId || null,
            targetStoreLocationId: input.targetStoreLocationId || null,
            weighbridgeGross: input.weighbridgeGross || null,
            weighbridgeTare: input.weighbridgeTare || null,
            densityFactor: input.densityFactor || null,
          },
        });

        // If a source store is specified, update stock at that location
        if (input.storeLocationId) {
          const storeDelta =
            input.type === "receive" || input.type === "adjustment" ? input.quantity : -input.quantity;
          await tx.materialStoreStock.upsert({
            where: {
              materialId_storeLocationId: {
                materialId: input.materialId,
                storeLocationId: input.storeLocationId,
              },
            },
            update: {
              currentStock: { increment: storeDelta },
            },
            create: {
              materialId: input.materialId,
              storeLocationId: input.storeLocationId,
              currentStock: storeDelta,
            },
          });
        }

        // If inter-store transfer, increment destination store stock
        if (input.type === "transfer" && input.targetStoreLocationId) {
          await tx.materialStoreStock.upsert({
            where: {
              materialId_storeLocationId: {
                materialId: input.materialId,
                storeLocationId: input.targetStoreLocationId,
              },
            },
            update: {
              currentStock: { increment: input.quantity },
            },
            create: {
              materialId: input.materialId,
              storeLocationId: input.targetStoreLocationId,
              currentStock: input.quantity,
            },
          });
        }

        await tx.material.update({
          where: { id: input.materialId },
          data: { currentStock: newStock },
        });

        if (input.gateEntryId) {
          await tx.gateEntry.update({
            where: { id: input.gateEntryId },
            data: { status: "received" },
          });
        }

        if (input.purchaseOrderId) {
          const poItem = await tx.purchaseOrderItem.findFirst({
            where: { purchaseOrderId: input.purchaseOrderId, materialId: input.materialId },
          });

          if (poItem) {
            const newReceivedQty = poItem.receivedQty + input.quantity;
            await tx.purchaseOrderItem.update({
              where: { id: poItem.id },
              data: { receivedQty: newReceivedQty },
            });

            const allItems = await tx.purchaseOrderItem.findMany({
              where: { purchaseOrderId: input.purchaseOrderId },
            });

            const allFullyReceived = allItems.every((item) => {
              const currentQty = item.materialId === input.materialId ? newReceivedQty : item.receivedQty;
              return currentQty >= item.quantity;
            });

            await tx.purchaseOrder.update({
              where: { id: input.purchaseOrderId },
              data: { status: allFullyReceived ? "received" : "partially_received" },
            });
          }
        }

        return txn;
      });

      return { transaction: result, warning: warningMessage };
    }),

  listGateEntries: protectedProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ ctx, input }) => {
      await assertProjectMember(ctx.user, input.projectId);
      const gateEntries = await db.gateEntry.findMany({
        where: { projectId: input.projectId },
        orderBy: { createdAt: "desc" },
      });
      return { gateEntries };
    }),

  createGateEntry: protectedProcedure
    .input(GateEntrySchema)
    .mutation(async ({ ctx, input }) => {
      await assertCanWrite(ctx.user, input.projectId);

      let gpNumber = input.number;
      if (!gpNumber) {
        const count = await db.gateEntry.count({
          where: { projectId: input.projectId },
        });
        gpNumber = `GP-${(count + 1).toString().padStart(4, "0")}`;
      }

      const duplicate = await db.gateEntry.findFirst({
        where: { projectId: input.projectId, number: gpNumber },
      });
      if (duplicate) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Gate Pass number ${gpNumber} already exists in this project.`,
        });
      }

      const gateEntry = await db.gateEntry.create({
        data: {
          projectId: input.projectId,
          number: gpNumber,
          vehicleNo: input.vehicleNo,
          driverName: input.driverName || null,
          challanNo: input.challanNo || null,
          description: input.description || null,
          estQty: input.estQty || null,
          grossWeight: input.grossWeight || null,
          tareWeight: input.tareWeight || null,
          netWeight: input.netWeight || null,
          unit: input.unit || null,
          fileUrl: input.fileUrl || null,
          status: "pending",
        },
      });

      return { gateEntry };
    }),

  updateTransaction: protectedProcedure
    .input(
      z.object({
        projectId: z.string(),
        transactionId: z.string(),
        isDebitable: z.boolean().optional(),
        subcontractorId: z.string().nullable().optional(),
        recoveryRate: z.number().nullable().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await assertCanWrite(ctx.user, input.projectId);
      const { transactionId, projectId, ...data } = input;

      const txn = await db.materialTransaction.findFirst({
        where: { id: transactionId, projectId },
      });
      if (!txn) throw new TRPCError({ code: "NOT_FOUND", message: "Transaction not found." });

      const updated = await db.materialTransaction.update({
        where: { id: transactionId },
        data: {
          ...(data.isDebitable !== undefined && { isDebitable: data.isDebitable }),
          ...(data.subcontractorId !== undefined && { subcontractorId: data.subcontractorId }),
          ...(data.recoveryRate !== undefined && { recoveryRate: data.recoveryRate }),
        },
      });

      return { transaction: updated };
    }),

  taxSummary: protectedProcedure
    .input(
      z.object({
        projectId: z.string(),
        fromDate: z.string().datetime().optional(),
        toDate: z.string().datetime().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      await assertProjectMember(ctx.user, input.projectId);

      const where: any = {
        projectId: input.projectId,
        type: "receive",
      };
      if (input.fromDate || input.toDate) {
        where.date = {};
        if (input.fromDate) where.date.gte = new Date(input.fromDate);
        if (input.toDate) where.date.lte = new Date(input.toDate);
      }

      const txns = await db.materialTransaction.findMany({
        where,
        include: {
          material: { select: { name: true, code: true, unit: true } },
        },
        orderBy: { date: "desc" },
      });

      const totalBaseAmount = txns.reduce((s, t) => s + t.quantity * t.rate, 0);
      const totalVatAmount = txns.reduce((s, t) => s + (t.vatAmount ?? 0), 0);
      const totalTdsAmount = txns.reduce((s, t) => s + (t.tdsAmount ?? 0), 0);
      const totalWithVat = txns.reduce((s, t) => s + (t.totalWithVat ?? 0), 0);
      const totalNetPayable = txns.reduce((s, t) => s + (t.netPayable ?? 0), 0);

      const bySupplierMap = new Map<
        string,
        {
          supplierPan: string | null;
          supplierInvoiceNo: string | null;
          count: number;
          baseAmount: number;
          vatAmount: number;
          tdsAmount: number;
          netPayable: number;
        }
      >();

      for (const t of txns) {
        const key = `${t.supplierPan ?? "unknown"}|${t.supplierInvoiceNo ?? "no-invoice"}`;
        const existing = bySupplierMap.get(key) ?? {
          supplierPan: t.supplierPan,
          supplierInvoiceNo: t.supplierInvoiceNo,
          count: 0,
          baseAmount: 0,
          vatAmount: 0,
          tdsAmount: 0,
          netPayable: 0,
        };
        existing.count += 1;
        existing.baseAmount += t.quantity * t.rate;
        existing.vatAmount += t.vatAmount ?? 0;
        existing.tdsAmount += t.tdsAmount ?? 0;
        existing.netPayable += t.netPayable ?? 0;
        bySupplierMap.set(key, existing);
      }

      const byMonthMap = new Map<
        string,
        {
          month: string;
          baseAmount: number;
          vatAmount: number;
          tdsAmount: number;
          netPayable: number;
        }
      >();

      for (const t of txns) {
        const d = new Date(t.date);
        const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
        const existing = byMonthMap.get(monthKey) ?? {
          month: monthKey,
          baseAmount: 0,
          vatAmount: 0,
          tdsAmount: 0,
          netPayable: 0,
        };
        existing.baseAmount += t.quantity * t.rate;
        existing.vatAmount += t.vatAmount ?? 0;
        existing.tdsAmount += t.tdsAmount ?? 0;
        existing.netPayable += t.netPayable ?? 0;
        byMonthMap.set(monthKey, existing);
      }

      return {
        transactions: txns,
        totals: {
          count: txns.length,
          totalBaseAmount,
          totalVatAmount,
          totalTdsAmount,
          totalWithVat,
          totalNetPayable,
        },
        bySupplier: Array.from(bySupplierMap.values()).sort((a, b) => b.baseAmount - a.baseAmount),
        byMonth: Array.from(byMonthMap.values()).sort((a, b) => a.month.localeCompare(b.month)),
      };
    }),
};
