// Knex-only data access for saved filters + the per-user default. MASTER schema.
//
// EVERY read is scoped by BOTH module_key and the caller's scope. "Scope" is
// (business_id, created_by): a filter is visible when the caller owns it, or when it
// is shared AND sits in the same business_id — including the NULL (personal) scope,
// which is matched with IS NULL, not `= NULL`. V2 pinned business scope to IS NULL
// for every caller, which made `shared` mean platform-wide (defect D-G6-3).

import type { Knex } from "knex";

import { masterKnex } from "../../../core/db/master-pool.js";
import type { FilterConfig } from "../schemas/saved-filters.schema.js";

export type Db = Knex | Knex.Transaction;

export const db = (): Knex => masterKnex;

export interface SavedFilterRow {
  id: number;
  module_key: string;
  name: string;
  description: string | null;
  filter_config: FilterConfig;
  shared: boolean;
  created_by: number;
  business_id: number | null;
  use_count: number;
  created_at: Date;
}

/** Columns the API returns. Enumerated, never `select *`. */
const COLUMNS = [
  "id",
  "module_key",
  "name",
  "description",
  "filter_config",
  "shared",
  "created_by",
  "business_id",
  "use_count",
  "created_at",
] as const;

export interface Scope {
  userId: number;
  businessId: number | null;
}

/** business_id = ? or IS NULL — a nullable scope needs the IS NULL spelling. */
function inScope(q: Knex.QueryBuilder, businessId: number | null): Knex.QueryBuilder {
  return businessId === null ? q.whereNull("business_id") : q.where({ business_id: businessId });
}

/**
 * Rows the caller may READ: their own, plus anything shared inside the same scope.
 * Live rows only. This is the single definition of visibility — the list, apply and
 * set-default paths all route through it, so they cannot drift apart.
 */
function visibleQuery(scope: Scope, conn: Db = db()) {
  return conn("saved_filters")
    .whereNull("deleted_at")
    .where((outer) => {
      outer
        .where((own) => {
          inScope(own.where({ created_by: scope.userId }), scope.businessId);
        })
        .orWhere((shared) => {
          inScope(shared.where({ shared: true }), scope.businessId);
        });
    });
}

export async function create(
  scope: Scope,
  values: {
    module_key: string;
    name: string;
    description: string | null;
    filter_config: FilterConfig;
    shared: boolean;
  },
  conn: Db = db(),
): Promise<number> {
  const [row] = await conn("saved_filters")
    .insert({
      ...values,
      // Owner and scope are server-set, never client-supplied.
      created_by: scope.userId,
      business_id: scope.businessId,
      filter_config: JSON.stringify(values.filter_config),
    })
    .returning("id");
  return Number(row.id);
}

export async function listVisible(
  scope: Scope,
  moduleKey: string,
  conn: Db = db(),
): Promise<SavedFilterRow[]> {
  return visibleQuery(scope, conn)
    .where({ module_key: moduleKey })
    .select(...COLUMNS)
    // Most-used first, matching V2's ordering; id breaks ties deterministically.
    .orderBy([
      { column: "use_count", order: "desc" },
      { column: "id", order: "desc" },
    ])
    .limit(50);
}

/** True when the caller may read this filter. Used before defaulting to it. */
export async function isVisible(scope: Scope, id: number, conn: Db = db()): Promise<boolean> {
  const row = await visibleQuery(scope, conn).where({ id }).select("id").first();
  return row !== undefined;
}

/**
 * Bump use_count and return the new value. Server-side arithmetic on a scoped
 * UPDATE — a client never supplies a count, and a filter it cannot see is not
 * matched, so the caller gets a 404 rather than a silent no-op.
 */
export async function bumpUseCount(
  scope: Scope,
  id: number,
  conn: Db = db(),
): Promise<number | null> {
  const rows = await visibleQuery(scope, conn)
    .where({ id })
    .update({ use_count: conn.raw("use_count + 1"), updated_at: conn.fn.now() })
    .returning("use_count");
  return rows.length > 0 ? Number(rows[0].use_count) : null;
}

/**
 * Soft delete, OWNER only — deliberately not visibleQuery. A teammate who can read
 * a shared filter must not be able to remove it from under its author.
 */
export async function softDelete(userId: number, id: number, conn: Db = db()): Promise<number> {
  return conn("saved_filters")
    .where({ id, created_by: userId })
    .whereNull("deleted_at")
    .update({ deleted_at: conn.fn.now(), updated_at: conn.fn.now() });
}

// ── the caller's default filter per module ──────────────────────────────────

export async function getDefault(
  userId: number,
  moduleKey: string,
  conn: Db = db(),
): Promise<number | null> {
  const row = await conn("user_default_filters")
    .where({ platform_user_id: userId, module_key: moduleKey })
    .select("filter_id")
    .first();
  return row ? Number(row.filter_id) : null;
}

/**
 * One atomic statement. V2 needed a read-then-write here because its unique key
 * contained a nullable column, so ON CONFLICT could never match and two concurrent
 * PUTs raced into two rows (defect D-G6-4). V3's key is (platform_user_id,
 * module_key) with no nullable part, so the merge just works.
 */
export async function setDefault(
  userId: number,
  moduleKey: string,
  filterId: number,
  conn: Db = db(),
): Promise<void> {
  await conn("user_default_filters")
    .insert({ platform_user_id: userId, module_key: moduleKey, filter_id: filterId })
    .onConflict(["platform_user_id", "module_key"])
    .merge({ filter_id: filterId, updated_at: conn.fn.now() });
}

export async function clearDefault(
  userId: number,
  moduleKey: string,
  conn: Db = db(),
): Promise<void> {
  await conn("user_default_filters").where({ platform_user_id: userId, module_key: moduleKey }).del();
}
