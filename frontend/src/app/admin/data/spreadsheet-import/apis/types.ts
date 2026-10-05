export type ImportInstitutionPayload = {
  institution: Record<string, string | null> & { name: string };
  rows: Record<string, string | null>[];
  extras?: Record<string, Record<string, string | null>[]>;
  /** Course rows left out at validation, so the import history can show them. */
  skipped?: { row: number; course: string | null; error: string; kind?: "duplicate" }[];
  /** Workbook line of each entry in `rows`, same order. */
  row_lines?: number[];
};
export type ImportInstitutionResult = { job_id: string };
export type ListImportsParams = { page: number; limit: number; q?: string; statuses?: string[]; excludeStatuses?: string[] };
/** The extraction job's own status — the import request only queues it. */
export type ImportJobStatus = { status: string; error: string | null };
