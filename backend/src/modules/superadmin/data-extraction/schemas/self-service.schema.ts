import { z } from "zod";
import { PaginationSchema } from "../../../../shared/pagination.js";
import { SITE_URL_CATEGORIES } from "../lib/url-categories.js";

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
