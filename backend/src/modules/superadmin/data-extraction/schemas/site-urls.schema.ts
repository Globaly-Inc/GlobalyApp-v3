// Zod schemas for the site URL list and snapshot listing (Site URLs / Snapshots tabs).

import { z } from "zod";
import { PaginationSchema } from "../../../../shared/pagination.js";

export const SITE_URL_ROLES = ["course", "other"] as const;

export const ListSiteUrlsQuerySchema = PaginationSchema.extend({
  role: z.enum([...SITE_URL_ROLES, "unclassified"]).optional(),
  excluded: z.enum(["true", "false"]).transform((v) => v === "true").optional(),
  q: z.string().trim().max(200).optional(),
});
export type ListSiteUrlsQuery = z.infer<typeof ListSiteUrlsQuerySchema>;

export const PatchSiteUrlSchema = z.object({
  excluded: z.boolean().optional(),
  /** null clears an admin override so the next url_classify run may set it again. */
  role: z.enum(SITE_URL_ROLES).nullable().optional(),
}).refine((v) => v.excluded !== undefined || v.role !== undefined, { message: "Nothing to change" });
export type PatchSiteUrlInput = z.infer<typeof PatchSiteUrlSchema>;

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
