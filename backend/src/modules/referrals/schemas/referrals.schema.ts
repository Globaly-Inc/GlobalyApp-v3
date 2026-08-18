import { z } from "zod";

/** Codes are case-insensitive on lookup and drawn from a 31-symbol alphabet (no 0/1/O/I/L). */
export const LookupParamsSchema = z.object({
  code: z.string().min(4).max(32),
});

/**
 * The /lookup/:code response is an explicit THREE-FIELD allow-list, declared here and used to shape
 * the reply so no future column can leak by accident.
 *
 * `display_name` is the individual's FULL name, or the business name (already public on the business
 * profile). NEVER returned, for either owner type: email, phone, platform_users.id, businesses.id,
 * referral_codes.id, uuid, subdomain, photo/logo URL, profile or website URL, institution, country, or
 * any counts. The handler selects only the name columns — it must not spread a row.
 *
 * This endpoint is public and unauthenticated: it takes a short code and returns a person's identity,
 * so it is an enumeration surface, and showing a full name raises the stakes of a successful guess.
 * The controls that bound it are therefore required, not optional — a 31^10 keyspace, the per-route
 * 20/min rate limit, and a byte-identical 404 for unknown and unusable codes.
 */
export const LookupResponseSchema = z.object({
  referrer_type: z.enum(["user", "business"]),
  display_name: z.string(),
  ref_token: z.string(),
});

export const ConfigResponseSchema = z.object({
  student_referral_reward: z.number().int(),
  business_referral_reward: z.number().int(),
  w1_days: z.number().int(),
  w2_days: z.number().int(),
});

export type LookupResponse = z.infer<typeof LookupResponseSchema>;
