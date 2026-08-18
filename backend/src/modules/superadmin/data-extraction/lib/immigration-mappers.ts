// Staged immigration row → live row. Pure functions, no database, no clock — the
// same split promote-mappers.ts uses so the mapping rules are unit-testable
// without a Postgres.
//
// PORTED FROM the V1 RPCs promote_visa_to_service and promote_mara_to_business
// (§3.4), with two corrections:
//
//  1. V1's MARA RPC read a `full_name` column that does not exist on the staging
//     table, so it raised on EVERY promote and the feature never worked. The real
//     column is `agent_name`, with `business_name` as the fallback.
//  2. V1 copied the scraped `email`, `phone` and `office_address` onto the public
//     agent record. V2 dropped them when it redefined agent_mara_details, and V3
//     keeps them out of the live table entirely — they stay on the staging row.
//     mapMaraDetails is where that boundary is enforced, and the leak test asserts
//     it from the outside.

export interface StagedVisa {
  id: string;
  country_code: string | null;
  subclass_code: string | null;
  visa_stream: string | null;
  category: string | null;
  name: string | null;
  description: string | null;
  duration_months: number | null;
  is_permanent: boolean | null;
  work_rights: unknown;
  study_rights: unknown;
  points_test_required: boolean | null;
  min_points: number | null;
  english_requirements: unknown;
  age_min: number | null;
  age_max: number | null;
  eligible_nationalities: string[] | null;
  excluded_nationalities: string[] | null;
  application_fee_amount: string | number | null;
  application_fee_currency: string | null;
  processing_time_min_days: number | null;
  processing_time_max_days: number | null;
  official_url: string | null;
  source_url: string | null;
  confidence_score: string | number | null;
}

export interface StagedMaraAgent {
  id: string;
  marn: string;
  agent_name: string | null;
  business_name: string | null;
  registration_status: string | null;
  registration_date: string | null;
  expiry_date: string | null;
  website: string | null;
  practice_areas: string[] | null;
  languages_spoken: string[] | null;
  office_country: string | null;
  office_state: string | null;
  office_city: string | null;
  source_url: string | null;
}

/** A staged row that cannot become a valid live row, with the reason why. */
export interface MapResult<T> {
  row: T | null;
  reason?: string;
}

export type Row = Record<string, unknown>;

/**
 * The public name of a visa: the extracted name verbatim.
 *
 * Deliberately NOT reformatted into "Subclass 500 — Student visa" or similar. The
 * V1 RPC body lives only in the V1 database (§3.4) and cannot be read from this
 * repo, so inventing a title format would be guessing at parity rather than
 * porting it — and the subclass code is already its own field on the wire. The
 * fallback exists only so a row with a code but no name is still promotable.
 */
export function visaServiceName(staged: Pick<StagedVisa, "name" | "subclass_code">): string | null {
  const name = staged.name?.trim() || null;
  const code = staged.subclass_code?.trim() || null;
  return name ?? (code ? `Subclass ${code}` : null);
}

/**
 * The tenant `business_services` row. country_code and subclass_code are the
 * natural key of the whole feature, so a staged row missing either is left in
 * staging rather than promoted into an unaddressable service.
 */
export function mapVisaToService(
  staged: StagedVisa,
  opts: { serviceCategoryId: number | null; publish: boolean },
): MapResult<Row> {
  const country = staged.country_code?.trim().toUpperCase() || null;
  const subclass = staged.subclass_code?.trim() || null;
  if (!country) return { row: null, reason: "missing country_code — the visa detail URL is /:country/:subclass" };
  if (!subclass) return { row: null, reason: "missing subclass_code — the visa detail URL is /:country/:subclass" };

  const name = visaServiceName(staged);
  if (!name) return { row: null, reason: "missing name and subclass_code" };

  return {
    row: {
      name,
      description: staged.description ?? null,
      overview: staged.description ?? null,
      service_category_id: opts.serviceCategoryId,
      is_published: opts.publish,
      is_featured: false,
      extraction_source_id: staged.id,
    },
  };
}

