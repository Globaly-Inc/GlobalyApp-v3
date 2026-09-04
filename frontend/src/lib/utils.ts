import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** ISO 3166-1 alpha-2 to its flag emoji; empty string for anything that isn't a two-letter code. */
export function flagFromIso2(iso2: string) {
  if (!/^[A-Za-z]{2}$/.test(iso2)) return "";
  return String.fromCodePoint(...[...iso2.toUpperCase()].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));
}

/** crypto.randomUUID() only exists in secure contexts (HTTPS/localhost) — falls back to Math.random for plain-HTTP dev/LAN access. */
export function uuid(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = Math.trunc(Math.random() * 16);
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

/** Thousands separators for credit amounts and counts: "1240" -> "1,240". */
export function formatNumber(value: number | null | undefined) {
  if (value == null || Number.isNaN(value)) return "0";
  return new Intl.NumberFormat("en-US").format(value);
}

/**
 * A public price as the row stores it: "AUD 47,388", or "AUD 800 – 1,500" when `to` is given.
 * `null` when there is no amount, so a caller can drop it in place of its own null check.
 *
 * No conversion — the figure is shown in the currency it was quoted in. The code is pulled out of
 * whatever the column holds ("aud", "AUD$ 1,000") because scraped currency values are messy.
 */
export function amountLabel(
  amount: number | string | null | undefined,
  currency?: string | null,
  to?: number | string | null,
): string | null {
  // An empty column is not zero — toNumberOrNull would read "" as 0 and quote a free course.
  const num = (v: number | string | null | undefined) => (v === "" ? null : toNumberOrNull(v));
  const low = num(amount);
  if (low == null) return null;
  const high = num(to);
  const code = /[A-Za-z]{3}/.exec(currency ?? "")?.[0]?.toUpperCase();
  const range = high == null ? "" : ` – ${formatNumber(Math.round(high))}`;
  return `${code ? `${code} ` : ""}${formatNumber(Math.round(low))}${range}`;
}

/** Postgres `numeric`/`decimal` columns arrive over the wire as strings (pg avoids float precision loss) — coerce at the API boundary before a form treats it as a number. */
export function toNumberOrNull(value: number | string | null | undefined): number | null {
  if (value == null) return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isNaN(n) ? null : n;
}

type CountryWithPhoneCode = { id: number; phoneCode: string | null };

/** A stored phone (e.g. "+61 412345678") is one string — split back into code + number for editing a form. */
export function splitPhone<T extends CountryWithPhoneCode>(
  phone: string | null,
  countries: T[],
): { phoneCountryId: string; phoneNumber: string } {
  if (!phone) return { phoneCountryId: "", phoneNumber: "" };
  const withCode = countries.filter((c): c is T & { phoneCode: string } => !!c.phoneCode);
  withCode.sort((a, b) => b.phoneCode.length - a.phoneCode.length);
  const match = withCode.find((c) => phone.startsWith(c.phoneCode));
  if (!match) return { phoneCountryId: "", phoneNumber: phone };
  return { phoneCountryId: String(match.id), phoneNumber: phone.slice(match.phoneCode.length).trim() };
}
