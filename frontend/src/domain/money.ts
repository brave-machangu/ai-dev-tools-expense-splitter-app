/**
 * Money is integer minor units everywhere (spec §1, §6). No float arithmetic
 * touches money: parsing and formatting are both string-based.
 */

/** Currencies with exactly 2 decimal places — the only ones v1 supports. */
export const SUPPORTED_CURRENCIES = [
  "USD",
  "EUR",
  "GBP",
  "CHF",
  "CAD",
  "AUD",
  "NZD",
  "ZAR",
  "SEK",
  "NOK",
  "DKK",
  "PLN",
  "CZK",
  "MXN",
  "BRL",
  "INR",
  "SGD",
  "HKD",
  "THB",
  "TRY",
  "ILS",
] as const;

export type Currency = (typeof SUPPORTED_CURRENCIES)[number];

export const MAX_AMOUNT_CENTS = 100_000_000; // 1,000,000.00

const SYMBOLS: Record<string, string> = {
  USD: "$",
  EUR: "€",
  GBP: "£",
  CHF: "CHF ",
  CAD: "CA$",
  AUD: "A$",
  NZD: "NZ$",
  ZAR: "R",
  SEK: "kr ",
  NOK: "kr ",
  DKK: "kr ",
  PLN: "zł ",
  CZK: "Kč ",
  MXN: "MX$",
  BRL: "R$",
  INR: "₹",
  SGD: "S$",
  HKD: "HK$",
  THB: "฿",
  TRY: "₺",
  ILS: "₪",
};

export function isSupportedCurrency(value: string): value is Currency {
  return (SUPPORTED_CURRENCIES as readonly string[]).includes(value);
}

export function currencySymbol(currency: string): string {
  return SYMBOLS[currency] ?? `${currency} `;
}

/**
 * Parses user input such as "12", "12.5", "12.34" or "12,34" into minor units.
 * Returns null for anything that is not a non-negative amount with ≤ 2 decimals.
 */
export function parseAmountToCents(raw: string): number | null {
  const input = raw.trim().replace(/\s/g, "").replace(",", ".");
  if (input === "" || input === ".") return null;
  if (!/^\d{0,9}(\.\d{0,2})?$/.test(input)) return null;
  const [whole = "", fraction = ""] = input.split(".");
  const cents = Number(whole || "0") * 100 + Number((fraction + "00").slice(0, 2));
  return Number.isSafeInteger(cents) ? cents : null;
}

function groupThousands(digits: string): string {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/** |cents| as "1,234.50". */
function absoluteDecimal(cents: number): string {
  const abs = Math.abs(cents);
  const whole = Math.trunc(abs / 100);
  const minor = abs % 100;
  return `${groupThousands(String(whole))}.${String(minor).padStart(2, "0")}`;
}

/** -1450, "EUR" → "−€14.50" */
export function formatMoney(cents: number, currency: string): string {
  const sign = cents < 0 ? "−" : "";
  return `${sign}${currencySymbol(currency)}${absoluteDecimal(cents)}`;
}

/** Always shows the magnitude only: -1450 → "€14.50". */
export function formatMoneyAbs(cents: number, currency: string): string {
  return `${currencySymbol(currency)}${absoluteDecimal(cents)}`;
}

/** Value for an editable input: 1450 → "14.50" (no symbol, no grouping). */
export function centsToInputValue(cents: number): string {
  const abs = Math.abs(cents);
  return `${Math.trunc(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}
