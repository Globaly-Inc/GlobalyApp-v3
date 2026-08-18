// Wire types for GET/POST /api/v3/favorites and DELETE /api/v3/favorites/:id.
// Mirrors backend/src/modules/favorites/{consts.ts,services/favorites.service.ts}.

/**
 * The closed vocabulary, copied from the backend's FAVOURITE_TARGETS keys.
 * V1's `course` and `agent` spellings are NOT accepted — V3 renamed them to
 * `service` and `business`, and two spellings for one saved item would defeat
 * the unique(platform_user_id, item_type, item_id) constraint.
 */
export const FAVOURITE_ITEM_TYPES = [
  "service",
  "institution",
  "business",
  "scholarship",
  "job",
  "event",
  "other_service",
] as const;

export type FavouriteItemType = (typeof FAVOURITE_ITEM_TYPES)[number];

/** What the backend resolved the saved id back to. `slug` is null for other_service. */
export interface FavouriteTarget {
  title: string;
  slug: string | null;
}

export interface Favourite {
  id: number;
  item_type: FavouriteItemType;
  item_id: string;
  created_at: string;
  /**
   * null when the target has been deleted since it was saved. The row still
   * exists and is still removable — the UI must render that state rather than
   * falling back to the raw item_id the way V1 did.
   */
  target: FavouriteTarget | null;
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

/**
 * `counts` is SPARSE: the backend groups by item_type, so a type with nothing
 * saved is absent rather than present as 0. It always covers every type the
 * user has saved, never just the filtered page.
 */
export interface FavouritesPage {
  data: Favourite[];
  meta: PaginationMeta;
  counts: Partial<Record<FavouriteItemType, number>>;
}

export interface AddFavouriteInput {
  item_type: FavouriteItemType;
  item_id: string;
}
