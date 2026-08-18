import { httpDelete, httpGet, httpPost } from "@/lib/api/http";
import { FAVOURITE_ITEM_TYPES } from "./types";
import type {
  AddFavouriteInput,
  Favourite,
  FavouriteItemType,
  FavouritesPage,
} from "./types";

// The owner is req.auth.sub on every route — no path here ever carries a user id.
const BASE = "/favorites";

function isKnownType(value: unknown): value is FavouriteItemType {
  return typeof value === "string" && (FAVOURITE_ITEM_TYPES as readonly string[]).includes(value);
}

/**
 * Normalised at the boundary so a partial or drifted payload cannot throw during
 * render. An unknown item_type is dropped rather than rendered: the vocabulary is
 * closed, and a row this build has no label or link for is not displayable.
 */
function normaliseRow(raw: unknown): Favourite | null {
  const row = (raw ?? {}) as Partial<Favourite>;
  if (!isKnownType(row.item_type)) return null;
  const target = row.target;
  return {
    id: Number(row.id),
    item_type: row.item_type,
    item_id: String(row.item_id ?? ""),
    created_at: String(row.created_at ?? ""),
    // The one field the whole page hinges on: absent, null and malformed all
    // collapse to null, which the card renders as "no longer available".
    target:
      target && typeof target.title === "string"
        ? { title: target.title, slug: typeof target.slug === "string" ? target.slug : null }
        : null,
  };
}

function normalisePage(raw: Partial<FavouritesPage> | undefined | null): FavouritesPage {
  const rows = Array.isArray(raw?.data) ? raw.data : [];
  const counts: Partial<Record<FavouriteItemType, number>> = {};
  for (const [key, value] of Object.entries(raw?.counts ?? {})) {
    if (isKnownType(key)) counts[key] = Number(value) || 0;
  }
  return {
    data: rows.map(normaliseRow).filter((row): row is Favourite => row !== null),
    meta: {
      page: Number(raw?.meta?.page ?? 1),
      limit: Number(raw?.meta?.limit ?? 20),
      total: Number(raw?.meta?.total ?? 0),
      totalPages: Number(raw?.meta?.totalPages ?? 1),
    },
    counts,
  };
}

export const favoritesRealApi = {
  list: async (params: { item_type?: FavouriteItemType; page?: number } = {}) => {
    const qs = new URLSearchParams();
    if (params.item_type) qs.set("item_type", params.item_type);
    if (params.page) qs.set("page", String(params.page));
    const query = qs.toString();
    return normalisePage(
      await httpGet<Partial<FavouritesPage>>(`${BASE}${query ? `?${query}` : ""}`),
    );
  },

  /** Idempotent by contract: saving twice returns saved:true with created:false. */
  save: (input: AddFavouriteInput) =>
    httpPost<{ saved: true; created: boolean }>(BASE, input),

  remove: (id: number) => httpDelete(`${BASE}/${id}`),
};
