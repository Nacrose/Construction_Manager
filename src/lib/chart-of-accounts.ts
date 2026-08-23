/**
 * Standard chart of accounts for Nepal construction contractors.
 * Based on Nepal standard accounting practices + construction industry norms.
 * Used by the Journal Entry system for double-entry bookkeeping.
 *
 * Format: 4-digit code, grouped by type:
 *   1xxx = Assets
 *   2xxx = Liabilities
 *   3xxx = Equity
 *   4xxx = Revenue
 *   5xxx = Direct Project Costs
 *   6xxx = Overheads
 *   7xxx = Other Income/Expense
 */
export const CHART_OF_ACCOUNTS = [
  // ── Assets (1xxx) ──────────────────────────────────────────
  { code: "1001", name: "Cash on Hand", category: "asset" },
  { code: "1002", name: "Petty Cash", category: "asset" },
  { code: "1010", name: "Bank - Current Account", category: "asset" },
  { code: "1011", name: "Bank - Savings Account", category: "asset" },
  { code: "1012", name: "Bank - overdraft", category: "asset" },
  { code: "1100", name: "Client Receivables (IPC Due)", category: "asset" },
  { code: "1110", name: "Retention Receivable (from Client)", category: "asset" },
  { code: "1120", name: "Advance to Suppliers", category: "asset" },
  { code: "1130", name: "Advance to Subcontractors", category: "asset" },
  { code: "1140", name: "Advance to Staff", category: "asset" },
  { code: "1200", name: "Material Inventory", category: "asset" },
  { code: "1210", name: "Stores Stock", category: "asset" },
  { code: "1300", name: "Equipment (Owned)", category: "asset" },
  { code: "1310", name: "Accumulated Depreciation - Equipment", category: "asset" },
  { code: "1320", name: "Equipment (Rented - Deposit)", category: "asset" },
  { code: "1400", name: "TDS Receivable (from IRD)", category: "asset" },
  { code: "1500", name: "Mobilization Advance Given", category: "asset" },

  // ── Liabilities (2xxx) ────────────────────────────────────
  { code: "2001", name: "Sundry Creditors (Material Vendors)", category: "liability" },
  { code: "2002", name: "Subcontractor Payables", category: "liability" },
  { code: "2010", name: "Retention Payable (to Subcontractors)", category: "liability" },
  { code: "2020", name: "TDS Payable (to IRD)", category: "liability" },
  { code: "2021", name: "VAT Payable (to IRD)", category: "liability" },
  { code: "2030", name: "Salary Payable", category: "liability" },
  { code: "2040", name: "Staff Advance Recoverable", category: "liability" },
  { code: "2050", name: "Mobilization Advance Received (from Client)", category: "liability" },
  { code: "2060", name: "Bank Loan - Short Term", category: "liability" },
  { code: "2061", name: "Bank Loan - Long Term", category: "liability" },

  // ── Equity (3xxx) ─────────────────────────────────────────
  { code: "3000", name: "Owner's Capital", category: "equity" },
  { code: "3100", name: "Retained Earnings", category: "equity" },
  { code: "3200", name: "Drawings / Dividends", category: "equity" },

  // ── Revenue (4xxx) ────────────────────────────────────────
  { code: "4001", name: "Contract Revenue (IPC Billing)", category: "revenue" },
  { code: "4002", name: "Mobilization Advance Revenue", category: "revenue" },
  { code: "4003", name: "Retention Released Revenue", category: "revenue" },
  { code: "4100", name: "Other Income", category: "revenue" },
  { code: "4200", name: "Forex Gain / (Loss)", category: "revenue" },

  // ── Direct Project Costs (5xxx) ───────────────────────────
  { code: "5001", name: "Material Consumption", category: "material" },
  { code: "5002", name: "Material Purchase Variance", category: "material" },
  { code: "5010", name: "Direct Labor", category: "labor" },
  { code: "5011", name: "Overtime Cost", category: "labor" },
  { code: "5020", name: "Subcontractor Cost", category: "subcontract" },
  { code: "5030", name: "Equipment Cost - Owned", category: "equipment" },
  { code: "5031", name: "Equipment Cost - Rented", category: "equipment" },
  { code: "5032", name: "Equipment Fuel Cost", category: "equipment" },
  { code: "5040", name: "Equipment Operator Cost", category: "labor" },
  { code: "5050", name: "Site Transport Cost", category: "material" },

  // ── Overheads (6xxx) ──────────────────────────────────────
  { code: "6001", name: "Site Overhead - Rent", category: "overhead" },
  { code: "6002", name: "Site Overhead - Utilities", category: "overhead" },
  { code: "6003", name: "Site Overhead - Fuel & Vehicle", category: "overhead" },
  { code: "6004", name: "Site Overhead - Food & Mess", category: "overhead" },
  { code: "6005", name: "Site Overhead - Safety Equipment", category: "overhead" },
  { code: "6006", name: "Site Overhead - Misc", category: "overhead" },
  { code: "6100", name: "Head Office - Rent", category: "overhead" },
  { code: "6101", name: "Head Office - Salaries", category: "overhead" },
  { code: "6102", name: "Head Office - Utilities", category: "overhead" },
  { code: "6103", name: "Head Office - Vehicle/Fuel", category: "overhead" },
  { code: "6104", name: "Head Office - Audit/Tax Fees", category: "overhead" },
  { code: "6105", name: "Head Office - Legal Fees", category: "overhead" },
  { code: "6106", name: "Head Office - Misc", category: "overhead" },
  { code: "6200", name: "Bank Charges & Interest", category: "overhead" },
  { code: "6300", name: "Depreciation - Office Equipment", category: "overhead" },
];

