// Page view counters — one row per (entity_type, entity_id), created on the first real visit.

import { masterKnex } from "../../../core/db/master-pool.js";
import { SUPERADMIN_SCHEMA as S } from "../../superadmin/consts.js";
import { STARTING_VIEWS, type PageViewType } from "../consts.js";

const T = "page_views";

// Canonical hyphenated uuid — shape only, same guard the saved-items repository uses: anything
// matching is something Postgres will accept, and anything it rejects Postgres would reject too.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const isPositiveInt = (id: string) => /^\d{1,9}$/.test(id) && Number(id) > 0;

/**
 * Does this id name a page a visitor could actually be on?
 *
 * The route is unauthenticated, so without this any caller could POST arbitrary ids in a loop and
 * leave a permanent row behind for each — storage nobody would ever read, on a table with no owner
 * to cascade from. Each check mirrors how its page resolves the id, so a counter can only exist for
 * something publicly visible.
 */
export async function entityExists(entityType: PageViewType, entityId: string): Promise<boolean> {
  switch (entityType) {
    case "course": {
      if (!UUID.test(entityId)) return false;
      const row = await masterKnex(`${S}.extraction_courses as ec`)
        .where("ec.id", entityId)
        .whereRaw(`exists (select 1 from ${S}.extraction_jobs ej where ej.id = ec.job_id and ej.status = 'exported')`)
        .first("ec.id");
      return Boolean(row);
    }
    case "visa-service": {
      // The provider profile is an extraction overview row whose job was exported.
      if (!UUID.test(entityId)) return false;
      const row = await masterKnex(`${S}.extraction_institution_overview as ei`)
        .where("ei.id", entityId)
        .whereRaw(
          `exists (select 1 from ${S}.extraction_jobs ej
                    where ej.id = ei.job_id and ej.status = 'exported' and ej.source_type = 'visa_service')`,
        )
        .first("ei.id");
      return Boolean(row);
    }
    case "institution": {
      // Institutions are addressed publicly by their zero-padded id fragment, not their raw id.
      const row = await masterKnex("institutions")
        .where("is_published", true)
        .whereNull("deleted_at")
        .whereRaw("lpad(id::text, 6, '0') = ?", [entityId])
        .first("id");
      return Boolean(row);
    }
    case "business": {
      if (!isPositiveInt(entityId)) return false;
      const row = await masterKnex("businesses")
        .where({ id: Number(entityId), is_published: true })
        .whereNull("deleted_at")
        .first("id");
      return Boolean(row);
    }
    case "service": {
      // A marketplace listing, visible on the same terms publicListingQuery uses.
      if (!isPositiveInt(entityId)) return false;
      const row = await masterKnex("other_service_listings")
        .where({ id: Number(entityId), is_active: true })
        .whereNull("deleted_at")
        .first("id");
      return Boolean(row);
    }
    default:
      return false;
  }
}

/**
 * Counts one visit and returns the new total, in one statement.
 *
 * Read-then-write would lose concurrent visits — two readers both see N and both write N+1, so two
 * visits count as one. `on conflict do update` takes a row lock instead, so the second visit blocks
 * until the first commits and then increments whatever it left. The first visit inserts at
 * STARTING_VIEWS, which is therefore the number that visitor sees.
 */
export async function bumpViews(entityType: PageViewType, entityId: string): Promise<number> {
  const { rows } = await masterKnex.raw(
    `insert into ${T} (entity_type, entity_id, views)
     values (?, ?, ?)
     on conflict on constraint page_views_entity_uniq do update
        set views = ${T}.views + 1, updated_at = now()
     returning views`,
    [entityType, entityId, STARTING_VIEWS],
  );
  return (rows as { views: number }[])[0]!.views;
}
