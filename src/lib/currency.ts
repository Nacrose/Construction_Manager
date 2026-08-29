/**
 * Central South Asian / Nepali Currency & "Amount In Words" Engine
 *
 * Provides standardized NPR formatting across UI, reports, and financial statements,
 * as well as legal "Amount in Words" (अक्षरूपी) conversion in English and Nepali Devanagari.
 */

const NEPALI_ONES = [
  "", "एक", "दुई", "तीन", "चार", "पाँच", "छ", "सात", "आठ", "नौ",
  "दश", "एघार", "बाह्र", "तेह्र", "चौध", "पन्ध्र", "सोह्र", "सत्र", "अठार", "उन्नाइस",
  "बीस", "एक्काइस", "बाइस", "तेइस", "चौबीस", "पच्चीस", "छब्बीस", "सत्ताइस", "अट्ठाइस", "उनन्तीस",
  "तीस", "एकतीस", "बत्तीस", "तेत्तीस", "चौंतीस", "पैंतीस", "छत्तीस", "सरसत्ती", "अठतीस", "उनन्चालीस",
  "चालीस", "एकचालीस", "बयालीस", "त्रियालीस", "चवालीस", "पैंतालीस", "छयालीस", "सटचालीस", "अठचालीस", "उनन्पचास",
  "पचास", "एकाउन्न", "बाउन्न", "त्रिपन्न", "चौपन्न", "पचपन्न", "छपन्न", "सन्ताउन्न", "अन्ठाउन्न", "उनन्साठी",
  "साठी", "एकसट्ठी", "बासट्ठी", "त्रिषट्ठी", "चौंसट्ठी", "पैंसट्ठी", "छयसट्ठी", "सत्सट्ठी", "अठसट्ठी", "उनन्सत्तरी",
  "सत्तरी", "एकहत्तर", "बहत्तर", "त्रिहत्तर", "चौहत्तर", "पचहत्तर", "छयहत्तर", "सतहत्तर", "अठहत्तर", "उनासी",
  "असी", "एकासी", "बयासी", "त्रियासी", "चौरासी", "पचासी", "छयासी", "सतासी", "अठासी", "उनान्नब्बे",
  "नब्बे", "एकानब्बे", "बयानब्बे", "त्रियानब्बे", "चौरानब्बे", "पंचानब्बे", "छयानब्बे", "सन्तानब्बे", "अन्ठानब्बे", "उनन्सय"
];

const ENGLISH_ONES = [
  "", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine",
  "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"
];

const ENGLISH_TENS = [
  "", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"
];

export type FormatNprOptions = {
  prefix?: "NPR" | "Rs." | "none";
  decimals?: number; // default: 2
  compact?: boolean; // e.g. 1.5 Cr, 45 L, 12 k
  showSign?: boolean;
};

/**
 * Standardized South Asian Currency Formatter for Nepali Rupee (NPR)
 * Example: 12345678.50 -> "NPR 1,23,45,678.50"
 */
