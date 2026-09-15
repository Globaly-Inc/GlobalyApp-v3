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

/**
 * Registration identifiers by country, ported from V1's `RegistrationLicensesForm`. Keyed by
 * country name because that is what the profile's country resolves to; anything not listed falls
 * back to `DEFAULT_REGISTRATION_TYPES`.
 */
export const COUNTRY_REGISTRATION_TYPES: Record<string, { value: string; label: string }[]> = {
  Australia: [{ value: "ABN", label: "ABN (11 digits)" }, { value: "ACN", label: "ACN (9 digits)" }],
  "United States": [{ value: "EIN", label: "EIN (XX-XXXXXXX)" }],
  "United Kingdom": [{ value: "Company Number", label: "Company Number (8 characters)" }],
  Canada: [{ value: "BN", label: "Business Number (BN)" }],
  "New Zealand": [{ value: "NZBN", label: "NZBN (13 digits)" }],
  India: [{ value: "CIN", label: "CIN" }, { value: "GSTIN", label: "GSTIN (15 characters)" }],
  Singapore: [{ value: "UEN", label: "UEN (9-10 characters)" }],
};

export const DEFAULT_REGISTRATION_TYPES = [
  { value: "Business Registration Number", label: "Business Registration Number" },
];

/** Industry accreditations an agent or institution can hold — V1's `LICENSE_TYPE_OPTIONS`. */
export const LICENSE_TYPE_OPTIONS = [
  { value: "MARA", label: "MARA", description: "Migration Agents Registration Authority (AU)" },
  { value: "CRICOS", label: "CRICOS", description: "Commonwealth Register of Institutions and Courses (AU)" },
  { value: "QEAC", label: "QEAC", description: "Qualified Education Agent Counsellor (AU)" },
  { value: "PIER", label: "PIER", description: "Professional International Education Resources (AU)" },
  { value: "IRCC", label: "IRCC", description: "Immigration, Refugees and Citizenship Canada" },
  { value: "CICC", label: "CICC", description: "College of Immigration and Citizenship Consultants (CA)" },
  { value: "IAA", label: "IAA", description: "Immigration Advisers Authority (NZ)" },
  { value: "OISC", label: "OISC", description: "Immigration Advice Authority (UK)" },
  { value: "ICEF", label: "ICEF", description: "ICEF Agency Status (Global)" },
  { value: "AIRC", label: "AIRC", description: "American International Recruitment Council (US)" },
  { value: "Other", label: "Other", description: "Custom license type" },
];
