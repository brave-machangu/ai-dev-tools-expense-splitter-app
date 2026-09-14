/**
 * Money is integer minor units everywhere. No float arithmetic touches money:
 * parsing is string-based, formatting is string-based.
 */

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

export function currencySymbol(currency: string): string {
  return SYMBOLS[currency] ?? `${currency} `;
}

/** Parses "12", "12.5", "12.34" into minor units. Returns null when invalid. */
export function parseAmountToCents(raw: string): number | null {
  const input = raw.trim().replace(/\s/g, "").replace(",", ".");
  if (input === "") return null;
  if (!/^\d{1,9}(\.\d{0,2})?$/.test(input)) return null;
  const [whole, fraction = ""] = input.split(".");
  const minor = (fraction + "00").slice(0, 2);
  const cents = Number(whole) * 100 + Number(minor);
  if (!Number.isSafeInteger(cents)) return null;
  return cents;
}

/** Absolute value of cents rendered as "1234.50" — pure string math. */
function centsToDecimalString(cents: number): string {
  const abs = Math.abs(cents);
  const whole = Math.trunc(abs / 100);
  const minor = abs % 100;
  return `${whole.toLocaleString("en-US")}.${String(minor).padStart(2, "0")}`;
}

/** e.g. -1450, "EUR" -> "−€14.50" */
export function formatMoney(cents: number, currency: string): string {
  const sign = cents < 0 ? "−" : "";
  return `${sign}${currencySymbol(currency)}${centsToDecimalString(cents)}`;
}

/** Same as formatMoney but always shows an explicit + or − for non-zero. */
export function formatSignedMoney(cents: number, currency: string): string {
  if (cents === 0) return formatMoney(0, currency);
  const sign = cents < 0 ? "−" : "+";
  return `${sign}${currencySymbol(currency)}${centsToDecimalString(cents)}`;
}

/** Editable form value: "14.50" (no grouping, no symbol). */
export function centsToInputValue(cents: number): string {
  const abs = Math.abs(cents);
  return `${Math.trunc(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}
