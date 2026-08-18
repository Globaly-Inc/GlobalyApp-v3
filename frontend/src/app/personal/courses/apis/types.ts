// Wire types for GET /courses — mirrors the backend's CourseListRow.
// Only id/job_id/name are reliably populated in extracted data; everything else
// is nullable in practice, so the UI must render a fallback for each.
// Fee totals arrive as strings (pg `numeric` comes back as text through knex).

export interface Course {
  id: string;
  job_id: string;
  name: string;
  short_name: string | null;
  degree_level: string | null;
  subject_area: string | null;
  duration_weeks: number | null;
  study_mode: string | null;
  country_code: string | null;
  domestic_fee_total: string | null;
  domestic_currency: string | null;
  international_fee_total: string | null;
  international_currency: string | null;
  awarding_institution: string | null;
  image_url: string | null;
  institution_name: string | null;
  institution_logo_url: string | null;
}

export interface PaginatedResponse<T> {
  data: T[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}
