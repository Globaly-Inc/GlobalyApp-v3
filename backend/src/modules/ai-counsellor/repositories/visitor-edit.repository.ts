// Single-visitor read and owner edits. Kept beside visitors.repository rather than inside it:
// that file is the list, this one is the detail page's read/write pair, and the two have
// different callers.
//
// Tenant isolation is the same as the list's and for the same reason — `ai_widget_visitors`
// lives in the tenant schema, so the `req.db` the route hands in IS the boundary. An `id` from
// the URL cannot reach another org's row because no other org's rows are on this connection.

import type { Knex } from "knex";
import { listQuery } from "./visitors.repository.js";
import type { VisitorPatch } from "../schemas/visitor.schema.js";

const TABLE = "ai_widget_visitors";

/** A visitor row as the portal is allowed to see it — shape comes from the list's allow-list. */
export type VisitorDetail = Record<string, unknown>;

/**
 * One visitor by id.
 *
 * Built by narrowing the LIST's query rather than re-declaring which columns a tenant may see.
 * `listQuery` returns an unexecuted builder, so `.where({ id }).first()` reuses its allow-list
 * verbatim — add a column there and the detail page gets it, drop one and the detail page loses
 * it. A second copy of that list is exactly how `visitor_key` would eventually leak from one
 * endpoint after being removed from the other.
 *
 * page/limit are the degenerate one-row case; `.first()` supersedes the builder's own LIMIT.
 */
export function findVisitorById(db: Knex, id: number): Promise<VisitorDetail | undefined> {
  return listQuery(db, { page: 1, limit: 1, status: "all" }).where({ id }).first();
}

/**
 * Apply an owner's corrections.
 *
 * Re-reads through `findVisitorById` instead of `returning("*")`, which would hand back every
 * column including `visitor_key`. One extra round trip, and the response cannot drift from what
 * the list is willing to show.
 *
 * `status` is never in the patch — VisitorPatchSchema is `.strict()` and omits it — because it
 * is GENERATED ALWAYS. Postgres recomputes it from the new email as part of this UPDATE, so
 * filling in a contact here promotes the row to a lead in the same statement.
 *
 * Returns undefined when no row matched, so the route can 404 rather than reporting a
 * successful edit of nothing.
 */
export async function updateVisitor(
  db: Knex,
  id: number,
  patch: VisitorPatch,
): Promise<VisitorDetail | undefined> {
  const updated = await db(TABLE)
    .where({ id })
    .update({ ...serialiseSections(patch), updated_at: db.fn.now() });

  if (!updated) return undefined;
  return findVisitorById(db, id);
}

/**
 * jsonb columns take a STRING, not a JS array.
 *
 * Handing knex a raw array makes it a Postgres array literal, which the jsonb column rejects —
 * `recordProfile` stringifies for the same reason. The empty array is meaningful and kept:
 * deleting the last qualification must store `[]` ("asked, and none"), not null ("never came
 * up"), which is the distinction the 20260916_001 migration went out of its way to preserve.
 */
function serialiseSections(patch: VisitorPatch): Record<string, unknown> {
  const out: Record<string, unknown> = { ...patch };
  for (const key of ["qualifications", "work_experiences", "language_tests", "academic_tests"] as const) {
    if (out[key] !== undefined) out[key] = JSON.stringify(out[key]);
  }
  return out;
}
