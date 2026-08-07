export type ExtractionStatus =
  | "pending"
  | "mapping"
  | "scraping"
  | "extracting"
  | "processing"
  | "verifying"
  | "review"
  | "verified"
  | "approved"
  | "done"
  | "completed"
  | "exported"
  | "pushed"
  | "declined"
  | "failed"
  | "stalled"
  | "paused";

export type ExtractionJob = {
  id: string;
  institution_name: string | null;
  institution_url: string;
  status: ExtractionStatus;
  total_pages_found: number;
  courses_extracted: number;
  verification_score: number;
  verification_total: number;
  pages_scraped: number;
  pages_failed: number;
  // Absent on the real API — V3's list query doesn't compute it (V2's did, via a
  // correlated subquery). Only present when mock data sets it explicitly.
  agent_count?: number;
  created_at: string;
  updated_at: string;
};

export type CreateJobParams = {
  institution_url: string;
};

export type InstitutionOverview = {
  id: string;
  name: string | null;
  website: string | null;
  description: string | null;
  country: string | null;
  city: string | null;
  state: string | null;
  logo_url: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  zip_code: string | null;
  facebook_url: string | null;
  instagram_url: string | null;
  twitter_url: string | null;
  linkedin_url: string | null;
  youtube_url: string | null;
  updated_at?: string | null;
};

// Shared shape for the row types we only need to count and find the most
// recent timestamp of, on the Overview tab's "Extraction Details by Tab" cards.
export type TimestampedRow = { updated_at?: string | null; created_at?: string | null };

export type CampusRow = TimestampedRow & { id: string };
export type AgentRow = TimestampedRow & { id: string };
export type CourseRow = TimestampedRow & { id: string; name: string; verification_status?: string | null };

export type CourseLinks = {
  course_fees: TimestampedRow[];
  intakes: TimestampedRow[];
  eligibility_requirements: TimestampedRow[];
  study_units: TimestampedRow[];
  study_options: TimestampedRow[];
  accreditations: TimestampedRow[];
};

export type JobFull = {
  job: ExtractionJob;
  overview: InstitutionOverview | null;
  campuses: CampusRow[];
  agents: AgentRow[];
  courses: CourseRow[];
  courseLinks: CourseLinks;
};
