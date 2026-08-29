import { describe, it, expect, vi } from "vitest";
import { recordStockMovement } from "./stock-ledger";

describe("Central Double-Entry Stock Movement Ledger", () => {
  it("records inbound material receive and increments currentStock", async () => {
    const mockDb: any = {
      material: {
        findUnique: vi.fn().mockResolvedValue({
          id: "mat-1",
          name: "OPC Cement 53 Grade",
          unit: "bags",
          currentStock: 100,
          projectId: "proj-1",
        }),
        update: vi.fn().mockResolvedValue({ id: "mat-1", currentStock: 150 }),
      },
      materialTransaction: {
        create: vi.fn().mockImplementation(({ data }) => Promise.resolve({ id: "tx-1", ...data })),
      },
      materialStoreStock: {
        findUnique: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({ id: "ss-1", currentStock: 50 }),
      },
    };

    const result = await recordStockMovement(mockDb, {
      projectId: "proj-1",
      materialId: "mat-1",
      type: "receive",
      quantity: 50,
      rate: 750,
      vatPercent: 13,
      storeLocationId: "store-main",
    });

    expect(result.previousStock).toBe(100);
    expect(result.newStock).toBe(150);
    expect(result.materialName).toBe("OPC Cement 53 Grade");
    expect(mockDb.material.update).toHaveBeenCalledWith({
      where: { id: "mat-1" },
      data: { currentStock: 150 },
    });
    expect(result.transaction.totalWithVat).toBe(42375); // (50 * 750) + 13% VAT
  });

  it("throws BAD_REQUEST on issue if stock is insufficient", async () => {
    const mockDb: any = {
      material: {
        findUnique: vi.fn().mockResolvedValue({
          id: "mat-2",
          name: "Rebar 16mm Fe500D",
          unit: "MT",
          currentStock: 5,
          projectId: "proj-1",
        }),
      },
    };

    await expect(
      recordStockMovement(mockDb, {
        projectId: "proj-1",
        materialId: "mat-2",
        type: "issue",
        quantity: 10,
      })
    ).rejects.toThrow("Insufficient stock for Rebar 16mm Fe500D. Available: 5 MT, Requested: 10 MT.");
  });

  it("records outbound issue and decrements stock when sufficient", async () => {
    const mockDb: any = {
      material: {
        findUnique: vi.fn().mockResolvedValue({
          id: "mat-3",
          name: "River Sand",
          unit: "cu.m",
          currentStock: 40,
          projectId: "proj-1",
        }),
        update: vi.fn().mockResolvedValue({ id: "mat-3", currentStock: 25 }),
      },
      materialTransaction: {
        create: vi.fn().mockImplementation(({ data }) => Promise.resolve({ id: "tx-2", ...data })),
      },
    };

    const result = await recordStockMovement(mockDb, {
      projectId: "proj-1",
      materialId: "mat-3",
      type: "issue",
      quantity: 15,
      subcontractorId: "sub-1",
    });

    expect(result.previousStock).toBe(40);
    expect(result.newStock).toBe(25);
    expect(mockDb.material.update).toHaveBeenCalledWith({
      where: { id: "mat-3" },
      data: { currentStock: 25 },
    });
  });
});
