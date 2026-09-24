import { z } from "zod";
import { PaginationSchema } from "../../../../shared/pagination.js";
import { SITE_URL_CATEGORIES } from "../lib/url-categories.js";
import { MAX_STORED_CHARS } from "../lib/page-store.js";

export const StartExtractionSchema = z.object({
  website: z.string().url().optional(),
});
export type StartExtractionInput = z.infer<typeof StartExtractionSchema>;

export const SiteUrlsQuerySchema = PaginationSchema.extend({
  category: z.enum(SITE_URL_CATEGORIES).optional(),
});
export type SiteUrlsQueryInput = z.infer<typeof SiteUrlsQuerySchema>;

export const SiteUrlSnapshotQuerySchema = z.object({
  url: z.string().url(),
});
export type SiteUrlSnapshotQueryInput = z.infer<typeof SiteUrlSnapshotQuerySchema>;

export const SiteUrlSnapshotUpdateSchema = z.object({
  url: z.string().url(),
  markdown: z.string().min(1).max(MAX_STORED_CHARS),
});
export type SiteUrlSnapshotUpdateInput = z.infer<typeof SiteUrlSnapshotUpdateSchema>;

export const SiteUrlRefreshSchema = z.object({
  urls: z.array(z.string().url()).min(1).max(10),
});
export type SiteUrlRefreshInput = z.infer<typeof SiteUrlRefreshSchema>;
