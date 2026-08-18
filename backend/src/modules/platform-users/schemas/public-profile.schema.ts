import { z } from "zod";

/**
 * The eight sections a student can switch on or off, and their defaults.
 *
 * Lifted verbatim from V1's StudentPublicProfilePage / ProfileSlugCard (and mirrored in V2's
 * students-public.ts) so a profile migrated from V1 keeps exactly the visibility its owner
 * chose there. `contact_info` defaults to FALSE — everything that identifies where a student
 * physically is stays off until they say otherwise.
 *
 * `certifications` is accepted and stored for V1 parity but has nothing to gate yet: V3's
 * training certificates land with the tenant-scoped training tables in W7.
 */
export const VISIBILITY_SECTIONS = [
  "about",
  "education",
  "work_experience",
  "language_tests",
  "academic_tests",
  "certifications",
  "social_links",
  "contact_info",
] as const;

export type VisibilitySection = (typeof VISIBILITY_SECTIONS)[number];
export type Visibility = Record<VisibilitySection, boolean>;

export const DEFAULT_VISIBILITY: Visibility = {
  about: true,
  education: true,
  work_experience: true,
  language_tests: true,
  academic_tests: true,
  certifications: true,
  social_links: true,
  contact_info: false,
};

export const VisibilitySchema = z
  .object(Object.fromEntries(VISIBILITY_SECTIONS.map((s) => [s, z.boolean()])) as Record<VisibilitySection, z.ZodBoolean>)
  .partial()
  .strict();

export const PublishProfileSchema = z
  .object({
    /** Publishing sets the slug; unpublishing clears it. There is no separate is_public flag. */
    published: z.boolean(),
    visibility: VisibilitySchema.optional(),
  })
  .strict();

export const SlugParamSchema = z.object({ slug: z.string().min(1).max(200) });

export type PublishProfileInput = z.infer<typeof PublishProfileSchema>;

/**
 * Merge a stored `public_visibility` blob over the defaults.
 *
 * Resolved at read time rather than stored at publish time, so changing a default changes
 * every profile that never customised that section. Anything that is not a boolean is ignored,
 * which means a corrupt or half-written blob falls back to the safe default instead of
 * coercing to `true`.
 */
export function resolveVisibility(raw: unknown): Visibility {
  const obj = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const out = { ...DEFAULT_VISIBILITY };
  for (const key of VISIBILITY_SECTIONS) {
    if (typeof obj[key] === "boolean") out[key] = obj[key] as boolean;
  }
  return out;
}
