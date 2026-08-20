// Wire types for the student-facing enquiry endpoints.
export type EnquiryStatus =
  | "pending"
  | "distributed"
  | "unlocked"
  | "in_conversation"
  | "converted"
  | "closed"
  | "no_match"
  | "expired";

export type Enquiry = {
  id: string;
  student_id: number;
  course_id: string;
  extraction_job_id: string | null;
  /** extraction_institution_overview.id — derived server-side from the course's job. */
  institution_id: string | null;
  business_id: number | null;
  message: string;
  preferred_intake: string | null;
  preferred_year: number | null;
  status: EnquiryStatus;
  max_accepts: number;
  accept_count: number;
  distribution_count: number;
  last_distributed_at: string | null;
  closed_at: string | null;
  close_reason: string | null;
  created_at: string;
  updated_at: string;
  // Joined for display by GET /enquiries/:id (same join as the list endpoint).
  course_name: string;
  course_short_name: string | null;
  institution_name: string | null;
  institution_logo_url: string | null;
  /** Businesses that paid to unlock. Never the full recipient list — the server
   * only ever returns the ones who unlocked. */
  unlocked_businesses: UnlockedBusiness[];
};

export type EnquiryListItem = {
  id: string;
  status: EnquiryStatus;
  created_at: string;
  preferred_intake: string | null;
  preferred_year: number | null;
  course_name: string;
  course_short_name: string | null;
  institution_name: string | null;
  institution_logo_url: string | null;
};

export type PaginatedResponse<T> = {
  data: T[];
  meta: { page: number; limit: number; total: number; totalPages: number };
};

export type CreateEnquiryInput = {
  course_id: string;
  extraction_job_id?: string | null;
  business_id?: number | null;
  message: string;
  preferred_intake?: string | null;
  preferred_year?: number | null;
};

/**
 * Course option for the new-enquiry picker — GET /courses.
 * Only id/job_id/name are reliably populated in extracted data; everything else is
 * nullable in practice. `id` is extraction_courses.id, which is what an enquiry's
 * course_id must be. Fee totals arrive as strings (pg numeric via knex).
 *
 * Lives here rather than in a courses feature: the picker is the only consumer.
 */
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

/** A business that paid to unlock the enquiry — the only recipients a student sees. */
export interface UnlockedBusiness {
  /** The chat thread is addressed by distribution, not by business. */
  distribution_id: string;
  business_id: number;
  business_name: string;
  logo_url: string | null;
  city: string | null;
  unlocked_at: string;
  /** Thread is read-only once the business closes its copy. */
  is_closed: boolean;
}