/** The master `visa_service_details` row that hangs off the promoted service. */
export function mapVisaDetails(staged: StagedVisa, serviceId: string, schemaName: string): Row {
  return {
    service_id: serviceId,
    schema_name: schemaName,
    country_code: staged.country_code!.trim().toUpperCase(),
    subclass_code: staged.subclass_code!.trim(),
    visa_stream: staged.visa_stream ?? null,
    category: staged.category ?? null,
    duration_months: staged.duration_months ?? null,
    is_permanent: staged.is_permanent ?? false,
    work_rights: jsonbOrNull(staged.work_rights),
    study_rights: jsonbOrNull(staged.study_rights),
    points_test_required: staged.points_test_required ?? false,
    min_points: staged.min_points ?? null,
    english_requirements: jsonbOrNull(staged.english_requirements),
    age_min: staged.age_min ?? null,
    age_max: staged.age_max ?? null,
    eligible_nationalities: staged.eligible_nationalities ?? null,
    excluded_nationalities: staged.excluded_nationalities ?? null,
    application_fee_amount: staged.application_fee_amount ?? null,
    application_fee_currency: staged.application_fee_currency ?? null,
    processing_time_min_days: staged.processing_time_min_days ?? null,
    processing_time_max_days: staged.processing_time_max_days ?? null,
    official_url: staged.official_url ?? null,
    source_url: staged.source_url ?? null,
    confidence_score: staged.confidence_score ?? null,
    extraction_source_id: staged.id,
  };
}

/**
 * The display name of a promoted MARA agent.
 *
 * THIS IS THE V1 BUG. promote_mara_to_business read `full_name`, a column that has
 * never existed on the staging table, so every promote raised
 * `record "staged" has no field "full_name"`. The registrar publishes the agent's
 * own name (`agent_name`) and, separately, the practice they work for
 * (`business_name`); the agent's name is the identity, so it wins, with the
 * practice as the fallback and finally the MARN so the row is always nameable.
 */
export function maraOrgName(staged: Pick<StagedMaraAgent, "agent_name" | "business_name" | "marn">): string {
  return staged.agent_name?.trim() || staged.business_name?.trim() || `MARA agent ${staged.marn}`;
}

/**
 * The unclaimed `institutions` row a promoted MARA agent becomes.
 *
 * Why institutions and not businesses: V3's `businesses.owner_id` is NOT NULL, so
 * there is no way to create a business for an agency nobody has claimed. V3's
 * table for exactly that is `institutions` with claim_status='unclaimed'
 * (20260816_001), which is also what the extraction promote path already creates
 * for scraped schools. `email` and `phone` are deliberately NOT carried across —
 * see the header.
 */
export function mapMaraToOrg(staged: StagedMaraAgent): Row {
  return {
    institution_name: maraOrgName(staged),
    website: staged.website ?? null,
    state: staged.office_state ?? null,
    city: staged.office_city ?? null,
    claim_status: "unclaimed",
    status: "pending",
    is_published: false,
  };
}

/** The master `agent_mara_details` row. Registration record only — no contact PII. */
export function mapMaraDetails(
  staged: StagedMaraAgent,
  org: { type: "business" | "institution"; id: number },
): Row {
  return {
    org_type: org.type,
    org_id: org.id,
    marn: staged.marn,
    registration_status: staged.registration_status ?? null,
    registration_date: staged.registration_date ?? null,
    expiry_date: staged.expiry_date ?? null,
    business_name: staged.business_name ?? null,
    practice_areas: staged.practice_areas ?? null,
    languages_spoken: staged.languages_spoken ?? null,
    office_country: staged.office_country ?? null,
    office_state: staged.office_state ?? null,
    office_city: staged.office_city ?? null,
    source_url: staged.source_url ?? null,
    extraction_source_id: staged.id,
  };
}

/**
 * node-pg renders a JS object as `[object Object]` and a JS array as a Postgres
 * array literal, either of which a jsonb column rejects. Same fix
 * business-services.repository.serializeJsonb uses.
 */
function jsonbOrNull(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  return typeof value === "string" ? value : JSON.stringify(value);
}
