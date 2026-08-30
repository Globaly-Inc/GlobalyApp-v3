// Page view counters — one row per (entity_type, entity_id), created on the first visit.

import { masterKnex } from "../../../core/db/master-pool.js";
import { STARTING_VIEWS, type PageViewType } from "../consts.js";

const T = "page_views";

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
