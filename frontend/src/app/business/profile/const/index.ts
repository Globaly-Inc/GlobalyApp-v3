/** Labels V1 showed in the profile hero's category badge, keyed by `businesses.business_type`. */
export const BUSINESS_TYPE_LABELS: Record<string, string> = {
  agent: "Education Agency",
  institution: "Institution",
  service_provider: "Service Provider",
  immigration_department: "Immigration Department",
};

/**
 * V1 faded each profile card's edit pencil in on hover rather than showing it permanently.
 * `ProfileSection` owns the `group/card` these hang off, so any card header can use this.
 *
 * `focus-visible:` is not in V1: an `opacity-0` button still takes tab focus, so without it a
 * keyboard user lands on a control they cannot see.
 */
export const HEADER_PENCIL =
  "opacity-0 transition-opacity group-hover/card:opacity-100 focus-visible:opacity-100";

/**
 * Ownership sector for an institution. Exactly the two values the
 * `institutions_institution_type_check` constraint allows — see migration 20260909_003, which
 * narrowed this column from free-text categories ("University", "TAFE") to a sector.
 */
export const INSTITUTION_TYPE_OPTIONS = [
  { value: "Public", label: "Public" },
  { value: "Private", label: "Private" },
];

// Registration identifiers and license types used to live here. They are admin-managed reference
// data now — Platform → Categories → Registration Types and → Accreditations — fetched by
// registration-licenses-card.tsx so adding a country's identifier is no longer a deploy.