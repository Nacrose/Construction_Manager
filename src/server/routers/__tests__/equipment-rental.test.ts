/**
 * Router-layer tests for equipment-rental.ts (rentals, crew, stats).
 *
 * The rental/crew procedures are a plain procedure map mounted on the
 * equipment router; we wrap them in a local router for createCaller.
 *
 * Pins:
 *   - listRentals: org scoping (projectId+status where); billable-days and
 *     cost math per status (active accrues to today, stored stops at
 *     storedFromDate, returned stops at actualReturnDate); crew daily-cost
 *     conversions (monthly/30, hourly×8, per-diem, lump_sum→0) split into
 *     project-paid vs vendor-paid; daysStored/daysOverdue flags
 *   - createRental: fiscal-lock uses the START date (back-dating blocked
 *     BEFORE any write); duplicate active/stored rental on the same
 *     project rejected; equipment must belong to the rental's project
 *     (cross-project guard — otherwise a project-A writer flips the status
 *     of project-B equipment); negative rates rejected (zod)
 *   - markStored: active-only transition; freezes billable days + cost;
 *     equipment goes idle
 *   - markReturned: from active (bill to return date) and from stored
 *     (bill only to storedFromDate — storage is not billed); back-dated
 *     return before start clamps to 0; an ALREADY-RETURNED rental cannot
 *     be re-returned (closed money records are immutable)
 *   - reactivate: stored-only; recomputes the frozen segment to the stored
 *     date; equipment back to active
 *   - rentalStats: cost aggregation, per-status counts, daily accruing
 *     rate, stored-too-long (>7d) savings hint
 *   - crew CRUD: rental-scope authorization through the rental's project
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
import { equipmentRentalProcedures } from "../equipment-rental";

const rentalRouter = router({ ...equipmentRentalProcedures });

const anyDb = db as any;
const ENGINEER = buildUser();

function member(role: string | null) {
  anyDb.projectMember.findUnique.mockResolvedValue(role ? { role } : null);
}

const DAY = 86400000;
/** Date exactly `n` days before "now" (whole days → stable rounding). */
const daysAgo = (n: number) => new Date(Date.now() - n * DAY);

function rental(overrides: Record<string, unknown> = {}) {
  return {
    id: "rent-1",
    equipmentId: "eq-1",
    projectId: "p-1",
    rentalRate: 5000,
    rentalType: "daily",
    startDate: daysAgo(10),
    scheduledEndDate: null,
    storedFromDate: null,
    actualReturnDate: null,
    status: "active",
    notes: null,
    crew: [],
    ...overrides,
  };
}

beforeEach(() => {
  vi.resetAllMocks();
});

