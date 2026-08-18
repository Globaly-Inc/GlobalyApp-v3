// Favourites orchestration. Every function takes the owner id as its first
// argument, and every caller passes req.auth.sub — there is no code path that
// derives the owner from anything a client sent.

import { NotFoundError } from "../../../shared/errors.js";
import { buildPaginatedResponse, paginationToOffset } from "../../../shared/pagination.js";
import type { FavouriteItemType } from "../consts.js";
import * as repo from "../repositories/favorites.repository.js";
import type { AddFavoriteInput } from "../schemas/favorites.schema.js";

export async function save(userId: number, input: AddFavoriteInput) {
  const { created } = await repo.insert(userId, input.item_type, input.item_id);
  // saved:true either way — V2's contract is an idempotent save, not a 409.
  return { saved: true as const, created };
}

export async function list(
  userId: number,
  query: { page: number; limit: number; item_type?: FavouriteItemType },
) {
  const { limit, offset } = paginationToOffset(query);
  const [rows, total, counts] = await Promise.all([
    repo.list(userId, { itemType: query.item_type, limit, offset }),
    repo.count(userId, query.item_type),
    // Counts always cover EVERY type, not the filtered page — V1's tab badges show
    // per-type totals while one tab is open.
    repo.countsByType(userId),
  ]);

  const targets = await repo.resolveTargets(rows);

  const data = rows.map((row) => ({
    id: row.id,
    item_type: row.item_type,
    item_id: row.item_id,
    created_at: row.created_at,
    // null when the target has been removed — V1 rendered the raw id instead.
    target: targets.get(`${row.item_type}:${row.item_id}`) ?? null,
  }));

  return { ...buildPaginatedResponse(data, total, query), counts };
}

export async function remove(userId: number, id: number) {
  const deleted = await repo.remove(userId, id);
  // 404, not 403: the caller must not learn that someone else's row exists.
  if (deleted === 0) throw new NotFoundError("Favourite not found");
}
