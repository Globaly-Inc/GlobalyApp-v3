import type { Favourite, FavouriteItemType, FavouritesPage } from "../apis";
import { FAVOURITE_ITEM_TYPES } from "../apis";
import { FAVOURITE_TYPE_CONFIG } from "../const";

/**
 * Dense per-tab counts from the backend's SPARSE `counts` object.
 *
 * The backend groups by item_type, so a type with nothing saved is simply absent.
 * Every tab badge needs a number, so the missing keys become 0 here rather than
 * rendering `undefined` or hiding a tab the user can still click.
 */
export function tabCounts(
  counts: FavouritesPage["counts"],
): Record<FavouriteItemType, number> {
  const dense = {} as Record<FavouriteItemType, number>;
  for (const type of FAVOURITE_ITEM_TYPES) dense[type] = counts[type] ?? 0;
  return dense;
}

/**
 * The "All" badge.
 *
 * Deliberately the sum of `counts`, NOT `meta.total`: meta.total is the count of
 * the CURRENT query, so while a tab filter is applied it reports that tab's total
 * and would make "All" read as the filtered number. `counts` always covers every
 * type regardless of the filter.
 */
export function totalCount(counts: FavouritesPage["counts"]): number {
  let total = 0;
  for (const type of FAVOURITE_ITEM_TYPES) total += counts[type] ?? 0;
  return total;
}

/**
 * The card's title.
 *
 * A favourite whose target was deleted after it was saved comes back with
 * `target: null`. V1 rendered `fav.item_id` in the title slot, so a saved course
 * showed a bare uuid; that is not reproduced here — the row is labelled as gone,
 * and the raw id is never shown to the user.
 */
export function favouriteTitle(favourite: Favourite): string {
  return favourite.target?.title ?? "No longer available";
}

/** True when the saved target has been removed and the row is a dangling entry. */
export function isUnavailable(favourite: Favourite): boolean {
  return favourite.target === null;
}

/**
 * Where the card links, or null when it must render as plain text.
 *
 * Three reasons a favourite has no link, all of which reach the same UI:
 *   - the target is gone (`target: null`)
 *   - the type has no public detail route in this build (route: null)
 *   - the route wants a slug and the resolved target has none
 */
export function favouriteHref(favourite: Favourite): string | null {
  if (favourite.target === null) return null;
  const { route, by } = FAVOURITE_TYPE_CONFIG[favourite.item_type];
  if (!route) return null;
  if (by === "id") return `${route}/${encodeURIComponent(favourite.item_id)}`;
  const slug = favourite.target.slug;
  return slug ? `${route}/${encodeURIComponent(slug)}` : null;
}

/** Saved-on date for the card's subline. Empty string rather than "Invalid Date". */
export function savedOn(iso: string): string {
  const time = new Date(iso).getTime();
  return Number.isNaN(time) ? "" : new Date(time).toLocaleDateString();
}
