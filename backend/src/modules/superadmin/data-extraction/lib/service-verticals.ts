// The eight V3-only service verticals — registry + staged-row → live-row mapping.
//
// These tables (superadmin/20260812_001..008) exist in neither V1 nor V2, so there
// is no upstream contract to port. The contract is V3's own: the whitelist in
// jobs.repository.ts (which is the tables' only existing consumer), the eight
// matching public.service_categories slugs, and the way the immigration vertical
// already does review/promote (lib/immigration-mappers.ts, Wave G1).
//
// Pure functions, no database and no clock — the same split immigration-mappers.ts
// and promote-mappers.ts use, so the mapping rules are unit-testable without a
// Postgres and the repository stays queries-only.
//
// WHY THE PROMOTE TARGET IS business_services AND NOT A NEW DETAILS TABLE
// The visa vertical needed visa_service_details because V1/V2 had that exact
// table. These eight do not exist upstream, and the tenant catalog already carries
// the slot for per-category fields: business_services.category_specific_data
// ("mirrors schema_field_values", business/20260816_001). Eight new details tables
// multiplied across every tenant schema would be eight tables for data the catalog
// already has a home for — so nothing is migrated here and the vertical's own
// fields land in that jsonb.
//
// CONTACT PII STAYS IN STAGING. A promoted business_services row is publishable, so
// it must not carry the scraped landlord/agent contact details. This is the same
// boundary mapMaraDetails enforces (V1 copied email/phone/office_address onto the
// public agent record; V2 dropped them and V3 keeps them out entirely).

/** How one vertical's staging table differs from the others. */
export interface VerticalSpec {
  /** Route param, and the public.service_categories slug the staging table is named after. */
  slug: string;
  /** The superadmin staging table. Never interpolated from user input — see verticalSpec(). */
  table: string;
  label: string;
  /**
   * Seven tables call the sub-type `type`; extraction_test_preparation calls it
   * `test_type`. A shared column list would select a column that is not there.
   */
  typeColumn: string;
  /**
   * The columns that become business_services.price / price_currency / price_type,
   * or null when the vertical genuinely has no single price.
   */
  price: { amount: string; currency: string; period: string | null } | null;
}

export const SERVICE_VERTICALS: readonly VerticalSpec[] = [
  {
    slug: "accommodation",
    table: "extraction_accommodation",
    label: "Accommodation",
    typeColumn: "type",
    price: { amount: "price_amount", currency: "price_currency", period: "price_period" },
  },
  {
    slug: "insurance",
    table: "extraction_insurance",
    label: "Insurance",
    typeColumn: "type",
    price: { amount: "premium_amount", currency: "premium_currency", period: "premium_period" },
  },
  {
    slug: "banking",
    table: "extraction_banking",
    label: "Banking & Finance",
    typeColumn: "type",
    // A bank account has a monthly fee, an annual fee and a dozen transaction
    // fees; no one of them is "the price". Promoting one of them as THE price
    // would misprice the listing, so none is promoted and they all stay in
    // category_specific_data.
    price: null,
  },
  {
    slug: "visa_services",
    table: "extraction_visa_services",
    label: "Visa Services",
    typeColumn: "type",
    price: { amount: "fee_amount", currency: "fee_currency", period: "fee_type" },
  },
  {
    slug: "test_preparation",
    table: "extraction_test_preparation",
    label: "Test Preparation",
    typeColumn: "test_type",
    price: { amount: "fee_amount", currency: "fee_currency", period: "fee_period" },
  },
  {
    slug: "career_services",
    table: "extraction_career_services",
    label: "Career Services",
    typeColumn: "type",
    price: { amount: "fee_amount", currency: "fee_currency", period: "fee_type" },
  },
  {
    slug: "translation",
    table: "extraction_translation",
    label: "Translation",
    typeColumn: "type",
    price: { amount: "fee_amount", currency: "fee_currency", period: "fee_type" },
  },
  {
    slug: "transport",
    table: "extraction_transport",
    label: "Transport",
    typeColumn: "type",
    price: { amount: "fee_amount", currency: "fee_currency", period: "fee_type" },
  },
];

export const VERTICAL_SLUGS: readonly string[] = SERVICE_VERTICALS.map((v) => v.slug);

const BY_SLUG = new Map(SERVICE_VERTICALS.map((v) => [v.slug, v]));

