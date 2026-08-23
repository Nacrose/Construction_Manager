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
  postedById?: string; // user who posted the entry
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

  // Generate entry number (JE-YYYY-NNNN) with retry on collision.
  // The unique constraint on entryNumber prevents duplicates — if a
  // concurrent request inserts the same number, we retry.
  const year = (input.entryDate ?? new Date()).getFullYear();
  const MAX_RETRIES = 5;
  let entry;
  let entryNumber = "";
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const count = await tx.journalEntry.count({
      where: { entryNumber: { startsWith: `JE-${year}-` } },
    });
    entryNumber = `JE-${year}-${String(count + 1).padStart(4, "0")}`;

    try {
      entry = await tx.journalEntry.create({
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
          postedById: input.postedById || null,
          postedAt: (input.isPosted ?? true) ? new Date() : null,
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
      break; // success
    } catch (err: any) {
      if (attempt < MAX_RETRIES - 1 && err?.code === "P2002") {
        continue; // retry with next number
      }
      throw err;
    }
  }

  if (!entry) {
    throw new Error("Failed to create journal entry after multiple retries.");
  }

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

  // Generate entry number with retry (same pattern as createJournalEntry).
  const year = new Date().getFullYear();
  const MAX_RETRIES = 5;
  let reversal;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const count = await tx.journalEntry.count({
      where: { entryNumber: { startsWith: `JE-${year}-` } },
    });
    const entryNumber = `JE-${year}-R${String(count + 1).padStart(4, "0")}`;

    try {
      reversal = await tx.journalEntry.create({
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
      break; // success
    } catch (err: any) {
      if (attempt < MAX_RETRIES - 1 && err?.code === "P2002") {
        continue; // retry with next number
      }
      throw err;
    }
  }

  if (!reversal) {
    throw new Error("Failed to create reversal journal entry after multiple retries.");
  }

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
  // Validate balance: amount must equal tdsDeducted + netPaid.
  // Without this check, createJournalEntry would throw a confusing
  // "unbalanced" error later.
  const expectedNet = params.amount - params.tdsDeducted;
  if (Math.abs(expectedNet - params.netPaid) > 0.01) {
    throw new Error(
      `vendorPaymentEntry: amount (${params.amount}) must equal tdsDeducted (${params.tdsDeducted}) + netPaid (${params.netPaid}). ` +
        `Expected netPaid=${expectedNet}, got ${params.netPaid}.`,
    );
  }

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

  // The IPC billing entry represents the revenue recognition event.
  // The standard double-entry for an IPC with retention and TDS is:
  //
  //   Dr Client Receivable (gross + VAT - retention - TDS)  NPR X  (1100)
  //   Dr Retention Receivable (held by client)                 NPR R  (1110)
  //   Dr TDS Receivable (deducted by client, recoverable)      NPR T  (1400)
  //      Cr Contract Revenue (gross)                          NPR G  (4001)
  //      Cr VAT Payable (VAT on gross)                        NPR V  (2021)
  //
  // Where: X + R + T = G + V (balanced)
  //   X = gross + VAT - retention - TDS (what client pays now)
  //   R = retention (held back, released later)
  //   T = TDS (deducted by client, recoverable from IRD)
  //   G = gross (revenue)
  //   V = VAT

  const clientReceivable = Math.max(
    0,
    params.grossAmount + params.vatAmount - params.retentionAmount - params.tdsAmount,
  );

  // Debit: Client Receivable (net of retention and TDS)
  lines.push({
    accountCode: "1100",
    accountName: "Client Receivables",
    debit: clientReceivable,
    credit: 0,
    description: `IPC ${params.ipcNumber} — receivable (net of retention & TDS)`,
    projectId: params.projectId,
  });

  // Debit: Retention Receivable (held by client)
  if (params.retentionAmount > 0) {
    lines.push({
      accountCode: "1110",
      accountName: "Retention Receivable (from Client)",
      debit: params.retentionAmount,
      credit: 0,
      description: `Retention deducted on IPC ${params.ipcNumber}`,
      projectId: params.projectId,
    });
  }

  // Debit: TDS Receivable (deducted by client, recoverable from IRD)
  if (params.tdsAmount > 0) {
    lines.push({
      accountCode: "1400",
      accountName: "TDS Receivable (from IRD)",
      debit: params.tdsAmount,
      credit: 0,
      description: `TDS deducted by client on IPC ${params.ipcNumber}`,
      projectId: params.projectId,
    });
  }

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
