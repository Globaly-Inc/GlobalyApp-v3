// Zod schemas for AgentCIS search + import endpoints.

import { z } from "zod";

export const AgentcisSearchSchema = z.object({
  query: z.string().min(1).max(200),
});

export const AgentcisImportSchema = z.object({
  institution_ids: z.array(z.string().min(1)).min(1).max(50),
});
