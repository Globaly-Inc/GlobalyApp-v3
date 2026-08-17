import { isValidPhoneNumber, type CountryCode } from "libphonenumber-js";

export function toSlug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export function sanitizeSlug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9-]/g, "");
}

export function isValidEmail(value: string): boolean {
  return /^\S+@\S+\.\S+$/.test(value);
}

export function isValidUrl(value: string): boolean {
  return /^https?:\/\/\S+\.\S+/.test(value);
}

export function buildPhone(phoneCode: string, phoneNumber: string): string {
  return [phoneCode, phoneNumber].filter(Boolean).join(" ");
}

export function isValidPhoneForCountry(phoneNumber: string, iso2: string | undefined): boolean {
  if (!iso2) return false;
  return isValidPhoneNumber(phoneNumber, iso2.toUpperCase() as CountryCode);
}

export function filterBusinessesBySourceAndOwnership<T extends { is_unclaimed: boolean }>(
  businesses: T[],
  sourceFilter: string,
  ownershipFilter: string,
): T[] {
  return businesses.filter((b) => {
    if (sourceFilter === "pre-seeded" && !b.is_unclaimed) return false;
    if (sourceFilter === "user-created" && b.is_unclaimed) return false;
    if (ownershipFilter === "owned" && b.is_unclaimed) return false;
    if (ownershipFilter === "unclaimed" && !b.is_unclaimed) return false;
    return true;
  });
}
