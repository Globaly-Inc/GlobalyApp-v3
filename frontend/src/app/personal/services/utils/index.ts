import type { Currency } from "../apis";

/**
 * The only two places money changes units in this feature.
 *
 * Everything else — the wire, Redux, the DB — carries an integer minor amount, so no money value is ever a
 * float. V2 stored the same integer but asked the seller to type it, which is how a $50 service became a
 * 50-cent one.
 */

/** 5000 → "$50.00", in the listing's own currency. Never converted between currencies. */
export function formatMoney(minorUnits: number, currency: Currency | string): string {
  const amount = (Number.isFinite(minorUnits) ? minorUnits : 0) / 100;
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(amount);
  } catch {
    // An unrecognised currency code must still render a number rather than throwing mid-render.
    return `${currency} ${amount.toFixed(2)}`;
  }
}

/** The symbol alone, for the price field's prefix. */
export function currencySymbol(currency: Currency | string): string {
  try {
    // Format zero and strip the digits: whatever is left is the symbol and its placement.
    return new Intl.NumberFormat(undefined, { style: "currency", currency, minimumFractionDigits: 0 })
      .format(0)
      .replace(/[\d\s.,]/g, "");
  } catch {
    return currency;
  }
}

/** "50" or "50.5" → 5000 / 5050. Returns null for anything that is not a usable amount. */
export function toMinorUnits(input: string): number | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  // Reject anything that is not a plain decimal — "1e3", "50abc" and "1,000" would all round to a surprise.
  if (!/^\d*\.?\d*$/.test(trimmed)) return null;
  const amount = Number(trimmed);
  if (!Number.isFinite(amount)) return null;
  // Round rather than truncate, and only after multiplying: 19.99 * 100 is 1998.9999… in binary floating
  // point, so Math.trunc would silently charge a cent less.
  const minor = Math.round(amount * 100);
  return Number.isSafeInteger(minor) ? minor : null;
}

/** 5000 → "50.00", for pre-filling the edit form. */
export function toMajorUnitsInput(minorUnits: number): string {
  return ((Number.isFinite(minorUnits) ? minorUnits : 0) / 100).toFixed(2);
}

/** "13 Aug 2026" — short, unambiguous, and locale-aware without a date library. */
export function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short", year: "numeric" }).format(date);
}