// ─── listRentals ────────────────────────────────────────────────────────────
describe("equipment.listRentals", () => {
  it("scopes the query to the project and passes the status filter", async () => {
    member("engineer");
    anyDb.equipmentRental.findMany.mockResolvedValue([]);
    const caller = createCaller(rentalRouter, ENGINEER);

    await caller.listRentals({ projectId: "p-1" });
    expect(anyDb.equipmentRental.findMany.mock.calls[0][0].where).toEqual({ projectId: "p-1" });

    await caller.listRentals({ projectId: "p-1", status: "active" });
    expect(anyDb.equipmentRental.findMany.mock.calls[1][0].where).toEqual({
      projectId: "p-1",
      status: "active",
    });
  });

  it("FORBIDDENs non-members", async () => {
    member(null);
    const caller = createCaller(rentalRouter, ENGINEER);
    await expectTRPCError(caller.listRentals({ projectId: "p-1" }), "FORBIDDEN");
    expect(anyDb.equipmentRental.findMany).not.toHaveBeenCalled();
  });

  it("accrues an active rental to today: days×rate + crew costs", async () => {
    member("engineer");
    anyDb.equipmentRental.findMany.mockResolvedValue([
      rental({
        startDate: daysAgo(10),
        rentalRate: 5000,
        crew: [
          {
            // monthly NPR 30,000 → 1000/day, project-paid
            salaryType: "monthly", salaryRate: 30000, salaryPaidBy: "project",
            allowanceType: "daily", allowanceRate: 200, allowancePaidBy: "project",
            lodgingType: "monthly_reimburse", lodgingRate: 6000, lodgingPaidBy: "vendor",
            foodingType: "daily_allowance", foodingRate: 150, foodingPaidBy: "project",
          },
        ],
      }),
    ]);

    const caller = createCaller(rentalRouter, ENGINEER);
    const res = await caller.listRentals({ projectId: "p-1" });
    const r = res.rentals[0];

    expect(r.billableDays).toBe(10);
    expect(r.machineCost).toBe(50000);
    // crew daily: 1000 (salary) + 200 (allowance) + 150 (fooding) = 1350 project
    //             6000/30 = 200 lodging vendor
    expect(r.crewDailyCost).toBe(1350);
    expect(r.crewDailyCostVendor).toBe(200);
    expect(r.totalProjectCost).toBe(50000 + 1350 * 10);
    expect(r.totalDailyRate).toBe(5000 + 1350);
    expect(r.isCurrentlyAccruing).toBe(true);
    expect(r.daysStored).toBe(0);
  });

  it("converts hourly crew at ×8 and ignores lump_sum crew rates", async () => {
    member("engineer");
    anyDb.equipmentRental.findMany.mockResolvedValue([
      rental({
        startDate: daysAgo(5),
        rentalRate: 1000,
        crew: [
          { salaryType: "hourly", salaryRate: 250, salaryPaidBy: "project" },
          { salaryType: "monthly", salaryRate: 30000, salaryPaidBy: "vendor" },
          { salaryType: "lump_sum", salaryRate: 99999, salaryPaidBy: "project" },
        ],
      }),
    ]);

    const caller = createCaller(rentalRouter, ENGINEER);
    const res = await caller.listRentals({ projectId: "p-1" });
    const r = res.rentals[0];

    expect(r.crewDailyCost).toBe(2000); // 250×8 only (lump_sum → 0)
    expect(r.crewDailyCostVendor).toBe(1000); // 30000/30
    expect(r.machineCost).toBe(5000);
    expect(r.totalProjectCost).toBe(5000 + 2000 * 5);
  });

  it("stops billing stored rentals at storedFromDate and reports storage + overdue", async () => {
    member("engineer");
    anyDb.equipmentRental.findMany.mockResolvedValue([
      rental({
        status: "stored_on_site",
        startDate: daysAgo(20),
        storedFromDate: daysAgo(10),
        scheduledEndDate: daysAgo(2),
        rentalRate: 3000,
      }),
    ]);

    const caller = createCaller(rentalRouter, ENGINEER);
    const res = await caller.listRentals({ projectId: "p-1" });
    const r = res.rentals[0];

    expect(r.billableDays).toBe(10); // start → storedFromDate, not today
    expect(r.machineCost).toBe(30000);
    expect(r.daysStored).toBe(10);
    expect(r.daysOverdue).toBe(2); // scheduled end passed while not returned
    expect(r.isCurrentlyAccruing).toBe(false);
  });

  it("stops billing returned rentals at actualReturnDate (no overdue flag)", async () => {
    member("engineer");
    const start = daysAgo(12);
    anyDb.equipmentRental.findMany.mockResolvedValue([
      rental({
        status: "returned",
        startDate: start,
        actualReturnDate: new Date(start.getTime() + 6 * DAY),
        scheduledEndDate: daysAgo(1),
        rentalRate: 2000,
      }),
    ]);

    const caller = createCaller(rentalRouter, ENGINEER);
    const res = await caller.listRentals({ projectId: "p-1" });
    const r = res.rentals[0];
    expect(r.billableDays).toBe(6);
    expect(r.machineCost).toBe(12000);
    expect(r.daysOverdue).toBe(0); // returned rentals are never overdue
  });
});

