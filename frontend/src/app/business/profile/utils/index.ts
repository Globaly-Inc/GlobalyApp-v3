import { joinParts } from "@/app/(web)/components/profile/profile-data";
import type { BusinessProfile } from "@/app/business/apis/types";
import type { Country } from "@/app/geo/apis";
import { authApi } from "@/app/auth/apis";
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

// Mirrors backend's `courseSlug(name, id)` scheme (see search/utils/slug.ts) used for public
// course URLs: slugified name + the first 6 hex chars of the course's uuid, dashes stripped.
export function coursePublicSlug(name: string, id: string): string {
  const slugified = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `${slugified}-${id.replace(/-/g, "").slice(0, 6)}`;
}

// Mints a short-lived, single-purpose preview token (never the caller's own session access
// token — that would be a fully reusable credential sitting in browser history/logs/referrer
// once it's in a URL) so an unpublished institution's owner can still open the course's real
// public page. Harmless once the institution is published too: the backend bypass is an OR
// against is_published.
export async function coursePublicHref(name: string, id: string): Promise<string> {
  const path = `/course/${coursePublicSlug(name, id)}`;
  try {
    const { preview_token } = await authApi.mintPreviewToken();
    return `${path}?preview_token=${encodeURIComponent(preview_token)}`;
  } catch {
    return path;
  }
}
