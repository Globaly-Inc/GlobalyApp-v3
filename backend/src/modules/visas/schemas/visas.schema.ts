// Zod schemas for the public visa / MARA directory.
//
// Query shapes are the V1 RPC signatures (search_visas(_query, _country_code,
// _category, _limit, _offset), search_mara_agents(_query, _state, _limit,
// _offset)) as restated by V2's routes/visas.ts and routes/agents.ts — limit /
// offset rather than the page / limit the rest of V3 uses, because that is the
// contract usePublicVisas and usePublicMaraAgents were written against.

import { z } from "zod";

export const VisaListQuerySchema = z.object({
  q: z.string().max(200).optional(),
  country: z.string().max(10).optional(),
  category: z.string().max(100).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export const VisaDetailParamsSchema = z.object({
  country: z.string().min(1).max(10),
  subclass: z.string().min(1).max(50),
});

export const MaraListQuerySchema = z.object({
  q: z.string().max(200).optional(),
  state: z.string().max(100).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export const MarnParamSchema = z.object({ marn: z.string().min(1).max(50) });

export type VisaListQuery = z.infer<typeof VisaListQuerySchema>;
export type MaraListQuery = z.infer<typeof MaraListQuerySchema>;
