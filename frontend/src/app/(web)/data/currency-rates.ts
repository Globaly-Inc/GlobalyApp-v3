/**
 * Currency table and the pure money-formatting logic behind <Money> and the navbar picker.
 *
 * ponytail: hand-maintained mid-market snapshot (2026-09-02) rather than a live feed. Every
 * converted figure carries the amount as stored in its tooltip, so the figure it was quoted at stays
 * recoverable. Swap RATES_PER_USD for a `/fx/rates` endpoint (daily worker + cache, per the backend
 * module shape) the moment a public price becomes payable.
 */
export const RATES_PER_USD: Record<string, number> = {
  USD: 1,
  AUD: 1.52,
  NZD: 1.65,
  EUR: 0.92,
  GBP: 0.78,
  CAD: 1.36,
  INR: 87,
  NPR: 139,
  JPY: 150,
  CNY: 7.2,
  SGD: 1.34,
  AED: 3.67,
};

export const CURRENCY_CODES = Object.keys(RATES_PER_USD);

export const DEFAULT_CURRENCY = "USD";

/** Reader's currency choice, kept in localStorage so it survives a reload. */
export const CURRENCY_STORAGE_KEY = "globaly.currency";

/** The three-letter code out of whatever a row stored: "aud", "AUD 1,000", "A$", null. */
export function normalizeCurrency(raw: string | null | undefined): string {
  return /[A-Za-z]{3}/.exec(raw ?? "")?.[0]?.toUpperCase() ?? "";
}

/** A finite number out of a numeric, string or missing column value. */
export function toAmount(value: number | string | null | undefined): number | null {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/** null when either side has no rate in the table — the caller then shows the amount as stored. */
export function convert(amount: number, from: string, to: string): number | null {
  const rateFrom = RATES_PER_USD[from];
  const rateTo = RATES_PER_USD[to];
  if (!rateFrom || !rateTo) return null;
  return (amount / rateFrom) * rateTo;
}

function one(code: string, value: number): string {
  const rounded = Math.round(value);
  if (!/^[A-Z]{3}$/.test(code)) return `${code} ${rounded.toLocaleString()}`.trim();
  return new Intl.NumberFormat("en", {
    style: "currency",
    currency: code,
    currencyDisplay: "code",
    maximumFractionDigits: 0,
  }).format(rounded);
}

/** "USD 24,500", or "USD 300 – 700" for a range — the code is stated once. */
function join(code: string, [low, high]: number[]): string {
  if (low == null) return "";
  return high == null ? one(code, low) : `${one(code, low)} – ${Math.round(high).toLocaleString()}`;
}

export type MoneyDisplay = { text: string; title?: string };

/**
 * One figure or a low–high range, in the reader's currency when both sides have a rate, otherwise
 * exactly as the row stored it. `null` when there is no amount to show at all.
 */
export function displayMoney(
  low: number | null,
  high: number | null,
  from: string,
  to: string,
): MoneyDisplay | null {
  const values = [low, high].filter((v): v is number => v != null);
  if (values.length === 0) return null;

  // No currency column on the row (business service prices, for one) means nothing to convert
  // from — show the bare figure rather than stamping it with a code it was never quoted in.
  if (!from) return { text: values.map((v) => Math.round(v).toLocaleString()).join(" – ") };

  const source = from;
  if (source !== to) {
    const converted = values.map((v) => convert(v, source, to));
    if (converted.every((v): v is number => v != null)) {
      return {
        text: join(to, converted),
        title: `${join(source, values)} converted at an indicative rate`,
      };
    }
  }
  return { text: join(source, values) };
}
