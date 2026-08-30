// Page view counters for the public business and service detail pages.
//
// One polymorphic table, same reasoning as saved_items: the two ids don't share a domain (a
// business is an integer id, a service listing another), and a third countable page would
// otherwise mean a third table. entity_id is text and carries no FK for the same reason.
//
// No deleted_at: a counter row has nothing to soft-delete. Dropping the page it counts should
// take the row with it, and until something does that, an orphan row costs one integer.

import type { Knex } from "knex";

export const PAGE_VIEW_TYPES = ["business", "service"] as const;

/** Every page opens at 500 rather than 0 — a real number nobody has to explain on a launch day. */
export const STARTING_VIEWS = 500;

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("page_views", (t) => {
    t.increments("id").primary();
    t.text("entity_type").notNullable();
    t.text("entity_id").notNullable();
    t.integer("views").notNullable().defaultTo(STARTING_VIEWS);
    t.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());

    // Named because the bump is an upsert that targets this constraint by name.
    t.unique(["entity_type", "entity_id"], { indexName: "page_views_entity_uniq" });
  });

  // In the DB rather than a check in the service, so a bad type can't be written at all.
  await knex.raw(
    `ALTER TABLE page_views ADD CONSTRAINT page_views_type_chk
       CHECK (entity_type IN (${PAGE_VIEW_TYPES.map((type) => `'${type}'`).join(", ")}))`,
  );
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("page_views");
}
