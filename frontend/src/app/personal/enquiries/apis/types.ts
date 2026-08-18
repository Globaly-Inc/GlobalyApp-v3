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
