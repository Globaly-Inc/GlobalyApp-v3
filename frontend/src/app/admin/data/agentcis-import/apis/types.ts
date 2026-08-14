export type AgentCISResult = {
  id: string | number;
  name: string;
  website: string | null;
  country: string | null;
  city: string | null;
};

export type ImportResult = {
  dispatched: boolean;
  job_count: number;
};

export type AgentcisJob = {
  id: string;
  institution_name: string | null;
  institution_url: string | null;
  status: string;
  source_type: string | null;
  courses_extracted: number;
  pipeline_progress: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
};
