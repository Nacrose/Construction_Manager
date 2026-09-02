/**
 * Central Atomic Sequence & Voucher Number Generator
 *
 * Provides standardized, collision-resistant document and voucher sequence numbering
 * across all construction operational and financial modules.
 *
 * ATOMICITY (audit P2 item 29): numbers come from the DocumentSequence
 * table, incremented with INSERT .. ON CONFLICT .. UPDATE .. RETURNING — a
 * single atomic statement, run inside the caller's transaction when one is
 * supplied (txDb). The previous implementation derived the next number from
 * count()+1 on the target table, which produced duplicate-number P2002s
 * under concurrent creation across ~20 document types.
 *
 * LEGACY COMPATIBILITY: the first call for a given (docType, scopeKey)
 * initializes the counter from the existing row count (+1), so documents
 * numbered by the old scheme continue without gaps or collisions.
 */
import { format } from "date-fns";
import { randomUUID } from "node:crypto";
import { db as defaultDb } from "@/lib/db";

export type SequenceType =
  | "purchase_order"
  | "purchase_requisition"
  | "site_expense"
  | "subcontractor_bill"
  | "gate_pass"
  | "batch_ticket"
  | "correspondence"
  | "rfi"
  | "jv_payout"
  | "journal_entry"
  | "payment_voucher";

export type SequenceOptions = {
  projectId?: string;
  agreementId?: string;
  date?: Date;
  customPrefix?: string;
  padding?: number;
};

/**
 * Format a structured sequence number string from its components.
 */
export function formatSequence(
  prefix: string,
  counter: number,
  padding: number = 3,
  extraSegment?: string
): string {
  const paddedNumber = String(Math.max(1, counter)).padStart(padding, "0");
  if (extraSegment) {
    return `${prefix}-${extraSegment}-${paddedNumber}`;
  }
  return `${prefix}-${paddedNumber}`;
}

/**
 * Atomically increment and return the next counter for (docType, scopeKey).
 * The INSERT branch initializes from the caller-provided legacy count so
 * pre-existing document numbers are respected; every later call takes the
 * ON CONFLICT branch (a lock-serialized +1).
 */
async function nextCounter(
  docType: string,
  scopeKey: string,
  legacyCount: number,
  txDb: any
): Promise<number> {
  const rows: Array<{ counter: number }> =
    await txDb.$queryRaw`
      INSERT INTO "DocumentSequence" ("id", "docType", "scopeKey", "counter")
      VALUES (${randomUUID()}, ${docType}, ${scopeKey}, ${legacyCount + 1})
      ON CONFLICT ("docType", "scopeKey")
      DO UPDATE SET "counter" = "DocumentSequence"."counter" + 1
      RETURNING "counter"
    `;
  return Number(rows[0]?.counter ?? 1);
}

/**
 * Generate the next sequence number for a given document type in an atomic or transactional context.
 */
