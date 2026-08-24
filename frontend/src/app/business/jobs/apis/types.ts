// Wire types for /api/v3/jobs/*. Matches backend/src/modules/jobs/schemas + repositories.

export type JobType = "full_time" | "part_time" | "casual" | "contract" | "internship";
export type ApplicationStatus = "applied" | "reviewed" | "rejected" | "hired";

export type Job = {
  id: number;
  title: string;
  description: string | null;
  job_type: JobType | null;
  location_city: string | null;
  is_remote: boolean;
  pay_min: string | null;
  pay_max: string | null;
  pay_currency: string | null;
  pay_unit: "hour" | "year" | null;
  is_published: boolean;
  closing_date: string | null;
  applicant_count: number;
  created_at: string;
  updated_at: string;
};

export type CreateJobInput = {
  title: string;
  description?: string | null;
  job_type?: JobType | null;
  location_city?: string | null;
  is_remote: boolean;
  pay_min?: number | null;
  pay_max?: number | null;
  pay_currency?: string | null;
  pay_unit?: "hour" | "year" | null;
  closing_date?: string | null;
};

export type UpdateJobInput = Partial<CreateJobInput> & { is_published?: boolean };

export type Application = {
  id: number;
  job_id: number;
  applicant_name: string;
  applicant_email: string;
  status: ApplicationStatus;
  cover_note: string | null;
  resume_url: string | null;
  created_at: string;
};
