// Zod schemas for the eight service-vertical endpoints.

import { z } from "zod";

import { VERTICAL_SLUGS } from "../lib/service-verticals.js";

/**
 * The vertical is a path segment that decides which superadmin table is queried,
 * so it is validated against the registry here and resolved to a spec in the
 * route. Nothing else may reach the query as an identifier.
 */
export const VerticalParamSchema = z.object({
  vertical: z.enum(VERTICAL_SLUGS as [string, ...string[]]),
});

export const VerticalRowParamSchema = VerticalParamSchema.extend({
  id: z.string().uuid(),
});

export const VerticalListQuerySchema = z.object({
  status: z.string().max(40).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(100),
});

/**
 * The promote target, identical in shape to PromoteVisaSchema: V3 splits orgs into
 * owner-backed `businesses` and unclaimed `institutions`, and a scraped
 * accommodation provider or insurer is normally the latter, so the target is the
 * polymorphic (type, id) pair used everywhere else.
 *
 * Unlike the visa schema there is no `department_business_id` alias — that alias
 * exists only to keep V1's admin UI working, and these verticals have no V1 UI.
 */
export const PromoteVerticalSchema = z.object({
  target_org_type: z.enum(["business", "institution"]).default("institution"),
  target_org_id: z.coerce.number().int().positive(),
});
