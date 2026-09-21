import { joinParts } from "@/app/(web)/components/profile/profile-data";
import type { BusinessProfile } from "@/app/business/apis/types";
import type { Country } from "@/app/geo/apis";
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
