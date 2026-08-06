// Extraction queue names — single source of truth for publishers and consumers.

export const EXTRACTION_QUEUES = {
  /** Admin creates a job → worker crawls the site and discovers pages */
  JOBS: "extraction_jobs",
  /** Worker discovers pages → each page is processed by a consumer */
  PAGES: "extraction_pages",
  /** All pages done → worker verifies extracted data against live site */
  VERIFY: "extraction_verify",
} as const;