// ─── createRental ───────────────────────────────────────────────────────────
describe("equipment.createRental", () => {
  const baseInput = {
    equipmentId: "eq-1",
    projectId: "p-1",
    rentalType: "daily" as const,
    rentalRate: 5000,
  };

  it("creates the rental and flags the equipment active", async () => {
    member("engineer");
    anyDb.equipment.findFirst.mockResolvedValue({ id: "eq-1" });
    anyDb.equipmentRental.findFirst.mockResolvedValue(null); // no duplicate
    anyDb.equipment.findUnique.mockResolvedValue({ id: "eq-1", status: "idle", projectId: "p-1" });

    const caller = createCaller(rentalRouter, ENGINEER);
    await caller.createRental(baseInput);

    const data = anyDb.equipmentRental.create.mock.calls[0][0].data;
    expect(data).toMatchObject({
      equipmentId: "eq-1",
      projectId: "p-1",
      rentalType: "daily",
      rentalRate: 5000,
      createdById: ENGINEER.id,
    });
    expect(data.startDate).toBeInstanceOf(Date);
    // Engine cascade: idle → active (guarded, CAS updateMany)
    expect(anyDb.equipment.updateMany).toHaveBeenCalledWith({
      where: { id: "eq-1", status: "idle" },
      data: expect.objectContaining({ status: "active" }),
    });
  });

  it("FORBIDDENs a start date inside a LOCKED fiscal year BEFORE any write", async () => {
    member("engineer");
    anyDb.fiscalYearLock.findFirst.mockResolvedValue({ fiscalYear: "2082-83" });
    const caller = createCaller(rentalRouter, ENGINEER);

    await expectTRPCError(
      caller.createRental({ ...baseInput, startDate: new Date("2025-07-01").toISOString() }),
      "FORBIDDEN",
    );
    expect(anyDb.equipmentRental.create).not.toHaveBeenCalled();
    expect(anyDb.equipment.update).not.toHaveBeenCalled();

    // the lock must be checked for the START date, not "today"
    const where = anyDb.fiscalYearLock.findFirst.mock.calls[0][0].where;
    expect(where.isLocked).toBe(true);
    expect(where.endDate.gte).toEqual(new Date("2025-07-01"));
  });

  it("BAD_REQUESTs a duplicate ACTIVE rental for the same equipment+project", async () => {
    member("engineer");
    anyDb.equipment.findFirst.mockResolvedValue({ id: "eq-1" });
    anyDb.equipmentRental.findFirst.mockResolvedValue(rental({ status: "active" }));
    const caller = createCaller(rentalRouter, ENGINEER);

    await expectTRPCError(caller.createRental(baseInput), "BAD_REQUEST");
    expect(anyDb.equipmentRental.create).not.toHaveBeenCalled();

    // stored_on_site is equally blocking
    anyDb.equipmentRental.findFirst.mockResolvedValue(rental({ status: "stored_on_site" }));
    await expectTRPCError(caller.createRental(baseInput), "BAD_REQUEST");
  });

  it("NOT_FOUNDs equipment belonging to ANOTHER project (cross-project guard)", async () => {
    member("engineer");
    anyDb.equipment.findFirst.mockResolvedValue(null); // eq-1 not in p-1
    anyDb.equipmentRental.findFirst.mockResolvedValue(null);
    const caller = createCaller(rentalRouter, ENGINEER);

    await expectTRPCError(caller.createRental(baseInput), "NOT_FOUND");
    expect(anyDb.equipmentRental.create).not.toHaveBeenCalled();
    // the other project's equipment status must never be flipped
    expect(anyDb.equipment.updateMany).not.toHaveBeenCalled();
  });

  it("FORBIDDENs read-only roles and rejects negative rates (zod)", async () => {
    member("client");
    const caller = createCaller(rentalRouter, ENGINEER);
    await expectTRPCError(caller.createRental(baseInput), "FORBIDDEN");
    expect(anyDb.equipmentRental.create).not.toHaveBeenCalled();

    member("engineer");
    await expectTRPCError(
      caller.createRental({ ...baseInput, rentalRate: -1 }),
      "BAD_REQUEST",
    );
    expect(anyDb.equipmentRental.create).not.toHaveBeenCalled();
  });
});

