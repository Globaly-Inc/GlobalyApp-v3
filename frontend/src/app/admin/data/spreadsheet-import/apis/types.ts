export type ImportInstitutionPayload = {
  institution: Record<string, string | null> & { name: string };
  rows: Record<string, string | null>[];
  extras?: Record<string, Record<string, string | null>[]>;
};
export type ImportInstitutionResult = { job_id: string };
/** The extraction job's own status — the import request only queues it. */
export type ImportJobStatus = { status: string; error: string | null };
