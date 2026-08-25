// Saved items repository — the heart toggle on the search cards.
// Rows live in the globalyapp schema; the things they point at do not (courses are in the
// superadmin schema), so there are no FKs — see the migration for why.

import { masterKnex } from "../../../core/db/master-pool.js";
import type { SavedItemType } from "../consts.js";

const T = "saved_items";

export interface SavedItemRow {
  item_type: SavedItemType;
  item_id: string;
}

/** Everything the user has saved — the cards only need type + id to fill their hearts. */
export async function listSavedItems(userId: number, type?: SavedItemType): Promise<SavedItemRow[]> {
  const q = masterKnex(T)
    .where({ platform_user_id: userId })
    .whereNull("deleted_at")
    .orderBy("created_at", "desc")
    .select("item_type", "item_id");
  if (type) q.andWhere({ item_type: type });
  return q;
}

export async function isSaved(userId: number, type: SavedItemType, itemId: string): Promise<boolean> {
  const row = await masterKnex(T)
    .where({ platform_user_id: userId, item_type: type, item_id: itemId })
    .whereNull("deleted_at")
    .first("id");
  return Boolean(row);
}

/**
 * Saving is idempotent: the unique index makes a second save a no-op, and un-saving soft-deletes,
 * so re-saving has to revive the existing row rather than insert a colliding one.
 */
export async function saveItem(userId: number, type: SavedItemType, itemId: string): Promise<void> {
  await masterKnex(T)
    .insert({ platform_user_id: userId, item_type: type, item_id: itemId })
    .onConflict(["platform_user_id", "item_type", "item_id"])
    .merge({ deleted_at: null, updated_at: masterKnex.fn.now() });
}

export async function unsaveItem(userId: number, type: SavedItemType, itemId: string): Promise<void> {
  await masterKnex(T)
    .where({ platform_user_id: userId, item_type: type, item_id: itemId })
    .whereNull("deleted_at")
    .update({ deleted_at: masterKnex.fn.now(), updated_at: masterKnex.fn.now() });
}

/** True when the course exists and its extraction job was exported (i.e. it is publicly visible). */
export async function coursePublicById(courseId: string): Promise<boolean> {
  // A malformed uuid would abort the statement, so keep the cast out of the comparison.
  if (!/^[0-9a-f-]{36}$/i.test(courseId)) return false;
  const row = await masterKnex("superadmin.extraction_courses as ec")
    .where("ec.id", courseId)
    .whereRaw("exists (select 1 from superadmin.extraction_jobs ej where ej.id = ec.job_id and ej.status = 'exported')")
    .first("ec.id");
  return Boolean(row);
}

/** Institutions are addressed publicly by their zero-padded id fragment, not their raw integer id. */
export async function institutionPublicByFragment(fragment: string): Promise<boolean> {
  const row = await masterKnex("institutions")
    .where("is_published", true)
    .whereNull("deleted_at")
    .whereRaw("lpad(id::text, 6, '0') = ?", [fragment])
    .first("id");
  return Boolean(row);
}
