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
import type { DbTxClient } from "./db";
import { addMoney, subMoney, toMoney, type MoneyValue } from "./money";

export type JournalLineInput = {
  accountCode: string;
  accountName: string;
  debit?: MoneyValue;
  credit?: MoneyValue;
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
  organizationId?: string; // owning org — REQUIRED for org-level entries (lines with projectId=null); the only reliable org scope
  lines: JournalLineInput[];
  isPosted?: boolean;
  postedById?: string; // user who posted the entry
};

/**
 * Create a balanced journal entry. Validates that totalDebit == totalCredit
 * before persisting. Throws if unbalanced.
 */
export async function createJournalEntry(
  tx: DbTxClient,
  input: JournalEntryInput,
): Promise<{ id: string; entryNumber: string }> {
  // Validate balance — EXACT Decimal sums (float accumulation across many
  // lines can drift a legit entry past the 0.01 tolerance, or hide a real
  // 1-paisa imbalance inside rounding noise).
  const totalDebit = addMoney(...input.lines.map((l) => l.debit));
  const totalCredit = addMoney(...input.lines.map((l) => l.credit));

  const diff = subMoney(totalDebit, totalCredit);
  if (diff.abs().gt("0.01")) {
    throw new Error(
      `Unbalanced journal entry: debit=${totalDebit}, credit=${totalCredit}, diff=${diff}. ` +
        `Source: ${input.source}, refId: ${input.sourceRefId ?? "none"}. ` +
        `Description: ${input.description}`,
    );
  }

  // Resolve the fiscal year this entry belongs to (period lookup, not
  // just locked years). Falls back to null when no period covers the
  // date — fiscalYearId is informational for period reporting; lock
  // enforcement happens in the routers via assertNotLocked.
  let fiscalYearId: string | null = null;
  try {
    const fy = await tx.fiscalYearLock.findFirst({
      where: {
        startDate: { lte: input.entryDate ?? new Date() },
        endDate: { gte: input.entryDate ?? new Date() },
        ...(input.organizationId ? { organizationId: input.organizationId } : {}),
      },
      select: { id: true },
    });
    fiscalYearId = fy?.id ?? null;
  } catch {
    // FiscalYearLock table may not exist yet on fresh databases.
    fiscalYearId = null;
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
          fiscalYearId,
          organizationId: input.organizationId || null,
          source: input.source,
          sourceRefId: input.sourceRefId || null,
          sourceRefType: input.sourceRefType || null,
          description: input.description,
          totalDebit: totalDebit.toNumber(),
          totalCredit: totalCredit.toNumber(),
          isPosted: input.isPosted ?? true,
          postedById: input.postedById || null,
          postedAt: (input.isPosted ?? true) ? new Date() : null,
          lines: {
            create: input.lines.map((line, idx) => ({
              lineNumber: idx + 1,
              accountCode: line.accountCode,
              accountName: line.accountName,
              debit: toMoney(line.debit).toNumber(),
              credit: toMoney(line.credit).toNumber(),
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
  tx: DbTxClient,
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
          // Preserve org ownership so org-scoped queries still see the
          // reversal alongside the original entry.
          organizationId: original.organizationId,
          lines: {
            create: reversedLines.map((line, idx) => ({
              lineNumber: idx + 1,
              accountCode: line.accountCode,
              accountName: line.accountName,
              debit: toMoney(line.debit).toNumber(),
              credit: toMoney(line.credit).toNumber(),
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

  const totalDeductions = params.retentionAmount + params.tdsAmount;
  const totalBill = params.grossAmount + params.vatAmount;

  // Validate: deductions cannot exceed the total bill. In real accounting,
  // retention + TDS is always a portion of the gross — you can't deduct
  // more than the bill amount. If this happens, it's a data error that
  // would produce an unbalanced entry (debits > credits).
  if (totalDeductions > totalBill + 0.01) {
    throw new Error(
      `ipcBillingEntry: deductions (retention=${params.retentionAmount} + tds=${params.tdsAmount} = ${totalDeductions}) ` +
        `exceed total bill (gross=${params.grossAmount} + vat=${params.vatAmount} = ${totalBill}). ` +
        `This indicates a data error — deductions should always be ≤ total bill.`,
    );
  }

  const clientReceivable = totalBill - totalDeductions;

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

/**
 * Inflow nature → credit account mapping for money received by the
 * contractor. This is the missing "cash-in" side of the GL: previously NO
 * posting anywhere debited Bank/Cash (1001/1010), so the bank ledger and
 * Trial Balance could never reflect receipts.
 *
 * Each nature credits the economically correct account:
 *   - Client IPC Running Bill → Client Receivables (1100): settles the
 *     receivable recognized at IPC certification. NOT revenue — revenue
 *     was already recognized by ipcBillingEntry.
 *   - Mobilization Advance    → Mobilization Advance Received (2050): a
 *     liability until amortized against future IPCs.
 *   - Partner Capital Deposit → Owner's Capital (3000): JV equity in.
 *   - Security Deposit Refund → Retention Receivable (1110): retention
 *     finally received from the client.
 *   - Other Site Inflow       → Other Income (4100).
 */
export const INFLOW_CREDIT_ACCOUNTS = {
  "Client IPC Running Bill": { code: "1100", name: "Client Receivables" },
  "Mobilization Advance": { code: "2050", name: "Mobilization Advance Received (from Client)" },
  "Partner Capital Deposit": { code: "3000", name: "Owner's Capital" },
  "Security Deposit Refund": { code: "1110", name: "Retention Receivable (from Client)" },
  "Other Site Inflow": { code: "4100", name: "Other Income" },
} as const;

export type InflowType = keyof typeof INFLOW_CREDIT_ACCOUNTS;

export function clientReceiptEntry(params: {
  receiptId: string; // Payment row id acting as the receipt voucher
  inflowType: InflowType;
  receivedFrom: string;
  amount: number;
  paymentMode: string; // cash → 1001, anything else → 1010
  projectId?: string;
  date: Date;
}): JournalEntryInput {
  if (params.amount <= 0) {
    throw new Error(`clientReceiptEntry: amount must be positive, got ${params.amount}.`);
  }

  const creditAccount =
    INFLOW_CREDIT_ACCOUNTS[params.inflowType] ?? INFLOW_CREDIT_ACCOUNTS["Other Site Inflow"];

  const bankCode = params.paymentMode === "cash" ? "1001" : "1010";
  const bankName = params.paymentMode === "cash" ? "Cash on Hand" : "Bank - Current Account";

  return {
    source: "receipt",
    sourceRefId: params.receiptId,
    sourceRefType: "Payment",
    description: `Money in — ${params.inflowType} from ${params.receivedFrom}`,
    entryDate: params.date,
    lines: [
      {
        accountCode: bankCode,
        accountName: bankName,
        debit: params.amount,
        credit: 0,
        description: `Received from ${params.receivedFrom} via ${params.paymentMode}`,
        projectId: params.projectId,
      },
      {
        accountCode: creditAccount.code,
        accountName: creditAccount.name,
        debit: 0,
        credit: params.amount,
        description: `${params.inflowType} — ${params.receivedFrom}`,
        projectId: params.projectId,
      },
    ],
  };
}
