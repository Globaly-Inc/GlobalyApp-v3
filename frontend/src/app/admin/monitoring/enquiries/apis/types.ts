// Wire types for the admin's read-only view of the course-enquiry pipeline.

export interface AdminEnquiry {
  id: string;
  status: string;
  created_at: string;
  preferred_intake: string | null;
  preferred_year: number | null;
  accept_count: number;
  max_accepts: number;
  last_distributed_at: string | null;
  course_name: string;
  institution_name: string | null;
  student_id: number;
  student_name: string;
  student_email: string;
  /** Businesses the matcher sent it to, how many paid, and the coins they spent. */
  recipients: number;
  unlocked_count: number;
  coins_spent: number;
}

export interface AdminEnquiryDistribution {
  id: string;
  business_id: number;
  business_name: string;
  /** An enquiry nobody represented falls back to the institution that owns the course. */
  recipient_kind: "business" | "institution";
  city: string | null;
  tier: number;
  match_rank: number;
  match_distance_km: string | number | null;
  status: string;
  coin_cost: number;
  unlocked_at: string | null;
  closed_at: string | null;
  close_reason: string | null;
  created_at: string;
}

export interface AdminEnquiryDetail {
  id: string;
  status: string;
  message: string;
  created_at: string;
  preferred_intake: string | null;
  preferred_year: number | null;
  student_country_code: string | null;
  accept_count: number;
  max_accepts: number;
  distribution_count: number;
  last_distributed_at: string | null;
  closed_at: string | null;
  close_reason: string | null;
  course_name: string;
  course_short_name: string | null;
  institution_name: string | null;
  student_id: number;
  student_name: string;
  student_email: string;
  /** Set only when the student aimed the enquiry at one business instead of being matched out. */
  target_business_name: string | null;
  distributions: AdminEnquiryDistribution[];
}

export interface AdminEnquiryStats {
  /** One row per status actually present — a status with no enquiries is absent, not zero. */
  statuses: { status: string; count: number }[];
  total: number;
  distributions: { total: number; unlocked: number; coins_spent: number };
}

export interface Paginated<T> {
  data: T[];
  meta: { page: number; limit: number; total: number; totalPages: number };
}

export interface EnquiryListParams {
  search?: string;
  status?: string;
  page?: number;
}
