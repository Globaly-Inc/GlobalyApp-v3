/**
 * The pure money-formatting logic behind <Money>.
 *
 * Every figure is shown in the currency it is stored in. There is no conversion: the rates would
 * have to come from somewhere, and a hand-kept snapshot silently ages into wrong prices. Bring
 * back a converted display alongside a `/fx/rates` feed (daily worker + cache, per the backend
 * module shape) the moment a public price becomes payable.
 */

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
 * One figure or a low–high range, exactly as the row stored it. `null` when there is no amount to
 * show at all.
 */
export function displayMoney(low: number | null, high: number | null, from: string): MoneyDisplay | null {
  const values = [low, high].filter((v): v is number => v != null);
  if (values.length === 0) return null;

  // No currency column on the row (business service prices, for one) means the bare figure —
  // never stamp it with a code it was not quoted in.
  if (!from) return { text: values.map((v) => Math.round(v).toLocaleString()).join(" – ") };

  return { text: join(from, values) };
}
