#!/usr/bin/env node
/**
 * Generates ALTER TABLE statements to migrate critical financial
 * Float columns to NUMERIC(15,2) (Decimal).
 *
 * Only changes amount/rate/balance/cost/payable fields — NOT
 * quantities (which can be fractional for some units) or
 * percentages (which are small and precise as Float).
 *
 * The generated statements are idempotent — ALTER TYPE is safe
 * to run on columns that are already NUMERIC.
 */
const fields = [
  // IPC
  ['"Ipc"', 'grossAmount'],
  ['"Ipc"', 'netPayable'],
  ['"Ipc"', 'vatAmount'],
  ['"Ipc"', 'totalWithVat'],
  ['"Ipc"', 'tdsAmount'],
  ['"Ipc"', 'finalPayable'],
  ['"Ipc"', 'retentionAmount'],
  ['"Ipc"', 'advanceRecovery'],
  ['"Ipc"', 'mobilizationAdvanceTotal'],
  ['"Ipc"', 'mobilizationAdvanceDeducted'],
  ['"Ipc"', 'mobilizationAdvanceRate'],
  ['"Ipc"', 'originalContractAmountWithoutVat'],
  ['"Ipc"', 'originalContractAmountWithVat'],
  ['"Ipc"', 'previousGrossAmount'],
  ['"Ipc"', 'previousVatAmount'],
  ['"Ipc"', 'previousAdvanceRecovery'],
  ['"Ipc"', 'previousRetentionAmount'],
  ['"Ipc"', 'previousTdsAmount'],

  // VendorBill
  ['"VendorBill"', 'grossAmount'],
  ['"VendorBill"', 'vatAmount'],
  ['"VendorBill"', 'tdsAmount'],
  ['"VendorBill"', 'netPayable'],
  ['"VendorBill"', 'paidAmount'],

  // SubcontractorBill
  ['"SubcontractorBill"', 'grossAmount'],
  ['"SubcontractorBill"', 'retentionAmount'],
  ['"SubcontractorBill"', 'vatAmount'],
  ['"SubcontractorBill"', 'tdsAmount'],
  ['"SubcontractorBill"', 'materialDeduction'],
  ['"SubcontractorBill"', 'advanceRecovery'],
  ['"SubcontractorBill"', 'netPayable'],
  ['"SubcontractorBill"', 'paidAmount'],
  ['"SubcontractorBill"', 'verifiedGross'],
  ['"SubcontractorBill"', 'verifiedNet'],

  // Payment
  ['"Payment"', 'amount'],
  ['"Payment"', 'tdsDeducted'],
  ['"Payment"', 'vatIncluded'],
  ['"Payment"', 'netPaid'],
  ['"Payment"', 'retentionReleased'],

  // ProjectCost
  ['"ProjectCost"', 'amount'],

  // SiteExpense
  ['"SiteExpense"', 'amount'],
  ['"SiteExpense"', 'vatAmount'],
  ['"SiteExpense"', 'totalAmount'],

  // CompanyBankAccount
  ['"CompanyBankAccount"', 'openingBalance'],
  ['"CompanyBankAccount"', 'currentBalance'],

  // HeadOfficeExpense
  ['"HeadOfficeExpense"', 'amount'],

  // JournalEntry
  ['"JournalEntry"', 'totalDebit'],
  ['"JournalEntry"', 'totalCredit'],

  // JournalEntryLine
  ['"JournalEntryLine"', 'debit'],
  ['"JournalEntryLine"', 'credit'],

  // EquipmentRental
  ['"EquipmentRental"', 'rentalRate'],
  ['"EquipmentRental"', 'totalRentalCost'],

  // EquipmentSpotHire
  ['"EquipmentSpotHire"', 'rate'],
  ['"EquipmentSpotHire"', 'mobilizationFee'],
  ['"EquipmentSpotHire"', 'fuelUnitCost'],
  ['"EquipmentSpotHire"', 'totalGross'],
  ['"EquipmentSpotHire"', 'fuelDeduction'],
  ['"EquipmentSpotHire"', 'netPayable'],

  // BankGuarantee
  ['"BankGuarantee"', 'amount'],
  ['"BankGuarantee"', 'marginAmount'],
  ['"BankGuarantee"', 'commissionPaid'],

  // PayrollRun
  ['"PayrollRun"', 'totalGross'],
  ['"PayrollRun"', 'totalAllowances'],
  ['"PayrollRun"', 'totalDeductions'],
  ['"PayrollRun"', 'totalAdvancesRecovered'],
  ['"PayrollRun"', 'totalNetPayable'],
  ['"PayrollRun"', 'disbursedAmount'],

  // PayrollStaffRecord
  ['"PayrollStaffRecord"', 'baseRate'],
  ['"PayrollStaffRecord"', 'regularPay'],
  ['"PayrollStaffRecord"', 'overtimePay'],
  ['"PayrollStaffRecord"', 'allowances'],
  ['"PayrollStaffRecord"', 'advanceDeduction'],
  ['"PayrollStaffRecord"', 'messDeduction'],
  ['"PayrollStaffRecord"', 'otherDeductions'],
  ['"PayrollStaffRecord"', 'tdsAmount'],
  ['"PayrollStaffRecord"', 'netPayable'],
];

const statements = fields.map(([table, col]) =>
  `ALTER TABLE ${table} ALTER COLUMN "${col}" TYPE NUMERIC(15,2) USING "${col}"::NUMERIC(15,2);`
);

console.log(statements.join('\n'));
console.error(`\n-- ${statements.length} statements generated`);
