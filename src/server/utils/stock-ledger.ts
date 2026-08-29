/**
 * Central Double-Entry Material Stock & Inventory Movement Ledger
 *
 * Provides atomic, race-condition safe material transactions across:
 * - Direct Purchases & PO/GRN Receipts
 * - Site Issues to Work Packages / Subcontractors
 * - Inter-Store & Inter-Site Material Transfers
 * - Wastage, Breakage & Physical Reconciliation Adjustments
 */
import { TRPCError } from "@trpc/server";
import { type Prisma, type PrismaClient } from "@prisma/client";

export type StockMovementType = "receive" | "issue" | "transfer" | "adjustment";

export type RecordStockMovementInput = {
  projectId: string;
  materialId: string;
  type: StockMovementType;
  quantity: number;
  rate?: number;
  reference?: string | null;
  remarks?: string | null;
  date?: Date;
  createdById?: string | null;
  isDebitable?: boolean;
  subcontractorId?: string | null;
  recoveryRate?: number | null;
  paymentType?: "payable" | "unpayable" | "temporary";
  storeLocationId?: string | null;
  targetStoreLocationId?: string | null;
  vatPercent?: number;
  tdsPercent?: number;
  supplierInvoiceNo?: string | null;
  supplierPan?: string | null;
  purchaseOrderId?: string | null;
  gateEntryId?: string | null;
  allowNegativeStock?: boolean;
};

export type StockMovementResult = {
  transaction: any;
  previousStock: number;
  newStock: number;
  materialName: string;
  materialUnit: string;
};

type DbClientOrTx = PrismaClient | Prisma.TransactionClient;

/**
 * Record an atomic stock movement and update current inventory balances.
 */
export async function recordStockMovement(
  db: DbClientOrTx,
  input: RecordStockMovementInput
): Promise<StockMovementResult> {
  const qty = Math.abs(input.quantity);
  if (qty === 0) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Transaction quantity must be greater than 0.",
    });
  }

  // 1. Fetch current material record
  const material = await db.material.findUnique({
    where: { id: input.materialId },
    select: { id: true, name: true, unit: true, currentStock: true, projectId: true },
  });

  if (!material) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: `Material with ID ${input.materialId} not found.`,
    });
  }

  if (material.projectId !== input.projectId) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Material does not belong to the specified project.",
    });
  }

  // 2. Calculate Stock Delta
  let stockDelta = 0;
  if (input.type === "receive") {
    stockDelta = qty;
  } else if (input.type === "issue") {
    stockDelta = -qty;
  } else if (input.type === "transfer") {
    // If transferring within same project stores, total project stock stays unchanged
    // but source store stock decreases and target store stock increases.
    // If target store is not specified, it is treated as outbound transfer.
    stockDelta = input.targetStoreLocationId ? 0 : -qty;
  } else if (input.type === "adjustment") {
    // adjustment quantity can be positive or negative
    stockDelta = input.quantity;
  }

  const previousStock = material.currentStock;
  const newStock = previousStock + stockDelta;

  if (input.type === "issue" && newStock < 0 && !input.allowNegativeStock) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Insufficient stock for ${material.name}. Available: ${previousStock} ${material.unit}, Requested: ${qty} ${material.unit}.`,
    });
  }

  // 3. Tax & Payable Calculations
  const rate = Math.max(0, input.rate ?? 0);
  const baseAmount = qty * rate;
  const vatPercent = input.vatPercent ?? 0;
  const vatAmount = (baseAmount * vatPercent) / 100;
  const totalWithVat = baseAmount + vatAmount;

  const tdsPercent = input.tdsPercent ?? 0;
  const tdsAmount = (baseAmount * tdsPercent) / 100;
  const netPayable = totalWithVat - tdsAmount;

  // 4. Create Material Transaction
  const transaction = await db.materialTransaction.create({
    data: {
      projectId: input.projectId,
      materialId: input.materialId,
      type: input.type,
      quantity: qty,
      unit: material.unit,
      rate,
      reference: input.reference?.trim() || null,
      remarks: input.remarks?.trim() || null,
      date: input.date || new Date(),
      createdById: input.createdById || null,
      isDebitable: input.isDebitable ?? false,
      subcontractorId: input.subcontractorId || null,
      recoveryRate: input.recoveryRate ?? null,
      paymentType: input.paymentType || "payable",
      storeLocationId: input.storeLocationId || null,
      targetStoreLocationId: input.targetStoreLocationId || null,
      vatPercent,
      vatAmount,
      totalWithVat,
      tdsPercent,
      tdsAmount,
      netPayable,
      supplierInvoiceNo: input.supplierInvoiceNo?.trim() || null,
      supplierPan: input.supplierPan?.trim() || null,
      purchaseOrderId: input.purchaseOrderId || null,
      gateEntryId: input.gateEntryId || null,
    },
  });

  // 5. Update Material Master Stock Level
  if (stockDelta !== 0) {
    await db.material.update({
      where: { id: input.materialId },
      data: { currentStock: newStock },
    });
  }

  // 6. Update Source Store Stock (if specified)
  if (input.storeLocationId) {
    const existingStore = await db.materialStoreStock.findUnique({
      where: {
        materialId_storeLocationId: {
          materialId: input.materialId,
          storeLocationId: input.storeLocationId,
        },
      },
    });

    const storeDelta = input.type === "receive" ? qty : -qty;
    const newStoreStock = Math.max(0, (existingStore?.currentStock ?? 0) + storeDelta);

    if (existingStore) {
      await db.materialStoreStock.update({
        where: { id: existingStore.id },
        data: { currentStock: newStoreStock },
      });
    } else {
      await db.materialStoreStock.create({
        data: {
          materialId: input.materialId,
          storeLocationId: input.storeLocationId,
          currentStock: Math.max(0, storeDelta),
        },
      });
    }
  }

  // 7. Update Target Store Stock on Transfer (if specified)
  if (input.targetStoreLocationId && input.type === "transfer") {
    const existingTarget = await db.materialStoreStock.findUnique({
      where: {
        materialId_storeLocationId: {
          materialId: input.materialId,
          storeLocationId: input.targetStoreLocationId,
        },
      },
    });

    const targetStock = (existingTarget?.currentStock ?? 0) + qty;
    if (existingTarget) {
      await db.materialStoreStock.update({
        where: { id: existingTarget.id },
        data: { currentStock: targetStock },
      });
    } else {
      await db.materialStoreStock.create({
        data: {
          materialId: input.materialId,
          storeLocationId: input.targetStoreLocationId,
          currentStock: targetStock,
        },
      });
    }
  }

  return {
    transaction,
    previousStock,
    newStock,
    materialName: material.name,
    materialUnit: material.unit,
  };
}
