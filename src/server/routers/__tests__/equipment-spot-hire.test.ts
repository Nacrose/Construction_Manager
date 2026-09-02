/**
 * Router-layer tests for equipment-spot-hire.ts (on-demand hire tickets
 * with auto-vendor provisioning and dry-hire fuel debits).
 *
 * The spot-hire procedures are a plain procedure map mounted on the
 * equipment router; we wrap them in a local router for createCaller.
 *
 * Pins:
 *   - createSpotHire gross math per hire type:
 *       hourly → max(hours, minCallout) × rate + mobilization
 *       trip   → trips × rate + mobilization
 *       lump_sum / daily / shift → rate + mobilization (single unit)
 *   - dry-hire fuel deduction: liters × unit cost, falling back to the
 *     PROJECT's fuel price when the ticket doesn't set one (no hardcoded
 *     NPR/L); wet hire → no deduction
 *   - net payable = max(0, gross − fuel deduction)
 *   - vendor auto-provisioning: case-insensitive match on the trimmed
 *     name; creates EquipmentVendor AND Partner (type equipment_vendor)
 *     only when missing
 *   - fiscal lock uses the TICKET date, checked BEFORE any vendor writes
 *   - read-only roles blocked; negative rates/hours rejected (zod)
 *   - listSpotHires: org scoping + summary totals (unbilled = Σ net of
 *     unbilled tickets only)
 *   - getVendorHireStatement: groups by trimmed+lowercased vendor name,
 *     sorted by unbilled exposure
 *   - deleteSpotTicket: IDOR guard (ticket must belong to the authorized
 *     project), fiscal lock on the ticket date, billed tickets immutable
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { buildUser, createCaller, expectTRPCError } from "./test-utils";

vi.mock("@/lib/db", async () => {
  const { buildDbMock } = await import("./test-utils");
  const db = buildDbMock();
  return { db, getFreshDb: () => db };
});

import { db } from "@/lib/db";
import { router } from "@/server/trpc";
import { equipmentSpotHireProcedures } from "../equipment-spot-hire";

const spotHireRouter = router({ ...equipmentSpotHireProcedures });

const anyDb = db as any;
const ENGINEER = buildUser();

function member(role: string | null) {
  anyDb.projectMember.findUnique.mockResolvedValue(role ? { role } : null);
}

function ticket(overrides: Record<string, unknown> = {}) {
  return {
    id: "tk-1",
    vendorName: "Sharma Equipment",
    vendorPhone: "9801",
    hoursWorked: 0,
    tripCount: 0,
    totalGross: 0,
    fuelDeduction: 0,
    netPayable: 0,
    isBilled: false,
    ...overrides,
  };
}

beforeEach(() => {
  vi.resetAllMocks();
});

// ─── createSpotHire: gross math ─────────────────────────────────────────────
describe("equipmentSpotHire.createSpotHire — gross math", () => {
  function happyMocks() {
    anyDb.equipmentVendor.findFirst.mockResolvedValue({ id: "ev-1" });
    anyDb.partner.findFirst.mockResolvedValue({ id: "partner-1" });
  }

  it("hourly: bills max(hoursWorked, minCalloutHours) × rate + mobilization", async () => {
    member("engineer");
    happyMocks();
    const caller = createCaller(spotHireRouter, ENGINEER);
    await caller.createSpotHire({
      projectId: "p-1",
      vendorName: "Sharma Equipment",
      machineName: "JCB 3DX",
      hireType: "hourly",
      rate: 2000,
      minCalloutHours: 4,
      mobilizationFee: 1000,
      fuelMode: "wet",
      hoursWorked: 5,
    });

    const data = anyDb.equipmentSpotHire.create.mock.calls[0][0].data;
    expect(data.totalGross).toBe(5 * 2000 + 1000); // 5h billed
    expect(data.fuelDeduction).toBe(0); // wet hire
    expect(data.netPayable).toBe(11000);
  });

  it("hourly: enforces the minimum callout when hours are lower", async () => {
    member("engineer");
    happyMocks();
    const caller = createCaller(spotHireRouter, ENGINEER);
    await caller.createSpotHire({
      projectId: "p-1",
      vendorName: "Sharma Equipment",
      machineName: "JCB 3DX",
      hireType: "hourly",
      rate: 2000,
      minCalloutHours: 4,
      mobilizationFee: 0,
      fuelMode: "wet",
      hoursWorked: 2,
    });
    const data = anyDb.equipmentSpotHire.create.mock.calls[0][0].data;
    expect(data.totalGross).toBe(4 * 2000); // callout minimum wins
    expect(data.netPayable).toBe(8000);
  });

  it("trip: bills tripCount × rate + mobilization", async () => {
    member("engineer");
    happyMocks();
    const caller = createCaller(spotHireRouter, ENGINEER);
    await caller.createSpotHire({
      projectId: "p-1",
      vendorName: "Sharma Equipment",
      machineName: "Tipper BA 2 Kha",
      hireType: "trip",
      rate: 3000,
      mobilizationFee: 1500,
      fuelMode: "wet",
      tripCount: 6,
    });
    const data = anyDb.equipmentSpotHire.create.mock.calls[0][0].data;
    expect(data.totalGross).toBe(6 * 3000 + 1500);
    expect(data.netPayable).toBe(19500);
  });

  it("lump_sum: rate IS the total — hours/trips are ignored", async () => {
    member("engineer");
    happyMocks();
    const caller = createCaller(spotHireRouter, ENGINEER);
    await caller.createSpotHire({
      projectId: "p-1",
      vendorName: "Sharma Equipment",
      machineName: "Crane 25T",
      hireType: "lump_sum",
      rate: 25000,
      mobilizationFee: 2000,
      fuelMode: "wet",
      hoursWorked: 99, // must be ignored
      tripCount: 99, // must be ignored
    });
    const data = anyDb.equipmentSpotHire.create.mock.calls[0][0].data;
    expect(data.totalGross).toBe(27000);
    expect(data.netPayable).toBe(27000);
  });

  it("daily/shift: a single unit of rate per ticket", async () => {
    member("engineer");
    happyMocks();
    const caller = createCaller(spotHireRouter, ENGINEER);
    await caller.createSpotHire({
      projectId: "p-1",
      vendorName: "Sharma Equipment",
      machineName: "Genset 15KVA",
      hireType: "shift",
      rate: 8000,
      mobilizationFee: 500,
      fuelMode: "wet",
      hoursWorked: 9, // display only
    });
    const data = anyDb.equipmentSpotHire.create.mock.calls[0][0].data;
    expect(data.totalGross).toBe(8500);
  });
});

// ─── createSpotHire: dry-hire fuel deduction ────────────────────────────────
describe("equipmentSpotHire.createSpotHire — dry-hire fuel debits", () => {
  it("dry: deducts liters × ticket fuelUnitCost from the gross", async () => {
    member("engineer");
    anyDb.equipmentVendor.findFirst.mockResolvedValue({ id: "ev-1" });
    anyDb.partner.findFirst.mockResolvedValue({ id: "partner-1" });
    const caller = createCaller(spotHireRouter, ENGINEER);
    await caller.createSpotHire({
      projectId: "p-1",
      vendorName: "Sharma Equipment",
      machineName: "Excavator PC200",
      hireType: "hourly",
      rate: 2000,
      mobilizationFee: 0,
      fuelMode: "dry",
      fuelLitersIssued: 20,
      fuelUnitCost: 160,
      hoursWorked: 5,
    });

    const data = anyDb.equipmentSpotHire.create.mock.calls[0][0].data;
    expect(data.totalGross).toBe(10000);
    expect(data.fuelDeduction).toBe(20 * 160);
    expect(data.netPayable).toBe(10000 - 3200);
  });

  it("dry with no ticket price falls back to the PROJECT's fuel rate (not a hardcoded default)", async () => {
    member("engineer");
    anyDb.equipmentVendor.findFirst.mockResolvedValue({ id: "ev-1" });
    anyDb.partner.findFirst.mockResolvedValue({ id: "partner-1" });
    anyDb.project.findUnique.mockResolvedValue({ fuelPricePerLiter: 158 });
    const caller = createCaller(spotHireRouter, ENGINEER);
    await caller.createSpotHire({
      projectId: "p-1",
      vendorName: "Sharma Equipment",
      machineName: "Excavator PC200",
      hireType: "hourly",
      rate: 2000,
      mobilizationFee: 0,
      fuelMode: "dry",
      fuelLitersIssued: 10,
      fuelUnitCost: 0, // not set on the ticket
      hoursWorked: 5,
    });

    expect(anyDb.project.findUnique).toHaveBeenCalledWith({
      where: { id: "p-1" },
      select: { fuelPricePerLiter: true },
    });
    const data = anyDb.equipmentSpotHire.create.mock.calls[0][0].data;
    expect(data.fuelUnitCost).toBe(158); // resolved price is persisted
    expect(data.fuelDeduction).toBe(10 * 158);
    expect(data.netPayable).toBe(10000 - 1580);
  });

  it("dry with no project fuel price deducts nothing (no invented rate)", async () => {
    member("engineer");
    anyDb.equipmentVendor.findFirst.mockResolvedValue({ id: "ev-1" });
    anyDb.partner.findFirst.mockResolvedValue({ id: "partner-1" });
    anyDb.project.findUnique.mockResolvedValue({ fuelPricePerLiter: null });
    const caller = createCaller(spotHireRouter, ENGINEER);
    await caller.createSpotHire({
      projectId: "p-1",
      vendorName: "Sharma Equipment",
      machineName: "Excavator PC200",
      hireType: "hourly",
      rate: 2000,
      mobilizationFee: 0,
      fuelMode: "dry",
      fuelLitersIssued: 10,
      fuelUnitCost: 0,
      hoursWorked: 5,
    });
    const data = anyDb.equipmentSpotHire.create.mock.calls[0][0].data;
    expect(data.fuelDeduction).toBe(0);
    expect(data.netPayable).toBe(10000);
  });

  it("fuel deduction larger than the gross clamps netPayable at 0", async () => {
    member("engineer");
    anyDb.equipmentVendor.findFirst.mockResolvedValue({ id: "ev-1" });
    anyDb.partner.findFirst.mockResolvedValue({ id: "partner-1" });
    const caller = createCaller(spotHireRouter, ENGINEER);
    await caller.createSpotHire({
      projectId: "p-1",
      vendorName: "Sharma Equipment",
      machineName: "Pump 3HP",
      hireType: "shift",
      rate: 3000,
      mobilizationFee: 0,
      fuelMode: "dry",
      fuelLitersIssued: 30,
      fuelUnitCost: 200, // 6000 deduction > 3000 gross
    });
    const data = anyDb.equipmentSpotHire.create.mock.calls[0][0].data;
    expect(data.fuelDeduction).toBe(6000);
    expect(data.netPayable).toBe(0); // clamped, never negative
  });
});

// ─── createSpotHire: vendor auto-provisioning ───────────────────────────────
describe("equipmentSpotHire.createSpotHire — vendor auto-provisioning", () => {
  it("matches vendors case-insensitively on the TRIMMED name", async () => {
    member("engineer");
    anyDb.equipmentVendor.findFirst.mockResolvedValue({ id: "ev-1" });
    anyDb.partner.findFirst.mockResolvedValue({ id: "partner-1" });
    const caller = createCaller(spotHireRouter, ENGINEER);
    await caller.createSpotHire({
      projectId: "p-1",
      vendorName: "  Sharma Equipment  ", // trimmed before lookup
      machineName: "JCB 3DX",
      hireType: "hourly",
      rate: 2000,
      fuelMode: "wet",
      hoursWorked: 5,
    });

    const where = anyDb.equipmentVendor.findFirst.mock.calls[0][0].where;
    expect(where).toEqual({
      projectId: "p-1",
      name: { equals: "Sharma Equipment", mode: "insensitive" },
    });
    // existing vendor → no auto-create
    expect(anyDb.equipmentVendor.create).not.toHaveBeenCalled();
    expect(anyDb.partner.create).not.toHaveBeenCalled();

    const data = anyDb.equipmentSpotHire.create.mock.calls[0][0].data;
    expect(data.vendorId).toBe("ev-1");
    expect(data.partnerId).toBe("partner-1");
    expect(data.vendorName).toBe("Sharma Equipment"); // trimmed
  });

  it("auto-creates BOTH the EquipmentVendor and a Partner when missing", async () => {
    member("engineer");
    anyDb.equipmentVendor.findFirst.mockResolvedValue(null);
    anyDb.partner.findFirst.mockResolvedValue(null);
    anyDb.equipmentVendor.create.mockResolvedValue({ id: "ev-9" });
    anyDb.partner.create.mockResolvedValue({ id: "partner-9" });
    const caller = createCaller(spotHireRouter, ENGINEER);
    await caller.createSpotHire({
      projectId: "p-1",
      vendorName: "New Vendor",
      vendorPhone: "9841",
      machineName: "JCB 3DX",
      hireType: "hourly",
      rate: 2000,
      fuelMode: "wet",
      hoursWorked: 5,
    });

    expect(anyDb.equipmentVendor.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        projectId: "p-1",
        name: "New Vendor",
        phone: "9841",
        status: "active",
      }),
    });
    expect(anyDb.partner.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        projectId: "p-1",
        name: "New Vendor",
        type: "equipment_vendor",
      }),
    });
    const data = anyDb.equipmentSpotHire.create.mock.calls[0][0].data;
    expect(data.vendorId).toBe("ev-9");
    expect(data.partnerId).toBe("partner-9");
  });
});

// ─── createSpotHire: guards ─────────────────────────────────────────────────
describe("equipmentSpotHire.createSpotHire — guards", () => {
  it("FORBIDDENs a ticket date inside a LOCKED fiscal year BEFORE any vendor writes", async () => {
    member("engineer");
    anyDb.fiscalYearLock.findFirst.mockResolvedValue({ fiscalYear: "2082-83" });
    const caller = createCaller(spotHireRouter, ENGINEER);
    await expectTRPCError(
      caller.createSpotHire({
        projectId: "p-1",
        vendorName: "Sharma Equipment",
        machineName: "JCB 3DX",
        hireType: "hourly",
        rate: 2000,
        fuelMode: "wet",
        hoursWorked: 5,
        date: "2025-07-15",
      }),
      "FORBIDDEN",
    );
    // fail-fast: nothing provisioned or persisted
    expect(anyDb.equipmentVendor.create).not.toHaveBeenCalled();
    expect(anyDb.partner.create).not.toHaveBeenCalled();
    expect(anyDb.equipmentSpotHire.create).not.toHaveBeenCalled();

    // lock checked against the TICKET date, not today
    const where = anyDb.fiscalYearLock.findFirst.mock.calls[0][0].where;
    expect(where.isLocked).toBe(true);
    expect(where.endDate.gte).toEqual(new Date("2025-07-15"));
  });

  it("FORBIDDENs read-only roles (inspector)", async () => {
    member("inspector");
    const caller = createCaller(spotHireRouter, ENGINEER);
    await expectTRPCError(
      caller.createSpotHire({
        projectId: "p-1",
        vendorName: "Sharma Equipment",
        machineName: "JCB 3DX",
        hireType: "hourly",
        rate: 2000,
        fuelMode: "wet",
        hoursWorked: 5,
      }),
      "FORBIDDEN",
    );
    expect(anyDb.equipmentSpotHire.create).not.toHaveBeenCalled();
  });

  it("rejects negative rate / negative hours / negative callout (zod nonnegative)", async () => {
    member("engineer");
    const caller = createCaller(spotHireRouter, ENGINEER);
    await expectTRPCError(
      caller.createSpotHire({
        projectId: "p-1", vendorName: "V", machineName: "M",
        hireType: "hourly", rate: -100, fuelMode: "wet", hoursWorked: 1,
      }),
      "BAD_REQUEST",
    );
    await expectTRPCError(
      caller.createSpotHire({
        projectId: "p-1", vendorName: "V", machineName: "M",
        hireType: "hourly", rate: 100, fuelMode: "wet", hoursWorked: -2,
      }),
      "BAD_REQUEST",
    );
    await expectTRPCError(
      caller.createSpotHire({
        projectId: "p-1", vendorName: "V", machineName: "M",
        hireType: "hourly", rate: 100, fuelMode: "wet",
        hoursWorked: 1, minCalloutHours: -4,
      }),
      "BAD_REQUEST",
    );
    expect(anyDb.equipmentSpotHire.create).not.toHaveBeenCalled();
  });
});

// ─── listSpotHires ──────────────────────────────────────────────────────────
describe("equipmentSpotHire.listSpotHires", () => {
  it("scopes to the project, applies filters and sums the summary", async () => {
    member("engineer");
    anyDb.equipmentSpotHire.findMany.mockResolvedValue([
      ticket({ totalGross: 11000, fuelDeduction: 3200, netPayable: 7800, isBilled: true, hoursWorked: 5, tripCount: 0 }),
      ticket({ id: "tk-2", totalGross: 9000, fuelDeduction: 1000, netPayable: 8000, isBilled: false, hoursWorked: 4, tripCount: 0 }),
      ticket({ id: "tk-3", vendorName: "Kanchha Tractor", totalGross: 19500, fuelDeduction: 0, netPayable: 19500, isBilled: false, hoursWorked: 0, tripCount: 6 }),
    ]);
    // Summary rides DB aggregates over the filtered set (not the page rows):
    // call 1 = totals, call 2 = unbilled-only sum.
    anyDb.equipmentSpotHire.aggregate
      .mockResolvedValueOnce({
        _count: { _all: 2 },
        _sum: { hoursWorked: 4, tripCount: 6, totalGross: 28500, fuelDeduction: 1000, netPayable: 27500 },
      })
      .mockResolvedValueOnce({ _sum: { netPayable: 27500 } });

    const caller = createCaller(spotHireRouter, ENGINEER);
    const res = await caller.listSpotHires({ projectId: "p-1", isBilled: false });

    expect(anyDb.equipmentSpotHire.findMany.mock.calls[0][0].where).toEqual({
      projectId: "p-1",
      isBilled: false,
    });
    expect(anyDb.equipmentSpotHire.aggregate.mock.calls[0][0].where).toEqual({
      projectId: "p-1",
      isBilled: false,
    });
    expect(res.summary).toEqual({
      totalTickets: 2,
      totalHours: 4,
      totalTrips: 6,
      totalGross: 28500,
      totalFuelDeductions: 1000,
      totalNetPayable: 27500,
      unbilledAmount: 27500, // every listed ticket is unbilled
    });
  });

  it("vendorName filter becomes a case-insensitive contains", async () => {
    member("engineer");
    anyDb.equipmentSpotHire.findMany.mockResolvedValue([]);
    const caller = createCaller(spotHireRouter, ENGINEER);
    await caller.listSpotHires({ projectId: "p-1", vendorName: "sharma" });
    expect(anyDb.equipmentSpotHire.findMany.mock.calls[0][0].where).toEqual({
      projectId: "p-1",
      vendorName: { contains: "sharma", mode: "insensitive" },
    });
  });

  it("FORBIDDENs non-members", async () => {
    member(null);
    const caller = createCaller(spotHireRouter, ENGINEER);
    await expectTRPCError(
      caller.listSpotHires({ projectId: "p-1" }),
      "FORBIDDEN",
    );
    expect(anyDb.equipmentSpotHire.findMany).not.toHaveBeenCalled();
  });
});

// ─── getVendorHireStatement ─────────────────────────────────────────────────
describe("equipmentSpotHire.getVendorHireStatement", () => {
  it("groups tickets by trimmed+case-insensitive vendor name, sorted by unbilled exposure", async () => {
    member("engineer");
    anyDb.equipmentSpotHire.findMany.mockResolvedValue([
      ticket({ vendorName: "sharma equipment", netPayable: 7800, isBilled: true, totalGross: 11000, fuelDeduction: 3200, hoursWorked: 5, tripCount: 0 }),
      ticket({ id: "tk-2", vendorName: "Sharma Equipment ", netPayable: 8000, isBilled: false, totalGross: 9000, fuelDeduction: 1000, hoursWorked: 4, tripCount: 0 }),
      ticket({ id: "tk-3", vendorName: "Kanchha Tractor", netPayable: 19500, isBilled: false, totalGross: 19500, fuelDeduction: 0, hoursWorked: 0, tripCount: 6 }),
    ]);

    const caller = createCaller(spotHireRouter, ENGINEER);
    const res = await caller.getVendorHireStatement({ projectId: "p-1" });

    expect(res.statements).toHaveLength(2);
    // Kanchha has the larger unbilled exposure → listed first
    expect(res.statements[0].vendorName).toBe("Kanchha Tractor");
    expect(res.statements[0].unbilledAmount).toBe(19500);
    expect(res.statements[1].vendorName).toBe("sharma equipment");
    expect(res.statements[1]).toMatchObject({
      ticketCount: 2,
      totalGross: 20000,
      totalFuelDeductions: 4200,
      netPayable: 15800,
      unbilledAmount: 8000, // only the unbilled ticket
    });
  });

  it("FORBIDDENs non-members", async () => {
    member(null);
    const caller = createCaller(spotHireRouter, ENGINEER);
    await expectTRPCError(
      caller.getVendorHireStatement({ projectId: "p-1" }),
      "FORBIDDEN",
    );
  });
});

// ─── deleteSpotTicket ───────────────────────────────────────────────────────
describe("equipmentSpotHire.deleteSpotTicket", () => {
  it("deletes an unbilled, unlocked ticket in the authorized project", async () => {
    member("engineer");
    anyDb.equipmentSpotHire.findFirst.mockResolvedValue(
      ticket({ date: new Date("2026-08-01"), isBilled: false }),
    );
    const caller = createCaller(spotHireRouter, ENGINEER);
    const res = await caller.deleteSpotTicket({ projectId: "p-1", ticketId: "tk-1" });
    expect(res.success).toBe(true);

    // IDOR guard: lookup is scoped to the authorized project
    expect(anyDb.equipmentSpotHire.findFirst).toHaveBeenCalledWith({
      where: { id: "tk-1", projectId: "p-1" },
    });
    expect(anyDb.equipmentSpotHire.delete).toHaveBeenCalledWith({ where: { id: "tk-1" } });
  });

  it("NOT_FOUNDs tickets of another project (IDOR guard)", async () => {
    member("engineer");
    anyDb.equipmentSpotHire.findFirst.mockResolvedValue(null);
    const caller = createCaller(spotHireRouter, ENGINEER);
    await expectTRPCError(
      caller.deleteSpotTicket({ projectId: "p-1", ticketId: "tk-1" }),
      "NOT_FOUND",
    );
    expect(anyDb.equipmentSpotHire.delete).not.toHaveBeenCalled();
  });

  it("BAD_REQUESTs deleting a ticket that has already been billed", async () => {
    member("engineer");
    anyDb.equipmentSpotHire.findFirst.mockResolvedValue(
      ticket({ date: new Date("2026-08-01"), isBilled: true }),
    );
    const caller = createCaller(spotHireRouter, ENGINEER);
    await expectTRPCError(
      caller.deleteSpotTicket({ projectId: "p-1", ticketId: "tk-1" }),
      "BAD_REQUEST",
    );
    expect(anyDb.equipmentSpotHire.delete).not.toHaveBeenCalled();
  });

  it("FORBIDDENs deleting a back-dated ticket inside a locked fiscal year", async () => {
    member("engineer");
    anyDb.equipmentSpotHire.findFirst.mockResolvedValue(
      ticket({ date: new Date("2025-07-15"), isBilled: false }),
    );
    anyDb.fiscalYearLock.findFirst.mockResolvedValue({ fiscalYear: "2082-83" });
    const caller = createCaller(spotHireRouter, ENGINEER);
    await expectTRPCError(
      caller.deleteSpotTicket({ projectId: "p-1", ticketId: "tk-1" }),
      "FORBIDDEN",
    );
    expect(anyDb.equipmentSpotHire.delete).not.toHaveBeenCalled();

    // lock checked against the TICKET's date
    const where = anyDb.fiscalYearLock.findFirst.mock.calls[0][0].where;
    expect(where.endDate.gte).toEqual(new Date("2025-07-15"));
  });
});
