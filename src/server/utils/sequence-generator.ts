/**
 * Central Atomic Sequence & Voucher Number Generator
 *
 * Provides standardized, collision-resistant document and voucher sequence numbering
 * across all construction operational and financial modules.
 */
import { format } from "date-fns";
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
      const where: any = opts?.projectId ? { projectId: opts.projectId } : {};
      const count = await txDb.purchaseOrder.count({ where });
      return formatSequence(opts?.customPrefix ?? "PO", count + 1, opts?.padding ?? 4);
    }

    case "purchase_requisition": {
      const where: any = opts?.projectId ? { projectId: opts.projectId } : {};
      const count = await txDb.materialRequisition.count({ where });
      return formatSequence(opts?.customPrefix ?? "PR", count + 1, opts?.padding ?? 4);
    }

    case "site_expense": {
      const where: any = opts?.projectId ? { projectId: opts.projectId } : {};
      const count = await txDb.siteExpense.count({ where });
      return formatSequence(opts?.customPrefix ?? "EXP", count + 1, opts?.padding ?? 3);
    }

    case "subcontractor_bill": {
      const where: any = opts?.projectId ? { projectId: opts.projectId } : {};
      const count = await txDb.subcontractorBill.count({ where });
      return formatSequence(opts?.customPrefix ?? "SUB-BILL", count + 1, opts?.padding ?? 3);
    }

    case "gate_pass": {
      const where: any = opts?.projectId ? { projectId: opts.projectId } : {};
      const count = await txDb.gatePass.count({ where });
      return formatSequence(opts?.customPrefix ?? "GP", count + 1, opts?.padding ?? 4);
    }

    case "batch_ticket": {
      const count = await txDb.plantBatchTicket.count({
        where: {
          ticketNumber: { startsWith: `BT-${dateStr}-` },
        },
      });
      return formatSequence(opts?.customPrefix ?? "BT", count + 1, opts?.padding ?? 3, dateStr);
    }

    case "correspondence": {
      const count = await txDb.correspondence.count({
        where: {
          ourRef: { startsWith: `COR-${yearStr}-` },
        },
      });
      return formatSequence(opts?.customPrefix ?? "COR", count + 1, opts?.padding ?? 4, yearStr);
    }

    case "rfi": {
      const where: any = {
        number: { startsWith: `RFI-${dateStr}-` },
        ...(opts?.projectId ? { projectId: opts.projectId } : {}),
      };
      const count = await txDb.rfi.count({ where });
      return formatSequence(opts?.customPrefix ?? "RFI", count + 1, opts?.padding ?? 3, dateStr);
    }

    case "jv_payout": {
      const where: any = opts?.agreementId ? { agreementId: opts.agreementId } : {};
      const count = await txDb.jvCommissionPayout.count({ where });
      return formatSequence(opts?.customPrefix ?? "JV-COMM", count + 1, opts?.padding ?? 3);
    }

    case "journal_entry": {
      const count = await txDb.journalEntry.count({
        where: {
          entryNumber: { startsWith: `JE-${yearStr}-` },
        },
      });
      return formatSequence(opts?.customPrefix ?? "JE", count + 1, opts?.padding ?? 4, yearStr);
    }

    case "payment_voucher": {
      const count = await txDb.payment.count({
        where: {
          accountingVoucherNo: { startsWith: `PV-${yearStr}-` },
          ...(opts?.projectId ? { projectId: opts.projectId } : {}),
        },
      });
      return formatSequence(opts?.customPrefix ?? "PV", count + 1, opts?.padding ?? 4, yearStr);
    }

    default: {
      const count = 0;
      return formatSequence("DOC", count + 1, 3);
    }
  }
}
