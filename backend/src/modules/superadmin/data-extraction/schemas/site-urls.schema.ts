// Zod schemas for the site URL list and snapshot listing (Site tab).

import { z } from "zod";
import { PaginationSchema } from "../../../../shared/pagination.js";
import { SITE_URL_CATEGORIES } from "../lib/url-categories.js";

export const ListSiteUrlsQuerySchema = PaginationSchema.extend({
  category: z.enum([...SITE_URL_CATEGORIES, "unclassified"]).optional(),
  excluded: z.enum(["true", "false"]).transform((v) => v === "true").optional(),
  q: z.string().trim().max(200).optional(),
});
export type ListSiteUrlsQuery = z.infer<typeof ListSiteUrlsQuerySchema>;

export const PatchSiteUrlSchema = z.object({
  excluded: z.boolean().optional(),
  /** null clears an admin override so the next url_classify run may set it again. */
  category: z.enum(SITE_URL_CATEGORIES).nullable().optional(),
}).refine((v) => v.excluded !== undefined || v.category !== undefined, { message: "Nothing to change" });
export type PatchSiteUrlInput = z.infer<typeof PatchSiteUrlSchema>;

/** Admin adds one page or PDF URL to the site list, already categorised. */
export const AddSiteUrlSchema = z.object({
  url: z.string().trim().url().max(2000),
  category: z.enum(SITE_URL_CATEGORIES),
});
export type AddSiteUrlInput = z.infer<typeof AddSiteUrlSchema>;

export const BulkExcludeSchema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(1000),
  excluded: z.boolean(),
});
export type BulkExcludeInput = z.infer<typeof BulkExcludeSchema>;

export const ListSnapshotsQuerySchema = PaginationSchema.extend({
  q: z.string().trim().max(200).optional(),
});
export type ListSnapshotsQuery = z.infer<typeof ListSnapshotsQuerySchema>;

export const SnapshotParamSchema = z.object({
  id: z.string().uuid(),
  pageId: z.string().uuid(),
});
