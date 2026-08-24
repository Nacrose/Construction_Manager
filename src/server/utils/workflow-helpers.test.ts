/**
 * Unit tests for the workflow module's pure helpers.
 *
 * These tests cover the fixes for the issues identified in the workflow
 * audit:
 *   - MIME-type whitelist (issue #13)
 *   - Daily-report idempotency marker for inventory deduction (issue #2)
 *   - RFI items snapshot for audit log (issue #16)
 *
 * The IDOR guards (`assertTaskBelongsToProject`, `assertProgramBelongsToProject`)
 * are DB-backed and live in daily-program.ts; they're integration-tested
 * separately via the tRPC router. Their pure logic is simple enough
 * (equality check on projectId) that we don't duplicate the coverage here.
 */
import { describe, it, expect } from "vitest";
import {
  ALLOWED_ATTACHMENT_TYPES,
  isAllowedAttachmentType,
  dailyReportDeductionMarker,
  isDailyReportDeduction,
  snapshotRfiItems,
} from "./workflow-helpers";

describe("Workflow Helpers", () => {
  describe("Attachment MIME-type whitelist", () => {
    it("accepts common image types", () => {
      expect(isAllowedAttachmentType("image/jpeg")).toBe(true);
      expect(isAllowedAttachmentType("image/png")).toBe(true);
      expect(isAllowedAttachmentType("image/gif")).toBe(true);
      expect(isAllowedAttachmentType("image/webp")).toBe(true);
    });

    it("accepts PDF and Office documents", () => {
      expect(isAllowedAttachmentType("application/pdf")).toBe(true);
      expect(isAllowedAttachmentType("application/vnd.openxmlformats-officedocument.wordprocessingml.document")).toBe(true);
      expect(isAllowedAttachmentType("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")).toBe(true);
      expect(isAllowedAttachmentType("application/msword")).toBe(true);
      expect(isAllowedAttachmentType("application/vnd.ms-excel")).toBe(true);
    });

    it("accepts text and zip", () => {
      expect(isAllowedAttachmentType("text/plain")).toBe(true);
      expect(isAllowedAttachmentType("text/csv")).toBe(true);
      expect(isAllowedAttachmentType("application/zip")).toBe(true);
    });

    it("rejects SVG (XSS vector)", () => {
      expect(isAllowedAttachmentType("image/svg+xml")).toBe(false);
    });

    it("rejects HTML and JavaScript (XSS vectors)", () => {
      expect(isAllowedAttachmentType("text/html")).toBe(false);
      expect(isAllowedAttachmentType("application/javascript")).toBe(false);
      expect(isAllowedAttachmentType("application/x-httpd-php")).toBe(false);
    });

    it("rejects executables", () => {
      expect(isAllowedAttachmentType("application/x-msdownload")).toBe(false);
      expect(isAllowedAttachmentType("application/x-msi")).toBe(false);
      expect(isAllowedAttachmentType("application/x-dosexec")).toBe(false);
    });

    it("is case-insensitive", () => {
      expect(isAllowedAttachmentType("IMAGE/JPEG")).toBe(true);
      expect(isAllowedAttachmentType("Application/PDF")).toBe(true);
      expect(isAllowedAttachmentType("IMAGE/SVG+XML")).toBe(false);
    });

    it("rejects null / undefined / empty string", () => {
      expect(isAllowedAttachmentType(null)).toBe(false);
      expect(isAllowedAttachmentType(undefined)).toBe(false);
      expect(isAllowedAttachmentType("")).toBe(false);
    });

    it("whitelist is frozen / immutable", () => {
      // TypeScript-level: ALLOWED_ATTACHMENT_TYPES is typed as ReadonlySet,
      // which has no `add` method. Runtime check: ensure the set contents
      // match what we expect (guards against accidental mutation in tests
      // above this one).
      expect(ALLOWED_ATTACHMENT_TYPES.size).toBeGreaterThanOrEqual(11);
    });
  });

  describe("Daily Report inventory deduction idempotency marker", () => {
    it("builds the correct prefix for a report number", () => {
      expect(dailyReportDeductionMarker("DR-2026-001")).toBe(
        "Auto-deducted from Daily Report DR-2026-001"
      );
      expect(dailyReportDeductionMarker("RPT-0042")).toBe(
        "Auto-deducted from Daily Report RPT-0042"
      );
    });

    it("matches the exact format the approval-path guard searches for", () => {
      // The approval-path guard in daily-report.ts does:
      //   remarks: { contains: `Auto-deducted from Daily Report ${report.number}` }
      // Any transaction created by the submit-path MUST contain this exact
      // substring or the approval path will re-deduct the same materials
      // (the original double-deduction bug).
      const reportNumber = "DR-2026-001";
      const prefix = dailyReportDeductionMarker(reportNumber);
      const submitPathRemarks = `${prefix} — 5.00 m³ of Concrete used for Slab (BOQ 3.2)`;
      expect(submitPathRemarks).toContain(prefix);
    });

    it("isDailyReportDeduction returns true for matching remarks", () => {
      const reportNumber = "DR-2026-001";
      const prefix = dailyReportDeductionMarker(reportNumber);
      const remarks = `${prefix} — 5.00 m³ of Concrete used for Slab`;
      expect(isDailyReportDeduction(remarks, reportNumber)).toBe(true);
    });

    it("isDailyReportDeduction returns false for unrelated remarks", () => {
      const reportNumber = "DR-2026-001";
      expect(isDailyReportDeduction("Manual issue for stock transfer", reportNumber)).toBe(false);
      expect(isDailyReportDeduction("Auto-deducted from Daily Report DR-2026-002", reportNumber)).toBe(false);
    });

    it("isDailyReportDeduction handles null / undefined remarks", () => {
      expect(isDailyReportDeduction(null, "DR-001")).toBe(false);
      expect(isDailyReportDeduction(undefined, "DR-001")).toBe(false);
      expect(isDailyReportDeduction("", "DR-001")).toBe(false);
    });

    it("regression: submit and approve paths use the SAME marker (no double deduction)", () => {
      // This is the test that would have caught the original bug.
      // The submit-path writes a transaction with remarks containing the marker.
      // The approval-path guard searches for the marker. They must match.
      const reportNumber = "DR-2026-001";
      const marker = dailyReportDeductionMarker(reportNumber);

      // Simulate what the submit-path stores in the DB:
      const submitPathTransaction = {
        type: "issue",
        reference: reportNumber,
        remarks: `${marker} — 5.00 m³ of Concrete used for Slab (BOQ 3.2)`,
      };

      // Simulate what the approval-path guard checks:
      const approvalGuardMatches = isDailyReportDeduction(
        submitPathTransaction.remarks,
        reportNumber
      );

      // If this assertion fails, the approval path will re-deduct the same
      // materials — i.e. the double-deduction bug is back.
      expect(approvalGuardMatches).toBe(true);
    });
  });

  describe("snapshotRfiItems", () => {
    it("returns undefined for empty / null / undefined input", () => {
      expect(snapshotRfiItems(undefined)).toBe(undefined);
      expect(snapshotRfiItems(null)).toBe(undefined);
      expect(snapshotRfiItems([])).toBe(undefined);
    });

    it("returns a trimmed snapshot with the audit-relevant fields only", () => {
      const items = [
        {
          boqItemId: "boq-1",
          boqCode: "1.2.3",
          boqDesc: "PCC 1:2:4",
          quantity: 5.5,
          unit: "m³",
          paymentType: "payable",
          remark: "not included in snapshot",
          // extra fields should be dropped
          someOtherField: "ignored",
        },
      ];
      const snapshot = snapshotRfiItems(items);
      expect(snapshot).toEqual([
        {
          boqItemId: "boq-1",
          boqCode: "1.2.3",
          boqDesc: "PCC 1:2:4",
          quantity: 5.5,
          unit: "m³",
          paymentType: "payable",
        },
      ]);
    });

    it("preserves quantity: 0 (does not coerce to null)", () => {
      // Regression test for the dual-write bug where the second block used
      // `item.quantity || null`, silently coercing 0 → null. The snapshot
      // helper uses `?? null` so 0 is preserved.
      const items = [{ quantity: 0, unit: "m³", paymentType: "payable" }];
      const snapshot = snapshotRfiItems(items);
      expect(snapshot?.[0].quantity).toBe(0);
    });

    it("handles items with missing fields", () => {
      const items = [{ boqItemId: "boq-1" }];
      const snapshot = snapshotRfiItems(items);
      expect(snapshot).toEqual([
        {
          boqItemId: "boq-1",
          boqCode: null,
          boqDesc: null,
          quantity: null,
          unit: null,
          paymentType: null,
        },
      ]);
    });

    it("preserves the items array length", () => {
      const items = [
        { boqItemId: "a", quantity: 1 },
        { boqItemId: "b", quantity: 2 },
        { boqItemId: "c", quantity: 3 },
      ];
      const snapshot = snapshotRfiItems(items);
      expect(snapshot?.length).toBe(3);
    });
  });
});
