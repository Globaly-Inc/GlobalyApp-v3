// Wire shapes for the public visa directory.
//
// These are V1's search_visas / get_visa_detail RPC row shapes verbatim (see
// globaly-app/src/hooks/usePublicVisas.ts) — the keys the V1 pages consumed,
// kept so the directory reads the same on both sides of the migration.
//
// `department_business_id` keeps V1's name even though a V3 immigration
// department is normally an unclaimed `institutions` row: renaming it would break
// wire parity for a field nothing renders.

export interface VisaListItem {
  service_id: string;
  name: string;
  slug: string | null;
  description: string | null;
  department_business_id: number;
  department_name: string | null;
  subclass_code: string;
  country_code: string;
  category: string | null;
  visa_stream: string | null;
  duration_months: number | null;
  is_permanent: boolean | null;
  points_test_required: boolean | null;
  min_points: number | null;
  application_fee_amount: string | null;
  application_fee_currency: string | null;
  processing_time_min_days: number | null;
  processing_time_max_days: number | null;
}

export interface VisaDetail extends Omit<VisaListItem, "slug"> {
  overview: string | null;
  department_slug: string | null;
  work_rights: unknown;
  study_rights: unknown;
  english_requirements: unknown;
  eligible_nationalities: string[] | null;
  excluded_nationalities: string[] | null;
  age_min: number | null;
  age_max: number | null;
  official_url: string | null;
  source_url: string | null;
}
