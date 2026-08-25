// Shared post-processing for public course rows, used by the search listing and by the
// saved-courses lookup so both render through the same card without drifting.

import * as storage from "../../../shared/storage/storageService.js";

/**
 * Owner-registered institutions store logo_url as a storage key while scraped ones hold a plain
 * URL (resolvePreviewUrl passes those through). array_agg returns NULL rather than an empty
 * array when a course's job has no campuses, which the card would rather not special-case.
 */
export async function withCardFields<
  T extends { institution_logo_url?: string | null; campus_locations?: string[] | null },
>(row: T) {
  return {
    ...row,
    institution_logo_url: await storage.resolvePreviewUrl(row.institution_logo_url ?? null),
    campus_locations: row.campus_locations ?? [],
  };
}
