// Zod schemas for the Knowledge Rack: categories -> sources -> documents.
// V2 enforced these vocabularies with CHECK constraints; V3 enforces them here.

import { z } from "zod";

export const CATEGORY_KINDS = [
  "visa", "gov_update", "institution_update", "scholarship", "test_provider", "other",
] as const;
export const TRUST_TIERS = ["gov", "verified_institution", "other"] as const;
export const SOURCE_TYPES = ["url", "file"] as const;

/**
 * Upload formats. Browsers are inconsistent about markdown (text/markdown,
 * text/x-markdown, or nothing at all), so the extension decides and this map
 * supplies the mime we store.
 */
export const RACK_UPLOAD_MIME_BY_EXT: Record<string, string> = {
  pdf: "application/pdf",
  md: "text/markdown",
  markdown: "text/markdown",
  txt: "text/plain",
};
export const CRAWL_FREQUENCIES = ["off", "weekly", "monthly"] as const;
export const ADDED_VIA = ["manual", "ai_discover"] as const;

export const CreateCategorySchema = z.object({
  slug: z.string().trim().regex(/^[a-z0-9-]+$/, "lowercase, digits and hyphens only"),
  label: z.string().trim().min(1),
  kind: z.enum(CATEGORY_KINDS),
  country_code: z.string().trim().length(2).nullish(),
  description: z.string().nullish(),
  active: z.boolean().default(true),
  sort_order: z.number().int().default(0),
});
export const PatchCategorySchema = CreateCategorySchema.partial();

export const CreateSourceSchema = z.object({
  category_id: z.string().uuid(),
  url: z.string().url(),
  title: z.string().nullish(),
  trust_tier: z.enum(TRUST_TIERS).default("other"),
  business_id: z.string().uuid().nullish(),
  crawl_frequency: z.enum(CRAWL_FREQUENCIES).default("monthly"),
  max_pages: z.number().int().min(1).max(500).nullish(),
  added_via: z.enum(ADDED_VIA).default("manual"),
  active: z.boolean().default(true),
  /** Known expiry for a temporary figure — a fee schedule, a cap, a concession. */
  effective_until: z.string().date().nullish(),
});

// domain is derived from url server-side, so it is not patchable on its own.
export const PatchSourceSchema = CreateSourceSchema.partial().omit({ category_id: true });

/** Multipart text fields alongside the file; the file itself is read from the stream. */
export const UploadSourceSchema = z.object({
  category_id: z.string().uuid(),
  title: z.string().trim().min(1).optional(),
  trust_tier: z.enum(TRUST_TIERS).default("other"),
  country_code: z.string().trim().length(2).optional(),
});

export const SourceQuerySchema = z.object({
  category_id: z.string().uuid().optional(),
  q: z.string().trim().min(1).optional(),
  /** "staleness" surfaces never-verified and longest-unverified sources first. */
  sort: z.enum(["recent", "staleness"]).default("recent"),
  limit: z.coerce.number().int().min(1).max(200).default(200),
});

export const DocumentQuerySchema = z.object({
  source_id: z.string().uuid().optional(),
  category_id: z.string().uuid().optional(),
  q: z.string().trim().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

export const CrawlSourceSchema = z.object({
  max_pages: z.number().int().min(1).max(500).optional(),
});

export type CreateCategoryInput = z.infer<typeof CreateCategorySchema>;
export type CreateSourceInput = z.infer<typeof CreateSourceSchema>;
export type UploadSourceInput = z.infer<typeof UploadSourceSchema>;
export type SourceQuery = z.infer<typeof SourceQuerySchema>;
export type DocumentQuery = z.infer<typeof DocumentQuerySchema>;
