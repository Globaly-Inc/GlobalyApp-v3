// The eight V3-only service verticals staged by the extraction pipeline
// (superadmin.extraction_{accommodation,insurance,…}) — §3.4's last gap row.

export type VerticalSlug =
  | "accommodation"
  | "insurance"
  | "banking"
  | "visa_services"
  | "test_preparation"
  | "career_services"
  | "translation"
  | "transport";

export type VerticalReviewStatus = "pending" | "promoted" | "discarded";

export type VerticalCounts = {
  pending: number;
  promoted: number;
  discarded: number;
  total: number;
};

export type VerticalSummary = {
  slug: VerticalSlug;
  label: string;
  counts: VerticalCounts;
};

/**
 * A staged row.
 *
 * The backend selects an explicit column list per vertical
 * (lib/service-verticals.summaryColumnsFor), so the shared fields below are always
 * present, and the vertical's own columns — `type` or `test_type`, plus whichever
 * price triple that vertical has — arrive alongside them. Hence the index
 * signature: the eight tables are 62–90 columns wide and no single typed shape
 * covers them without eight near-duplicate types.
 */
export type VerticalRow = {
  id: string;
  job_id: string;
  status: VerticalReviewStatus;
  promoted_service_id: string | null;
  name: string;
  provider_name: string | null;
  description: string | null;
  country_code: string | null;
  website: string | null;
  source_url: string | null;
  confidence_score: number | string | null;
  created_at: string;
  updated_at: string;
} & Record<string, unknown>;

export type VerticalRowsResponse = {
  vertical: { slug: VerticalSlug; label: string; type_column: string };
  rows: VerticalRow[];
};

export type PromoteResult = {
  service_id: string;
  org_type: "business" | "institution";
  org_id: number;
  schema_name: string;
};
