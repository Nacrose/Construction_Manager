/**
 * Journal Entry Generator — the bridge between domain events and
 * the double-entry bookkeeping system.
 *
 * Every financial event (payment, bill, IPC, expense, payroll)
 * generates a balanced journal entry via this utility. Each entry
 * has at least 2 lines (debit + credit) and totalDebit == totalCredit.
 *
 * Account codes come from the Chart of Accounts (chart-of-accounts.ts).
 *
 * Usage:
 *   await createJournalEntry(db, {
 *     source: "payment",
 *     sourceRefId: payment.id,
 *     sourceRefType: "Payment",
 *     description: `Payment to ${payeeName}`,
 *     entryDate: payment.paymentDate,
 *     lines: [
 *       { accountCode: "2001", accountName: "Sundry Creditors", debit: 0, credit: amount },
 *       { accountCode: "1010", accountName: "Bank - Current", debit: amount, credit: 0 },
 *     ],
 *     projectId: payment.projectId,
 *   });
 */
import type { PrismaClient, Prisma } from "@prisma/client";

export type JournalLineInput = {
  accountCode: string;
  accountName: string;
  debit?: number;
  credit?: number;
  description?: string;
  projectId?: string;
  partnerId?: string;
};

export type JournalEntryInput = {
  source: string;
  sourceRefId?: string;
  sourceRefType?: string;
  description: string;
  entryDate?: Date;
  miti?: string;
  lines: JournalLineInput[];
  isPosted?: boolean;
};

/**
 * Create a balanced journal entry. Validates that totalDebit == totalCredit
 * before persisting. Throws if unbalanced.
 */
export async function createJournalEntry(
  tx: Prisma.TransactionClient | PrismaClient,
  input: JournalEntryInput,
): Promise<{ id: string; entryNumber: string }> {
  // Validate balance
  const totalDebit = input.lines.reduce((s, l) => s + (l.debit || 0), 0);
  const totalCredit = input.lines.reduce((s, l) => s + (l.credit || 0), 0);

  if (Math.abs(totalDebit - totalCredit) > 0.01) {
    throw new Error(
      `Unbalanced journal entry: debit=${totalDebit}, credit=${totalCredit}, diff=${totalDebit - totalCredit}. ` +
        `Source: ${input.source}, refId: ${input.sourceRefId ?? "none"}. ` +
        `Description: ${input.description}`,
    );
  }

  // Generate entry number (JE-YYYY-NNNN)
  const year = (input.entryDate ?? new Date()).getFullYear();
  const count = await tx.journalEntry.count({
    where: { entryNumber: { startsWith: `JE-${year}-` } },
  });
  const entryNumber = `JE-${year}-${String(count + 1).padStart(4, "0")}`;

  const entry = await tx.journalEntry.create({
    data: {
      entryNumber,
      entryDate: input.entryDate ?? new Date(),
      miti: input.miti,
      source: input.source,
      sourceRefId: input.sourceRefId || null,
      sourceRefType: input.sourceRefType || null,
      description: input.description,
      totalDebit,
      totalCredit,
      isPosted: input.isPosted ?? true,
      postedById: null, // set by caller if needed
      postedAt: input.isPosted ?? true ? new Date() : null,
      lines: {
        create: input.lines.map((line, idx) => ({
          lineNumber: idx + 1,
          accountCode: line.accountCode,
          accountName: line.accountName,
          debit: line.debit || 0,
          credit: line.credit || 0,
          description: line.description || null,
          projectId: line.projectId || null,
          partnerId: line.partnerId || null,
        })),
      },
    },
    include: { lines: true },
  });

  return { id: entry.id, entryNumber: entry.entryNumber };
}

/**
 * Reverse an existing journal entry by creating a mirror entry
 * with debits and credits swapped. Used for corrections.
 */