// ─── markStored / markReturned / reactivate (status machine) ────────────────
describe("rental status machine", () => {
  it("markStored freezes billable days + cost and idles the equipment", async () => {
    member("engineer");
    anyDb.equipmentRental.findUnique.mockResolvedValue(
      rental({ startDate: daysAgo(12), rentalRate: 5000 }),
    );
    anyDb.equipment.findUnique.mockResolvedValue({ id: "eq-1", status: "active", projectId: "p-1" });
    const caller = createCaller(rentalRouter, ENGINEER);
    await caller.markStored({ rentalId: "rent-1", notes: "work done" });

    // Engine transition: CAS updateMany on the pre-read status
    const call = anyDb.equipmentRental.updateMany.mock.calls[0][0];
    expect(call.where).toEqual({ id: "rent-1", status: "active" });
    const data = call.data;
    expect(data.status).toBe("stored_on_site");
    expect(data.storedFromDate).toBeInstanceOf(Date);
    expect(data.totalBillableDays).toBe(12);
    expect(data.totalRentalCost).toBe(60000);
    expect(data.notes).toContain("[Stored] work done");
    expect(anyDb.equipment.updateMany).toHaveBeenCalledWith({
      where: { id: "eq-1", status: "active" },
      data: expect.objectContaining({ status: "idle" }),
    });
  });

  it("markStored BAD_REQUESTs non-active rentals and NOT_FOUNDs unknown ids", async () => {
    member("engineer");
    anyDb.equipmentRental.findUnique.mockResolvedValue(rental({ status: "returned" }));
    const caller = createCaller(rentalRouter, ENGINEER);
    await expectTRPCError(caller.markStored({ rentalId: "rent-1" }), "BAD_REQUEST");
    expect(anyDb.equipmentRental.updateMany).not.toHaveBeenCalled();

    anyDb.equipmentRental.findUnique.mockResolvedValue(null);
    await expectTRPCError(caller.markStored({ rentalId: "nope" }), "NOT_FOUND");
  });

  it("markStored FORBIDDENs rentals of another project (cross-project IDOR)", async () => {
    anyDb.equipmentRental.findUnique.mockResolvedValue(rental({ projectId: "p-2" }));
    member(null); // no membership in p-2
    const caller = createCaller(rentalRouter, ENGINEER);
    await expectTRPCError(caller.markStored({ rentalId: "rent-1" }), "FORBIDDEN");
    expect(anyDb.equipmentRental.updateMany).not.toHaveBeenCalled();
  });

  it("markReturned from ACTIVE bills to the return date", async () => {
    member("engineer");
    const start = daysAgo(8);
    anyDb.equipmentRental.findUnique.mockResolvedValue(
      rental({ startDate: start, rentalRate: 4000 }),
    );
    const caller = createCaller(rentalRouter, ENGINEER);
    const returnDate = new Date(start.getTime() + 8 * DAY);
    await caller.markReturned({
      rentalId: "rent-1",
      actualReturnDate: returnDate.toISOString(),
    });

    // Engine transition: CAS updateMany on the pre-read status
    const data = anyDb.equipmentRental.updateMany.mock.calls[0][0].data;
    expect(data.status).toBe("returned");
    expect(data.actualReturnDate).toEqual(returnDate);
    expect(data.totalBillableDays).toBe(8);
    expect(data.totalRentalCost).toBe(32000);
  });

  it("markReturned from STORED bills only up to storedFromDate (storage not billed)", async () => {
    member("engineer");
    anyDb.equipmentRental.findUnique.mockResolvedValue(
      rental({
        status: "stored_on_site",
        startDate: daysAgo(20),
        storedFromDate: daysAgo(10),
        rentalRate: 3000,
      }),
    );
    const caller = createCaller(rentalRouter, ENGINEER);
    await caller.markReturned({ rentalId: "rent-1" });

    const data = anyDb.equipmentRental.updateMany.mock.calls[0][0].data;
    expect(data.totalBillableDays).toBe(10); // start → stored, not today
    expect(data.totalRentalCost).toBe(30000);
    expect(data.status).toBe("returned");
  });

  it("markReturned clamps a back-dated return before the start to 0 days", async () => {
    member("engineer");
    const start = daysAgo(5);
    anyDb.equipmentRental.findUnique.mockResolvedValue(rental({ startDate: start }));
    const caller = createCaller(rentalRouter, ENGINEER);
    await caller.markReturned({
      rentalId: "rent-1",
      actualReturnDate: new Date(start.getTime() - 3 * DAY).toISOString(),
    });
    const data = anyDb.equipmentRental.updateMany.mock.calls[0][0].data;
    expect(data.totalBillableDays).toBe(0);
    expect(data.totalRentalCost).toBe(0);
  });

  it("markReturned BAD_REQUESTs an ALREADY-RETURNED rental (closed records immutable)", async () => {
    member("engineer");
    anyDb.equipmentRental.findUnique.mockResolvedValue(rental({ status: "returned" }));
    const caller = createCaller(rentalRouter, ENGINEER);
    await expectTRPCError(caller.markReturned({ rentalId: "rent-1" }), "BAD_REQUEST");
    expect(anyDb.equipmentRental.updateMany).not.toHaveBeenCalled();
    expect(anyDb.equipment.updateMany).not.toHaveBeenCalled();
  });

  it("reactivate is stored-only and recomputes the frozen segment to the stored date", async () => {
    member("engineer");
    anyDb.equipmentRental.findUnique.mockResolvedValue(
      rental({
        status: "stored_on_site",
        startDate: daysAgo(20),
        storedFromDate: daysAgo(8),
        rentalRate: 1000,
      }),
    );
    anyDb.equipment.findUnique.mockResolvedValue({ id: "eq-1", status: "idle", projectId: "p-1" });
    const caller = createCaller(rentalRouter, ENGINEER);
    await caller.reactivate({ rentalId: "rent-1" });

    // Engine transition: CAS updateMany on the pre-read status
    const call = anyDb.equipmentRental.updateMany.mock.calls[0][0];
    expect(call.where).toEqual({ id: "rent-1", status: "stored_on_site" });
    const data = call.data;
    expect(data.status).toBe("active");
    expect(data.totalBillableDays).toBe(12); // start → storedFromDate
    expect(data.totalRentalCost).toBe(12000);
    expect(anyDb.equipment.updateMany).toHaveBeenCalledWith({
      where: { id: "eq-1", status: "idle" }, // the MACHINE was idle, not the rental
      data: expect.objectContaining({ status: "active" }),
    });

    // active rentals cannot be reactivated
    anyDb.equipmentRental.findUnique.mockResolvedValue(rental({ status: "active" }));
    await expectTRPCError(caller.reactivate({ rentalId: "rent-1" }), "BAD_REQUEST");
  });
});

