// Knex-only data access for favourites. MASTER schema — a favourite belongs to a
// platform_user and may point into any tenant, so §1.2 puts it in master and every
// query here runs on masterKnex, never req.db.

import type { Knex } from "knex";

import { masterKnex } from "../../../core/db/master-pool.js";
import { FAVOURITE_TARGETS, type FavouriteItemType } from "../consts.js";

export type Db = Knex | Knex.Transaction;

export const db = (): Knex => masterKnex;

export interface FavoriteRow {
  id: number;
  item_type: FavouriteItemType;
  item_id: string;
  created_at: Date;
}

/** The caller's own favourites. THE owner predicate — nothing reads without it. */
function ownQuery(userId: number, conn: Db = db()) {
  return conn("student_favorites").where({ platform_user_id: userId });
}

export async function insert(
  userId: number,
  itemType: FavouriteItemType,
  itemId: string,
  conn: Db = db(),
): Promise<{ id: number; created: boolean }> {
  // Idempotent by the unique(platform_user_id, item_type, item_id) constraint —
  // V2's contract. No read-then-write, so two concurrent saves cannot both insert.
  const rows = await conn("student_favorites")
    .insert({ platform_user_id: userId, item_type: itemType, item_id: itemId })
    .onConflict(["platform_user_id", "item_type", "item_id"])
    .ignore()
    .returning("id");
  if (rows.length > 0) return { id: Number(rows[0].id), created: true };

  const existing = await ownQuery(userId, conn)
    .where({ item_type: itemType, item_id: itemId })
    .select("id")
    .first();
  return { id: Number(existing!.id), created: false };
}

export async function list(
  userId: number,
  opts: { itemType?: FavouriteItemType; limit: number; offset: number },
  conn: Db = db(),
): Promise<FavoriteRow[]> {
  const q = ownQuery(userId, conn);
  if (opts.itemType) q.where({ item_type: opts.itemType });
  return q
    .select("id", "item_type", "item_id", "created_at")
    .orderBy("id", "desc")
    .limit(opts.limit)
    .offset(opts.offset);
}

export async function count(
  userId: number,
  itemType: FavouriteItemType | undefined,
  conn: Db = db(),
): Promise<number> {
  const q = ownQuery(userId, conn);
  if (itemType) q.where({ item_type: itemType });
  const row = await q.count({ count: "*" }).first();
  return Number(row?.count ?? 0);
}

/** Per-type totals for the V1 page's tab badges — always the whole list. */
export async function countsByType(
  userId: number,
  conn: Db = db(),
): Promise<Record<string, number>> {
  const rows: Array<{ item_type: string; count: string }> = await ownQuery(userId, conn)
    .select("item_type")
    .count({ count: "*" })
    .groupBy("item_type");
  return Object.fromEntries(rows.map((r) => [r.item_type, Number(r.count)]));
}

/** Hard delete, scoped to the owner. Returns 0 when the row is not the caller's. */
export async function remove(userId: number, id: number, conn: Db = db()): Promise<number> {
  return ownQuery(userId, conn).where({ id }).del();
}

// ── target resolution ───────────────────────────────────────────────────────

export interface ResolvedTarget {
  title: string;
  slug: string | null;
}

/**
 * Resolve saved items to their targets' real title/slug — V1 rendered the raw
 * item_id uuid instead (defect D-G6-2).
 *
 * One indexed query per DISTINCT type present on the page, not one per row: the
 * same batching shape V2 used for saved-jobs (jobCardsById / businessCardsById).
 * Table and column names come from FAVOURITE_TARGETS, never from the request, and
 * every id is bound as a parameter.
 *
 * ponytail: N queries for N distinct types, capped at 7 by the vocabulary. If that
 * ever matters, replace with one UNION ALL built from the same descriptor table.
 */
export async function resolveTargets(
  rows: Array<{ item_type: FavouriteItemType; item_id: string }>,
  conn: Db = db(),
): Promise<Map<string, ResolvedTarget>> {
  const byType = new Map<FavouriteItemType, Set<string>>();
  for (const row of rows) {
    const set = byType.get(row.item_type) ?? new Set<string>();
    set.add(row.item_id);
    byType.set(row.item_type, set);
  }

  const resolved = new Map<string, ResolvedTarget>();

  for (const [itemType, ids] of byType) {
    const target = FAVOURITE_TARGETS[itemType];
    const found = await conn(target.table)
      // ::text so a uuid or int PK both compare against the text ids we hold.
      .whereIn(conn.raw(`${target.idColumn}::text`) as never, [...ids])
      // A removed target resolves to null rather than surfacing a row the user can
      // no longer reach.
      .whereNull("deleted_at")
      .select(
        conn.raw(`${target.idColumn}::text as item_id`),
        conn.raw(`${target.titleColumn} as title`),
        conn.raw(target.slugColumn ? `${target.slugColumn} as slug` : `null::text as slug`),
      );

    for (const row of found as Array<{ item_id: string; title: string; slug: string | null }>) {
      resolved.set(`${itemType}:${row.item_id}`, { title: row.title, slug: row.slug });
    }
  }

  return resolved;
}
