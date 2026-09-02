import { describe, it, expect, vi } from "vitest";
import { formatSequence, getNextSequenceNumber } from "./sequence-generator";

describe("Central Atomic Sequence & Voucher Generator", () => {
  describe("formatSequence pure helper", () => {
    it("formats standard 3-digit padded sequence", () => {
      expect(formatSequence("EXP", 5, 3)).toBe("EXP-005");
      expect(formatSequence("SUB-BILL", 12, 3)).toBe("SUB-BILL-012");
    });

    it("formats 4-digit padded sequence", () => {
      expect(formatSequence("PO", 1, 4)).toBe("PO-0001");
      expect(formatSequence("PR", 42, 4)).toBe("PR-0042");
    });

    it("formats extra segment like year or date", () => {
      expect(formatSequence("COR", 8, 4, "2081")).toBe("COR-2081-0008");
      expect(formatSequence("BT", 3, 3, "20260829")).toBe("BT-20260829-003");
      expect(formatSequence("RFI", 1, 3, "20260829")).toBe("RFI-20260829-001");
    });
  });

  describe("getNextSequenceNumber generator", () => {
    it("generates purchase order sequence PO-0001", async () => {
      const mockTx = {
        $queryRaw: vi.fn().mockResolvedValue([{ counter: 1 }]), // atomic upsert (P2 item 29)
        purchaseOrder: {
          count: vi.fn().mockResolvedValue(0),
        },
      };
      const seq = await getNextSequenceNumber("purchase_order", { projectId: "p-1" }, mockTx as any);
      expect(seq).toBe("PO-0001");
      // The counter rides an INSERT .. ON CONFLICT .. RETURNING statement.
      const sql = mockTx.$queryRaw.mock.calls[0][0].join("?");
      expect(sql).toContain("ON CONFLICT");
      expect(sql).toContain("RETURNING");
    });

    it("generates site expense sequence EXP-005 when 4 existing", async () => {
      const mockTx = {
        $queryRaw: vi.fn().mockResolvedValue([{ counter: 5 }]), // legacy init: 4 existing + 1
        siteExpense: {
          count: vi.fn().mockResolvedValue(4),
        },
      };
      const seq = await getNextSequenceNumber("site_expense", { projectId: "p-1" }, mockTx as any);
      expect(seq).toBe("EXP-005");
    });

    it("generates JV commission payout sequence JV-COMM-003", async () => {
      const mockTx = {
        $queryRaw: vi.fn().mockResolvedValue([{ counter: 3 }]),
        jvCommissionPayout: {
          count: vi.fn().mockResolvedValue(2),
        },
      };
      const seq = await getNextSequenceNumber("jv_payout", { agreementId: "agr-1" }, mockTx as any);
      expect(seq).toBe("JV-COMM-003");
    });

    it("generates journal entry sequence JE-2026-0001", async () => {
      const mockTx = {
        $queryRaw: vi.fn().mockResolvedValue([{ counter: 1 }]),
        journalEntry: {
          count: vi.fn().mockResolvedValue(0),
        },
      };
      const fixedDate = new Date("2026-08-29T10:00:00Z");
      const seq = await getNextSequenceNumber("journal_entry", { date: fixedDate }, mockTx as any);
      expect(seq).toBe("JE-2026-0001");
    });
  });
});
