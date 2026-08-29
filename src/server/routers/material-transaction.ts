import { z } from "zod";
import { safeUrlSchema } from "@/lib/safe-url";
import { TRPCError } from "@trpc/server";
import { protectedProcedure } from "@/server/trpc";
import { db } from "@/lib/db";
import { assertProjectMember, assertCanWrite, assertOrgBankAccount } from "@/lib/authz";
import { assertNotLocked } from "@/lib/fiscal-year-lock";
import { assertDelegation } from "@/lib/delegation";

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
  weighbridgeGross: z.number().nonnegative().optional().nullable(),
  weighbridgeTare: z.number().nonnegative().optional().nullable(),
  densityFactor: z.number().positive().optional().nullable(),
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
  fileUrl: safeUrlSchema.optional().nullable(),
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
      await assertNotLocked(ctx.user.organizationId);
      const material = await db.material.findFirst({
        where: { id: input.materialId, projectId: input.projectId },
      });
      if (!material) throw new TRPCError({ code: "NOT_FOUND", message: "Material not found in this project." });

      if (input.type === "transfer") {
        if (input.storeLocationId && input.targetStoreLocationId && input.storeLocationId === input.targetStoreLocationId) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Source and destination store locations cannot be the same.",
          });
        }
      }

      const delta =
        input.type === "receive" || input.type === "adjustment"
          ? input.quantity
          : input.type === "issue"
            ? -input.quantity
            : 0; // For transfer, overall project stock remains unchanged

      const newStock = material.currentStock + delta;
      if (newStock < 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Insufficient stock level for this transaction." });
      }

      // If issuing or transferring from a specific store, verify source store stock balance
      if ((input.type === "issue" || input.type === "transfer") && input.storeLocationId) {
        const sourceStoreStock = await db.materialStoreStock.findUnique({
          where: {
            materialId_storeLocationId: {
              materialId: input.materialId,
              storeLocationId: input.storeLocationId,
            },
          },
        });
        const availableInStore = sourceStoreStock ? sourceStoreStock.currentStock : 0;
        if (availableInStore < input.quantity - 0.0001) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Insufficient stock at source store. Available: ${availableInStore} ${material.unit}, Requested: ${input.quantity} ${material.unit}.`,
          });
        }
      }

      // For transfer: verify the destination store is different from source.
      // (Already checked above, but double-guard against data corruption.)
      if (input.type === "transfer" && input.storeLocationId && input.targetStoreLocationId) {
        if (input.storeLocationId === input.targetStoreLocationId) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Source and destination store locations cannot be the same for a transfer.",
          });
        }
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
            // Prevent over-receiving: the total received quantity (existing
            // + new) must not exceed the ordered quantity. Previously there
            // was no guard — a user could receive 200 units against a
            // 100-unit PO, inflating stock and understating the open PO
            // amount.
            const newReceivedQty = poItem.receivedQty + input.quantity;
            if (newReceivedQty > poItem.quantity + 0.01) {
              throw new TRPCError({
                code: "BAD_REQUEST",
                message: `Over-receiving not allowed. PO item ordered: ${poItem.quantity} ${poItem.unit}, already received: ${poItem.receivedQty} ${poItem.unit}, this delivery: ${input.quantity} ${poItem.unit}. Total would exceed ordered quantity.`,
              });
            }

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
      await assertNotLocked(ctx.user.organizationId, txn.date);

      const updated = await db.materialTransaction.update({
        where: { id: transactionId },
        data: {
          ...(data.isDebitable !== undefined && { isDebitable: data.isDebitable }),
          ...(data.subcontractorId !== undefined && { subcontractorId: data.subcontractorId }),
          ...(data.recoveryRate !== undefined && { recoveryRate: data.recoveryRate }),
        },
      });

      // If isDebitable, subcontractorId, or recoveryRate changed, and
      // this transaction is linked to a subcontractor that has IPCs,
      // we must recalculate those IPCs — otherwise the stored IPC
      // materialDeductions will be stale (wrong net payable).
      //
      // Also: if the transaction was previously deducted in an IPC
      // (deductedInIpcId is set) and isDebitable is being turned OFF,
      // we must "un-deduct" it by clearing the deductedInIpcId so the
      // IPC recalculation doesn't still count it.
      const affectsDeduction =
        data.isDebitable !== undefined ||
        data.subcontractorId !== undefined ||
        data.recoveryRate !== undefined;

      if (affectsDeduction && updated.subcontractorId) {
        // If isDebitable was turned off and the txn was already
        // deducted in an IPC, clear the link so the IPC recalculates
        // without this txn.
        if (data.isDebitable === false && updated.deductedInIpcId) {
          await db.materialTransaction.update({
            where: { id: transactionId },
            data: { deductedInIpcId: null },
          });
        }

        // Find all IPCs for this project + subcontractor that are in
        // draft/submitted/certified status (not yet paid — paid IPCs
        // are locked) and recalculate them.
        const affectedIpcs = await db.ipc.findMany({
          where: {
            projectId,
            subcontractorId: updated.subcontractorId,
            status: { in: ["draft", "submitted", "certified"] },
          },
          select: { id: true },
        });

        for (const ipc of affectedIpcs) {
          await db.$transaction(async (tx) => {
            // Re-import the recalculation logic inline to avoid a
            // circular import with ipc.ts. This mirrors the
            // recalculateIpc() function in ipc.ts.
            const ipcRec = await tx.ipc.findUnique({
              where: { id: ipc.id },
              select: {
                projectId: true,
                retention: true,
                advanceRecovery: true,
                subcontractorId: true,
                vatPercent: true,
                tdsPercent: true,
              },
            });
            if (!ipcRec) return;

            const items = await tx.ipcItem.findMany({ where: { ipcId: ipc.id } });
            const gross = items.reduce((s: number, i: any) => s + i.amount, 0);
            const retentionAmount = (gross * ipcRec.retention) / 100;

            let materialDeductions = 0;
            if (ipcRec.subcontractorId) {
              const txns = await tx.materialTransaction.findMany({
                where: {
                  projectId: ipcRec.projectId,
                  subcontractorId: ipcRec.subcontractorId,
                  isDebitable: true,
                  deductedInIpcId: null,
                },
              });
              materialDeductions = txns.reduce(
                (sum: number, t: any) => sum + (t.quantity * (t.recoveryRate ?? t.rate)),
                0,
              );
            }

            const vatAmount = (gross * (ipcRec.vatPercent || 0)) / 100;
            const totalWithVat = gross + vatAmount;
            const tdsAmount = (gross * (ipcRec.tdsPercent || 0)) / 100;
            const netPayable = gross - retentionAmount - ipcRec.advanceRecovery - materialDeductions;
            const finalPayable = totalWithVat - retentionAmount - ipcRec.advanceRecovery - materialDeductions - tdsAmount;

            await tx.ipc.update({
              where: { id: ipc.id },
              data: { grossAmount: gross, retentionAmount, netPayable, vatAmount, totalWithVat, tdsAmount, finalPayable },
            });
          });
        }
      }

      return { transaction: updated };
    }),

  taxSummary: protectedProcedure
    .input(
      z.object({
        projectId: z.string(),
        fromDate: z.string().optional().transform((v) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? `${v}T00:00:00.000Z` : v)),
        toDate: z.string().optional().transform((v) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? `${v}T23:59:59.999Z` : v)),
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

  /**
   * Fast Direct Material Delivery Log (सामग्री दाखिला / रेकर्ड)
   * Designed for contractors without warehouses/gatekeepers:
   * 1. Finds or auto-creates Material on the target project.
   * 2. Auto-increments project inventory stock immediately.
   * 3. If credit: creates/updates vendor ledger (Bahi Khata).
   * 4. If paid now: debits chosen company bank/cash account & logs voucher.
   */
  logDirectDelivery: protectedProcedure
    .input(
      z.object({
        projectId: z.string(),
        materialName: z.string().min(1),
        category: z.string().optional().nullable(),
        subCategory: z.string().optional().nullable(),
        company: z.string().optional().nullable(),
        spec: z.string().optional().nullable(),
        catalogMaterialId: z.string().optional().nullable(),
        unit: z.string().default("pcs"),
        quantity: z.number().positive(),
        rate: z.number().nonnegative(),
        totalAmount: z.number().nonnegative(),
        date: z.string(), // ISO or YYYY-MM-DD
        miti: z.string().optional(),
        supplierName: z.string().min(1),
        supplierPan: z.string().optional().nullable(),
        // VAT & Tax specifications
        isVatBill: z.boolean().default(false),
        billStatus: z.enum(["received", "pending", "non_vat"]).default("pending"),
        vatPercent: z.number().nonnegative().default(13),
        vatAmount: z.number().nonnegative().default(0),
        taxableAmount: z.number().nonnegative().optional(),
        // TDS specifications (customizable %: 1.5%, 15%, etc.)
        isTdsDeductible: z.boolean().default(false),
        tdsPercent: z.number().nonnegative().default(1.5),
        tdsAmount: z.number().nonnegative().default(0),
        // Invoicing & Attachments
        invoiceNumber: z.string().optional().nullable(),
        challanNo: z.string().optional().nullable(),
        fileUrl: safeUrlSchema.optional().nullable(),
        // Landing & Incidental Costs with independent payments & VAT option
        transportationCost: z.number().nonnegative().default(0),
        transportIsVat: z.boolean().default(false),
        transportInvoiceNo: z.string().optional().nullable(),
        transportFileUrl: z.string().optional().nullable(),
        transportPaidStatus: z.enum(["credit", "paid_now"]).default("credit"),
        transportBankAccountId: z.string().optional().nullable(),
        loadingUnloadingCost: z.number().nonnegative().default(0),
        incidentalCost: z.number().nonnegative().default(0),
        incidentalPaidStatus: z.enum(["credit", "paid_now"]).default("credit"),
        incidentalBankAccountId: z.string().optional().nullable(),
        incidentalRemarks: z.string().optional().nullable(),
        paymentStatus: z.enum(["credit", "paid_now"]).default("credit"),
        bankAccountId: z.string().optional().nullable(),
        remarks: z.string().optional().nullable(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await assertCanWrite(ctx.user, input.projectId);
      await assertNotLocked(input.projectId);
      await assertDelegation(ctx.user, "log_direct_material_purchase", input.totalAmount);

      const targetDate = new Date(input.date);

      return await db.$transaction(async (tx) => {
        // Construct detailed formatted title if subCategory/spec/company provided
        const fullDetails = [input.company, input.materialName, input.subCategory, input.spec]
          .filter(Boolean)
          .join(" ");

        // 1. Find or auto-create material in project
        let material = await tx.material.findFirst({
          where: {
            projectId: input.projectId,
            OR: [
              { name: { equals: input.materialName.trim(), mode: "insensitive" } },
              { name: { equals: fullDetails.trim(), mode: "insensitive" } },
            ],
          },
        });

        if (!material) {
          material = await tx.material.create({
            data: {
              projectId: input.projectId,
              name: fullDetails.trim() || input.materialName.trim(),
              code: `MAT-${Date.now().toString().slice(-4)}`,
              category: input.category || null,
              subCategory: input.subCategory || input.spec || null,
              unit: input.unit,
              catalogMaterialId: input.catalogMaterialId || null,
              currentStock: 0,
            },
          });
        }

        // 2. Increment stock
        const updatedMaterial = await tx.material.update({
          where: { id: material.id },
          data: {
            currentStock: { increment: input.quantity },
          },
        });

        // 3. Log Material Transaction
        const taxableAmount = input.taxableAmount || (input.isVatBill ? input.totalAmount / (1 + input.vatPercent / 100) : input.totalAmount);
        const vatAmount = input.isVatBill ? input.vatAmount || (input.totalAmount - taxableAmount) : 0;
        const tdsAmount = input.isTdsDeductible ? input.tdsAmount || (taxableAmount * (input.tdsPercent / 100)) : 0;
        const netPayable = input.totalAmount - tdsAmount;

        const txn = await tx.materialTransaction.create({
          data: {
            projectId: input.projectId,
            materialId: material.id,
            type: "receive",
            quantity: input.quantity,
            unit: input.unit,
            rate: input.rate,
            date: targetDate,
            reference: input.invoiceNumber ? `Invoice #${input.invoiceNumber}` : (input.challanNo ? `Challan #${input.challanNo}` : "Direct Site Delivery"),
            remarks: input.remarks || `Direct delivery from ${input.supplierName}`,
            supplierInvoiceNo: input.invoiceNumber || input.challanNo || null,
            supplierPan: input.supplierPan || null,
            vatPercent: input.isVatBill ? input.vatPercent : 0,
            vatAmount,
            tdsPercent: input.isTdsDeductible ? input.tdsPercent : 0,
            tdsAmount,
            totalWithVat: input.totalAmount,
            netPayable,
            paymentType: input.paymentStatus === "credit" ? "payable" : "unpayable",
            createdById: ctx.user.id,
          },
        });

        // 4. Find or create Vendor Partner
        let partner = await tx.partner.findFirst({
          where: {
            projectId: input.projectId,
            name: { equals: input.supplierName.trim(), mode: "insensitive" },
          },
        });

        if (!partner) {
          partner = await tx.partner.create({
            data: {
              projectId: input.projectId,
              name: input.supplierName.trim(),
              pan: input.supplierPan || null,
              type: "material_supplier",
            },
          });
        } else if (input.supplierPan && !partner.pan) {
          await tx.partner.update({
            where: { id: partner.id },
            data: { pan: input.supplierPan },
          });
        }

        // 5. Handle Material Payment vs Bahi Khata
        if (input.paymentStatus === "paid_now" && input.bankAccountId) {
          const compBank = await assertOrgBankAccount(input.bankAccountId, ctx.user.organizationId, tx);

          await tx.payment.create({
            data: {
              projectId: input.projectId,
              paymentDate: targetDate,
              paymentMiti: input.miti || null,
              payeeType: "vendor",
              payeeName: input.supplierName.trim(),
              partyPan: input.supplierPan || partner?.pan || null,
              amount: input.totalAmount,
              tdsDeducted: tdsAmount,
              vatIncluded: vatAmount,
              netPaid: netPayable,
              paymentMode: input.bankAccountId.includes("cash") ? "cash" : "bank_transfer",
              bankAccount: input.bankAccountId,
              notes: `Direct Material: ${input.quantity} ${input.unit} ${fullDetails || input.materialName} from ${input.supplierName}`,
              invoiceNumber: input.invoiceNumber || input.challanNo || null,
              scannedBillUrl: input.fileUrl || null,
              isBillAttached: !!input.fileUrl,
              createdById: ctx.user.id,
            },
          });

          await tx.companyBankAccount.update({
            where: { id: compBank.id },
            data: { currentBalance: { decrement: netPayable } },
          });
        } else {
          // Material is Credit / Due: Log VAT Bill / Payable with bill status
          await tx.vatBill.create({
            data: {
              projectId: input.projectId,
              billType: "purchase",
              billNumber: input.invoiceNumber || input.challanNo || `MAT-DEL-${Date.now().toString().slice(-4)}`,
              billDate: targetDate,
              billMiti: input.miti || null,
              partyName: input.supplierName.trim(),
              partyPan: input.supplierPan || partner?.pan || "000000000",
              taxableAmount: Math.round(taxableAmount * 100) / 100,
              vatPercent: input.isVatBill ? input.vatPercent : 0,
              vatAmount: Math.round(vatAmount * 100) / 100,
              totalAmount: input.totalAmount,
              tdsPercent: input.isTdsDeductible ? input.tdsPercent : 0,
              tdsAmount: Math.round(tdsAmount * 100) / 100,
              netPayable: Math.round(netPayable * 100) / 100,
              category: "material",
              materialTxnId: txn.id,
              scannedBillUrl: input.fileUrl || null,
              isBillAttached: input.billStatus === "received" && !!input.fileUrl,
              description: `[${input.billStatus === "received" ? "VAT BILL" : input.billStatus === "pending" ? "BILL PENDING / CHALLAN" : "NON-VAT"}] ${input.quantity} ${input.unit} ${fullDetails || input.materialName}`,
              createdById: ctx.user.id,
            },
          });
        }

        // 6. Handle Independent Transportation Payment if Paid Now
        if (input.transportationCost > 0) {
          if (input.transportPaidStatus === "paid_now" && input.transportBankAccountId) {
            const tBank = await assertOrgBankAccount(input.transportBankAccountId, ctx.user.organizationId, tx);

            await tx.payment.create({
              data: {
                projectId: input.projectId,
                paymentDate: targetDate,
                paymentMiti: input.miti || null,
                payeeType: "vendor",
                payeeName: `Transportation (${input.supplierName.trim()})`,
                amount: input.transportationCost,
                netPaid: input.transportationCost,
                vatIncluded: input.transportIsVat ? Math.round((input.transportationCost - input.transportationCost / 1.13) * 100) / 100 : 0,
                invoiceNumber: input.transportInvoiceNo || null,
                scannedBillUrl: input.transportFileUrl || null,
                isBillAttached: !!input.transportFileUrl,
                paymentMode: input.transportBankAccountId.includes("cash") ? "cash" : "bank_transfer",
                bankAccount: input.transportBankAccountId,
                notes: `Freight for ${input.quantity} ${input.unit} ${input.materialName}`,
                createdById: ctx.user.id,
              },
            });

            await tx.companyBankAccount.update({
              where: { id: tBank.id },
              data: { currentBalance: { decrement: input.transportationCost } },
            });
          } else if (input.transportIsVat) {
            // Freight is VAT Bill on Credit
            const tTaxable = input.transportationCost / 1.13;
            const tVat = input.transportationCost - tTaxable;
            await tx.vatBill.create({
              data: {
                projectId: input.projectId,
                billType: "purchase",
                billNumber: input.transportInvoiceNo || `FRT-${Date.now().toString().slice(-4)}`,
                billDate: targetDate,
                billMiti: input.miti || null,
                partyName: `Freight (${input.supplierName.trim()})`,
                partyPan: "000000000",
                taxableAmount: Math.round(tTaxable * 100) / 100,
                vatPercent: 13,
                vatAmount: Math.round(tVat * 100) / 100,
                totalAmount: input.transportationCost,
                netPayable: input.transportationCost,
                category: "other",
                scannedBillUrl: input.transportFileUrl || null,
                isBillAttached: !!input.transportFileUrl,
                description: `[FREIGHT VAT BILL] Freight for ${input.quantity} ${input.unit} ${input.materialName}`,
                createdById: ctx.user.id,
              },
            });
          }
        }

        // 7. Handle Independent Incidental / Unloading Payment if Paid Now
        const totalIncidental = input.incidentalCost + input.loadingUnloadingCost;
        if (totalIncidental > 0 && input.incidentalPaidStatus === "paid_now" && input.incidentalBankAccountId) {
          const iBank = await assertOrgBankAccount(input.incidentalBankAccountId, ctx.user.organizationId, tx);

          await tx.payment.create({
            data: {
              projectId: input.projectId,
              paymentDate: targetDate,
              paymentMiti: input.miti || null,
              payeeType: "staff",
              payeeName: "Site Unloading / Spot Labor",
              amount: totalIncidental,
              netPaid: totalIncidental,
              paymentMode: input.incidentalBankAccountId.includes("cash") ? "cash" : "bank_transfer",
              bankAccount: input.incidentalBankAccountId,
              notes: `Unloading / Spot Expense: ${input.incidentalRemarks || "Material drop labor"}`,
              createdById: ctx.user.id,
            },
          });

          await tx.companyBankAccount.update({
            where: { id: iBank.id },
            data: { currentBalance: { decrement: totalIncidental } },
          });
        }

        return {
          success: true,
          materialId: material.id,
          txnId: txn.id,
          currentStock: updatedMaterial.currentStock,
        };
      });
    }),
};
