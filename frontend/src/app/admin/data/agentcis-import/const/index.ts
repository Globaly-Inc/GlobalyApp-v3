export const MAX_SELECTION = 50;

// Bulk crawl scans AgentCIS's unfiltered listing in pages of 50 — same cap reasoning
// as MAX_SELECTION, just for a page-range instead of a hand-picked id list.
export const MAX_CRAWL_PAGES = 20;

// "mapping" is a transient status some per-tab re-runs set on a job — without it here,
// a job stuck in that state is invisible in this list (V1 parity gap).
export const AGENTCIS_JOB_STATUSES = "pending,processing,mapping,failed,done";

export const STATUS_BADGE: Record<string, { variant: "default" | "secondary" | "destructive" | "outline"; label: string }> = {
  pending: { variant: "secondary", label: "Pending" },
  processing: { variant: "outline", label: "Processing" },
  mapping: { variant: "outline", label: "Mapping" },
  done: { variant: "default", label: "Done" },
  failed: { variant: "destructive", label: "Failed" },
};
