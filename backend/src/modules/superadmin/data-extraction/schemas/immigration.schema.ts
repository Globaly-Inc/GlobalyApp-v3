// Zod schemas for immigration endpoints (visas, MARA agents).

import { z } from "zod";
import { webUrl } from "../../../../shared/url.js";

export const ImmigrationListQuerySchema = z.object({
  status: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(100),
});

export const PromoteVisaSchema = z.object({
  department_business_id: z.string().uuid(),
});

export const ExtractVisasSchema = z.object({
  source_url: webUrl(),
  country_code: z.string().min(2),
  max_visas: z.number().int().min(1).max(200).optional(),
});

export const ExtractMaraSchema = z.object({
  source_url: webUrl(),
  state_filter: z.string().optional(),
  max_agents: z.number().int().min(1).max(200).optional(),
});
