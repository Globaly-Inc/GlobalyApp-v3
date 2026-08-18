/** Mirrors the backend jobs module's admin monitoring payloads (Wave G2). */

export type JobStatus = "draft" | "open" | "closed" | "expired";

/** One row of GET /admin/monitoring/jobs — a posting plus its employer card. */
export type AdminJob = {
  id: number;
  business_id: number | null;
  title: string;
  slug: string | null;
  status: JobStatus;
  job_type: string | null;
  category: string | null;
  location_city: string | null;
  country_name: string | null;
  is_remote: boolean;
  is_hybrid: boolean;
  pay_min: number | null;
  pay_max: number | null;
  pay_currency: string | null;
  pay_unit: string | null;
  views_count: number;
  applications_count: number;
  is_featured: boolean;
  published_at: string | null;
  closing_at: string | null;
  created_at: string;
  /** Joined employer card. Null for a scraped listing that carries only company_name. */
  business_name: string | null;
  company_name: string | null;
  logo_url: string | null;
};

export type AdminJobStats = {
  jobs: { total: number; draft: number; open: number; closed: number; expired: number };
  applications: { total: number; last_7_days: number };
};

export type ListJobsParams = {
  status?: JobStatus;
  business_id?: number;
  job_type?: string;
  category?: string;
  q?: string;
  page?: number;
  limit?: number;
};

export type Paginated<T> = {
  data: T[];
  meta: { page: number; limit: number; total: number; totalPages: number };
};
