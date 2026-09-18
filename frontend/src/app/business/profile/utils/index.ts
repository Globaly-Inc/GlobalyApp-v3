import { joinParts } from "@/app/(web)/components/profile/profile-data";
import type { BusinessProfile } from "@/app/business/apis/types";
import type { Country } from "@/app/geo/apis";
import type { BusinessService } from "../apis/types";
import { BUSINESS_TYPE_LABELS } from "../const";

/** Falls back to the raw enum value so an unmapped type still reads as something. */
export function businessTypeLabel(type: string | null): string | null {
  return type ? BUSINESS_TYPE_LABELS[type] ?? type : null;
}

/** The line under the profile name — "Lalitpur, Bagmati Province, Nepal". */
export function businessLocationLine(
  profile: Pick<BusinessProfile, "city" | "state" | "country_id">,
  countries: Country[],
): string | null {
  const country = countries.find((c) => c.id === profile.country_id)?.name ?? null;
  return joinParts(profile.city, profile.state, country);
}

// ─── Service management table ─────────────────────────────────────────────────

/** Flat, string-keyed view of a service for the client-side filter matcher. */
export function flattenService(service: BusinessService): Record<string, unknown> {
  return {
    ...service,
    // The matcher compares stringified values, and the Status field's options are "true"/"false".
    is_published: String(service.is_published),
  };
}

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

/** The value a given column sorts on — numbers stay numbers so 9 sorts before 10. */
function sortKey(service: BusinessService, column: string): string | number {
  switch (column) {
    case "name": return service.name;
    case "category": return service.category_name ?? "";
    case "degree_level": return service.degree_level ?? "";
    case "area_of_study": return service.area_of_study ?? "";
    case "duration": return service.duration ?? "";
    case "price": return Number(service.price ?? 0) || 0;
    case "status": return service.is_published ? 1 : 0;
    case "created_at": return service.created_at;
    case "updated_at": return service.updated_at;
    default: return "";
  }
}

export function sortServices(rows: BusinessService[], column: string | null, direction: "asc" | "desc" | null): BusinessService[] {
  if (!column || !direction) return rows;
  const sign = direction === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const left = sortKey(a, column);
    const right = sortKey(b, column);
    if (typeof left === "number" && typeof right === "number") return (left - right) * sign;
    return collator.compare(String(left), String(right)) * sign;
  });
}

/** Distinct, alphabetised `{ value, label }` options for one field across the loaded rows. */
export function distinctOptions(rows: BusinessService[], pick: (row: BusinessService) => string | null | undefined) {
  const values = new Set<string>();
  for (const row of rows) {
    const value = pick(row);
    if (value) values.add(value);
  }
  return [...values].sort(collator.compare).map((value) => ({ value, label: value }));
}

export function formatServiceDate(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" });
}

/** Prices arrive as a decimal string from Postgres; show a grouped number, or "Free" at zero. */
export function formatServicePrice(price: string | null): string {
  if (price == null || price === "") return "Free";
  const amount = Number(price);
  if (Number.isNaN(amount)) return price;
  return amount > 0 ? amount.toLocaleString() : "Free";
}