/**
 * The only way a table name enters SQL in this feature. An unknown slug returns
 * null and the route 400s, so a slug can never reach a query as an unchecked
 * identifier — same guarantee serviceTableForSlug() gives the jobs list.
 */
export function verticalSpec(slug: string | null | undefined): VerticalSpec | null {
  return BY_SLUG.get(slug ?? "") ?? null;
}

/** Columns every one of the eight tables has. */
const SHARED_COLUMNS = [
  "id",
  "job_id",
  "status",
  "promoted_service_id",
  "name",
  "provider_name",
  "description",
  "country_code",
  "website",
  "source_url",
  "confidence_score",
  "created_at",
  "updated_at",
] as const;

/**
 * The explicit column list for a list read. Never `*`: raw_payload alone can be
 * megabytes of scraper output, and a wildcard would put whatever a later migration
 * adds — contact details included — on the wire.
 */
export function summaryColumnsFor(spec: VerticalSpec): string[] {
  return [
    ...SHARED_COLUMNS,
    spec.typeColumn,
    ...(spec.price ? [spec.price.amount, spec.price.currency, ...(spec.price.period ? [spec.price.period] : [])] : []),
  ];
}

/**
 * Staging bookkeeping and the raw scraper payload: never promoted. `name` and
 * `description` are excluded here because the live row carries them in its own
 * typed columns, so keeping them would duplicate them into the jsonb too.
 */
const NOT_PROMOTED = new Set([
  "id",
  "job_id",
  "status",
  "promoted_service_id",
  "name",
  "description",
  "raw_payload",
  "created_at",
  "updated_at",
]);

/**
 * Scraped contact details. The promoted row is publishable; these stay in staging.
 * See the header — this is mapMaraDetails' boundary, applied to eight more tables.
 */
const CONTACT_PII = new Set([
  "contact_name",
  "contact_email",
  "contact_phone",
  "contact_whatsapp",
  "claims_email",
  "claims_phone",
]);

export type Row = Record<string, unknown>;

/** A staged row that cannot become a valid live row, with the reason why. */
export interface MapResult<T> {
  row: T | null;
  reason?: string;
}

/**
 * The tenant `business_services` row a staged vertical row promotes to.
 *
 * `extraction_source_id` is the idempotency key the whole promote family uses
 * (business/20260817_001): UNIQUE on business_services, so promoting the same
 * staged row twice updates in place and leaves exactly one live row.
 */
export function mapVerticalToService(
  spec: VerticalSpec,
  staged: Row,
  opts: { serviceCategoryId: number | null; publish: boolean },
): MapResult<Row> {
  const name = typeof staged.name === "string" ? staged.name.trim() : "";
  // NOT NULL on all eight tables, so this only fires on whitespace — but a
  // service with a blank name is unaddressable, and an admin fixing the staged
  // row is the right outcome, not a 500.
  if (!name) return { row: null, reason: "missing name — a service must be nameable" };

  const price = spec.price ? numericOrNull(staged[spec.price.amount]) : null;
  const currency = spec.price && price !== null ? (asText(staged[spec.price.currency]) ?? null) : null;
  const period = spec.price?.period ? asText(staged[spec.price.period]) : null;

  const extra: Row = {};
  for (const [key, value] of Object.entries(staged)) {
    if (NOT_PROMOTED.has(key) || CONTACT_PII.has(key)) continue;
    if (spec.price && (key === spec.price.amount || key === spec.price.currency || key === spec.price.period)) continue;
    if (value === null || value === undefined) continue;
    extra[key] = value;
  }

  return {
    row: {
      name,
      description: staged.description ?? null,
      overview: staged.description ?? null,
      service_category_id: opts.serviceCategoryId,
      is_published: opts.publish,
      is_featured: false,
      price,
      price_currency: currency,
      // business_services.price_type defaults to "fixed"; the staged period is the
      // more specific answer when the vertical has one.
      price_type: price === null ? null : (period ?? "fixed"),
      // node-pg renders a JS object as `[object Object]`, which jsonb rejects —
      // same serialize step immigration-mappers.jsonbOrNull exists for.
      category_specific_data: JSON.stringify(extra),
      extraction_source_id: staged.id,
    },
  };
}

/** A scraped amount is text as often as it is a number, and "on application" is neither. */
function numericOrNull(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function asText(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