export async function getNextSequenceNumber(
  type: SequenceType,
  opts?: SequenceOptions,
  txDb: any = defaultDb
): Promise<string> {
  const targetDate = opts?.date ?? new Date();
  const yearStr = String(targetDate.getFullYear());
  const dateStr = format(targetDate, "yyyyMMdd");

  switch (type) {
    case "purchase_order": {
      const scopeKey = `project:${opts?.projectId ?? "global"}`;
      const n = await nextCounter(type, scopeKey,
        await txDb.purchaseOrder.count({ where: opts?.projectId ? { projectId: opts.projectId } : {} }), txDb);
      return formatSequence(opts?.customPrefix ?? "PO", n, opts?.padding ?? 4);
    }

    case "purchase_requisition": {
      const scopeKey = `project:${opts?.projectId ?? "global"}`;
      const n = await nextCounter(type, scopeKey,
        await txDb.materialRequisition.count({ where: opts?.projectId ? { projectId: opts.projectId } : {} }), txDb);
      return formatSequence(opts?.customPrefix ?? "PR", n, opts?.padding ?? 4);
    }

    case "site_expense": {
      const scopeKey = `project:${opts?.projectId ?? "global"}`;
      const n = await nextCounter(type, scopeKey,
        await txDb.siteExpense.count({ where: opts?.projectId ? { projectId: opts.projectId } : {} }), txDb);
      return formatSequence(opts?.customPrefix ?? "EXP", n, opts?.padding ?? 3);
    }

    case "subcontractor_bill": {
      const scopeKey = `project:${opts?.projectId ?? "global"}`;
      const n = await nextCounter(type, scopeKey,
        await txDb.subcontractorBill.count({ where: opts?.projectId ? { projectId: opts.projectId } : {} }), txDb);
      return formatSequence(opts?.customPrefix ?? "SUB-BILL", n, opts?.padding ?? 3);
    }

    case "gate_pass": {
      const scopeKey = `project:${opts?.projectId ?? "global"}`;
      const n = await nextCounter(type, scopeKey,
        await txDb.gatePass.count({ where: opts?.projectId ? { projectId: opts.projectId } : {} }), txDb);
      return formatSequence(opts?.customPrefix ?? "GP", n, opts?.padding ?? 4);
    }

    case "batch_ticket": {
      const scopeKey = `date:${dateStr}`;
      const n = await nextCounter(type, scopeKey,
        await txDb.plantBatchTicket.count({ where: { ticketNumber: { startsWith: `BT-${dateStr}-` } } }), txDb);
      return formatSequence(opts?.customPrefix ?? "BT", n, opts?.padding ?? 3, dateStr);
    }

    case "correspondence": {
      const scopeKey = `year:${yearStr}`;
      const n = await nextCounter(type, scopeKey,
        await txDb.correspondence.count({ where: { ourRef: { startsWith: `COR-${yearStr}-` } } }), txDb);
      return formatSequence(opts?.customPrefix ?? "COR", n, opts?.padding ?? 4, yearStr);
    }

    case "rfi": {
      const scopeKey = `project:${opts?.projectId ?? "global"}:date:${dateStr}`;
      const n = await nextCounter(type, scopeKey,
        await txDb.rfi.count({ where: {
          number: { startsWith: `RFI-${dateStr}-` },
          ...(opts?.projectId ? { projectId: opts.projectId } : {}),
        } }), txDb);
      return formatSequence(opts?.customPrefix ?? "RFI", n, opts?.padding ?? 3, dateStr);
    }

    case "jv_payout": {
      const scopeKey = `agreement:${opts?.agreementId ?? "global"}`;
      const n = await nextCounter(type, scopeKey,
        await txDb.jvCommissionPayout.count({ where: opts?.agreementId ? { agreementId: opts.agreementId } : {} }), txDb);
      return formatSequence(opts?.customPrefix ?? "JV-COMM", n, opts?.padding ?? 3);
    }

    case "journal_entry": {
      const scopeKey = `year:${yearStr}`;
      const n = await nextCounter(type, scopeKey,
        await txDb.journalEntry.count({ where: { entryNumber: { startsWith: `JE-${yearStr}-` } } }), txDb);
      return formatSequence(opts?.customPrefix ?? "JE", n, opts?.padding ?? 4, yearStr);
    }

    case "payment_voucher": {
      const scopeKey = `project:${opts?.projectId ?? "global"}:year:${yearStr}`;
      const n = await nextCounter(type, scopeKey,
        await txDb.payment.count({ where: {
          accountingVoucherNo: { startsWith: `PV-${yearStr}-` },
          ...(opts?.projectId ? { projectId: opts.projectId } : {}),
        } }), txDb);
      return formatSequence(opts?.customPrefix ?? "PV", n, opts?.padding ?? 4, yearStr);
    }

    default: {
      const n = await nextCounter("document", "global", 0, txDb);
      return formatSequence("DOC", n, 3);
    }
  }
}
