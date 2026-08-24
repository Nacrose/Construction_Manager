/**
 * Pure helpers for the workflow module.
 *
 * Extracted from the tRPC routers so they can be unit-tested without
 * spinning up a database. The routers import these and add the I/O
 * layer (Prisma queries, audit logs, notifications).
 */

/**
 * MIME-type whitelist for attachment uploads (both RFI and Daily Report).
 *
 * Prevents upload of executable / script-bearing formats that could be
 * served back to other users as active content (XSS via SVG, HTML,
 * .exe, etc.).
 */
export const ALLOWED_ATTACHMENT_TYPES: ReadonlySet<string> = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
  "application/msword",
  "text/plain",
  "text/csv",
  "application/zip",
]);

/**
 * Returns true if the given MIME type is in the attachment whitelist.
 * Case-insensitive. Empty / null / undefined → false.
 */
export function isAllowedAttachmentType(fileType: string | null | undefined): boolean {
  if (!fileType) return false;
  return ALLOWED_ATTACHMENT_TYPES.has(fileType.toLowerCase());
}

/**
 * Build the idempotency-marker remarks prefix for a daily-report inventory
 * deduction.
 *
 * Both the submit path (`processReportSubmission` → `deductInventoryForReport`)
 * and the approval path (inline block in `updateReport`) need to recognize
 * each other's `MaterialTransaction.remarks` strings to avoid double-deducting
 * stock on a submit→approve cycle. Both paths write transactions whose
 * `remarks` field STARTS WITH this prefix. The approval path's idempotency
 * guard searches for `remarks contains "${prefix}"` — which now matches both
 * paths' output.
 *
 * @param reportNumber The DailyReport.number (e.g. "DR-2026-001")
 * @returns The exact substring that must appear in any deduction's remarks.
 */
export function dailyReportDeductionMarker(reportNumber: string): string {
  return `Auto-deducted from Daily Report ${reportNumber}`;
}

/**
 * Returns true if the given remarks string contains the idempotency marker
 * for the given report number. Used by the approval-path guard to detect
 * whether the submit-path already deducted materials for this report.
 */
export function isDailyReportDeduction(
  remarks: string | null | undefined,
  reportNumber: string
): boolean {
  if (!remarks) return false;
  return remarks.includes(dailyReportDeductionMarker(reportNumber));
}

/**
 * Map an RFI item array to a plain-object snapshot suitable for embedding
 * in an audit-log metadata field. Trims to just the fields needed for
 * historical reconstruction (BOQ linkage, quantity, unit, payment type).
 */
export function snapshotRfiItems(
  items: Array<Record<string, any>> | undefined | null
): Array<Record<string, any>> | undefined {
  if (!items || items.length === 0) return undefined;
  return items.map((i) => ({
    boqItemId: i.boqItemId ?? null,
    boqCode: i.boqCode ?? null,
    boqDesc: i.boqDesc ?? null,
    quantity: i.quantity ?? null,
    unit: i.unit ?? null,
    paymentType: i.paymentType ?? null,
  }));
}
