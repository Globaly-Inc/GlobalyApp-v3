import { OPERATORS_BY_TYPE, type FilterFieldDefinition, type FilterFieldOption } from "@/components/filters/types";
import type { ColumnDefinition } from "@/lib/use-column-preferences";

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

// ─── Service management table ─────────────────────────────────────────────────

/**
 * Service categories whose services are courses: they get the academic tabs (Intakes,
 * Eligibility, Study Options, Study Units, Accreditations) and the Course details card, while
 * every other category gets Summary and Fees plus its own schema fields.
 *
 * V1 and the superadmin editor hardcode the single `courses` slug; Short Courses is just as
 * academic — same degree level, same intakes — so it belongs on the same side of the gate.
 * Keep this in step with migration 20260921_002, which owns the matching schema_fields rows.
 */
export const COURSE_CATEGORY_SLUGS = new Set(["courses", "short_courses"]);

/** Preference bucket + saved-filter bucket for the service management table. */
export const SERVICES_MODULE_KEY = "business_services";

export const SERVICES_PAGE_SIZE = 20;

/**
 * Every column the service management table can show, in default display order. Ported from
 * V1's `SERVICE_COLUMNS` minus the six it draws from `business_services` columns V3 doesn't
 * have (location, price type, currency, slug, tags, featured) — those need a tenant migration
 * before they can be listed here.
 *
 * `locked` columns can't be hidden and `defaultFrozen` ones start pinned into the sticky
 * left-hand block, so the row's identity and its actions stay reachable at any scroll offset.
 */
export const SERVICE_COLUMNS: ColumnDefinition[] = [
  { key: "name", label: "Service Name", sortable: true, locked: true, defaultVisible: true, defaultFrozen: true },
  { key: "actions", label: "Actions", sortable: false, locked: true, defaultVisible: true, defaultFrozen: true },
  { key: "category", label: "Category", sortable: true, defaultVisible: true },
  { key: "degree_level", label: "Degree Level", sortable: true, defaultVisible: true },
  { key: "area_of_study", label: "Subject Area", sortable: true, defaultVisible: true },
  { key: "duration", label: "Duration", sortable: true, defaultVisible: true },
  { key: "price", label: "Price", sortable: true, defaultVisible: true },
  { key: "status", label: "Status", sortable: true, defaultVisible: true },
  { key: "description", label: "Description", sortable: false, defaultVisible: false },
  { key: "created_at", label: "Created", sortable: true, defaultVisible: false },
  { key: "updated_at", label: "Updated", sortable: true, defaultVisible: false },
];

const STATUS_OPTIONS: FilterFieldOption[] = [
  { value: "true", label: "Published" },
  { value: "false", label: "Draft" },
];

/**
 * Filter fields for the services panel. Select options come from the rows actually loaded —
 * the same approach V1 takes, so the dropdowns only ever offer values that can match something.
 */
export function buildServiceFilterFields({
  categories,
  degreeLevels,
  areasOfStudy,
}: Readonly<{ categories: FilterFieldOption[]; degreeLevels: FilterFieldOption[]; areasOfStudy: FilterFieldOption[] }>): FilterFieldDefinition[] {
  return [
    { fieldId: "name", label: "Service Name", type: "text", operators: OPERATORS_BY_TYPE.text },
    { fieldId: "category_name", label: "Category", type: "single_select", operators: OPERATORS_BY_TYPE.single_select, options: categories },
    { fieldId: "is_published", label: "Status", type: "single_select", operators: OPERATORS_BY_TYPE.single_select, options: STATUS_OPTIONS },
    { fieldId: "degree_level", label: "Degree Level", type: "single_select", operators: OPERATORS_BY_TYPE.single_select, options: degreeLevels },
    { fieldId: "area_of_study", label: "Subject Area", type: "single_select", operators: OPERATORS_BY_TYPE.single_select, options: areasOfStudy },
    { fieldId: "duration", label: "Duration", type: "text", operators: OPERATORS_BY_TYPE.text },
    { fieldId: "price", label: "Price", type: "currency", operators: OPERATORS_BY_TYPE.currency },
    { fieldId: "description", label: "Description", type: "text", operators: OPERATORS_BY_TYPE.text },
    { fieldId: "created_at", label: "Created", type: "date", operators: OPERATORS_BY_TYPE.date },
    { fieldId: "updated_at", label: "Updated", type: "date", operators: OPERATORS_BY_TYPE.date },
  ];
}
