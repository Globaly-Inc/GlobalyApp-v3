/**
 * One row of GET /enquiries. Note there is no free-text `message` on this endpoint — V1's card showed a
 * message excerpt, so the closest equivalent here is the course the enquiry is about.
 */
export type RecentEnquiry = {
  id: string;
  status: string;
  created_at: string;
  preferred_intake: string | null;
  preferred_year: number | null;
  course_name: string | null;
  course_short_name: string | null;
  institution_name: string | null;
  institution_logo_url: string | null;
};

/** The rail needs both the five most recent and the true total, which is `meta.total`. */
export type RecentEnquiries = { items: RecentEnquiry[]; total: number };