// ─── rentalStats ────────────────────────────────────────────────────────────
describe("equipment.rentalStats", () => {
  it("aggregates cost, status counts, accruing rate and stored-too-long savings", async () => {
    member("engineer");
    anyDb.equipmentRental.findMany.mockResolvedValue([
      rental({ id: "r-a", startDate: daysAgo(10), rentalRate: 5000, status: "active", equipment: { name: "Excavator", code: "EX-1" } }),
      rental({
        id: "r-b", startDate: daysAgo(30), storedFromDate: daysAgo(10),
        rentalRate: 2000, status: "stored_on_site", equipment: { name: "Roller", code: "RL-1" },
      }),
      rental({
        id: "r-c", startDate: daysAgo(5), actualReturnDate: daysAgo(2),
        rentalRate: 1000, status: "returned", equipment: { name: "Pump", code: "PP-1" },
      }),
    ]);

    const caller = createCaller(rentalRouter, ENGINEER);
    const res = await caller.rentalStats({ projectId: "p-1" });

    expect(res.totalRentalCost).toBe(50000 + 40000 + 3000); // 10d + 20d + 3d
    expect(res.activeCount).toBe(1);
    expect(res.storedCount).toBe(1);
    expect(res.returnedCount).toBe(1);
    expect(res.dailyAccruing).toBe(5000); // active rentals only
    expect(res.storedTooLong).toHaveLength(1);
    expect(res.storedTooLong[0]).toMatchObject({
      id: "r-b",
      daysStored: 10,
      dailyRate: 2000,
      potentialSavings: 20000, // 10 stored days × rate
    });
  });
});

