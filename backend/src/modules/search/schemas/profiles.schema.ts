// Zod schemas for the public profile and sitemap routes. Everything here comes
// from an unauthenticated visitor, so the slug is constrained to the character
// set the generator produces rather than being handed to SQL as-is.

import { z } from "zod";

import { PaginationSchema } from "../../../shared/pagination.js";

/** Matches public.org_public_slug()'s output: lowercase, digits and hyphens. */
export const OrgSlugParamSchema = z.object({
  slug: z
    .string()
    .trim()
    .min(1)
    .max(200)
    .regex(/^[a-z0-9-]+$/, "Invalid slug"),
});

export const SITEMAP_TYPES = ["institution", "agent", "service", "country", "city"] as const;
export type SitemapType = (typeof SITEMAP_TYPES)[number];

export const SitemapQuerySchema = PaginationSchema.extend({
  // No default: a sitemap generator asks for one section at a time, and silently
  // returning "everything" for a typo'd type is how URLs go missing unnoticed.
  type: z.enum(SITEMAP_TYPES),
  // Higher than the shared cap — a sitemap page is a list of paths, not records,
  // and the sitemaps.org limit is 50,000 URLs per file.
  limit: z.coerce.number().int().min(1).max(5000).default(1000),
});

export type SitemapQuery = z.infer<typeof SitemapQuerySchema>;
