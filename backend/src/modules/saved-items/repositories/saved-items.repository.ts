// Saved items repository — the heart toggle on the search cards.
// Rows live in the globalyapp schema; the things they point at do not (courses are in the
// superadmin schema), so there are no FKs — see the migration for why.

import type { Knex } from "knex";
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

/**
 * Flips the row and reports the state it landed in, in one statement.
 *
 * Reading the current state and then writing the opposite is not safe here: two overlapping
 * toggles for the same user and item both observe "not saved" and both save, so a double tap
 * yields one transition instead of two and the heart is left contradicting the row. `on conflict
 * do update` takes a row lock, so the second statement blocks until the first commits and then
 * flips whatever the first one left behind.
 */
export async function toggleItem(
  userId: number, type: SavedItemType, itemId: string, db: Knex = masterKnex,
): Promise<boolean> {
  const { rows } = await db.raw(
    `insert into ?? (platform_user_id, item_type, item_id)
     values (?, ?, ?)
     on conflict on constraint saved_items_user_item_uniq do update
        set deleted_at = case when ??.deleted_at is null then now() else null end,
            updated_at = now()
     returning deleted_at`,
    [T, userId, type, itemId, T],
  );
  return (rows as { deleted_at: Date | null }[])[0]?.deleted_at === null;
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

// Canonical hyphenated uuid. Shape only, deliberately not RFC-4122's version/variant nibbles:
// anything matching this is something Postgres will accept, and anything it rejects Postgres
// would reject too — so the guard can neither abort the statement nor 404 a real row whose id
// predates gen_random_uuid() (an imported nil uuid, say).
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** True when the course exists and its extraction job was exported (i.e. it is publicly visible). */
export async function coursePublicById(courseId: string): Promise<boolean> {
  // An id that isn't a uuid at all would abort the statement, so it never reaches the comparison.
  if (!UUID.test(courseId)) return false;
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
