// Extraction queue names — single source of truth for publishers and consumers.

export const EXTRACTION_QUEUES = {
  /** Admin creates a job → worker crawls the site and discovers pages */
  JOBS: "extraction_jobs",
  /** Worker discovers pages → each page is processed by a consumer */
  PAGES: "extraction_pages",
  /** All pages done → worker verifies extracted data against live site */
  VERIFY: "extraction_verify",
  /** Admin-triggered step re-runs (institution, branches, agents, etc.) */
  STEPS: "extraction_steps",
  /** Trigger a schedule check (cron or manual) */
  SCHEDULE: "extraction_schedule",
  /** AgentCIS institution import — one message per institution_id */
  AGENTCIS: "extraction_agentcis",
  /** V2 → V3 data import — one message per import run (ImportOptions payload) */
  IMPORT_V2: "extraction_import_v2",
  /** Admin bulk-deletes courses — fire-and-forget, same pattern as scholarship-bulk-delete */
  COURSE_BULK_DELETE: "extraction_course_bulk_delete",
} as const;
