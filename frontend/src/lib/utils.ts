import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatNumber(value: number | null | undefined) {
  if (value == null || Number.isNaN(value)) return "0";
  return new Intl.NumberFormat("en-US").format(value);
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