export async function reverseJournalEntry(
  tx: Prisma.TransactionClient | PrismaClient,
  originalEntryId: string,
  reason: string,
): Promise<{ id: string; entryNumber: string }> {
  const original = await tx.journalEntry.findUnique({
    where: { id: originalEntryId },
    include: { lines: true },
  });

  if (!original) {
    throw new Error(`Journal entry ${originalEntryId} not found.`);
  }

  // Swap debit/credit on every line
  const reversedLines: JournalLineInput[] = original.lines.map((line) => ({
    accountCode: line.accountCode,
    accountName: line.accountName,
    debit: line.credit, // swap
    credit: line.debit, // swap
    description: `REVERSAL: ${line.description ?? ""}`,
    projectId: line.projectId ?? undefined,
    partnerId: line.partnerId ?? undefined,
  }));

  const year = new Date().getFullYear();
  const count = await tx.journalEntry.count({
    where: { entryNumber: { startsWith: `JE-${year}-` } },
  });
  const entryNumber = `JE-${year}-R${String(count + 1).padStart(4, "0")}`;

  const reversal = await tx.journalEntry.create({
    data: {
      entryNumber,
      entryDate: new Date(),
      source: "reversal",
      sourceRefId: originalEntryId,
      sourceRefType: "JournalEntry",
      description: `REVERSAL of ${original.entryNumber}: ${reason}`,
      totalDebit: original.totalCredit,
      totalCredit: original.totalDebit,
      isPosted: true,
      postedAt: new Date(),
      reversalOfId: originalEntryId,
      lines: {
        create: reversedLines.map((line, idx) => ({
          lineNumber: idx + 1,
          accountCode: line.accountCode,
          accountName: line.accountName,
          debit: line.debit || 0,
          credit: line.credit || 0,
          description: line.description || null,
          projectId: line.projectId || null,
          partnerId: line.partnerId || null,
        })),
      },
    },
  });

  return { id: reversal.id, entryNumber: reversal.entryNumber };
}

/**
 * Helper: generate the standard journal entry for a vendor payment.
 *
 * Dr Sundry Creditors (vendor)   NPR X  (2001)
 *    Cr Bank / Cash               NPR X  (1010/1001)
 */
export function vendorPaymentEntry(params: {
  vendorBillId: string;
  vendorName: string;
  amount: number;
  tdsDeducted: number;
  netPaid: number;
  paymentMode: string;
  projectId?: string;
  partnerId?: string;
  date: Date;
}): JournalEntryInput {
  const lines: JournalLineInput[] = [];

  // Debit: reduce vendor payable by gross amount
  lines.push({
    accountCode: "2001",
    accountName: "Sundry Creditors",
    debit: params.amount,
    credit: 0,
    description: `Payment to ${params.vendorName}`,
    projectId: params.projectId,
    partnerId: params.partnerId,
  });

  // Credit: TDS payable to IRD (if deducted)
  if (params.tdsDeducted > 0) {
    lines.push({
      accountCode: "2020",
      accountName: "TDS Payable",
      debit: 0,
      credit: params.tdsDeducted,
      description: `TDS deducted on payment to ${params.vendorName}`,
      projectId: params.projectId,
    });
  }

  // Credit: Bank / Cash for net paid
  const bankCode = params.paymentMode === "cash" ? "1001" : "1010";
  lines.push({
    accountCode: bankCode,
    accountName: params.paymentMode === "cash" ? "Cash" : "Bank",
    debit: 0,
    credit: params.netPaid,
    description: `Net payment via ${params.paymentMode}`,
    projectId: params.projectId,
  });

  return {
    source: "payment",
    sourceRefId: params.vendorBillId,
    sourceRefType: "VendorPayment",
    description: `Vendor payment to ${params.vendorName}`,
    entryDate: params.date,
    lines,
  };
}

/**
 * Helper: generate the journal entry for an IPC (client billing).
 *
 * Dr Client Receivable    NPR X  (1100)
 *    Cr Contract Revenue   NPR X  (4001)
 */
export function ipcBillingEntry(params: {
  ipcId: string;
  ipcNumber: string;
  grossAmount: number;
  vatAmount: number;
  retentionAmount: number;
  tdsAmount: number;
  projectId: string;
  date: Date;
}): JournalEntryInput {
  const lines: JournalLineInput[] = [];

  // Debit: Client Receivable for total bill (gross + VAT)
  lines.push({
    accountCode: "1100",
    accountName: "Client Receivables",
    debit: params.grossAmount + params.vatAmount,
    credit: 0,
    description: `IPC ${params.ipcNumber} billing`,
    projectId: params.projectId,
  });

  // Credit: Contract Revenue (gross)
  lines.push({
    accountCode: "4001",
    accountName: "Contract Revenue",
    debit: 0,
    credit: params.grossAmount,
    description: `Revenue from IPC ${params.ipcNumber}`,
    projectId: params.projectId,
  });

  // Credit: VAT Payable (if VAT charged)
  if (params.vatAmount > 0) {
    lines.push({
      accountCode: "2021",
      accountName: "VAT Payable",
      debit: 0,
      credit: params.vatAmount,
      description: `VAT on IPC ${params.ipcNumber}`,
      projectId: params.projectId,
    });
  }

  return {
    source: "ipc",
    sourceRefId: params.ipcId,
    sourceRefType: "IPC",
    description: `IPC ${params.ipcNumber} certified`,
    entryDate: params.date,
    lines,
  };
}
