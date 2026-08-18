// Zod schemas for immigration endpoints (visas, MARA agents).

import { z } from "zod";
import { webUrl } from "../../../../shared/url.js";

export const ImmigrationListQuerySchema = z.object({
  status: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(100),
});

/**
 * The visa promote target.
 *
 * V1/V2 called this `_department_business_id` and it was a uuid pointing at their
 * single `businesses` table. Two things changed in V3: ids are serial integers,
 * and orgs are split into owner-backed `businesses` and unclaimed `institutions`
 * — an immigration department is normally the latter, and `businesses.owner_id`
 * is NOT NULL so it could not even be represented there. The target is therefore
 * the polymorphic (type, id) pair used everywhere else in V3.
 *
 * `department_business_id` is still accepted so the existing admin UI keeps
 * working: it means org_type "business" unless the caller says otherwise.
 */
export const PromoteVisaSchema = z
  .object({
    target_org_type: z.enum(["business", "institution"]).optional(),
    target_org_id: z.coerce.number().int().positive().optional(),
    department_business_id: z.coerce.number().int().positive().optional(),
  })
  .transform((input) => ({
    org_type: input.target_org_type ?? "business",
    org_id: input.target_org_id ?? input.department_business_id,
  }))
  .refine((v): v is { org_type: "business" | "institution"; org_id: number } => v.org_id !== undefined, {
    message: "target_org_id (or department_business_id) is required",
  });

/**
 * The extract launch contract, rewired to what the admin dialogs actually post.
 *
 * V1's LaunchVisaJobDialog / MARA equivalent posted `{ urls: [...] }` while its
 * edge functions read `source_url` — a param-name mismatch that made every launch
 * a 400 and hid the real "no provider configured" state (§3.4). V3 had inherited
 * both halves of the mismatch. The array is the contract now, since a launch is
 * naturally over a list of registrar/department pages.
 */
export const ExtractVisasSchema = z.object({
  urls: z.array(webUrl()).min(1).max(50),
  country_code: z.string().min(2).max(10).optional(),
  max_visas: z.coerce.number().int().min(1).max(200).optional(),
});

export const ExtractMaraSchema = z.object({
  urls: z.array(webUrl()).min(1).max(50),
  state_filter: z.string().max(100).optional(),
  max_agents: z.coerce.number().int().min(1).max(200).optional(),
});

export type ExtractVisasInput = z.infer<typeof ExtractVisasSchema>;
export type ExtractMaraInput = z.infer<typeof ExtractMaraSchema>;