/**
 * Standard construction cost codes for Nepal (based on CPWD schedule).
 * Used for cross-project cost comparison and standard reporting.
 */
export const STANDARD_COST_CODES = [
  // ── 1. Preliminary & General ──────────────────────────────
  { code: "1.0", name: "Preliminary & General", nameNp: "प्रारम्भिक कार्य", category: "overhead", level: 1 },
  { code: "1.1", name: "Site Setup & Mobilization", nameNp: "साइट स्थापना", category: "overhead", level: 2 },
  { code: "1.2", name: "Temporary Works", nameNp: "अस्थायी कार्य", category: "overhead", level: 2 },
  { code: "1.3", name: "Survey & Testing", nameNp: "सर्वेक्षण", category: "overhead", level: 2 },
  { code: "1.4", name: "Safety & Health", nameNp: "सुरक्षा", category: "overhead", level: 2 },

  // ── 2. Earthwork ──────────────────────────────────────────
  { code: "2.0", name: "Earthwork", nameNp: "माटोको काम", category: "material", level: 1 },
  { code: "2.1", name: "Excavation", nameNp: "खनाइ", category: "material", level: 2 },
  { code: "2.2", name: "Filling & Compaction", nameNp: "भर्ने", category: "material", level: 2 },
  { code: "2.3", name: "Gabion Works", nameNp: "गेबियन", category: "material", level: 2 },

  // ── 3. Concrete ───────────────────────────────────────────
  { code: "3.0", name: "Concrete Works", nameNp: "कंक्रिट", category: "material", level: 1 },
  { code: "3.1", name: "PCC (Plain Cement Concrete)", nameNp: "PCC", category: "material", level: 2 },
  { code: "3.2", name: "RCC (Reinforced Cement Concrete)", nameNp: "RCC", category: "material", level: 2 },
  { code: "3.3", name: "Reinforcement Steel", nameNp: "छड", category: "material", level: 2 },
  { code: "3.4", name: "Formwork", nameNp: "फर्मवर्क", category: "material", level: 2 },

  // ── 4. Masonry ────────────────────────────────────────────
  { code: "4.0", name: "Masonry Works", nameNp: "गारो", category: "material", level: 1 },
  { code: "4.1", name: "Stone Masonry", nameNp: "ढुंगा गारो", category: "material", level: 2 },
  { code: "4.2", name: "Brick Masonry", nameNp: "इट्टा गारो", category: "material", level: 2 },

  // ── 5. Structures ─────────────────────────────────────────
  { code: "5.0", name: "Structural Works", nameNp: "संरचनात्मक", category: "material", level: 1 },
  { code: "5.1", name: "Steel Structures", nameNp: "स्टील संरचना", category: "material", level: 2 },
  { code: "5.2", name: "Bridges & Culverts", nameNp: "पुल", category: "material", level: 2 },

  // ── 6. Finishing ──────────────────────────────────────────
  { code: "6.0", name: "Finishing Works", nameNp: "फिनिसिङ", category: "material", level: 1 },
  { code: "6.1", name: "Plastering", nameNp: "प्लास्टर", category: "material", level: 2 },
  { code: "6.2", name: "Painting", nameNp: "रंगरोगन", category: "material", level: 2 },
  { code: "6.3", name: "Flooring", nameNp: "फर्श", category: "material", level: 2 },

  // ── 7. Mechanical & Electrical ────────────────────────────
  { code: "7.0", name: "MEP (Mechanical/Electrical/Plumbing)", nameNp: "एमईपी", category: "material", level: 1 },
  { code: "7.1", name: "Electrical Works", nameNp: "बिजुली", category: "material", level: 2 },
  { code: "7.2", name: "Plumbing & Sanitary", nameNp: "प्लम्बिङ", category: "material", level: 2 },

  // ── 8. Labor ──────────────────────────────────────────────
  { code: "8.0", name: "Labor", nameNp: "श्रम", category: "labor", level: 1 },
  { code: "8.1", name: "Skilled Labor", nameNp: "दक्ष श्रम", category: "labor", level: 2 },
  { code: "8.2", name: "Unskilled Labor", nameNp: "अदक्ष श्रम", category: "labor", level: 2 },
  { code: "8.3", name: "Supervisor & Engineer", nameNp: "तकनिसियन", category: "labor", level: 2 },

  // ── 9. Equipment ──────────────────────────────────────────
  { code: "9.0", name: "Equipment", nameNp: "उपकरण", category: "equipment", level: 1 },
  { code: "9.1", name: "Owned Equipment", nameNp: "आफ्नो उपकरण", category: "equipment", level: 2 },
  { code: "9.2", name: "Rented Equipment", nameNp: "भाडाको उपकरण", category: "equipment", level: 2 },
  { code: "9.3", name: "Spot Hire Equipment", nameNp: "स्पट हायर", category: "equipment", level: 2 },
];