// ─── crew CRUD ──────────────────────────────────────────────────────────────
describe("equipment crew", () => {
  it("addCrew creates the crew member against the rental's project scope", async () => {
    member("engineer");
    anyDb.equipmentRental.findUnique.mockResolvedValue({ projectId: "p-1" });
    const caller = createCaller(rentalRouter, ENGINEER);
    await caller.addCrew({
      rentalId: "rent-1",
      name: "Hari Operator",
      role: "operator",
      salaryType: "daily",
      salaryRate: 1500,
      salaryPaidBy: "project",
    });

    const data = anyDb.equipmentCrew.create.mock.calls[0][0].data;
    expect(data).toMatchObject({
      rentalId: "rent-1",
      name: "Hari Operator",
      role: "operator",
      salaryType: "daily",
      salaryRate: 1500,
      salaryPaidBy: "project",
    });
  });

  it("addCrew NOT_FOUNDs unknown rentals and FORBIDDENs other-project rentals", async () => {
    member("engineer");
    anyDb.equipmentRental.findUnique.mockResolvedValue(null);
    const caller = createCaller(rentalRouter, ENGINEER);
    await expectTRPCError(
      caller.addCrew({ rentalId: "nope", name: "X" }),
      "NOT_FOUND",
    );

    anyDb.equipmentRental.findUnique.mockResolvedValue({ projectId: "p-2" });
    member(null);
    await expectTRPCError(
      caller.addCrew({ rentalId: "rent-1", name: "X" }),
      "FORBIDDEN",
    );
    expect(anyDb.equipmentCrew.create).not.toHaveBeenCalled();
  });

  it("listCrew requires membership in the rental's project and scopes by rentalId", async () => {
    member("engineer");
    anyDb.equipmentRental.findUnique.mockResolvedValue({ projectId: "p-1" });
    anyDb.equipmentCrew.findMany.mockResolvedValue([]);
    const caller = createCaller(rentalRouter, ENGINEER);
    await caller.listCrew({ rentalId: "rent-1" });

    expect(anyDb.equipmentCrew.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { rentalId: "rent-1" } }),
    );

    anyDb.equipmentRental.findUnique.mockResolvedValue({ projectId: "p-2" });
    member(null);
    await expectTRPCError(caller.listCrew({ rentalId: "rent-1" }), "FORBIDDEN");
  });

  it("updateCrew authorizes through crew.rental.projectId and converts endDate", async () => {
    member("engineer");
    anyDb.equipmentCrew.findUnique.mockResolvedValue({
      id: "crew-1",
      rental: { projectId: "p-1" },
    });
    const caller = createCaller(rentalRouter, ENGINEER);
    await caller.updateCrew({
      crewId: "crew-1",
      salaryRate: 1800,
      endDate: "2026-08-01T00:00:00.000Z",
    });

    const data = anyDb.equipmentCrew.update.mock.calls[0][0].data;
    expect(data.salaryRate).toBe(1800);
    expect(data.endDate).toEqual(new Date("2026-08-01T00:00:00.000Z"));

    // clearing the end date re-activates the crew member
    await caller.updateCrew({ crewId: "crew-1", endDate: null });
    expect(anyDb.equipmentCrew.update.mock.calls[1][0].data.endDate).toBeNull();
  });

  it("updateCrew/removeCrew FORBIDDENs crew on another project's rental", async () => {
    anyDb.equipmentCrew.findUnique.mockResolvedValue({
      id: "crew-1",
      rental: { projectId: "p-2" },
    });
    member(null);
    const caller = createCaller(rentalRouter, ENGINEER);
    await expectTRPCError(
      caller.updateCrew({ crewId: "crew-1", name: "X" }),
      "FORBIDDEN",
    );
    await expectTRPCError(caller.removeCrew({ crewId: "crew-1" }), "FORBIDDEN");
    expect(anyDb.equipmentCrew.update).not.toHaveBeenCalled();
    expect(anyDb.equipmentCrew.delete).not.toHaveBeenCalled();
  });

  it("removeCrew deletes a crew member in the authorized project", async () => {
    member("engineer");
    anyDb.equipmentCrew.findUnique.mockResolvedValue({
      id: "crew-1",
      rental: { projectId: "p-1" },
    });
    const caller = createCaller(rentalRouter, ENGINEER);
    const res = await caller.removeCrew({ crewId: "crew-1" });
    expect(res.ok).toBe(true);
    expect(anyDb.equipmentCrew.delete).toHaveBeenCalledWith({ where: { id: "crew-1" } });
  });
});
