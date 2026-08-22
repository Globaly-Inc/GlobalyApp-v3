// Zod schemas for AgentCIS search + import endpoints.

import { z } from "zod";

export const AgentcisSearchSchema = z.object({
  query: z.string().max(200),
});

export const AgentcisImportSchema = z.object({
  institution_ids: z.array(z.string().min(1)).min(1).max(50),
});

// max_pages capped at 20 (×50/page = 1000 institutions) to bound one dispatch's cost —
// matches the per-import cap of 50 institutions being ~20x smaller in spirit.
export const AgentcisBulkCrawlSchema = z.object({
  start_page: z.coerce.number().int().min(1).default(1),
  max_pages: z.coerce.number().int().min(1).max(20).default(5),
});