export function formatNpr(val: number | string | null | undefined, options: FormatNprOptions = {}): string {
  const num = typeof val === "number" ? val : parseFloat(String(val || 0));
  if (isNaN(num)) return "—";

  const { prefix = "none", decimals = 2, compact = false, showSign = false } = options;
  const isNegative = num < 0;
  const absNum = Math.abs(num);

  let formatted = "";

  if (compact) {
    if (absNum >= 10000000) {
      formatted = `${(absNum / 10000000).toFixed(decimals)} Cr`;
    } else if (absNum >= 100000) {
      formatted = `${(absNum / 100000).toFixed(decimals)} L`;
    } else if (absNum >= 1000) {
      formatted = `${(absNum / 1000).toFixed(decimals)} k`;
    } else {
      formatted = absNum.toFixed(decimals);
    }
  } else {
    formatted = absNum.toLocaleString("en-IN", {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
  }

  let prefixStr = "";
  if (prefix === "NPR") prefixStr = "NPR ";
  else if (prefix === "Rs.") prefixStr = "Rs. ";

  const signStr = isNegative ? "-" : (showSign && num > 0 ? "+" : "");
  return `${signStr}${prefixStr}${formatted}`;
}

/**
 * Convert numeric amount into legal "Amount in Words" (अक्षरूपी)
 * in English or Nepali Devanagari.
 */
export function amountInWords(amount: number | string, lang: "en" | "np" = "en"): string {
  const num = typeof amount === "number" ? amount : parseFloat(String(amount || 0));
  if (isNaN(num) || num === 0) {
    return lang === "np" ? "शून्य रुपैयाँ मात्र।" : "Zero Rupees Only.";
  }

  const isNegative = num < 0;
  const absNum = Math.abs(num);

  const rupees = Math.floor(absNum);
  const paisa = Math.round((absNum - rupees) * 100);

  let words = "";

  if (lang === "np") {
    words = convertNumberToNepaliWords(rupees);
    if (!words) words = "शून्य";
    words = `${words} रुपैयाँ`;

    if (paisa > 0) {
      const paisaWords = NEPALI_ONES[paisa] || String(paisa);
      words = `${words} ${paisaWords} पैसा`;
    }
    words = `${isNegative ? "ऋणात्मक " : ""}${words} मात्र।`;
  } else {
    words = convertNumberToEnglishWords(rupees);
    if (!words) words = "Zero";
    words = `${words} Rupees`;

    if (paisa > 0) {
      const paisaWords = convertTwoDigitsEnglish(paisa);
      words = `${words} and ${paisaWords} Paisa`;
    }
    words = `${isNegative ? "Minus " : ""}${words} Only.`;
  }

  return words;
}

function convertTwoDigitsEnglish(n: number): string {
  if (n < 20) return ENGLISH_ONES[n];
  const ten = Math.floor(n / 10);
  const one = n % 10;
  return `${ENGLISH_TENS[ten]}${one > 0 ? ` ${ENGLISH_ONES[one]}` : ""}`;
}

function convertNumberToEnglishWords(n: number): string {
  if (n === 0) return "";

  const crore = Math.floor(n / 10000000);
  let rem = n % 10000000;

  const lakh = Math.floor(rem / 100000);
  rem = rem % 100000;

  const thousand = Math.floor(rem / 1000);
  rem = rem % 1000;

  const hundred = Math.floor(rem / 100);
  rem = rem % 100;

  const parts: string[] = [];

  if (crore > 0) {
    parts.push(`${convertNumberToEnglishWords(crore)} Crore`);
  }
  if (lakh > 0) {
    parts.push(`${convertTwoDigitsEnglish(lakh)} Lakh`);
  }
  if (thousand > 0) {
    parts.push(`${convertTwoDigitsEnglish(thousand)} Thousand`);
  }
  if (hundred > 0) {
    parts.push(`${ENGLISH_ONES[hundred]} Hundred`);
  }
  if (rem > 0) {
    parts.push(convertTwoDigitsEnglish(rem));
  }

  return parts.join(" ");
}

function convertNumberToNepaliWords(n: number): string {
  if (n === 0) return "";

  const crore = Math.floor(n / 10000000);
  let rem = n % 10000000;

  const lakh = Math.floor(rem / 100000);
  rem = rem % 100000;

  const thousand = Math.floor(rem / 1000);
  rem = rem % 1000;

  const hundred = Math.floor(rem / 100);
  rem = rem % 100;

  const parts: string[] = [];

  if (crore > 0) {
    parts.push(`${convertNumberToNepaliWords(crore)} करोड`);
  }
  if (lakh > 0) {
    parts.push(`${NEPALI_ONES[lakh]} लाख`);
  }
  if (thousand > 0) {
    parts.push(`${NEPALI_ONES[thousand]} हजार`);
  }
  if (hundred > 0) {
    parts.push(`${NEPALI_ONES[hundred]} सय`);
  }
  if (rem > 0) {
    parts.push(NEPALI_ONES[rem]);
  }

  return parts.join(" ");
}
